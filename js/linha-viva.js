/*
 * A linha viva (versão 2)
 * -----------------------
 * Em vez de um percurso pronto, a linha é desenhada na hora, enquanto a pessoa
 * rola a página, e cada visita produz um desenho diferente:
 *
 *  - Uma semente aleatória por visita define o caminho geral: por quais
 *    corredores a linha desce (margens ou o vão entre as colunas), onde ela se
 *    abre em lagos e o balanço do traço.
 *  - O ritmo da leitura muda o traço: rolar devagar deixa a linha mais grossa,
 *    rolar rápido deixa mais fina, como a pressão de um pincel.
 *  - Parar de rolar faz brotar um veio, que cresce para o lado livre e afina.
 *  - No computador, a ponta do traço é puxada de leve na direção do mouse;
 *    no celular, na direção do dedo.
 *  - A linha nunca passa por cima de textos ou fotos: ela só anda pelos
 *    espaços livres e muda de corredor nos respiros entre as seções.
 *  - No fim da página aparece uma miniatura do desenho completo.
 *
 * Quem pede ao sistema para reduzir movimento recebe a linha pronta, já
 * desenhada com uma semente própria.
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  var pagina = document.getElementById('pagina');
  if (!pagina) return;
  var svg = pagina.querySelector('svg.rio');
  if (!svg) return;
  var miniatura = document.querySelector('[data-miniatura]');
  var semMovimento = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------- acaso com semente ----------------

  var semente = (window.crypto && crypto.getRandomValues) ? crypto.getRandomValues(new Uint32Array(1))[0] : (Date.now() >>> 0);
  function gerador(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var acaso = gerador(semente);
  var fase = [acaso() * 10, acaso() * 10, acaso() * 10];
  function ruido(t) {
    return Math.sin(t * 1.3 + fase[0]) * 0.5 + Math.sin(t * 2.9 + fase[1]) * 0.3 + Math.sin(t * 6.1 + fase[2]) * 0.2;
  }

  // ---------------- medidas da página ----------------

  var L = null;   // layout atual: { W, H, larga, B, obs, posX, plano }

  function medir() {
    var base = pagina.getBoundingClientRect();
    var k = pagina.offsetWidth / base.width;
    var W = pagina.offsetWidth, H = pagina.offsetHeight;
    var larga = W >= 1000;

    // seções, na ordem
    var secs = pagina.querySelectorAll(':scope > header, :scope > main > section, :scope > footer');
    var B = Array.prototype.map.call(secs, function (el) { return (el.getBoundingClientRect().top - base.top) * k; });
    B.push(H);

    // obstáculos: textos e fotos, com folga
    var folga = larga ? 14 : 7;
    var obs = [];
    var faixa = document.createRange();
    var pais = 'h1,h2,h3,p,li,summary,figcaption,a';
    pagina.querySelectorAll('h1,h2,h3,p,li,summary,figcaption,a,span,img').forEach(function (el) {
      if (el.parentElement && el.parentElement.closest(pais)) return;
      if (el.closest('svg') || el.closest('[data-miniatura]') || el.classList.contains('pular')) return;
      var r;
      if (el.tagName === 'A' || el.tagName === 'IMG') r = el.getBoundingClientRect();
      else { faixa.selectNodeContents(el); r = faixa.getBoundingClientRect(); }
      if (r.width < 1 || r.height < 1) return;
      obs.push([(r.left - base.left) * k - folga, (r.top - base.top) * k - folga, (r.right - base.left) * k + folga, (r.bottom - base.top) * k + folga]);
    });

    // corredores
    var cont = pagina.querySelector('.container');
    var rc = cont.getBoundingClientRect();
    var pad = parseFloat(getComputedStyle(cont).paddingLeft) || 0;
    var margemFora = (rc.left - base.left) * k + pad;
    var colunas = pagina.querySelector('.conteudo');
    var xCentro = colunas ? (colunas.getBoundingClientRect().left - base.left) * k - 32 : W / 2;
    var posX = larga
      ? function (lado) { return lado === 'D' ? W - margemFora * 0.5 : lado === 'C' ? xCentro : margemFora * 0.5; }
      : function (lado) { var m = Math.max(5, margemFora * 0.42); return lado === 'D' ? W - m : m; };
    // quanto a ponta pode se afastar do centro do corredor
    var folgaLado = larga
      ? function (lado) { return lado === 'C' ? 16 : Math.max(20, margemFora * 0.36); }
      : function () { return 3; };

    return { W: W, H: H, larga: larga, B: B, obs: obs, posX: posX, folgaLado: folgaLado };
  }

  // o plano (corredor de cada seção e onde há lagos) é sorteado uma vez por visita
  var plano = null;
  function sortearPlano(n, larga) {
    var lados = [], lagos = [];
    var opcoes = larga ? ['E', 'C', 'D'] : ['E', 'D'];
    var atual = acaso() < 0.5 ? 'E' : 'D';
    for (var s = 0; s < n; s++) {
      if (s >= 2 && acaso() < (larga ? 0.55 : 0.45)) {
        var outras = opcoes.filter(function (o) { return o !== atual; });
        atual = outras[Math.floor(acaso() * outras.length)];
      }
      if (s === 1 && atual === 'C') atual = 'E';     // a abertura não tem vão central
      if (s >= n - 2 && atual === 'C') atual = 'D';  // chamada final e rodapé: sai por uma margem
      if (s === n - 1) atual = lados[s - 1];          // não troca de lado dentro do rodapé
      lados.push(atual);
      lagos.push(acaso() < 0.55);
    }
    return { lados: lados, lagos: lagos, larga: larga };
  }

  // espaço livre na horizontal em volta do ponto x, olhando uma faixa de altura
  // (de y-acima até y+abaixo), para a linha não se enfiar entre dois parágrafos
  function livre(y, x, acima, abaixo) {
    var esq = 4, dir = L.W - 4;
    var ya = y - (acima || 0), yb = y + (abaixo || 0);
    for (var i = 0; i < L.obs.length; i++) {
      var o = L.obs[i];
      if (yb < o[1] || ya > o[3]) continue;
      if (x >= o[0] && x <= o[2]) {
        // x caiu dentro de um texto: sai pelo lado mais próximo
        if (x - o[0] < o[2] - x) { dir = Math.min(dir, o[0]); x = o[0] - 1; } else { esq = Math.max(esq, o[2]); x = o[2] + 1; }
        continue;
      }
      if (o[2] < x) esq = Math.max(esq, o[2]);
      if (o[0] > x) dir = Math.min(dir, o[0]);
    }
    return [esq, dir];
  }

  // faixa sem texto em volta da divisa entre duas seções
  function respiro(y) {
    var cima = y - 170, baixo = y + 170;
    for (var i = 0; i < L.obs.length; i++) {
      var o = L.obs[i];
      if (o[3] <= y && o[3] > cima) cima = o[3];
      if (o[1] >= y && o[1] < baixo) baixo = o[1];
    }
    cima += 6; baixo -= 6;
    if (baixo - cima < 40) { cima = y - 20; baixo = y + 20; }
    return [cima, baixo];
  }

  function secaoDe(y) {
    for (var s = 0; s < L.B.length - 1; s++) if (y < L.B[s + 1]) return s;
    return L.B.length - 2;
  }

  // ---------------- o traço ----------------
  // Cada fio guarda pontos em coordenadas "presas às seções" (seção, posição na
  // seção, x relativo à largura), para poder ser redesenhado se a tela mudar.

  var fios = [];          // { pts: [[x,y,w]], rel: [[xr, s, f, w]], els: [], ultimo: null, cor }
  var principal = null;
  var ponta = null;       // { x, y, w }
  var travessia = null;   // travessia em andamento entre corredores
  var veios = [];         // veios crescendo
  var totalVeios = 0, proximoVeio = 0;

  function novoFio() {
    var f = { pts: [], rel: [], el: null, wAtual: -1, nNoPath: 0 };
    fios.push(f);
    return f;
  }

  function relativo(x, y, w) {
    var s = secaoDe(y), h = (L.B[s + 1] - L.B[s]) || 1;
    return [x / L.W, s, (y - L.B[s]) / h, w];
  }

  function adicionar(fio, x, y, w) {
    var wq = Math.max(0.3, Math.round(w * 4) / 4);
    fio.pts.push([x, y, wq]);
    fio.rel.push(relativo(x, y, wq));
    var n = fio.pts.length;
    if (n < 2) return;
    var a = fio.pts[n - 2];
    // continua o mesmo <path> enquanto a espessura não muda
    if (!fio.el || fio.wAtual !== wq || fio.nNoPath > 24) {
      fio.el = document.createElementNS(SVG_NS, 'path');
      fio.el.setAttribute('stroke-width', wq);
      fio.el.__d = 'M' + a[0].toFixed(1) + ' ' + a[1].toFixed(1);
      svg.appendChild(fio.el);
      fio.wAtual = wq; fio.nNoPath = 0;
    }
    fio.el.__d += ' L' + x.toFixed(1) + ' ' + y.toFixed(1);
    fio.el.setAttribute('d', fio.el.__d);
    fio.nNoPath++;
  }

  // ---------------- entrada da pessoa ----------------

  var mouseX = null, mouseQuando = 0;
  window.addEventListener('pointermove', function (e) {
    mouseX = (e.clientX - pagina.getBoundingClientRect().left) * (pagina.offsetWidth / pagina.getBoundingClientRect().width);
    mouseQuando = performance.now();
  }, { passive: true });

  var velocidade = 0, ultimoScroll = window.scrollY, ultimoTempo = performance.now(), parouEm = performance.now();
  window.addEventListener('scroll', function () {
    var agora = performance.now(), dt = Math.max(16, agora - ultimoTempo);
    var v = Math.abs(window.scrollY - ultimoScroll) / dt * 1000;   // px por segundo
    velocidade = velocidade * 0.7 + v * 0.3;
    ultimoScroll = window.scrollY; ultimoTempo = agora; parouEm = agora;
    acordar();
  }, { passive: true });

  // ---------------- crescimento ----------------

  var PASSO = 6;

  function espessuraAgora(y) {
    // devagar = mais grosso; rápido = mais fino
    var lento = 1 - Math.min(1, velocidade / 2400);
    var base = L.larga ? (1.1 + 2.6 * lento) : (0.8 + 1.7 * lento);
    return Math.max(0.5, base * (0.85 + 0.3 * (0.5 + 0.5 * ruido(y / 90))));
  }

  function avancar() {
    var y = ponta.y + PASSO;
    var s = secaoDe(y);
    var lado = plano.lados[Math.min(s, plano.lados.length - 1)];
    var w = espessuraAgora(y);
    w = ponta.w + (w - ponta.w) * 0.15;   // espessura muda aos poucos

    // começa uma travessia quando chega no respiro antes de uma seção com outro corredor
    if (!travessia && s < L.B.length - 2) {
      var ladoProx = plano.lados[Math.min(s + 1, plano.lados.length - 1)];
      if (ladoProx !== lado) {
        var faixa = respiro(L.B[s + 1]);
        if (y >= faixa[0] && y < faixa[1]) {
          travessia = { y0: ponta.y, y1: faixa[1], xa: ponta.x, xb: L.posX(ladoProx), lago: null };
          var alt = travessia.y1 - travessia.y0;
          if (plano.lagos[s] && alt > 70) {
            travessia.bojo = Math.min(L.larga ? 46 : 26, alt * 0.3);
            travessia.lago = novoFio();
            adicionar(travessia.lago, ponta.x, ponta.y, w * 0.6);
          }
        }
      }
    }
    // fim da página: sai pelo canto de baixo
    if (!travessia && y > L.H - 90) {
      travessia = { y0: ponta.y, y1: L.H + 40, xa: ponta.x, xb: ponta.x > L.W / 2 ? L.W + 40 : -40, fim: true };
    }

    var x;
    if (travessia) {
      var t = Math.min(1, (y - travessia.y0) / (travessia.y1 - travessia.y0));
      var e = t * t * (3 - 2 * t);
      x = travessia.xa + (travessia.xb - travessia.xa) * e;
      var yPrincipal = y - (travessia.bojo || 0) * 0.6 * Math.sin(Math.PI * t);
      adicionar(principal, x, yPrincipal, w);
      if (travessia.lago) {
        var wl = Math.max(0.4, w * 0.6 * Math.min(1, Math.sin(Math.PI * t) * 3));
        adicionar(travessia.lago, x, y + travessia.bojo * Math.sin(Math.PI * t), wl);
      }
      ponta = { x: x, y: y, w: w };
      if (t >= 1) travessia = null;
      return;
    }

    // dentro de um corredor: balança, é puxada pelo mouse, nunca entra no texto
    var base = L.posX(lado), folga = L.folgaLado(lado);
    var alvo = base + ruido(y / 160) * folga * 0.6;
    if (L.larga && mouseX !== null && performance.now() - mouseQuando < 2500) {
      alvo = alvo * 0.6 + Math.max(base - folga, Math.min(base + folga, mouseX)) * 0.4;
    }
    alvo = Math.max(base - folga, Math.min(base + folga, alvo));
    var lim2 = livre(y, ponta.x, 70, 110);
    alvo = Math.max(lim2[0] + 4, Math.min(lim2[1] - 4, alvo));
    x = ponta.x + (alvo - ponta.x) * 0.06;            // curva macia, sem quinas
    x = Math.max(lim2[0] + 2, Math.min(lim2[1] - 2, x));
    adicionar(principal, x, y, w);
    ponta = { x: x, y: y, w: w };

    // veios espontâneos ao longo do caminho
    if (y > proximoVeio) {
      brotar(0.5 + acaso() * 0.6);
      proximoVeio = y + (L.larga ? 380 : 520) + acaso() * 520;
    }
  }

  // um veio nasce da ponta e cresce para o lado mais livre
  function brotar(forca) {
    if (totalVeios > (L.larga ? 22 : 12)) return;
    var lim = livre(ponta.y, ponta.x, 20, 140);
    var espacoE = ponta.x - lim[0], espacoD = lim[1] - ponta.x;
    var lado = espacoD > espacoE ? 1 : -1;
    var espaco = Math.max(espacoE, espacoD);
    if (espaco < (L.larga ? 30 : 10)) return;
    var comp = Math.min(espaco * 0.9, (L.larga ? 70 + acaso() * 160 : 25 + acaso() * 45) * forca);
    var fio = novoFio();
    adicionar(fio, ponta.x, ponta.y, ponta.w * 0.7);
    veios.push({
      fio: fio, x: ponta.x, y: ponta.y,
      ang: Math.PI / 2 - lado * (0.5 + acaso() * 0.6),   // para baixo e para fora
      curva: (acaso() - 0.5) * 0.06,
      andou: 0, comp: comp, w: ponta.w * 0.7
    });
    totalVeios++;
  }

  function crescerVeios() {
    var vivos = [];
    veios.forEach(function (v) {
      var passo = 2.2;
      v.ang += v.curva + ruido(v.andou / 40 + v.y) * 0.03;
      var nx = v.x + Math.cos(v.ang) * passo, ny = v.y + Math.sin(v.ang) * passo;
      // para se encostar em texto
      for (var i = 0; i < L.obs.length; i++) {
        var o = L.obs[i];
        if (nx > o[0] && nx < o[2] && ny > o[1] && ny < o[3]) { v.andou = v.comp; break; }
      }
      if (v.andou >= v.comp) return;
      v.x = nx; v.y = ny; v.andou += passo;
      var resta = 1 - v.andou / v.comp;
      adicionar(v.fio, nx, ny, Math.max(0.3, v.w * (0.35 + 0.65 * resta)));
      vivos.push(v);
    });
    veios = vivos;
  }

  // ---------------- laço de animação ----------------

  var rodando = 0, terminado = false;

  function alvoY() {
    var topo = pagina.getBoundingClientRect().top;
    var fimDaPagina = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
    if (fimDaPagina) return L.H + 60;
    // a ponta fica perto da base da tela, visível, como uma caneta
    return window.innerHeight * 0.9 - topo;
  }

  function quadro() {
    rodando = 0;
    if (!L || terminado) return;
    var alvo = alvoY();
    var orcamento = Math.min(60, Math.max(2, Math.ceil((alvo - ponta.y) / PASSO / 6)));
    var andou = 0;
    while (ponta.y < alvo && andou < orcamento && !terminado) {
      avancar(); andou++;
      if (ponta.y >= L.H + 30) { terminar(); break; }
    }
    // parou de rolar com a ponta na tela: brota um veio
    if (performance.now() - parouEm > 1300 && !travessia) {
      parouEm = performance.now() + 2500;   // no máximo um veio por pausa
      brotar(1);
    }
    if (veios.length) crescerVeios();
    velocidade *= 0.96;
    if (veios.length || ponta.y < alvo || performance.now() - parouEm < 1600) acordar();
  }

  function acordar() {
    if (!rodando && !terminado) rodando = requestAnimationFrame(quadro);
  }

  function terminar() {
    terminado = true;
    // termina de crescer os veios que estavam brotando
    for (var i = 0; i < 200 && veios.length; i++) crescerVeios();
    mostrarMiniatura();
  }

  // ---------------- miniatura do desenho ----------------

  function mostrarMiniatura() {
    if (!miniatura) return;
    var alvoSvg = miniatura.querySelector('svg');
    if (!alvoSvg) return;
    alvoSvg.setAttribute('viewBox', '0 0 ' + Math.round(L.W) + ' ' + Math.round(L.H));
    alvoSvg.replaceChildren();
    fios.forEach(function (f) {
      if (f.pts.length < 2) return;
      var p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', 'M' + f.pts.map(function (q) { return q[0].toFixed(0) + ' ' + q[1].toFixed(0); }).join(' L'));
      alvoSvg.appendChild(p);
    });
    miniatura.removeAttribute('aria-hidden');
    requestAnimationFrame(function () { miniatura.classList.add('visivel'); });
  }

  // ---------------- montagem e mudanças de tamanho ----------------

  function iniciar() {
    L = medir();
    plano = sortearPlano(L.B.length - 1, L.larga);
    svg.setAttribute('viewBox', '0 0 ' + Math.round(L.W) + ' ' + Math.round(L.H));
    svg.setAttribute('preserveAspectRatio', 'none');
    principal = novoFio();
    var x0 = L.posX(plano.lados[0]);
    ponta = { x: x0, y: -30, w: 0.6 };
    adicionar(principal, x0, -30, 0.6);
    proximoVeio = 300 + acaso() * 400;

    if (semMovimento) {
      // linha pronta, sem interação
      velocidade = 600;
      while (ponta.y < L.H + 30) { avancar(); }
      for (var i = 0; i < 400 && veios.length; i++) crescerVeios();
      terminado = true;
      mostrarMiniatura();
      return;
    }
    acordar();
  }

  // Se a página mudar de tamanho, reposiciona o que já foi desenhado
  var chave = '';
  function remontar() {
    if (!L) return;
    var novo = medir();
    var k = novo.W + 'x' + novo.H + ':' + novo.B.map(Math.round).join(',');
    if (k === chave) return;
    chave = k;
    if (novo.W === L.W && novo.H === L.H) { L = novo; return; }
    var largaMudou = novo.larga !== L.larga;
    L = novo;
    if (largaMudou) plano = sortearPlano(L.B.length - 1, L.larga);
    svg.setAttribute('viewBox', '0 0 ' + Math.round(L.W) + ' ' + Math.round(L.H));
    svg.replaceChildren();
    var antigos = fios;
    fios = [];
    antigos.forEach(function (f) {
      var novoF = novoFio();
      if (f === principal) principal = novoF;
      if (travessia && f === travessia.lago) travessia.lago = novoF;
      veios.forEach(function (v) { if (v.fio === f) v.fio = novoF; });
      f.rel.forEach(function (r) {
        var s = Math.min(r[1], L.B.length - 2);
        var x = r[0] * L.W, y = L.B[s] + r[2] * (L.B[s + 1] - L.B[s]);
        var lim = livre(y, x, 4, 4);
        x = Math.max(lim[0] + 2, Math.min(lim[1] - 2, x));
        adicionar(novoF, x, y, r[3]);
      });
    });
    var u = principal.pts[principal.pts.length - 1];
    if (u) ponta = { x: u[0], y: u[1], w: ponta.w };
    if (travessia) { travessia = null; }
    if (terminado) mostrarMiniatura(); else acordar();
  }

  var agendado = 0;
  function agendarRemontagem() {
    if (agendado) return;
    agendado = requestAnimationFrame(function () { agendado = 0; remontar(); });
  }

  function comecar() {
    if (L) return;
    iniciar();
    chave = L.W + 'x' + L.H + ':' + L.B.map(Math.round).join(',');
    if (window.ResizeObserver) new ResizeObserver(agendarRemontagem).observe(pagina);
    pagina.addEventListener('toggle', agendarRemontagem, true);
  }

  // espera as fontes para medir os textos no tamanho certo
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(comecar);
  window.addEventListener('load', comecar);
  setTimeout(comecar, 1500);
})();
