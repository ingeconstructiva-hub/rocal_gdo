-- Las obras del Excel que todavía no existen en la app, con su residente.
--
-- Son dos: la segunda de Papalotla y el proyecto ejecutivo de Tepeyanco.
-- POZOS PAPALOTLA se omite a propósito: esa no se da de alta.
--
-- QUE REVISAR ANTES DE CORRER ESTO
--
-- 1. Los residentes se buscan por nombre con "ilike", porque aquí no se
--    conocen sus id. Si hay dos personas cuyo nombre contenga "Santiago",
--    las DOS quedan asignadas. Para verlo antes:
--
--      select id, full_name, role from public.profiles order by full_name;
--
--    Si hace falta, se afina el texto de abajo ('%santiago%' -> '%santiago r%').
--
-- 2. La ubicación es el municipio que se desprende del nombre de la obra, no
--    un dato del Excel. Si tienen la dirección exacta, se corrige aquí: esa
--    línea se imprime en las minutas.
--
-- 3. La fecha de inicio es la del primer gasto de cada hoja. Si arrancaron
--    antes, se ajusta.
--
-- Se puede correr dos veces sin duplicar: la obra solo se crea si no existe
-- y la asignación solo se agrega si no estaba.

-- ---------- 1. Las obras ----------
insert into public.projects (name, location, start_date)
select v.nombre, v.ubicacion, v.inicio
from (values
  ('OBRA 2 DE PAPALOTLA',         'Papalotla de Xicohténcatl, Tlaxcala', date '2026-09-22'),
  ('PROYECTO EJECUTIVO TEPEYANCO','Tepeyanco, Tlaxcala',                 date '2026-09-02')
) as v(nombre, ubicacion, inicio)
where not exists (
  select 1 from public.projects p
   where upper(trim(p.name)) = upper(trim(v.nombre))
);

-- ---------- 2. Los residentes ----------
-- Santiago lleva la de Papalotla; Emmanuel y Adriana, la de Tepeyanco.
insert into public.project_members (user_id, project_id, role)
select distinct pr.id, p.id, 'residente'
from (values
  ('OBRA 2 DE PAPALOTLA',          '%santiago%'),
  ('PROYECTO EJECUTIVO TEPEYANCO', '%emmanuel%'),
  ('PROYECTO EJECUTIVO TEPEYANCO', '%adriana%')
) as v(obra, quien)
join public.projects p on upper(trim(p.name)) = upper(trim(v.obra))
join public.profiles pr on pr.full_name ilike v.quien
where not exists (
  select 1 from public.project_members m
   where m.project_id = p.id and m.user_id = pr.id
);

-- ---------- 3. Como quedo ----------
select
  p.name            as obra,
  p.location        as ubicacion,
  p.start_date      as inicio,
  coalesce(string_agg(pr.full_name || ' (' || m.role || ')', ', ' order by pr.full_name), 'SIN RESIDENTE') as asignados
from public.projects p
left join public.project_members m on m.project_id = p.id
left join public.profiles pr on pr.id = m.user_id
where upper(trim(p.name)) in ('OBRA 2 DE PAPALOTLA', 'PROYECTO EJECUTIVO TEPEYANCO')
group by p.name, p.location, p.start_date
order by p.name;
