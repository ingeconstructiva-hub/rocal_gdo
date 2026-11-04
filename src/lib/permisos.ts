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

/* Exportar no es un privilegio.
 *
 * Los botones de PDF y Excel estaban reservados a admin y oficina, y cada
 * pantalla lo decidia con su propia condicion: isAdmin en bitacora y gastos
 * generales, isAdminOrOficina en caja chica y maquinaria, isFinancialRole en
 * nomina. Cinco reglas para la misma idea, y ninguna escrita en un solo lado.
 *
 * Pero quien captura en obra es el residente, y es quien necesita el archivo
 * enfrente del proveedor o del maestro. Un archivo no destapa nada: trae lo
 * mismo que la pantalla ya le mostraba a quien lo pide.
 *
 * Si algun dia hay que volver a cerrarlo, se cierra aqui y no en cinco
 * pantallas.
 */
export const puedeExportar = (): boolean => true;
