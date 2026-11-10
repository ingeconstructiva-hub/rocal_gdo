-- Copia de seguridad ANTES de vaciar las obras.
--
-- Correr esto primero. Deja una copia de cada tabla dentro de la misma base,
-- en un esquema aparte llamado 'respaldo'. No cuesta nada y convierte un
-- borrado definitivo en uno que se puede deshacer.
--
-- Si todo sale bien y despues de unas semanas ya nadie lo necesita, el
-- esquema se puede tirar con:
--     drop schema respaldo cascade;

create schema if not exists respaldo;

-- Las copias llevan la fecha en el nombre: si algun dia se vacia otra vez,
-- la copia anterior no se pisa.
do $$
declare
  marca text := to_char(now(), 'YYYYMMDD');
  t text;
begin
  foreach t in array array[
    'logs',
    'caja_chica',
    'ingresos_obra',
    'inventory',
    'payroll_records',
    'gastos_generales',
    'gastos_maquinaria',
    'almacen_herramientas',
    'planos',
    'minutas'
  ]
  loop
    execute format(
      'create table if not exists respaldo.%I as select * from public.%I',
      t || '_' || marca, t
    );
  end loop;
end $$;

-- Que quedo copiado. Cada renglon debe coincidir con lo que hay hoy en la
-- tabla original; si alguno sale en cero y la tabla no estaba vacia, NO
-- sigas con el borrado.
select
  table_name as copia,
  (xpath('/row/c/text()',
         query_to_xml(format('select count(*) as c from respaldo.%I', table_name),
                      false, true, '')))[1]::text::int as registros
from information_schema.tables
where table_schema = 'respaldo'
order by table_name;
