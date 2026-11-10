-- Destajos de prueba en la obra PRUEBAS, para ver el PDF nuevo.
--
-- Son los mismos cuatro destajistas del Excel que se usó de referencia, con
-- sus actividades, para que el papel salga con varios bloques y se pueda ver
-- como queda la banda de cada maestro, su TOTAL y el gran total.
--
-- Se une contra projects en vez de usar (select id ... limit 1): asi no falla
-- si el nombre trae espacios ni si existe mas de una obra llamada PRUEBAS.
-- Devuelve cuantos renglones inserto, para no quedarse adivinando.
--
-- Para borrarlos despues, hasta abajo esta la linea comentada.

-- La etiqueta se arma igual que en la app: lunes a viernes, dia sin cero a la
-- izquierda y mes en español. Si se dejara el to_char de Postgres saldria en
-- ingles (ENE seria JAN) y la semana no empataria con las que ya hay.
with semana as (
  select
    date_trunc('week', current_date)::date as lunes,
    date_trunc('week', current_date)::date + 4 as viernes
),
etiqueta as (
  select upper(
      to_char(lunes, 'FMDD') || ' ' ||
      (array['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'])[extract(month from lunes)::int]
      || ' - ' ||
      to_char(viernes, 'FMDD') || ' ' ||
      (array['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'])[extract(month from viernes)::int]
      || ' ' || to_char(lunes, 'YYYY')
    ) as texto
  from semana
),
insertados as (
  insert into public.inventory (
    project_id, name, unit, quantity, unit_price,
    week_label, requested_by, in_charge, is_active
  )
  select
    p.id,
    d.actividad,
    d.unidad,
    d.volumen,
    d.pu,
    e.texto,
    'Ing Luis',
    d.destajista,
    true
  from public.projects p
  cross join etiqueta e
  cross join (values
    ('JAVIER',     'TALA DE ARBOLES',                  'PZ', 2.00,   500.00),
    ('JAVIER',     'TRAZO Y NIVELACION',               'M2', 7.52,     6.50),

    ('JAROCHO',    'EXCAVACION DE CEPAS',              'M3', 0.3675, 250.00),
    ('JAROCHO',    'PLANTILLA DE CONCRETO 90 X 5.26',  'M2', 4.73,    35.00),
    ('JAROCHO',    'RETIRO DE ADOQUIN',                'M2', 1.06,    40.00),
    ('JAROCHO',    'MAMPOSTERIA',                      'M3', 0.75,   800.00),
    ('JAROCHO',    'DEMOLICION DE CADENA 20 X 15',     'M',  0.50,   196.00),
    ('JAROCHO',    'DEMOLICION DE MAMPOSTEO',          'M3', 0.50,   800.00),
    ('JAROCHO',    'PLANTILLA DE CONCRETO 2.52 X 1.20','M2', 3.05,    35.00),
    ('JAROCHO',    'TAPIAL',                           'ML', 4.50,    40.00),
    ('JAROCHO',    'DEMOLICION DE MURO',               'M2', 0.50,    40.00),

    ('MAURO BLAS', 'MURO DE TABIQUE',                  'M2', 3.80,   120.00),
    ('MAURO BLAS', 'CADENA DE 20 X 15',                'M',  1.73,   190.00),
    ('MAURO BLAS', 'CADENA 20 X 15',                   'M',  1.73,   144.62),
    ('MAURO BLAS', 'REBOCO',                           'M2', 5.90,    90.00),
    ('MAURO BLAS', 'TAPIAL',                           'ML', 4.50,    40.00),
    ('MAURO BLAS', 'COLADO DE CASTILLO',               'M',  1.20,    50.00),

    ('FAVIAN',     'DEMOLICION DE CADENA',             'M',  1.00,   196.00),
    ('FAVIAN',     'ARMADO DE PARRILLA 120 X 252',     'KG', 14.84,   12.00),
    ('FAVIAN',     'REBOCO',                           'M2', 1.32,    30.00),
    ('FAVIAN',     'RETIRO DE PUERTA',                 'PZ', 2.00,   300.00),
    ('FAVIAN',     'RETIRO DE PORTON',                 'PZ', 2.00,   400.00),
    ('FAVIAN',     'TAPIAL',                           'ML', 5.00,    40.00),
    ('FAVIAN',     'REBOCO BARDA',                     'M2', 3.02,   120.00)
  ) as d(destajista, actividad, unidad, volumen, pu)
  where upper(trim(p.name)) = 'PRUEBAS'
  returning 1
)
select count(*) as renglones_insertados from insertados;

-- Para quitarlos cuando ya no sirvan:
-- delete from public.inventory i
--  using public.projects p
--  where i.project_id = p.id
--    and upper(trim(p.name)) = 'PRUEBAS'
--    and i.requested_by = 'Ing Luis';
