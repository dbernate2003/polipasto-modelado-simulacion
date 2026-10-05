/* mecanismo.js
 * Dibujo del polipasto (canvas) y de los diagramas de cuerpo libre.
 *
 * Geometria del aparejo (n ramales, extremo muerto en el bloque fijo):
 *   los tramos de cuerda estan en s_1 ... s_n y el cabo libre en s_(n+1),
 *   separados un diametro de polea (2R). La polea p (p = 1..n) une los tramos
 *   p y p+1: las impares son del bloque movil y las pares del bloque fijo.
 *
 * Cinematica de la cuerda (se ve con las marcas que corren por ella):
 *   el tramo 1 no se mueve; el tramo j par sube a j*v; el tramo j impar baja a (j-1)*v;
 *   el cabo libre baja a n*v = v_c; la polea p gira con velocidad periferica p*v.
 * Todo sale de la posicion x que entrega el modelo: no hay fisica propia aqui.
 */
(function (global) {
  'use strict';

  const NOMBRES = ['--fondo', '--superficie', '--superficie-2', '--hundido', '--tinta', '--tenue', '--linea',
    '--linea-fuerte', '--amarillo', '--tension', '--peso', '--neta', '--cinematica', '--reaccion', '--cuerda',
    '--cuerda-marca', '--acero', '--acero-oscuro', '--excedido', '--letra', '--trabajo'];

  function colores() {
    const cs = getComputedStyle(document.documentElement);
    const c = {};
    NOMBRES.forEach(function (n) { c[n.slice(2)] = cs.getPropertyValue(n).trim(); });
    return c;
  }

  function preparar(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const w = Math.max(1, Math.round(W * dpr)), h = Math.max(1, Math.round(H * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    return { ctx: ctx, W: W, H: H };
  }

  function fmt(v, d) {
    const s = Number(v).toFixed(d);
    return /^-0\.?0*$/.test(s) ? s.slice(1) : s;
  }

  /** Flecha recta de (x1,y1) a (x2,y2) con punta en (x2,y2). */
  function flecha(ctx, x1, y1, x2, y2, color, grosor) {
    const largo = Math.hypot(x2 - x1, y2 - y1);
    if (largo < 0.5) { return; }
    const ux = (x2 - x1) / largo, uy = (y2 - y1) / largo;
    const punta = Math.min(9, Math.max(4, largo * 0.5));
    const ancho = punta * 0.55;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = grosor || 2.5;
    ctx.lineCap = 'round';
    if (largo > punta) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2 - ux * punta * 0.8, y2 - uy * punta * 0.8);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - ux * punta - uy * ancho, y2 - uy * punta + ux * ancho);
    ctx.lineTo(x2 - ux * punta + uy * ancho, y2 - uy * punta - ux * ancho);
    ctx.closePath();
    ctx.fill();
  }

  /** Texto con fondo para que se lea sobre el dibujo. */
  function rotulo(ctx, c, texto, x, y, color, alineacion, peso) {
    ctx.font = (peso || '600') + ' 11.5px ' + c.letra;
    const w = ctx.measureText(texto).width;
    const x0 = alineacion === 'right' ? x - w : (alineacion === 'center' ? x - w / 2 : x);
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = c.superficie;
    ctx.fillRect(x0 - 3, y - 10, w + 6, 14);
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(texto, x0, y);
  }

  /** Posiciones fijas del dibujo para un tamano de lienzo y unos parametros. */
  function geometria(W, H, p) {
    const R = 12;
    const piso = H - 30;
    const yTecho = 22;
    const yF = yTecho + 40;
    const hCarga = 44, wCarga = Math.min(84, 2 * (p.n + 1) * R - 18), hGancho = 22, medioBloque = R + 6;
    const yMmin = yF + 2 * R + 26;
    const esc = (piso - hCarga - hGancho - medioBloque - yMmin) / p.hmax;
    const xRegla = 30;
    const ancho = 2 * R * p.n;
    const cx = Math.max(xRegla + 70 + ancho / 2, (xRegla + 50 + W - 80) / 2);
    const s = function (j) { return cx - ancho / 2 + (j - 1) * 2 * R; };
    return { R: R, piso: piso, yTecho: yTecho, yF: yF, hCarga: hCarga, wCarga: wCarga, hGancho: hGancho,
      medioBloque: medioBloque, esc: esc, xRegla: xRegla, s: s, cx: cx };
  }

  function cuerda(ctx, c, x, yA, yB, desplazamiento) {
    ctx.lineCap = 'butt';
    ctx.strokeStyle = c.cuerda;
    ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(x, yA); ctx.lineTo(x, yB); ctx.stroke();
    // Marcas que viajan con el material de la cuerda
    ctx.strokeStyle = c['cuerda-marca'];
    ctx.globalAlpha = 0.55;
    ctx.setLineDash([3, 9]);
    ctx.lineDashOffset = desplazamiento;
    ctx.beginPath(); ctx.moveTo(x, yA); ctx.lineTo(x, yB); ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    ctx.globalAlpha = 1;
  }

  function polea(ctx, c, x, y, R, angulo, arriba) {
    ctx.fillStyle = c.acero;
    ctx.strokeStyle = c['acero-oscuro'];
    ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(x, y, R + 2.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, R - 3.5, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1.6;
    for (let k = 0; k < 3; k++) {
      const a = angulo + k * 2 * Math.PI / 3;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * 3, y + Math.sin(a) * 3);
      ctx.lineTo(x + Math.cos(a) * (R - 3.5), y + Math.sin(a) * (R - 3.5));
      ctx.stroke();
    }
    ctx.fillStyle = c['acero-oscuro'];
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    // Cuerda abrazando la polea (arriba en las fijas, abajo en las moviles)
    ctx.strokeStyle = c.cuerda;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    if (arriba) { ctx.arc(x, y, R, Math.PI, 2 * Math.PI); } else { ctx.arc(x, y, R, 0, Math.PI); }
    ctx.stroke();
  }

  /**
   * Dibuja el mecanismo en el instante del estado e.
   * op: { fuerzas: bool, marcas: [x_k], mostrarMarcas: bool }
   */
  function dibujarMecanismo(canvas, e, p, op) {
    const g = preparar(canvas);
    const ctx = g.ctx, W = g.W, H = g.H;
    if (W < 120 || H < 200) { return; }
    const c = colores();
    const G = geometria(W, H, p);
    const R = G.R, s = G.s, n = p.n;
    const dx = e.x - p.x0;
    const dPx = dx * G.esc;                       // desplazamiento de la carga en pixeles
    const yCargaInf = G.piso - dx * G.esc;        // base de la carga
    const yCargaSup = yCargaInf - G.hCarga;
    const yM = yCargaSup - G.hGancho - G.medioBloque;
    const cxM = (s(1) + s(n)) / 2;                // centro del bloque movil
    const xLibre = s(n + 1);
    const xOp = xLibre + 34;
    const yMano = G.piso - 1.22 * G.esc;
    const alarma = e.Fop > p.Fmax;

    // --- Piso y techo ---
    ctx.strokeStyle = c['linea-fuerte'];
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(8, G.piso + 0.5); ctx.lineTo(W - 8, G.piso + 0.5); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 12; x < W - 8; x += 9) { ctx.moveTo(x, G.piso + 2); ctx.lineTo(x - 6, G.piso + 8); }
    ctx.stroke();
    ctx.fillStyle = c['acero-oscuro'];
    ctx.fillRect(G.xRegla + 24, G.yTecho - 8, W - G.xRegla - 34, 8);
    ctx.strokeStyle = c['linea-fuerte'];
    ctx.beginPath();
    for (let x = G.xRegla + 28; x < W - 10; x += 9) { ctx.moveTo(x, G.yTecho - 8); ctx.lineTo(x + 6, G.yTecho - 14); }
    ctx.stroke();

    // --- Regla de altura ---
    const yAltura = function (h) { return G.piso - h * G.esc; };
    ctx.strokeStyle = c.tenue;
    ctx.fillStyle = c.tenue;
    ctx.lineWidth = 1;
    ctx.font = '11px ' + c.letra;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.beginPath(); ctx.moveTo(G.xRegla + 0.5, yAltura(0)); ctx.lineTo(G.xRegla + 0.5, yAltura(p.hmax + 0.3)); ctx.stroke();
    for (let h = 0; h <= p.hmax + 1e-9; h += 0.5) {
      const y = Math.round(yAltura(h)) + 0.5;
      const entero = Math.abs(h - Math.round(h)) < 1e-9;
      ctx.beginPath(); ctx.moveTo(G.xRegla - (entero ? 7 : 4), y); ctx.lineTo(G.xRegla, y); ctx.stroke();
      if (entero) { ctx.fillText(String(h), G.xRegla - 10, y); }
    }
    ctx.fillText('m', G.xRegla - 10, yAltura(p.hmax + 0.35));
    // Final de carrera
    const yTope = Math.round(yAltura(p.hmax)) + 0.5;
    ctx.strokeStyle = c.excedido;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(G.xRegla, yTope); ctx.lineTo(cxM + G.wCarga / 2 + 8, yTope); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = c.excedido;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('final de carrera', G.xRegla + 6, yTope - 4);

    // Marcas estroboscopicas (posicion cada 0.5 s): su separacion muestra la velocidad
    if (op.mostrarMarcas && op.marcas) {
      ctx.strokeStyle = c.cinematica;
      ctx.lineWidth = 2;
      op.marcas.forEach(function (xk, k) {
        const y = Math.round(yAltura(xk - p.x0)) + 0.5;
        ctx.globalAlpha = 0.35 + 0.65 * (k + 1) / op.marcas.length;
        ctx.beginPath(); ctx.moveTo(G.xRegla + 4, y); ctx.lineTo(G.xRegla + 16, y); ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }
    // Indicador de la altura actual
    ctx.fillStyle = c.cinematica;
    ctx.beginPath();
    ctx.moveTo(G.xRegla + 1, yCargaInf);
    ctx.lineTo(G.xRegla + 9, yCargaInf - 5);
    ctx.lineTo(G.xRegla + 9, yCargaInf + 5);
    ctx.closePath(); ctx.fill();

    // --- Bloque fijo (placa y enganche al techo) ---
    ctx.strokeStyle = c['acero-oscuro'];
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(G.cx, G.yTecho); ctx.lineTo(G.cx, G.yF - R - 7); ctx.stroke();
    ctx.fillStyle = c.hundido;
    ctx.strokeStyle = c['acero-oscuro'];
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.roundRect(s(1) - 7, G.yF - R - 8, xLibre - s(1) + 14, 2 * R + 14, 4);
    ctx.fill(); ctx.stroke();

    // --- Tramos de cuerda (con marcas que corren a la velocidad del material) ---
    // tramo 1: extremo muerto, quieto; j par: sube j*dx; j impar: baja (j-1)*dx
    cuerda(ctx, c, s(1), G.yF + R + 6, yM, 0);
    for (let j = 2; j <= n; j++) {
      const desp = (j % 2 === 0) ? j * dPx : -(j - 1) * dPx;
      cuerda(ctx, c, s(j), G.yF, yM, desp);
    }
    // cabo libre hasta la mano (baja n*dx) y sobrante hasta el rollo del piso
    cuerda(ctx, c, xLibre, G.yF, yMano, -n * dPx);
    cuerda(ctx, c, xLibre, yMano, G.piso - 4, -n * dPx);
    // Anclaje del extremo muerto
    ctx.fillStyle = c['acero-oscuro'];
    ctx.beginPath(); ctx.arc(s(1), G.yF + R + 6, 3.2, 0, Math.PI * 2); ctx.fill();

    // Rollo de cabo recogido (crece con L_c)
    const vueltas = 1 + Math.min(7, Math.floor(e.Lc / 1.2));
    ctx.strokeStyle = c.cuerda;
    ctx.lineWidth = 2.2;
    for (let k = 0; k < vueltas; k++) {
      ctx.beginPath();
      ctx.ellipse(xLibre + 13, G.piso - 3 - k * 2.6, 12, 3.2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // --- Bloque movil (amarillo de seguridad) ---
    ctx.fillStyle = c.amarillo;
    ctx.strokeStyle = c.tinta;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.roundRect(s(1) - 7, yM - R - 7, s(n) - s(1) + 14, 2 * R + 14, 5);
    ctx.fill(); ctx.stroke();

    // --- Poleas: impares en el bloque movil, pares en el fijo ---
    for (let q = 1; q <= n; q++) {
      const xq = (s(q) + s(q + 1)) / 2;
      const giro = q * dPx / R;           // velocidad periferica q*v
      if (q % 2 === 0) { polea(ctx, c, xq, G.yF, R, giro, true); }
      else { polea(ctx, c, xq, yM, R, -giro, false); }
    }

    // --- Gancho y carga ---
    ctx.strokeStyle = c.tinta;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    const yGancho = yCargaSup - 9;
    ctx.beginPath(); ctx.moveTo(cxM, yM + R + 7); ctx.lineTo(cxM, yGancho - 6); ctx.stroke();
    ctx.beginPath(); ctx.arc(cxM - 4, yGancho - 1, 5, -0.2, Math.PI * 1.1, false); ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = c['acero-oscuro'];
    ctx.beginPath();
    ctx.moveTo(cxM - 4, yGancho + 4); ctx.lineTo(cxM - G.wCarga / 2 + 8, yCargaSup);
    ctx.moveTo(cxM - 4, yGancho + 4); ctx.lineTo(cxM + G.wCarga / 2 - 8, yCargaSup);
    ctx.stroke();
    ctx.fillStyle = c.acero;
    ctx.strokeStyle = c['acero-oscuro'];
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(cxM - G.wCarga / 2, yCargaSup, G.wCarga, G.hCarga, 3);
    ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(cxM - G.wCarga / 2 + 4, yCargaSup + 4); ctx.lineTo(cxM + G.wCarga / 2 - 4, yCargaInf - 4);
    ctx.moveTo(cxM + G.wCarga / 2 - 4, yCargaSup + 4); ctx.lineTo(cxM - G.wCarga / 2 + 4, yCargaInf - 4);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = c.tinta;
    ctx.font = '600 13px ' + c.letra;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fmt(p.m, 0) + ' kg', cxM, yCargaSup + G.hCarga / 2);

    // Numeros de los ramales que sostienen el bloque movil
    ctx.font = '600 10.5px ' + c.letra;
    const yNum = (G.yF + R + 8 + yM - R - 8) / 2;
    if (yM - G.yF > 70) {
      for (let j = 1; j <= n; j++) {
        ctx.fillStyle = c.superficie;
        ctx.beginPath(); ctx.arc(s(j), yNum, 7.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = c.tension; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.fillStyle = c.tension;
        ctx.fillText(String(j), s(j), yNum + 0.5);
      }
    }

    // --- Operario a escala (1.75 m) ---
    const alto = 1.75 * G.esc;
    const yHombro = G.piso - 1.45 * G.esc, yCadera = G.piso - 0.92 * G.esc;
    const rCabeza = 0.11 * G.esc;
    const colorCuerpo = c.tinta;
    ctx.strokeStyle = colorCuerpo;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(xOp, yHombro); ctx.lineTo(xOp + 2, yCadera);
    ctx.moveTo(xOp + 2, yCadera); ctx.lineTo(xOp - 6, G.piso - 2);
    ctx.moveTo(xOp + 2, yCadera); ctx.lineTo(xOp + 10, G.piso - 2);
    ctx.stroke();
    ctx.fillStyle = colorCuerpo;
    ctx.beginPath(); ctx.arc(xOp + 1, G.piso - alto + rCabeza, rCabeza, 0, Math.PI * 2); ctx.fill();
    // Brazos hasta la mano sobre el cabo
    ctx.strokeStyle = alarma ? c.excedido : colorCuerpo;
    ctx.beginPath();
    ctx.moveTo(xOp, yHombro + 3);
    ctx.lineTo((xOp + xLibre) / 2 + 2, (yHombro + yMano) / 2 + 6);
    ctx.lineTo(xLibre + 3, yMano);
    ctx.stroke();
    ctx.fillStyle = alarma ? c.excedido : colorCuerpo;
    ctx.beginPath(); ctx.arc(xLibre + 2, yMano, 4.5, 0, Math.PI * 2); ctx.fill();
    if (alarma) {
      ctx.strokeStyle = c.excedido;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(xLibre + 2, yMano, 9, 0, Math.PI * 2); ctx.stroke();
      rotulo(ctx, c, 'F_op > ' + fmt(p.Fmax, 0) + ' N', Math.min(xLibre + 8, W - 92), G.yF + R + 34, c.excedido, 'left');
    }

    // --- Fuerzas sobre la carga (DCL junto al cuerpo, a escala: M*g mide 48 px) ---
    if (op.fuerzas) {
      const k = 48 / (p.M * p.g);
      const yc0 = yCargaSup + G.hCarga / 2;
      const xBorde = cxM - G.wCarga / 2;
      const xT = xBorde - 10, xA = xBorde - 21, xG = xBorde - 32;
      ctx.strokeStyle = c['linea-fuerte'];
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(xG - 4, yc0 + 0.5); ctx.lineTo(xBorde, yc0 + 0.5); ctx.stroke();
      ctx.setLineDash([]);
      flecha(ctx, xT, yc0, xT, yc0 - n * e.T * k, c.tension, 3);
      flecha(ctx, xG, yc0, xG, yc0 + p.M * p.g * k, c.peso, 3);
      if (Math.abs(e.a) > 1e-9) {
        // la fuerza neta es pequena frente al peso: se dibuja 20 veces mas larga
        flecha(ctx, xA, yc0, xA, yc0 - p.M * e.a * k * 20, c.neta, 3);
      }
      // Fuerza del operario sobre el cabo (a la derecha del cabo, junto al brazo)
      flecha(ctx, xLibre + 9, yMano + 6, xLibre + 9, yMano + 6 + e.Fop * k, alarma ? c.excedido : c.tension, 2.5);
    }
  }

  /**
   * Diagramas de cuerpo libre ampliados, con flechas a escala dentro de cada diagrama.
   * cuerpo: 'carga' | 'fijo' | 'polea' | 'operario'
   */
  function dibujarDCL(canvas, cuerpo, e, p) {
    const g = preparar(canvas);
    const ctx = g.ctx, W = g.W, H = g.H;
    if (W < 120 || H < 120) { return; }
    const c = colores();
    const n = p.n;
    const cx = W * 0.42, cy = H / 2;
    ctx.lineJoin = 'round';

    if (cuerpo === 'carga') {
      const bw = 104, bh = 64;
      const xc = Math.max(96, Math.min(W * 0.42, W - 228));
      const Mg = p.M * p.g, nT = n * e.T, neta = nT - Mg;
      const k = (H / 2 - bh / 2 - 26) / Math.max(Mg, nT);
      // cuerpo aislado: bloque movil + carga
      ctx.fillStyle = c.amarillo; ctx.strokeStyle = c.tinta; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.roundRect(xc - bw / 2, cy - bh / 2, bw, 22, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = c.acero; ctx.strokeStyle = c['acero-oscuro'];
      ctx.beginPath(); ctx.roundRect(xc - bw / 2 + 10, cy - bh / 2 + 26, bw - 20, bh - 26, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = c.tinta; ctx.font = '600 12px ' + c.letra; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('M = ' + fmt(p.M, 0) + ' kg', xc, cy + 13);
      // n tensiones hacia arriba, una por ramal
      for (let j = 0; j < n; j++) {
        const xj = xc - bw / 2 + 12 + j * (bw - 24) / Math.max(1, n - 1);
        flecha(ctx, xj, cy - bh / 2, xj, cy - bh / 2 - e.T * k, c.tension, 2.4);
      }
      flecha(ctx, xc, cy + bh / 2, xc, cy + bh / 2 + Mg * k, c.peso, 3);
      // fuerza neta, 20 veces mas larga porque es pequena frente al peso
      if (Math.abs(neta) > 1e-6) {
        const xn = xc - bw / 2 - 16;
        flecha(ctx, xn, cy, xn, cy - neta * k * 20, c.neta, 3);
      }
      // leyenda con los valores
      const xl = xc + bw / 2 + 16;
      let yl = cy - bh / 2 - 6;
      rotulo(ctx, c, n + ' × T = ' + fmt(nT, 1) + ' N', xl, yl, c.tension, 'left'); yl += 17;
      rotulo(ctx, c, 'T = ' + fmt(e.T, 2) + ' N por ramal', xl, yl, c.tension, 'left', '400'); yl += 22;
      rotulo(ctx, c, 'M·g = ' + fmt(Mg, 1) + ' N', xl, yl, c.peso, 'left'); yl += 22;
      rotulo(ctx, c, Math.abs(neta) > 1e-6 ? 'M·a = ' + fmt(neta, 2) + ' N' : 'M·a = 0 (equilibrio)', xl, yl, c.neta, 'left'); yl += 17;
      if (Math.abs(neta) > 1e-6) { rotulo(ctx, c, 'flecha verde ×20', xl, yl, c.neta, 'left', '400'); }
    } else if (cuerpo === 'fijo') {
      const bw = Math.max(110, 22 * (n + 1)), bh = 30;
      const Rr = e.R, k = (H / 2 - bh / 2 - 30) / Rr;
      ctx.fillStyle = c.acero; ctx.strokeStyle = c['acero-oscuro']; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = c.tinta; ctx.font = '600 12px ' + c.letra; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Bloque fijo', cx, cy);
      flecha(ctx, cx, cy - bh / 2, cx, cy - bh / 2 - Rr * k, c.reaccion, 3.2);
      for (let j = 0; j <= n; j++) {
        const xj = cx - bw / 2 + 10 + j * (bw - 20) / n;
        flecha(ctx, xj, cy + bh / 2, xj, cy + bh / 2 + e.T * k, j === n ? c.trabajo : c.tension, 2.4);
      }
      rotulo(ctx, c, 'R = ' + fmt(Rr, 1) + ' N (techo)', cx + 10, cy - bh / 2 - 22, c.reaccion, 'left');
      rotulo(ctx, c, n + ' ramales + cabo libre: ' + (n + 1) + ' × ' + fmt(e.T, 2) + ' N', cx - bw / 2, cy + bh / 2 + e.T * k + 18, c.tension, 'left');
    } else if (cuerpo === 'polea') {
      const r = 38, k = (H / 2 - 30) / (2 * e.T);
      ctx.fillStyle = c.acero; ctx.strokeStyle = c['acero-oscuro']; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = c.cuerda; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI); ctx.stroke();
      ctx.fillStyle = c['acero-oscuro']; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
      flecha(ctx, cx - r, cy, cx - r, cy + e.T * k, c.tension, 2.6);
      flecha(ctx, cx + r, cy, cx + r, cy + e.T * k, c.tension, 2.6);
      flecha(ctx, cx, cy - 6, cx, cy - 6 - 2 * e.T * k, c.reaccion, 3);
      // brazos de palanca
      ctx.strokeStyle = c.tenue; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke(); ctx.setLineDash([]);
      rotulo(ctx, c, 'T', cx - r - 16, cy + e.T * k / 2, c.tension, 'left');
      rotulo(ctx, c, 'T', cx + r + 6, cy + e.T * k / 2, c.tension, 'left');
      rotulo(ctx, c, 'r', cx - r / 2 - 3, cy - 4, c.tenue, 'left', '400');
      rotulo(ctx, c, 'r', cx + r / 2 - 3, cy - 4, c.tenue, 'left', '400');
      rotulo(ctx, c, 'eje: 2T = ' + fmt(2 * e.T, 1) + ' N', cx + 10, cy - 2 * e.T * k + 4, c.reaccion, 'left');
      rotulo(ctx, c, 'T·r − T·r = 0', cx + r + 18, cy + 30, c.tinta, 'left');
    } else if (cuerpo === 'operario') {
      const k = (H - 70) / Math.max(e.Fop, p.Fmax) / 2;
      const yS = 34, yI = H - 34;
      ctx.strokeStyle = c.cuerda; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cx, yS); ctx.lineTo(cx, yI); ctx.stroke();
      flecha(ctx, cx - 14, cy, cx - 14, cy - e.T * k, c.tension, 3);
      const alarma = e.Fop > p.Fmax;
      flecha(ctx, cx + 14, cy, cx + 14, cy + e.Fop * k, alarma ? c.excedido : c.trabajo, 3);
      // limite del operario a la misma escala
      ctx.strokeStyle = c.excedido; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx + 2, cy + p.Fmax * k); ctx.lineTo(cx + 60, cy + p.Fmax * k); ctx.stroke(); ctx.setLineDash([]);
      rotulo(ctx, c, 'T = ' + fmt(e.T, 2) + ' N (cuerda)', cx - 20, cy - e.T * k / 2, c.tension, 'right');
      rotulo(ctx, c, 'F_op = ' + fmt(e.Fop, 2) + ' N', cx + 22, cy + e.Fop * k / 2, alarma ? c.excedido : c.trabajo, 'left');
      rotulo(ctx, c, 'límite ' + fmt(p.Fmax, 0) + ' N', cx + 64, cy + p.Fmax * k + 4, c.excedido, 'left', '400');
      ctx.fillStyle = c.tenue; ctx.font = '11.5px ' + c.letra; ctx.textAlign = 'center';
      ctx.fillText('cabo libre aislado', cx, yS - 10);
    }
  }

  global.PolipastoMecanismo = Object.freeze({ dibujarMecanismo: dibujarMecanismo, dibujarDCL: dibujarDCL, geometria: geometria });
})(window);
