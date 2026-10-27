-- Guardar quien entrega la herramienta.
--
-- El vale nunca guardo ese dato: el PDF ponia el nombre de quien lo imprimia.
-- O sea que el mismo vale, con la misma firma abajo, salia con un nombre
-- distinto segun quien lo generara. En un papel que la gente firma para
-- hacerse responsable de herramienta, eso se contradice solo.
--
-- Se guardan las dos cosas a proposito:
--   entregado_por  -> para saber de que usuario se trata
--   nombre_entrega -> el nombre tal como estaba al firmar
--
-- El nombre se congela porque es un documento firmado: si manana ese usuario
-- corrige su nombre en el perfil, el vale de hoy debe seguir diciendo lo que
-- se firmo hoy.
--
-- Es aditivo. Los vales viejos quedan en nulo, y para esos el PDF sigue
-- comportandose como hasta ahora.

alter table public.almacen_herramientas
  add column if not exists entregado_por uuid references public.profiles(id),
  add column if not exists nombre_entrega text;

comment on column public.almacen_herramientas.nombre_entrega is
  'Nombre de quien entrego, congelado al momento de firmar. No se recalcula.';
