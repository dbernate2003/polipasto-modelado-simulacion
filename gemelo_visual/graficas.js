/* graficas.js
 * Graficas temporales tipo osciloscopio, dibujadas en canvas sin librerias
 * externas (funciona sin internet). Cada grafica tiene dos capas:
 *   - base: ejes, fases, curva de referencia, limite y curvas (se redibuja solo
 *     cuando cambian los datos, el tamano o el tema);
 *   - capa: el cursor vertical del instante actual (se redibuja en cada cuadro).
 * Arrastrar sobre la grafica mueve el tiempo de toda la aplicacion.
 */
(function (global) {
  'use strict';

  function css(nombre) {
    return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim() || '#888';
  }

  function crear(etiqueta, clase) {
    const e = document.createElement(etiqueta);
    if (clase) { e.className = clase; }
    return e;
  }

  /** Marcas de eje "redondas" (1, 2 o 5 por potencia de 10). */
  function marcasBonitas(min, max, cantidad) {
    const span = max - min;
    if (!(span > 0)) { return { valores: [min], paso: 1 }; }
    const bruto = span / Math.max(1, cantidad);
    const mag = Math.pow(10, Math.floor(Math.log10(bruto)));
    const norm = bruto / mag;
    const paso = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    const valores = [];
    for (let v = Math.ceil(min / paso - 1e-9) * paso; v <= max + paso * 1e-9; v += paso) {
      valores.push(Math.abs(v) < paso * 1e-9 ? 0 : v);
    }
    return { valores: valores, paso: paso };
  }

  function fmtLimite(u) { return Number(u).toFixed(0) + ' N'; }

  function decimales(paso) {
    return Math.max(0, Math.min(4, Math.ceil(-Math.log10(paso) - 1e-9)));
  }

  /** Valor de una columna en el instante t (interpolacion lineal, tiempos crecientes). */
  function interpolar(datos, campo, t) {
    const ts = datos.t, ys = datos[campo];
    const N = datos.N;
    if (!ys || N === 0) { return NaN; }
    if (t <= ts[0]) { return ys[0]; }
    if (t >= ts[N - 1]) { return ys[N - 1]; }
    let lo = 0, hi = N - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (ts[mid] <= t) { lo = mid; } else { hi = mid; }
    }
    const f = (t - ts[lo]) / (ts[hi] - ts[lo]);
    return ys[lo] + f * (ys[hi] - ys[lo]);
  }

  class Grafica {
    constructor(host, opciones) {
      this.host = host;
      this.op = opciones || {};
      host.classList.add('grafica');
      this.cab = crear('div', 'grafica-cab');
      this.lienzo = crear('div', 'grafica-lienzo');
      this.base = crear('canvas');
      this.capa = crear('canvas');
      this.lienzo.appendChild(this.base);
      this.lienzo.appendChild(this.capa);
      host.appendChild(this.cab);
      host.appendChild(this.lienzo);
      this.def = null;
      this.datos = null;
      this.ref = null;
      this.p = null;
      this.mostrarRef = true;
      this.sucio = true;
      this.margen = { izq: 48, der: 10, arr: 8, aba: 17 };

      this.observador = new ResizeObserver(() => {
        this.sucio = true;
        if (this.op.alCambiar) { this.op.alCambiar(); }
      });
      this.observador.observe(this.lienzo);

      let arrastrando = false;
      const mover = (ev) => {
        const r = this.lienzo.getBoundingClientRect();
        if (this.op.alArrastrar) { this.op.alArrastrar(this.tDeX(ev.clientX - r.left)); }
      };
      this.lienzo.addEventListener('pointerdown', (ev) => {
        arrastrando = true;
        this.lienzo.setPointerCapture(ev.pointerId);
        if (this.op.alEmpezar) { this.op.alEmpezar(); }
        mover(ev);
      });
      this.lienzo.addEventListener('pointermove', (ev) => { if (arrastrando) { mover(ev); } });
      const soltar = () => { arrastrando = false; };
      this.lienzo.addEventListener('pointerup', soltar);
      this.lienzo.addEventListener('pointercancel', soltar);
    }

    configurar(cfg) {
      this.def = cfg.def;
      this.datos = cfg.datos;
      this.ref = cfg.ref || null;
      this.p = cfg.p;
      this.mostrarRef = cfg.mostrarRef !== false;
      this.sucio = true;
    }

    destruir() {
      this.observador.disconnect();
      this.host.remove();
    }

    tamano() {
      return { W: this.lienzo.clientWidth, H: this.lienzo.clientHeight };
    }

    preparar(canvas) {
      const dpr = window.devicePixelRatio || 1;
      const s = this.tamano();
      const w = Math.max(1, Math.round(s.W * dpr)), h = Math.max(1, Math.round(s.H * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, s.W, s.H);
      return { ctx: ctx, W: s.W, H: s.H };
    }

    tFin() { return this.p ? this.p.t_fin : 20; }

    xDeT(t) {
      const W = this.tamano().W, m = this.margen;
      return m.izq + (t / this.tFin()) * (W - m.izq - m.der);
    }

    tDeX(x) {
      const W = this.tamano().W, m = this.margen;
      const t = (x - m.izq) / Math.max(1, W - m.izq - m.der) * this.tFin();
      return Math.min(this.tFin(), Math.max(0, t));
    }

    yDeV(v) {
      const H = this.tamano().H, m = this.margen;
      return m.arr + (1 - (v - this.yMin) / (this.yMax - this.yMin)) * (H - m.arr - m.aba);
    }

    /** Calcula el rango vertical con los datos visibles. */
    rango() {
      let min = Infinity, max = -Infinity;
      const incluir = (datos) => {
        this.def.series.forEach((s) => {
          const arr = datos[s.campo];
          if (!arr) { return; }
          for (let i = 0; i < datos.N; i++) {
            const v = arr[i];
            if (Number.isFinite(v)) { if (v < min) { min = v; } if (v > max) { max = v; } }
          }
        });
      };
      incluir(this.datos);
      if (this.ref && this.mostrarRef) { incluir(this.ref.datos); }
      this.umbralVisible = false;
      if (this.def.umbral) {
        const u = this.def.umbral.valor(this.p);
        if (max >= 0.55 * u) { max = Math.max(max, u); min = Math.min(min, u); this.umbralVisible = true; }
      }
      if (!Number.isFinite(min)) { min = 0; max = 1; }
      let span = max - min;
      if (span < 1e-9) { span = Math.max(Math.abs(max) * 0.2, 1e-3); min -= span / 2; max += span / 2; }
      this.yMin = min - span * 0.12;
      this.yMax = max + span * 0.12;
    }

    dibujarBase() {
      if (!this.def || !this.datos) { return; }
      const g = this.preparar(this.base);
      const ctx = g.ctx, W = g.W, H = g.H, m = this.margen;
      if (W < 20 || H < 20) { return; }
      this.rango();
      const x0 = m.izq, x1 = W - m.der, y0 = m.arr, y1 = H - m.aba;
      const tenue = css('--tenue'), linea = css('--linea'), letra = css('--letra');

      // Fases de arranque y frenado (bandas amarillas suaves)
      if (this.p) {
        ctx.fillStyle = css('--amarillo-suave');
        [[this.p.t0, this.p.t1], [this.p.tb, this.p.t3]].forEach((f) => {
          const a = this.xDeT(f[0]), b = this.xDeT(f[1]);
          ctx.fillRect(a, y0, Math.max(1, b - a), y1 - y0);
        });
      }

      // Rejilla y etiquetas
      ctx.font = '11px ' + letra;
      ctx.lineWidth = 1;
      const marcas = marcasBonitas(this.yMin, this.yMax, Math.max(2, Math.floor((y1 - y0) / 30)));
      const dec = decimales(marcas.paso);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      marcas.valores.forEach((v) => {
        const y = Math.round(this.yDeV(v)) + 0.5;
        if (y < y0 - 1 || y > y1 + 1) { return; }
        ctx.strokeStyle = linea;
        ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
        ctx.fillStyle = tenue;
        ctx.fillText(v.toFixed(dec), x0 - 6, y);
      });
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      for (let t = 0; t <= this.tFin() + 1e-9; t += 2) {
        const x = Math.round(this.xDeT(t)) + 0.5;
        ctx.strokeStyle = linea;
        ctx.globalAlpha = 0.6;
        ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = tenue;
        ctx.fillText(t === this.tFin() ? t + ' s' : String(t), Math.min(x, W - 14), H - 4);
      }
      // Linea de cero si esta dentro del rango
      if (this.yMin < 0 && this.yMax > 0) {
        const y = Math.round(this.yDeV(0)) + 0.5;
        ctx.strokeStyle = css('--linea-fuerte');
        ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
      }
      // Unidad
      ctx.fillStyle = tenue;
      ctx.textAlign = 'left';
      ctx.fillText('[' + this.def.unidad + ']', x0 + 4, y0 + 11);

      // Curva de referencia (gris, a trazos)
      if (this.ref && this.mostrarRef) {
        this.def.series.forEach((s) => {
          this.trazar(ctx, this.ref.datos, s.campo, css('--referencia'), 2, [5, 4]);
        });
      }

      // Limite fisico
      if (this.def.umbral) {
        const u = this.def.umbral.valor(this.p);
        ctx.fillStyle = css('--excedido');
        ctx.font = '11px ' + letra;
        ctx.textAlign = 'right';
        if (this.umbralVisible) {
          const y = Math.round(this.yDeV(u)) + 0.5;
          ctx.strokeStyle = css('--excedido');
          ctx.setLineDash([7, 4]);
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillText(this.def.umbral.etiqueta(this.p), x1 - 4, y - 4);
        } else {
          const txt = (H < 110 ? 'Límite ' + fmtLimite(u) : this.def.umbral.etiqueta(this.p)) + ' (fuera de escala, arriba)';
          const w = ctx.measureText(txt).width;
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = css('--superficie-2');
          ctx.fillRect(x1 - w - 8, y0 + 1, w + 6, 14);
          ctx.globalAlpha = 1;
          ctx.fillStyle = css('--excedido');
          ctx.fillText(txt, x1 - 4, y0 + 12);
        }
      }

      // Curvas
      this.def.series.forEach((s) => {
        this.trazar(ctx, this.datos, s.campo, css(s.color), s.grosor || 2.2, s.trazos ? [6, 4] : null);
      });
      this.sucio = false;
    }

    trazar(ctx, datos, campo, color, grosor, trazos) {
      const arr = datos[campo];
      if (!arr) { return; }
      ctx.save();
      ctx.beginPath();
      ctx.rect(this.margen.izq, 0, this.tamano().W - this.margen.izq - this.margen.der, this.tamano().H);
      ctx.clip();
      ctx.strokeStyle = color;
      ctx.lineWidth = grosor;
      ctx.lineJoin = 'round';
      ctx.setLineDash(trazos || []);
      ctx.beginPath();
      let empezado = false;
      for (let i = 0; i < datos.N; i++) {
        const v = arr[i];
        if (!Number.isFinite(v)) { empezado = false; continue; }
        const x = this.xDeT(datos.t[i]), y = this.yDeV(v);
        if (!empezado) { ctx.moveTo(x, y); empezado = true; } else { ctx.lineTo(x, y); }
      }
      ctx.stroke();
      ctx.restore();
    }

    /** Cursor vertical del instante t con un punto sobre cada curva. */
    dibujarCursor(t, valores) {
      if (this.sucio) { this.dibujarBase(); }
      if (!this.def) { return; }
      const g = this.preparar(this.capa);
      const ctx = g.ctx, H = g.H, m = this.margen;
      const x = Math.round(this.xDeT(t)) + 0.5;
      ctx.strokeStyle = css('--tinta');
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x, m.arr - 4); ctx.lineTo(x, H - m.aba); ctx.stroke();
      // Pestana superior del cursor
      ctx.fillStyle = css('--tinta');
      ctx.beginPath(); ctx.moveTo(x - 5, 0); ctx.lineTo(x + 5, 0); ctx.lineTo(x, 6); ctx.closePath(); ctx.fill();
      this.def.series.forEach((s) => {
        const v = valores[s.campo];
        if (!Number.isFinite(v)) { return; }
        const y = this.yDeV(v);
        if (y < 0 || y > H) { return; }
        ctx.fillStyle = css(s.color);
        ctx.strokeStyle = css('--superficie');
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      });
    }

    /** Copia las dos capas en otro contexto (para exportar PNG). */
    copiarEn(ctx, x, y) {
      const s = this.tamano();
      ctx.drawImage(this.base, x, y, s.W, s.H);
      ctx.drawImage(this.capa, x, y, s.W, s.H);
    }
  }

  global.PolipastoGraficas = Object.freeze({ Grafica: Grafica, interpolar: interpolar, css: css });
})(window);
