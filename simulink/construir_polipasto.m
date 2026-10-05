function construir_polipasto(sobrescribir)
%CONSTRUIR_POLIPASTO Arma automaticamente polipasto.slx (RESPALDO).
%   La idea es que armen el modelo A MANO siguiendo la guia, porque eso es
%   lo que se evalua y lo que deben explicar. Usen este script solo para:
%     - comparar su modelo con uno armado por codigo si algo no les cuadra;
%     - recuperar el modelo si se les dana el archivo.
%   construir_polipasto        -> no toca un polipasto.slx que ya exista
%   construir_polipasto(true)  -> lo reemplaza (guarda copia _respaldo)
%   Los nombres de bloques y senales son los mismos de la guia.

if nargin < 1, sobrescribir = false; end
mdl = 'polipasto';
if exist([mdl '.slx'], 'file')
    if ~sobrescribir
        error(['Ya existe polipasto.slx. Usa construir_polipasto(true) ' ...
               'para reemplazarlo (se guarda una copia polipasto_respaldo.slx).']);
    end
    if bdIsLoaded(mdl), close_system(mdl, 0); end
    copyfile([mdl '.slx'], [mdl '_respaldo.slx']);
    delete([mdl '.slx']);
end
if bdIsLoaded(mdl), close_system(mdl, 0); end
new_system(mdl);
open_system(mdl);

%% ---------- OPERADOR: perfil de aceleracion del cabo a_c(t) ----------
b('simulink/Sources/Step', 'Step_arranque',     [40  40  70  70], 'Time','t0','Before','0','After','A');
b('simulink/Sources/Step', 'Step_fin_arranque', [40 110  70 140], 'Time','t1','Before','0','After','-A');
b('simulink/Sources/Step', 'Step_frenado',      [40 180  70 210], 'Time','tb','Before','0','After','-A');
b('simulink/Sources/Step', 'Step_fin_frenado',  [40 250  70 280], 'Time','t3','Before','0','After','A');
b('simulink/Math Operations/Sum', 'Suma_perfil', [130 130 160 200], 'Inputs','++++', 'IconShape','rectangular');
c('Step_arranque/1',     'Suma_perfil/1');
c('Step_fin_arranque/1', 'Suma_perfil/2');
c('Step_frenado/1',      'Suma_perfil/3');
c('Step_fin_frenado/1',  'Suma_perfil/4');

%% ---------- APAREJO: restriccion x = x0 + L_c/n e integracion ----------
b('simulink/Math Operations/Gain', 'Gain_1_n', [220 150 270 180], 'Gain','1/n');
b('simulink/Continuous/Integrator', 'Int_v',  [330 150 360 180], 'InitialCondition','0');
b('simulink/Continuous/Integrator', 'Int_x',  [430 150 460 180], 'InitialCondition','x0');
b('simulink/Sources/Constant', 'Const_x0',    [430 230 460 250], 'Value','x0');
b('simulink/Math Operations/Sum', 'Resta_dx', [520 200 550 230], 'Inputs','+-', 'IconShape','rectangular');
b('simulink/Math Operations/Gain', 'Gain_n_v', [520  80 570 110], 'Gain','n');
b('simulink/Math Operations/Gain', 'Gain_n_x', [600 200 650 230], 'Gain','n');
c('Suma_perfil/1', 'Gain_1_n/1');
c('Gain_1_n/1', 'Int_v/1');
c('Int_v/1', 'Int_x/1');
c('Int_x/1', 'Resta_dx/1');
c('Const_x0/1', 'Resta_dx/2');
c('Int_v/1', 'Gain_n_v/1');
c('Resta_dx/1', 'Gain_n_x/1');

%% ---------- CARGA: Newton n*T - M*g = M*a  ->  T = M*(g+a)/n ----------
b('simulink/Sources/Constant', 'Const_g',       [220 330 250 350], 'Value','g');
b('simulink/Math Operations/Sum', 'Suma_g_a',   [300 320 330 350], 'Inputs','++', 'IconShape','rectangular');
b('simulink/Math Operations/Gain', 'Gain_M_n',  [370 320 420 350], 'Gain','M/n');
b('simulink/Math Operations/Gain', 'Gain_techo',[480 320 530 350], 'Gain','n+1');
c('Const_g/1', 'Suma_g_a/1');
c('Gain_1_n/1', 'Suma_g_a/2');
c('Suma_g_a/1', 'Gain_M_n/1');
c('Gain_M_n/1', 'Gain_techo/1');

%% ---------- MEDICIONES: potencia, trabajo, energia, factor dinamico ----------
b('simulink/Math Operations/Product', 'Prod_P', [480 400 510 440], 'Inputs','2');
b('simulink/Continuous/Integrator', 'Int_W',    [560 405 590 435], 'InitialCondition','0');
b('simulink/Math Operations/Gain', 'Gain_Mg',   [700 200 750 230], 'Gain','M*g');
b('simulink/Math Operations/Math Function', 'Cuadrado_v', [600 80 630 110], 'Operator','square');
b('simulink/Math Operations/Gain', 'Gain_medioM', [660 80 710 110], 'Gain','0.5*M');
b('simulink/Math Operations/Sum', 'Suma_E',     [800 140 830 170], 'Inputs','++', 'IconShape','rectangular');
b('simulink/Math Operations/Gain', 'Gain_1_g',  [300 470 350 500], 'Gain','1/g');
b('simulink/Sources/Constant', 'Const_1',       [300 520 330 540], 'Value','1');
b('simulink/Math Operations/Sum', 'Suma_fd',    [400 480 430 510], 'Inputs','++', 'IconShape','rectangular');
c('Gain_M_n/1', 'Prod_P/1');        % F_op = T
c('Gain_n_v/1', 'Prod_P/2');        % v_c
c('Prod_P/1', 'Int_W/1');
c('Resta_dx/1', 'Gain_Mg/1');
c('Int_v/1', 'Cuadrado_v/1');
c('Cuadrado_v/1', 'Gain_medioM/1');
c('Gain_Mg/1', 'Suma_E/1');
c('Gain_medioM/1', 'Suma_E/2');
c('Gain_1_n/1', 'Gain_1_g/1');
c('Gain_1_g/1', 'Suma_fd/1');
c('Const_1/1', 'Suma_fd/2');

%% ---------- LIMITES: alarma de F_op y assertions ----------
b('simulink/Logic and Bit Operations/Compare To Constant', 'Cmp_Fop', [600 480 650 510], 'relop','>',  'const','Fmax');
b('simulink/Signal Attributes/Data Type Conversion', 'DTC_alarma', [690 480 740 510], 'OutDataTypeStr','double');
b('simulink/Logic and Bit Operations/Compare To Constant', 'Cmp_T',   [600 540 650 570], 'relop','>=', 'const','0');
b('simulink/Model Verification/Assertion', 'Assert_T', [690 540 720 570]);
b('simulink/Logic and Bit Operations/Compare To Constant', 'Cmp_h',   [600 600 650 630], 'relop','<=', 'const','hmax+1e-6');
b('simulink/Model Verification/Assertion', 'Assert_h', [690 600 720 630]);
c('Gain_M_n/1', 'Cmp_Fop/1');
c('Cmp_Fop/1', 'DTC_alarma/1');
c('Gain_M_n/1', 'Cmp_T/1');
c('Cmp_T/1', 'Assert_T/1');
c('Int_x/1', 'Cmp_h/1');
c('Cmp_h/1', 'Assert_h/1');

%% ---------- SALIDAS: Scope y To Workspace ----------
b('simulink/Sources/Constant', 'Const_Fmax', [880 330 910 350], 'Value','Fmax');
b('simulink/Signal Routing/Mux', 'Mux_T', [950 300 955 360], 'Inputs','2');
b('simulink/Signal Routing/Mux', 'Mux_E', [950 380 955 440], 'Inputs','2');
b('simulink/Sinks/Scope', 'Scope', [1050 40 1090 340], 'NumInputPorts','6');
b('simulink/Signal Routing/Mux', 'Mux_datos', [1050 400 1055 700], 'Inputs','13');
b('simulink/Sinks/To Workspace', 'Datos_CSV', [1110 535 1190 565], ...
  'VariableName','datos', 'SaveFormat','Structure With Time', 'SampleTime','Ts_log');
c('Gain_M_n/1', 'Mux_T/1');
c('Const_Fmax/1', 'Mux_T/2');
c('Int_W/1', 'Mux_E/1');
c('Suma_E/1', 'Mux_E/2');
c('Int_x/1', 'Scope/1');
c('Int_v/1', 'Scope/2');
c('Gain_1_n/1', 'Scope/3');
c('Mux_T/1', 'Scope/4');
c('Prod_P/1', 'Scope/5');
c('Mux_E/1', 'Scope/6');
% Orden del Mux_datos = orden de columnas del CSV (despues de t)
fuentes = {'Int_x','Int_v','Gain_1_n','Gain_n_x','Gain_n_v','Gain_M_n', ...
           'Gain_M_n','Gain_techo','Prod_P','Int_W','Suma_E','Suma_fd','DTC_alarma'};
for k = 1:numel(fuentes)
    c([fuentes{k} '/1'], sprintf('Mux_datos/%d', k));
end

%% ---------- Nombres de las senales (se ven sobre las lineas) ----------
nombrar('Suma_perfil','a_c'); nombrar('Gain_1_n','a'); nombrar('Int_v','v');
nombrar('Int_x','x');         nombrar('Resta_dx','dx'); nombrar('Gain_n_v','v_c');
nombrar('Gain_n_x','L_c');    nombrar('Gain_M_n','T = F_op'); nombrar('Gain_techo','R_techo');
nombrar('Prod_P','P');        nombrar('Int_W','W_op');  nombrar('Gain_Mg','E_p');
nombrar('Gain_medioM','E_c'); nombrar('Suma_E','E_mec'); nombrar('Suma_fd','factor_dinamico');
nombrar('DTC_alarma','alarma_Fop');

%% ---------- Configuracion del solver (lo mismo que Ctrl+E) ----------
set_param(mdl, 'SolverType','Variable-step', 'Solver','ode45', ...
    'RelTol','1e-6', 'AbsTol','1e-8', 'MaxStep','auto', ...
    'StartTime','0', 'StopTime','t_fin', 'ReturnWorkspaceOutputs','on');

save_system(mdl);
fprintf('polipasto.slx creado. Ejecuta parametros_polipasto y luego Ctrl+T.\n');

%% ---------- funciones auxiliares ----------
    function b(lib, nombre, pos, varargin)
        add_block(lib, [mdl '/' nombre], 'Position', pos, varargin{:});
    end
    function c(origen, destino)
        add_line(mdl, origen, destino, 'autorouting', 'on');
    end
    function nombrar(bloque, senal)
        ph = get_param([mdl '/' bloque], 'PortHandles');
        set_param(get_param(ph.Outport(1), 'Line'), 'Name', senal);
    end
end
