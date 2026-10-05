function tabla = exportar_csv(out, par, archivo_datos, archivo_param)
%EXPORTAR_CSV Escribe los resultados de una corrida de polipasto.slx.
%   tabla = exportar_csv(out, par, 'datos_mecanismo.csv', 'parametros_mecanismo.csv')
%   - out: lo que devuelve sim('polipasto')
%   - par: estructura de parametros creada por derivados_polipasto.m
%   La primera columna es el tiempo t [s], como exige la guia.

% El bloque To Workspace "datos" guarda (formato Structure With Time):
%   datos.time            -> vector columna de tiempos
%   datos.signals.values  -> matriz N x 13, una columna por entrada del Mux
t = out.datos.time;
Y = squeeze(out.datos.signals.values);
if size(Y,1) ~= numel(t), Y = Y.'; end   % por si llega transpuesta

nombres = {'t [s]', 'x [m]', 'v [m/s]', 'a [m/s^2]', 'L_c [m]', ...
    'v_c [m/s]', 'T [N]', 'F_op [N]', 'R_techo [N]', 'P [W]', ...
    'W_op [J]', 'E_mec [J]', 'factor_dinamico [-]', 'alarma_Fop [-]'};
assert(size(Y,2) == numel(nombres) - 1, ...
    'El Mux_datos debe tener 13 entradas en el orden de la guia.');

tabla = array2table([t, Y], 'VariableNames', nombres);
writetable(tabla, archivo_datos);          % coma como separador, punto decimal

% Parametros de la corrida (los leera el gemelo visual)
parametro = {'m';'mb';'M';'g';'n';'Vc';'t0';'ta';'tc';'tb';'t3';'A'; ...
             'x0';'hmax';'Fmax';'t_fin';'dt_out'};
valor  = [par.m; par.mb; par.M; par.g; par.n; par.Vc; par.t0; par.ta; ...
          par.tc; par.tb; par.t3; par.A; par.x0; par.hmax; par.Fmax; ...
          par.t_fin; par.dt_out];
unidad = {'kg';'kg';'kg';'m/s^2';'-';'m/s';'s';'s';'s';'s';'s';'m/s^2'; ...
          'm';'m';'N';'s';'s'};
writetable(table(parametro, valor, unidad), archivo_param);

fprintf('CSV escrito: %s (%d filas x %d columnas)\n', archivo_datos, ...
    height(tabla), width(tabla));
end
