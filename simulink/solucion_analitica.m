function s = solucion_analitica(t, par)
%SOLUCION_ANALITICA Solucion exacta del modelo ideal (Fase I).
%   s = solucion_analitica(t, par) devuelve una estructura con todas las
%   salidas del modelo en los instantes t, calculadas con formulas
%   cerradas. Como la aceleracion del cabo es constante por tramos, la
%   velocidad es lineal por tramos y la posicion cuadratica por tramos.
%   Sirve para validar Simulink (y luego el gemelo visual).

t = t(:);
cambios = [par.t0, par.t1, par.tb, par.t3];   % instantes de cada Step
saltos  = [par.A, -par.A, -par.A, par.A];     % salto de a_c en cada uno

ac = zeros(size(t)); vc = ac; Lc = ac;
for k = 1:4
    tau = max(t - cambios(k), 0);             % tiempo desde el cambio k
    ac = ac + saltos(k)*(t >= cambios(k));
    vc = vc + saltos(k)*tau;
    Lc = Lc + 0.5*saltos(k)*tau.^2;
end

n = par.n; M = par.M; g = par.g;
s.t   = t;
s.a_c = ac;
s.v_c = vc;
s.L_c = Lc;
s.a   = ac/n;                       % restriccion: a = a_c/n
s.v   = vc/n;                       % v = v_c/n
s.x   = par.x0 + Lc/n;              % x = x0 + L_c/n
s.T   = M*(g + s.a)/n;              % Newton: n*T - M*g = M*a
s.F_op = s.T;                       % cabo libre: F_op = T
s.R   = (n + 1)*s.T;                % bloque fijo: R = (n+1)*T
s.P   = s.F_op.*s.v_c;              % potencia del operario
s.E   = M*g*(s.x - par.x0) + 0.5*M*s.v.^2;  % energia mecanica
s.W_op = s.E;                       % trabajo-energia (modelo ideal)
s.fd  = 1 + s.a/g;                  % factor dinamico
s.alarma = double(s.F_op > par.Fmax);
end
