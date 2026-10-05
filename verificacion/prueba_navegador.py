"""Prueba del gemelo visual en Chromium sin cabeza (abre index.html desde file://).
Uso: python3 verificacion/prueba_navegador.py [carpeta_capturas]
Comprueba que no haya errores en la consola, carga el CSV de referencia,
recorre los escenarios, mueve sliders y guarda capturas en claro y oscuro."""
import sys, pathlib
from playwright.sync_api import sync_playwright

raiz = pathlib.Path(__file__).resolve().parent.parent
url = (raiz / 'gemelo_visual' / 'index.html').as_uri()
salida = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else raiz / 'verificacion' / 'capturas')
salida.mkdir(parents=True, exist_ok=True)
errores = []

with sync_playwright() as pw:
    nav = pw.chromium.launch()
    pag = nav.new_page(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    pag.on('console', lambda m: errores.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
    pag.on('pageerror', lambda e: errores.append(f'pageerror: {e}'))
    pag.goto(url)
    pag.wait_for_timeout(600)

    # 1. Estado inicial y un instante en pleno arranque
    pag.evaluate("document.getElementById('lineaTiempo').value = 150; document.getElementById('lineaTiempo').dispatchEvent(new Event('input'))")
    pag.wait_for_timeout(300)
    pag.screenshot(path=str(salida / '01_inicio_claro.png'), full_page=True)

    # 2. Cargar el CSV de referencia como si fuera el de Simulink
    ej = raiz / 'gemelo_visual' / 'datos_ejemplo'
    pag.set_input_files('#archivo', [str(ej / 'datos_mecanismo_ejemplo.csv'), str(ej / 'parametros_mecanismo_ejemplo.csv')])
    pag.wait_for_timeout(500)
    print('fuente:', pag.inner_text('#fuente'))
    print('validacion:', pag.inner_text('#validacion')[:400].replace('\n', ' | '))
    pag.evaluate("document.getElementById('lineaTiempo').value = 900; document.getElementById('lineaTiempo').dispatchEvent(new Event('input'))")
    pag.wait_for_timeout(300)
    pag.screenshot(path=str(salida / '02_csv_cargado.png'), full_page=True)

    # 3. Escenario de sobrecarga en t = 1.5 s
    pag.click('.esc-btn >> nth=2')
    pag.wait_for_timeout(200)
    pag.click('#btnPlay')  # pausa
    pag.evaluate("document.getElementById('lineaTiempo').value = 150; document.getElementById('lineaTiempo').dispatchEvent(new Event('input'))")
    pag.wait_for_timeout(300)
    print('nota sobrecarga:', pag.inner_text('#escObservar'))
    print('medidor fuerza:', pag.inner_text('#medFuerza'))
    pag.screenshot(path=str(salida / '03_sobrecarga.png'), full_page=False)

    # 4. Osciloscopio y tema oscuro, escenario tope a t = 13.4 s
    pag.click('.esc-btn >> nth=6')
    pag.wait_for_timeout(200)
    pag.click('#btnPlay')
    pag.click('[data-vista="osc"]')
    pag.click('#btnTema')
    pag.evaluate("document.getElementById('lineaTiempo').value = 1340; document.getElementById('lineaTiempo').dispatchEvent(new Event('input'))")
    pag.wait_for_timeout(400)
    pag.screenshot(path=str(salida / '04_tope_oscuro_osciloscopio.png'), full_page=True)

    # 5. Slider de masa en vivo y pestanas del DCL
    pag.click('#btnTema')
    pag.click('[data-vista="tres"]')
    pag.fill('#nmM', '55')
    pag.press('#nmM', 'Enter')
    pag.wait_for_timeout(200)
    for cuerpo in ['fijo', 'polea', 'operario']:
        pag.click(f'[data-cuerpo="{cuerpo}"]')
        pag.wait_for_timeout(150)
        pag.locator('.dcl').screenshot(path=str(salida / f'05_dcl_{cuerpo}.png'))
    pag.fill('#nmM', '250')
    pag.press('#nmM', 'Enter')
    pag.wait_for_timeout(200)
    print('aviso parametro fuera de rango:', pag.inner_text('#avisoParam'))

    # 6. Proyector 1366x768
    pag.set_viewport_size({'width': 1366, 'height': 768})
    pag.click('.esc-btn >> nth=0')
    pag.click('#btnPlay')
    pag.evaluate("document.getElementById('lineaTiempo').value = 600; document.getElementById('lineaTiempo').dispatchEvent(new Event('input'))")
    pag.wait_for_timeout(400)
    pag.screenshot(path=str(salida / '06_proyector_1366x768.png'), full_page=False)

    # 7. Reproduccion real durante 1 s para ver que el tiempo avanza
    pag.evaluate("document.getElementById('lineaTiempo').value = 0; document.getElementById('lineaTiempo').dispatchEvent(new Event('input'))")
    pag.click('#btnPlay')
    pag.wait_for_timeout(1000)
    print('tiempo tras 1 s de reproduccion:', pag.inner_text('#tiempo'))

    # 8. Movil
    pag.set_viewport_size({'width': 400, 'height': 860})
    pag.wait_for_timeout(300)
    pag.screenshot(path=str(salida / '07_movil.png'), full_page=False)
    nav.close()

print('\nERRORES DE CONSOLA:', len(errores))
for e in errores:
    print('  ', e)
