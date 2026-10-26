-- Semanas de prueba para ver el acumulado de nomina funcionando.
--
-- Solo toca la obra PRUEBAS y solo crea semanas ANTERIORES a la actual, asi
-- que no estorba la que estes capturando. Repetible: no duplica.
--
-- Los montos salen de la misma formula de lib/nomina.ts:
--   tarifa = sueldo_semanal / 45   (5 dias de 8 h + sabado de 5)
--   total  = horas * tarifa + extras * tarifa * 2 - descuento

insert into public.payroll_records (
  worker_id, project_id, residente_id, week_start, days_absent,
  deduction_amount, final_salary, attendance, reason,
  extra_hours, extra_reason, is_active
)
select
  w.id,
  w.project_id,
  -- Se reusa el residente de algun registro que ya exista en la obra; si no
  -- hay ninguno queda nulo, que es valido.
  (select pr.residente_id
     from public.payroll_records pr
    where pr.project_id = w.project_id and pr.residente_id is not null
    limit 1),
  date_trunc('week', current_date)::date - (s.n * 7),
  d.faltas,
  d.descuento,
  round(d.horas * (w.weekly_salary / 45.0) + d.extras * (w.weekly_salary / 45.0) * 2 - d.descuento, 2),
  d.attendance,
  d.nota,
  d.extras,
  d.nota_extra,
  true
from public.workers w
cross join generate_series(1, 8) as s(n)
cross join lateral (select abs(hashtext(w.id::text || s.n::text)) % 4 as v) r
cross join lateral (
  select
    case r.v when 1 then '[true,true,true,false,true,true]'
             when 3 then '[true,true,false,true,true,false]'
             else        '[true,true,true,true,true,true]' end as attendance,
    case r.v when 1 then 1   when 3 then 2   else 0 end as faltas,
    case r.v when 1 then 37  when 3 then 32  else 45 end as horas,
    case r.v when 2 then 4                   else 0 end as extras,
    case r.v when 3 then 150                 else 0 end as descuento,
    case r.v when 3 then 'Prestamo'          else null end as nota,
    case r.v when 2 then 'Colado de losa'    else null end as nota_extra
) d
where w.is_active
  and w.project_id = (select id from public.projects where name = 'PRUEBAS' limit 1)
on conflict (worker_id, week_start) do nothing;

-- Que quedo:
select week_start,
       count(*) as trabajadores,
       sum(final_salary) as total
from public.payroll_records
where project_id = (select id from public.projects where name = 'PRUEBAS' limit 1)
  and is_active
group by week_start
order by week_start desc;


-- ---------------------------------------------------------------
-- PARA BORRARLO DESPUES (deja intacta la semana en curso):
--
-- delete from public.payroll_records
-- where project_id = (select id from public.projects where name = 'PRUEBAS' limit 1)
--   and week_start < date_trunc('week', current_date)::date;
