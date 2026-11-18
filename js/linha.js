/*
 * A linha vermelha
 * ----------------
 * Desenha a linha que atravessa a página, inspirada na tatuagem da Mila.
 *
 * - O percurso fica em dados/rota-linha.json. Cada ponto guarda:
 *   x (numa página de referência com 1440 px de largura), o índice da seção,
 *   a posição dentro da seção (0 a 10000), a espessura (x10) e se o ponto é "fixo".
 * - Como os pontos estão presos às seções, a linha acompanha a página quando
 *   uma seção cresce ou encolhe.
 * - A linha desvia sozinha dos textos (títulos, parágrafos, botões...). Os pontos
 *   "fixos" seguem exatamente o traçado desenhado à mão e não desviam.
 * - Tudo é recalculado quando a largura da tela, as fontes ou a altura da página mudam.
 */
(function () {
  'use strict';

  var ROTA_URL = 'dados/rota-linha.json';
  var FOLGA = 12;          // distância mínima (px) entre a linha e um texto
  var SVG_NS = 'http://www.w3.org/2000/svg';

  var pagina = document.getElementById('pagina');
  if (!pagina) return;
  var camadas = pagina.querySelectorAll('svg.rio');
  if (!camadas.length) return;

  var rota = null;
  var ultimaChave = '';
  var agendado = 0;

  // ---------- medições ----------

  function secoes() {
    // cabeçalho, cada seção do <main> e o rodapé, na ordem da página
    return Array.prototype.slice.call(
      pagina.querySelectorAll(':scope > header, :scope > main > section, :scope > footer')
    );
  }

  function obstaculos(base, escala) {
    var lista = [];
    var faixa = document.createRange();
    var seletor = 'h1,h2,h3,p,li:not(.passo),summary,figcaption,a,span';
    var pais = 'h1,h2,h3,p,li:not(.passo),summary,figcaption,a';
    var els = pagina.querySelectorAll(seletor);
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.parentElement && el.parentElement.closest(pais)) continue;
      if (el.closest('svg') || el.classList.contains('pular')) continue;
      var r;
      if (el.tagName === 'A') {
        r = el.getBoundingClientRect();
      } else {
        faixa.selectNodeContents(el);
        r = faixa.getBoundingClientRect();
      }
      if (r.width < 1 || r.height < 1) continue;
      lista.push([
        (r.left - base.left) * escala - FOLGA,
        (r.top - base.top) * escala - FOLGA,
        (r.right - base.left) * escala + FOLGA,
        (r.bottom - base.top) * escala + FOLGA
      ]);
    }
    return lista;
  }

  // ---------- desvio em volta dos textos ----------

  function desviar(pts, obs) {
    var n = pts.length, RAMPA = 10;
    function dentro(p, o) { return p[0] > o[0] && p[0] < o[2] && p[1] > o[1] && p[1] < o[3]; }

    for (var passada = 0; passada < 4; passada++) {
      for (var q = 0; q < obs.length; q++) {
        var o = obs[q], i = 0;
        while (i < n) {
          if (pts[i][3] || !dentro(pts[i], o)) { i++; continue; }
          var a = i;
          while (i < n && !pts[i][3] && dentro(pts[i], o)) i++;
          var b = i - 1;
          var ent = pts[Math.max(0, a - 1)], sai = pts[Math.min(n - 1, b + 1)];
          var dx = Math.abs(sai[0] - ent[0]), dy = Math.abs(sai[1] - ent[1]);
          var eixo, alvo, menor;
          if (dy >= dx) {
            // trecho mais vertical: contorna pela lateral mais próxima
            eixo = 0;
            var mx = (ent[0] + sai[0]) / 2;
            menor = (mx - o[0]) < (o[2] - mx);
            if (o[0] < 6) menor = false;
            alvo = menor ? o[0] - 1 : o[2] + 1;
          } else {
            // trecho mais horizontal: contorna por cima ou por baixo
            eixo = 1;
            var my = (ent[1] + sai[1]) / 2;
            menor = (my - o[1]) < (o[3] - my);
            alvo = menor ? o[1] - 1 : o[3] + 1;
          }
          for (var j = a; j <= b; j++) pts[j][eixo] = alvo;
          // suaviza a entrada e a saída do desvio
          for (var r = 1; r <= RAMPA; r++) {
            var t = 1 - r / (RAMPA + 1);
            t = t * t * (3 - 2 * t);
            var vizinhos = [a - r, b + r];
            for (var m = 0; m < 2; m++) {
              var z = vizinhos[m];
              if (z < 0 || z >= n || pts[z][3]) continue;
              var atual = pts[z][eixo];
              if ((menor && atual > alvo) || (!menor && atual < alvo)) pts[z][eixo] = atual + (alvo - atual) * t;
            }
          }
        }
      }
    }
    for (var it = 0; it < 2; it++) {
      for (var c = 1; c < n - 1; c++) {
        if (pts[c][3]) continue;
        pts[c][0] = (pts[c - 1][0] + 2 * pts[c][0] + pts[c + 1][0]) / 4;
        pts[c][1] = (pts[c - 1][1] + 2 * pts[c][1] + pts[c + 1][1]) / 4;
      }
    }
  }

  // ---------- desenho ----------

  function construir(W, H, obs, B) {
    var ref = rota.ref, n = ref.length;
    if (!B || B.length !== n) B = ref.map(function (v) { return v * H / ref[n - 1]; });
    var larga = W >= 1000;
    var tracos = [];

    rota.strands.forEach(function (st) {
      var pts = [];
      for (var j = 0; j < st.length; j += 5) {
        var s = Math.min(st[j + 1], n - 2), f = st[j + 2] / 10000;
        var x = larga ? st[j] - 720 + W / 2 : st[j] * W / 1440;
        pts.push([x, B[s] + f * (B[s + 1] - B[s]), st[j + 3], st[j + 4]]);
      }
      if (obs.length) desviar(pts, obs);

      // agrupa trechos com a mesma espessura num mesmo <path>
      var i = 0;
      while (i < pts.length - 1) {
        var w = Math.round(pts[i][2] / 2.5) * 0.25, k = i;
        var d = 'M' + pts[i][0].toFixed(1) + ' ' + pts[i][1].toFixed(1);
        while (k < pts.length - 1 && k - i < 16 && Math.round(pts[k][2] / 2.5) * 0.25 === w) {
          k++;
          d += ' L' + pts[k][0].toFixed(1) + ' ' + pts[k][1].toFixed(1);
        }
        if (k === i) { k++; d += ' L' + pts[k][0].toFixed(1) + ' ' + pts[k][1].toFixed(1); }
        tracos.push({ d: d, w: w });
        i = k;
      }
    });
    return tracos;
  }

  function desenhar() {
    agendado = 0;
    if (!rota) return;
    var base = pagina.getBoundingClientRect();
    if (!base.width) return;
    var escala = pagina.offsetWidth / base.width;
    var W = pagina.offsetWidth, H = pagina.offsetHeight;
    var obs = obstaculos(base, escala);
    var B = secoes().map(function (el) { return (el.getBoundingClientRect().top - base.top) * escala; });
    B.push(H);

    var chave = W + 'x' + H + ':' + B.map(Math.round).join(',') + ':' +
      obs.map(function (o) { return o.map(Math.round).join(','); }).join(';');
    if (chave === ultimaChave) return;
    ultimaChave = chave;

    var tracos = construir(W, H, obs, B);
    for (var c = 0; c < camadas.length; c++) {
      var svg = camadas[c];
      svg.setAttribute('viewBox', '0 0 ' + Math.round(W) + ' ' + Math.round(H));
      svg.setAttribute('preserveAspectRatio', 'none');
      var frag = document.createDocumentFragment();
      for (var t = 0; t < tracos.length; t++) {
        var p = document.createElementNS(SVG_NS, 'path');
        p.setAttribute('d', tracos[t].d);
        p.setAttribute('stroke-width', tracos[t].w);
        frag.appendChild(p);
      }
      svg.replaceChildren(frag);
    }
  }

  function agendar() {
    if (agendado) return;
    agendado = requestAnimationFrame(desenhar);
  }

  // ---------- início ----------

  fetch(ROTA_URL)
    .then(function (r) { if (!r.ok) throw new Error('rota'); return r.json(); })
    .then(function (dados) { rota = dados; agendar(); })
    .catch(function () { /* sem a rota, a página segue normal, só sem a linha */ });

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(agendar);
  if (window.ResizeObserver) new ResizeObserver(agendar).observe(pagina);
  window.addEventListener('load', agendar);
  // abrir/fechar uma pergunta muda a altura da página
  pagina.addEventListener('toggle', agendar, true);
})();
