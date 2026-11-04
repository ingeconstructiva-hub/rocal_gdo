-- Buscar capturas que se hayan perdido al actualizar el APK.
--
-- Lo que se registra sin señal espera en la bandeja de salida del telefono.
-- Si la instalacion del APK nuevo borro los datos de la app, eso se fue sin
-- dejar rastro: no hay renglon que buscar, solo el hueco donde deberia estar.
--
-- Las tablas de datos no guardan quien capturo (no hay user_id ni created_by
-- mas que en minutas), asi que no se puede señalar a una persona. Se busca
-- por obra y por dia, y tu sabes quien estaba en cada obra.
--
-- Ojo con created_at: es la hora en que el registro llego al servidor, no la
-- fecha que la persona escribio. Una captura hecha sin señal el lunes y
-- subida el miercoles aparece en miercoles.

-- 1) Cuando subio algo cada obra por ultima vez, modulo por modulo.
--    Una obra activa cuyo ultimo dato sea de antes de la actualizacion es la
--    sospechosa: ahi se dejo de subir y nunca se retomo.
with actividad as (
            select 'bitacora'         as modulo, project_id, created_at from public.logs
  union all select 'caja chica',             project_id, created_at from public.caja_chica
  union all select 'inversiones',            project_id, created_at from public.ingresos_obra
  union all select 'destajo',                project_id, created_at from public.inventory
  union all select 'nomina',                 project_id, created_at from public.payroll_records
  union all select 'gastos generales',       project_id, created_at from public.gastos_generales
  union all select 'maquinaria',             project_id, created_at from public.gastos_maquinaria
)
select
  p.name                                                  as obra,
  a.modulo,
  max(a.created_at)::date                                 as ultima_subida,
  (current_date - max(a.created_at)::date)                as dias_sin_subir,
  count(*) filter (where a.created_at >= current_date - 30) as en_los_ultimos_30_dias
from actividad a
join public.projects p on p.id = a.project_id
group by 1, 2
order by dias_sin_subir desc, 1, 2;

-- 2) Dia por dia, cuantos registros entraron en cada obra el ultimo mes.
--    Un dia habil en blanco en una obra que si trabajo es el hueco a revisar.
with actividad as (
            select 'bitacora'         as modulo, project_id, created_at from public.logs
  union all select 'caja chica',             project_id, created_at from public.caja_chica
  union all select 'inversiones',            project_id, created_at from public.ingresos_obra
  union all select 'destajo',                project_id, created_at from public.inventory
  union all select 'nomina',                 project_id, created_at from public.payroll_records
  union all select 'gastos generales',       project_id, created_at from public.gastos_generales
  union all select 'maquinaria',             project_id, created_at from public.gastos_maquinaria
)
select
  a.created_at::date as dia,
  to_char(a.created_at, 'TMDy') as nombre_dia,
  p.name             as obra,
  count(*)           as registros,
  string_agg(distinct a.modulo, ', ' order by a.modulo) as modulos
from actividad a
join public.projects p on p.id = a.project_id
where a.created_at >= current_date - 30
group by 1, 2, 3
order by 1 desc, 3;
