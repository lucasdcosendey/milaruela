/*
 * A linha vermelha
 * ----------------
 * Desenha a linha que atravessa a página, inspirada na tatuagem da Mila,
 * e a anima: o traço vai sendo desenhado conforme a pessoa rola a página.
 *
 * Telas largas (1000 px ou mais)
 *   O percurso desenhado à mão fica em dados/rota-linha.json. Cada ponto guarda
 *   x (numa página de referência de 1440 px), o índice da seção, a posição dentro
 *   da seção (0 a 10000), a espessura (x10) e se o ponto é "fixo".
 *   Os pontos estão presos às seções, então a linha acompanha a página quando
 *   uma seção cresce ou encolhe. A linha desvia sozinha dos textos; os pontos
 *   "fixos" seguem o traçado exatamente.
 *
 * Telas estreitas (celular e tablet)
 *   Não há espaço livre entre os textos para o percurso do computador. A linha
 *   corre pelas margens laterais e troca de lado nos respiros entre as seções,
 *   repetindo a ideia do desenho: começa à esquerda, passa para a direita,
 *   volta, e sai pelo canto de baixo. Numa das travessias ela se abre num lago.
 *
 * Animação
 *   Cada trecho do traço é revelado com stroke-dashoffset até um pouco abaixo
 *   do fim da tela que a pessoa já alcançou, com uma suavização para parecer um traço à mão.
 *   O que já foi desenhado continua desenhado ao subir. Quem pede ao sistema
 *   para reduzir movimento vê a linha pronta.
 */
(function () {
  'use strict';

  var ROTA_URL = 'dados/rota-linha.json';
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var LARGURA_MINIMA_ROTA = 1000;     // abaixo disso, usa o percurso pelas margens
  var LADOS_CELULAR = ['E', 'E', 'E', 'D', 'D', 'E', 'D', 'D', 'D']; // um por seção (E = esquerda, D = direita)
  var LAGO_NA_TRAVESSIA = 1;          // em qual travessia (contando de 0) a linha se abre num lago

  var pagina = document.getElementById('pagina');
  if (!pagina) return;
  var camadas = pagina.querySelectorAll('svg.rio');
  if (!camadas.length) return;

  var semMovimento = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var rota = null;
  var ultimaChave = '';
  var agendado = 0;

  // estado da animação
  var fios = [];          // [{ pts, acum, maxY, trechos: [{ ini, comp, els: [path, path] }] }]
  var revelado = semMovimento ? Infinity : 0;   // até que altura (px da página) a linha já foi desenhada
  var alvo = semMovimento ? Infinity : 0;
  var animando = 0;

  // ================= medições =================

  function secoes() {
    return Array.prototype.slice.call(
      pagina.querySelectorAll(':scope > header, :scope > main > section, :scope > footer')
    );
  }

  function obstaculos(base, escala, folga) {
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
        (r.left - base.left) * escala - folga,
        (r.top - base.top) * escala - folga,
        (r.right - base.left) * escala + folga,
        (r.bottom - base.top) * escala + folga
      ]);
    }
    return lista;
  }

  // ================= traço à mão =================

  // ruído suave e determinístico (mesma linha a cada carregamento)
  function ruido(t, semente) {
    return Math.sin(t * 1.7 + semente) * 0.5 + Math.sin(t * 3.1 + semente * 2.3) * 0.3 + Math.sin(t * 7.3 + semente * 0.7) * 0.2;
  }

  function espessura(i, n, min, max, semente, afinaInicio, afinaFim) {
    var v = 0.5 + 0.5 * ruido(i / 18, semente);
    var w = min + (max - min) * Math.max(0, Math.min(1, v));
    var taper = 30;
    if (afinaInicio) w = min * 0.5 + (w - min * 0.5) * Math.min(1, i / taper);
    if (afinaFim) w = min * 0.5 + (w - min * 0.5) * Math.min(1, (n - 1 - i) / taper);
    return Math.round(w * 10);
  }

  // ================= desvio em volta dos textos =================

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
          var eixo, alvoDesvio, menor;
          if (dy >= dx) {
            eixo = 0;
            var mx = (ent[0] + sai[0]) / 2;
            menor = (mx - o[0]) < (o[2] - mx);
            if (o[0] < 6) menor = false;
            alvoDesvio = menor ? o[0] - 1 : o[2] + 1;
          } else {
            eixo = 1;
            var my = (ent[1] + sai[1]) / 2;
            menor = (my - o[1]) < (o[3] - my);
            alvoDesvio = menor ? o[1] - 1 : o[3] + 1;
          }
          for (var j = a; j <= b; j++) pts[j][eixo] = alvoDesvio;
          for (var r = 1; r <= RAMPA; r++) {
            var t = 1 - r / (RAMPA + 1);
            t = t * t * (3 - 2 * t);
            var viz = [a - r, b + r];
            for (var m = 0; m < 2; m++) {
              var z = viz[m];
              if (z < 0 || z >= n || pts[z][3]) continue;
              var atual = pts[z][eixo];
              if ((menor && atual > alvoDesvio) || (!menor && atual < alvoDesvio)) pts[z][eixo] = atual + (alvoDesvio - atual) * t;
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

  // ================= percursos =================

  // Computador: percurso desenhado, preso às seções
  function percursoDesenhado(W, H, B) {
    var ref = rota.ref, n = ref.length;
    if (!B || B.length !== n) B = ref.map(function (v) { return v * H / ref[n - 1]; });
    return rota.strands.map(function (st) {
      var pts = [];
      for (var j = 0; j < st.length; j += 5) {
        var s = Math.min(st[j + 1], n - 2), f = st[j + 2] / 10000;
        pts.push([st[j] - 720 + W / 2, B[s] + f * (B[s + 1] - B[s]), st[j + 3], st[j + 4]]);
      }
      return pts;
    });
  }

  // Celular: pelas margens, trocando de lado nos respiros entre seções
  function percursoMargens(W, H, B, obs, margem) {
    var xE = Math.max(5, margem * 0.42), xD = W - xE;
    var ladoX = function (lado) { return lado === 'D' ? xD : xE; };
    var nSec = B.length - 1;
    var lados = [];
    for (var s = 0; s < nSec; s++) lados.push(LADOS_CELULAR[Math.min(s, LADOS_CELULAR.length - 1)]);

    // faixa livre de texto em volta de cada divisa entre seções
    function respiro(y) {
      var cima = y - 140, baixo = y + 140;
      for (var i = 0; i < obs.length; i++) {
        var o = obs[i];
        if (o[3] <= y && o[3] > cima) cima = o[3];
        if (o[1] >= y && o[1] < baixo) baixo = o[1];
      }
      return [cima + 4, baixo - 4];
    }

    var principal = [], lagos = [];
    var passo = 8, sem = 1.3, travessia = 0;
    var y = -24, x = ladoX(lados[0]);

    function trilho(ate, lado) {
      // desce pela margem com um leve balanço, sem encostar no texto
      for (; y < ate; y += passo) {
        var bal = ruido(y / 140, sem) * Math.min(3, xE * 0.3);
        principal.push([ladoX(lado) + (lado === 'D' ? -bal : bal), y]);
      }
    }

    function curva(x0, y0, x1, y1, desvioY) {
      var pts = [], dist = Math.hypot(x1 - x0, y1 - y0), n = Math.max(12, Math.round(dist / passo));
      for (var k = 0; k <= n; k++) {
        var t = k / n, e = t * t * (3 - 2 * t);
        pts.push([x0 + (x1 - x0) * e, y0 + (y1 - y0) * t + Math.sin(Math.PI * t) * (desvioY || 0)]);
      }
      return pts;
    }

    for (var s2 = 0; s2 < nSec; s2++) {
      var lado = lados[s2], prox = lados[s2 + 1];
      var fim = B[s2 + 1];
      if (s2 === nSec - 1) {
        trilho(fim - 60, lado);
        curva(ladoX(lado), y, W + 30, H + 30).forEach(function (p) { principal.push(p); });
        break;
      }
      if (prox === lado) { trilho(fim, lado); continue; }
      var faixa = respiro(fim);
      var y0 = faixa[0], y1 = faixa[1];
      if (y1 - y0 < 40) { y0 = fim - 30; y1 = fim + 30; }
      trilho(y0, lado);
      var xa = ladoX(lado), xb = ladoX(prox);
      var cruza = curva(xa, y, xb, y1, 0);
      if (travessia === LAGO_NA_TRAVESSIA && y1 - y0 > 70) {
        // o lago: um segundo fio faz a mesma travessia um pouco mais abaixo e volta a se juntar
        var meio = Math.min(28, (y1 - y0) * 0.3);
        var curvaB = curva(xa, y, xb, y1, meio);
        principal = principal.concat(curva(xa, y, xb, y1, -meio * 0.6));
        lagos.push(curvaB);
      } else {
        principal = principal.concat(cruza);
      }
      y = y1;
      travessia++;
    }

    function comEspessura(pts, min, max, sem2, ai, af) {
      return pts.map(function (p, i) { return [p[0], p[1], espessura(i, pts.length, min, max, sem2, ai, af), 0]; });
    }
    var fiosM = [comEspessura(principal, 0.6, 2.4, 0.4, true, false)];
    lagos.forEach(function (l, i) { fiosM.push(comEspessura(l, 0.4, 1.6, 2 + i, true, true)); });
    return fiosM;
  }

  // ================= desenho =================

  function montar(W, H, percursos, obs) {
    // limpa as camadas
    for (var c = 0; c < camadas.length; c++) {
      camadas[c].setAttribute('viewBox', '0 0 ' + Math.round(W) + ' ' + Math.round(H));
      camadas[c].setAttribute('preserveAspectRatio', 'none');
      camadas[c].replaceChildren();
    }
    fios = [];

    percursos.forEach(function (pts) {
      if (obs.length) desviar(pts, obs);

      // comprimento acumulado e maior altura já alcançada até cada ponto
      var acum = [0], maxY = [pts[0][1]];
      for (var i = 1; i < pts.length; i++) {
        acum.push(acum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
        maxY.push(Math.max(maxY[i - 1], pts[i][1]));
      }

      // trechos com a mesma espessura viram um <path>
      var trechos = [], frags = [];
      for (var cc = 0; cc < camadas.length; cc++) frags.push(document.createDocumentFragment());
      var k = 0;
      while (k < pts.length - 1) {
        var w = Math.round(pts[k][2] / 2.5) * 0.25, f = k;
        var d = 'M' + pts[k][0].toFixed(1) + ' ' + pts[k][1].toFixed(1);
        while (f < pts.length - 1 && f - k < 16 && Math.round(pts[f][2] / 2.5) * 0.25 === w) {
          f++;
          d += ' L' + pts[f][0].toFixed(1) + ' ' + pts[f][1].toFixed(1);
        }
        if (f === k) { f++; d += ' L' + pts[f][0].toFixed(1) + ' ' + pts[f][1].toFixed(1); }
        var comp = acum[f] - acum[k];
        var trecho = { ini: acum[k], comp: comp, els: [] };
        for (var cam = 0; cam < camadas.length; cam++) {
          var p = document.createElementNS(SVG_NS, 'path');
          p.setAttribute('d', d);
          p.setAttribute('stroke-width', w);
          p.setAttribute('stroke-dasharray', (comp + 1).toFixed(1) + ' ' + (comp + 1).toFixed(1));
          frags[cam].appendChild(p);
          trecho.els.push(p);
        }
        trechos.push(trecho);
        k = f;
      }
      for (var c2 = 0; c2 < camadas.length; c2++) camadas[c2].appendChild(frags[c2]);
      fios.push({ pts: pts, acum: acum, maxY: maxY, trechos: trechos, feito: -1 });
    });
    pintar();
  }

  // ================= animação =================

  function comprimentoAte(fio, y) {
    // primeiro ponto do fio que passa da altura y (busca binária na altura máxima acumulada)
    var m = fio.maxY, lo = 0, hi = m.length - 1;
    if (y >= m[hi]) return fio.acum[hi] + 1;
    if (y < m[0]) return 0;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (m[mid] > y) hi = mid; else lo = mid + 1;
    }
    var i = lo;
    if (i === 0) return 0;
    var y0 = fio.pts[i - 1][1], y1 = fio.pts[i][1];
    var t = y1 === y0 ? 1 : Math.max(0, Math.min(1, (y - y0) / (y1 - y0)));
    return fio.acum[i - 1] + (fio.acum[i] - fio.acum[i - 1]) * t;
  }

  function pintar() {
    for (var i = 0; i < fios.length; i++) {
      var fio = fios[i];
      var L = comprimentoAte(fio, revelado);
      if (L === fio.feito) continue;
      fio.feito = L;
      for (var j = 0; j < fio.trechos.length; j++) {
        var tr = fio.trechos[j];
        var vis = Math.max(0, Math.min(tr.comp + 1, L - tr.ini));
        var off = (tr.comp + 1 - vis).toFixed(1);
        for (var k = 0; k < tr.els.length; k++) {
          if (tr.els[k].__off !== off) { tr.els[k].setAttribute('stroke-dashoffset', off); tr.els[k].__off = off; }
        }
      }
    }
  }

  function topoPagina() {
    return pagina.getBoundingClientRect().top + window.scrollY;
  }

  function atualizarAlvo() {
    if (semMovimento) return;
    // a ponta do traço fica sempre um pouco abaixo do fim da tela,
    // para a linha nunca parecer interrompida no que está visível
    var y = window.scrollY + window.innerHeight * 1.15 + 40 - topoPagina();
    // no fim da página, termina o desenho por completo
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) y = Infinity;
    if (y > alvo) { alvo = y; animar(); }
  }

  function passoAnimacao() {
    animando = 0;
    var falta = alvo - revelado;
    if (alvo === Infinity) {
      // fim da página: completa num ritmo firme
      var altura = pagina.offsetHeight;
      revelado = Math.min(altura + 50, revelado + Math.max(24, (altura - revelado) * 0.12));
      if (revelado >= altura + 50) revelado = Infinity;
    } else if (falta > 0.5) {
      // aproxima com suavidade, mas sem ficar lento demais em rolagens longas
      revelado += Math.max(4, Math.min(falta * 0.12, 90));
      if (revelado > alvo) revelado = alvo;
    } else {
      revelado = alvo;
    }
    pintar();
    if (revelado !== alvo) animando = requestAnimationFrame(passoAnimacao);
  }

  function animar() {
    if (!animando) animando = requestAnimationFrame(passoAnimacao);
  }

  // ================= montagem =================

  function desenhar() {
    agendado = 0;
    var base = pagina.getBoundingClientRect();
    if (!base.width) return;
    var escala = pagina.offsetWidth / base.width;
    var W = pagina.offsetWidth, H = pagina.offsetHeight;
    var larga = W >= LARGURA_MINIMA_ROTA;
    if (larga && !rota) return;           // espera a rota carregar

    var folga = larga ? 12 : 6;
    var obs = obstaculos(base, escala, folga);
    var B = secoes().map(function (el) { return (el.getBoundingClientRect().top - base.top) * escala; });
    B.push(H);

    var chave = (larga ? 'L' : 'M') + W + 'x' + H + ':' + B.map(Math.round).join(',') + ':' +
      obs.map(function (o) { return o.map(Math.round).join(','); }).join(';');
    if (chave === ultimaChave) return;
    ultimaChave = chave;

    var percursos;
    if (larga) {
      percursos = percursoDesenhado(W, H, B);
    } else {
      var cont = pagina.querySelector('.container');
      var margem = cont ? parseFloat(getComputedStyle(cont).paddingLeft) || 20 : 20;
      percursos = percursoMargens(W, H, B, obs, margem);
    }
    montar(W, H, percursos, obs);
    atualizarAlvo();
  }

  function agendar() {
    if (agendado) return;
    agendado = requestAnimationFrame(desenhar);
  }

  fetch(ROTA_URL)
    .then(function (r) { if (!r.ok) throw new Error('rota'); return r.json(); })
    .then(function (dados) { rota = dados; ultimaChave = ''; agendar(); })
    .catch(function () { /* sem a rota, o computador fica sem a linha; o celular não depende dela */ });

  agendar();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(agendar);
  if (window.ResizeObserver) new ResizeObserver(agendar).observe(pagina);
  window.addEventListener('load', agendar);
  pagina.addEventListener('toggle', agendar, true);   // abrir uma pergunta muda a altura
  window.addEventListener('scroll', atualizarAlvo, { passive: true });
  window.addEventListener('resize', atualizarAlvo);
})();
