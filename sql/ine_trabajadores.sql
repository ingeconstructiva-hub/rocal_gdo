-- La INE de cada trabajador.
--
-- Hasta ahora la identificación solo se pedía al entregar una herramienta, y
-- quedaba pegada a ese resguardo. La de la raya es otra cosa: se guarda una
-- vez por persona y sirve para todas las semanas.
--
-- No se crea bucket: las identificaciones ya tienen el suyo. Las de los
-- trabajadores van en la subcarpeta 'trabajadores' para no revolverse con
-- las de los resguardos, que viven en 'ines'.
--
-- Correrlo ANTES de repartir la versión: la app ya manda las columnas al
-- editar, así que sin ellas la edición tronaría con el error del
-- 'schema cache' (PGRST204).

alter table public.workers
  add column if not exists ine_url text,
  add column if not exists ine_reverso_url text;

-- Como quedo:
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'workers'
  and column_name in ('ine_url', 'ine_reverso_url')
order by column_name;
