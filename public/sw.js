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

const CACHE = 'rocal-pwa-v2';

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
        Promise.all(nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Solo GET: un POST no se puede guardar en caché.
  if (request.method !== 'GET') return;

  // Solo lo de nuestro propio dominio. Supabase y demás pasan de largo.
  const url = new URL(request.url);
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
      .catch(async () => (await caches.match(request)) || sinConexion())
  );
});

// respondWith() SIEMPRE necesita una Response. Si no hay red ni copia guardada,
// devolvemos un 503 propio; si no, el navegador lanza
// "Failed to convert value to 'Response'".
function sinConexion() {
  return new Response('Sin conexión y sin copia guardada de este archivo.', {
    status: 503,
    statusText: 'Sin conexión',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

function guardarCopia(request, respuesta) {
  // Solo guardamos respuestas buenas y propias.
  if (!respuesta || !respuesta.ok || respuesta.type !== 'basic') return;
  const copia = respuesta.clone();
  caches.open(CACHE).then((cache) => cache.put(request, copia));
}
