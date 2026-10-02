import { supabase } from './supabase';

const UN_DIA = 24 * 60 * 60 * 1000;

/**
 * Un residente solo puede corregir lo que acaba de capturar: 24 horas.
 * Así arregla sus propios errores de dedo sin poder tocar el historial de la
 * obra. Las tablas no guardan quién creó cada registro, así que la ventana de
 * tiempo es lo que tenemos para distinguir "me equivoqué ahorita".
 */
export const esDeHoy = (fecha?: string | null) => {
  if (!fecha) return false;
  const momento = new Date(fecha).getTime();
  return Number.isFinite(momento) && Date.now() - momento < UN_DIA;
};

/**
 * El residente desactiva (queda recuperable en la base); admin y oficina sí
 * borran de verdad, como siempre. Las tablas sin columna 'is_active' —'logs' y
 * 'planos'— no tienen dónde guardar el borrado, así que ahí va permanente.
 */
export const eliminarRegistro = (tabla: string, id: string, recuperable: boolean) =>
  recuperable
    ? supabase.from(tabla).update({ is_active: false }).eq('id', id)
    : supabase.from(tabla).delete().eq('id', id);
