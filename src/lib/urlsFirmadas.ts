/* Direcciones firmadas para los archivos privados.
 *
 * Con los buckets públicos, cualquiera con el link veía una INE o un ticket sin
 * necesidad de sesión. Al cerrarlos, las direcciones guardadas en la base
 * (que son del tipo .../object/public/bucket/archivo.jpg) dejan de servir.
 *
 * Aquí las convertimos en direcciones firmadas: sirven un rato y solo las
 * genera alguien con sesión. Se firma al CARGAR los datos, no al dibujarlos,
 * para que las pantallas y las plantillas de PDF no tengan que cambiar.
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

/** Devuelve una dirección que sí abre. Si no puede firmar, devuelve la original. */
export async function firmar(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;

  // Lo que ya es una foto local o un texto base64 no se toca.
  if (url.startsWith('data:') || url.startsWith('file:') || url.startsWith('blob:') || url.startsWith('idb://')) {
    return url;
  }

  const partes = partirUrlPublica(url);
  if (!partes) return url; // No es de nuestro almacén: se deja como está

  // Sin internet no se puede firmar. Devolvemos la dirección tal cual: el
  // service worker reconoce la foto por su nombre y entrega la copia guardada.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return url;

  const llave = `${partes.bucket}/${partes.ruta}`;
  const guardada = cache.get(llave);
  if (guardada && guardada.expira > Date.now()) return guardada.url;

  const { data, error } = await supabase.storage
    .from(partes.bucket)
    .createSignedUrl(partes.ruta, DURACION_SEGUNDOS);

  if (error || !data?.signedUrl) {
    // Si el bucket todavía es público, la dirección original sigue funcionando.
    return url;
  }

  // Se guarda con un margen de 5 minutos antes de que caduque de verdad.
  cache.set(llave, { url: data.signedUrl, expira: Date.now() + (DURACION_SEGUNDOS - 300) * 1000 });
  return data.signedUrl;
}

/** Firma varias de un jalón (por ejemplo, las fotos de un reporte). */
export async function firmarVarias(urls: (string | null | undefined)[]): Promise<string[]> {
  const firmadas = await Promise.all(urls.map((u) => firmar(u)));
  return firmadas.filter((u): u is string => !!u);
}

/** Firma los campos indicados de cada renglón de una lista. */
export async function firmarCampos<T extends Record<string, any>>(
  registros: T[],
  campos: (keyof T)[]
): Promise<T[]> {
  return Promise.all(
    registros.map(async (registro) => {
      const copia: any = { ...registro };
      for (const campo of campos) {
        if (typeof copia[campo] === 'string') copia[campo] = await firmar(copia[campo]);
      }
      return copia as T;
    })
  );
}
