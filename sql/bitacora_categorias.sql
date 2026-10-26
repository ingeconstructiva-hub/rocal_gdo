-- Categorias de bitacora por obra.
--
-- Antes la lista vivia solo en la memoria del formulario: al cerrarlo se
-- reiniciaba a las seis de fabrica. Habia que volver a escribir la categoria
-- en cada reporte, y escrita distinto ("Plomeria" y "Plomería") quedaba como
-- dos categorias diferentes, partiendo las estadisticas de la pantalla.
--
-- Son por obra para que residente y oficina vean exactamente la misma lista.
-- Las seis de fabrica viven en el codigo y no se guardan aqui.

create table if not exists public.bitacora_categorias (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  nombre text not null,
  created_at timestamptz not null default now()
);

-- Sin distinguir mayusculas: "Plomeria" y "PLOMERIA" son la misma.
create unique index if not exists bitacora_categorias_unicas
  on public.bitacora_categorias (project_id, lower(nombre));

alter table public.bitacora_categorias enable row level security;

-- Mismo criterio que el resto de las tablas de obra: quien tiene acceso al
-- proyecto puede leerlas y crearlas.
drop policy if exists bitacora_categorias_acceso on public.bitacora_categorias;
create policy bitacora_categorias_acceso
  on public.bitacora_categorias
  for all
  using (has_project_access(project_id))
  with check (has_project_access(project_id));
