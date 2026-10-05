%% run_polipasto.m
% Una corrida = un CSV.
% 1) carga los parametros, 2) simula polipasto.slx, 3) exporta los CSV,
% 4) valida contra la solucion analitica y 5) grafica desde el CSV para
% comparar con el Scope.
clear; clc; close all;

%% 1. Parametros (crea las variables en el Workspace)
parametros_polipasto;

%% 2. Simulacion
mdl = 'polipasto';
load_system(mdl);
set_param(mdl, 'ReturnWorkspaceOutputs', 'on');  % todo llega dentro de "out"
Ts_log = dt_out;                                 % To Workspace cada 0.01 s
out = sim(mdl);

%% 3. Exportacion automatica
tabla = exportar_csv(out, par, 'datos_mecanismo.csv', 'parametros_mecanismo.csv');

%% 4. Validacion
t  = tabla.('t [s]');
x  = tabla.('x [m]');      v  = tabla.('v [m/s]');   a = tabla.('a [m/s^2]');
Lc = tabla.('L_c [m]');    vc = tabla.('v_c [m/s]');
T  = tabla.('T [N]');      R  = tabla.('R_techo [N]');
W  = tabla.('W_op [J]');   E  = tabla.('E_mec [J]');
ref = solucion_analitica(t, par);

fprintf('\n=== VALIDACION (caso m=%g kg, n=%d, Vc=%g m/s, ta=%g s) ===\n', m, n, Vc, ta);
fprintf('Prueba 1-3  Newton  max|n*T - M*g - M*a|  = %.2e N\n', max(abs(n*T - M*g - M*a)));
fprintf('Prueba 4    Cinem.  max|x - x0 - L_c/n|   = %.2e m\n', max(abs(x - x0 - Lc/n)));
fprintf('            Cinem.  max|v - v_c/n|        = %.2e m/s\n', max(abs(v - vc/n)));
fprintf('Prueba 5    Energia max|W_op - E_mec|     = %.2e J\n', max(abs(W - E)));
fprintf('Prueba 6    Analit. max|x - x_analitica|  = %.2e m\n', max(abs(x - ref.x)));
fprintf('            Analit. max|T - T_analitica|  = %.2e N\n', max(abs(T - ref.T)));
fprintf('Techo       max|R - (n+1)*T|              = %.2e N\n', max(abs(R - (n+1)*T)));

fprintf('\n--- Valores clave (comparalos con el Scope) ---\n');
i_reposo = find(t >= 0.5, 1);   % un instante dentro del reposo inicial
fprintf('T en reposo        = %8.4f N   (esperado M*g/n = %.4f)\n', T(i_reposo), M*g/n);
fprintf('T maxima / minima  = %8.4f / %.4f N\n', max(T), min(T));
fprintf('Velocidad maxima   = %8.4f m/s\n', max(v));
fprintf('Altura final       = %8.4f m\n', x(end));
fprintf('Cabo recogido      = %8.4f m\n', Lc(end));
fprintf('Trabajo total W_op = %8.4f J\n', W(end));
fprintf('Alarma F_op > %g N = %s\n', Fmax, mat2str(any(tabla.('alarma_Fop [-]') > 0.5)));

%% 5. Graficas desde el CSV (mismo orden que el Scope)
datos = readtable('datos_mecanismo.csv', 'VariableNamingRule', 'preserve');
figure('Name', 'Graficas desde datos_mecanismo.csv', 'Color', 'w');
tl = tiledlayout(6, 1, 'TileSpacing', 'compact');
title(tl, 'Polipasto: variables leidas desde datos\_mecanismo.csv');
tt = datos.('t [s]');
nexttile; plot(tt, datos.('x [m]'), 'LineWidth', 1.2); ylabel('x [m]'); grid on
nexttile; plot(tt, datos.('v [m/s]'), 'LineWidth', 1.2); ylabel('v [m/s]'); grid on
nexttile; plot(tt, datos.('a [m/s^2]'), 'LineWidth', 1.2); ylabel('a [m/s^2]'); grid on
nexttile; plot(tt, datos.('T [N]'), tt, Fmax*ones(size(tt)), '--', 'LineWidth', 1.2);
          ylabel('T = F_{op} [N]'); legend('T', 'F_{max}', 'Location', 'best'); grid on
nexttile; plot(tt, datos.('P [W]'), 'LineWidth', 1.2); ylabel('P [W]'); grid on
nexttile; plot(tt, datos.('W_op [J]'), tt, datos.('E_mec [J]'), '--', 'LineWidth', 1.2);
          ylabel('[J]'); legend('W_{op}', 'E_{mec}', 'Location', 'best'); grid on
xlabel(tl, 't [s]');
