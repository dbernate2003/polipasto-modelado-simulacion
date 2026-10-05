%% comparar_solvers.m
% Evidencia para justificar el solver (rubrica: "solver analiticamente
% justificado", no el solver por defecto).
% Corre polipasto.slx con varios solvers y compara:
%   - numero de pasos que dio el solver,
%   - tiempo de computo,
%   - error maximo en x y v frente a la solucion analitica,
%   - error de energia al final |W_op - E_mec analitica|.
% Al terminar deja el modelo otra vez en ode45 de paso variable.
clear; clc;
parametros_polipasto;
mdl = 'polipasto';
load_system(mdl);
set_param(mdl, 'ReturnWorkspaceOutputs', 'on');

% Para CONTAR PASOS, el To Workspace no debe forzar puntos cada 0.01 s:
% con Ts_log = -1 hereda el paso del solver y guarda un punto por paso.
Ts_log = -1;
set_param(mdl, 'OutputOption', 'RefineOutputTimes', 'Refine', '1');

%   nombre                 tipo            solver    paso
casos = {'ode45 (RK 4/5, explicito)',  'Variable-step', 'ode45',  '';
         'ode23t (trapecio, implicito)','Variable-step', 'ode23t', '';
         'ode15s (BDF, implicito)',     'Variable-step', 'ode15s', '';
         'ode4 h=0.01 (RK4, explicito)','Fixed-step',    'ode4',   '0.01';
         'ode4 h=0.03 (no cae en t=1,2,16,17)','Fixed-step','ode4', '0.03';
         'ode1 h=0.01 (Euler adelante)','Fixed-step',    'ode1',   '0.01';
         'ode1be h=0.01 (Euler atras)', 'Fixed-step',    'ode1be', '0.01'};

nc = size(casos, 1);
pasos = nan(nc,1); tiempo_ms = nan(nc,1);
err_x = nan(nc,1); err_v = nan(nc,1); err_E = nan(nc,1);
E_final = M*g*hmax_alcanzada(par);   % energia final exacta (la carga queda quieta)

for k = 1:nc
    try
        if strcmp(casos{k,2}, 'Variable-step')
            set_param(mdl, 'SolverType', 'Variable-step', 'Solver', casos{k,3}, ...
                'RelTol', '1e-6', 'AbsTol', '1e-8', 'MaxStep', 'auto');
        else
            set_param(mdl, 'SolverType', 'Fixed-step', 'Solver', casos{k,3}, ...
                'FixedStep', casos{k,4});
        end
        out = sim(mdl);                       % primera corrida (compila)
        tiempos = zeros(3,1);
        for r = 1:3                           % tres corridas para medir tiempo
            tic; out = sim(mdl); tiempos(r) = toc;
        end
        t = out.datos.time;
        Y = squeeze(out.datos.signals.values);
        if size(Y,1) ~= numel(t), Y = Y.'; end
        ref = solucion_analitica(t, par);
        pasos(k)     = numel(t) - 1;
        tiempo_ms(k) = 1000*median(tiempos);
        err_x(k)     = max(abs(Y(:,1) - ref.x));
        err_v(k)     = max(abs(Y(:,2) - ref.v));
        err_E(k)     = abs(Y(end,10) - E_final);   % columna 10 = W_op
    catch ME
        fprintf('No se pudo correr %s: %s\n', casos{k,1}, ME.message);
    end
end

resultado = table(casos(:,1), pasos, tiempo_ms, err_x, err_v, err_E, ...
    'VariableNames', {'solver', 'pasos', 'tiempo_ms', 'error_max_x_m', ...
                      'error_max_v_m_s', 'error_W_op_J'});
disp(resultado);
writetable(resultado, 'comparacion_solvers.csv');
fprintf('Tabla guardada en comparacion_solvers.csv (para la memoria).\n');

%% Dejar el modelo como estaba: ode45, paso variable
set_param(mdl, 'SolverType', 'Variable-step', 'Solver', 'ode45', ...
    'RelTol', '1e-6', 'AbsTol', '1e-8', 'MaxStep', 'auto', 'Refine', '4');
Ts_log = dt_out;
save_system(mdl);

%% Funcion local: altura final exacta del perfil
function dx = hmax_alcanzada(par)
% Cabo total recogido = Vc*(ta + t_crucero); la carga sube eso dividido n.
dx = par.Vc*(par.ta + par.t_crucero)/par.n;
end
