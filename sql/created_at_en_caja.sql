-- Darle a caja chica una fecha que el usuario no pueda escribir.
--
-- El permiso para que un residente corrija lo que acaba de capturar se mide
-- con created_at a proposito, no con 'fecha', porque esa ultima la teclea la
-- persona. Pero caja_chica e ingresos_obra nunca tuvieron created_at, asi que
-- el codigo caia en 'fecha' y el candado se podia abrir solo: bastaba con
-- poner la fecha de hoy en un movimiento viejo para recuperar el permiso de
-- borrarlo.
--
-- El relleno usa 'fecha' porque es lo mas cercano que hay a cuando se
-- capturo. Importa hacerlo en el mismo paso: si los renglones viejos se
-- quedaran con el now() del default, todos contarian como "de hoy" y
-- cualquier residente podria borrar el historial completo.

alter table public.caja_chica
  add column if not exists created_at timestamptz not null default now();

alter table public.ingresos_obra
  add column if not exists created_at timestamptz not null default now();

update public.caja_chica
set created_at = fecha::timestamptz
where fecha is not null
  and created_at::date = current_date
  and fecha < current_date;

update public.ingresos_obra
set created_at = fecha::timestamptz
where fecha is not null
  and created_at::date = current_date
  and fecha < current_date;

-- Cuantos quedaron contando como "de hoy". Deberian ser solo los de hoy.
select 'caja_chica' as tabla,
       count(*) filter (where created_at::date = current_date) as cuentan_como_hoy,
       count(*)                                                as total
from public.caja_chica
union all
select 'ingresos_obra',
       count(*) filter (where created_at::date = current_date),
       count(*)
from public.ingresos_obra;
