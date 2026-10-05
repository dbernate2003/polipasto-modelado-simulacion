/* csv.js
 * Lectura de datos_mecanismo.csv y parametros_mecanismo.csv (exportados por
 * run_polipasto.m) y exportacion de una corrida con el mismo formato.
 * Tolera los cambios tipicos de Excel en espanol: separador ';' y coma decimal.
 */
(function (global) {
  'use strict';
  const P = global.Polipasto;

  /** Quita espacios y comillas y pasa a minusculas: "T [N]" -> "t[n]". */
  function clave(texto) {
    return String(texto).replace(/^﻿/, '').replace(/"/g, '').replace(/\s+/g, '').toLowerCase();
  }

  /** Divide el texto en filas y columnas, detectando el separador. */
  function tabular(texto) {
    const lineas = String(texto).replace(/\r/g, '').split('\n').filter(function (l) { return l.trim() !== ''; });
    if (lineas.length === 0) { throw new Error('El archivo esta vacio.'); }
    const primera = lineas[0];
    const separador = primera.split(';').length > primera.split(',').length ? ';' : ',';
    const comaDecimal = separador === ';';
    const filas = lineas.map(function (l) { return l.split(separador).map(function (c) { return c.trim().replace(/^"|"$/g, ''); }); });
    return { encabezado: filas[0], filas: filas.slice(1), comaDecimal: comaDecimal, separador: separador };
  }

  function numero(texto, comaDecimal) {
    const limpio = comaDecimal ? String(texto).replace(',', '.') : String(texto);
    if (limpio === 'true') { return 1; }
    if (limpio === 'false') { return 0; }
    return Number(limpio);
  }

  /** Que tipo de archivo es: 'datos', 'parametros' o null. */
  function tipoDeArchivo(texto) {
    const primera = String(texto).replace(/^﻿/, '').split(/\r?\n/)[0] || '';
    const k = clave(primera);
    if (k.indexOf('parametro') === 0) { return 'parametros'; }
    if (k.indexOf('t[s]') === 0) { return 'datos'; }
    return null;
  }

  /**
   * Lee datos_mecanismo.csv. Devuelve un objeto con un Float64Array por variable
   * (mismos nombres de campo que Polipasto.serie) y la lista de columnas encontradas.
   */
  function leerDatos(texto) {
    const tab = tabular(texto);
    const indices = {};
    const claves = tab.encabezado.map(clave);
    P.COLUMNAS.forEach(function (c) {
      const i = claves.indexOf(clave(c.encabezado));
      if (i >= 0) { indices[c.campo] = i; }
    });
    const faltan = P.COLUMNAS.filter(function (c) { return !(c.campo in indices); }).map(function (c) { return c.encabezado; });
    if (!('t' in indices)) { throw new Error('No encuentro la columna "t [s]". La primera columna debe ser el tiempo.'); }
    if (!('x' in indices) || !('T' in indices)) {
      throw new Error('Faltan columnas basicas (x [m] o T [N]). Revisa el orden del Mux_datos en Simulink.');
    }
    const N = tab.filas.length;
    const datos = { N: N };
    P.COLUMNAS.forEach(function (c) { datos[c.campo] = new Float64Array(N); });
    let filasMalas = 0;
    for (let r = 0; r < N; r++) {
      const fila = tab.filas[r];
      P.COLUMNAS.forEach(function (c) {
        if (c.campo in indices) {
          const v = numero(fila[indices[c.campo]], tab.comaDecimal);
          if (!Number.isFinite(v)) { filasMalas++; }
          datos[c.campo][r] = Number.isFinite(v) ? v : NaN;
        }
      });
    }
    // Columnas derivables si faltan (por ejemplo, un CSV sin F_op)
    if (!('Fop' in indices)) { datos.Fop.set(datos.T); }
    for (let i = 1; i < N; i++) {
      if (!(datos.t[i] > datos.t[i - 1])) { throw new Error('El tiempo no es creciente en la fila ' + (i + 2) + '.'); }
    }
    return { datos: datos, faltan: faltan, filasMalas: filasMalas, comaDecimal: tab.comaDecimal };
  }

  /** Lee parametros_mecanismo.csv (parametro, valor, unidad). */
  function leerParametros(texto) {
    const tab = tabular(texto);
    const out = {};
    tab.filas.forEach(function (f) {
      if (f.length >= 2) {
        const v = numero(f[1], tab.comaDecimal);
        if (Number.isFinite(v)) { out[f[0]] = v; }
      }
    });
    if (!('m' in out) || !('n' in out)) { throw new Error('parametros_mecanismo.csv no tiene m y n.'); }
    return out;
  }

  /** Escribe una serie con el mismo encabezado y formato que Simulink. */
  function escribirDatos(serie) {
    const lineas = [P.COLUMNAS.map(function (c) { return c.encabezado; }).join(',')];
    for (let i = 0; i < serie.N; i++) {
      lineas.push(P.COLUMNAS.map(function (c) {
        const v = serie[c.campo][i];
        return String(Number(v.toPrecision(12)));
      }).join(','));
    }
    return lineas.join('\n') + '\n';
  }

  function escribirParametros(p) {
    const filas = [
      ['m', p.m, 'kg'], ['mb', p.mb, 'kg'], ['M', p.M, 'kg'], ['g', p.g, 'm/s^2'], ['n', p.n, '-'],
      ['Vc', p.Vc, 'm/s'], ['t0', p.t0, 's'], ['ta', p.ta, 's'], ['tc', p.tc, 's'], ['tb', p.tb, 's'],
      ['t3', p.t3, 's'], ['A', p.A, 'm/s^2'], ['x0', p.x0, 'm'], ['hmax', p.hmax, 'm'],
      ['Fmax', p.Fmax, 'N'], ['t_fin', p.t_fin, 's'], ['dt_out', p.dt_out, 's']
    ];
    return 'parametro,valor,unidad\n' + filas.map(function (f) { return f[0] + ',' + Number(Number(f[1]).toPrecision(12)) + ',' + f[2]; }).join('\n') + '\n';
  }

  global.PolipastoCSV = Object.freeze({
    tipoDeArchivo: tipoDeArchivo, leerDatos: leerDatos, leerParametros: leerParametros,
    escribirDatos: escribirDatos, escribirParametros: escribirParametros
  });
})(typeof window !== 'undefined' ? window : globalThis);
