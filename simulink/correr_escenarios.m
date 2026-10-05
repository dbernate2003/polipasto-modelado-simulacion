%% correr_escenarios.m
% Corre varios escenarios y guarda una copia del CSV de cada uno en la
% carpeta escenarios/ (para superponerlos en Python, como en el Taller 2).
% Al final vuelve a dejar datos_mecanismo.csv con el caso nominal.
clear; clc;
mdl = 'polipasto';
load_system(mdl);
set_param(mdl, 'ReturnWorkspaceOutputs', 'on');
if ~exist('escenarios', 'dir'), mkdir('escenarios'); end

%            nombre            m    n   Vc   ta
escenarios = {'nominal_n4',    20,  4,  0.6, 1;
              'm20_n2',        20,  2,  0.6, 1;
              'm20_n6',        20,  6,  0.6, 1;
              'm100_n2',      100,  2,  0.6, 1;   % debe activar la alarma
              'm100_n4',      100,  4,  0.6, 1;
              'm100_n6',      100,  6,  0.6, 1;
              'tope_n2_Vc1',   20,  2,  1.0, 1};  % final de carrera en 6 m

for k = 1:size(escenarios, 1)
    nombre = escenarios{k,1};
    m = escenarios{k,2}; n = escenarios{k,3};
    Vc = escenarios{k,4}; ta = escenarios{k,5};
    derivados_polipasto;                  % recalcula M, A, tb, ... y revisa
    out = sim(mdl);
    fprintf('\n[%s] ', nombre);
    tabla = exportar_csv(out, par, fullfile('escenarios', ['datos_' nombre '.csv']), ...
                                  fullfile('escenarios', ['parametros_' nombre '.csv']));
    Fop_k = tabla.('F_op [N]');  x_k = tabla.('x [m]');  al_k = tabla.('alarma_Fop [-]');
    fprintf('   F_op max = %.2f N | x final = %.3f m | alarma = %d\n', ...
        max(Fop_k), x_k(end), any(al_k > 0.5));
end

% Deja el caso nominal como datos oficiales
parametros_polipasto;
out = sim(mdl);
exportar_csv(out, par, 'datos_mecanismo.csv', 'parametros_mecanismo.csv');
