/* Un espejo de lo pendiente, fuera de la app.
 *
 * Todo lo que la app guarda vive en su almacenamiento privado, y Android lo
 * borra al desinstalar. Lo que ya subió al servidor vuelve solo al iniciar
 * sesión; lo que se capturó sin señal y no alcanzó a subir, no: desaparece
 * sin que nadie se entere, porque el contador de pendientes simplemente
 * vuelve a leer cero.
 *
 * Aquí se copia esa bandeja a una carpeta del teléfono —la que el residente
 * elija una vez— que NO se borra al desinstalar. Al reinstalar, la app
 * ofrece recuperarla.
 *
 * Android obliga a que la carpeta la elija la persona, por seguridad: una app
 * no puede escribir donde quiera. El permiso se pierde al desinstalar, los
 * archivos no, así que tras reinstalar hay que volver a señalar la misma
 * carpeta. Es un toque extra, una sola vez.
 */

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import Almacen from './almacen';
import { BANDEJAS, leerBandeja, reemplazarBandeja } from './bandeja';

const LLAVE_CARPETA = '@carpeta_respaldo';
const NOMBRE_ARCHIVO = 'rocal_pendientes';
const TIPO = 'application/json';

type Espejo = {
  guardado: string;
  bandejas: Record<string, any[]>;
};

/** El almacén de Android solo existe en Android. */
export const sePuedeEspejar = () => Platform.OS === 'android';

/** La carpeta elegida, o null si todavía no se elige ninguna. */
export async function carpetaElegida(): Promise<string | null> {
  try {
    return await Almacen.getItem(LLAVE_CARPETA);
  } catch {
    return null;
  }
}

/* Pide elegir la carpeta y la recuerda.
 *
 * Devuelve null si la persona cancela, que no es un error: es una respuesta.
 */
export async function elegirCarpeta(): Promise<string | null> {
  if (!sePuedeEspejar()) return null;

  try {
    const permiso = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permiso.granted) return null;

    await Almacen.setItem(LLAVE_CARPETA, permiso.directoryUri);
    return permiso.directoryUri;
  } catch {
    return null;
  }
}

/** Todo lo que espera subirse, en un solo objeto. */
async function juntarPendientes(): Promise<Espejo> {
  const bandejas: Record<string, any[]> = {};

  for (const [nombre, clave] of Object.entries(BANDEJAS)) {
    const lista = await leerBandeja(clave);
    if (lista.length > 0) bandejas[nombre] = lista;
  }

  return { guardado: new Date().toISOString(), bandejas };
}

/** Cuántos registros trae un espejo. */
export const cuantosTrae = (espejo: Espejo | null): number =>
  espejo ? Object.values(espejo.bandejas).reduce((total, lista) => total + lista.length, 0) : 0;

/* Copia lo pendiente a la carpeta.
 *
 * Se reescribe el archivo entero en vez de ir agregando: la bandeja ya es la
 * verdad, y un archivo que crece sin control acabaría guardando cosas que ya
 * subieron.
 */
export async function guardarEspejo(): Promise<void> {
  if (!sePuedeEspejar()) return;

  const carpeta = await carpetaElegida();
  if (!carpeta) return;

  try {
    const contenido = await juntarPendientes();

    /* Si ya no hay nada pendiente, el espejo se vacía también. Dejar ahí una
     * copia de algo que ya subió invita a recuperarlo dos veces. */
    const archivos = await FileSystem.StorageAccessFramework.readDirectoryAsync(carpeta);
    const existente = archivos.find((u) => u.includes(NOMBRE_ARCHIVO));

    const destino =
      existente ||
      (await FileSystem.StorageAccessFramework.createFileAsync(carpeta, NOMBRE_ARCHIVO, TIPO));

    await FileSystem.writeAsStringAsync(destino, JSON.stringify(contenido), { encoding: 'utf8' });
  } catch {
    // Si la carpeta ya no existe o se revocó el permiso, no se insiste: el
    // espejo es un respaldo, no puede estorbar al trabajo.
  }
}

/** Lo que haya en la carpeta, o null si no hay nada que recuperar. */
export async function leerEspejo(): Promise<Espejo | null> {
  if (!sePuedeEspejar()) return null;

  const carpeta = await carpetaElegida();
  if (!carpeta) return null;

  try {
    const archivos = await FileSystem.StorageAccessFramework.readDirectoryAsync(carpeta);
    const encontrado = archivos.find((u) => u.includes(NOMBRE_ARCHIVO));
    if (!encontrado) return null;

    const texto = await FileSystem.readAsStringAsync(encontrado, { encoding: 'utf8' });
    const espejo = JSON.parse(texto) as Espejo;

    return espejo && espejo.bandejas ? espejo : null;
  } catch {
    return null;
  }
}

/* Devuelve lo del espejo a las bandejas.
 *
 * Se AGREGA a lo que ya haya en vez de reemplazarlo: si alguien capturó algo
 * nuevo antes de recuperar, pisarlo seria cambiar una perdida por otra.
 */
export async function restaurarEspejo(espejo: Espejo): Promise<number> {
  let devueltos = 0;

  for (const [nombre, clave] of Object.entries(BANDEJAS)) {
    const delEspejo = espejo.bandejas[nombre] || [];
    if (delEspejo.length === 0) continue;

    const actuales = await leerBandeja(clave);
    await reemplazarBandeja(clave, [...actuales, ...delEspejo]);
    devueltos += delEspejo.length;
  }

  return devueltos;
}
