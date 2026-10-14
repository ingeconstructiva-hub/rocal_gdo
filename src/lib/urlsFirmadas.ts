/* Direcciones firmadas para los archivos privados.
 *
 * Con los buckets públicos, cualquiera con el link veía una INE o un ticket sin
 * necesidad de sesión. Al cerrarlos, las direcciones guardadas en la base
 * (que son del tipo .../object/public/bucket/archivo.jpg) dejan de servir.
 *
 * Aquí las convertimos en direcciones firmadas: sirven un rato y solo las
 * genera alguien con sesión. Se firma al CARGAR los datos, no al dibujarlos,
 * para que las pantallas y las plantillas de PDF no tengan que cambiar.
 *
 * Por qué se firma EN LOTE: antes cada archivo era una petición aparte. Abrir
 * Resguardos con 40 herramientas disparaba 160 peticiones (cuatro por
 * herramienta) y la pantalla se quedaba pegada. Ahora se pide una sola vez por
 * bucket, sin importar cuántos archivos sean.
 */

import { supabase } from './supabase';

/** Cuánto vive una dirección firmada. Ocho horas cubre una jornada completa. */
const DURACION_SEGUNDOS = 8 * 60 * 60;

// Evita volver a pedirle al servidor la misma firma en cada recarga de pantalla.
const cache = new Map<string, { url: string; expira: number }>();

/** Saca bucket y ruta de una dirección pública de Supabase. */
export function partirUrlPublica(url: string): { bucket: string; ruta: string } | null {
  const marca = '/storage/v1/object/public/';
  const i = url.indexOf(marca);
  if (i === -1) return null;

  const resto = url.slice(i + marca.length).split('?')[0];
  const corte = resto.indexOf('/');
  if (corte === -1) return null;

  return { bucket: resto.slice(0, corte), ruta: decodeURIComponent(resto.slice(corte + 1)) };
}

/** Lo que ya es una foto local o un texto base64 no se toca. */
function esLocal(url: string): boolean {
  return url.startsWith('data:') || url.startsWith('file:') || url.startsWith('blob:') || url.startsWith('idb://');
}

function sinInternet(): boolean {
  // Sin internet no se puede firmar. Se devuelve la dirección tal cual: el
  // service worker reconoce la foto por su nombre y entrega la copia guardada.
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function deLaCache(llave: string): string | null {
  const guardada = cache.get(llave);
  return guardada && guardada.expira > Date.now() ? guardada.url : null;
}

function guardarEnCache(llave: string, url: string) {
  // Se guarda con un margen de 5 minutos antes de que caduque de verdad.
  cache.set(llave, { url, expira: Date.now() + (DURACION_SEGUNDOS - 300) * 1000 });
}

/* Firma un montón de direcciones con una sola petición por bucket.
 *
 * Devuelve un mapa de dirección original -> dirección firmada. Lo que no se
 * pueda firmar no aparece en el mapa, y quien llama se queda con la original:
 * si el bucket todavía fuera público, esa sigue sirviendo. */
async function firmarEnLote(urls: string[]): Promise<Map<string, string>> {
  const resultado = new Map<string, string>();
  if (sinInternet()) return resultado;

  // Se agrupan por bucket y se quitan repetidas: la misma foto puede venir en
  // varios renglones y no tiene caso firmarla dos veces.
  const porBucket = new Map<string, Map<string, string[]>>();

  for (const url of urls) {
    if (!url || esLocal(url)) continue;
    const partes = partirUrlPublica(url);
    if (!partes) continue;

    const llave = `${partes.bucket}/${partes.ruta}`;
    const yaFirmada = deLaCache(llave);
    if (yaFirmada) {
      resultado.set(url, yaFirmada);
      continue;
    }

    if (!porBucket.has(partes.bucket)) porBucket.set(partes.bucket, new Map());
    const rutas = porBucket.get(partes.bucket)!;
    // Varias direcciones originales pueden apuntar a la misma ruta.
    if (!rutas.has(partes.ruta)) rutas.set(partes.ruta, []);
    rutas.get(partes.ruta)!.push(url);
  }

  if (porBucket.size === 0) return resultado;

  await Promise.all(
    Array.from(porBucket.entries()).map(async ([bucket, rutas]) => {
      const listaRutas = Array.from(rutas.keys());
      const { data, error } = await supabase.storage.from(bucket).createSignedUrls(listaRutas, DURACION_SEGUNDOS);
      if (error || !data) return; // Se quedan las originales

      data.forEach((firmada, i) => {
        // El servidor devuelve la ruta de cada archivo; si viniera vacía nos
        // apoyamos en la posición, que respeta el orden que mandamos.
        const ruta = firmada?.path ?? listaRutas[i];
        if (!firmada?.signedUrl || !ruta) return;

        guardarEnCache(`${bucket}/${ruta}`, firmada.signedUrl);
        for (const original of rutas.get(ruta) ?? []) resultado.set(original, firmada.signedUrl);
      });
    })
  );

  return resultado;
}

/** Devuelve una dirección que sí abre. Si no puede firmar, devuelve la original. */
export async function firmar(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  if (esLocal(url)) return url;

  const partes = partirUrlPublica(url);
  if (!partes) return url; // No es de nuestro almacén: se deja como está
  if (sinInternet()) return url;

  const llave = `${partes.bucket}/${partes.ruta}`;
  const guardada = deLaCache(llave);
  if (guardada) return guardada;

  const { data, error } = await supabase.storage
    .from(partes.bucket)
    .createSignedUrl(partes.ruta, DURACION_SEGUNDOS);

  if (error || !data?.signedUrl) {
    // Si el bucket todavía es público, la dirección original sigue funcionando.
    return url;
  }

  guardarEnCache(llave, data.signedUrl);
  return data.signedUrl;
}

/** Firma varias de un jalón (por ejemplo, las fotos de un reporte). */
export async function firmarVarias(urls: (string | null | undefined)[]): Promise<string[]> {
  const limpias = urls.filter((u): u is string => !!u);
  const firmadas = await firmarEnLote(limpias);
  return limpias.map((u) => firmadas.get(u) ?? u);
}

/** Firma los campos indicados de cada renglón de una lista. */
export async function firmarCampos<T extends Record<string, any>>(
  registros: T[],
  campos: (keyof T)[]
): Promise<T[]> {
  // Primero se juntan TODAS las direcciones de la lista y se piden de un solo
  // viaje; después se reparten de vuelta en cada renglón.
  const pendientes: string[] = [];
  for (const registro of registros) {
    for (const campo of campos) {
      const valor = registro[campo];
      if (typeof valor === 'string' && valor) pendientes.push(valor);
    }
  }

  const firmadas = await firmarEnLote(pendientes);

  return registros.map((registro) => {
    const copia: any = { ...registro };
    for (const campo of campos) {
      const valor = copia[campo];
      if (typeof valor === 'string' && valor) copia[campo] = firmadas.get(valor) ?? valor;
    }
    return copia as T;
  });
}
