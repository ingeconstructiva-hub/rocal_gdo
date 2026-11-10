-- Como quedo la base despues de vaciar. Una sola consulta.
--
-- Lo que se vacio debe salir en 0. Lo que se conserva debe traer numeros.
-- Si algo no cuadra, el respaldo sigue en el esquema 'respaldo'.

select 'VACIADO' as grupo, 'bitacora'              as cosa, count(*) as cuantos from public.logs
union all select 'VACIADO', 'caja chica',                   count(*) from public.caja_chica
union all select 'VACIADO', 'inversiones',                  count(*) from public.ingresos_obra
union all select 'VACIADO', 'destajos',                     count(*) from public.inventory
union all select 'VACIADO', 'nomina',                       count(*) from public.payroll_records
union all select 'VACIADO', 'gastos generales',             count(*) from public.gastos_generales
union all select 'VACIADO', 'maquinaria',                   count(*) from public.gastos_maquinaria
union all select 'VACIADO', 'resguardos',                   count(*) from public.almacen_herramientas
union all select 'VACIADO', 'documentos',                   count(*) from public.planos
union all select 'VACIADO', 'minutas',                      count(*) from public.minutas

union all select 'SE QUEDA', 'obras',                       count(*) from public.projects
union all select 'SE QUEDA', 'perfiles',                    count(*) from public.profiles
union all select 'SE QUEDA', 'cuentas de acceso',           count(*) from auth.users
union all select 'SE QUEDA', 'asignaciones a obra',         count(*) from public.project_members
union all select 'SE QUEDA', 'trabajadores',                count(*) from public.workers
union all select 'SE QUEDA', 'categorias',                  count(*) from public.bitacora_categorias

union all select 'ALMACEN', 'fotos de obras',               count(*) from storage.objects where bucket_id = 'obras'
union all select 'ALMACEN', 'fotos de perfil',              count(*) from storage.objects where bucket_id = 'identificaciones' and name like 'perfiles/%'
union all select 'ALMACEN', 'lo demas (debe ser 0)',        count(*) from storage.objects
  where not (bucket_id = 'obras' or (bucket_id = 'identificaciones' and name like 'perfiles/%'))

order by grupo desc, cosa;

-- Quien quedo con acceso, por si borraste cuentas.
select p.full_name, p.role, u.email
from public.profiles p
left join auth.users u on u.id = p.id
order by p.role, p.full_name;
