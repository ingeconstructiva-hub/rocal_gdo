-- Borrar tres cuentas: asd, Polet y Arsibeth.
--
-- Esto NO es parte de vaciar las obras: toca cuentas de personas. Una vez
-- borradas no se pueden recuperar, y quien quiera volver a entrar necesita
-- una cuenta nueva con contraseña nueva.
--
-- Va en dos pasos a proposito. El PASO 1 solo mira; el PASO 2 borra. No
-- corras el segundo sin haber leido la salida del primero: la busqueda es
-- por nombre, y un nombre parecido se lleva a quien no era.

-- =====================================================================
-- PASO 1 - MIRAR. Correr esto solo, y leer el resultado.
-- =====================================================================

-- Quienes coinciden. Deben ser TRES renglones, y los tres los que esperas.
select
  p.id,
  p.full_name,
  p.role,
  u.email,
  u.last_sign_in_at as ultimo_acceso
from public.profiles p
left join auth.users u on u.id = p.id
where p.full_name ilike '%asd%'
   or p.full_name ilike '%polet%'
   or p.full_name ilike '%arsibeth%'
   or p.full_name ilike '%arisbeth%'
order by p.full_name;

-- A que obras estan asignadas. Se van a perder esas asignaciones.
select p.full_name, pr.name as obra, m.role as rol_en_la_obra
from public.project_members m
join public.profiles p on p.id = m.user_id
join public.projects pr on pr.id = m.project_id
where p.full_name ilike '%asd%'
   or p.full_name ilike '%polet%'
   or p.full_name ilike '%arsibeth%'
   or p.full_name ilike '%arisbeth%'
order by p.full_name;

-- Sus fotos en el almacen. Se borran con ellas.
select o.name
from storage.objects o
where o.bucket_id = 'identificaciones'
  and exists (
    select 1 from public.profiles p
    where (p.full_name ilike '%asd%'
        or p.full_name ilike '%polet%'
        or p.full_name ilike '%arsibeth%'
        or p.full_name ilike '%arisbeth%')
      and o.name like '%' || p.id::text || '%'
  )
order by o.name;


-- =====================================================================
-- PASO 2 - BORRAR. Correr solo si el paso 1 mostro exactamente a las
-- tres personas que querias.
-- =====================================================================

begin;

-- Se fija a quienes una sola vez, para que los tres borrados apunten
-- exactamente al mismo grupo aunque alguien edite un nombre a la mitad.
create temp table a_borrar on commit drop as
select id, full_name
from public.profiles
where full_name ilike '%asd%'
   or full_name ilike '%polet%'
   or full_name ilike '%arsibeth%'
   or full_name ilike '%arisbeth%';

-- Freno de mano: si no son tres, algo no cuadra y no se borra nada.
do $$
declare cuantos int;
begin
  select count(*) into cuantos from a_borrar;
  if cuantos <> 3 then
    raise exception 'Se esperaban 3 cuentas y se encontraron %. No se borro nada.', cuantos;
  end if;
end $$;

-- Sus fotos NO se borran aqui: Supabase ya no permite borrar directo de
-- las tablas del almacen. Las quita scripts/limpiar_almacen.mjs, que pasa
-- por la API como el sistema exige.

-- Sus asignaciones a obras.
delete from public.project_members
where user_id in (select id from a_borrar);

-- El perfil y la cuenta. Al quitar la cuenta de auth, el perfil suele irse
-- solo por la llave foranea; se borra antes de todas formas para no
-- depender de como quedo configurada.
delete from public.profiles where id in (select id from a_borrar);
delete from auth.users where id in (select id from a_borrar);

commit;

-- Como quedo: estas dos consultas no deben devolver nada.
select id, full_name from public.profiles
where full_name ilike '%asd%'
   or full_name ilike '%polet%'
   or full_name ilike '%arsibeth%'
   or full_name ilike '%arisbeth%';

select count(*) as cuentas_restantes from auth.users;
