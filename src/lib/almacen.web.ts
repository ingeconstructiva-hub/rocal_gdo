/* Almacén local de la app (versión navegador).
 *
 * Misma forma que la versión nativa, pero guardando en IndexedDB en lugar de
 * localStorage. Motivo: localStorage solo aguanta ~5 MB por sitio y ahí no
 * caben las fotos que se quedan en cola cuando no hay internet.
 *
 * Si IndexedDB no está disponible (por ejemplo, ventana de incógnito en algunos
 * navegadores), caemos a localStorage para no dejar la app sin memoria.
 */

const NOMBRE_DB = 'rocal-offline';
const ALMACEN = 'datos';

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
      if (!db.objectStoreNames.contains(ALMACEN)) {
        db.createObjectStore(ALMACEN);
      }
    };

    solicitud.onsuccess = () => resolver(solicitud.result);
    solicitud.onerror = () => resolver(null); // Sin IndexedDB: usaremos localStorage
  });

  return promesaDB;
}

// Ejecuta una operación sobre el almacén y devuelve su resultado.
function operar<T>(
  modo: IDBTransactionMode,
  accion: (almacen: IDBObjectStore) => IDBRequest
): Promise<T | null> {
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

// Respaldo para cuando no hay IndexedDB.
const local = {
  get: (clave: string) => {
    try {
      return localStorage.getItem(clave);
    } catch {
      return null;
    }
  },
  set: (clave: string, valor: string) => {
    try {
      localStorage.setItem(clave, valor);
    } catch {
      // Sin espacio: mejor perder el respaldo que tumbar la app
    }
  },
  borrar: (clave: string) => {
    try {
      localStorage.removeItem(clave);
    } catch {
      // Nada que hacer
    }
  },
};

const Almacen = {
  async getItem(clave: string): Promise<string | null> {
    const db = await abrirDB();
    if (!db) return local.get(clave);

    const valor = await operar<string>('readonly', (almacen) => almacen.get(clave));
    return valor ?? null;
  },

  async setItem(clave: string, valor: string): Promise<void> {
    const db = await abrirDB();
    if (!db) {
      local.set(clave, valor);
      return;
    }

    await operar('readwrite', (almacen) => almacen.put(valor, clave));
  },

  async removeItem(clave: string): Promise<void> {
    const db = await abrirDB();
    if (!db) {
      local.borrar(clave);
      return;
    }

    await operar('readwrite', (almacen) => almacen.delete(clave));
  },
};

export default Almacen;
