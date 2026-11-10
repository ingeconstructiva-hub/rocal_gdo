-- Vaciar las fotos que acompañaban a los registros borrados.
--
-- Correr DESPUES de sql/vaciar_obras.sql. Al borrar los registros, sus fotos
-- quedan huerfanas: nadie las ve desde la app, pero siguen ocupando espacio.
--
-- OJO CON DOS BUCKETS QUE NO SE TOCAN ENTEROS:
--
--   'obras' guarda la foto de cada obra, y las obras se conservan.
--
--   'identificaciones' esta COMPARTIDO. Ahi viven las firmas y los INE de
--   los resguardos, pero tambien la foto de perfil y el INE de cada usuario.
--   Borrarlo completo dejaria a la gente sin su foto de perfil. Por eso aqui
--   solo se quitan las carpetas de resguardos.

-- 1) Que hay hoy en cada bucket.
select bucket_id, count(*) as archivos
from storage.objects
where bucket_id in (
  'foto_bitacora', 'tickets_caja_chica', 'comprobantes',
  'planos_obras', 'evidencias_minutas', 'identificaciones', 'obras'
)
group by bucket_id
order by bucket_id;

-- 2) Lo que se va a borrar de 'identificaciones', antes de borrarlo.
--    Deben ser solo firmas de entrega/recibo e INE de resguardos.
select name
from storage.objects
where bucket_id = 'identificaciones'
  and (name like 'firmas/%' or name like 'ines/ine_frente_%' or name like 'ines/ine_reverso_%')
order by name
limit 50;

-- 3) El borrado.
begin;

-- Buckets que son solo de registros: se vacian enteros.
delete from storage.objects
where bucket_id in ('foto_bitacora', 'tickets_caja_chica', 'comprobantes', 'planos_obras', 'evidencias_minutas');

-- Del compartido, solo lo de resguardos. Las carpetas 'perfiles/' y el resto
-- de 'ines/' son de los usuarios y se quedan.
delete from storage.objects
where bucket_id = 'identificaciones'
  and (name like 'firmas/%' or name like 'ines/ine_frente_%' or name like 'ines/ine_reverso_%');

commit;

-- 4) Como quedo. 'obras' e 'identificaciones' deben seguir con archivos.
select bucket_id, count(*) as archivos
from storage.objects
where bucket_id in (
  'foto_bitacora', 'tickets_caja_chica', 'comprobantes',
  'planos_obras', 'evidencias_minutas', 'identificaciones', 'obras'
)
group by bucket_id
order by bucket_id;
