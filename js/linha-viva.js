/*
 * A linha viva (versão 2)
 * -----------------------
 * A linha é desenhada na hora, enquanto a pessoa rola a página, e cada visita
 * produz um desenho diferente. As regras do desenho, como na tatuagem:
 *
 *  - Um só começo (no topo) e um só fim (saindo pela base da página).
 *  - Ela se ramifica, mas toda ramificação volta a se juntar: são "lagos",
 *    dois fios que se separam e se reencontram. Não há pontas soltas.
 *  - O traço é uma curva longa e suave (spline) que passa por pontos sorteados
 *    nos espaços livres da página. Nunca atravessa textos nem fotos.
 *
 * O que muda de uma visita para outra:
 *  - Uma semente aleatória escolhe os pontos por onde a curva passa e onde há lagos.
 *  - O ritmo da leitura muda a espessura: devagar, mais grosso; rápido, mais fino.
 *  - Uma pausa na leitura faz a linha se abrir num lago logo adiante.
 *  - No computador, os próximos pontos da curva tendem para o lado do mouse.
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
    var folga = larga ? 16 : 6;
    var obs = [], faixa = document.createRange(), pais = 'h1,h2,h3,p,li,summary,figcaption,a';
    pagina.querySelectorAll('h1,h2,h3,p,li,summary,figcaption,a,span,img').forEach(function (el) {
      if (el.parentElement && el.parentElement.closest(pais)) return;
      if (el.closest('svg') || el.classList.contains('pular')) return;
      var r;
      if (el.tagName === 'A' || el.tagName === 'IMG') r = el.getBoundingClientRect();
      else { faixa.selectNodeContents(el); r = faixa.getBoundingClientRect(); }
      if (r.width < 1 || r.height < 1) return;
      obs.push([(r.left - base.left) * k - folga, (r.top - base.top) * k - folga, (r.right - base.left) * k + folga, (r.bottom - base.top) * k + folga]);
    });
    var Lm = { W: W, H: H, larga: larga, B: B, obs: obs };
    montarGrade(Lm);
    return Lm;
  }

  // ---------------- grade de espaço livre ----------------
  // A página vira uma grade; células com texto ou foto ficam bloqueadas.
  // Cada célula livre guarda a distância até o bloqueio mais próximo, para a
  // linha preferir passar pelo meio dos espaços, longe das bordas do texto.

  function montarGrade(Lm) {
    var c = Lm.larga ? 10 : 4;
    var cols = Math.ceil(Lm.W / c) + 1, lins = Math.ceil(Lm.H / c) + 1;
    var bloq = new Uint8Array(cols * lins);
    Lm.obs.forEach(function (o) {
      var c0 = Math.max(0, Math.floor(o[0] / c)), c1 = Math.min(cols - 1, Math.ceil(o[2] / c));
      var l0 = Math.max(0, Math.floor(o[1] / c)), l1 = Math.min(lins - 1, Math.ceil(o[3] / c));
      for (var l = l0; l <= l1; l++) for (var cc = c0; cc <= c1; cc++) bloq[l * cols + cc] = 1;
    });
    // distância (em células) até o bloqueio mais próximo, limitada
    var dist = new Uint8Array(cols * lins).fill(255), fila = new Int32Array(cols * lins), ini = 0, fim = 0;
    for (var i = 0; i < bloq.length; i++) if (bloq[i]) { dist[i] = 0; fila[fim++] = i; }
    while (ini < fim) {
      var p = fila[ini++], d = dist[p];
      if (d >= 40) continue;
      var x = p % cols, y = (p / cols) | 0;
      var viz = [x > 0 ? p - 1 : -1, x < cols - 1 ? p + 1 : -1, y > 0 ? p - cols : -1, y < lins - 1 ? p + cols : -1];
      for (var v = 0; v < 4; v++) { var q = viz[v]; if (q >= 0 && dist[q] > d + 1) { dist[q] = d + 1; fila[fim++] = q; } }
    }
    Lm.grade = { c: c, cols: cols, lins: lins, bloq: bloq, dist: dist };
  }

  function livreNaGrade(x, y) {
    var G = L.grade, cx = Math.round(x / G.c), cy = Math.round(y / G.c);
    if (cx < 0 || cy < 0 || cx >= G.cols || cy >= G.lins) return true;
    return !G.bloq[cy * G.cols + cx];
  }

  // alisa o caminho da grade (que anda em degraus) sem deixá-lo entrar no texto
  function suavizarRota(r) {
    var p = r.map(function (q) { return { x: q.x, y: q.y }; });
    for (var it = 0; it < 24; it++) {
      for (var i = 2; i < p.length - 2; i++) {
        var nx = (p[i - 2].x + 2 * p[i - 1].x + 3 * p[i].x + 2 * p[i + 1].x + p[i + 2].x) / 9;
        var ny = (p[i - 2].y + 2 * p[i - 1].y + 3 * p[i].y + 2 * p[i + 1].y + p[i + 2].y) / 9;
        if (livreNaGrade(nx, ny)) { p[i].x = nx; p[i].y = ny; }
      }
    }
    return p;
  }

  // Ramer-Douglas-Peucker: fica só com os pontos que dão forma à curva
  function simplificar(p, eps) {
    if (p.length < 3) return p;
    var maxD = 0, idx = 0, a = p[0], b = p[p.length - 1];
    var dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    for (var i = 1; i < p.length - 1; i++) {
      var d = Math.abs(dy * p[i].x - dx * p[i].y + b.x * a.y - b.y * a.x) / len;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD <= eps) return [a, b];
    var esq = simplificar(p.slice(0, idx + 1), eps), dir = simplificar(p.slice(idx), eps);
    return esq.slice(0, -1).concat(dir);
  }

  // caminho livre entre dois pontos (A*), preferindo o meio dos espaços
  function caminho(a, b) {
    var G = L.grade, c = G.c, cols = G.cols;
    var cl = function (v, m) { return Math.max(0, Math.min(m - 1, v)); };
    var ax = cl(Math.round(a.x / c), cols), ay = cl(Math.round(a.y / c), G.lins);
    var bx = cl(Math.round(b.x / c), cols), by = cl(Math.round(b.y / c), G.lins);
    var lMin = Math.max(0, Math.min(ay, by) - Math.round(120 / c)), lMax = Math.min(G.lins - 1, Math.max(ay, by) + Math.round(120 / c));
    var alvo = by * cols + bx, inicio = ay * cols + ax;
    var custo = new Map(), veio = new Map();
    var heap = [[0, inicio]];
    custo.set(inicio, 0);
    function push(item) { heap.push(item); var i = heap.length - 1; while (i > 0) { var pai = (i - 1) >> 1; if (heap[pai][0] <= heap[i][0]) break; var t = heap[pai]; heap[pai] = heap[i]; heap[i] = t; i = pai; } }
    function pop() { var top = heap[0], ult = heap.pop(); if (heap.length) { heap[0] = ult; var i = 0; for (;;) { var e = 2 * i + 1, d = e + 1, m = i; if (e < heap.length && heap[e][0] < heap[m][0]) m = e; if (d < heap.length && heap[d][0] < heap[m][0]) m = d; if (m === i) break; var t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m; } } return top; }
    var passos = 0, achou = false;
    while (heap.length && passos++ < 60000) {
      var atual = pop()[1];
      if (atual === alvo) { achou = true; break; }
      var x = atual % cols, y = (atual / cols) | 0, g = custo.get(atual);
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        var nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= cols || ny < lMin || ny > lMax) continue;
        var q = ny * cols + nx;
        if (G.bloq[q] && q !== alvo) continue;
        var passo = (dx && dy) ? 1.414 : 1;
        var ng = g + passo * (1 + 3 / (G.dist[q] + 1));
        if (!custo.has(q) || ng < custo.get(q)) {
          custo.set(q, ng); veio.set(q, atual);
          push([ng + Math.hypot(nx - bx, ny - by), q]);
        }
      }
    }
    if (!achou) return null;
    var cel = [], p = alvo;
    while (p !== undefined && p !== inicio) { cel.push(p); p = veio.get(p); }
    cel.reverse();
    return cel.map(function (q) { return { x: (q % cols) * c, y: ((q / cols) | 0) * c }; });
  }

  function dentro(x, y) {
    for (var i = 0; i < L.obs.length; i++) {
      var o = L.obs[i];
      if (x > o[0] && x < o[2] && y > o[1] && y < o[3]) return true;
    }
    return false;
  }

  // trechos livres na horizontal, olhando uma faixa de altura em volta de y
  function intervalosLivres(y, janela) {
    var ivs = [[L.larga ? 6 : 2, L.W - (L.larga ? 6 : 2)]];
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
    return ivs.filter(function (iv) { return iv[1] - iv[0] >= (L.larga ? 36 : 6); });
  }

  // posição relativa às seções (para reposicionar se a página mudar de tamanho)
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
  // Pontos de controle (PC) são sorteados à frente da ponta. A curva passa por
  // eles (Catmull-Rom centrípeta), o que dá traços longos e sem quinas.

  var PCs = [];           // { x, y, rel, fim }
  var segs = [];          // amostras de cada trecho entre PC[i] e PC[i+1]: { pts, n, w: [] }
  var lagos = [];         // { de, ate, bojo, lado, fio }
  var principal = null;
  var amostra = 0;
  var mouseX = null, mouseQuando = 0;

  function catmull(p0, p1, p2, p3, n) {
    function tj(ti, a, b) { return ti + Math.max(0.01, Math.pow(Math.hypot(b.x - a.x, b.y - a.y), 0.5)); }
    var t0 = 0, t1 = tj(t0, p0, p1), t2 = tj(t1, p1, p2), t3 = tj(t2, p2, p3);
    var out = [];
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

  function amostrarTrecho(i, n) {
    var a = pc(i), b = pc(i + 1);
    if (!n) n = Math.max(6, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 6));
    return catmull(pc(i - 1), a, b, pc(i + 2), n);
  }

  function sortearPC(ant) {
    var gap = L.larga ? 380 + acaso() * 420 : 300 + acaso() * 300;
    var y = ant.y + gap;
    if (y > L.H - 120) return { x: ant.x > L.W / 2 ? L.W + 50 : -50, y: L.H + 90, fim: true };
    var ivs = intervalosLivres(y, L.larga ? 70 : 30);
    if (!ivs.length) return { x: ant.x, y: y };
    // prefere trechos largos e não muito distantes do ponto anterior
    var pesos = ivs.map(function (iv) {
      var c = (iv[0] + iv[1]) / 2;
      return Math.pow(iv[1] - iv[0], 0.6) * Math.exp(-Math.abs(c - ant.x) / (L.larga ? 340 : 220));
    });
    var soma = pesos.reduce(function (a, b) { return a + b; }, 0), r = acaso() * soma, iv = ivs[0];
    for (var q = 0; q < ivs.length; q++) { r -= pesos[q]; if (r <= 0) { iv = ivs[q]; break; } }
    var m = Math.min(24, (iv[1] - iv[0]) / 3);
    var x = iv[0] + m + acaso() * (iv[1] - iv[0] - 2 * m);
    if (L.larga && mouseX !== null && performance.now() - mouseQuando < 3000) {
      x = x * 0.55 + Math.max(iv[0] + m, Math.min(iv[1] - m, mouseX)) * 0.45;
    }
    return { x: x, y: y };
  }

  // cria pontos de controle até a altura pedida. Entre um ponto sorteado e o
  // próximo, a linha segue um caminho livre (A*) pela grade, e alguns pontos
  // desse caminho viram pontos de controle da curva. Assim ela contorna os
  // textos em curvas largas, pelo meio dos espaços.
  function estender(ateY) {
    var guarda = 0;
    while (!pc(PCs.length - 1).fim && pc(PCs.length - 1).y < ateY && guarda++ < 100) {
      var ant = pc(PCs.length - 1);
      var alvo = sortearPC(ant), rota = null;
      for (var t = 0; t < 6 && !rota; t++) {
        var destino = alvo.fim ? { x: Math.max(0, Math.min(L.W, alvo.x)), y: L.H - 2 } : alvo;
        rota = caminho(ant, destino);
        if (!rota) alvo = sortearPC(ant);
      }
      if (rota) {
        rota.unshift({ x: ant.x, y: ant.y });
        rota.push({ x: alvo.fim ? Math.max(0, Math.min(L.W, alvo.x)) : alvo.x, y: alvo.fim ? L.H - 2 : alvo.y });
        var suave = suavizarRota(rota);
        var simples = simplificar(suave, L.larga ? 16 : 3);
        var minimo = L.larga ? 110 : 45, ultimo = ant;
        for (var i = 1; i < simples.length - 1; i++) {
          if (Math.hypot(simples[i].x - ultimo.x, simples[i].y - ultimo.y) < minimo) continue;
          PCs.push({ x: simples[i].x, y: simples[i].y });
          ultimo = simples[i];
        }
      }
      PCs.push(alvo);
      for (var q = 0; q < PCs.length; q++) if (!PCs[q].rel) PCs[q].rel = paraRel(PCs[q].x, PCs[q].y);
    }
  }

  // ---------------- fios ----------------

  function novoFio() { return { el: null, wAtual: -1, nNoPath: 0, d: '' }; }

  function tracar(fio, a, b, w) {
    var wq = Math.max(0.3, Math.round(w * 4) / 4);
    if (!fio.el || fio.wAtual !== wq || fio.nNoPath > 30) {
      fio.el = document.createElementNS(SVG_NS, 'path');
      fio.el.setAttribute('stroke-width', wq);
      fio.d = 'M' + a[0].toFixed(1) + ' ' + a[1].toFixed(1);
      svg.appendChild(fio.el);
      fio.wAtual = wq; fio.nNoPath = 0;
    }
    fio.d += ' L' + b[0].toFixed(1) + ' ' + b[1].toFixed(1);
    fio.el.setAttribute('d', fio.d);
    fio.nNoPath++;
  }

  // amostras do trecho i; só guarda quando o trecho já está definido de vez
  // (quando existe o ponto de controle seguinte ao fim dele)
  function trecho(i) {
    if (segs[i]) return segs[i];
    var pts = amostrarTrecho(i);
    var s = { pts: pts, n: pts.length - 1, w: [] };
    if (PCs.length - 1 >= i + 2 || pc(i + 1).fim) segs[i] = s;
    return s;
  }

  // ---------------- lagos ----------------
  // Um lago cobre os trechos de "de" até "ate" (sem incluir "ate"): o segundo
  // fio se afasta para um lado e volta a encontrar o principal.

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
    var bojo = e * e * (3 - 2 * e) * lago.bojo * lago.lado;   // abre e fecha com suavidade
    return [p[k][0] - dy / len * bojo, p[k][1] + dx / len * bojo, t];
  }

  function lagoCabe(l) {
    for (var s = l.de; s < l.ate; s++) {
      var n = trecho(s).n;
      for (var k = 0; k <= n; k += 2) {
        var q = pontoDoLago(l, s, k);
        if (dentro(q[0], q[1])) return false;
      }
    }
    return true;
  }

  function criarLago(de) {
    if (de < 1 || lagoEm(de) || lagoEm(de - 1) || lagoEm(de + 1)) return false;
    estender(pc(de).y + 1500);
    if (PCs.length < de + 3 || pc(de + 1).fim) return false;
    var ate = de + ((acaso() < 0.5 && !pc(de + 2).fim && PCs.length > de + 3) ? 2 : 1);
    var bojoMax = L.larga ? 24 + acaso() * 40 : 7 + acaso() * 6;
    var lados = acaso() < 0.5 ? [1, -1] : [-1, 1];
    for (var tentativa = 0; tentativa < 3; tentativa++) {
      for (var q = 0; q < 2; q++) {
        var l = { de: de, ate: ate, bojo: bojoMax * (1 - tentativa * 0.3), lado: lados[q] };
        if (lagoCabe(l)) { l.fio = novoFio(); lagos.push(l); return true; }
      }
    }
    return false;
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

  var wAtual = 1.6;
  function espessuraAgora() {
    var lento = 1 - Math.min(1, velocidade / 2600);
    var alvo = L.larga ? 1.0 + 2.4 * lento : 0.8 + 1.5 * lento;
    wAtual += (alvo - wAtual) * 0.025;     // muda devagar, como pressão de pincel
    return wAtual;
  }

  // ---------------- avanço da ponta ----------------

  var segAtual = 0, kAtual = 0, terminado = false;

  function desenharAte(yAlvo, orcamento) {
    var feitos = 0;
    while (feitos < orcamento && !terminado) {
      estender(yAlvo + (L.larga ? 900 : 700));
      if (segAtual >= PCs.length - 1) { terminado = true; break; }
      var sg = trecho(segAtual);
      if (kAtual >= sg.n) {
        segAtual++; kAtual = 0;
        if (segAtual >= PCs.length - 1) { terminado = true; break; }
        if (acaso() < 0.22) criarLago(segAtual + 1);     // lagos espontâneos
        continue;
      }
      var a = sg.pts[kAtual], b = sg.pts[kAtual + 1];
      if (b[1] > yAlvo && a[1] > yAlvo - 1) break;
      var w = espessuraAgora();
      if (amostra < 50) w *= 0.3 + 0.7 * amostra / 50;     // começa fina
      sg.w[kAtual] = w;
      tracar(principal, a, b, w);
      var lago = lagoEm(segAtual);
      if (lago) {
        var qa = pontoDoLago(lago, segAtual, kAtual), qb = pontoDoLago(lago, segAtual, kAtual + 1);
        tracar(lago.fio, qa, qb, Math.max(0.35, w * 0.62));
      }
      kAtual++; amostra++; feitos++;
    }
  }

  // ---------------- laço ----------------

  var rodando = 0;

  function alvoY() {
    var topo = pagina.getBoundingClientRect().top;
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) return L.H + 200;
    return window.innerHeight * 0.92 - topo;
  }

  function pontaY() {
    var sg = segs[segAtual];
    return sg && sg.pts[kAtual] ? sg.pts[kAtual][1] : -Infinity;
  }

  function quadro() {
    rodando = 0;
    if (!L || terminado) return;
    var alvo = alvoY();
    desenharAte(alvo, 14);
    // pausa na leitura: o trecho logo adiante se abre num lago
    if (!pausaUsada && performance.now() - parouEm > 1200) {
      pausaUsada = true;
      if (!criarLago(segAtual + 1)) criarLago(segAtual + 2);
    }
    if (!terminado && (pontaY() < alvo - 2 || !pausaUsada)) acordar();
  }
  function acordar() { if (!rodando && !terminado) rodando = requestAnimationFrame(quadro); }

  // ---------------- início e mudanças de tamanho ----------------

  function iniciar() {
    L = medir();
    svg.setAttribute('viewBox', '0 0 ' + Math.round(L.W) + ' ' + Math.round(L.H));
    svg.setAttribute('preserveAspectRatio', 'none');
    principal = novoFio();
    // começo: no alto, numa margem livre
    var ivs = intervalosLivres(80, 60);
    var iv = ivs.length ? (acaso() < 0.5 ? ivs[0] : ivs[ivs.length - 1]) : [10, 40];
    var x0 = iv[0] + Math.min(L.larga ? 60 : 8, (iv[1] - iv[0]) / 2);
    PCs = [{ x: x0, y: -40 }];
    PCs[0].rel = paraRel(x0, -40);
    if (semMovimento) {
      velocidade = 700;
      desenharAte(L.H + 400, 1e6);
      return;
    }
    acordar();
  }

  // redesenha o que já foi traçado com a página no novo tamanho
  function remontar() {
    var novo = medir();
    if (Math.abs(novo.W - L.W) < 1 && Math.abs(novo.H - L.H) < 1) { L = novo; return; }
    var tipoMudou = novo.larga !== L.larga;
    L = novo;
    svg.setAttribute('viewBox', '0 0 ' + Math.round(L.W) + ' ' + Math.round(L.H));
    svg.replaceChildren();
    if (tipoMudou) {
      PCs = []; segs = []; lagos = []; segAtual = 0; kAtual = 0; amostra = 0; terminado = false;
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
        var w = antigos[i].w[k] || 1;
        tracar(principal, pts[k], pts[k + 1], w);
        var lago = lagoEm(i);
        if (lago) {
          var qa = pontoDoLago(lago, i, k), qb = pontoDoLago(lago, i, k + 1);
          tracar(lago.fio, qa, qb, Math.max(0.35, w * 0.62));
        }
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
    if (L) return;
    iniciar();
    if (window.ResizeObserver) new ResizeObserver(agendarRemontagem).observe(pagina);
    pagina.addEventListener('toggle', agendarRemontagem, true);
  }

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(comecar);
  window.addEventListener('load', comecar);
  setTimeout(comecar, 1500);
})();
