%% parametros_polipasto.m
% Parametros del polipasto manual (caso nominal).
% Ejecutalo ANTES de abrir o correr polipasto.slx: crea las variables en el
% Workspace y el modelo de Simulink solo usa sus nombres.
%
% Para probar otro escenario cambia SOLO esta primera seccion y vuelve a
% ejecutar el script (o usa correr_escenarios.m).

%% 1. Parametros que puedes cambiar (los mismos que tendran los sliders)
m   = 20;     % masa de la carga                      [kg]   rango 10-100
n   = 4;      % ramales que sostienen el bloque movil [-]    2, 4 o 6
Vc  = 0.6;    % velocidad maxima del cabo (mano)      [m/s]  rango 0.1-1.0
ta  = 1;      % duracion del arranque y del frenado   [s]    rango 0.2-2

%% 2. Parametros fijos y calculos derivados
derivados_polipasto;   % calcula M, A, t1, tb, t3, etc. y revisa los limites
