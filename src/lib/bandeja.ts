/* Bandejas de salida: lo que se registra sin internet y espera para subirse.
 *
 * Todas las bandejas son una lista guardada en el almacén local bajo su propia
 * llave. Aquí viven las operaciones comunes para que cada pantalla no repita el
 * "leer, agregar, volver a guardar", que es donde se colaban los errores.
 *
 * Las llaves deben ser EXACTAMENTE las mismas que lee el sincronizador de
 * ProjectContext. Si no coinciden, lo guardado nunca se sube.
 */

import Almacen from './almacen';

export const BANDEJAS = {
  bitacora: '@bandeja_salida_logs',
  inventario: '@bandeja_salida_inventario',
  trabajadores: '@bandeja_salida_lista',
  nomina: '@bandeja_salida_nomina',
  planos: '@bandeja_salida_planos',
  caja: '@bandeja_salida_caja',
  ingresos: '@bandeja_salida_ingresos',
} as const;

export async function leerBandeja(clave: string): Promise<any[]> {
  try {
    const guardado = await Almacen.getItem(clave);
    const lista = guardado ? JSON.parse(guardado) : [];
    return Array.isArray(lista) ? lista : [];
  } catch {
    return []; // Si el contenido quedó corrupto, mejor seguir que tumbar la app
  }
}

export async function guardarEnBandeja(clave: string, registro: any): Promise<void> {
  const lista = await leerBandeja(clave);
  lista.push(registro);
  await Almacen.setItem(clave, JSON.stringify(lista));
}

export async function reemplazarBandeja(clave: string, registros: any[]): Promise<void> {
  await Almacen.setItem(clave, JSON.stringify(registros));
}

export async function vaciarBandeja(clave: string): Promise<void> {
  await Almacen.removeItem(clave);
}

/** Cuántos registros están esperando subirse, en todas las bandejas juntas. */
export async function contarPendientes(): Promise<number> {
  const listas = await Promise.all(Object.values(BANDEJAS).map((clave) => leerBandeja(clave)));
  return listas.reduce((total, lista) => total + lista.length, 0);
}
