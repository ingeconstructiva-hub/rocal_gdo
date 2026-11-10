/* Compresión de fotos (versión nativa).
 *
 * Antes esto no hacía nada: devolvía la foto tal cual, con la idea de que la
 * cámara ya la entregaba reducida. No es así. El `quality` del selector baja
 * la calidad del JPEG pero NO la resolución, así que de un teléfono moderno
 * salen fotos de 4000 x 3000 y varios megas.
 *
 * Eso pesaba en tres lados. Subir un ticket con datos móviles tardaba de más.
 * Las copias locales llenaban el teléfono. Y al armar un documento escaneado,
 * cada foto se convierte a texto y todas se meten en un solo HTML: con tres
 * páginas eran unos 15 MB en una sola cadena, y ahí la app se quedaba pegada
 * sin dar señales.
 *
 * Se reducen al mismo tamaño que en navegador: lado máximo de 1600 píxeles y
 * calidad 0.7. Para un ticket, una credencial o una foto de avance eso se
 * sigue leyendo perfecto, y suele quedar entre 150 y 400 KB.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

const LADO_MAXIMO = 1600;
const CALIDAD = 0.7;

/* Debajo de esto no vale la pena: el trabajo de recomprimir cuesta más que
 * lo que se ahorra, y una foto ya chica puede hasta crecer. */
const MINIMO_PARA_COMPRIMIR = 400 * 1024;

async function pesa(uri: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && !info.isDirectory ? info.size ?? 0 : 0;
  } catch {
    return 0;
  }
}

export async function comprimirImagen(uri: string): Promise<string> {
  try {
    // Lo que ya es pequeño se deja en paz.
    const tamano = await pesa(uri);
    if (tamano > 0 && tamano < MINIMO_PARA_COMPRIMIR) return uri;

    const contexto = ImageManipulator.manipulate(uri);
    const imagen = await contexto.renderAsync();

    /* Solo se encoge, nunca se estira: una foto que ya es chica no gana nada
     * al agrandarla y pierde nitidez. */
    const lado = Math.max(imagen.width, imagen.height);
    if (lado > LADO_MAXIMO) {
      const escala = LADO_MAXIMO / lado;
      contexto.resize({
        width: Math.round(imagen.width * escala),
        height: Math.round(imagen.height * escala),
      });
    }

    const reducida = await (await contexto.renderAsync()).saveAsync({
      compress: CALIDAD,
      format: SaveFormat.JPEG,
    });

    return reducida.uri;
  } catch {
    /* Si algo falla se sube la original. Una foto pesada llega; una foto que
     * no llega no sirve de nada. */
    return uri;
  }
}
