-- Vaciar las fotos de los registros, conservando lo que no es de ellos.
--
-- Correr DESPUES de sql/vaciar_obras.sql.
--
-- QUE SE CONSERVA:
--   El bucket 'obras' entero: la foto de cada obra. Las obras se quedan, y
--   su imagen es parte de ellas, no de lo que se capturo adentro.
--
--   'identificaciones/perfiles/...': la foto de perfil de cada usuario.
--
-- QUE SE BORRA:
--   Fotos de bitacora, tickets de caja chica, comprobantes de gastos,
--   documentos (planos), evidencias de minutas, y las firmas e INE de los
--   resguardos.
--
--   Tambien el INE de cada USUARIO, que vive en la misma carpeta que el de
--   los resguardos. Si lo quieres conservar, usa la variante del final: es
--   cambiar un delete por otro.
--
-- Esto es definitivo: el almacen no tiene papelera.

-- 1) Que hay hoy, bucket por bucket.
select bucket_id, count(*) as archivos
from storage.objects
group by bucket_id
order by bucket_id;

-- 2) Que se va a CONSERVAR. Revisa esta lista antes de seguir: si una foto
--    no sale aqui, despues del borrado ya no habra de donde sacarla.
select bucket_id, name
from storage.objects
where bucket_id = 'obras'
   or (bucket_id = 'identificaciones' and name like 'perfiles/%')
order by bucket_id, name;

-- 3) El borrado.
begin;

-- Todo bucket que no sea 'obras' ni 'identificaciones' se vacia entero.
delete from storage.objects
where bucket_id not in ('obras', 'identificaciones');

-- De 'identificaciones' se queda unicamente la carpeta de perfiles.
delete from storage.objects
where bucket_id = 'identificaciones'
  and name not like 'perfiles/%';

commit;

-- 4) Como quedo. Deben salir dos renglones: 'obras' con sus fotos, e
--    'identificaciones' con tantos archivos como perfiles con foto haya.
select bucket_id, count(*) as archivos
from storage.objects
group by bucket_id
order by bucket_id;


-- ---------------------------------------------------------------------
-- SI QUIERES CONSERVAR TAMBIEN EL INE DE LOS USUARIOS
--
-- El INE de una persona vive en 'ines/' junto al de los resguardos, y se
-- distinguen por el nombre: los de resguardo empiezan con 'ine_frente_' o
-- 'ine_reverso_'. Cambia el SEGUNDO delete del paso 3 por este:
--
--   delete from storage.objects
--   where bucket_id = 'identificaciones'
--     and (name like 'firmas/%'
--          or name like 'ines/ine_frente_%'
--          or name like 'ines/ine_reverso_%');
-- ---------------------------------------------------------------------
