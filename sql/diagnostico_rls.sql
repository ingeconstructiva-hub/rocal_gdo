-- Diagnóstico de RLS: por qué un residente no puede insertar.
-- No asume cómo se llaman las columnas de profiles (rol vs role), así que
-- corre completo sin abortar. Pega las dos salidas.

-- A) LAS POLÍTICAS. La salida más importante.
select tablename as tabla, policyname as politica, cmd as operacion,
       roles, qual as condicion_lectura, with_check as condicion_escritura
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;

-- B) Rol de cada usuario y en cuántas obras está dado de alta.
--    Si los residentes salen con 0 proyectos y las políticas piden membresía,
--    ese es el bug: no falta política, falta asignarlos a la obra.
select p.id,
       to_jsonb(p)->>'rol'       as col_rol,
       to_jsonb(p)->>'role'      as col_role,
       to_jsonb(p)->>'nombre'    as col_nombre,
       to_jsonb(p)->>'full_name' as col_full_name,
       count(pm.project_id)      as proyectos_asignados
from public.profiles p
left join public.project_members pm on pm.user_id = p.id
group by p.id
order by proyectos_asignados;
