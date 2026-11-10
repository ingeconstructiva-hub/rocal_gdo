/* La responsiva como archivo (versión nativa).
 *
 * En celular no hace falta: expo-print genera el PDF desde el HTML y el
 * sistema abre su menú de compartir. Esto existe para que las pantallas
 * puedan importar el mismo nombre en las dos plataformas; Metro toma la
 * versión .web.ts cuando compila para navegador.
 */
import type { ClaveEmpresa } from '../lib/membreteHtml';

export async function crearPdfResponsiva(
  _vale: any,
  _empresa?: ClaveEmpresa | null
): Promise<Blob> {
  throw new Error('Solo se usa en navegador');
}
