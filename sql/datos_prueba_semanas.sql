-- Semanas de prueba para ver el acumulado de nomina funcionando.
--
-- Se une contra projects en vez de usar (select id ... limit 1): asi no falla
-- si el nombre trae espacios ni si existe mas de una obra llamada PRUEBAS.
-- Devuelve cuantos renglones inserto, para no quedarse adivinando.
--
--   tarifa = sueldo_semanal / 45   (5 dias de 8 h + sabado de 5)
--   total  = horas * tarifa + extras * tarifa * 2 - descuento

with insertados as (
  insert into public.payroll_records (
    worker_id, project_id, residente_id, week_start, days_absent,
    deduction_amount, final_salary, attendance, reason,
    extra_hours, extra_reason, is_active
  )
  select
    w.id,
    w.project_id,
    (select pr.residente_id
       from public.payroll_records pr
      where pr.project_id = w.project_id and pr.residente_id is not null
      limit 1),
    date_trunc('week', current_date)::date - (s.n * 7),
    d.faltas,
    d.descuento,
    round(coalesce(w.weekly_salary, 0) / 45.0 * (d.horas + d.extras * 2) - d.descuento, 2),
    d.attendance,
    d.nota,
    d.extras,
    d.nota_extra,
    true
  from public.workers w
  join public.projects p
    on p.id = w.project_id
   and upper(trim(p.name)) = 'PRUEBAS'
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
  where coalesce(w.is_active, true)
  on conflict (worker_id, week_start) do nothing
  returning 1
)
select count(*) as renglones_insertados from insertados;


-- Si lo de arriba devuelve 0, esta consulta dice por que:
-- muestra el nombre entre corchetes para delatar espacios, y si hay duplicados.
--
-- select p.id, '[' || p.name || ']' as nombre_exacto, length(p.name) as largo,
--        (select count(*) from public.workers w
--          where w.project_id = p.id and coalesce(w.is_active, true)) as trabajadores
-- from public.projects p
-- where upper(p.name) like '%PRUEBA%';


-- PARA BORRARLO DESPUES (deja intacta la semana en curso):
--
-- delete from public.payroll_records pr
-- using public.projects p
-- where p.id = pr.project_id
--   and upper(trim(p.name)) = 'PRUEBAS'
--   and pr.week_start < date_trunc('week', current_date)::date;
