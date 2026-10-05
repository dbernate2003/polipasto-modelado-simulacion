/* test_modelo.js
 * Prueba que el modelo del gemelo visual (gemelo_visual/modelo.js) da los
 * mismos valores que la solucion analitica de la Fase I y que el CSV de
 * referencia (simulink/referencia_analitica_nominal.csv).
 * Uso:  node verificacion/test_modelo.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
const ctx = { console: console };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(raiz, 'gemelo_visual/modelo.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(raiz, 'gemelo_visual/csv.js'), 'utf8'), ctx);
const P = ctx.Polipasto, C = ctx.PolipastoCSV;

let fallos = 0;
function comprobar(nombre, obtenido, esperado, tol) {
  const ok = Math.abs(obtenido - esperado) <= tol;
  if (!ok) { fallos++; }
  console.log((ok ? 'OK   ' : 'FALLA') + '  ' + nombre.padEnd(46) + ' obtenido ' + obtenido.toFixed(4).padStart(10) + '   esperado ' + esperado.toFixed(4));
}

// 1. Caso nominal: valores de la tabla de la Fase I
const p = P.derivar(P.NOMINAL);
const r = P.resumen(p);
console.log('\n== Caso nominal (m=20, n=4, Vc=0.6, ta=1) ==');
comprobar('T en reposo [N]', P.evaluar(0.5, p).T, 61.3125, 1e-9);
comprobar('T al acelerar [N]', P.evaluar(1.5, p).T, 62.25, 1e-9);
comprobar('T al frenar [N]', P.evaluar(16.5, p).T, 60.375, 1e-9);
comprobar('v maxima [m/s]', r.vMax, 0.15, 1e-12);
comprobar('x final [m]', r.xFinal, 2.25, 1e-12);
comprobar('Cabo recogido [m]', r.LcFinal, 9.0, 1e-12);
comprobar('R techo en reposo [N]', P.evaluar(0.5, p).R, 306.5625, 1e-9);
comprobar('P crucero [W]', P.evaluar(5, p).P, 36.7875, 1e-9);
comprobar('P pico [W]', r.Pmax, 37.35, 1e-9);
comprobar('Trabajo total [J]', r.Wtotal, 551.8125, 1e-9);
comprobar('Factor dinamico al acelerar', P.evaluar(1.5, p).fd, 1.0152905, 1e-6);

// 2. Escenarios
console.log('\n== Escenarios ==');
[[100, 2, 530.775], [100, 4, 261.45], [100, 6, 173.425], [20, 2, 126.375], [20, 6, 41.2916667]].forEach(function (e) {
  comprobar('F_op max m=' + e[0] + ' n=' + e[1] + ' [N]', P.resumen(P.derivar({ m: e[0], n: e[1], Vc: 0.6, ta: 1 })).FopMax, e[2], 1e-6);
});
const tope = P.derivar({ m: 20, n: 2, Vc: 1.0, ta: 1 });
comprobar('Tope: inicio del frenado tb [s]', tope.tb, 13, 1e-12);
comprobar('Tope: x final [m]', P.resumen(tope).xFinal, 6, 1e-12);

// 3. Peor caso de los sliders: la cuerda nunca se afloja y la carga no pasa de 6 m
console.log('\n== Barrido de todo el rango de los sliders ==');
let peorTmin = Infinity, peorX = -Infinity, errores = 0;
[10, 55, 100].forEach(function (m) {
  [2, 4, 6].forEach(function (n) {
    for (let Vc = 0.1; Vc <= 1.0001; Vc += 0.05) {
      for (let ta = 0.2; ta <= 2.0001; ta += 0.1) {
        const q = P.derivar({ m: m, n: n, Vc: Vc, ta: ta });
        errores += q.errores.length;
        const s = P.serie(q);
        for (let i = 0; i < s.N; i++) { peorTmin = Math.min(peorTmin, s.T[i]); peorX = Math.max(peorX, s.x[i]); }
      }
    }
  });
});
comprobar('Errores fisicos en todo el rango', errores, 0, 0);
console.log((peorTmin > 0 ? 'OK   ' : 'FALLA') + '  T minima en todo el rango = ' + peorTmin.toFixed(3) + ' N (debe ser > 0)');
console.log((peorX <= 6 + 1e-9 ? 'OK   ' : 'FALLA') + '  x maxima en todo el rango = ' + peorX.toFixed(6) + ' m (debe ser <= 6)');
if (!(peorTmin > 0)) { fallos++; }
if (!(peorX <= 6 + 1e-9)) { fallos++; }

// 4. El modelo reproduce el CSV de referencia (mismo formato que Simulink)
console.log('\n== Modelo frente a referencia_analitica_nominal.csv ==');
const texto = fs.readFileSync(path.join(raiz, 'simulink/referencia_analitica_nominal.csv'), 'utf8');
const leido = C.leerDatos(texto);
const s = P.serie(p);
comprobar('Filas del CSV', leido.datos.N, 2001, 0);
['x', 'v', 'a', 'Lc', 'vc', 'T', 'Fop', 'R', 'P', 'Wop', 'E', 'fd'].forEach(function (k) {
  // El CSV guarda 10 cifras significativas: tolerancia relativa al valor maximo
  let e = 0, escala = 0;
  for (let i = 0; i < s.N; i++) { e = Math.max(e, Math.abs(s[k][i] - leido.datos[k][i])); escala = Math.max(escala, Math.abs(s[k][i])); }
  comprobar('Error maximo en ' + k, e, 0, 1e-9 * escala + 1e-12);
});

// 5. Lectura de un CSV "estropeado" por Excel en espanol (; y coma decimal)
console.log('\n== CSV con punto y coma y coma decimal ==');
const excel = texto.split('\n').slice(0, 5).map(function (l, i) {
  return i === 0 ? l.replace(/,/g, ';') : l.split(',').map(function (v) { return v.replace('.', ','); }).join(';');
}).join('\r\n');
const leidoExcel = C.leerDatos(excel);
comprobar('T en la fila 2 (formato Excel)', leidoExcel.datos.T[1], leido.datos.T[1], 1e-12);

// 6. Exportar y volver a leer da lo mismo
const ida = C.leerDatos(C.escribirDatos(s));
let eIda = 0;
for (let i = 0; i < s.N; i++) { eIda = Math.max(eIda, Math.abs(ida.datos.x[i] - s.x[i])); }
comprobar('Exportar y releer: error en x', eIda, 0, 1e-10);
const par = C.leerParametros(C.escribirParametros(p));
comprobar('Exportar y releer parametros: tb', par.tb, p.tb, 1e-12);

console.log('\n' + (fallos === 0 ? 'TODAS LAS PRUEBAS OK' : fallos + ' PRUEBAS FALLARON'));
process.exit(fallos === 0 ? 0 : 1);
