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

const CACHE = 'rocal-pwa-v6';

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

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nombres) =>
        Promise.all(
          nombres.filter((n) => n !== CACHE && n !== CACHE_IMAGENES).map((n) => caches.delete(n))
        )
      )
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
    event.respondWith(
      fetch(request)
        .then((respuesta) => {
          if (respuesta.ok) guardarImagen(request, respuesta.clone());
          return respuesta;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_IMAGENES);
          const guardada = await cache.match(request, { ignoreSearch: true });
          return guardada || Response.error();
        })
    );
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

async function guardarImagen(request, respuesta) {
  try {
    const cache = await caches.open(CACHE_IMAGENES);
    await cache.put(request, respuesta);

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
