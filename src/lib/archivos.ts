/* Archivos locales (versión nativa): fotos y documentos que esperan para subirse.
 *
 * En celular no hay que copiar nada: el archivo ya está en el disco del
 * teléfono y su dirección (file://...) sigue siendo válida después de cerrar
 * la app. Aquí solo pasamos la dirección tal cual.
 *
 * En navegador Metro toma `archivos.web.ts`, donde sí hay que guardar los bytes:
 * las direcciones temporales (blob:) dejan de servir al recargar la página.
 */

import * as FileSystem from 'expo-file-system/legacy';

/** Deja el archivo listo para esperar en la bandeja. Devuelve la referencia a guardar. */
export async function guardarArchivoLocal(uri: string): Promise<string> {
  return uri; // En nativo la dirección del archivo ya es estable
}

/** Lee el archivo como texto base64, listo para subirlo. */
export async function leerComoBase64(referencia: string): Promise<string> {
  if (referencia.startsWith('data:')) {
    return referencia.split(',')[1] ?? '';
  }
  return FileSystem.readAsStringAsync(referencia, { encoding: 'base64' });
}

/** Borra el archivo local una vez que ya subió, para no ocupar espacio de más. */
export async function borrarArchivoLocal(referencia: string): Promise<void> {
  await FileSystem.deleteAsync(referencia).catch(() => {});
}
