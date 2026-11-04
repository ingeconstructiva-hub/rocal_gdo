-- Que columna de fecha tiene cada tabla de datos.
--
-- No todas traen created_at: caja_chica, por ejemplo, no la tiene. Antes de
-- buscar huecos de captura hay que saber por cual columna preguntar en cada
-- una, porque 'fecha' la escribe el usuario y created_at la pone la base.

select
  table_name  as tabla,
  string_agg(column_name, ', ' order by column_name) as columnas_de_fecha
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'logs', 'caja_chica', 'ingresos_obra', 'inventory',
    'payroll_records', 'gastos_generales', 'gastos_maquinaria'
  )
  and (
    data_type in ('date', 'timestamp with time zone', 'timestamp without time zone')
    or column_name ~ 'fecha|date|created|updated|_at$'
  )
group by table_name
order by table_name;
