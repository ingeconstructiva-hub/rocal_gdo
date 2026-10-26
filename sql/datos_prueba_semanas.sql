-- Semanas de prueba para ver el acumulado de nomina funcionando.
--
-- Solo toca el proyecto llamado 'PRUEBAS' y solo crea semanas ANTERIORES a la
-- actual, asi que no estorba la semana que estes capturando. Es repetible: si
-- lo corres dos veces no duplica nada.
--
-- Los numeros salen de la misma formula de la app (lib/nomina.ts):
--   tarifa  = sueldo_semanal / 45     (5 dias de 8 h + sabado de 5)
--   total   = horas * tarifa + extras * tarifa * 2 - descuento

with obra as (
  select id from public.projects where upper(name) = 'PRUEBAS' limit 1
),
responsable as (
  select pm.user_id from public.project_members pm, obra where pm.project_id = obra.id limit 1
),
semanas as (
  -- Las 8 semanas previas a la actual.
  select (date_trunc('week', current_date)::date - (n * 7)) as week_start
  from generate_series(1, 8) as n
),
plantilla as (
  select w.id, w.weekly_salary, s.week_start,
         abs(hashtext(w.id::text || s.week_start::text)) % 4 as variante
  from public.workers w, semanas s, obra
  where w.project_id = obra.id and w.is_active = true
),
calculado as (
  select id, weekly_salary, week_start,
    case variante
      when 1 then '[true,true,true,false,true,true]'
      when 3 then '[true,true,false,true,true,false]'
      else        '[true,true,true,true,true,true]'
    end as attendance,
    case variante when 1 then 1 when 3 then 2 else 0 end as days_absent,
    case variante when 1 then 37 when 3 then 32 else 45 end as horas,
    case variante when 2 then 4 else 0 end as extra_hours,
    case variante when 3 then 150 else 0 end as deduction_amount,
    case variante when 3 then 'Prestamo' else null end as reason,
    case variante when 2 then 'Colado de losa' else null end as extra_reason
  from plantilla
)
insert into public.payroll_records (
  worker_id, project_id, residente_id, week_start, days_absent,
  deduction_amount, final_salary, attendance, reason,
  extra_hours, extra_reason, is_active
)
select
  c.id,
  (select id from obra),
  (select user_id from responsable),
  c.week_start,
  c.days_absent,
  c.deduction_amount,
  round((c.horas * (c.weekly_salary / 45.0)) + (c.extra_hours * (c.weekly_salary / 45.0) * 2) - c.deduction_amount, 2),
  c.attendance,
  c.reason,
  c.extra_hours,
  c.extra_reason,
  true
from calculado c
on conflict (worker_id, week_start) do nothing;

-- Que quedo:
select week_start, count(*) as trabajadores, sum(final_salary) as total
from public.payroll_records
where project_id = (select id from public.projects where upper(name) = 'PRUEBAS' limit 1)
group by week_start
order by week_start desc;


-- ---------------------------------------------------------------
-- PARA BORRARLO DESPUES (deja intacta la semana en curso):
--
-- delete from public.payroll_records
-- where project_id = (select id from public.projects where upper(name) = 'PRUEBAS' limit 1)
--   and week_start < date_trunc('week', current_date)::date;
