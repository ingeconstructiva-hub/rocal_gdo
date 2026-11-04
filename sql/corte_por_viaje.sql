-- Dejar que tipo_renta acepte 'viaje'.
--
-- El corte por viaje es nuevo. Si la columna trae un CHECK que solo permite
-- hora/dia/semana/mes, el primer equipo que se configure por viaje va a
-- fallar al guardar con un error de restriccion, y en la pantalla se vera
-- como "no se guardo" sin mas explicacion.
--
-- Primero se mira si existe esa restriccion. Si la consulta no devuelve nada,
-- no hay nada que hacer y el resto del archivo se puede ignorar.

select
  con.conname                      as restriccion,
  pg_get_constraintdef(con.oid)    as definicion
from pg_constraint con
join pg_class t on t.oid = con.conrelid
where t.relname = 'gastos_maquinaria'
  and con.contype = 'c';

-- Si arriba salio una restriccion sobre tipo_renta, se reemplaza por una que
-- incluya 'viaje'. Cambiar <nombre_de_la_restriccion> por el que haya salido.
--
-- alter table public.gastos_maquinaria
--   drop constraint <nombre_de_la_restriccion>;
--
-- alter table public.gastos_maquinaria
--   add constraint <nombre_de_la_restriccion>
--   check (tipo_renta in ('hora', 'dia', 'semana', 'viaje', 'mes'));
