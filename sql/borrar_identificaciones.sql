-- Poder borrar del bucket de identificaciones.
--
-- Subir y leer ya se podían: hay dos políticas generales ("archivos: subir
-- con sesión" y "archivos: leer con sesión") que valen para todos los
-- buckets. Borrar no: cada bucket tiene la suya, y a éste nunca se le hizo.
-- Por eso una INE mal tomada se podía reemplazar —se subía otra encima con
-- otro nombre— pero la mala se quedaba ahí para siempre.
--
-- Mismo trato que el resto: cualquiera con sesión. Quién puede editar a un
-- trabajador lo decide la pantalla, no el almacén.

drop policy if exists "identificaciones borrar con sesion" on storage.objects;
create policy "identificaciones borrar con sesion"
  on storage.objects for delete to authenticated
  using (bucket_id = 'identificaciones');

-- Como quedo:
select policyname, cmd
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname = 'identificaciones borrar con sesion';
