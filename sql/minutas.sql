-- Minutas de indicaciones de obra.
--
-- Una indicacion no es una nota de bitacora: la nota cuenta lo que paso, la
-- indicacion pide que algo pase. Por eso lleva a quien va dirigida, para
-- cuando, y si ya se atendio. Sin esas tres cosas una indicacion se pierde.
--
-- Los campos son los minimos que sirven en obra. Cuando digan cuales quieren
-- de verdad, agregar columnas aqui es aditivo y no rompe lo que ya exista.

create table if not exists public.minutas (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  asunto text not null,
  indicacion text not null,
  dirigida_a text,
  -- Fecha compromiso. Sin plazo, una indicacion no se puede cobrar.
  plazo date,
  estado text not null default 'pendiente',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  -- El residente desactiva, admin y oficina borran de verdad: mismo criterio
  -- que el resto de las tablas de obra.
  is_active boolean not null default true
);

create index if not exists minutas_por_obra
  on public.minutas (project_id, created_at desc);

alter table public.minutas enable row level security;

-- Mismo criterio que bitacora, asistencia y gastos: quien tiene acceso a la
-- obra puede leer y escribir sus minutas.
drop policy if exists minutas_acceso on public.minutas;
create policy minutas_acceso
  on public.minutas
  for all
  using (has_project_access(project_id))
  with check (has_project_access(project_id));
