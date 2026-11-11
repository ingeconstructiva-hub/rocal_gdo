-- Fotos de cómo se entrega una herramienta.
--
-- El vale ya trae las firmas y la INE de quien recibe, pero nada dice en qué
-- estado salió el equipo. Cuando regresa golpeado no hay con qué comparar y
-- la discusión es la palabra de uno contra la del otro. Por eso van varias
-- fotos: la máquina completa y los detalles que ya traía.
--
-- Correrlo ANTES de repartir la versión: la app ya manda la columna al
-- entregar, así que sin ella TODA entrega nueva tronaría con el error del
-- 'schema cache' (PGRST204).

-- 1) Donde se guardan las direcciones de las fotos, como lista JSON, igual
--    que las evidencias de las minutas.
alter table public.almacen_herramientas
  add column if not exists fotos_entrega text;

-- 2) El bucket. Privado, como los demás: con uno público cualquiera con el
--    link ve el equipo de una obra sin tener sesión.
insert into storage.buckets (id, name, public)
values ('almacen', 'almacen', false)
on conflict (id) do nothing;

-- 3) Quién puede subir y ver. Mismo trato que el resto de los buckets de la
--    app: cualquiera con sesión. El filtro por obra lo hace la tabla, no el
--    almacén, porque una dirección firmada ya vive solo ocho horas.
drop policy if exists "almacen sube fotos" on storage.objects;
create policy "almacen sube fotos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'almacen');

drop policy if exists "almacen lee fotos" on storage.objects;
create policy "almacen lee fotos"
  on storage.objects for select to authenticated
  using (bucket_id = 'almacen');

drop policy if exists "almacen borra fotos" on storage.objects;
create policy "almacen borra fotos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'almacen');

-- Como quedo:
select id, public from storage.buckets where id = 'almacen';

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'almacen_herramientas'
  and column_name = 'fotos_entrega';
