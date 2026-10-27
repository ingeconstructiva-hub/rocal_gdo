-- Todo lo que la base necesita para la version que se va a publicar.
--
-- Si falta algo de esta lista, el residente se lo encuentra en obra y sin
-- forma de arreglarlo. Mas barato comprobarlo aqui que por telefono.
--
-- Cada renglon debe decir OK. Lo que diga FALTA trae el archivo que lo crea.

select 'tabla minutas' as necesita,
       case when to_regclass('public.minutas') is not null
            then 'OK' else 'FALTA -> sql/minutas.sql' end as estado
union all
select 'tabla bitacora_categorias',
       case when to_regclass('public.bitacora_categorias') is not null
            then 'OK' else 'FALTA -> sql/bitacora_categorias.sql' end
union all
select 'bitacora_categorias.modulo',
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='bitacora_categorias'
                            and column_name='modulo')
            then 'OK' else 'FALTA -> sql/categorias_por_modulo.sql' end
union all
select 'payroll_records.extra_hours',
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='payroll_records'
                            and column_name='extra_hours')
            then 'OK' else 'FALTA -> sql/horas_extra.sql' end
union all
select 'payroll_records.extra_reason',
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='payroll_records'
                            and column_name='extra_reason')
            then 'OK' else 'FALTA -> sql/horas_extra.sql' end
union all
select 'almacen_herramientas.nombre_entrega',
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='almacen_herramientas'
                            and column_name='nombre_entrega')
            then 'OK' else 'FALTA -> sql/quien_entrega.sql' end
union all
select 'almacen_herramientas.entregado_por',
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='almacen_herramientas'
                            and column_name='entregado_por')
            then 'OK' else 'FALTA -> sql/quien_entrega.sql' end
union all
select 'gastos_generales.monto_pagado',
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='gastos_generales'
                            and column_name='monto_pagado')
            then 'OK' else 'FALTA -> alter table gastos_generales add monto_pagado numeric' end
union all
select 'ingresos_obra.solicitante',
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='ingresos_obra'
                            and column_name='solicitante')
            then 'OK' else 'FALTA -> sql/solicitante_inversion.sql' end
order by estado desc, necesita;
