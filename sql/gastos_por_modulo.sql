-- Los gastos del Excel, cada uno en su modulo.
--
-- Reemplaza la carga anterior, que metia TODO en Gastos Generales. Aquel
-- archivo venia sin tipo; este si lo trae, asi que cada movimiento se va a
-- donde se captura normalmente: destajos a Destajos, caja chica a Caja Chica,
-- renta de maquina a Maquinaria, y lo demas a Gastos Generales.
--
-- QUE HACE, EN ORDEN
--   1. Borra los 136 renglones de la carga anterior.
--   2. Mete 146 movimientos en sus cuatro modulos.
--   3. Dice como quedo cada obra.
--
-- QUE NO HACE
--   - POZOS PAPALOTLA y DRENAJE TEPEXCO quedan fuera: esas obras no se dan de
--     alta, asi que sus 17 movimientos no entran.
--   - Los 24 de la hoja "Por revisar" tampoco: estan en
--     sql/gastos_por_revisar.sql para decidirlos uno por uno.
--
-- Correrlo COMPLETO y una sola vez: el borrado va primero y los insert
-- despues. Si se corre dos veces, los movimientos se duplican.
--
-- Los nombres de obra de la derecha tienen que existir en public.projects. La
-- que no empate no inserta nada y sale en el reporte del final.

begin;

-- ============ 1. Fuera la carga anterior ============
-- Se borra por el texto exacto del concepto, no por fecha: asi no se lleva
-- por delante nada que hayan capturado a mano desde la app.
delete from public.gastos_generales
where concepto in (
  'Invitacion de Tequila Hornito a Obras Publicas, Contador Bulmaro, Innaguracion de Obra San Pablo del Monte',
  'LONA DE INICIO DE OBRA SPM AMPLIACION C2',
  'Apoyo Social Presidenta de SPM Conta. Gumaro',
  'Caja chica Arq. Gabriel Fecha: 12/10/2026',
  'Pago de bases al municipio de San Pablo del Monte, Tlaxcala',
  'Compra de refrescos y galletas para entrega de concurso de la Ampliacion C2 SPM',
  'Caja chica Arq. Gabriel Fecha: 13/10/2026',
  'Caja chica Arq. Gabriel Fecha: 14/10/2026',
  'Caja Chica Arq. Gabriel, compra de Cementos y Cal',
  'Caja Chica Arq. Gabriel, 17/10/2026',
  'Caja Chica Arq. Gabriel, 17/10/2026',
  'CAJA CHICA ARQ. GABRIEL',
  'Compra de 1 viaje de grava y viaje de escombro (Administracion Javier)',
  'CAJA CHICA ARQ. GABRIEL (Administracion GABRIEL)',
  'Invitamos a comer a los de Obras Publicas el conta gumaro',
  'Destajo MO, Corte 17 de octubre (Mtr Cristian Y Mtro Javier)',
  'Caja Chica Arq. gabriel 24 de Octubre 2026',
  'Caja Chica Ampliacion C2 Compra de material y otras cosas (Administracion Gabriel)',
  'Renta de Retro Excavadora y pago de Tabiques (Adminstracion Santiago)',
  'Caja Chica (Administracion Gabriel)',
  'Caja Chica (Administracion Gabriel)',
  'Apoyo Social Hermano de Presi SPM (Administracion Conta Bulmaro)',
  'Caja Chica (Administracion Gabriel - Emmanuel)',
  'Caja Chica (Administracion Gabriel - Emmanuel)',
  'Caja Chica, compra de pico y otras cosas (Administracion Gabriel)',
  'Compra de 10 Varillas de 1/2''''',
  'NOMINA MANO DE OBRA  CRISTIAN Y SUS TRABAJADORES (ADM SANTIAGO)',
  'DESTAJOS DEL 24 AL 31 DE OCT, 2026 MANO DE OBRA (ADM GABRIEL)',
  '$3000 Pago de retroexcavador del dia de reparacion (Ing. Santiago) y $3600 Pago de Material (Arq. Gabriel)',
  'Compra de discos para guillotina ($400) y $600 Caja chica (Arq. Gabriel)',
  'Caja chica Arq. Gabriel Ampliacion C2',
  'Lote 1 y 2 de material eléctrico (tubería conduit galvanizado y ppr) Javier Domingo',
  'NOMINA CRISTIAN Y SUS TRABAJADORES DEL 02 DE NOVIEMBRE AL 07 DE NOVIEMBRE (ADM SANTIAGO)',
  'DESTAJOS DEL 02 DE NOVIEMBRE AL 07 DE NOVIEMBRE 2026 MANO DE OBRA (ADM GABRIEL)',
  'compra de 4 millares de tabique',
  'CAJA CHICA ARQ. GABRIEL 10 DE NOVIEMBRE 2026',
  'Pago de PADRON DE CONTRATISTAS PAPALOTLA DE XICOHTENCATL',
  'Pago de PADRON DE CONTRATISTAS PAPALOTLA DE XICOHTENCATL JAVIER DOMINGO',
  'Topografía y Proyecto',
  'Pago día de oficial Albañil para desyerbe de Arboles y apoyo en Inaguracion de obra',
  'Pago día de Ayudante Albañil para desyerbe de Arboles y apoyo en Inaguracion de obra',
  'PAGO A RETROEXCAVADORA 1 HR  POR INAGURACION DE OBRA',
  'ACOMPLETAR DINERO PARA BOTELLAS Y REFRESCOS EN INAGURACION DE OBRA (EL CONTA BULMARO ME DIO $500 SE ACOMPLETO $900)',
  'Gasolina Coche Gris para ir a inaguracion de obra papalotla',
  'Pago Finiquito a Ing. Topografo',
  'Pago a Ing. de Mecanica de Suelos',
  'Pago a Ing. ESTRUCTURISTA',
  'Pago de Tubería Milo',
  'Compra de 2 Millares de Tabique para pozos de visita',
  'Caja Chica Arq. Santiago 25 de Agosto 2025',
  'PAGO A RETROEXCAVADORA 2 HR ($8,000), 2 TONELADAS DE CEMENTO ($9200)',
  'Pago finiquito a Ing. Andrés de Mecanica de Suelos',
  'caja chica ($2,600) y dos días de retroexcavadora ($8,000)',
  '2 viajes de grava 1340 y 1/2 de Grava 1340',
  'Destajo MO, Corte 29 de Agosto (Mtr Marco)',
  '8 Varillas de 3/8',
  'APOYO SOCIAL PRESIDENTE DE PAPALOTLA',
  'Gasolina de Coche Gris para ir a dejar apoyo social a presidente',
  'Pago de último día de Retroexcavadora Obra drenaje Papalotla',
  'Caja Chica Arq. santiago 30 DE AGOSTO',
  'Caja Chica Arq. Santiago 1 de Septiembre',
  'COMPRA DE 27 VARILLAS DE 5/8 Y 3 VARILLAS DE 1/2',
  'ANTICIPO DESTAJOS (PAILERIA MTR MAXIMINO)',
  'Pago de 2 millares de Tabique ($5000) y 2 hrs de Maquina ($1900)',
  'Compra de camión de 6 m3 de Tepetate para mejoramiento de suelo',
  'MADERA (25 POLINES 1.5 M ) ($2,500) , 3 VARILLAS DE 3/8 Y 3 DE 5/8 ($1,567) Y CAJA CHICA (04 / 09 / 2026) ($2,500)',
  'Perfiles Estructura  (Aceros Geovany) 2026',
  '*Destajo MO, Corte 31 de Agosto al 05 de Septiembre (Mtr Marco)',
  'Destajo MO, Corte 31 de Agosto al 05 de Septiembre (Mtr Maximino, Pailería)',
  'Varilla y Cemento para zapatas',
  'Caja Chica (posible compra de pintura para estructura)',
  'Pago de Retroexcavadora para hacer rampa en obra drenaje papalotla (4HRS X $900)',
  'Compra de pintura y primer para estructura ($8200) y caja chica ($1000)',
  'Pago acero',
  'Destajo MO, Corte 7 al 12 de Septiembre (Mtr Maximino, Pailería)',
  'Destajo MO, Corte 12 de Septiembre (Mtr Angel)',
  'Caja Chica Arq. Santiago',
  'Compra de Redondos de 3/4 de Pulgadas Gr. 55 para Anclas de Estructura',
  'Caja Chica Arq. Santiago 16 Septiembre',
  'Pago de Placas, Retro y Cuerdas de Anclas',
  'Pago de soleras a Geovany',
  'Caja Chica Arq. Santiago ($3,000) y $3500 para pintura',
  'Hule para tapar Zapatas',
  'Destajo MO, Corte 19 de Septiembre (Mtr Angel)',
  'Destajo MO, Corte 14 al 19 de Septiembre (Mtr Maximino, Pailería)',
  'Caja Chica para pagar Retroexcavadora por 3ra Vuelta',
  'PAGO DE CONCRETO',
  'COMPRA DE CEMENTO para Últimos trabajos de Albañileria (Arq. Santiago)',
  'RETRO para rellenar Zanjas en Drenaje Papalotla',
  'Apoyo a Lic. Karla por la reparacion de su Laptop',
  'Compra de 2 rodamientos SKF  30305 C',
  'Suministro de Tubo RD Liso para cruce de drenaje',
  'PAGO PARA TERMUFIOSIONADO DE TUBOS Y GRUAS PARA COLOCACION DE ESTRUCTURA',
  'Mecanizado y compra de ColdRoller',
  'Compra de Tubo Ced 40',
  'Destajo MO, Corte 26 de Septiembre (Mtr Cristian)',
  'Destajo MO, Corte 21 al 26 de Septiembre (Mtr Maximino, Pailería)',
  'Destajo MO, Corte 3 de octubre 2026 (Mtr Cristian)',
  'Destajo MO, Corte 10 de octubre (Mtr Cristian)',
  'Gasolina a camioneta para ir a dejar bailarina con el conta gumaro y revisar deslave en papalotla',
  'Destajo MO, Corte 17 de octubre (Mtr Cristian)',
  'Destajo MO, Corte 17 de octubre (Mtr Cristian)',
  'COMPRAS QUE SE HICIERON EN OBRA DE DRENAJE PAPALOTLA PARA HACER MURO Y RELLENO (ADMNISTRACION, ARQ. SANTIAGO)',
  'REPARACION DE CAMIONETA (AFINACION Y CAMBIO DE FRENOS)',
  'Anticipo Tapas de concreto (Artemio) 5 de Noviembre',
  'Acarreos de material ( mantenimiento a unidad )',
  'Viáticos (estimaciones con obras publicas)',
  'Utilidad adelantada del porcentaje (Cont. Gumaro)',
  'Apoyo social anticipo Presidente de Papalotla',
  'Comida con Contador Gumaro y Supervisor, asi como con Arquis durante el recorrido de obra',
  'Anticipo Topografía (Obra 2) Ing Francisco',
  'Renta de Retroexcavadora para inaguración y Despalmar calle',
  'Apoyo social Presidenta del Cristo',
  'Caja Chica Arq. Emmanuel',
  'Pago anticipo a Arq. Álvaro',
  'Pago del 30% de Renta de Retroexcavadora Arq. Adriana',
  'Caja Chica Arq. Emmanuel 18 de Septiembre',
  'Deposito a Juan Facturas',
  'Caja chica (Emmanuel) para pagar 2do Viaje de Arena',
  'Mano de Obra (Mtr Javier Domingo)',
  'Caja chica (Emmanuel) 3er viaje de arena21 de Septiembre',
  'Compra de materiales PARA REGISTRO DE valvula y gasolina javier',
  'Caja Chica Arq. Emmanuel',
  'SE NECESITA PARA MATERIAL ALAMBRE, CEMENTO, GRAVA, COLADO',
  'Mano de Obra (Mtr Javier Domingo) corte 26 de septiembre 2026',
  'Liquidacion del 70% de Renta de Retroexcavadora Arq. Adriana',
  'Apoyo social Presidenta del Cristo',
  'Caja Chica Arq. Santiago bacheo en totolac',
  'Apoyo Social Presi Benjamin,  Totolac',
  'Pago de Hra Renta de Retroexcavadora para Inauguración de Obra en Totolac',
  'Compra de refrescos y botella para Inauguración, Totolac',
  'Renta de día de retroexcavadora y pago de 4 viajes de escombro en TOTOLAC',
  'CAJA CHICA ARQ. SANTIAGO PAGO DE RETRO Y CAMIONES DE VIAJE DE ESCOMBRO -10 DE NOVIEMBRE 2026',
  'PAGO TOPOGRAFÍA PROYECTO ALBERCA SEMIOLIMPICA TEPEYANCO (ING FRANCISCO)',
  'ANTICIPO ING. ANDRES Mecanica de Suelos PROY EJECUTIVO TEPEYANCO',
  'Finiquito Mecánica de Suelos Ing. Andres'
);

-- ============ 2. Los movimientos ============
-- La hoja del Excel y la obra de la base. Si una se llama distinto, se cambia
-- AQUI y nada mas aqui.
create temporary table obras_carga on commit drop as
select p.id as project_id, upper(trim(p.name)) as obra
from public.projects p
where upper(trim(p.name)) in (
  'AMPLIACION C2',
  'DRENAJE PAPALOTLA',
  'OBRA 2 DE PAPALOTLA',
  'AGUA POTABLE EL CRISTO',
  'OBRAS TOTOLAC',
  'PROYECTO EJECUTIVO TEPEYANCO'
);

-- ---- Control de Destajos (24) ----
-- Son montos globales de un corte, no actividades sueltas: el Excel no trae
-- volumenes ni precios unitarios. Entran como un renglon por corte, con
-- unidad LOTE, para que la suma de la semana cuadre. El maestro se lee del
-- propio motivo cuando viene nombrado.
insert into public.inventory (project_id, name, unit, quantity, unit_price, week_label, requested_by, in_charge, is_active)
select o.project_id, v.concepto, 'LOTE', 1, v.monto, v.semana, 'Carga inicial', v.maestro, true
from (values
  ('AMPLIACION C2', 'Destajo MO, Corte 17 de octubre (Mtr Cristian Y Mtro Javier)', 19883.33::numeric, '19 OCT - 23 OCT 2026', 'Mtro. Cristian'),
  ('AMPLIACION C2', 'NOMINA MANO DE OBRA  CRISTIAN Y SUS TRABAJADORES (ADM SANTIAGO)', 5800.00::numeric, '26 OCT - 30 OCT 2026', 'Sin destajista'),
  ('AMPLIACION C2', 'DESTAJOS DEL 24 AL 31 DE OCT, 2026 MANO DE OBRA (ADM GABRIEL)', 20200.00::numeric, '26 OCT - 30 OCT 2026', 'Sin destajista'),
  ('AMPLIACION C2', 'NOMINA CRISTIAN Y SUS TRABAJADORES DEL 02 DE NOVIEMBRE AL 07 DE NOVIEMBRE (ADM SANTIAGO)', 3866.00::numeric, '2 NOV - 6 NOV 2026', 'Sin destajista'),
  ('AMPLIACION C2', 'DESTAJOS DEL 02 DE NOVIEMBRE AL 07 DE NOVIEMBRE 2026 MANO DE OBRA (ADM GABRIEL)', 16750.00::numeric, '2 NOV - 6 NOV 2026', 'Sin destajista'),
  ('DRENAJE PAPALOTLA', 'Pago día de oficial Albañil para desyerbe de Arboles y apoyo en Inaguracion de obra', 550.00::numeric, '10 AGO - 14 AGO 2026', 'Sin destajista'),
  ('DRENAJE PAPALOTLA', 'Pago día de Ayudante Albañil para desyerbe de Arboles y apoyo en Inaguracion de obra', 483.00::numeric, '10 AGO - 14 AGO 2026', 'Sin destajista'),
  ('DRENAJE PAPALOTLA', 'Destajo MO, Corte 29 de Agosto (Mtr Marco)', 15137.00::numeric, '24 AGO - 28 AGO 2026', 'Mtro. Marco'),
  ('DRENAJE PAPALOTLA', 'ANTICIPO DESTAJOS (PAILERIA MTR MAXIMINO)', 5000.00::numeric, '31 AGO - 4 SEP 2026', 'Sin destajista'),
  ('DRENAJE PAPALOTLA', '*Destajo MO, Corte 31 de Agosto al 05 de Septiembre (Mtr Marco)', 13100.00::numeric, '31 AGO - 4 SEP 2026', 'Mtro. Marco'),
  ('DRENAJE PAPALOTLA', 'Destajo MO, Corte 31 de Agosto al 05 de Septiembre (Mtr Maximino, Pailería)', 9000.00::numeric, '31 AGO - 4 SEP 2026', 'Mtro. Maximino'),
  ('DRENAJE PAPALOTLA', 'Destajo MO, Corte 7 al 12 de Septiembre (Mtr Maximino, Pailería)', 20000.00::numeric, '7 SEP - 11 SEP 2026', 'Mtro. Maximino'),
  ('DRENAJE PAPALOTLA', 'Destajo MO, Corte 12 de Septiembre (Mtr Angel)', 19050.00::numeric, '7 SEP - 11 SEP 2026', 'Mtro. Angel'),
  ('DRENAJE PAPALOTLA', 'Destajo MO, Corte 19 de Septiembre (Mtr Angel)', 14833.33::numeric, '14 SEP - 18 SEP 2026', 'Mtro. Angel'),
  ('DRENAJE PAPALOTLA', 'Destajo MO, Corte 14 al 19 de Septiembre (Mtr Maximino, Pailería)', 16000.00::numeric, '14 SEP - 18 SEP 2026', 'Mtro. Maximino'),
  ('DRENAJE PAPALOTLA', 'Destajo MO, Corte 26 de Septiembre (Mtr Cristian)', 17266.66::numeric, '21 SEP - 25 SEP 2026', 'Mtro. Cristian'),
  ('DRENAJE PAPALOTLA', 'Destajo MO, Corte 21 al 26 de Septiembre (Mtr Maximino, Pailería)', 7481.00::numeric, '21 SEP - 25 SEP 2026', 'Mtro. Maximino'),
  ('DRENAJE PAPALOTLA', 'Destajo MO, Corte 3 de octubre 2026 (Mtr Cristian)', 17266.66::numeric, '28 SEP - 2 OCT 2026', 'Mtro. Cristian'),
  ('DRENAJE PAPALOTLA', 'Destajo MO, Corte 10 de octubre (Mtr Cristian)', 3484.00::numeric, '5 OCT - 9 OCT 2026', 'Mtro. Cristian'),
  ('DRENAJE PAPALOTLA', 'Destajo MO, Corte 17 de octubre (Mtr Cristian)', 12400.00::numeric, '12 OCT - 16 OCT 2026', 'Mtro. Cristian'),
  ('DRENAJE PAPALOTLA', 'Destajo MO, Corte 17 de octubre (Mtr Cristian) (POSIBLE DUPLICADO de la fila 464)', 12400.00::numeric, '12 OCT - 16 OCT 2026', 'Mtro. Cristian'),
  ('AGUA POTABLE EL CRISTO', 'Pago anticipo a Arq. Álvaro (Anticipo a Arq. Álvaro: se asumió subcontrato/mano de obra)', 6000.00::numeric, '14 SEP - 18 SEP 2026', 'Arq. Álvaro'),
  ('AGUA POTABLE EL CRISTO', 'Mano de Obra (Mtr Javier Domingo)', 3233.33::numeric, '14 SEP - 18 SEP 2026', 'Mtro. Javier'),
  ('AGUA POTABLE EL CRISTO', 'Mano de Obra (Mtr Javier Domingo) corte 26 de septiembre 2026', 5666.67::numeric, '21 SEP - 25 SEP 2026', 'Mtro. Javier')
) as v(obra, concepto, monto, semana, maestro)
join obras_carga o on o.obra = v.obra;

-- ---- Caja Chica (49) ----
-- Quien recibio la caja se lee del motivo cuando viene nombrado; si no, queda
-- dicho que viene de la carga, que es mejor que inventarle un dueño.
insert into public.caja_chica (project_id, numero_nota, encargado, monto, unidad, tipo_deposito, concepto, cantidad, precio_unitario, fecha, is_active)
select o.project_id, 'S/N', v.encargado, v.monto, 'General', 'efectivo', v.concepto, 1, v.monto, v.fecha, true
from (values
  ('AMPLIACION C2', 'Invitacion de Tequila Hornito a Obras Publicas, Contador Bulmaro, Innaguracion de Obra San Pablo del Monte', 400.00::numeric, 'Carga inicial', date '2026-08-20'),
  ('AMPLIACION C2', 'LONA DE INICIO DE OBRA SPM AMPLIACION C2', 750.00::numeric, 'Carga inicial', date '2026-08-21'),
  ('AMPLIACION C2', 'Caja chica Arq. Gabriel Fecha: 12/10/2026', 1500.00::numeric, 'Arq. Gabriel', date '2026-10-12'),
  ('AMPLIACION C2', 'Compra de refrescos y galletas para entrega de concurso de la Ampliacion C2 SPM', 200.00::numeric, 'Carga inicial', date '2026-10-13'),
  ('AMPLIACION C2', 'Caja chica Arq. Gabriel Fecha: 13/10/2026', 3000.00::numeric, 'Arq. Gabriel', date '2026-10-13'),
  ('AMPLIACION C2', 'Caja chica Arq. Gabriel Fecha: 14/10/2026', 3000.00::numeric, 'Arq. Gabriel', date '2026-10-14'),
  ('AMPLIACION C2', 'Caja Chica Arq. Gabriel, compra de Cementos y Cal', 7000.00::numeric, 'Arq. Gabriel', date '2026-10-16'),
  ('AMPLIACION C2', 'Caja Chica Arq. Gabriel, 17/10/2026', 2000.00::numeric, 'Arq. Gabriel', date '2026-10-16'),
  ('AMPLIACION C2', 'Caja Chica Arq. Gabriel, 17/10/2026', 2000.00::numeric, 'Arq. Gabriel', date '2026-10-17'),
  ('AMPLIACION C2', 'CAJA CHICA ARQ. GABRIEL', 380.00::numeric, 'Carga inicial', date '2026-10-20'),
  ('AMPLIACION C2', 'CAJA CHICA ARQ. GABRIEL (Administracion GABRIEL)', 2890.00::numeric, 'GABRIEL', date '2026-10-22'),
  ('AMPLIACION C2', 'Invitamos a comer a los de Obras Publicas el conta gumaro', 595.00::numeric, 'Carga inicial', date '2026-10-22'),
  ('AMPLIACION C2', 'Caja Chica Arq. gabriel 24 de Octubre 2026', 3000.00::numeric, 'Carga inicial', date '2026-10-24'),
  ('AMPLIACION C2', 'Caja Chica Ampliacion C2 Compra de material y otras cosas (Administracion Gabriel)', 6500.00::numeric, 'Gabriel', date '2026-10-27'),
  ('AMPLIACION C2', 'Caja Chica (Administracion Gabriel)', 2000.00::numeric, 'Gabriel', date '2026-10-27'),
  ('AMPLIACION C2', 'Caja Chica (Administracion Gabriel)', 2000.00::numeric, 'Gabriel', date '2026-10-28'),
  ('AMPLIACION C2', 'Caja Chica (Administracion Gabriel - Emmanuel)', 2000.00::numeric, 'Gabriel', date '2026-10-29'),
  ('AMPLIACION C2', 'Caja Chica (Administracion Gabriel - Emmanuel)', 2000.00::numeric, 'Gabriel', date '2026-10-29'),
  ('AMPLIACION C2', 'Caja Chica, compra de pico y otras cosas (Administracion Gabriel)', 2000.00::numeric, 'Gabriel', date '2026-10-30'),
  ('AMPLIACION C2', 'Compra de discos para guillotina ($400) y $600 Caja chica (Arq. Gabriel)', 1000.00::numeric, 'Arq. Gabriel', date '2026-11-04'),
  ('AMPLIACION C2', 'Caja chica Arq. Gabriel Ampliacion C2', 1000.00::numeric, 'Arq. Gabriel', date '2026-11-05'),
  ('AMPLIACION C2', 'CAJA CHICA ARQ. GABRIEL 10 DE NOVIEMBRE 2026', 3000.00::numeric, 'Carga inicial', date '2026-11-10'),
  ('AMPLIACION C2', 'CAJA CHICA 12/11/2026 (ADMINISTRACION ARQ GABRIEL)', 2000.00::numeric, 'ARQ', date '2026-11-11'),
  ('DRENAJE PAPALOTLA', 'ACOMPLETAR DINERO PARA BOTELLAS Y REFRESCOS EN INAGURACION DE OBRA (EL CONTA BULMARO ME DIO $500 SE ACOMPLETO $900)', 400.00::numeric, 'Carga inicial', date '2026-08-12'),
  ('DRENAJE PAPALOTLA', 'Gasolina Coche Gris para ir a inaguracion de obra papalotla', 200.00::numeric, 'Carga inicial', date '2026-08-13'),
  ('DRENAJE PAPALOTLA', 'Caja Chica Arq. Santiago 25 de Agosto 2025', 3000.00::numeric, 'Arq. Santiago', date '2026-08-25'),
  ('DRENAJE PAPALOTLA', 'caja chica ($2,600) y dos días de retroexcavadora ($8,000) (Desglose según el motivo)', 2600.00::numeric, 'Carga inicial', date '2026-08-28'),
  ('DRENAJE PAPALOTLA', 'Gasolina de Coche Gris para ir a dejar apoyo social a presidente', 300.00::numeric, 'Carga inicial', date '2026-09-01'),
  ('DRENAJE PAPALOTLA', 'Caja Chica Arq. santiago 30 DE AGOSTO', 1000.00::numeric, 'Carga inicial', date '2026-09-01'),
  ('DRENAJE PAPALOTLA', 'Caja Chica Arq. Santiago 1 de Septiembre', 3000.00::numeric, 'Arq. Santiago', date '2026-09-01'),
  ('DRENAJE PAPALOTLA', 'MADERA (25 POLINES 1.5 M ) ($2,500) , 3 VARILLAS DE 3/8 Y 3 DE 5/8 ($1,567) Y CAJA CHICA (04 / 09 / 2026) ($2,500) (Desglose según el motivo)', 2500.00::numeric, 'Carga inicial', date '2026-09-04'),
  ('DRENAJE PAPALOTLA', 'Caja Chica (posible compra de pintura para estructura)', 2000.00::numeric, 'Carga inicial', date '2026-09-07'),
  ('DRENAJE PAPALOTLA', 'Compra de pintura y primer para estructura ($8200) y caja chica ($1000) (Desglose según el motivo)', 1000.00::numeric, 'Carga inicial', date '2026-09-11'),
  ('DRENAJE PAPALOTLA', 'Caja Chica Arq. Santiago', 2500.00::numeric, 'Arq. Santiago', date '2026-09-14'),
  ('DRENAJE PAPALOTLA', 'Caja Chica Arq. Santiago 16 Septiembre', 3000.00::numeric, 'Arq. Santiago', date '2026-09-16'),
  ('DRENAJE PAPALOTLA', 'Caja Chica Arq. Santiago ($3,000) y $3500 para pintura (Desglose según el motivo)', 3000.00::numeric, 'Arq. Santiago', date '2026-09-18'),
  ('DRENAJE PAPALOTLA', 'Caja Chica para pagar Retroexcavadora por 3ra Vuelta', 1000.00::numeric, 'Carga inicial', date '2026-09-19'),
  ('DRENAJE PAPALOTLA', 'Gasolina a camioneta para ir a dejar bailarina con el conta gumaro y revisar deslave en papalotla', 500.00::numeric, 'Carga inicial', date '2026-10-11'),
  ('DRENAJE PAPALOTLA', 'Viáticos (estimaciones con obras publicas)', 1000.00::numeric, 'Carga inicial', date '2026-11-09'),
  ('OBRA 2 DE PAPALOTLA', 'Comida con Contador Gumaro y Supervisor, asi como con Arquis durante el recorrido de obra', 500.00::numeric, 'Carga inicial', date '2026-09-22'),
  ('AGUA POTABLE EL CRISTO', 'Caja Chica Arq. Emmanuel', 1000.00::numeric, 'Arq. Emmanuel', date '2026-09-17'),
  ('AGUA POTABLE EL CRISTO', 'Caja Chica Arq. Emmanuel 18 de Septiembre', 2000.00::numeric, 'Arq. Emmanuel', date '2026-09-18'),
  ('AGUA POTABLE EL CRISTO', 'Caja chica (Emmanuel) para pagar 2do Viaje de Arena', 1000.00::numeric, 'Carga inicial', date '2026-09-19'),
  ('AGUA POTABLE EL CRISTO', 'Caja chica (Emmanuel) 3er viaje de arena21 de Septiembre', 3000.00::numeric, 'Carga inicial', date '2026-09-21'),
  ('AGUA POTABLE EL CRISTO', 'Compra de materiales PARA REGISTRO DE valvula y gasolina javier', 500.00::numeric, 'Carga inicial', date '2026-09-23'),
  ('AGUA POTABLE EL CRISTO', 'Caja Chica Arq. Emmanuel', 1000.00::numeric, 'Arq. Emmanuel', date '2026-09-24'),
  ('OBRAS TOTOLAC', 'Caja Chica Arq. Santiago bacheo en totolac', 2800.00::numeric, 'Arq. Santiago', date '2026-08-19'),
  ('OBRAS TOTOLAC', 'Compra de refrescos y botella para Inauguración, Totolac', 732.00::numeric, 'Carga inicial', date '2026-11-05'),
  ('OBRAS TOTOLAC', 'CAJA CHICA (ADM ARQ. SANTIAGO HOY 12/11/26)', 10050.00::numeric, 'Carga inicial', date '2026-11-12')
) as v(obra, concepto, monto, encargado, fecha)
join obras_carga o on o.obra = v.obra;

-- ---- Gastos de Maquinaria (21) ----
-- La pantalla agrupa por equipo y necesita un renglon de alta ('config') para
-- que el equipo aparezca en la lista. El Excel no dice que maquina fue en
-- cada caso, asi que se da de alta una sola, "Maquinaria (carga del Excel)",
-- y ahi cuelgan todos los movimientos. Cuando sepan cual fue cada una, se
-- reasignan desde la app.
insert into public.gastos_maquinaria (project_id, equipo, concepto, categoria, tipo_renta, costo_tarifa, monto, is_active, fecha)
select o.project_id, 'Maquinaria (carga del Excel)', 'Alta de equipo', 'config', 'dia', 0, 0, true, now()
from obras_carga o
where o.obra in (
  'AMPLIACION C2',
  'DRENAJE PAPALOTLA',
  'OBRA 2 DE PAPALOTLA',
  'AGUA POTABLE EL CRISTO',
  'OBRAS TOTOLAC'
);

insert into public.gastos_maquinaria (project_id, equipo, concepto, categoria, tipo_renta, costo_tarifa, asistencia_dias, monto, is_active, fecha)
select o.project_id, 'Maquinaria (carga del Excel)', v.concepto, 'uso', 'dia', v.monto, 1, v.monto, true, v.fecha
from (values
  ('AMPLIACION C2', 'Renta de Retro Excavadora y pago de Tabiques (Adminstracion Santiago) (Mixto: renta de retro y tabiques; no hay desglose, se dejó en Maquinaria)', 26000.00::numeric, date '2026-10-27'),
  ('AMPLIACION C2', '$3000 Pago de retroexcavador del dia de reparacion (Ing. Santiago) y $3600 Pago de Material (Arq. Gabriel) (Desglose según el motivo)', 3000.00::numeric, date '2026-11-04'),
  ('DRENAJE PAPALOTLA', 'PAGO A RETROEXCAVADORA 1 HR  POR INAGURACION DE OBRA', 800.00::numeric, date '2026-08-12'),
  ('DRENAJE PAPALOTLA', 'PAGO A RETROEXCAVADORA 2 HR ($8,000), 2 TONELADAS DE CEMENTO ($9200) (Desglose según el motivo)', 8000.00::numeric, date '2026-08-26'),
  ('DRENAJE PAPALOTLA', 'caja chica ($2,600) y dos días de retroexcavadora ($8,000) (Desglose según el motivo)', 8000.00::numeric, date '2026-08-28'),
  ('DRENAJE PAPALOTLA', 'Pago de último día de Retroexcavadora Obra drenaje Papalotla', 4000.00::numeric, date '2026-09-01'),
  ('DRENAJE PAPALOTLA', 'Pago de 2 millares de Tabique ($5000) y 2 hrs de Maquina ($1900) (Desglose según el motivo)', 1900.00::numeric, date '2026-09-03'),
  ('DRENAJE PAPALOTLA', 'Pago de Retroexcavadora para hacer rampa en obra drenaje papalotla (4HRS X $900)', 3600.00::numeric, date '2026-09-08'),
  ('DRENAJE PAPALOTLA', 'RETRO para rellenar Zanjas en Drenaje Papalotla', 2000.00::numeric, date '2026-09-22'),
  ('DRENAJE PAPALOTLA', 'Compra de 2 rodamientos SKF  30305 C', 800.00::numeric, date '2026-09-23'),
  ('DRENAJE PAPALOTLA', 'PAGO PARA TERMUFIOSIONADO DE TUBOS Y GRUAS PARA COLOCACION DE ESTRUCTURA (Mixto: termofusionado de tubos y grúas; se dejó en Maquinaria)', 40210.00::numeric, date '2026-09-24'),
  ('DRENAJE PAPALOTLA', 'Mecanizado y compra de ColdRoller', 1250.00::numeric, date '2026-09-24'),
  ('DRENAJE PAPALOTLA', 'REPARACION DE CAMIONETA (AFINACION Y CAMBIO DE FRENOS)', 3550.00::numeric, date '2026-11-04'),
  ('DRENAJE PAPALOTLA', 'Acarreos de material ( mantenimiento a unidad )', 1000.00::numeric, date '2026-11-08'),
  ('OBRA 2 DE PAPALOTLA', 'Renta de Retroexcavadora para inaguración y Despalmar calle', 4000.00::numeric, date '2026-10-24'),
  ('AGUA POTABLE EL CRISTO', 'Pago del 30% de Renta de Retroexcavadora Arq. Adriana', 7000.00::numeric, date '2026-09-17'),
  ('AGUA POTABLE EL CRISTO', 'Liquidacion del 70% de Renta de Retroexcavadora Arq. Adriana', 16000.00::numeric, date '2026-09-26'),
  ('OBRAS TOTOLAC', 'Pago de Hra Renta de Retroexcavadora para Inauguración de Obra en Totolac', 800.00::numeric, date '2026-11-05'),
  ('OBRAS TOTOLAC', 'Renta de día de retroexcavadora y pago de 4 viajes de escombro en TOTOLAC', 7000.00::numeric, date '2026-11-09'),
  ('OBRAS TOTOLAC', 'CAJA CHICA ARQ. SANTIAGO PAGO DE RETRO Y CAMIONES DE VIAJE DE ESCOMBRO -10 DE NOVIEMBRE 2026', 9000.00::numeric, date '2026-11-10'),
  ('OBRAS TOTOLAC', '$7500 de RENTA DE RETRO Y PAGO DE VIAJES EN TOTOLAC (ADMINISTRACION ARQ SANTIAGO) + comision oxxo ($7,500 renta de retro y viajes + $84 comisión Oxxo)', 7584.00::numeric, date '2026-11-11')
) as v(obra, concepto, monto, fecha)
join obras_carga o on o.obra = v.obra;

-- ---- Gastos Generales, Materiales y Apoyos sociales (52) ----
-- La app no tiene tipo para Materiales ni para Apoyos sociales, asi que van
-- aqui con su categoria: material y burocrata. Todos como pagados: son
-- salidas que ya ocurrieron.
insert into public.gastos_generales (project_id, concepto, monto, categoria, estado_pago, monto_pagado, cantidad, precio_unitario, fecha, is_active)
select o.project_id, v.concepto, v.monto, v.categoria, 'pagado', v.monto, 1, v.monto, v.fecha, true
from (values
  ('AMPLIACION C2', 'Compra de 1 viaje de grava y viaje de escombro (Administracion Javier)', 4000.00::numeric, 'material', date '2026-10-22'),
  ('AMPLIACION C2', 'Compra de 10 Varillas de 1/2''''', 2500.00::numeric, 'material', date '2026-10-31'),
  ('AMPLIACION C2', '$3000 Pago de retroexcavador del dia de reparacion (Ing. Santiago) y $3600 Pago de Material (Arq. Gabriel) (Desglose según el motivo)', 3600.00::numeric, 'material', date '2026-11-04'),
  ('AMPLIACION C2', 'Lote 1 y 2 de material eléctrico (tubería conduit galvanizado y ppr) Javier Domingo', 29000.00::numeric, 'material', date '2026-11-06'),
  ('AMPLIACION C2', 'compra de 4 millares de tabique', 10000.00::numeric, 'material', date '2026-11-09'),
  ('AMPLIACION C2', 'Pago de bases al municipio de San Pablo del Monte, Tlaxcala', 10557.00::numeric, 'burocrata', date '2026-10-13'),
  ('AMPLIACION C2', 'Apoyo Social Presidenta de SPM Conta. Gumaro', 10000.00::numeric, 'burocrata', date '2026-09-17'),
  ('AMPLIACION C2', 'Apoyo Social Hermano de Presi SPM (Administracion Conta Bulmaro)', 15000.00::numeric, 'burocrata', date '2026-10-29'),
  ('DRENAJE PAPALOTLA', 'Pago de Tubería Milo', 56000.00::numeric, 'material', date '2026-08-25'),
  ('DRENAJE PAPALOTLA', 'Compra de 2 Millares de Tabique para pozos de visita', 5000.00::numeric, 'material', date '2026-08-25'),
  ('DRENAJE PAPALOTLA', 'PAGO A RETROEXCAVADORA 2 HR ($8,000), 2 TONELADAS DE CEMENTO ($9200) (Desglose según el motivo)', 9200.00::numeric, 'material', date '2026-08-26'),
  ('DRENAJE PAPALOTLA', '2 viajes de grava 1340 y 1/2 de Grava 1340', 4920.00::numeric, 'material', date '2026-08-29'),
  ('DRENAJE PAPALOTLA', '8 Varillas de 3/8', 1120.00::numeric, 'material', date '2026-08-31'),
  ('DRENAJE PAPALOTLA', 'COMPRA DE 27 VARILLAS DE 5/8 Y 3 VARILLAS DE 1/2', 10938.00::numeric, 'material', date '2026-09-01'),
  ('DRENAJE PAPALOTLA', 'Pago de 2 millares de Tabique ($5000) y 2 hrs de Maquina ($1900) (Desglose según el motivo)', 5000.00::numeric, 'material', date '2026-09-03'),
  ('DRENAJE PAPALOTLA', 'Compra de camión de 6 m3 de Tepetate para mejoramiento de suelo', 1100.00::numeric, 'material', date '2026-09-03'),
  ('DRENAJE PAPALOTLA', 'MADERA (25 POLINES 1.5 M ) ($2,500) , 3 VARILLAS DE 3/8 Y 3 DE 5/8 ($1,567) Y CAJA CHICA (04 / 09 / 2026) ($2,500) (Desglose según el motivo)', 4067.00::numeric, 'material', date '2026-09-04'),
  ('DRENAJE PAPALOTLA', 'Perfiles Estructura  (Aceros Geovany) 2026', 45207.44::numeric, 'material', date '2026-09-04'),
  ('DRENAJE PAPALOTLA', 'Varilla y Cemento para zapatas', 7000.00::numeric, 'material', date '2026-09-07'),
  ('DRENAJE PAPALOTLA', 'Compra de pintura y primer para estructura ($8200) y caja chica ($1000) (Desglose según el motivo)', 8200.00::numeric, 'material', date '2026-09-11'),
  ('DRENAJE PAPALOTLA', 'Pago acero', 3892.00::numeric, 'material', date '2026-09-11'),
  ('DRENAJE PAPALOTLA', 'Compra de Redondos de 3/4 de Pulgadas Gr. 55 para Anclas de Estructura', 1502.00::numeric, 'material', date '2026-09-14'),
  ('DRENAJE PAPALOTLA', 'Pago de Placas, Retro y Cuerdas de Anclas (Mixto: placas, retro y cuerdas de anclas; no hay desglose, se dejó en Materiales)', 7000.00::numeric, 'material', date '2026-09-17'),
  ('DRENAJE PAPALOTLA', 'Pago de soleras a Geovany', 1889.00::numeric, 'material', date '2026-09-17'),
  ('DRENAJE PAPALOTLA', 'Caja Chica Arq. Santiago ($3,000) y $3500 para pintura (Desglose según el motivo)', 3500.00::numeric, 'material', date '2026-09-18'),
  ('DRENAJE PAPALOTLA', 'Hule para tapar Zapatas', 160.00::numeric, 'material', date '2026-09-18'),
  ('DRENAJE PAPALOTLA', 'PAGO DE CONCRETO', 22360.00::numeric, 'material', date '2026-09-19'),
  ('DRENAJE PAPALOTLA', 'COMPRA DE CEMENTO para Últimos trabajos de Albañileria (Arq. Santiago)', 5500.00::numeric, 'material', date '2026-09-21'),
  ('DRENAJE PAPALOTLA', 'Suministro de Tubo RD Liso para cruce de drenaje', 33100.00::numeric, 'material', date '2026-09-23'),
  ('DRENAJE PAPALOTLA', 'Compra de Tubo Ced 40', 800.00::numeric, 'material', date '2026-09-24'),
  ('DRENAJE PAPALOTLA', 'COMPRAS QUE SE HICIERON EN OBRA DE DRENAJE PAPALOTLA PARA HACER MURO Y RELLENO (ADMNISTRACION, ARQ. SANTIAGO)', 5332.00::numeric, 'material', date '2026-10-19'),
  ('DRENAJE PAPALOTLA', 'Anticipo Tapas de concreto (Artemio) 5 de Noviembre', 4000.00::numeric, 'material', date '2026-11-05'),
  ('DRENAJE PAPALOTLA', 'Pago de PADRON DE CONTRATISTAS PAPALOTLA DE XICOHTENCATL', 1500.00::numeric, 'burocrata', date '2026-07-28'),
  ('DRENAJE PAPALOTLA', 'Pago de PADRON DE CONTRATISTAS PAPALOTLA DE XICOHTENCATL JAVIER DOMINGO', 1500.00::numeric, 'burocrata', date '2026-08-06'),
  ('DRENAJE PAPALOTLA', 'Topografía y Proyecto', 4000.00::numeric, 'asesoria', date '2026-08-12'),
  ('DRENAJE PAPALOTLA', 'Pago Finiquito a Ing. Topografo', 2000.00::numeric, 'asesoria', date '2026-08-14'),
  ('DRENAJE PAPALOTLA', 'Pago a Ing. de Mecanica de Suelos', 6000.00::numeric, 'asesoria', date '2026-08-18'),
  ('DRENAJE PAPALOTLA', 'Pago a Ing. ESTRUCTURISTA', 5000.00::numeric, 'asesoria', date '2026-08-18'),
  ('DRENAJE PAPALOTLA', 'Pago finiquito a Ing. Andrés de Mecanica de Suelos', 5500.00::numeric, 'asesoria', date '2026-08-27'),
  ('DRENAJE PAPALOTLA', 'APOYO SOCIAL PRESIDENTE DE PAPALOTLA', 68505.00::numeric, 'burocrata', date '2026-09-01'),
  ('DRENAJE PAPALOTLA', 'Apoyo a Lic. Karla por la reparacion de su Laptop (Apoyo a persona para reparar su laptop)', 3500.00::numeric, 'burocrata', date '2026-09-22'),
  ('DRENAJE PAPALOTLA', 'Utilidad adelantada del porcentaje (Cont. Gumaro)', 25000.00::numeric, 'burocrata', date '2026-11-09'),
  ('OBRA 2 DE PAPALOTLA', 'Anticipo Topografía (Obra 2) Ing Francisco', 4000.00::numeric, 'asesoria', date '2026-10-12'),
  ('OBRA 2 DE PAPALOTLA', 'Apoyo social anticipo Presidente de Papalotla', 10000.00::numeric, 'burocrata', date '2026-09-22'),
  ('AGUA POTABLE EL CRISTO', 'SE NECESITA PARA MATERIAL ALAMBRE, CEMENTO, GRAVA, COLADO', 3000.00::numeric, 'material', date '2026-09-25'),
  ('AGUA POTABLE EL CRISTO', 'Deposito a Juan Facturas', 336.00::numeric, 'administrativo', date '2026-09-18'),
  ('AGUA POTABLE EL CRISTO', 'Apoyo social Presidenta del Cristo', 20000.00::numeric, 'burocrata', date '2026-09-16'),
  ('AGUA POTABLE EL CRISTO', 'Apoyo social Presidenta del Cristo', 10000.00::numeric, 'burocrata', date '2026-10-31'),
  ('OBRAS TOTOLAC', 'Apoyo Social Presi Benjamin,  Totolac', 150000.00::numeric, 'burocrata', date '2026-08-20'),
  ('PROYECTO EJECUTIVO TEPEYANCO', 'PAGO TOPOGRAFÍA PROYECTO ALBERCA SEMIOLIMPICA TEPEYANCO (ING FRANCISCO)', 3600.00::numeric, 'asesoria', date '2026-09-02'),
  ('PROYECTO EJECUTIVO TEPEYANCO', 'ANTICIPO ING. ANDRES Mecanica de Suelos PROY EJECUTIVO TEPEYANCO', 6500.00::numeric, 'asesoria', date '2026-09-04'),
  ('PROYECTO EJECUTIVO TEPEYANCO', 'Finiquito Mecánica de Suelos Ing. Andres', 7000.00::numeric, 'asesoria', date '2026-09-16')
) as v(obra, concepto, monto, categoria, fecha)
join obras_carga o on o.obra = v.obra;

commit;

-- ============ 3. Como quedo ============
select p.name as obra, 'Destajos' as modulo, count(*) as renglones, sum(i.quantity * i.unit_price) as importe
  from public.inventory i join public.projects p on p.id = i.project_id
 where i.requested_by = 'Carga inicial' group by p.name
union all
select p.name, 'Caja chica', count(*), sum(c.monto)
  from public.caja_chica c join public.projects p on p.id = c.project_id
 where c.numero_nota = 'S/N' group by p.name
union all
select p.name, 'Maquinaria', count(*), sum(g.monto)
  from public.gastos_maquinaria g join public.projects p on p.id = g.project_id
 where g.equipo = 'Maquinaria (carga del Excel)' and g.categoria = 'uso' group by p.name
union all
select p.name, 'Generales', count(*), sum(g.monto)
  from public.gastos_generales g join public.projects p on p.id = g.project_id
 where g.estado_pago = 'pagado' group by p.name
order by obra, modulo;
