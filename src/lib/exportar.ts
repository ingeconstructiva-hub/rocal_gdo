/* Exportar PDF y hojas de cálculo (versión nativa).
 *
 * En celular: se genera el archivo y se abre el menú de compartir, que es lo
 * que la gente usa para mandarlo por WhatsApp o guardarlo en el teléfono.
 *
 * En navegador Metro toma `exportar.web.ts`, porque ahí este camino NO funciona:
 * `printToFileAsync` solo abre el diálogo de impresión sin devolver archivo, y
 * `shareAsync` no puede compartir archivos locales. Por eso los botones de PDF
 * y Excel no hacían nada en la PWA.
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

/** Genera un PDF a partir de HTML y lo ofrece para compartir o guardar. */
export async function exportarPDF(html: string, _nombreArchivo: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
}

/** Guarda un archivo de texto (CSV) y lo ofrece para compartir. */
export async function exportarTexto(
  contenido: string,
  nombreArchivo: string,
  tipo = 'text/csv'
): Promise<void> {
  const uri = `${FileSystem.documentDirectory}${nombreArchivo}`;
  await FileSystem.writeAsStringAsync(uri, contenido, { encoding: 'utf8' });
  await Sharing.shareAsync(uri, { mimeType: tipo, dialogTitle: 'Exportar' });
}
