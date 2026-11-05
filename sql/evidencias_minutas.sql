-- Fotos de evidencia para las minutas.
--
-- El espacio que la plantilla llama "CROQUIS" no se dibuja a mano: ahi van
-- las fotos de lo que se acordo en obra. Sin esto, el recuadro sale vacio en
-- el PDF y la minuta no prueba nada.
--
-- Correrlo ANTES de repartir la version: la app ya manda la columna al
-- guardar, asi que sin ella TODAS las minutas nuevas tronarian con el error
-- del 'schema cache' (PGRST204).

-- 1) Donde se guardan las direcciones de las fotos, como lista JSON, igual
--    que photo_url en bitacora.
alter table public.minutas
  add column if not exists evidencias text;

-- 2) El bucket. Privado, como los demas: con uno publico cualquiera con el
--    link ve la foto de una obra sin tener sesion.
insert into storage.buckets (id, name, public)
values ('evidencias_minutas', 'evidencias_minutas', false)
on conflict (id) do nothing;

-- 3) Quien puede subir y ver. Mismo trato que el resto de los buckets de la
--    app: cualquiera con sesion. El filtro por obra lo hace la tabla, no el
--    almacen, porque una direccion firmada ya vive solo ocho horas.
drop policy if exists "minutas suben evidencia" on storage.objects;
create policy "minutas suben evidencia"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'evidencias_minutas');

drop policy if exists "minutas leen evidencia" on storage.objects;
create policy "minutas leen evidencia"
  on storage.objects for select to authenticated
  using (bucket_id = 'evidencias_minutas');

drop policy if exists "minutas borran evidencia" on storage.objects;
create policy "minutas borran evidencia"
  on storage.objects for delete to authenticated
  using (bucket_id = 'evidencias_minutas');

-- Como quedo:
select id, public from storage.buckets where id = 'evidencias_minutas';

select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'minutas' and column_name = 'evidencias';
