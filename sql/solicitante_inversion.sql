-- Guardar a quien se le fondea, en su propia columna.
--
-- Al crear una inversion el nombre nunca se guardaba aparte: quedaba metido
-- dentro del texto del concepto, como "Fondeo a: Juan". La pantalla si lo lee
-- de una columna 'solicitante', asi que al no existir, todas las inversiones
-- se mostraban como "Administracion". Y al editar, el codigo si mandaba esa
-- columna y por eso el guardado tronaba siempre.
--
-- El rescate saca el nombre del concepto. Solo toca los que siguen el formato
-- "Fondeo a: ..."; cualquier otro concepto se deja intacto.

alter table public.ingresos_obra
  add column if not exists solicitante text;

update public.ingresos_obra
set solicitante = nullif(trim(substring(concepto from 'Fondeo a:\s*(.*)$')), '')
where solicitante is null
  and concepto like 'Fondeo a:%';

-- Que quedo rescatado y que no:
select
  count(*) filter (where solicitante is not null) as con_nombre,
  count(*) filter (where solicitante is null)     as sin_nombre
from public.ingresos_obra
where is_active;
