-- Las categorias ahora sirven a dos pantallas, no solo a bitacora.
--
-- Planos tenia el mismo problema: escribias una categoria en "Otro" y se
-- guardaba en el documento, pero nunca se sumaba a la lista. La tabla se
-- reusa con una columna que dice a que pantalla pertenece cada una, para que
-- "Estructura" no aparezca entre las de documentos ni "Permiso" entre las de
-- bitacora.
--
-- Es aditivo: lo que ya existe queda como bitacora, que es de donde viene.

alter table public.bitacora_categorias
  add column if not exists modulo text not null default 'bitacora';

-- El unico ahora incluye el modulo: la misma palabra puede existir en las dos
-- pantallas sin estorbarse.
drop index if exists bitacora_categorias_unicas;
create unique index if not exists bitacora_categorias_unicas
  on public.bitacora_categorias (project_id, modulo, lower(nombre));
