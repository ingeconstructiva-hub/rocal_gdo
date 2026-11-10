-- Gastos de obra capturados en el Excel "GASTOS DE OBRA.xlsx".
--
-- Una hoja por obra. Lo que va aqui es tal cual lo que trae el archivo:
-- fecha, importe y motivo. Todos entran como PAGADOS, porque son salidas que
-- ya ocurrieron: el archivo lleva la cuenta de lo gastado, no de lo que se
-- debe.
--
-- QUE REVISAR ANTES DE CORRER ESTO
--
-- 1. El mapa de abajo dice a que obra de la base va cada hoja. Los nombres
--    de la derecha tienen que existir en public.projects. Si alguno no
--    existe, esa hoja NO se inserta y sale en el aviso del final: ahi es
--    donde hay que decidir a que obra va.
-- 2. La categoria (material / administrativo / burocrata / asesoria) es una
--    apuesta leyendo el motivo. Esta escrita renglon por renglon para poder
--    corregir la que no cuadre.
--
-- Para ver que obras hay, antes de correrlo:
--     select id, name from public.projects where is_active order by name;

-- La hoja del Excel y la obra de la base a la que corresponde. Si una obra
-- se llama distinto en la base, se cambia AQUI y nada mas aqui.
with mapa (hoja, obra) as (values
  ('AMPLIACION C2', 'AMPLIACION C2'),
  ('DRENAJE PAPALOTLA', 'DRENAJE PAPALOTLA'),
  ('OBRA 2 PAPALOTLA', 'OBRA 2 PAPALOTLA'),
  ('AGUA POTABLE EL CRISTO', 'AGUA POTABLE EL CRISTO'),
  ('OBRAS TOTOLAC', 'OBRAS TOTOLAC'),
  ('POZOS PAPALOTLA', 'POZOS PAPALOTLA'),
  ('PROY TEPEYANCO', 'PROY TEPEYANCO')
),
obras as (
  select m.hoja, p.id as project_id
  from mapa m
  join public.projects p on upper(trim(p.name)) = upper(trim(m.obra))
),
gastos (hoja, fecha, monto, categoria, concepto) as (values
  ('AMPLIACION C2', date '2026-08-20', 400.00::numeric, 'burocrata', 'Invitacion de Tequila Hornito a Obras Publicas, Contador Bulmaro, Innaguracion de Obra San Pablo del Monte'),
  ('AMPLIACION C2', date '2026-08-21', 750.00::numeric, 'administrativo', 'LONA DE INICIO DE OBRA SPM AMPLIACION C2'),
  ('AMPLIACION C2', date '2026-09-17', 10000.00::numeric, 'burocrata', 'Apoyo Social Presidenta de SPM Conta. Gumaro'),
  ('AMPLIACION C2', date '2026-10-12', 1500.00::numeric, 'administrativo', 'Caja chica Arq. Gabriel Fecha: 12/10/2026'),
  ('AMPLIACION C2', date '2026-10-13', 10557.00::numeric, 'burocrata', 'Pago de bases al municipio de San Pablo del Monte, Tlaxcala'),
  ('AMPLIACION C2', date '2026-10-13', 200.00::numeric, 'burocrata', 'Compra de refrescos y galletas para entrega de concurso de la Ampliacion C2 SPM'),
  ('AMPLIACION C2', date '2026-10-13', 3000.00::numeric, 'administrativo', 'Caja chica Arq. Gabriel Fecha: 13/10/2026'),
  ('AMPLIACION C2', date '2026-10-14', 3000.00::numeric, 'administrativo', 'Caja chica Arq. Gabriel Fecha: 14/10/2026'),
  ('AMPLIACION C2', date '2026-10-16', 7000.00::numeric, 'material', 'Caja Chica Arq. Gabriel, compra de Cementos y Cal'),
  ('AMPLIACION C2', date '2026-10-16', 2000.00::numeric, 'administrativo', 'Caja Chica Arq. Gabriel, 17/10/2026'),
  ('AMPLIACION C2', date '2026-10-17', 2000.00::numeric, 'administrativo', 'Caja Chica Arq. Gabriel, 17/10/2026'),
  ('AMPLIACION C2', date '2026-10-20', 380.00::numeric, 'administrativo', 'CAJA CHICA ARQ. GABRIEL'),
  ('AMPLIACION C2', date '2026-10-22', 4000.00::numeric, 'material', 'Compra de 1 viaje de grava y viaje de escombro (Administracion Javier)'),
  ('AMPLIACION C2', date '2026-10-22', 2890.00::numeric, 'administrativo', 'CAJA CHICA ARQ. GABRIEL (Administracion GABRIEL)'),
  ('AMPLIACION C2', date '2026-10-22', 595.00::numeric, 'burocrata', 'Invitamos a comer a los de Obras Publicas el conta gumaro'),
  ('AMPLIACION C2', date '2026-10-24', 19883.33::numeric, 'administrativo', 'Destajo MO, Corte 17 de octubre (Mtr Cristian Y Mtro Javier)'),
  ('AMPLIACION C2', date '2026-10-24', 3000.00::numeric, 'administrativo', 'Caja Chica Arq. gabriel 24 de Octubre 2026'),
  ('AMPLIACION C2', date '2026-10-27', 6500.00::numeric, 'material', 'Caja Chica Ampliacion C2 Compra de material y otras cosas (Administracion Gabriel)'),
  ('AMPLIACION C2', date '2026-10-27', 26000.00::numeric, 'material', 'Renta de Retro Excavadora y pago de Tabiques (Adminstracion Santiago)'),
  ('AMPLIACION C2', date '2026-10-27', 2000.00::numeric, 'administrativo', 'Caja Chica (Administracion Gabriel)'),
  ('AMPLIACION C2', date '2026-10-28', 2000.00::numeric, 'administrativo', 'Caja Chica (Administracion Gabriel)'),
  ('AMPLIACION C2', date '2026-10-29', 15000.00::numeric, 'burocrata', 'Apoyo Social Hermano de Presi SPM (Administracion Conta Bulmaro)'),
  ('AMPLIACION C2', date '2026-10-29', 2000.00::numeric, 'administrativo', 'Caja Chica (Administracion Gabriel - Emmanuel)'),
  ('AMPLIACION C2', date '2026-10-29', 2000.00::numeric, 'administrativo', 'Caja Chica (Administracion Gabriel - Emmanuel)'),
  ('AMPLIACION C2', date '2026-10-30', 2000.00::numeric, 'administrativo', 'Caja Chica, compra de pico y otras cosas (Administracion Gabriel)'),
  ('AMPLIACION C2', date '2026-10-31', 2500.00::numeric, 'material', 'Compra de 10 Varillas de 1/2'''''),
  ('AMPLIACION C2', date '2026-10-31', 5800.00::numeric, 'administrativo', 'NOMINA MANO DE OBRA  CRISTIAN Y SUS TRABAJADORES (ADM SANTIAGO)'),
  ('AMPLIACION C2', date '2026-10-31', 20200.00::numeric, 'administrativo', 'DESTAJOS DEL 24 AL 31 DE OCT, 2026 MANO DE OBRA (ADM GABRIEL)'),
  ('AMPLIACION C2', date '2026-11-04', 6600.00::numeric, 'material', '$3000 Pago de retroexcavador del dia de reparacion (Ing. Santiago) y $3600 Pago de Material (Arq. Gabriel)'),
  ('AMPLIACION C2', date '2026-11-04', 1000.00::numeric, 'material', 'Compra de discos para guillotina ($400) y $600 Caja chica (Arq. Gabriel)'),
  ('AMPLIACION C2', date '2026-11-05', 1000.00::numeric, 'administrativo', 'Caja chica Arq. Gabriel Ampliacion C2'),
  ('AMPLIACION C2', date '2026-11-06', 29000.00::numeric, 'material', 'Lote 1 y 2 de material eléctrico (tubería conduit galvanizado y ppr) Javier Domingo'),
  ('AMPLIACION C2', date '2026-11-07', 3866.00::numeric, 'administrativo', 'NOMINA CRISTIAN Y SUS TRABAJADORES DEL 02 DE NOVIEMBRE AL 07 DE NOVIEMBRE (ADM SANTIAGO)'),
  ('AMPLIACION C2', date '2026-11-07', 16750.00::numeric, 'administrativo', 'DESTAJOS DEL 02 DE NOVIEMBRE AL 07 DE NOVIEMBRE 2026 MANO DE OBRA (ADM GABRIEL)'),
  ('AMPLIACION C2', date '2026-11-09', 10000.00::numeric, 'material', 'compra de 4 millares de tabique'),
  ('AMPLIACION C2', date '2026-11-10', 3000.00::numeric, 'administrativo', 'CAJA CHICA ARQ. GABRIEL 10 DE NOVIEMBRE 2026'),
  ('DRENAJE PAPALOTLA', date '2026-07-28', 1500.00::numeric, 'burocrata', 'Pago de PADRON DE CONTRATISTAS PAPALOTLA DE XICOHTENCATL'),
  ('DRENAJE PAPALOTLA', date '2026-08-06', 1500.00::numeric, 'burocrata', 'Pago de PADRON DE CONTRATISTAS PAPALOTLA DE XICOHTENCATL JAVIER DOMINGO'),
  ('DRENAJE PAPALOTLA', date '2026-08-12', 4000.00::numeric, 'asesoria', 'Topografía y Proyecto'),
  ('DRENAJE PAPALOTLA', date '2026-08-12', 550.00::numeric, 'administrativo', 'Pago día de oficial Albañil para desyerbe de Arboles y apoyo en Inaguracion de obra'),
  ('DRENAJE PAPALOTLA', date '2026-08-12', 483.00::numeric, 'administrativo', 'Pago día de Ayudante Albañil para desyerbe de Arboles y apoyo en Inaguracion de obra'),
  ('DRENAJE PAPALOTLA', date '2026-08-12', 800.00::numeric, 'administrativo', 'PAGO A RETROEXCAVADORA 1 HR  POR INAGURACION DE OBRA'),
  ('DRENAJE PAPALOTLA', date '2026-08-12', 400.00::numeric, 'burocrata', 'ACOMPLETAR DINERO PARA BOTELLAS Y REFRESCOS EN INAGURACION DE OBRA (EL CONTA BULMARO ME DIO $500 SE ACOMPLETO $900)'),
  ('DRENAJE PAPALOTLA', date '2026-08-13', 200.00::numeric, 'administrativo', 'Gasolina Coche Gris para ir a inaguracion de obra papalotla'),
  ('DRENAJE PAPALOTLA', date '2026-08-14', 2000.00::numeric, 'asesoria', 'Pago Finiquito a Ing. Topografo'),
  ('DRENAJE PAPALOTLA', date '2026-08-18', 6000.00::numeric, 'asesoria', 'Pago a Ing. de Mecanica de Suelos'),
  ('DRENAJE PAPALOTLA', date '2026-08-18', 5000.00::numeric, 'asesoria', 'Pago a Ing. ESTRUCTURISTA'),
  ('DRENAJE PAPALOTLA', date '2026-08-25', 56000.00::numeric, 'material', 'Pago de Tubería Milo'),
  ('DRENAJE PAPALOTLA', date '2026-08-25', 5000.00::numeric, 'material', 'Compra de 2 Millares de Tabique para pozos de visita'),
  ('DRENAJE PAPALOTLA', date '2026-08-25', 3000.00::numeric, 'administrativo', 'Caja Chica Arq. Santiago 25 de Agosto 2025'),
  ('DRENAJE PAPALOTLA', date '2026-08-26', 17200.00::numeric, 'material', 'PAGO A RETROEXCAVADORA 2 HR ($8,000), 2 TONELADAS DE CEMENTO ($9200)'),
  ('DRENAJE PAPALOTLA', date '2026-08-27', 5500.00::numeric, 'asesoria', 'Pago finiquito a Ing. Andrés de Mecanica de Suelos'),
  ('DRENAJE PAPALOTLA', date '2026-08-28', 10600.00::numeric, 'administrativo', 'caja chica ($2,600) y dos días de retroexcavadora ($8,000)'),
  ('DRENAJE PAPALOTLA', date '2026-08-29', 4920.00::numeric, 'material', '2 viajes de grava 1340 y 1/2 de Grava 1340'),
  ('DRENAJE PAPALOTLA', date '2026-08-29', 15137.00::numeric, 'administrativo', 'Destajo MO, Corte 29 de Agosto (Mtr Marco)'),
  ('DRENAJE PAPALOTLA', date '2026-08-31', 1120.00::numeric, 'material', '8 Varillas de 3/8'),
  ('DRENAJE PAPALOTLA', date '2026-09-01', 68505.00::numeric, 'burocrata', 'APOYO SOCIAL PRESIDENTE DE PAPALOTLA'),
  ('DRENAJE PAPALOTLA', date '2026-09-01', 300.00::numeric, 'burocrata', 'Gasolina de Coche Gris para ir a dejar apoyo social a presidente'),
  ('DRENAJE PAPALOTLA', date '2026-09-01', 4000.00::numeric, 'administrativo', 'Pago de último día de Retroexcavadora Obra drenaje Papalotla'),
  ('DRENAJE PAPALOTLA', date '2026-09-01', 1000.00::numeric, 'administrativo', 'Caja Chica Arq. santiago 30 DE AGOSTO'),
  ('DRENAJE PAPALOTLA', date '2026-09-01', 3000.00::numeric, 'administrativo', 'Caja Chica Arq. Santiago 1 de Septiembre'),
  ('DRENAJE PAPALOTLA', date '2026-09-01', 10938.00::numeric, 'material', 'COMPRA DE 27 VARILLAS DE 5/8 Y 3 VARILLAS DE 1/2'),
  ('DRENAJE PAPALOTLA', date '2026-09-02', 5000.00::numeric, 'administrativo', 'ANTICIPO DESTAJOS (PAILERIA MTR MAXIMINO)'),
  ('DRENAJE PAPALOTLA', date '2026-09-03', 6900.00::numeric, 'material', 'Pago de 2 millares de Tabique ($5000) y 2 hrs de Maquina ($1900)'),
  ('DRENAJE PAPALOTLA', date '2026-09-03', 1100.00::numeric, 'material', 'Compra de camión de 6 m3 de Tepetate para mejoramiento de suelo'),
  ('DRENAJE PAPALOTLA', date '2026-09-04', 6567.00::numeric, 'material', 'MADERA (25 POLINES 1.5 M ) ($2,500) , 3 VARILLAS DE 3/8 Y 3 DE 5/8 ($1,567) Y CAJA CHICA (04 / 09 / 2026) ($2,500)'),
  ('DRENAJE PAPALOTLA', date '2026-09-04', 45207.44::numeric, 'material', 'Perfiles Estructura  (Aceros Geovany) 2026'),
  ('DRENAJE PAPALOTLA', date '2026-09-05', 13100.00::numeric, 'administrativo', '*Destajo MO, Corte 31 de Agosto al 05 de Septiembre (Mtr Marco)'),
  ('DRENAJE PAPALOTLA', date '2026-09-05', 9000.00::numeric, 'administrativo', 'Destajo MO, Corte 31 de Agosto al 05 de Septiembre (Mtr Maximino, Pailería)'),
  ('DRENAJE PAPALOTLA', date '2026-09-07', 7000.00::numeric, 'material', 'Varilla y Cemento para zapatas'),
  ('DRENAJE PAPALOTLA', date '2026-09-07', 2000.00::numeric, 'material', 'Caja Chica (posible compra de pintura para estructura)'),
  ('DRENAJE PAPALOTLA', date '2026-09-08', 3600.00::numeric, 'administrativo', 'Pago de Retroexcavadora para hacer rampa en obra drenaje papalotla (4HRS X $900)'),
  ('DRENAJE PAPALOTLA', date '2026-09-11', 9200.00::numeric, 'material', 'Compra de pintura y primer para estructura ($8200) y caja chica ($1000)'),
  ('DRENAJE PAPALOTLA', date '2026-09-11', 3892.00::numeric, 'material', 'Pago acero'),
  ('DRENAJE PAPALOTLA', date '2026-09-12', 20000.00::numeric, 'administrativo', 'Destajo MO, Corte 7 al 12 de Septiembre (Mtr Maximino, Pailería)'),
  ('DRENAJE PAPALOTLA', date '2026-09-12', 19050.00::numeric, 'administrativo', 'Destajo MO, Corte 12 de Septiembre (Mtr Angel)'),
  ('DRENAJE PAPALOTLA', date '2026-09-14', 2500.00::numeric, 'administrativo', 'Caja Chica Arq. Santiago'),
  ('DRENAJE PAPALOTLA', date '2026-09-14', 1502.00::numeric, 'material', 'Compra de Redondos de 3/4 de Pulgadas Gr. 55 para Anclas de Estructura'),
  ('DRENAJE PAPALOTLA', date '2026-09-16', 3000.00::numeric, 'administrativo', 'Caja Chica Arq. Santiago 16 Septiembre'),
  ('DRENAJE PAPALOTLA', date '2026-09-17', 7000.00::numeric, 'material', 'Pago de Placas, Retro y Cuerdas de Anclas'),
  ('DRENAJE PAPALOTLA', date '2026-09-17', 1889.00::numeric, 'material', 'Pago de soleras a Geovany'),
  ('DRENAJE PAPALOTLA', date '2026-09-18', 6500.00::numeric, 'material', 'Caja Chica Arq. Santiago ($3,000) y $3500 para pintura'),
  ('DRENAJE PAPALOTLA', date '2026-09-18', 160.00::numeric, 'material', 'Hule para tapar Zapatas'),
  ('DRENAJE PAPALOTLA', date '2026-09-19', 14833.33::numeric, 'administrativo', 'Destajo MO, Corte 19 de Septiembre (Mtr Angel)'),
  ('DRENAJE PAPALOTLA', date '2026-09-19', 16000.00::numeric, 'administrativo', 'Destajo MO, Corte 14 al 19 de Septiembre (Mtr Maximino, Pailería)'),
  ('DRENAJE PAPALOTLA', date '2026-09-19', 1000.00::numeric, 'administrativo', 'Caja Chica para pagar Retroexcavadora por 3ra Vuelta'),
  ('DRENAJE PAPALOTLA', date '2026-09-19', 22360.00::numeric, 'material', 'PAGO DE CONCRETO'),
  ('DRENAJE PAPALOTLA', date '2026-09-21', 5500.00::numeric, 'material', 'COMPRA DE CEMENTO para Últimos trabajos de Albañileria (Arq. Santiago)'),
  ('DRENAJE PAPALOTLA', date '2026-09-22', 2000.00::numeric, 'administrativo', 'RETRO para rellenar Zanjas en Drenaje Papalotla'),
  ('DRENAJE PAPALOTLA', date '2026-09-22', 3500.00::numeric, 'administrativo', 'Apoyo a Lic. Karla por la reparacion de su Laptop'),
  ('DRENAJE PAPALOTLA', date '2026-09-23', 800.00::numeric, 'material', 'Compra de 2 rodamientos SKF  30305 C'),
  ('DRENAJE PAPALOTLA', date '2026-09-23', 33100.00::numeric, 'material', 'Suministro de Tubo RD Liso para cruce de drenaje'),
  ('DRENAJE PAPALOTLA', date '2026-09-24', 40210.00::numeric, 'material', 'PAGO PARA TERMUFIOSIONADO DE TUBOS Y GRUAS PARA COLOCACION DE ESTRUCTURA'),
  ('DRENAJE PAPALOTLA', date '2026-09-24', 1250.00::numeric, 'administrativo', 'Mecanizado y compra de ColdRoller'),
  ('DRENAJE PAPALOTLA', date '2026-09-24', 800.00::numeric, 'material', 'Compra de Tubo Ced 40'),
  ('DRENAJE PAPALOTLA', date '2026-09-26', 17266.66::numeric, 'administrativo', 'Destajo MO, Corte 26 de Septiembre (Mtr Cristian)'),
  ('DRENAJE PAPALOTLA', date '2026-09-26', 7481.00::numeric, 'administrativo', 'Destajo MO, Corte 21 al 26 de Septiembre (Mtr Maximino, Pailería)'),
  ('DRENAJE PAPALOTLA', date '2026-10-03', 17266.66::numeric, 'administrativo', 'Destajo MO, Corte 3 de octubre 2026 (Mtr Cristian)'),
  ('DRENAJE PAPALOTLA', date '2026-10-10', 3484.00::numeric, 'administrativo', 'Destajo MO, Corte 10 de octubre (Mtr Cristian)'),
  ('DRENAJE PAPALOTLA', date '2026-10-11', 500.00::numeric, 'administrativo', 'Gasolina a camioneta para ir a dejar bailarina con el conta gumaro y revisar deslave en papalotla'),
  ('DRENAJE PAPALOTLA', date '2026-10-17', 12400.00::numeric, 'administrativo', 'Destajo MO, Corte 17 de octubre (Mtr Cristian)'),
  ('DRENAJE PAPALOTLA', date '2026-10-17', 12400.00::numeric, 'administrativo', 'Destajo MO, Corte 17 de octubre (Mtr Cristian)'),
  ('DRENAJE PAPALOTLA', date '2026-10-19', 5332.00::numeric, 'administrativo', 'COMPRAS QUE SE HICIERON EN OBRA DE DRENAJE PAPALOTLA PARA HACER MURO Y RELLENO (ADMNISTRACION, ARQ. SANTIAGO)'),
  ('DRENAJE PAPALOTLA', date '2026-11-04', 3550.00::numeric, 'administrativo', 'REPARACION DE CAMIONETA (AFINACION Y CAMBIO DE FRENOS)'),
  ('DRENAJE PAPALOTLA', date '2026-11-05', 4000.00::numeric, 'material', 'Anticipo Tapas de concreto (Artemio) 5 de Noviembre'),
  ('DRENAJE PAPALOTLA', date '2026-11-08', 1000.00::numeric, 'material', 'Acarreos de material ( mantenimiento a unidad )'),
  ('DRENAJE PAPALOTLA', date '2026-11-09', 1000.00::numeric, 'burocrata', 'Viáticos (estimaciones con obras publicas)'),
  ('DRENAJE PAPALOTLA', date '2026-11-09', 25000.00::numeric, 'administrativo', 'Utilidad adelantada del porcentaje (Cont. Gumaro)'),
  ('OBRA 2 PAPALOTLA', date '2026-09-22', 10000.00::numeric, 'burocrata', 'Apoyo social anticipo Presidente de Papalotla'),
  ('OBRA 2 PAPALOTLA', date '2026-09-22', 500.00::numeric, 'administrativo', 'Comida con Contador Gumaro y Supervisor, asi como con Arquis durante el recorrido de obra'),
  ('OBRA 2 PAPALOTLA', date '2026-10-12', 4000.00::numeric, 'asesoria', 'Anticipo Topografía (Obra 2) Ing Francisco'),
  ('OBRA 2 PAPALOTLA', date '2026-10-24', 4000.00::numeric, 'administrativo', 'Renta de Retroexcavadora para inaguración y Despalmar calle'),
  ('AGUA POTABLE EL CRISTO', date '2026-09-16', 20000.00::numeric, 'burocrata', 'Apoyo social Presidenta del Cristo'),
  ('AGUA POTABLE EL CRISTO', date '2026-09-17', 1000.00::numeric, 'administrativo', 'Caja Chica Arq. Emmanuel'),
  ('AGUA POTABLE EL CRISTO', date '2026-09-17', 6000.00::numeric, 'administrativo', 'Pago anticipo a Arq. Álvaro'),
  ('AGUA POTABLE EL CRISTO', date '2026-09-17', 7000.00::numeric, 'administrativo', 'Pago del 30% de Renta de Retroexcavadora Arq. Adriana'),
  ('AGUA POTABLE EL CRISTO', date '2026-09-18', 2000.00::numeric, 'administrativo', 'Caja Chica Arq. Emmanuel 18 de Septiembre'),
  ('AGUA POTABLE EL CRISTO', date '2026-09-18', 336.00::numeric, 'administrativo', 'Deposito a Juan Facturas'),
  ('AGUA POTABLE EL CRISTO', date '2026-09-19', 1000.00::numeric, 'material', 'Caja chica (Emmanuel) para pagar 2do Viaje de Arena'),
  ('AGUA POTABLE EL CRISTO', date '2026-09-19', 3233.33::numeric, 'administrativo', 'Mano de Obra (Mtr Javier Domingo)'),
  ('AGUA POTABLE EL CRISTO', date '2026-09-21', 3000.00::numeric, 'material', 'Caja chica (Emmanuel) 3er viaje de arena21 de Septiembre'),
  ('AGUA POTABLE EL CRISTO', date '2026-09-23', 500.00::numeric, 'material', 'Compra de materiales PARA REGISTRO DE valvula y gasolina javier'),
  ('AGUA POTABLE EL CRISTO', date '2026-09-24', 1000.00::numeric, 'administrativo', 'Caja Chica Arq. Emmanuel'),
  ('AGUA POTABLE EL CRISTO', date '2026-09-25', 3000.00::numeric, 'material', 'SE NECESITA PARA MATERIAL ALAMBRE, CEMENTO, GRAVA, COLADO'),
  ('AGUA POTABLE EL CRISTO', date '2026-09-26', 5666.67::numeric, 'administrativo', 'Mano de Obra (Mtr Javier Domingo) corte 26 de septiembre 2026'),
  ('AGUA POTABLE EL CRISTO', date '2026-09-26', 16000.00::numeric, 'administrativo', 'Liquidacion del 70% de Renta de Retroexcavadora Arq. Adriana'),
  ('AGUA POTABLE EL CRISTO', date '2026-10-31', 10000.00::numeric, 'burocrata', 'Apoyo social Presidenta del Cristo'),
  ('OBRAS TOTOLAC', date '2026-08-19', 2800.00::numeric, 'administrativo', 'Caja Chica Arq. Santiago bacheo en totolac'),
  ('OBRAS TOTOLAC', date '2026-08-20', 150000.00::numeric, 'burocrata', 'Apoyo Social Presi Benjamin,  Totolac'),
  ('OBRAS TOTOLAC', date '2026-11-05', 800.00::numeric, 'administrativo', 'Pago de Hra Renta de Retroexcavadora para Inauguración de Obra en Totolac'),
  ('OBRAS TOTOLAC', date '2026-11-05', 732.00::numeric, 'burocrata', 'Compra de refrescos y botella para Inauguración, Totolac'),
  ('OBRAS TOTOLAC', date '2026-11-09', 7000.00::numeric, 'material', 'Renta de día de retroexcavadora y pago de 4 viajes de escombro en TOTOLAC'),
  ('OBRAS TOTOLAC', date '2026-11-10', 9000.00::numeric, 'material', 'CAJA CHICA ARQ. SANTIAGO PAGO DE RETRO Y CAMIONES DE VIAJE DE ESCOMBRO -10 DE NOVIEMBRE 2026'),
  ('POZOS PAPALOTLA', date '2026-01-14', 97773.00::numeric, 'burocrata', '(10%) Apoyo Social a Presidente Municipal de Papalotla'),
  ('POZOS PAPALOTLA', date '2026-01-14', 20000.00::numeric, 'burocrata', '(2%) Apoyo Social a Dirección de Obras de Papalotla'),
  ('POZOS PAPALOTLA', date '2026-01-23', 7000.00::numeric, 'burocrata', 'Apoyo Social al Arq. Ángel Tello (supervisor del programa)'),
  ('PROY TEPEYANCO', date '2026-09-02', 3600.00::numeric, 'asesoria', 'PAGO TOPOGRAFÍA PROYECTO ALBERCA SEMIOLIMPICA TEPEYANCO (ING FRANCISCO)'),
  ('PROY TEPEYANCO', date '2026-09-04', 6500.00::numeric, 'asesoria', 'ANTICIPO ING. ANDRES Mecanica de Suelos PROY EJECUTIVO TEPEYANCO'),
  ('PROY TEPEYANCO', date '2026-09-16', 7000.00::numeric, 'asesoria', 'Finiquito Mecánica de Suelos Ing. Andres')
),
insertados as (
  insert into public.gastos_generales (
    project_id, concepto, monto, categoria, estado_pago, monto_pagado,
    cantidad, precio_unitario, fecha, is_active
  )
  select
    o.project_id,
    g.concepto,
    g.monto,
    g.categoria,
    'pagado',
    g.monto,
    1,
    g.monto,
    g.fecha,
    true
  from gastos g
  join obras o on o.hoja = g.hoja
  returning 1
)
-- Cuanto entro por hoja, y cuales se quedaron fuera por no encontrar su obra.
select
  g.hoja,
  count(*) filter (where o.project_id is not null) as insertados,
  count(*) filter (where o.project_id is null)     as sin_obra,
  sum(g.monto)                                     as importe
from gastos g
left join obras o on o.hoja = g.hoja
group by g.hoja
order by g.hoja;
