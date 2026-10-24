-- Guardar las horas extra de la semana.
--
-- payroll_records nunca tuvo donde guardarlas: quedaban sumadas dentro de
-- final_salary, asi que al reabrir la semana el campo salia en cero y el
-- siguiente guardado las borraba. Y no habia manera de justificarlas, a
-- diferencia del descuento, que si lleva motivo.
--
-- Es aditivo: no toca ni borra nada de lo que ya existe.

alter table public.payroll_records
  add column if not exists extra_hours numeric default 0,
  add column if not exists extra_reason text;

comment on column public.payroll_records.extra_hours is
  'Horas extra de la semana. Se pagan al doble de la tarifa ordinaria integrada.';
comment on column public.payroll_records.extra_reason is
  'Por que se autorizaron esas horas extra.';
