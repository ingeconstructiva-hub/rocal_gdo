/* Compresión de fotos (versión nativa).
 *
 * En celular la cámara ya entrega la foto con calidad reducida (quality: 0.6 en
 * el selector), así que aquí se deja pasar tal cual. La versión de navegador
 * sí comprime, porque ahí las fotos llegan al tamaño completo del archivo.
 */

export async function comprimirImagen(uri: string): Promise<string> {
  return uri;
}
