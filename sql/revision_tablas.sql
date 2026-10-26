-- Revision de tablas que la app no usa.
--
-- El codigo no menciona 'user_projects' ni 'abonos_gastos' en ningun lado.
-- Pero que la app no las use no basta para borrarlas: puede haber datos
-- dentro, o una vista, funcion o llave foranea que dependa de ellas. Esto lo
-- comprueba antes de tocar nada.
--
-- Nada de lo que sigue borra. Los drop estan hasta abajo, comentados.

-- 1) Cuantos renglones tienen. Si salen vacias, el riesgo de borrarlas es casi
--    nulo. Si traen datos, hay que ver de que epoca son antes de decidir.
select 'user_projects'  as tabla, count(*) as renglones from public.user_projects
union all
select 'abonos_gastos',  count(*) from public.abonos_gastos;

-- 2) Que depende de ellas: vistas, funciones o triggers que las nombren.
--    has_project_access, por ejemplo, lee project_members y no user_projects,
--    pero conviene confirmarlo aqui y no de memoria.
select p.proname as objeto, 'funcion' as tipo
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and pg_get_functiondef(p.oid) ~* '(user_projects|abonos_gastos)'
union all
select c.relname, case c.relkind when 'v' then 'vista' else 'vista materializada' end
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('v', 'm')
  and pg_get_viewdef(c.oid) ~* '(user_projects|abonos_gastos)';

-- 3) Llaves foraneas que apunten HACIA ellas: si otra tabla las referencia,
--    borrarlas se lleva esa relacion por delante.
select tc.table_name as tabla_que_depende, tc.constraint_name
from information_schema.table_constraints tc
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
where tc.constraint_type = 'FOREIGN KEY'
  and ccu.table_name in ('user_projects', 'abonos_gastos');


-- ---------------------------------------------------------------
-- SOLO SI las tres consultas salen limpias (sin renglones, sin
-- dependencias, sin llaves apuntando hacia ellas):
--
-- drop table if exists public.user_projects;
-- drop table if exists public.abonos_gastos;
--
-- Si traen datos y no quieres perderlos todavia, una salida intermedia es
-- quitarles el permiso abierto que tienen hoy, que deja escribir a cualquier
-- usuario con sesion, y dejarlas ahi sin que nadie las toque:
--
-- drop policy if exists "Permitir todo a autenticados en user_projects" on public.user_projects;
-- drop policy if exists "Permitir todo a autenticados en abonos_gastos" on public.abonos_gastos;
