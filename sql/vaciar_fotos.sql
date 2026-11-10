-- Dejar SOLO las fotos de perfil. Todo lo demas se borra.
--
-- Correr DESPUES de sql/vaciar_obras.sql.
--
-- QUE SE CONSERVA:
--   'identificaciones/perfiles/...' - la foto de perfil de cada usuario.
--
-- QUE SE BORRA, y vale la pena leerlo dos veces porque va mas alla de los
-- registros que ya se vaciaron:
--
--   La foto de cada OBRA (bucket 'obras'). Las obras se conservan, pero se
--   quedan sin imagen y hay que volver a subirla desde la pantalla de
--   Proyectos.
--
--   El INE de cada USUARIO ('identificaciones/ines/ine_<id>...'). No es un
--   documento de la obra sino de la persona, y se pidio dejar solo los
--   perfiles. Si lo quieres conservar, usa la version comentada al final.
--
--   Las fotos de bitacora, tickets de caja chica, comprobantes de gastos,
--   documentos, evidencias de minutas, y las firmas e INE de resguardos.
--
-- Esto es definitivo: el almacen no tiene papelera.

-- 1) Que hay hoy, bucket por bucket.
select bucket_id, count(*) as archivos
from storage.objects
group by bucket_id
order by bucket_id;

-- 2) Que se va a CONSERVAR. Revisa esta lista antes de seguir: si aqui no
--    sale la foto de alguien, despues del borrado ya no habra de donde
--    sacarla.
select name
from storage.objects
where bucket_id = 'identificaciones' and name like 'perfiles/%'
order by name;

-- 3) El borrado.
begin;

-- Todo bucket que no sea el de identificaciones se vacia entero.
delete from storage.objects
where bucket_id <> 'identificaciones';

-- Del de identificaciones se queda unicamente la carpeta de perfiles.
delete from storage.objects
where bucket_id = 'identificaciones'
  and name not like 'perfiles/%';

commit;

-- 4) Como quedo. Debe salir una sola linea: identificaciones, con tantos
--    archivos como perfiles con foto haya.
select bucket_id, count(*) as archivos
from storage.objects
group by bucket_id
order by bucket_id;


-- ---------------------------------------------------------------------
-- SI QUIERES CONSERVAR TAMBIEN EL INE DE LOS USUARIOS
--
-- El INE de una persona vive en 'ines/' junto al de los resguardos, y se
-- distinguen por el nombre: los de resguardo empiezan con 'ine_frente_' o
-- 'ine_reverso_'. Cambia el segundo delete del paso 3 por este:
--
--   delete from storage.objects
--   where bucket_id = 'identificaciones'
--     and name not like 'perfiles/%'
--     and (name like 'firmas/%'
--          or name like 'ines/ine_frente_%'
--          or name like 'ines/ine_reverso_%');
-- ---------------------------------------------------------------------
