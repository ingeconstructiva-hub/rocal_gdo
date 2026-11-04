-- Que se llevo el borrado de una obra, y que se puede devolver.
--
-- "Eliminar obra" (solo admin, y pide teclear el nombre) hace un DELETE real
-- sobre public.projects. No marca inactiva: borra el renglon. Todo lo que
-- cuelga de project_id se va en cascada: caja chica, gastos, bitacora,
-- nomina, trabajadores, inventario, maquinaria. Por eso la info "desaparecio"
-- en varias pantallas a la vez y para todos, no solo para un usuario.
--
-- Antes de borrar, la app guarda un expediente en project_backups con siete
-- tablas en JSON. De ahi se puede reconstruir.

-- 1) Que obras se borraron, cuando, y cuanto trae cada expediente.
select
  created_at                                           as cuando,
  report_data->>'nombre'                               as obra,
  report_data->>'project_id_original'                  as id_original,
  jsonb_array_length(coalesce(report_data->'caja_chica',   '[]'::jsonb)) as caja_chica,
  jsonb_array_length(coalesce(report_data->'gastos',       '[]'::jsonb)) as gastos,
  jsonb_array_length(coalesce(report_data->'bitacora',     '[]'::jsonb)) as bitacora,
  jsonb_array_length(coalesce(report_data->'nomina',       '[]'::jsonb)) as nomina,
  jsonb_array_length(coalesce(report_data->'trabajadores', '[]'::jsonb)) as trabajadores,
  jsonb_array_length(coalesce(report_data->'inventario',   '[]'::jsonb)) as inventario,
  jsonb_array_length(coalesce(report_data->'maquinaria',   '[]'::jsonb)) as maquinaria
from public.project_backups
where report_data->>'motivo' = 'eliminada'
order by created_at desc;

-- 2) Que tablas apuntan a projects y que hacen al borrarse la obra.
--    'c' = CASCADE (se borra con la obra), 'n' = SET NULL, 'a' = NO ACTION.
--    Las que digan 'c' son las que se vaciaron.
select
  src.relname  as tabla,
  con.conname  as llave,
  case con.confdeltype
    when 'c' then 'CASCADE - se borro con la obra'
    when 'n' then 'SET NULL - quedo huerfana'
    when 'a' then 'NO ACTION'
    when 'r' then 'RESTRICT'
    when 'd' then 'SET DEFAULT'
  end          as al_borrar_la_obra
from pg_constraint con
join pg_class src on src.oid = con.conrelid
join pg_class dst on dst.oid = con.confrelid
where con.contype = 'f'
  and dst.relname = 'projects'
order by con.confdeltype, src.relname;
