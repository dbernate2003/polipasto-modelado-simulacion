"""Réplica en Python del modelo de Simulink del polipasto (Fase II).
Sirve para fijar los valores que deben verse en el Scope y en el CSV."""
import numpy as np, csv

def params(m=20.0, n=4, Vc=0.6, ta=1.0):
    p = dict(m=m, mb=5.0, g=9.81, n=n, Vc=Vc, t0=1.0, ta=ta, tc=14.0,
             x0=0.0, hmax=6.0, Fmax=300.0, tf=20.0, dt=0.01)
    p['M'] = p['m'] + p['mb']
    p['A'] = Vc / ta
    p['t1'] = p['t0'] + ta                       # fin del arranque
    tcrucero = min(p['tc'], n * p['hmax'] / Vc - ta)  # tope físico (D13)
    p['tb'] = p['t1'] + tcrucero                 # inicio del frenado
    p['t3'] = p['tb'] + ta                       # fin del frenado
    return p

def analitica(t, p):
    """Solución exacta por tramos: a_c constante por tramos."""
    br = [p['t0'], p['t1'], p['tb'], p['t3']]
    acc = [p['A'], 0.0, -p['A'], 0.0]
    t = np.asarray(t, float)
    ac = np.zeros_like(t); vc = np.zeros_like(t); Lc = np.zeros_like(t)
    for tk, dA in zip(br, [p['A'], -p['A'], -p['A'], p['A']]):
        tau = np.clip(t - tk, 0, None)
        ac += dA * (t >= tk)
        vc += dA * tau
        Lc += 0.5 * dA * tau**2
    return ac, vc, Lc

def salidas(t, p):
    ac, vc, Lc = analitica(t, p)
    n, M, g = p['n'], p['M'], p['g']
    a, v, x = ac / n, vc / n, p['x0'] + Lc / n
    T = M * (g + a) / n
    Fop = T
    R = (n + 1) * T
    P = Fop * vc
    E = M * g * (x - p['x0']) + 0.5 * M * v**2
    fd = 1 + a / g
    al = (Fop > p['Fmax']).astype(float)
    return dict(t=t, x=x, v=v, a=a, Lc=Lc, vc=vc, T=T, Fop=Fop, R=R, P=P,
                Wop=E.copy(), E=E, fd=fd, al=al)

def resumen(p, nombre):
    t = np.round(np.arange(0, p['tf'] + 1e-9, p['dt']), 10)
    s = salidas(t, p)
    def at(tt, k): return s[k][np.argmin(abs(t - tt))]
    print(f"\n== {nombre}: m={p['m']} n={p['n']} Vc={p['Vc']} ta={p['ta']} | "
          f"tb={p['tb']:.3f} s, t3={p['t3']:.3f} s")
    print(f"T reposo {at(0.5,'T'):.4f} | T acel {at(1.5,'T'):.4f} | "
          f"T crucero {at(5,'T'):.4f} | T fren {at(p['tb']+p['ta']/2,'T'):.4f} N")
    print(f"a acel {at(1.5,'a'):.4f} | v max {s['v'].max():.4f} | x final {s['x'][-1]:.4f} m | "
          f"Lc final {s['Lc'][-1]:.4f} m")
    print(f"R reposo {at(0.5,'R'):.4f} | R max {s['R'].max():.4f} N")
    print(f"P crucero {at(5,'P'):.4f} | P max (malla) {s['P'].max():.4f} W | "
          f"P pico exacto {p['M']*(p['g']+p['A']/p['n'])/p['n']*p['Vc']:.4f} W")
    print(f"W_op final {s['Wop'][-1]:.4f} J | fd acel {at(1.5,'fd'):.4f} | "
          f"Fop max {s['Fop'].max():.4f} N | alarma {'SÍ' if s['al'].max() else 'no'}")
    return t, s

p = params(); t, s = resumen(p, 'Nominal')
for n in (2, 4, 6): resumen(params(m=100, n=n), f'm=100 kg, n={n}')
resumen(params(n=2, Vc=1.0), 'Tope físico')

# Integración numérica independiente (RK45) para comparar con la analítica
from scipy.integrate import solve_ivp
def f(tt, y):
    ac, _, _ = analitica(np.array([tt]), p)
    P = p['M'] * (p['g'] + ac[0] / p['n']) / p['n'] * y[1] * p['n']
    return [y[1], ac[0] / p['n'], P]
sol = solve_ivp(f, [0, 20], [0, 0, 0], method='RK45', rtol=1e-6, atol=1e-8,
                t_eval=t, max_step=0.4)
print(f"\nRK45 sin cortar en los cambios: error max x = {abs(sol.y[0]-s['x']).max():.2e} m, "
      f"error W_op = {abs(sol.y[2][-1]-s['Wop'][-1]):.2e} J, pasos = {sol.t.size}")

# CSV de referencia con el mismo encabezado que exportará Simulink
cab = ['t [s]', 'x [m]', 'v [m/s]', 'a [m/s^2]', 'L_c [m]', 'v_c [m/s]', 'T [N]',
       'F_op [N]', 'R_techo [N]', 'P [W]', 'W_op [J]', 'E_mec [J]',
       'factor_dinamico [-]', 'alarma_Fop [-]']
keys = ['t', 'x', 'v', 'a', 'Lc', 'vc', 'T', 'Fop', 'R', 'P', 'Wop', 'E', 'fd', 'al']
with open('referencia_analitica_nominal.csv', 'w', newline='') as fh:
    w = csv.writer(fh); w.writerow(cab)
    for i in range(t.size): w.writerow([f"{s[k][i]:.10g}" for k in keys])
print('CSV de referencia escrito:', t.size, 'filas')
