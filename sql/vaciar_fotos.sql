-- Las fotos YA NO SE BORRAN DESDE AQUI.
--
-- Supabase bloquea el borrado directo sobre sus tablas de almacen:
--   "Direct deletion from storage tables is not allowed. Use the Storage
--    API instead."
--
-- Hay que pasar por su API, y eso necesita la llave de servicio, que no
-- debe andar en consultas ni en el repositorio. Por eso vive en un script
-- que se corre en tu maquina:
--
--   scripts/limpiar_almacen.mjs
--
-- Sin argumentos solo enseña que haria; con --borrar lo hace. Conserva el
-- bucket 'obras' entero y la carpeta 'identificaciones/perfiles/', y se
-- lleva todo lo demas.
--
-- Lo que si se puede hacer desde aqui es MIRAR, que no esta bloqueado.

-- Que hay hoy, bucket por bucket.
select bucket_id, count(*) as archivos
from storage.objects
group by bucket_id
order by bucket_id;

-- Que se va a conservar. Revisa esta lista antes de correr el script: si
-- una foto no sale aqui, despues no habra de donde sacarla.
select bucket_id, name
from storage.objects
where bucket_id = 'obras'
   or (bucket_id = 'identificaciones' and name like 'perfiles/%')
order by bucket_id, name;

-- Que se va a borrar.
select bucket_id, count(*) as se_borran
from storage.objects
where not (
  bucket_id = 'obras'
  or (bucket_id = 'identificaciones' and name like 'perfiles/%')
)
group by bucket_id
order by bucket_id;
