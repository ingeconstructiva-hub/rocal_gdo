/* Service Worker de ROCAL Obras.
 *
 * Estrategia: "primero la red, el caché como respaldo".
 * Siempre intenta bajar la versión más nueva; si no hay internet, entrega lo
 * último que se guardó. Así nadie se queda con una versión vieja pegada, que es
 * el problema típico de los caches agresivos.
 *
 * Importante: solo toca archivos de la propia app (HTML, JS, imágenes).
 * Las llamadas a Supabase NO se interceptan: deben fallar normal cuando no hay
 * internet para que la app las mande a su bandeja de salida.
 */

const CACHE = 'rocal-pwa-v8';

/* Caché aparte para las fotos de Supabase (tickets, INE, evidencia).
 * Va separada porque las imágenes pesan y conviene poder limitarlas sin tocar
 * los archivos de la app. */
const CACHE_IMAGENES = 'rocal-imagenes-v1';
const MAX_IMAGENES = 80;

// Lo mínimo para que la app abra sin internet desde cero.
const ARCHIVOS_BASE = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ARCHIVOS_BASE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()) // Si algo no se pudo guardar, no bloqueamos la instalación
  );
});

/* Al activarse sobrevive SOLO el caché de la app. Todo lo demás se borra,
 * incluidas las fotos privadas.
 *
 * Esas fotos son INE de trabajadores, firmas autógrafas y tickets, y se
 * guardan por nombre de archivo para poder verlas sin internet aunque la
 * firma de la dirección haya cambiado. Eso las hacía sobrevivir al cierre
 * de sesión: en una laptop compartida de oficina seguían ahí para el
 * siguiente que la usara.
 *
 * Borrarlas aquí es además la única forma de quitarlas de los equipos que
 * ya las tienen guardadas: basta con desplegar. Nadie tiene que cerrar
 * sesión ni reinstalar nada.
 *
 * El costo es que después de cada despliegue las fotos se vuelven a bajar
 * la primera vez que haya señal. Barato comparado con dejarlas regadas.
 *
 * Es lista blanca y no lista negra a propósito: el día que se agregue otro
 * caché, se limpia solo sin que nadie tenga que acordarse. */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nombres) => Promise.all(nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Solo GET: un POST no se puede guardar en caché.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  /* Fotos guardadas en Supabase: se guardan para poder verlas sin internet.
   *
   * El detalle importante: cada vez que la app pide una foto, su dirección trae
   * un token nuevo. Por eso al buscarla en el caché se ignora la parte del
   * token (ignoreSearch) y así se reconoce la misma foto aunque la firma cambie.
   *
   * Solo aplica a archivos. Las consultas de datos NO se guardan: deben fallar
   * cuando no hay internet para que la app use sus bandejas y sus copias. */
  if (url.pathname.startsWith('/storage/v1/object/')) {
    const llave = llaveDeImagen(url);

    event.respondWith(traerFoto(request, llave));
    return;
  }

  // Del resto, solo lo de nuestro propio dominio.
  if (url.origin !== self.location.origin) return;

  // Al navegar (abrir o recargar la app): red primero, si falla la portada guardada.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((respuesta) => {
          guardarCopia(request, respuesta);
          return respuesta;
        })
        .catch(async () => (await caches.match('/')) || (await caches.match(request)) || sinConexion())
    );
    return;
  }

  // Archivos sueltos (JS, imágenes, fuentes): red primero, caché de respaldo.
  event.respondWith(
    fetch(request)
      .then((respuesta) => {
        guardarCopia(request, respuesta);
        return respuesta;
      })
      .catch(async () => (await caches.match(request)) || Response.error())
  );
});

// respondWith() SIEMPRE necesita una Response: devolver undefined revienta con
// "Failed to convert value to 'Response'".
//
// Al NAVEGAR sin copia guardada devolvemos este 503 con su explicación.
// Para archivos sueltos usamos Response.error() en su lugar: así el fallo se ve
// en la consola tal como es (un archivo que no cargó) y no disfrazado de 503
// inventado por nosotros, que despista al depurar.
function sinConexion() {
  return new Response('Sin conexión y sin copia guardada de este archivo.', {
    status: 503,
    statusText: 'Sin conexión',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

/* Trae la foto y la guarda para poder verla sin internet.
 *
 * El detalle que costó encontrar: las fotos se piden desde etiquetas <img>, que
 * el navegador manda en modo "no-cors". La respuesta llega OPACA: sirve para
 * mostrarla, pero `cache.put` la rechaza y no se puede guardar. Por eso el
 * caché de imágenes nunca se creaba.
 *
 * Solución: pedirla explícitamente en modo cors (Supabase lo permite). Esa
 * respuesta sí se puede guardar, y se muestra igual. */
async function traerFoto(request, llave) {
  const cache = llave ? await caches.open(CACHE_IMAGENES) : null;

  try {
    const respuesta = await fetch(new Request(request.url, { mode: 'cors', credentials: 'omit' }));

    if (respuesta.ok) {
      if (cache) guardarImagen(llave, respuesta.clone());
      return respuesta;
    }

    /* Una firma caducada contesta 400: no lanza error, asi que antes se
     * devolvia ese 400 y la foto salia rota aunque hubiera copia guardada.
     * Como la copia se guarda por nombre y no por token, aqui si sirve. */
    if (cache) {
      const guardada = await cache.match(llave);
      if (guardada) return guardada;
    }

    return respuesta;
  } catch {
    // Puede fallar por falta de internet o porque el servidor no permita cors.
  }

  // Sin red: la copia guardada.
  if (cache) {
    const guardada = await cache.match(llave);
    if (guardada) return guardada;
  }

  // Último intento: tal como lo pidió la página (no se podrá guardar, pero se ve).
  try {
    return await fetch(request);
  } catch {
    return Response.error();
  }
}

/* Nombre único de cada foto, sin importar cómo se pidió.
 *
 * Supabase entrega la misma imagen por varias rutas:
 *   /storage/v1/object/public/bucket/foto.jpg          (bucket abierto)
 *   /storage/v1/object/sign/bucket/foto.jpg?token=...  (bucket cerrado)
 *
 * Con internet la app usa la firmada; sin internet no puede firmar y cae a la
 * pública. Si guardáramos cada una por su ruta, la foto guardada nunca se
 * encontraría al quedarse sin señal. Por eso todas se guardan bajo el mismo
 * nombre: bucket + archivo. */
function llaveDeImagen(url) {
  const partes = url.pathname.split('/').filter(Boolean); // storage, v1, object, modo, bucket, archivo...
  if (partes.length < 6) return null;
  return `${url.origin}/__foto__/${partes.slice(4).join('/')}`;
}

async function guardarImagen(llave, respuesta) {
  try {
    const cache = await caches.open(CACHE_IMAGENES);
    await cache.put(llave, respuesta);

    // Se conservan las más recientes; las viejas se van para no llenar el disco.
    const claves = await cache.keys();
    if (claves.length > MAX_IMAGENES) {
      for (const vieja of claves.slice(0, claves.length - MAX_IMAGENES)) {
        await cache.delete(vieja);
      }
    }
  } catch {
    // Sin espacio o sin permiso: no pasa nada, simplemente no se guarda.
  }
}

function guardarCopia(request, respuesta) {
  // Solo respuestas buenas. El origen ya se filtró antes de llegar aquí.
  //
  // Se aceptan 'basic' y 'cors': las fuentes de los iconos se piden en modo
  // cors aunque vengan de nuestro propio dominio, y al exigir solo 'basic'
  // nunca se guardaban. Resultado: sin internet la app salía sin iconos.
  if (!respuesta || !respuesta.ok) return;
  if (respuesta.type !== 'basic' && respuesta.type !== 'cors') return;

  const copia = respuesta.clone();
  caches.open(CACHE).then((cache) => cache.put(request, copia));
}
