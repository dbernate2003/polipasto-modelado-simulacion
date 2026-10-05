// Genera docs/Guia_instalacion_polipasto.docx (uso: node verificacion/generar_guia_docx.js, requiere npm i docx)
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, LevelFormat,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, ImageRun,
  ExternalHyperlink, Footer, PageNumber, TabStopType, LineRuleType
} = require('docx');

const RAIZ = path.join(__dirname, '..');
const URL_REPO = 'https://github.com/dbernate2003/polipasto-modelado-simulacion';
const TINTA = '16212A', TENUE = '5B6873', AMARILLO = 'F2B705', AZUL = '1B63AE';
const ANCHO = 9360; // 6.5 in en DXA (carta con margenes de 1 in)

// ---------- utilidades ----------
let listas = 0;
const refsListas = [];
function nuevaLista() { listas += 1; const r = 'pasos' + listas; refsListas.push(r); return r; }

/** Texto con **negritas** y `codigo` marcados en linea. */
function runs(texto, base) {
  base = base || {};
  const out = [];
  const partes = texto.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  partes.forEach((p) => {
    if (p.startsWith('**')) out.push(new TextRun({ text: p.slice(2, -2), bold: true, ...base }));
    else if (p.startsWith('`')) out.push(new TextRun({ text: p.slice(1, -1), font: 'Consolas', size: 20, color: '0E5A66', ...base }));
    else out.push(new TextRun({ text: p, ...base }));
  });
  return out;
}

function parrafo(texto, op) {
  op = op || {};
  return new Paragraph({ children: runs(texto, op.run), spacing: { after: op.after ?? 120, before: op.before ?? 0 }, alignment: op.align });
}

function h1(texto) { return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(texto)] }); }
function h2(texto) { return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(texto)] }); }

function pasos(lista) {
  const ref = nuevaLista();
  return lista.map((t) => new Paragraph({ numbering: { reference: ref, level: 0 }, children: runs(t), spacing: { after: 80 } }));
}

function vinetas(lista) {
  return lista.map((t) => new Paragraph({ numbering: { reference: 'vinetas', level: 0 }, children: runs(t), spacing: { after: 60 } }));
}

function nota(texto, titulo) {
  const hijos = [];
  if (titulo) hijos.push(new TextRun({ text: titulo + ' ', bold: true }));
  runs(texto).forEach((r) => hijos.push(r));
  return new Paragraph({
    children: hijos,
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'FFF7DD' },
    border: { left: { style: BorderStyle.SINGLE, size: 24, color: AMARILLO, space: 8 } },
    indent: { left: 160, right: 160 },
    spacing: { before: 120, after: 200 }
  });
}

function codigo(texto) {
  return new Paragraph({
    children: [new TextRun({ text: texto, font: 'Consolas', size: 20 })],
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'EEF1F3' },
    indent: { left: 160 },
    spacing: { before: 60, after: 160 }
  });
}

const bordeCelda = { style: BorderStyle.SINGLE, size: 4, color: 'C7CFD5' };
const bordes = { top: bordeCelda, bottom: bordeCelda, left: bordeCelda, right: bordeCelda };

function tabla(encabezados, filas, anchos) {
  const total = anchos.reduce((a, b) => a + b, 0);
  const celda = (t, i, cab) => new TableCell({
    borders: bordes,
    width: { size: anchos[i], type: WidthType.DXA },
    shading: cab ? { type: ShadingType.CLEAR, color: 'auto', fill: 'DCE2E6' } : undefined,
    margins: { top: 70, bottom: 70, left: 110, right: 110 },
    children: [new Paragraph({ children: runs(t, cab ? { bold: true } : { size: 20 }), spacing: { after: 0 } })]
  });
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: anchos,
    rows: [
      new TableRow({ tableHeader: true, children: encabezados.map((t, i) => celda(t, i, true)) }),
      ...filas.map((f) => new TableRow({ cantSplit: true, children: f.map((t, i) => celda(t, i, false)) }))
    ]
  });
}

function imagen(archivo, anchoPx, pie) {
  const ruta = path.join(RAIZ, 'docs', 'capturas', archivo);
  const buf = fs.readFileSync(ruta);
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20); // cabecera PNG
  const alto = Math.round(anchoPx * h / w);
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { before: 120, after: 60, line: 240, lineRule: LineRuleType.AUTO }, keepNext: true,
      children: [new ImageRun({ type: 'png', data: buf, transformation: { width: anchoPx, height: alto },
        altText: { title: pie, description: pie, name: archivo } })]
    }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: pie, italics: true, size: 18, color: TENUE })] })
  ];
}

function enlace(texto, url) {
  return new ExternalHyperlink({ link: url, children: [new TextRun({ text: texto, style: 'Hyperlink' })] });
}

// ---------- contenido ----------
const c = [];

c.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: 'Guía de instalación del polipasto', bold: true, size: 44, color: TINTA })] }));
c.push(new Paragraph({ spacing: { after: 240 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: AMARILLO, space: 6 } },
  children: [new TextRun({ text: 'Repositorio, simulador y entrega del CSV de Simulink. Modelado y Simulación, Universidad Popular del Cesar, 2026-2.', size: 22, color: TENUE })] }));

c.push(parrafo('Con esta guía descargas el proyecto, abres el simulador sin instalar nada, generas el CSV desde Simulink, compruebas que coincide con el simulador y subes tus archivos al repositorio. Sin contar el armado del modelo en Simulink, toma unos 15 minutos.'));
c.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: 'Repositorio: ', bold: true }), enlace(URL_REPO, URL_REPO)] }));

// 1
c.push(h1('1. Qué necesitas'));
c.push(tabla(['Programa', 'Para qué sirve', '¿Hace falta?'], [
  ['Google Chrome o Microsoft Edge', 'Abrir el simulador', 'Sí'],
  ['MATLAB R2023b o más reciente, con Simulink', 'Fase II: modelo, solver y CSV', 'Sí, para tu parte'],
  ['Cuenta de GitHub', 'Subir tus archivos al repositorio', 'Sí, para subir'],
  ['GitHub Desktop o Git', 'Subir cambios con historial', 'No (también se puede desde la web)'],
  ['Python con pandas y matplotlib (Jupyter o VS Code)', 'Notebook de contraste, como en los Talleres 2 y 3', 'No']
], [3400, 3700, 2260]));
c.push(parrafo('', { after: 60 }));
c.push(nota('No necesitas internet para usar el simulador: todo está en la carpeta y no descarga nada.', 'Bueno saberlo.'));

// 2
c.push(h1('2. Descargar el repositorio'));
c.push(h2('Opción A: descargar el ZIP (la más fácil)'));
c.push(...pasos([
  'Abre el enlace del repositorio en el navegador.',
  'Haz clic en el botón verde **Code** y luego en **Download ZIP**.',
  'Descomprime el archivo: clic derecho sobre el ZIP → **Extraer todo**. Elige una carpeta fácil de encontrar, por ejemplo `Documentos\\polipasto`.',
  'Trabaja siempre en la carpeta descomprimida. Si abres los archivos desde dentro del ZIP, MATLAB no podrá guardar el modelo y el simulador puede quedar en blanco.'
]));
c.push(h2('Opción B: clonar con GitHub Desktop (recomendada para subir cambios)'));
c.push(...pasos([
  'Instala GitHub Desktop desde desktop.github.com e inicia sesión con tu cuenta.',
  'Menú **File → Clone repository → URL**, pega el enlace del repositorio y elige la carpeta local.',
  'Haz clic en **Clone**. Cada vez que vayas a trabajar, pulsa primero **Fetch origin** y luego **Pull** para traer lo último.'
]));
c.push(parrafo('Con Git en la terminal es lo mismo:'));
c.push(codigo('git clone ' + URL_REPO + '.git'));
c.push(nota('para poder subir archivos tienes que ser colaborador. Tu compañero te invita desde GitHub en **Settings → Collaborators → Add people**; te llega un correo y aceptas la invitación. Descargar no requiere invitación.', 'Importante:'));

// 3
c.push(h1('3. Qué hay en el repositorio'));
c.push(tabla(['Carpeta', 'Contenido', 'Quién la usa'], [
  ['`simulink/`', 'Scripts de MATLAB de la Fase II. Aquí se guardan `polipasto.slx` y los CSV que generes.', 'Tú (Fase II)'],
  ['`gemelo_visual/`', 'El simulador: `index.html` y sus archivos `.js` y `.css`. También `datos_ejemplo/` para probar sin MATLAB.', 'Los dos'],
  ['`verificacion/`', 'Pruebas automáticas del modelo y del simulador.', 'Opcional'],
  ['`docs/`', 'Esta guía y las capturas.', 'Los dos'],
  ['`README.md`', 'Resumen del proyecto que se ve en la página de GitHub.', 'Los dos']
], [2100, 5160, 2100]));

// 4
c.push(h1('4. Abrir el simulador (prueba de 2 minutos)'));
c.push(...pasos([
  'Entra a la carpeta `gemelo_visual` y haz doble clic en `index.html`. Se abre en el navegador. Si se abre con otro programa: clic derecho → **Abrir con** → Google Chrome o Microsoft Edge.',
  'Pulsa el botón redondo de reproducir (o la barra espaciadora). La carga sube, la cuerda corre por las poleas y el cursor recorre las gráficas.',
  'Haz clic en **Cargar CSV**, entra a `gemelo_visual\\datos_ejemplo` y selecciona los **dos** archivos a la vez: el primero con un clic y el segundo con Ctrl + clic. Luego **Abrir**.',
  'Arriba debe aparecer en verde **Datos: datos_mecanismo_ejemplo.csv (2001 filas)** y el modo **Simulink (CSV)** activo.',
  'Baja hasta el panel **Validación contra Simulink**: todas las filas deben decir **Coincide** y la última **Cierra**.'
]));
c.push(...imagen('01_simulador_simulink.png', 600, 'Simulador con los datos cargados. Arriba los escenarios; en el centro el mecanismo, las gráficas y los parámetros.'));
c.push(nota('si eso funciona en tu computador, el simulador está listo. Los archivos de ejemplo son la solución exacta del caso nominal: son lo que tu Simulink debe producir.', 'Listo:'));

// 5
c.push(h1('5. Tu parte: generar el CSV desde Simulink'));
c.push(parrafo('El armado del modelo bloque a bloque está explicado en la guía de la Fase II que te comparte tu compañero («Fase II · Simulink del polipasto paso a paso»). Aquí solo va el orden de trabajo dentro del repositorio.'));
c.push(...pasos([
  'Abre MATLAB. En el panel **Current Folder** navega hasta la carpeta `simulink` del repositorio y entra a ella con doble clic. Todo se hace desde ahí.',
  'En la Command Window escribe `parametros_polipasto` y Enter. En el Workspace deben aparecer, entre otras, `m = 20`, `n = 4`, `M = 25`, `tb = 16` y `t_fin = 20`.',
  'Arma `polipasto.slx` siguiendo la guía de la Fase II y guárdalo **en la carpeta simulink**, con ese nombre exacto. Si te bloqueas, `construir_polipasto` crea un modelo de respaldo para comparar.',
  'Ejecuta `run_polipasto`. Crea `datos_mecanismo.csv` y `parametros_mecanismo.csv` en la carpeta `simulink` e imprime las pruebas de validación.',
  'Ejecuta `comparar_solvers` (crea `comparacion_solvers.csv`, la evidencia del solver) y `correr_escenarios` (crea la carpeta `escenarios`).'
]));
c.push(parrafo('Valores que confirman que el modelo está bien (caso nominal):', { before: 120 }));
c.push(tabla(['Qué revisar', 'Valor esperado'], [
  ['Filas de `datos_mecanismo.csv`', '2001 (de 0 a 20 s, cada 0.01 s), con `t [s]` como primera columna'],
  ['Altura final de la carga x', '2.25 m'],
  ['Tensión en reposo / al arrancar / al frenar', '61.31 N / 62.25 N / 60.38 N'],
  ['Velocidad máxima de la carga', '0.15 m/s'],
  ['Trabajo total del operario W_op', '551.81 J'],
  ['Escenario m = 100 kg, n = 2', 'Alarma de F_op: llega a 530.78 N, más que 300 N']
], [4680, 4680]));

// 6
c.push(h1('6. Comprobar tu CSV en el simulador'));
c.push(...pasos([
  'Abre `gemelo_visual/index.html`.',
  'Haz clic en **Cargar CSV**, entra a la carpeta `simulink` y selecciona a la vez `datos_mecanismo.csv` y `parametros_mecanismo.csv`. También puedes arrastrar los dos archivos sobre la ventana.',
  'Arriba debe decir en verde **Datos: datos_mecanismo.csv (2001 filas)**.',
  'En el panel **Validación contra Simulink** todas las variables deben decir **Coincide**. Si alguna dice **Revisar**, mira la sección 8.',
  'Pon el Scope de Simulink al lado del simulador en el mismo instante y toma la captura comparativa para la memoria.'
]));
c.push(nota('esa coincidencia entre Simulink, el CSV y el simulador es lo que pide la rúbrica («coincidencia total con Simulink»). El panel la demuestra con números: error máximo y RMS.', 'Por qué importa:'));

// 7
c.push(h1('7. Subir tus archivos al repositorio'));
c.push(parrafo('Sube a la carpeta `simulink`: `polipasto.slx`, `datos_mecanismo.csv`, `parametros_mecanismo.csv`, `comparacion_solvers.csv` y la carpeta `escenarios`. Las capturas del Scope van en `docs/capturas`.'));
c.push(h2('Opción A: desde la página de GitHub'));
c.push(...pasos([
  'Abre el repositorio y entra a la carpeta `simulink`.',
  'Haz clic en **Add file → Upload files** y arrastra los archivos. En Chrome o Edge también puedes arrastrar la carpeta `escenarios` completa.',
  'Abajo escribe un mensaje corto, por ejemplo «Agrega el modelo de Simulink y los CSV», y pulsa **Commit changes**.'
]));
c.push(h2('Opción B: con GitHub Desktop'));
c.push(...pasos([
  'Pulsa **Fetch origin** y, si aparece, **Pull origin**, para traer primero lo que haya subido tu compañero.',
  'A la izquierda verás tus archivos nuevos. Escribe un resumen abajo y pulsa **Commit to main**.',
  'Pulsa **Push origin**.'
]));
c.push(h2('Opción C: con Git en la terminal'));
c.push(codigo('git pull'));
c.push(codigo('git add simulink'));
c.push(codigo('git commit -m "Agrega el modelo de Simulink y los CSV"'));
c.push(codigo('git push'));
c.push(nota('el archivo `.gitignore` ya filtra lo que no debe subirse: autoguardados `.asv`, la carpeta `slprj`, los `.slxc`, la copia `polipasto_respaldo.slx` y los archivos temporales de Word y Windows. Si GitHub Desktop no los muestra en la lista, es por eso, y está bien.', 'No te preocupes por la basura:'));

// 8
c.push(h1('8. Problemas frecuentes'));
c.push(tabla(['Problema', 'Causa', 'Solución'], [
  ['`index.html` se abre en el Bloc de notas', 'Windows lo asoció a otro programa', 'Clic derecho → **Abrir con** → Chrome o Edge'],
  ['El simulador se ve en blanco', 'Se abrió desde dentro del ZIP o falta un `.js`', 'Descomprime todo el ZIP y abre `index.html` desde la carpeta `gemelo_visual`'],
  ['«No reconozco el archivo» al cargar', 'Se eligió otro CSV', 'Carga `datos_mecanismo.csv` (empieza por `t [s]`) y `parametros_mecanismo.csv` (empieza por `parametro`)'],
  ['La validación dice «Revisar»', 'Un bloque mal conectado, un signo de Step o el orden del `Mux_datos`', 'Compara el Scope con la tabla de la sección 5, revisa el orden de las 13 entradas del Mux y vuelve a correr `run_polipasto`'],
  ['Abriste el CSV en Excel y lo guardaste', 'Excel cambia el formato (punto y coma, coma decimal)', 'El simulador lo lee igual, pero no lo subas así: vuelve a generarlo con `run_polipasto`'],
  ['MATLAB: `Unrecognized function or variable \'n\'`', 'El Workspace está vacío', 'Ejecuta `parametros_polipasto` antes de correr el modelo'],
  ['MATLAB no encuentra `run_polipasto`', 'La carpeta actual no es `simulink`', 'Entra a la carpeta `simulink` en Current Folder'],
  ['GitHub: no tienes permiso para subir', 'Aún no eres colaborador', 'Acepta la invitación que llegó a tu correo'],
  ['El push es rechazado («fetch first»)', 'Tu compañero subió cambios antes', 'Haz **Pull** (o `git pull`) y luego vuelve a hacer **Push**']
], [2700, 2900, 3760]));

// 9
c.push(h1('9. Lista final'));
c.push(...vinetas([
  'El simulador abre en tu computador y la validación con los datos de ejemplo dice **Coincide**.',
  '`polipasto.slx` está en `simulink/` y el Scope muestra los valores de la sección 5.',
  '`run_polipasto` genera los dos CSV y el simulador los valida con **Coincide**.',
  '`comparacion_solvers.csv` y la carpeta `escenarios` existen y la alarma aparece con m = 100 kg y n = 2.',
  'Todo está subido al repositorio y tu compañero lo ve en GitHub.',
  'Probaste el simulador en el computador de la exposición, **sin internet**.'
]));

// ---------- documento ----------
const numeracion = refsListas.map((ref) => ({
  reference: ref,
  levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 400, hanging: 300 } }, run: { bold: true, color: TINTA } } }]
}));
numeracion.push({
  reference: 'vinetas',
  levels: [{ level: 0, format: LevelFormat.BULLET, text: '☐', alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 400, hanging: 300 } } } }]
});

const doc = new Document({
  creator: 'dbernate2003',
  title: 'Guía de instalación del polipasto',
  description: 'Repositorio, simulador y entrega del CSV de Simulink',
  styles: {
    default: { document: { run: { font: 'Calibri', size: 22, color: TINTA }, paragraph: { spacing: { line: 276, lineRule: LineRuleType.AUTO } } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: 'Calibri', size: 30, bold: true, color: TINTA },
        paragraph: { spacing: { before: 360, after: 140 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: 'Calibri', size: 24, bold: true, color: AZUL },
        paragraph: { spacing: { before: 220, after: 100 }, outlineLevel: 1 } }
    ]
  },
  numbering: { config: numeracion },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1300, bottom: 1300, left: 1440, right: 1440 } } },
    footers: {
      default: new Footer({ children: [new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: ANCHO }],
        children: [new TextRun({ text: 'Polipasto · Modelado y Simulación UPC', size: 18, color: TENUE }),
          new TextRun({ children: ['\tPágina ', PageNumber.CURRENT], size: 18, color: TENUE })]
      })] })
    },
    children: c
  }]
});

Packer.toBuffer(doc).then((buf) => {
  const salida = path.join(RAIZ, 'docs', 'Guia_instalacion_polipasto.docx');
  fs.writeFileSync(salida, buf);
  console.log('escrito', salida, buf.length, 'bytes');
});
