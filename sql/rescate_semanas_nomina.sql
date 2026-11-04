-- Devolver la nomina vieja a la semana que le toca.
--
-- ANTES DE CORRER ESTO: pasar sql/diagnostico_semanas_nomina.sql y mirar su
-- segunda consulta, la de trabajadores con varios registros en una misma
-- semana. Ahi es donde este script decide por ti, y conviene ver que decide.
--
-- Que paso: la version anterior guardaba week_start con la fecha del dia en
-- que se apretaba guardar, asi que un miercoles quedaba '2026-10-28'. La
-- version nueva guarda y busca siempre el LUNES de la semana. Los registros
-- viejos, parados en un miercoles o un viernes, ya no caen en ninguna semana
-- y la pantalla sale vacia. No se perdio nada: estan mal fechados.

begin;

-- 1) Un trabajador podia terminar con varios registros de la misma semana,
--    uno por cada dia que se guardo. Al moverlos todos al lunes chocarian
--    contra el indice unico (worker_id, week_start), asi que se deja uno.
--
--    Se queda el de mayor final_salary, no el mas reciente. Si alguien ya
--    abrio la pantalla con la version nueva, el autoguardado pudo crear un
--    registro del lunes practicamente vacio; por fecha ese ganaria y se
--    llevaria por delante la semana real.
--
--    Los demas se desactivan, no se borran: quedan recuperables.
with ordenados as (
  select
    id,
    row_number() over (
      partition by
        worker_id,
        (week_start::date - (extract(isodow from week_start::date)::int - 1))
      order by coalesce(final_salary, 0) desc, created_at desc, id desc
    ) as orden
  from public.payroll_records
  where is_active
)
update public.payroll_records p
set is_active = false
from ordenados o
where p.id = o.id
  and o.orden > 1;

-- 2) El que sobrevive se mueve al lunes de su semana.
update public.payroll_records
set week_start = week_start::date - (extract(isodow from week_start::date)::int - 1)
where is_active
  and extract(isodow from week_start::date) <> 1;

commit;

-- Como quedo: todo deberia caer en lunes (dia 1) y no quedar ningun otro dia.
select
  extract(isodow from week_start::date) as dia_de_la_semana,
  count(*)                              as registros
from public.payroll_records
where is_active
group by 1
order by 1;
