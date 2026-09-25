/* Subir archivos al almacén de Supabase, igual en celular y en navegador.
 *
 * Antes cada pantalla lo hacía a su manera: unas con FormData y la dirección
 * del archivo (solo funciona en celular), otras leyendo base64 con
 * expo-file-system (que en navegador no existe). Resultado: en la PWA las fotos
 * no subían.
 *
 * Aquí queda un solo camino, y `leerComoBase64` se encarga de la diferencia
 * entre plataformas.
 */

import { decode } from 'base64-arraybuffer';
import { leerComoBase64 } from './archivos';
import { supabase } from './supabase';

type Opciones = {
  /** Extensión del archivo resultante. Por defecto jpg. */
  extension?: string;
  /** Tipo de contenido. Por defecto imagen jpeg. */
  contentType?: string;
  /** Prefijo del nombre, para reconocerlo en el bucket. */
  prefijo?: string;
  /** Carpeta dentro del bucket (por ejemplo 'perfiles' o 'ines'). */
  carpeta?: string;
};

/** Sube el archivo y devuelve su dirección pública. Si falla, lanza error. */
export async function subirArchivo(
  referencia: string,
  bucket: string,
  { extension = 'jpg', contentType = 'image/jpeg', prefijo = 'archivo', carpeta }: Opciones = {}
): Promise<string> {
  const base64 = await leerComoBase64(referencia);
  const contenido = decode(base64);

  // Nombre con azar además de la hora: dos personas pueden guardar en el mismo
  // segundo y un nombre repetido hace que la segunda subida falle.
  const nombre = `${prefijo}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${extension}`;
  const ruta = carpeta ? `${carpeta}/${nombre}` : nombre;

  const { error } = await supabase.storage.from(bucket).upload(ruta, contenido, { contentType });
  if (error) throw error;

  return supabase.storage.from(bucket).getPublicUrl(ruta).data.publicUrl;
}
