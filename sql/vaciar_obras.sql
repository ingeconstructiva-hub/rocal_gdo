-- Vaciar los datos capturados en las obras, para empezar de nuevo.
--
-- NO CORRER SIN HABER PASADO ANTES sql/respaldo_antes_de_vaciar.sql.
-- Esto es definitivo: no hay papelera ni deshacer.
--
-- QUE SE BORRA (diez tablas, todo lo que la gente capturo):
--   bitacora, caja chica, inversiones, destajos, nomina, gastos generales,
--   maquinaria, resguardos, documentos y minutas.
--
-- QUE SE CONSERVA:
--   las obras, los perfiles, las asignaciones de residentes a cada obra,
--   la lista de trabajadores de cada obra, las categorias que hayan creado
--   y los respaldos de obras ya eliminadas.
--
-- El borrado va en una transaccion: o se completa entero, o no pasa nada.
-- Una obra a medio vaciar seria peor que una llena.

-- 1) Lo que hay AHORA. Guarda esta salida: es con lo que vas a comparar.
select 'bitacora'         as modulo, count(*) from public.logs
union all select 'caja chica',             count(*) from public.caja_chica
union all select 'inversiones',            count(*) from public.ingresos_obra
union all select 'destajos',               count(*) from public.inventory
union all select 'nomina',                 count(*) from public.payroll_records
union all select 'gastos generales',       count(*) from public.gastos_generales
union all select 'maquinaria',             count(*) from public.gastos_maquinaria
union all select 'resguardos',             count(*) from public.almacen_herramientas
union all select 'documentos',             count(*) from public.planos
union all select 'minutas',                count(*) from public.minutas;

-- 2) El borrado.
begin;

delete from public.minutas;
delete from public.planos;
delete from public.almacen_herramientas;
delete from public.gastos_maquinaria;
delete from public.gastos_generales;
delete from public.payroll_records;
delete from public.inventory;
delete from public.ingresos_obra;
delete from public.caja_chica;
delete from public.logs;

commit;

-- 3) Como quedo. Las diez deben decir 0.
select 'bitacora'         as modulo, count(*) from public.logs
union all select 'caja chica',             count(*) from public.caja_chica
union all select 'inversiones',            count(*) from public.ingresos_obra
union all select 'destajos',               count(*) from public.inventory
union all select 'nomina',                 count(*) from public.payroll_records
union all select 'gastos generales',       count(*) from public.gastos_generales
union all select 'maquinaria',             count(*) from public.gastos_maquinaria
union all select 'resguardos',             count(*) from public.almacen_herramientas
union all select 'documentos',             count(*) from public.planos
union all select 'minutas',                count(*) from public.minutas;

-- 4) Y lo que NO se toco, para confirmar que sigue ahi.
select 'obras'                as conservado, count(*) from public.projects
union all select 'perfiles',                 count(*) from public.profiles
union all select 'asignaciones de obra',     count(*) from public.project_members
union all select 'trabajadores',             count(*) from public.workers
union all select 'categorias',               count(*) from public.bitacora_categorias;
