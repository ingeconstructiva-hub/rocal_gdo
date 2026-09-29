/* Archivos locales (versión navegador).
 *
 * El problema: cuando alguien elige una foto, el navegador entrega una
 * dirección temporal (blob:...) que vive solo mientras la pestaña esté abierta.
 * Si se guarda esa dirección en la bandeja de salida y el usuario recarga o
 * cierra el navegador, la foto se pierde aunque el registro siga ahí.
 *
 * La solución: copiar los bytes a IndexedDB y guardar una referencia propia
 * (`idb://...`) que sí sobrevive. Va en su propia base de datos, separada de
 * la de los registros, para poder borrar fotos sin tocar lo demás.
 */

import { comprimirImagen } from './comprimir';

const NOMBRE_DB = 'rocal-archivos';
const ALMACEN = 'blobs';

let promesaDB: Promise<IDBDatabase | null> | null = null;

function abrirDB(): Promise<IDBDatabase | null> {
  if (promesaDB) return promesaDB;

  promesaDB = new Promise((resolver) => {
    if (typeof indexedDB === 'undefined') {
      resolver(null);
      return;
    }
    const solicitud = indexedDB.open(NOMBRE_DB, 1);
    solicitud.onupgradeneeded = () => {
      const db = solicitud.result;
      if (!db.objectStoreNames.contains(ALMACEN)) db.createObjectStore(ALMACEN);
    };
    solicitud.onsuccess = () => resolver(solicitud.result);
    solicitud.onerror = () => resolver(null);
  });

  return promesaDB;
}

function operar<T>(modo: IDBTransactionMode, accion: (almacen: IDBObjectStore) => IDBRequest): Promise<T | null> {
  return abrirDB().then((db) => {
    if (!db) return null;
    return new Promise<T | null>((resolver) => {
      const transaccion = db.transaction(ALMACEN, modo);
      const solicitud = accion(transaccion.objectStore(ALMACEN));
      solicitud.onsuccess = () => resolver(solicitud.result as T);
      solicitud.onerror = () => resolver(null);
    });
  });
}

function blobABase64(blob: Blob): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => {
      const resultado = String(lector.result);
      resolver(resultado.split(',')[1] ?? ''); // Quitamos el "data:image/jpeg;base64,"
    };
    lector.onerror = () => rechazar(lector.error);
    lector.readAsDataURL(blob);
  });
}

/** Copia los bytes de la foto a IndexedDB. Devuelve una referencia que sobrevive recargas. */
export async function guardarArchivoLocal(uri: string): Promise<string> {
  // Se comprime antes de guardarla: la cola sin internet ocupa mucho menos y
  // caben más fotos pendientes en el espacio que da el navegador.
  const comprimida = await comprimirImagen(uri);
  const blob = await fetch(comprimida).then((r) => r.blob());

  const db = await abrirDB();
  if (!db) {
    // Sin IndexedDB no hay dónde guardarlo: lo dejamos como texto base64.
    // Pesa más, pero es preferible a perder la foto.
    const base64 = await blobABase64(blob);
    return `data:${blob.type || 'image/jpeg'};base64,${base64}`;
  }

  const id = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`);
  await operar('readwrite', (almacen) => almacen.put(blob, id));
  return `idb://${id}`;
}

/** Lee el archivo como texto base64, listo para subirlo. */
export async function leerComoBase64(referencia: string): Promise<string> {
  if (referencia.startsWith('data:')) {
    return referencia.split(',')[1] ?? '';
  }

  if (referencia.startsWith('idb://')) {
    const blob = await operar<Blob>('readonly', (almacen) => almacen.get(referencia.slice(6)));
    if (!blob) throw new Error('La foto guardada ya no está disponible en este dispositivo.');
    return blobABase64(blob);
  }

  // blob: o http: que todavía siguen vivos
  const blob = await fetch(referencia).then((r) => r.blob());
  return blobABase64(blob);
}

/** Borra el archivo local una vez que ya subió. */
export async function borrarArchivoLocal(referencia: string): Promise<void> {
  if (!referencia.startsWith('idb://')) return;
  await operar('readwrite', (almacen) => almacen.delete(referencia.slice(6)));
}
