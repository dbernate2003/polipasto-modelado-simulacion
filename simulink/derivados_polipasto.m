%% derivados_polipasto.m
% Parametros fijos, calculos derivados y revision de limites.
% Lo llaman parametros_polipasto.m y correr_escenarios.m; no lo edites
% para cambiar escenarios (cambia m, n, Vc y ta en esos scripts).

%% Parametros fijos
mb     = 5;      % masa del bloque movil (gancho + poleas)  [kg]
g      = 9.81;   % gravedad                                 [m/s^2]
t0     = 1;      % reposo inicial                           [s]
tc     = 14;     % duracion nominal de la velocidad constante [s]
x0     = 0;      % altura inicial de la carga               [m]
hmax   = 6;      % altura maxima de izaje (final de carrera) [m]
Fmax   = 300;    % fuerza maxima del operario (Harrington, 2022) [N]
t_fin  = 20;     % tiempo de simulacion (Stop time)         [s]
dt_out = 0.01;   % paso de salida del CSV                   [s]
Ts_log = dt_out; % periodo de muestreo del bloque To Workspace [s]
                 % (comparar_solvers.m lo pone en -1 para contar pasos)

%% Calculos derivados
M  = m + mb;           % masa total que sube (carga + bloque movil) [kg]
A  = Vc/ta;            % aceleracion del cabo al arrancar/frenar     [m/s^2]
t1 = t0 + ta;          % fin del arranque                            [s]

% Final de carrera (decision D13): si con el crucero nominal la carga
% pasaria de hmax, el frenado empieza antes. Cabo total permitido:
% n*(hmax - x0) = Vc*(ta + t_crucero)  ->  t_crucero = n*(hmax-x0)/Vc - ta
t_crucero = min(tc, n*(hmax - x0)/Vc - ta);   % [s]
tb = t1 + t_crucero;   % inicio del frenado                          [s]
t3 = tb + ta;          % fin del frenado (la carga queda quieta)     [s]

%% Revision de limites (nada fisicamente imposible)
assert(any(n == [2 4 6]), 'n debe ser 2, 4 o 6.');
assert(m >= 10 && m <= 100, 'm debe estar entre 10 y 100 kg.');
assert(ta > 0, 'ta debe ser positivo.');
assert(A/n < g, 'Con A/n >= g la cuerda se aflojaria al frenar (T <= 0).');
assert(t_crucero >= 0, 'Perfil imposible: ta demasiado largo para hmax.');
assert(t3 <= t_fin, 'El perfil no cabe en el tiempo de simulacion.');

if t_crucero < tc
    fprintf('Aviso: final de carrera activo. El frenado empieza en tb = %.3f s.\n', tb);
end

%% Todo en una estructura (para exportar y para los scripts)
par = struct('m',m,'mb',mb,'M',M,'g',g,'n',n,'Vc',Vc,'t0',t0,'ta',ta, ...
    'tc',tc,'t_crucero',t_crucero,'t1',t1,'tb',tb,'t3',t3,'A',A, ...
    'x0',x0,'hmax',hmax,'Fmax',Fmax,'t_fin',t_fin,'dt_out',dt_out);
