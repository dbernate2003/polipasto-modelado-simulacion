/* app.js
 * Gemelo digital del polipasto: une el modelo (modelo.js), la lectura del CSV
 * (csv.js), las graficas (graficas.js) y el dibujo (mecanismo.js).
 *
 * Una sola variable de tiempo (est.t) gobierna TODO lo que se ve: postura del
 * mecanismo, cursor de las graficas, lecturas, DCL, energia y ecuaciones.
 * Asi la animacion y las curvas siempre muestran el mismo instante.
 *
 * Modos:
 *   - Simulink (CSV): muestra datos_mecanismo.csv tal como lo exporto Simulink.
 *   - En vivo: recalcula con las mismas ecuaciones del modelo cada vez que
 *     se mueve un parametro.
 */
(function () {
  'use strict';
  const P = window.Polipasto;
  const C = window.PolipastoCSV;
  const Gr = window.PolipastoGraficas;
  const Me = window.PolipastoMecanismo;
  const $ = function (id) { return document.getElementById(id); };

  function fmt(v, d) {
    if (!Number.isFinite(v)) { return '–'; }
    const s = Number(v).toFixed(d);
    return /^-0\.?0*$/.test(s) ? s.slice(1) : s;
  }

  /** Igual que fmt, pero pone los negativos entre parentesis para usarlos dentro de una ecuacion. */
  function fmtP(v, d) {
    const s = fmt(v, d);
    return s.charAt(0) === '-' ? '(' + s + ')' : s;
  }

  // ------------------------------------------------------------------
  // Definiciones
  // ------------------------------------------------------------------
  const GRAFICAS = {
    x:    { titulo: 'Posición de la carga x', unidad: 'm', series: [{ campo: 'x', color: '--cinematica', dec: 3 }] },
    v:    { titulo: 'Velocidad de la carga v', unidad: 'm/s', series: [{ campo: 'v', color: '--cinematica', dec: 3 }] },
    a:    { titulo: 'Aceleración de la carga a', unidad: 'm/s²', series: [{ campo: 'a', color: '--cinematica', dec: 3 }] },
    T:    { titulo: 'Tensión T = F_op', unidad: 'N', series: [{ campo: 'T', color: '--tension', dec: 2 }],
            umbral: { valor: function (p) { return p.Fmax; }, etiqueta: function (p) { return 'Límite del operario ' + p.Fmax + ' N'; } } },
    P:    { titulo: 'Potencia del operario P', unidad: 'W', series: [{ campo: 'P', color: '--potencia', dec: 2 }] },
    E:    { titulo: 'Trabajo W_op y energía E_mec', unidad: 'J', series: [
            { campo: 'Wop', nombre: 'W_op', color: '--trabajo', dec: 1 },
            { campo: 'E', nombre: 'E_mec', color: '--tinta', trazos: true, grosor: 1.6, dec: 1 }] },
    R:    { titulo: 'Reacción en el techo R', unidad: 'N', series: [{ campo: 'R', color: '--reaccion', dec: 1 }] },
    cabo: { titulo: 'Cabo recogido L_c y altura x', unidad: 'm', series: [
            { campo: 'Lc', nombre: 'L_c', color: '--trabajo', dec: 2 },
            { campo: 'x', nombre: 'x', color: '--cinematica', dec: 2 }] },
    fd:   { titulo: 'Factor dinámico T / (M·g/n)', unidad: '–', series: [{ campo: 'fd', color: '--tension', dec: 4 }] }
  };
  const OSCILOSCOPIO = ['x', 'v', 'a', 'T', 'P', 'E'];

  const LECTURAS = [
    { campo: 't',   nombre: 'Tiempo',        unidad: 's',    dec: 2 },
    { campo: 'x',   nombre: 'Altura x',      unidad: 'm',    dec: 3, color: 'cinematica' },
    { campo: 'v',   nombre: 'Velocidad v',   unidad: 'm/s',  dec: 3, color: 'cinematica' },
    { campo: 'a',   nombre: 'Aceleración a', unidad: 'm/s²', dec: 3, color: 'cinematica' },
    { campo: 'Lc',  nombre: 'Cabo L_c',      unidad: 'm',    dec: 2, color: 'trabajo' },
    { campo: 'vc',  nombre: 'Cabo v_c',      unidad: 'm/s',  dec: 3, color: 'trabajo' },
    { campo: 'T',   nombre: 'T = F_op',      unidad: 'N',    dec: 2, color: 'tension' },
    { campo: 'R',   nombre: 'Techo R',       unidad: 'N',    dec: 1, color: 'reaccion' },
    { campo: 'P',   nombre: 'Potencia P',    unidad: 'W',    dec: 2, color: 'potencia' }
  ];


  /** Escenarios de la demostracion guiada, en el orden en que conviene mostrarlos. */
  const ESCENARIOS = [
    {
      id: 'nominal', titulo: 'Caso nominal', corto: 'Nominal', params: { m: 20, n: 4, Vc: 0.6, ta: 1 }, ref: 'simulink',
      observar: function (r, p) {
        return 'El operario recoge ' + fmt(r.LcFinal, 1) + ' m de cabo y la carga sube ' + fmt(r.xFinal, 2) +
          ' m: ' + p.n + ' veces menos. A cambio hace solo ' + fmt(r.Freposo, 1) + ' N, 1/' + p.n +
          ' del peso de ' + fmt(p.M * p.g, 1) + ' N.';
      },
      pregunta: '<b>¿De dónde sale la ventaja mecánica?</b> De los n ramales que sostienen el bloque móvil: cada uno lleva T, así que en reposo n·T = M·g.'
    },
    {
      id: 'liviana', titulo: 'Carga liviana, mismo movimiento', corto: 'Carga liviana', params: { m: 10, n: 4, Vc: 0.6, ta: 1 }, ref: 'nominal',
      observar: function (r, p) {
        return 'Con ' + fmt(p.m, 0) + ' kg, las curvas de x, v y a quedan exactamente sobre la curva gris del caso nominal. Solo cambian las fuerzas: F_op baja a ' +
          fmt(r.Freposo, 1) + ' N en reposo.';
      },
      pregunta: '<b>¿Por qué la masa no cambia el movimiento?</b> Porque la entrada del modelo es la velocidad del cabo que impone el operario; la masa solo aparece en T = M(g + a)/n.'
    },
    {
      id: 'sobrecarga', titulo: 'Sobrecarga con 2 ramales', corto: 'Sobrecarga n = 2', params: { m: 100, n: 2, Vc: 0.6, ta: 1 }, ref: 'nominal',
      observar: function (r, p) {
        return 'Con ' + fmt(p.m, 0) + ' kg y n = 2 el operario necesitaría ' + fmt(r.FopMax, 1) + ' N y su límite es ' +
          fmt(p.Fmax, 0) + ' N: se enciende la alarma y la mano se pone roja. La simulación sigue para poder mostrarlo.';
      },
      pregunta: '<b>¿Qué pasa si se excede un límite?</b> El modelo lo detecta y lo marca (columna alarma_Fop del CSV); no se oculta ni se detiene.'
    },
    {
      id: 'n4', titulo: 'La misma carga con 4 ramales', corto: 'Misma carga n = 4', params: { m: 100, n: 4, Vc: 0.6, ta: 1 }, ref: 'sobrecarga',
      observar: function (r, p) {
        return 'Con n = 4 la fuerza baja a ' + fmt(r.FopMax, 1) + ' N, por debajo de ' + fmt(p.Fmax, 0) +
          ' N. La curva gris es la sobrecarga con n = 2: la tensión queda en la mitad.';
      },
      pregunta: '<b>¿Por qué se reduce a la mitad?</b> T = M(g + a)/n: al duplicar n, T se divide entre 2.'
    },
    {
      id: 'n6', titulo: 'Ventaja máxima con 6 ramales', corto: 'Ventaja n = 6', params: { m: 100, n: 6, Vc: 0.6, ta: 1 }, ref: 'n4',
      observar: function (r, p) {
        return 'F_op baja a ' + fmt(r.FopMax, 1) + ' N, pero con los mismos ' + fmt(r.LcFinal, 1) + ' m de cabo la carga sube solo ' +
          fmt(r.xFinal, 2) + ' m. La ventaja se paga en recorrido: subir cada metro cuesta ' + fmt(p.M * p.g, 0) + ' J con cualquier n.';
      },
      pregunta: '<b>¿El polipasto ahorra energía?</b> No: W = M·g·h no depende de n. Reduce la fuerza a cambio de más cuerda.'
    },
    {
      id: 'brusco', titulo: 'Arranque brusco', corto: 'Arranque brusco', params: { m: 100, n: 4, Vc: 1.0, ta: 0.2 }, ref: 'n4',
      observar: function (r, p) {
        const pct = (r.fdMax - 1) * 100;
        return 'Arrancar en ' + fmt(p.ta, 1) + ' s lleva la aceleración de la carga a ' + fmt(r.aMax, 2) + ' m/s² y la tensión a ' +
          fmt(r.FopMax, 1) + ' N: un ' + fmt(pct, 1) + ' % más que en reposo (factor dinámico ' + fmt(r.fdMax, 3) +
          '). Queda cerca del límite de ' + fmt(p.Fmax, 0) + ' N.';
      },
      pregunta: '<b>¿Por qué importa la aceleración?</b> Porque n·T = M(g + a): acelerar hacia arriba aumenta la tensión. Por eso las normas de izaje usan factores dinámicos.'
    },
    {
      id: 'tope', titulo: 'Final de carrera a 6 m', corto: 'Final de carrera', params: { m: 20, n: 2, Vc: 1.0, ta: 1 }, ref: 'simulink',
      observar: function (r, p) {
        return 'Con n = 2 y el cabo a ' + fmt(p.Vc, 1) + ' m/s la carga pasaría de ' + fmt(p.hmax, 0) +
          ' m. El modelo adelanta el frenado a t = ' + fmt(p.tb, 2) + ' s y se detiene exactamente en ' + fmt(r.xFinal, 2) + ' m.';
      },
      pregunta: '<b>¿Cómo evitan estados imposibles?</b> El final de carrera es una restricción física del mecanismo, como la condición de Grashof en el cuatro barras.'
    }
  ];

  // ------------------------------------------------------------------
  // Estado
  // ------------------------------------------------------------------
  const pNominal = P.derivar(P.NOMINAL);
  const est = {
    modo: 'vivo',
    pVivo: pNominal,
    serieVivo: P.serie(pNominal),
    analitica: { datos: P.serie(pNominal), p: pNominal },
    csv: null,
    ref: null,
    t: 0,
    reproduciendo: false,
    velocidad: 1,
    bucle: false,
    vista: 'tres',
    ranuras: ['x', 'T', 'P'],
    graficas: [],
    cuerpo: 'carga',
    mostrarFuerzas: true,
    mostrarMarcas: true,
    mostrarRef: true,
    escenario: -1,
    resumen: null
  };

  function refBase() {
    if (est.csv) { return { nombre: 'Simulink (' + est.csv.nombre + ')', datos: est.csv.datos, p: est.csv.p, origen: 'simulink' }; }
    return { nombre: 'referencia analítica del caso nominal (lo que Simulink debe dar)', datos: est.analitica.datos, p: est.analitica.p, origen: 'analitica' };
  }

  /** Datos que se estan mostrando ahora. */
  function activa() {
    if (est.modo === 'vivo') { return { datos: est.serieVivo, p: est.pVivo, tipo: 'vivo' }; }
    if (est.csv) { return { datos: est.csv.datos, p: est.csv.p, tipo: 'csv' }; }
    return { datos: est.analitica.datos, p: est.analitica.p, tipo: 'analitica' };
  }

  /** Estado completo en el instante t: exacto en vivo, interpolado del CSV en modo Simulink. */
  function estadoEn(t) {
    const a = activa();
    if (a.tipo !== 'csv') { return P.evaluar(t, a.p); }
    const d = a.datos, p = a.p, e = { t: t };
    P.COLUMNAS.forEach(function (col) { if (col.campo !== 't') { e[col.campo] = Gr.interpolar(d, col.campo, t); } });
    e.dx = e.x - p.x0;
    e.ac = p.n * e.a;
    e.Ep = p.M * p.g * e.dx;
    e.Ec = 0.5 * p.M * e.v * e.v;
    e.alarma = e.Fop > p.Fmax ? 1 : 0;
    return e;
  }

  function referenciaVisible() {
    return (est.modo === 'vivo' && est.mostrarRef) ? est.ref : null;
  }

  // ------------------------------------------------------------------
  // Avisos
  // ------------------------------------------------------------------
  let temporizadorToast = null;
  function avisar(texto, error) {
    const t = $('toast');
    t.textContent = texto;
    t.classList.toggle('error', !!error);
    t.classList.add('visible');
    clearTimeout(temporizadorToast);
    temporizadorToast = setTimeout(function () { t.classList.remove('visible'); }, error ? 7000 : 4200);
  }

  // ------------------------------------------------------------------
  // Graficas
  // ------------------------------------------------------------------
  function construirGraficas() {
    est.graficas.forEach(function (x) { x.g.destruir(); });
    est.graficas = [];
    const cont = $('contGraficas');
    cont.dataset.vista = est.vista;
    const claves = est.vista === 'tres' ? est.ranuras : OSCILOSCOPIO;
    claves.forEach(function (clave, i) {
      const host = document.createElement('div');
      cont.appendChild(host);
      const g = new Gr.Grafica(host, {
        alEmpezar: pausar,
        alArrastrar: function (t) { fijarTiempo(t); },
        alCambiar: pedirCuadro
      });
      if (est.vista === 'tres') {
        const sel = document.createElement('select');
        sel.setAttribute('aria-label', 'Variable de la gráfica ' + (i + 1));
        Object.keys(GRAFICAS).forEach(function (k) {
          const o = document.createElement('option');
          o.value = k; o.textContent = GRAFICAS[k].titulo;
          sel.appendChild(o);
        });
        sel.value = clave;
        sel.addEventListener('change', function () {
          est.ranuras[i] = sel.value;
          construirGraficas();
        });
        g.cab.appendChild(sel);
      } else {
        const tt = document.createElement('span');
        tt.className = 'titulo-fijo';
        tt.textContent = GRAFICAS[clave].titulo;
        g.cab.appendChild(tt);
      }
      const valor = document.createElement('span');
      valor.className = 'grafica-valor';
      g.cab.appendChild(valor);
      est.graficas.push({ g: g, clave: clave, valor: valor });
    });
    configurarGraficas();
  }

  function configurarGraficas() {
    const a = activa();
    const ref = referenciaVisible();
    est.graficas.forEach(function (x) {
      x.g.configurar({ def: GRAFICAS[x.clave], datos: a.datos, ref: ref, p: a.p, mostrarRef: !!ref });
    });
    const ley = $('leyendaRef');
    if (est.modo === 'vivo') {
      ley.innerHTML = ref ? '<span class="muestra"></span>Curva gris: ' + ref.nombre : 'Curva de referencia oculta.';
    } else if (est.csv) {
      ley.textContent = 'Mostrando ' + est.csv.nombre + ' tal como lo exportó Simulink. Mueve un parámetro para pasar al modo En vivo.';
    } else {
      ley.textContent = 'Aún no hay CSV de Simulink: se muestra la referencia analítica del caso nominal. Usa Cargar CSV.';
    }
  }

  // ------------------------------------------------------------------
  // Controles de parametros
  // ------------------------------------------------------------------
  const controles = {
    m:  { rango: $('rgM'),  numero: $('nmM'),  dec: 0 },
    Vc: { rango: $('rgVc'), numero: $('nmVc'), dec: 2 },
    ta: { rango: $('rgTa'), numero: $('nmTa'), dec: 2 }
  };

  function sincronizarControles(p) {
    Object.keys(controles).forEach(function (k) {
      controles[k].rango.value = p[k];
      controles[k].numero.value = fmt(p[k], controles[k].dec);
    });
    document.querySelectorAll('.ramales button').forEach(function (b) {
      b.setAttribute('aria-checked', String(Number(b.dataset.n) === p.n));
    });
    $('subN').textContent = p.n;
  }

  function parametrosMostrados() {
    const p = activa().p;
    return { m: p.m, n: p.n, Vc: p.Vc, ta: p.ta };
  }

  /** Aplica parametros nuevos y pasa al modo En vivo (sin reiniciar el tiempo). */
  function aplicarParametros(entrada, origen) {
    const p = P.derivar(entrada);
    est.pVivo = p;
    est.serieVivo = P.serie(p);
    $('avisoParam').textContent = p.ajustes.join(' ');
    sincronizarControles(p);
    if (est.modo !== 'vivo') {
      est.modo = 'vivo';
      marcarModo();
      if (origen !== 'escenario') { avisar('Modo En vivo: el gemelo recalcula con las mismas ecuaciones del modelo.'); }
    }
    if (origen !== 'escenario') {
      est.escenario = ESCENARIOS.findIndex(function (s) {
        return s.params.m === p.m && s.params.n === p.n && Math.abs(s.params.Vc - p.Vc) < 1e-9 && Math.abs(s.params.ta - p.ta) < 1e-9;
      });
      if (est.escenario < 0) { notaPersonalizada(); } else { notaEscenario(); }
      marcarEscenario();
    }
    if (est.t > p.t_fin) { est.t = p.t_fin; }
    datosCambiaron();
  }

  function marcarModo() {
    document.querySelectorAll('[data-modo]').forEach(function (b) {
      b.setAttribute('aria-checked', String(b.dataset.modo === est.modo));
    });
  }

  function cambiarModo(modo) {
    if (modo === est.modo) { return; }
    est.modo = modo;
    marcarModo();
    if (modo === 'csv') {
      if (!est.csv) { avisar('Aún no cargaste datos_mecanismo.csv: se muestra la referencia analítica nominal, que es lo que Simulink debe dar.'); }
      est.escenario = -1;
      marcarEscenario();
      $('escTitulo').textContent = est.csv ? 'Datos de Simulink' : 'Referencia analítica';
      $('escObservar').textContent = est.csv
        ? 'Reproduce ' + est.csv.nombre + ' sin recalcular nada. Compara estas curvas con el Scope y mira el panel de validación.'
        : 'Es la solución exacta del caso nominal. Carga el CSV de Simulink para comparar contra él.';
      $('escPregunta').innerHTML = '<b>¿Cómo saben que coincide con Simulink?</b> El panel de validación compara cada instante del CSV con el modelo y muestra el error máximo y el RMS.';
    } else if (est.escenario >= 0) {
      notaEscenario();
    } else {
      notaPersonalizada();
    }
    sincronizarControles(activa().p);
    datosCambiaron();
  }

  // ------------------------------------------------------------------
  // Escenarios guiados
  // ------------------------------------------------------------------
  function construirEscenarios() {
    const lista = $('escLista');
    ESCENARIOS.forEach(function (s, i) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'esc-btn';
      b.setAttribute('aria-pressed', 'false');
      const r = P.resumen(P.derivar(s.params));
      if (r.alarma) { b.classList.add('alarma'); b.title = 'Este escenario supera el límite del operario'; }
      b.innerHTML = '<span class="esc-num">' + (i + 1) + '</span>' + s.corto;
      if (!r.alarma) { b.title = s.titulo; }
      b.addEventListener('click', function () { aplicarEscenario(i, true); });
      li.appendChild(b);
      lista.appendChild(li);
    });
  }

  function marcarEscenario() {
    document.querySelectorAll('.esc-btn').forEach(function (b, i) {
      b.setAttribute('aria-pressed', String(i === est.escenario));
    });
  }

  function notaEscenario() {
    const s = ESCENARIOS[est.escenario];
    const p = est.pVivo;
    $('escTitulo').textContent = (est.escenario + 1) + '. ' + s.titulo;
    $('escObservar').textContent = s.observar(P.resumen(p), p);
    $('escPregunta').innerHTML = s.pregunta;
  }

  function notaPersonalizada() {
    const p = est.pVivo, r = P.resumen(p);
    $('escTitulo').textContent = 'Parámetros propios';
    $('escObservar').textContent = 'F_op máxima ' + fmt(r.FopMax, 1) + ' N' + (r.alarma ? ' (supera el límite de ' + fmt(p.Fmax, 0) + ' N)' : '') +
      '. La carga sube ' + fmt(r.xFinal, 2) + ' m con ' + fmt(r.LcFinal, 2) + ' m de cabo y se detiene en t = ' + fmt(p.t3, 2) +
      ' s. Potencia pico ' + fmt(r.Pmax, 1) + ' W.';
    $('escPregunta').innerHTML = '<b>Prueba:</b> compara con la curva gris. Si solo cambiaste la masa, x, v y a no se mueven.';
  }

  function aplicarEscenario(i, reproducirYa) {
    if (i < 0 || i >= ESCENARIOS.length) { return; }
    const s = ESCENARIOS[i];
    est.escenario = i;
    aplicarParametros(s.params, 'escenario');
    if (s.ref === 'simulink') {
      est.ref = refBase();
    } else {
      const otro = ESCENARIOS.find(function (x) { return x.id === s.ref; });
      const pr = P.derivar(otro.params);
      est.ref = { nombre: 'escenario «' + otro.titulo + '»', datos: P.serie(pr), p: pr, origen: 'escenario' };
    }
    est.mostrarRef = true;
    $('chkRef').checked = true;
    $('btnRefSimulink').hidden = est.ref.origen === 'simulink' || est.ref.origen === 'analitica';
    marcarEscenario();
    notaEscenario();
    est.t = 0;
    configurarGraficas();
    if (reproducirYa) { reproducir(); } else { pedirCuadro(); }
  }

  // ------------------------------------------------------------------
  // Cuando cambian los datos mostrados
  // ------------------------------------------------------------------
  function datosCambiaron() {
    const a = activa();
    est.resumen = resumenDe(a);
    configurarGraficas();
    actualizarFuente();
    actualizarBandas(a.p);
    prepararTextosLimite(a);
    actualizarValidacion();
    pedirCuadro();
  }

  function resumenDe(a) {
    if (a.tipo !== 'csv') { return P.resumen(a.p); }
    const d = a.datos;
    let FopMax = -Infinity, Wmax = -Infinity, Pmax = -Infinity;
    for (let i = 0; i < d.N; i++) {
      FopMax = Math.max(FopMax, d.Fop[i]);
      Wmax = Math.max(Wmax, d.Wop[i]);
      Pmax = Math.max(Pmax, d.P[i]);
    }
    const r = P.resumen(a.p);
    return Object.assign({}, r, { FopMax: FopMax, Wtotal: Wmax, Pmax: Pmax, xFinal: d.x[d.N - 1], alarma: FopMax > a.p.Fmax });
  }

  function actualizarFuente() {
    const f = $('fuente');
    const a = activa();
    f.classList.toggle('cargado', a.tipo === 'csv');
    if (a.tipo === 'vivo') { f.textContent = 'Datos: modelo en vivo (mismas ecuaciones que Simulink)'; }
    else if (a.tipo === 'csv') { f.textContent = 'Datos: ' + est.csv.nombre + ' (' + est.csv.datos.N + ' filas)'; }
    else { f.textContent = 'Datos: referencia analítica incluida'; }
    f.title = f.textContent;
  }

  function actualizarBandas(p) {
    const cont = $('bandasFase');
    cont.innerHTML = '';
    [[p.t0, p.t1, 'Arranque'], [p.tb, p.t3, 'Frenado']].forEach(function (f) {
      const s = document.createElement('span');
      s.style.left = (f[0] / p.t_fin * 100) + '%';
      s.style.width = ((f[1] - f[0]) / p.t_fin * 100) + '%';
      s.title = f[2];
      cont.appendChild(s);
    });
    $('lineaTiempo').max = String(Math.round(p.t_fin / p.dt_out));
  }

  /** Textos de la corrida completa para los medidores de limites. */
  function prepararTextosLimite(a) {
    const p = a.p, r = est.resumen;
    let fuerza = 'Máximo de la corrida ' + fmt(r.FopMax, 1) + ' N, límite ' + fmt(p.Fmax, 0) + ' N.';
    if (r.alarma) {
      const mejor = P.RANGOS.n.valores.find(function (n) { return P.resumen(P.derivar({ m: p.m, n: n, Vc: p.Vc, ta: p.ta })).FopMax <= p.Fmax; });
      fuerza = 'La corrida llega a ' + fmt(r.FopMax, 1) + ' N: supera los ' + fmt(p.Fmax, 0) + ' N. ' + (mejor
        ? 'Con n = ' + mejor + ' bastarían ' + fmt(P.resumen(P.derivar({ m: p.m, n: mejor, Vc: p.Vc, ta: p.ta })).FopMax, 1) + ' N.'
        : 'Ni con 6 ramales alcanza: baja la masa o arranca más suave.');
    }
    const altura = p.topeActivo
      ? 'Final de carrera activo: el frenado se adelanta a t = ' + fmt(p.tb, 2) + ' s para no pasar de ' + fmt(p.hmax, 0) + ' m.'
      : 'Final de carrera en ' + fmt(p.hmax, 0) + ' m; esta corrida llega a ' + fmt(r.xFinal, 2) + ' m.';
    est.textoLimite = { fuerza: fuerza, altura: altura };
  }

  // ------------------------------------------------------------------
  // Validacion contra Simulink
  // ------------------------------------------------------------------
  function actualizarValidacion() {
    const cont = $('validacion');
    if (!est.csv) {
      cont.innerHTML = '<div class="vacio"><p>Carga <b>datos_mecanismo.csv</b> y <b>parametros_mecanismo.csv</b> (los exporta <code>run_polipasto.m</code>).</p>' +
        '<p>El gemelo recalcula cada instante del CSV con las ecuaciones del modelo y muestra aquí el error máximo y el RMS de cada variable.</p></div>';
      return;
    }
    const d = est.csv.datos, p = est.csv.p;
    const saltos = [p.t0, p.t1, p.tb, p.t3];
    const discontinuas = { a: 1, T: 1, Fop: 1, R: 1, P: 1, fd: 1 };
    const vars = [
      ['x', 'x', 'm'], ['v', 'v', 'm/s'], ['a', 'a', 'm/s²'], ['Lc', 'L_c', 'm'],
      ['T', 'T', 'N'], ['R', 'R', 'N'], ['P', 'P', 'W'], ['Wop', 'W_op', 'J']
    ];
    const res = vars.map(function (v) {
      let max = 0, suma = 0, cuenta = 0, escala = 0;
      for (let i = 0; i < d.N; i++) {
        const t = d.t[i];
        if (discontinuas[v[0]] && saltos.some(function (s) { return Math.abs(t - s) < 1e-6; })) { continue; }
        const e = P.evaluar(t, p);
        const err = d[v[0]][i] - e[v[0]];
        if (!Number.isFinite(err)) { continue; }
        max = Math.max(max, Math.abs(err));
        suma += err * err;
        cuenta++;
        escala = Math.max(escala, Math.abs(e[v[0]]));
      }
      const rms = Math.sqrt(suma / Math.max(1, cuenta));
      const ok = cuenta > 0 && (max <= 1e-4 * Math.max(escala, 1e-9) || max < 1e-9);
      return { nombre: v[1], unidad: v[2], max: max, rms: rms, ok: ok };
    });
    let balance = 0;
    for (let i = 0; i < d.N; i++) { balance = Math.max(balance, Math.abs(d.Wop[i] - d.E[i])); }
    const todos = res.every(function (r) { return r.ok; });
    let html = '<table><thead><tr><th>Variable</th><th class="num">Error máx.</th><th class="num">RMS</th><th>Estado</th></tr></thead><tbody>';
    res.forEach(function (r) {
      html += '<tr><td>' + r.nombre + ' [' + r.unidad + ']</td><td class="num">' + r.max.toExponential(1) + '</td><td class="num">' +
        r.rms.toExponential(1) + '</td><td class="' + (r.ok ? 'estado-ok">Coincide' : 'estado-mal">Revisar') + '</td></tr>';
    });
    html += '<tr><td>W_op − E_mec</td><td class="num">' + balance.toExponential(1) + '</td><td class="num">–</td><td class="' +
      (balance < 1e-2 ? 'estado-ok">Cierra' : 'estado-mal">Revisar') + '</td></tr></tbody></table>';
    html += '<p class="nota">' + (todos ? 'El CSV de Simulink y el modelo del gemelo coinciden en los ' + d.N + ' instantes. ' : 'Hay diferencias: revisa el diagrama de Simulink y los parámetros. ') +
      'En a, T, R y P se omiten los 4 instantes exactos de los saltos, donde cada método puede tomar el valor de un lado o del otro.' +
      (est.csv.supuesto ? ' No cargaste parametros_mecanismo.csv: se asumieron los parámetros nominales.' : '') + '</p>';
    cont.innerHTML = html;
  }

  // ------------------------------------------------------------------
  // Paneles que cambian en cada cuadro
  // ------------------------------------------------------------------
  function construirLecturas() {
    const dl = $('lecturas');
    LECTURAS.forEach(function (l) {
      const div = document.createElement('div');
      div.className = 'lectura';
      if (l.color) { div.dataset.color = l.color; }
      div.innerHTML = '<dt>' + l.nombre + '</dt><dd><span></span><small>' + l.unidad + '</small></dd>';
      l.div = div;
      l.span = div.querySelector('span');
      dl.appendChild(div);
    });
  }

  function construirEnergia() {
    const cont = $('barrasEnergia');
    est.barras = [
      { campo: 'Ep', nombre: 'Energía potencial M·g·Δx', color: '--cinematica', dec: 1 },
      { campo: 'Ec', nombre: 'Energía cinética ½·M·v²', color: '--potencia', dec: 3 },
      { campo: 'E', nombre: 'Energía mecánica E_mec', color: '--tinta', dec: 1 },
      { campo: 'Wop', nombre: 'Trabajo del operario W_op', color: '--trabajo', dec: 1 }
    ];
    est.barras.forEach(function (b) {
      const div = document.createElement('div');
      div.className = 'barra-e';
      div.innerHTML = '<div class="barra-e-cab"><span>' + b.nombre + '</span><strong></strong></div><div class="barra-e-pista"><div class="barra-e-relleno"></div></div>';
      div.querySelector('.barra-e-relleno').style.background = 'var(' + b.color + ')';
      b.valor = div.querySelector('strong');
      b.relleno = div.querySelector('.barra-e-relleno');
      cont.appendChild(div);
    });
  }

  function actualizarLecturas(e, p) {
    LECTURAS.forEach(function (l) {
      l.span.textContent = fmt(e[l.campo], l.dec);
      if (l.campo === 'T') { l.div.dataset.color = e.Fop > p.Fmax ? 'alarma' : 'tension'; }
    });
    const fase = P.fase(e.t, p);
    const chip = $('faseChip');
    chip.textContent = fase;
    chip.dataset.fase = fase;
  }

  function medidor(id, valor, escala, cerca, limite, estado, pie) {
    const m = $(id);
    m.dataset.estado = estado.clase;
    m.querySelector('.medidor-relleno').style.width = Math.min(100, Math.max(0, valor / escala * 100)) + '%';
    m.querySelector('[data-marca="cerca"]').style.left = (cerca / escala * 100) + '%';
    m.querySelector('[data-marca="limite"]').style.left = (limite / escala * 100) + '%';
    const et = m.querySelector('.medidor-estado');
    et.textContent = estado.texto;
    et.dataset.estado = estado.clase;
    m.querySelector('.medidor-pie').textContent = pie;
  }

  function actualizarLimites(e, p) {
    const r = est.resumen;
    const escalaF = Math.max(p.Fmax * 1.25, r.FopMax * 1.05);
    const estF = e.Fop > p.Fmax ? { clase: 'excedido', texto: 'Excedido: ' + fmt(e.Fop, 0) + ' N' } : (e.Fop >= 0.8 * p.Fmax ? { clase: 'cerca', texto: 'Cerca del límite' } : { clase: 'ok', texto: 'Normal' });
    medidor('medFuerza', e.Fop, escalaF, 0.8 * p.Fmax, p.Fmax, estF, est.textoLimite.fuerza);
    const escalaH = p.hmax * 1.1;
    const enTope = e.x >= p.hmax - 1e-6;
    const estH = enTope ? { clase: 'cerca', texto: 'En el tope' } : (e.x >= p.hmax - 1 ? { clase: 'cerca', texto: 'Cerca del tope' } : { clase: 'ok', texto: 'Normal' });
    medidor('medAltura', e.x, escalaH, p.hmax - 1, p.hmax, estH, est.textoLimite.altura);
  }

  function actualizarEnergia(e, p) {
    const escala = Math.max(est.resumen.Wtotal, 1e-6) * 1.05;
    est.barras.forEach(function (b) {
      b.valor.textContent = fmt(e[b.campo], b.dec) + ' J';
      b.relleno.style.width = Math.min(100, Math.max(0, e[b.campo] / escala * 100)) + '%';
    });
    $('balance').innerHTML = '<b>W_op − E_mec = ' + fmt(e.Wop - e.E, 3) + ' J.</b> Todo el trabajo del operario queda como energía de la carga: el modelo ideal no tiene pérdidas.';
  }

  function actualizarEcuaciones(e, p) {
    const n = p.n, M = p.M, g = p.g;
    const filas = [
      ['Restricción geométrica (cuerda de longitud constante)', 'x = x<sub>0</sub> + L<sub>c</sub> / n = ' + fmt(p.x0, 0) + ' + ' + fmt(e.Lc, 3) + ' / ' + n, fmt(e.x, 3) + ' m'],
      ['Velocidad de la carga', 'v = v<sub>c</sub> / n = ' + fmt(e.vc, 3) + ' / ' + n, fmt(e.v, 3) + ' m/s'],
      ['Aceleración de la carga', 'a = a<sub>c</sub> / n = ' + fmt(e.ac, 3) + ' / ' + n, fmt(e.a, 3) + ' m/s²'],
      ['Newton en la carga y el bloque móvil', 'n·T − M·g = M·a → T = M(g + a)/n = ' + fmt(M, 0) + '·(' + fmt(g, 2) + (e.a < 0 ? ' − ' + fmt(-e.a, 3) : ' + ' + fmt(e.a, 3)) + ') / ' + n, fmt(e.T, 2) + ' N'],
      ['Cabo libre (polea ideal)', 'F<sub>op</sub> = T', fmt(e.Fop, 2) + ' N'],
      ['Bloque fijo', 'R = (n + 1)·T = ' + (n + 1) + '·' + fmt(e.T, 2), fmt(e.R, 2) + ' N'],
      ['Potencia del operario', 'P = F<sub>op</sub>·v<sub>c</sub> = ' + fmt(e.Fop, 2) + '·' + fmtP(e.vc, 3), fmt(e.P, 2) + ' W'],
      ['Factor dinámico', 'T / (M·g/n) = 1 + a/g', fmt(e.fd, 4)],
      ['Trabajo y energía', 'W<sub>op</sub> = M·g·Δx + ½·M·v² = ' + fmt(e.Ep, 1) + ' + ' + fmt(e.Ec, 3), fmt(e.Wop, 1) + ' J']
    ];
    const ol = $('ecuaciones');
    if (ol.children.length !== filas.length) {
      ol.innerHTML = filas.map(function () { return '<li><span class="ec-nombre"></span><span class="ec-cuerpo"></span></li>'; }).join('');
    }
    filas.forEach(function (f, i) {
      const li = ol.children[i];
      li.children[0].textContent = f[0];
      li.children[1].innerHTML = f[1] + ' = <span class="ec-res">' + f[2] + '</span>';
    });
  }

  function actualizarDCL(e, p) {
    Me.dibujarDCL($('cvDCL'), est.cuerpo, e, p);
    const n = p.n, Mg = p.M * p.g;
    let txt = '';
    if (est.cuerpo === 'carga') {
      txt = '<b>ΣF = n·T − M·g = M·a</b><br>' + n + '·' + fmt(e.T, 2) + ' − ' + fmt(Mg, 2) + ' = ' + fmt(n * e.T - Mg, 2) +
        ' N, y M·a = ' + fmt(p.M, 0) + '·' + fmtP(e.a, 3) + ' = ' + fmt(p.M * e.a, 2) + ' N.';
    } else if (est.cuerpo === 'fijo') {
      txt = '<b>ΣF = R − (n + 1)·T = 0</b><br>R = ' + (n + 1) + '·' + fmt(e.T, 2) + ' = ' + fmt(e.R, 1) +
        ' N. El techo carga el peso de la carga más la fuerza del operario.';
    } else if (est.cuerpo === 'polea') {
      txt = '<b>ΣM<sub>eje</sub> = T·r − T·r = 0</b><br>En una polea ideal la tensión es igual a ambos lados: no hay torque neto. Por eso las variables dinámicas del modelo son T, F_op, R y P, no torques.';
    } else {
      txt = '<b>F<sub>op</sub> = T</b><br>El operario sostiene ' + fmt(e.Fop, 2) + ' N; su límite es ' + fmt(p.Fmax, 0) + ' N' +
        (e.Fop > p.Fmax ? ': <b>lo supera</b>.' : '.');
    }
    $('dclEcuacion').innerHTML = txt;
  }

  // ------------------------------------------------------------------
  // Tiempo y reproduccion
  // ------------------------------------------------------------------
  let pedido = false, ultimo = null;

  function pedirCuadro() {
    if (!pedido) { pedido = true; requestAnimationFrame(cuadro); }
  }

  function cuadro(ahora) {
    pedido = false;
    const tFin = activa().p.t_fin;
    if (est.reproduciendo) {
      if (ultimo !== null) {
        est.t += Math.min(0.1, (ahora - ultimo) / 1000) * est.velocidad;
        if (est.t >= tFin) {
          if (est.bucle) { est.t = 0; } else { est.t = tFin; pausar(); }
        }
      }
      ultimo = ahora;
      if (est.reproduciendo) { pedirCuadro(); }
    } else {
      ultimo = null;
    }
    dibujar();
  }

  function dibujar() {
    const a = activa();
    const p = a.p;
    const e = estadoEn(est.t);
    const marcas = [];
    for (let tk = 0; tk <= est.t + 1e-9; tk += 0.5) { marcas.push(estadoEn(tk).x); }
    Me.dibujarMecanismo($('cvMecanismo'), e, p, { fuerzas: est.mostrarFuerzas, marcas: marcas, mostrarMarcas: est.mostrarMarcas });
    const dx = e.x - p.x0;
    $('mpCabo').textContent = fmt(e.Lc, 2) + ' m';
    $('mpSubida').textContent = fmt(dx, 2) + ' m';
    $('mpRazon').textContent = dx > 0.02 ? fmt(e.Lc / dx, 2) + ' = n' : '–';
    $('mecFuerzas').hidden = !est.mostrarFuerzas;
    $('mpNT').textContent = fmt(p.n * e.T, 1) + ' N';
    $('mpMG').textContent = fmt(p.M * p.g, 1) + ' N';
    $('mpMA').textContent = fmt(p.M * e.a, 2) + ' N';
    est.graficas.forEach(function (x) {
      x.g.dibujarCursor(est.t, e);
      const def = GRAFICAS[x.clave];
      x.valor.innerHTML = def.series.map(function (s) {
        return '<span>' + (def.series.length > 1 ? s.nombre + ' ' : '') + fmt(e[s.campo], s.dec) + (def.unidad === '–' ? '' : ' ' + def.unidad) + '</span>';
      }).join('');
    });
    actualizarLecturas(e, p);
    actualizarLimites(e, p);
    actualizarEnergia(e, p);
    actualizarEcuaciones(e, p);
    actualizarDCL(e, p);
    $('tiempo').textContent = 't = ' + fmt(est.t, 2) + ' s';
    $('lineaTiempo').value = String(Math.round(est.t / p.dt_out));
  }

  function fijarTiempo(t) {
    const tFin = activa().p.t_fin;
    est.t = Math.min(tFin, Math.max(0, t));
    pedirCuadro();
  }

  function reproducir() {
    if (est.t >= activa().p.t_fin - 1e-9) { est.t = 0; }
    est.reproduciendo = true;
    document.body.classList.add('reproduciendo');
    $('btnPlay').setAttribute('aria-label', 'Pausar (barra espaciadora)');
    pedirCuadro();
  }

  function pausar() {
    est.reproduciendo = false;
    document.body.classList.remove('reproduciendo');
    $('btnPlay').setAttribute('aria-label', 'Reproducir (barra espaciadora)');
  }

  function alternar() { if (est.reproduciendo) { pausar(); } else { reproducir(); } }

  // ------------------------------------------------------------------
  // Carga de archivos
  // ------------------------------------------------------------------
  function cargarArchivos(lista) {
    const archivos = Array.prototype.slice.call(lista || []);
    if (!archivos.length) { return; }
    Promise.all(archivos.map(function (f) { return f.text().then(function (t) { return { nombre: f.name, texto: t }; }); }))
      .then(function (leidos) {
        let datos = null, params = null, nombre = '';
        leidos.forEach(function (l) {
          const tipo = C.tipoDeArchivo(l.texto);
          if (tipo === 'datos') { datos = C.leerDatos(l.texto); nombre = l.nombre; }
          else if (tipo === 'parametros') { params = C.leerParametros(l.texto); }
          else { throw new Error('No reconozco ' + l.nombre + ': su primera columna debe ser "t [s]" (datos) o "parametro" (parámetros).'); }
        });
        let pCsv = null, supuesto = false;
        if (params) { pCsv = P.derivar({ m: params.m, n: params.n, Vc: params.Vc, ta: params.ta }); }
        if (datos) {
          if (!pCsv) {
            if (est.csv && !est.csv.supuesto) { pCsv = est.csv.p; } else { pCsv = P.derivar(P.NOMINAL); supuesto = true; }
          }
          est.csv = { nombre: nombre, datos: datos.datos, p: pCsv, supuesto: supuesto };
          est.ref = refBase();
          $('btnRefSimulink').hidden = true;
          est.modo = 'vivo';
          est.t = 0;
          cambiarModo('csv');
          let msg = 'Cargado ' + nombre + ': ' + datos.datos.N + ' filas.';
          if (datos.faltan.length) { msg += ' Faltan columnas: ' + datos.faltan.join(', ') + '.'; }
          if (supuesto) { msg += ' Sin parametros_mecanismo.csv se asumen los parámetros nominales.'; }
          if (datos.comaDecimal) { msg += ' El archivo venía con formato de Excel (; y coma decimal) y se leyó igual.'; }
          avisar(msg);
        } else if (params) {
          if (est.csv) {
            est.csv.p = pCsv;
            est.csv.supuesto = false;
            datosCambiaron();
            avisar('Parámetros de la corrida actualizados: m = ' + pCsv.m + ' kg, n = ' + pCsv.n + '.');
          } else {
            aplicarParametros({ m: pCsv.m, n: pCsv.n, Vc: pCsv.Vc, ta: pCsv.ta });
            avisar('Parámetros cargados en el modo En vivo. Carga también datos_mecanismo.csv para validar.');
          }
        }
      })
      .catch(function (err) { avisar(err.message || String(err), true); });
  }

  // ------------------------------------------------------------------
  // Exportar
  // ------------------------------------------------------------------
  function descargar(nombre, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function nombreCorrida() {
    const p = activa().p;
    return 'm' + fmt(p.m, 0) + '_n' + p.n + '_Vc' + fmt(p.Vc, 2) + '_ta' + fmt(p.ta, 2);
  }

  function exportarCSV() {
    const a = activa();
    descargar('datos_gemelo_' + nombreCorrida() + '.csv', new Blob([C.escribirDatos(a.datos)], { type: 'text/csv' }));
    avisar('CSV exportado con el mismo formato que datos_mecanismo.csv.');
  }

  function exportarPNG() {
    const cvM = $('cvMecanismo');
    const rM = cvM.getBoundingClientRect();
    const rG = $('contGraficas').getBoundingClientRect();
    const izq = rM.left, arr = Math.min(rM.top, rG.top);
    const ancho = rG.right - izq, alto = Math.max(rM.bottom, rG.bottom) - arr;
    const k = 2, cab = 34;
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(ancho * k); lienzo.height = Math.round((alto + cab) * k);
    const ctx = lienzo.getContext('2d');
    ctx.scale(k, k);
    ctx.fillStyle = Gr.css('--superficie');
    ctx.fillRect(0, 0, ancho, alto + cab);
    const p = activa().p;
    ctx.fillStyle = Gr.css('--tinta');
    ctx.font = '600 15px ' + Gr.css('--letra');
    ctx.fillText('Polipasto: m = ' + fmt(p.m, 0) + ' kg, n = ' + p.n + ', Vc = ' + fmt(p.Vc, 2) + ' m/s, ta = ' + fmt(p.ta, 2) +
      ' s, t = ' + fmt(est.t, 2) + ' s (' + (activa().tipo === 'csv' ? 'datos de Simulink' : 'modelo en vivo') + ')', 6, 22);
    ctx.drawImage(cvM, rM.left - izq, rM.top - arr + cab, rM.width, rM.height);
    est.graficas.forEach(function (x) {
      const r = x.g.lienzo.getBoundingClientRect();
      ctx.fillStyle = Gr.css('--tinta');
      ctx.font = '600 12px ' + Gr.css('--letra');
      ctx.fillText(GRAFICAS[x.clave].titulo + '   ' + x.valor.textContent, r.left - izq + 4, r.top - arr + cab - 5);
      x.g.copiarEn(ctx, r.left - izq, r.top - arr + cab);
    });
    lienzo.toBlob(function (blob) {
      descargar('polipasto_' + nombreCorrida() + '_t' + fmt(est.t, 2) + 's.png', blob);
      avisar('Imagen exportada: mecanismo y gráficas en el instante t = ' + fmt(est.t, 2) + ' s.');
    });
  }

  // ------------------------------------------------------------------
  // Tema y pantalla completa
  // ------------------------------------------------------------------
  function ponerTema(tema) {
    document.documentElement.dataset.tema = tema;
    $('btnTema').setAttribute('aria-label', tema === 'claro' ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro');
    try { localStorage.setItem('polipasto-tema', tema); } catch (e) { /* almacenamiento no disponible */ }
    est.graficas.forEach(function (x) { x.g.sucio = true; });
    pedirCuadro();
  }

  function pantallaCompleta() {
    if (document.fullscreenElement) { document.exitFullscreen(); }
    else if (document.documentElement.requestFullscreen) { document.documentElement.requestFullscreen(); }
  }

  // ------------------------------------------------------------------
  // Eventos
  // ------------------------------------------------------------------
  function conectar() {
    document.querySelectorAll('[data-modo]').forEach(function (b) {
      b.addEventListener('click', function () { cambiarModo(b.dataset.modo); });
    });
    Object.keys(controles).forEach(function (k) {
      const c = controles[k];
      c.rango.addEventListener('input', function () {
        const q = parametrosMostrados(); q[k] = Number(c.rango.value);
        aplicarParametros(q);
      });
      c.numero.addEventListener('change', function () {
        const q = parametrosMostrados(); q[k] = Number(c.numero.value);
        aplicarParametros(q);
      });
    });
    document.querySelectorAll('.ramales button').forEach(function (b) {
      b.addEventListener('click', function () {
        const q = parametrosMostrados(); q.n = Number(b.dataset.n);
        aplicarParametros(q);
      });
    });
    $('btnNominal').addEventListener('click', function () { aplicarEscenario(0, false); });

    $('escPrev').addEventListener('click', function () { aplicarEscenario(est.escenario <= 0 ? ESCENARIOS.length - 1 : est.escenario - 1, true); });
    $('escNext').addEventListener('click', function () { aplicarEscenario(est.escenario < 0 || est.escenario >= ESCENARIOS.length - 1 ? 0 : est.escenario + 1, true); });

    document.querySelectorAll('[data-vista]').forEach(function (b) {
      b.addEventListener('click', function () {
        est.vista = b.dataset.vista;
        document.querySelectorAll('[data-vista]').forEach(function (x) { x.setAttribute('aria-checked', String(x === b)); });
        construirGraficas();
        pedirCuadro();
      });
    });
    $('chkRef').addEventListener('change', function (ev) { est.mostrarRef = ev.target.checked; configurarGraficas(); pedirCuadro(); });
    $('btnFijarRef').addEventListener('click', function () {
      const p = est.pVivo;
      if (est.modo !== 'vivo') { avisar('Fijar la referencia funciona en el modo En vivo: mueve un parámetro o elige un escenario.'); return; }
      est.ref = { nombre: 'corrida fijada (m = ' + fmt(p.m, 0) + ' kg, n = ' + p.n + ', Vc = ' + fmt(p.Vc, 2) + ' m/s, ta = ' + fmt(p.ta, 2) + ' s)',
        datos: est.serieVivo, p: p, origen: 'fijada' };
      est.mostrarRef = true; $('chkRef').checked = true;
      $('btnRefSimulink').hidden = false;
      configurarGraficas(); pedirCuadro();
      avisar('Corrida fijada como curva gris. Ahora cambia un parámetro y compara.');
    });
    $('btnRefSimulink').addEventListener('click', function () {
      est.ref = refBase(); $('btnRefSimulink').hidden = true; configurarGraficas(); pedirCuadro();
    });
    $('chkDCL').addEventListener('change', function (ev) { est.mostrarFuerzas = ev.target.checked; pedirCuadro(); });
    $('chkRastro').addEventListener('change', function (ev) { est.mostrarMarcas = ev.target.checked; pedirCuadro(); });

    document.querySelectorAll('[data-cuerpo]').forEach(function (b) {
      b.addEventListener('click', function () {
        est.cuerpo = b.dataset.cuerpo;
        document.querySelectorAll('[data-cuerpo]').forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
        pedirCuadro();
      });
    });

    $('btnPlay').addEventListener('click', alternar);
    $('btnAtras').addEventListener('click', function () { pausar(); fijarTiempo(est.t - 0.1); });
    $('btnAdelante').addEventListener('click', function () { pausar(); fijarTiempo(est.t + 0.1); });
    $('lineaTiempo').addEventListener('input', function (ev) { pausar(); fijarTiempo(Number(ev.target.value) * activa().p.dt_out); });
    document.querySelectorAll('[data-vel]').forEach(function (b) {
      b.addEventListener('click', function () {
        est.velocidad = Number(b.dataset.vel);
        document.querySelectorAll('[data-vel]').forEach(function (x) { x.setAttribute('aria-checked', String(x === b)); });
      });
    });
    $('chkBucle').addEventListener('change', function (ev) { est.bucle = ev.target.checked; });

    $('btnCargar').addEventListener('click', function () { $('archivo').click(); });
    $('archivo').addEventListener('change', function (ev) { cargarArchivos(ev.target.files); ev.target.value = ''; });

    const menu = $('menuExportar'), btnExp = $('btnExportar');
    btnExp.addEventListener('click', function () {
      const abierto = menu.hidden;
      menu.hidden = !abierto;
      btnExp.setAttribute('aria-expanded', String(abierto));
    });
    menu.addEventListener('click', function (ev) {
      const b = ev.target.closest('[data-exportar]');
      if (!b) { return; }
      menu.hidden = true; btnExp.setAttribute('aria-expanded', 'false');
      if (b.dataset.exportar === 'csv') { exportarCSV(); } else { exportarPNG(); }
    });
    document.addEventListener('click', function (ev) {
      if (!ev.target.closest('.menu')) { menu.hidden = true; btnExp.setAttribute('aria-expanded', 'false'); }
    });

    $('btnTema').addEventListener('click', function () {
      ponerTema(document.documentElement.dataset.tema === 'claro' ? 'oscuro' : 'claro');
    });
    $('btnPantalla').addEventListener('click', pantallaCompleta);

    // Arrastrar y soltar archivos
    const capa = $('soltar');
    let profundidad = 0;
    window.addEventListener('dragenter', function (ev) {
      if (ev.dataTransfer && Array.prototype.indexOf.call(ev.dataTransfer.types, 'Files') >= 0) { profundidad++; capa.hidden = false; }
    });
    window.addEventListener('dragleave', function () { profundidad = Math.max(0, profundidad - 1); if (!profundidad) { capa.hidden = true; } });
    window.addEventListener('dragover', function (ev) { ev.preventDefault(); });
    window.addEventListener('drop', function (ev) {
      ev.preventDefault(); profundidad = 0; capa.hidden = true;
      if (ev.dataTransfer) { cargarArchivos(ev.dataTransfer.files); }
    });

    // Teclado
    document.addEventListener('keydown', function (ev) {
      const tag = ev.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') { return; }
      if (ev.key === ' ' && tag !== 'BUTTON') { ev.preventDefault(); alternar(); }
      else if (ev.key === 'ArrowRight') { ev.preventDefault(); pausar(); fijarTiempo(est.t + (ev.shiftKey ? 1 : 0.1)); }
      else if (ev.key === 'ArrowLeft') { ev.preventDefault(); pausar(); fijarTiempo(est.t - (ev.shiftKey ? 1 : 0.1)); }
      else if (ev.key === 'Home') { pausar(); fijarTiempo(0); }
      else if (ev.key === 'End') { pausar(); fijarTiempo(activa().p.t_fin); }
      else if (ev.key === 'f' || ev.key === 'F') { pantallaCompleta(); }
    });

    window.addEventListener('resize', pedirCuadro);
    new ResizeObserver(pedirCuadro).observe($('cvMecanismo'));
    new ResizeObserver(pedirCuadro).observe($('cvDCL'));
  }

  // ------------------------------------------------------------------
  // Inicio
  // ------------------------------------------------------------------
  function iniciar() {
    let tema = 'claro';
    try { tema = localStorage.getItem('polipasto-tema') || 'claro'; } catch (e) { /* sin almacenamiento */ }
    document.documentElement.dataset.tema = tema;
    construirEscenarios();
    construirLecturas();
    construirEnergia();
    conectar();
    est.ref = refBase();
    marcarModo();
    construirGraficas();
    aplicarEscenario(0, false);
    if (document.fonts && document.fonts.ready) { document.fonts.ready.then(function () { est.graficas.forEach(function (x) { x.g.sucio = true; }); pedirCuadro(); }); }
  }

  iniciar();
})();
