/* modelo.js
 * Modelo del polipasto manual: las MISMAS ecuaciones que solucion_analitica.m
 * y que el diagrama de Simulink (Fase I y Fase II).
 *
 *   Restriccion:  x = x0 + L_c/n,  v = v_c/n,  a = a_c/n
 *   Newton:       n*T - M*g = M*a   ->  T = M*(g + a)/n
 *   Cabo libre:   F_op = T
 *   Bloque fijo:  R = (n + 1)*T
 *   Potencia:     P = F_op * v_c
 *   Energia:      W_op = M*g*(x - x0) + 0.5*M*v^2   (trabajo-energia, exacto en el modelo ideal)
 *
 * La entrada a_c(t) es constante por tramos (4 escalones), asi que la solucion
 * es exacta: velocidad lineal por tramos y posicion cuadratica por tramos.
 * No se usa ningun integrador numerico: el simulador no puede "desviarse" del modelo.
 */
(function (global) {
  'use strict';

  /** Parametros fijos (iguales a derivados_polipasto.m). */
  const FIJOS = Object.freeze({
    mb: 5,        // masa del bloque movil [kg]
    g: 9.81,      // gravedad [m/s^2]
    t0: 1,        // reposo inicial [s]
    tc: 14,       // duracion nominal del crucero [s]
    x0: 0,        // altura inicial [m]
    hmax: 6,      // final de carrera [m]
    Fmax: 300,    // fuerza maxima del operario [N]
    t_fin: 20,    // tiempo de simulacion [s]
    dt_out: 0.01  // paso de salida del CSV [s]
  });

  /** Parametros que cambian los sliders (caso nominal). */
  const NOMINAL = Object.freeze({ m: 20, n: 4, Vc: 0.6, ta: 1 });

  /** Rangos permitidos: fuera de ellos el sistema seria fisicamente imposible o fuera de catalogo. */
  const RANGOS = Object.freeze({
    m:  { min: 10,  max: 100, paso: 1,    unidad: 'kg',  nombre: 'La masa de la carga' },
    Vc: { min: 0.1, max: 1.0, paso: 0.01, unidad: 'm/s', nombre: 'La velocidad del cabo' },
    ta: { min: 0.2, max: 2.0, paso: 0.05, unidad: 's',   nombre: 'El tiempo de arranque y frenado' },
    n:  { valores: [2, 4, 6], unidad: '-', nombre: 'Ramales' }
  });

  /** Columnas del CSV, en el mismo orden que exporta Simulink (exportar_csv.m). */
  const COLUMNAS = Object.freeze([
    { campo: 't',      encabezado: 't [s]' },
    { campo: 'x',      encabezado: 'x [m]' },
    { campo: 'v',      encabezado: 'v [m/s]' },
    { campo: 'a',      encabezado: 'a [m/s^2]' },
    { campo: 'Lc',     encabezado: 'L_c [m]' },
    { campo: 'vc',     encabezado: 'v_c [m/s]' },
    { campo: 'T',      encabezado: 'T [N]' },
    { campo: 'Fop',    encabezado: 'F_op [N]' },
    { campo: 'R',      encabezado: 'R_techo [N]' },
    { campo: 'P',      encabezado: 'P [W]' },
    { campo: 'Wop',    encabezado: 'W_op [J]' },
    { campo: 'E',      encabezado: 'E_mec [J]' },
    { campo: 'fd',     encabezado: 'factor_dinamico [-]' },
    { campo: 'alarma', encabezado: 'alarma_Fop [-]' }
  ]);

  function limitar(valor, min, max) { return Math.min(max, Math.max(min, valor)); }

  /**
   * Normaliza una entrada de parametros a los rangos permitidos.
   * Devuelve { p, ajustes } donde ajustes explica cada valor corregido.
   */
  function normalizar(entrada) {
    const p = Object.assign({}, NOMINAL, entrada);
    const ajustes = [];
    ['m', 'Vc', 'ta'].forEach(function (k) {
      const r = RANGOS[k];
      let v = Number(p[k]);
      if (!Number.isFinite(v)) { v = NOMINAL[k]; }
      const c = limitar(v, r.min, r.max);
      if (c !== v) {
        ajustes.push('Se ajustó ' + r.nombre.toLowerCase() + ' a ' + c + ' ' + r.unidad + ': el rango permitido es ' + r.min + ' a ' + r.max + ' ' + r.unidad + '.');
      }
      p[k] = c;
    });
    let n = Math.round(Number(p.n));
    if (RANGOS.n.valores.indexOf(n) < 0) {
      const cercano = RANGOS.n.valores.reduce(function (a, b) { return Math.abs(b - n) < Math.abs(a - n) ? b : a; });
      ajustes.push('n = ' + p.n + ' no es válido; se usó n = ' + cercano + ' (con este aparejo solo 2, 4 o 6).');
      n = cercano;
    }
    p.n = n;
    return { p: p, ajustes: ajustes };
  }

  /**
   * Calcula los parametros derivados (igual que derivados_polipasto.m),
   * incluido el final de carrera con frenado anticipado (decision D13).
   */
  function derivar(entrada) {
    const base = normalizar(entrada);
    const p = Object.assign({}, FIJOS, base.p);
    p.M = p.m + p.mb;
    p.A = p.Vc / p.ta;
    p.t1 = p.t0 + p.ta;
    p.tCrucero = Math.min(p.tc, p.n * (p.hmax - p.x0) / p.Vc - p.ta);
    p.tb = p.t1 + p.tCrucero;
    p.t3 = p.tb + p.ta;
    p.topeActivo = p.tCrucero < p.tc - 1e-12;
    p.ajustes = base.ajustes;
    // Comprobaciones fisicas (las mismas assert de MATLAB)
    p.errores = [];
    if (p.A / p.n >= p.g) { p.errores.push('Con A/n >= g la cuerda se aflojaria al frenar (T <= 0).'); }
    if (p.tCrucero < 0) { p.errores.push('El arranque es demasiado largo para la altura disponible.'); }
    if (p.t3 > p.t_fin) { p.errores.push('El perfil no cabe en los 20 s de simulacion.'); }
    return p;
  }

  /** Estado completo del sistema en el instante t (solucion exacta por tramos). */
  function evaluar(t, p) {
    const cambios = [p.t0, p.t1, p.tb, p.t3];
    const saltos = [p.A, -p.A, -p.A, p.A];
    let ac = 0, vc = 0, Lc = 0;
    for (let k = 0; k < 4; k++) {
      if (t >= cambios[k]) {
        const tau = t - cambios[k];
        ac += saltos[k];
        vc += saltos[k] * tau;
        Lc += 0.5 * saltos[k] * tau * tau;
      }
    }
    // Limpia el ruido de redondeo de la suma de tramos (p. ej. 1e-17 en vez de 0)
    if (Math.abs(ac) < 1e-12) { ac = 0; }
    if (Math.abs(vc) < 1e-12) { vc = 0; }
    const n = p.n, M = p.M, g = p.g;
    const a = ac / n, v = vc / n, dx = Lc / n, x = p.x0 + dx;
    const T = M * (g + a) / n;
    const Ep = M * g * dx;
    const Ec = 0.5 * M * v * v;
    return {
      t: t, ac: ac, vc: vc, Lc: Lc,
      a: a, v: v, x: x, dx: dx,
      T: T, Fop: T, R: (n + 1) * T,
      P: T * vc,
      Ep: Ep, Ec: Ec, E: Ep + Ec, Wop: Ep + Ec,
      fd: 1 + a / g,
      alarma: T > p.Fmax ? 1 : 0
    };
  }

  /** Fase del movimiento en el instante t. */
  function fase(t, p) {
    if (t < p.t0) { return 'Reposo inicial'; }
    if (t < p.t1) { return 'Arranque'; }
    if (t < p.tb) { return 'Velocidad constante'; }
    if (t < p.t3) { return 'Frenado'; }
    return 'Reposo final';
  }

  /** Serie temporal completa (misma malla que el CSV: 0 a t_fin cada dt). */
  function serie(p, dt) {
    dt = dt || p.dt_out;
    const N = Math.round(p.t_fin / dt) + 1;
    const out = { N: N };
    COLUMNAS.forEach(function (c) { out[c.campo] = new Float64Array(N); });
    out.Ep = new Float64Array(N); out.Ec = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const t = Math.round(i * dt * 1e9) / 1e9;
      const e = evaluar(t, p);
      COLUMNAS.forEach(function (c) { out[c.campo][i] = e[c.campo]; });
      out.Ep[i] = e.Ep; out.Ec[i] = e.Ec;
    }
    return out;
  }

  /** Resumen de una corrida para los escenarios y la validacion. */
  function resumen(p) {
    const s = serie(p);
    let FopMax = -Infinity, FopMin = Infinity, Pmax = -Infinity, Rmax = -Infinity;
    for (let i = 0; i < s.N; i++) {
      if (s.Fop[i] > FopMax) { FopMax = s.Fop[i]; }
      if (s.Fop[i] < FopMin) { FopMin = s.Fop[i]; }
      if (s.P[i] > Pmax) { Pmax = s.P[i]; }
      if (s.R[i] > Rmax) { Rmax = s.R[i]; }
    }
    // Pico exacto de F_op y P (en t1 exacto, que la malla puede no mostrar)
    const FopPico = p.M * (p.g + p.A / p.n) / p.n;
    const fin = evaluar(p.t_fin, p);
    return {
      FopMax: Math.max(FopMax, FopPico), FopMin: FopMin,
      Freposo: p.M * p.g / p.n,
      Pmax: Math.max(Pmax, FopPico * p.Vc), Pcrucero: p.M * p.g / p.n * p.Vc,
      Rmax: Rmax, xFinal: fin.x, LcFinal: fin.Lc, Wtotal: fin.Wop,
      vMax: p.Vc / p.n, aMax: p.A / p.n, fdMax: 1 + p.A / p.n / p.g,
      alarma: FopPico > p.Fmax
    };
  }

  global.Polipasto = Object.freeze({
    FIJOS: FIJOS, NOMINAL: NOMINAL, RANGOS: RANGOS, COLUMNAS: COLUMNAS,
    normalizar: normalizar, derivar: derivar, evaluar: evaluar,
    fase: fase, serie: serie, resumen: resumen
  });
})(typeof window !== 'undefined' ? window : globalThis);
