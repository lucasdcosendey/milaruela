/*
 * A linha viva (versão 2)
 * -----------------------
 * A linha é desenhada na hora, enquanto a pessoa lê, e cada visita produz um
 * desenho diferente. Regras do desenho, como na tatuagem:
 *
 *  - Um só começo (no topo) e um só fim (saindo pela base da página).
 *  - Ela se ramifica, mas toda ramificação volta a se juntar: são "lagos",
 *    dois fios que se separam e se reencontram. Não há pontas soltas.
 *  - O traço é uma curva longa e suave (spline) por pontos sorteados.
 *  - A linha não desvia dos textos: quando cruza um texto ou uma foto, ela
 *    fica quase transparente e mais fina naquele trecho, e volta ao normal
 *    logo depois, com transição suave.
 *
 * Desenho ao vivo
 *  - A ponta fica visível na tela, com um pingo de tinta, e avança no ritmo de
 *    uma mão desenhando: acompanha a rolagem, mas nunca salta de uma vez.
 *
 * O que muda de uma visita para outra
 *  - Uma semente aleatória escolhe por onde a curva passa e onde há lagos.
 *  - Ler devagar deixa o traço mais grosso; rolar rápido deixa mais fino.
 *  - Uma pausa na leitura faz a linha se abrir num lago logo adiante.
 *  - No computador, os próximos pontos da curva tendem para o lado do mouse.
 *
 * No computador, a espinha da linha é o percurso desenhado à mão da versão 1
 * (dados/rota-linha.json, indicado em data-rota no #pagina), com os mesmos
 * lagos. Cada visita ganha pequenos desvios sorteados em volta dele. No celular,
 * a curva é sorteada a cada visita.
 *
 * Quem pede ao sistema para reduzir movimento recebe a linha pronta.
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var pagina = document.getElementById('pagina');
  if (!pagina) return;
  var svg = pagina.querySelector('svg.rio');
  if (!svg) return;
  var semMovimento = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ROTA_URL = pagina.dataset.rota || null;
  var rota = null, rotaPronta = !ROTA_URL;
  if (ROTA_URL) {
    fetch(ROTA_URL)
      .then(function (r) { if (!r.ok) throw new Error('rota'); return r.json(); })
      .then(function (d) { rota = d; })
      .catch(function () { rota = null; })
      .then(function () { rotaPronta = true; comecar(); });
  }

  var OPACIDADE_SOBRE_TEXTO = 0.16;   // quanto a linha aparece por cima de um texto ou foto
  var TRANSICAO = 26;                 // em px: distância em que ela some e volta, ao cruzar
  var POSICAO_DA_PONTA = 0.62;        // altura da tela (0 = topo, 1 = base) onde a ponta trabalha
  var RITMO = 240;                    // px por segundo de desenho, quando a ponta está em dia

  // ---------------- acaso com semente ----------------

  var semente = (window.crypto && crypto.getRandomValues) ? crypto.getRandomValues(new Uint32Array(1))[0] : (Date.now() >>> 0);
  var acaso = (function (a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  })(semente);

  // ---------------- medidas ----------------

  var L = null;

  function medir() {
    var base = pagina.getBoundingClientRect();
    var k = pagina.offsetWidth / base.width;
    var W = pagina.offsetWidth, H = pagina.offsetHeight, larga = W >= 1000;
    var secs = pagina.querySelectorAll(':scope > header, :scope > main > section, :scope > footer');
    var B = Array.prototype.map.call(secs, function (el) { return (el.getBoundingClientRect().top - base.top) * k; });
    B.push(H);
    var obs = [], faixa = document.createRange(), pais = 'h1,h2,h3,p,li,summary,figcaption,a';
    pagina.querySelectorAll('h1,h2,h3,p,li,summary,figcaption,a,span,img').forEach(function (el) {
      if (el.parentElement && el.parentElement.closest(pais)) return;
      if (el.closest('svg') || el.classList.contains('pular')) return;
      var r;
      if (el.tagName === 'A' || el.tagName === 'IMG') r = el.getBoundingClientRect();
      else { faixa.selectNodeContents(el); r = faixa.getBoundingClientRect(); }
      if (r.width < 1 || r.height < 1) return;
      obs.push([(r.left - base.left) * k - 4, (r.top - base.top) * k - 4, (r.right - base.left) * k + 4, (r.bottom - base.top) * k + 4]);
    });
    return { W: W, H: H, larga: larga, B: B, obs: obs };
  }

  // 1 longe dos textos; OPACIDADE_SOBRE_TEXTO por cima deles; transição suave entre os dois
  function visibilidade(x, y) {
    var menor = Infinity;
    for (var i = 0; i < L.obs.length; i++) {
      var o = L.obs[i];
      var dx = Math.max(o[0] - x, 0, x - o[2]), dy = Math.max(o[1] - y, 0, y - o[3]);
      var d = (dx || dy) ? Math.hypot(dx, dy) : -Math.min(x - o[0], o[2] - x, y - o[1], o[3] - y);
      if (d < menor) menor = d;
    }
    var t = Math.max(0, Math.min(1, menor / TRANSICAO));
    t = t * t * (3 - 2 * t);
    return OPACIDADE_SOBRE_TEXTO + (1 - OPACIDADE_SOBRE_TEXTO) * t;
  }

  // trechos livres na horizontal em volta de y (para preferir passar pelos espaços vazios)
  function intervalosLivres(y, janela) {
    var ivs = [[8, L.W - 8]];
    L.obs.forEach(function (o) {
      if (y + janela < o[1] || y - janela > o[3]) return;
      var novos = [];
      ivs.forEach(function (iv) {
        if (o[2] <= iv[0] || o[0] >= iv[1]) { novos.push(iv); return; }
        if (o[0] > iv[0]) novos.push([iv[0], o[0]]);
        if (o[2] < iv[1]) novos.push([o[2], iv[1]]);
      });
      ivs = novos;
    });
    return ivs.filter(function (iv) { return iv[1] - iv[0] >= 40; });
  }

  function paraRel(x, y) {
    var s = 0;
    while (s < L.B.length - 2 && y >= L.B[s + 1]) s++;
    return [x / L.W, s, (y - L.B[s]) / ((L.B[s + 1] - L.B[s]) || 1)];
  }
  function deRel(r) {
    var s = Math.min(r[1], L.B.length - 2);
    return [r[0] * L.W, L.B[s] + r[2] * (L.B[s + 1] - L.B[s])];
  }

  // ---------------- a curva ----------------

  var PCs = [];        // pontos de controle { x, y, rel, fim }
  var segs = [];       // amostras de cada trecho entre PC[i] e PC[i+1]
  var lagos = [];      // { de, ate, bojo, lado, fio }
  var principal = null;
  var mouseX = null, mouseQuando = 0;

  function catmull(p0, p1, p2, p3, n) {
    function tj(ti, a, b) { return ti + Math.max(0.01, Math.pow(Math.hypot(b.x - a.x, b.y - a.y), 0.5)); }
    var t0 = 0, t1 = tj(t0, p0, p1), t2 = tj(t1, p1, p2), t3 = tj(t2, p2, p3), out = [];
    for (var i = 0; i <= n; i++) {
      var t = t1 + (t2 - t1) * i / n;
      var A1x = (t1 - t) / (t1 - t0) * p0.x + (t - t0) / (t1 - t0) * p1.x, A1y = (t1 - t) / (t1 - t0) * p0.y + (t - t0) / (t1 - t0) * p1.y;
      var A2x = (t2 - t) / (t2 - t1) * p1.x + (t - t1) / (t2 - t1) * p2.x, A2y = (t2 - t) / (t2 - t1) * p1.y + (t - t1) / (t2 - t1) * p2.y;
      var A3x = (t3 - t) / (t3 - t2) * p2.x + (t - t2) / (t3 - t2) * p3.x, A3y = (t3 - t) / (t3 - t2) * p2.y + (t - t2) / (t3 - t2) * p3.y;
      var B1x = (t2 - t) / (t2 - t0) * A1x + (t - t0) / (t2 - t0) * A2x, B1y = (t2 - t) / (t2 - t0) * A1y + (t - t0) / (t2 - t0) * A2y;
      var B2x = (t3 - t) / (t3 - t1) * A2x + (t - t1) / (t3 - t1) * A3x, B2y = (t3 - t) / (t3 - t1) * A2y + (t - t1) / (t3 - t1) * A3y;
      out.push([(t2 - t) / (t2 - t1) * B1x + (t - t1) / (t2 - t1) * B2x, (t2 - t) / (t2 - t1) * B1y + (t - t1) / (t2 - t1) * B2y]);
    }
    return out;
  }

  function pc(i) { return PCs[Math.max(0, Math.min(PCs.length - 1, i))]; }
  function definido(i) { return PCs.length - 1 >= i + 2 || (PCs.length - 1 >= i + 1 && pc(i + 1).fim); }

  function amostrarTrecho(i, n) {
    var a = pc(i), b = pc(i + 1);
    if (!n) n = Math.max(6, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 5));
    return catmull(pc(i - 1), a, b, pc(i + 2), n);
  }

  // só amostra trechos já definidos de vez, para nada mudar depois de desenhado
  function trecho(i) {
    if (!segs[i]) {
      var pts = amostrarTrecho(i);
      segs[i] = { pts: pts, n: pts.length - 1, w: [] };
    }
    return segs[i];
  }

  function sortearPC(ant) {
    var gap = L.larga ? 380 + acaso() * 440 : 280 + acaso() * 320;
    var y = ant.y + gap;
    if (y > L.H - 140) return { x: ant.x > L.W / 2 ? L.W + 60 : -60, y: L.H + 120, fim: true };
    var x;
    var ivs = intervalosLivres(y, L.larga ? 60 : 20);
    if (ivs.length && acaso() < (L.larga ? 0.8 : 0.5)) {
      // de preferência num espaço vazio, sem fugir muito de onde a linha vinha
      var pesos = ivs.map(function (iv) {
        var c = (iv[0] + iv[1]) / 2;
        return Math.pow(iv[1] - iv[0], 0.6) * Math.exp(-Math.abs(c - ant.x) / (L.larga ? 520 : 260));
      });
      var soma = pesos.reduce(function (a, b) { return a + b; }, 0), r = acaso() * soma, iv = ivs[0];
      for (var q = 0; q < ivs.length; q++) { r -= pesos[q]; if (r <= 0) { iv = ivs[q]; break; } }
      var m = Math.min(28, (iv[1] - iv[0]) / 3);
      x = iv[0] + m + acaso() * (iv[1] - iv[0] - 2 * m);
    } else {
      x = 12 + acaso() * (L.W - 24);
    }
    if (L.larga && mouseX !== null && performance.now() - mouseQuando < 3000) x = x * 0.6 + mouseX * 0.4;
    return { x: x, y: y };
  }

  function estender(ateY) {
    var guarda = 0;
    while (!pc(PCs.length - 1).fim && pc(PCs.length - 1).y < ateY && guarda++ < 100) {
      var p = sortearPC(pc(PCs.length - 1));
      p.rel = paraRel(p.x, p.y);
      PCs.push(p);
    }
  }

  // ---------------- fios ----------------

  function novoFio() { return { el: null, chave: '', n: 0, d: '' }; }

  function tracar(fio, a, b, w, op) {
    var wq = Math.max(0.3, Math.round(w * 4) / 4), oq = Math.round(op * 20) / 20;
    var chave = wq + '|' + oq;
    if (!fio.el || fio.chave !== chave || fio.n > 30) {
      fio.el = document.createElementNS(SVG_NS, 'path');
      fio.el.setAttribute('stroke-width', wq);
      if (oq < 1) fio.el.setAttribute('stroke-opacity', oq);
      fio.d = 'M' + a[0].toFixed(1) + ' ' + a[1].toFixed(1);
      svg.insertBefore(fio.el, pingo);
      fio.chave = chave; fio.n = 0;
    }
    fio.d += ' L' + b[0].toFixed(1) + ' ' + b[1].toFixed(1);
    fio.el.setAttribute('d', fio.d);
    fio.n++;
  }

  // ---------------- lagos ----------------

  function lagoEm(i) {
    for (var q = 0; q < lagos.length; q++) if (i >= lagos[q].de && i < lagos[q].ate) return lagos[q];
    return null;
  }

  function pontoDoLago(lago, i, k) {
    var tot = 0, ant = 0;
    for (var s = lago.de; s < lago.ate; s++) { var n = trecho(s).n; if (s < i) ant += n; tot += n; }
    var t = (ant + k) / tot;
    var p = trecho(i).pts, a = p[Math.max(0, k - 1)], b = p[Math.min(p.length - 1, k + 1)];
    var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    var e = Math.sin(Math.PI * t);
    var bojo = e * e * (3 - 2 * e) * lago.bojo * lago.lado;
    return [p[k][0] - dy / len * bojo, p[k][1] + dx / len * bojo, t];
  }

  // um lago só nasce em trechos que ainda não começaram a ser desenhados e que
  // já estão definidos de vez: ele sempre se fecha de volta na linha
  function criarLago(de) {
    if (de <= segAtual || lagoEm(de) || lagoEm(de - 1)) return false;
    var ate = de + (acaso() < 0.45 ? 2 : 1);
    estender(pc(de).y + 2500);
    for (var s = de; s < ate; s++) if (!definido(s) || pc(s + 1).fim) return false;
    var lado = acaso() < 0.5 ? 1 : -1;
    var bojo = L.larga ? 22 + acaso() * 46 : 10 + acaso() * 18;
    // prefere o lado que fica mais longe dos textos
    var l = { de: de, ate: ate, bojo: bojo, lado: lado };
    var v1 = 0, v2 = 0;
    for (var q = de; q < ate; q++) {
      var n = trecho(q).n;
      for (var k = 0; k <= n; k += 4) {
        l.lado = 1; var a = pontoDoLago(l, q, k); v1 += visibilidade(a[0], a[1]);
        l.lado = -1; var b = pontoDoLago(l, q, k); v2 += visibilidade(b[0], b[1]);
      }
    }
    l.lado = v1 === v2 ? lado : (v1 > v2 ? 1 : -1);
    l.fio = novoFio();
    lagos.push(l);
    return true;
  }

  // ---------------- computador: espinha a partir do percurso da v1 ----------------

  function espinhaDaRota() {
    var ref = rota.ref, n = ref.length, B = L.B;
    if (B.length !== n) B = ref.map(function (v) { return v * L.H / ref[n - 1]; });
    var fios = rota.strands.map(function (st) {
      var pts = [];
      for (var q = 0; q < st.length; q += 5) {
        var s = Math.min(st[q + 1], n - 2), f = st[q + 2] / 10000;
        pts.push({ x: st[q] - 720 + L.W / 2, y: B[s] + f * (B[s + 1] - B[s]) });
      }
      return pts;
    });
    // pequenos desvios próprios desta visita, iguais para todos os fios na mesma
    // altura (assim os lagos continuam presos à linha)
    var fa = acaso() * 10, fb = acaso() * 10, amp = 10 + acaso() * 14;
    var desvio = function (y) { return amp * (Math.sin(y / 430 + fa) * 0.65 + Math.sin(y / 170 + fb) * 0.35); };

    // pontos de controle a cada ~150 px ao longo da espinha
    var principal = fios[0], novos = [], acum = 0;
    novos.push({ x: principal[0].x + desvio(principal[0].y), y: principal[0].y });
    for (var i = 1; i < principal.length; i++) {
      acum += Math.hypot(principal[i].x - principal[i - 1].x, principal[i].y - principal[i - 1].y);
      if (acum >= 150 || i === principal.length - 1) {
        novos.push({ x: principal[i].x + desvio(principal[i].y), y: principal[i].y });
        acum = 0;
      }
    }
    var u = novos[novos.length - 1];
    u.x = u.x > L.W / 2 ? L.W + 60 : -60; u.y = Math.max(u.y, L.H + 120); u.fim = true;
    novos.forEach(function (p) { p.rel = paraRel(p.x, p.y); });

    // os lagos da v1 viram lagos sobre os trechos entre os pontos mais próximos
    var lagosV1 = [];
    fios.slice(1).forEach(function (lago) {
      var perto = function (p) {
        var m = 0, dm = Infinity;
        for (var k = 0; k < novos.length; k++) { var d = Math.hypot(novos[k].x - p.x, novos[k].y - p.y); if (d < dm) { dm = d; m = k; } }
        return m;
      };
      var de = perto(lago[0]), ate = perto(lago[lago.length - 1]);
      if (ate <= de) ate = de + 1;
      var meio = lago[Math.floor(lago.length / 2)], larg = 0;
      lago.forEach(function (p) {
        var dm = Infinity;
        principal.forEach(function (q) { var d = Math.hypot(q.x - p.x, q.y - p.y); if (d < dm) dm = d; });
        if (dm > larg) larg = dm;
      });
      // de que lado do principal o lago fica
      var a = novos[de], b = novos[ate];
      var lado = ((b.x - a.x) * (meio.y - a.y) - (b.y - a.y) * (meio.x - a.x)) > 0 ? -1 : 1;
      lagosV1.push({ de: de, ate: ate, bojo: Math.max(18, Math.min(80, larg)), lado: lado });
    });
    return { pcs: novos, lagos: lagosV1 };
  }

  // ---------------- leitura da pessoa ----------------

  var velocidade = 0, ultimoScroll = window.scrollY, ultimoTempo = performance.now(), parouEm = performance.now(), pausaUsada = true;
  window.addEventListener('scroll', function () {
    var agora = performance.now(), dt = Math.max(16, agora - ultimoTempo);
    var v = Math.abs(window.scrollY - ultimoScroll) / dt * 1000;
    velocidade = velocidade * 0.75 + v * 0.25;
    ultimoScroll = window.scrollY; ultimoTempo = agora; parouEm = agora; pausaUsada = false;
    acordar();
  }, { passive: true });
  window.addEventListener('pointermove', function (e) {
    var r = pagina.getBoundingClientRect();
    mouseX = (e.clientX - r.left) * (pagina.offsetWidth / r.width);
    mouseQuando = performance.now();
  }, { passive: true });

  var wAtual = 1.4;
  function espessuraAgora() {
    var lento = 1 - Math.min(1, velocidade / 2600);
    var alvo = L.larga ? 1.0 + 2.4 * lento : 0.8 + 1.6 * lento;
    wAtual += (alvo - wAtual) * 0.02;
    return wAtual;
  }

  // ---------------- a ponta ----------------

  var pingo = document.createElementNS(SVG_NS, 'circle');
  pingo.setAttribute('class', 'rio__pingo');
  svg.appendChild(pingo);

  var segAtual = 0, kAtual = 0, amostra = 0, terminado = false, pontaY = -40;

  function desenharUmPasso() {
    estender(pontaY + (L.larga ? 1400 : 1100));
    if (segAtual >= PCs.length - 1) { terminado = true; return false; }
    var sg = trecho(segAtual);
    if (kAtual >= sg.n) {
      segAtual++; kAtual = 0;
      if (segAtual >= PCs.length - 1) { terminado = true; return false; }
      if (acaso() < (L.larga && rota ? 0.08 : 0.25)) criarLago(segAtual + 1);   // lagos que nascem sozinhos
      return true;
    }
    var a = sg.pts[kAtual], b = sg.pts[kAtual + 1];
    var w = espessuraAgora();
    if (amostra < 60) w *= 0.3 + 0.7 * amostra / 60;     // começa fina
    var op = visibilidade(b[0], b[1]);
    var wv = w * (0.55 + 0.45 * op);                     // por cima do texto, também mais fina
    sg.w[kAtual] = w;
    tracar(principal, a, b, wv, op);
    var lago = lagoEm(segAtual);
    if (lago) {
      var qa = pontoDoLago(lago, segAtual, kAtual), qb = pontoDoLago(lago, segAtual, kAtual + 1);
      var opl = visibilidade(qb[0], qb[1]);
      tracar(lago.fio, qa, qb, Math.max(0.35, w * 0.6 * (0.55 + 0.45 * opl)), opl);
    }
    kAtual++; amostra++;
    pontaY = b[1];
    pingo.setAttribute('cx', b[0].toFixed(1));
    pingo.setAttribute('cy', b[1].toFixed(1));
    pingo.setAttribute('r', (wv * 0.9 + 0.6).toFixed(2));
    pingo.setAttribute('opacity', op.toFixed(2));
    return true;
  }

  // ---------------- laço ----------------

  var rodando = 0, ultimoQuadro = 0;

  function alvoY() {
    var topo = pagina.getBoundingClientRect().top;
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) return L.H + 400;
    return window.innerHeight * POSICAO_DA_PONTA - topo;
  }

  function quadro(agora) {
    rodando = 0;
    if (!L || terminado) return;
    var dt = Math.min(0.05, ultimoQuadro ? (agora - ultimoQuadro) / 1000 : 0.016);
    ultimoQuadro = agora;
    var alvo = alvoY();
    var atraso = alvo - pontaY;
    if (atraso > 0) {
      // ritmo de mão; acelera quando fica muito para trás, sem saltar
      var avanco = (RITMO + Math.max(0, atraso - 200) * 2.2) * dt;
      var limite = pontaY + avanco, guarda = 0;
      while (pontaY < Math.min(alvo, limite) && guarda++ < 400) if (!desenharUmPasso()) break;
    }
    // pausa na leitura: o trecho logo adiante se abre num lago
    if (!pausaUsada && agora - parouEm > 1200) {
      pausaUsada = true;
      if (!criarLago(segAtual + 1)) criarLago(segAtual + 2);
    }
    if (terminado) { pingo.setAttribute('opacity', 0); return; }
    if (pontaY < alvo - 1 || !pausaUsada) acordar(); else ultimoQuadro = 0;
  }
  function acordar() { if (!rodando && !terminado) rodando = requestAnimationFrame(quadro); }

  // ---------------- início e mudanças de tamanho ----------------

  function iniciar() {
    L = medir();
    svg.setAttribute('viewBox', '0 0 ' + Math.round(L.W) + ' ' + Math.round(L.H));
    svg.setAttribute('preserveAspectRatio', 'none');
    principal = novoFio();
    if (L.larga && rota) {
      var esp = espinhaDaRota();
      PCs = esp.pcs;
      esp.lagos.forEach(function (l) { l.fio = novoFio(); lagos.push(l); });
    } else {
      var ivs = intervalosLivres(120, 80);
      var iv = ivs.length ? (acaso() < 0.5 ? ivs[0] : ivs[ivs.length - 1]) : [10, 40];
      var x0 = iv[0] + Math.min(L.larga ? 70 : 10, (iv[1] - iv[0]) / 2);
      PCs = [{ x: x0, y: -40 }];
      PCs[0].rel = paraRel(x0, -40);
    }
    if (semMovimento) {
      velocidade = 600;
      var guarda = 0;
      while (!terminado && guarda++ < 100000) desenharUmPasso();
      pingo.setAttribute('opacity', 0);
      return;
    }
    acordar();
  }

  // a página mudou de tamanho: reposiciona e redesenha o que já foi feito
  function remontar() {
    var novo = medir();
    if (Math.abs(novo.W - L.W) < 1 && Math.abs(novo.H - L.H) < 1) { L = novo; return; }
    var tipoMudou = novo.larga !== L.larga;
    L = novo;
    svg.setAttribute('viewBox', '0 0 ' + Math.round(L.W) + ' ' + Math.round(L.H));
    Array.prototype.slice.call(svg.querySelectorAll('path')).forEach(function (p) { p.remove(); });
    if (tipoMudou) {
      PCs = []; segs = []; lagos = []; segAtual = 0; kAtual = 0; amostra = 0; terminado = false; pontaY = -40;
      iniciar();
      return;
    }
    PCs.forEach(function (p) { var q = deRel(p.rel); p.x = q[0]; p.y = q[1]; });
    var antigos = segs;
    segs = [];
    principal = novoFio();
    lagos.forEach(function (l) { l.fio = novoFio(); });
    for (var i = 0; i < antigos.length; i++) {
      if (!antigos[i]) continue;
      var pts = amostrarTrecho(i, antigos[i].n);
      segs[i] = { pts: pts, n: antigos[i].n, w: antigos[i].w };
      var ate = i < segAtual ? antigos[i].n : (i === segAtual ? kAtual : 0);
      for (var k = 0; k < ate; k++) {
        var w = antigos[i].w[k] || 1, op = visibilidade(pts[k + 1][0], pts[k + 1][1]);
        tracar(principal, pts[k], pts[k + 1], w * (0.55 + 0.45 * op), op);
        var lago = lagoEm(i);
        if (lago) {
          var qa = pontoDoLago(lago, i, k), qb = pontoDoLago(lago, i, k + 1), opl = visibilidade(qb[0], qb[1]);
          tracar(lago.fio, qa, qb, Math.max(0.35, w * 0.6 * (0.55 + 0.45 * opl)), opl);
        }
        pontaY = pts[k + 1][1];
      }
    }
    acordar();
  }

  var agendado = 0;
  function agendarRemontagem() {
    if (agendado || !L) return;
    agendado = requestAnimationFrame(function () { agendado = 0; remontar(); });
  }

  function comecar() {
    if (L || !rotaPronta) return;
    iniciar();
    if (window.ResizeObserver) new ResizeObserver(agendarRemontagem).observe(pagina);
    pagina.addEventListener('toggle', agendarRemontagem, true);
  }

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(comecar);
  window.addEventListener('load', comecar);
  setTimeout(comecar, 1500);
})();
