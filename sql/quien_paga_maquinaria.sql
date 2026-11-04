-- Guardar quien saca el dinero de cada pago a maquinaria.
--
-- El reporte lleva una columna "Quien paga", y sin esta columna la celda
-- saldria vacia siempre. Peor: la app manda el campo al guardar, asi que sin
-- ella TODOS los pagos tronarian con el error del 'schema cache' (PGRST204)
-- y no se guardaria ninguno.
--
-- Correrlo ANTES de repartir la version nueva.

alter table public.gastos_maquinaria
  add column if not exists pagado_por text;

-- Los pagos viejos se quedan sin nombre: nadie lo capturo en su momento y
-- adivinarlo seria inventar. En el reporte salen como "--".
select
  count(*) filter (where categoria = 'anticipo')                          as pagos,
  count(*) filter (where categoria = 'anticipo' and pagado_por is null)   as sin_nombre
from public.gastos_maquinaria;
