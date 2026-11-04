-- Buscar capturas que se hayan perdido al actualizar el APK.
--
-- Lo que se registra sin señal espera en la bandeja de salida del telefono.
-- Si la instalacion del APK nuevo borro los datos de la app, eso se fue sin
-- dejar rastro: no hay renglon que buscar, solo el hueco donde deberia estar.
--
-- Dos cosas que hay que tener en mente al leer el resultado:
--
-- 1. Las tablas de datos no guardan quien capturo (no hay user_id ni
--    created_by mas que en minutas), asi que esto no señala a una persona:
--    señala la obra y el dia.
--
-- 2. Cada tabla trae la fecha que tiene. Cuatro guardan created_at, que la
--    pone la base al recibir el dato; tres solo tienen 'fecha', que la teclea
--    la persona y puede decir cualquier cosa. La columna 'origen_fecha' lo
--    dice en cada renglon para que no se lean de igual manera.

-- 1) Cuando entro algo por ultima vez en cada obra, modulo por modulo.
--    Una obra que si estuvo trabajando pero cuyo ultimo dato es de antes de
--    la actualizacion es la sospechosa.
with actividad as (
            select 'bitacora'         as modulo, 'la base'  as origen_fecha, project_id, created_at::date as dia from public.logs
  union all select 'destajo',               'la base',  project_id, created_at::date from public.inventory
  union all select 'nomina',                'la base',  project_id, created_at::date from public.payroll_records
  union all select 'maquinaria',            'la base',  project_id, created_at::date from public.gastos_maquinaria
  union all select 'caja chica',            'el usuario', project_id, fecha::date    from public.caja_chica
  union all select 'inversiones',           'el usuario', project_id, fecha::date    from public.ingresos_obra
  union all select 'gastos generales',      'el usuario', project_id, fecha::date    from public.gastos_generales
)
select
  p.name                                   as obra,
  a.modulo,
  a.origen_fecha,
  max(a.dia)                               as ultimo_dato,
  current_date - max(a.dia)                as dias_sin_nada,
  count(*) filter (where a.dia >= current_date - 30) as en_los_ultimos_30_dias
from actividad a
join public.projects p on p.id = a.project_id
group by 1, 2, 3
order by dias_sin_nada desc, 1, 2;

-- 2) Dia por dia del ultimo mes. El hueco a revisar es un dia habil en blanco
--    en una obra que si trabajo ese dia.
with actividad as (
            select 'bitacora'         as modulo, project_id, created_at::date as dia from public.logs
  union all select 'destajo',               project_id, created_at::date from public.inventory
  union all select 'nomina',                project_id, created_at::date from public.payroll_records
  union all select 'maquinaria',            project_id, created_at::date from public.gastos_maquinaria
  union all select 'caja chica',            project_id, fecha::date      from public.caja_chica
  union all select 'inversiones',           project_id, fecha::date      from public.ingresos_obra
  union all select 'gastos generales',      project_id, fecha::date      from public.gastos_generales
)
select
  a.dia,
  to_char(a.dia, 'TMDy')                                as nombre_dia,
  p.name                                                as obra,
  count(*)                                              as registros,
  string_agg(distinct a.modulo, ', ' order by a.modulo) as modulos
from actividad a
join public.projects p on p.id = a.project_id
where a.dia >= current_date - 30
group by 1, 2, 3
order by 1 desc, 3;
