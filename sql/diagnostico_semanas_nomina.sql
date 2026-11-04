-- Por que la nomina "se borro" al actualizar el APK.
--
-- La version anterior guardaba week_start con la fecha del dia en que se
-- apretaba guardar: un miercoles quedaba '2026-10-28'. La version nueva
-- guarda y busca siempre el LUNES de la semana, y la pantalla pide
--   .eq('week_start', lunes)
-- asi que los registros viejos, parados en un miercoles o un viernes, ya no
-- caen en ninguna semana y la pantalla sale vacia. Los datos siguen ahi.

-- 1) Cuantos registros estan parados en un dia que no es lunes.
--    isodow: 1 = lunes. Todo lo que no sea 1 es un registro huerfano.
select
  extract(isodow from week_start::date) as dia_de_la_semana,
  count(*)                              as registros,
  min(week_start)                       as mas_viejo,
  max(week_start)                       as mas_nuevo
from public.payroll_records
where is_active
group by 1
order by 1;

-- 2) Donde un mismo trabajador tiene varios registros de la misma semana.
--    Son los que hay que decidir a mano: al moverlos todos al lunes
--    chocarian contra el indice unico (worker_id, week_start).
select
  w.name_worker                                                        as trabajador,
  (pr.week_start::date - (extract(isodow from pr.week_start::date)::int - 1)) as lunes,
  count(*)                                                             as registros,
  array_agg(pr.week_start order by pr.created_at)                      as fechas_guardadas,
  array_agg(pr.final_salary order by pr.created_at)                    as totales
from public.payroll_records pr
join public.workers w on w.id = pr.worker_id
where pr.is_active
group by 1, 2
having count(*) > 1
order by 2 desc, 1;
