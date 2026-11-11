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
import { Aviso } from './aviso';
import { mensajeDeError } from './errores';
import { reporteAHtml, type Reporte } from './reporte';

/* Compartir o imprimir: las dos cosas se hacen con el papel.
 *
 * Compartir manda el archivo por WhatsApp, que es como viaja a la oficina.
 * Imprimir abre el cuadro de impresion de Android con la lista de
 * impresoras: hace falta desde que firman las minutas en obra con la
 * impresora portatil, porque llegar a ella desde el menu de compartir
 * significa cazarla entre todas las apps del telefono.
 */
export async function exportarPDF(html: string, _nombreArchivo: string): Promise<void> {
  return new Promise((listo) => {
    Aviso.alert('Documento listo', '¿Qué quieres hacer con él?', [
      {
        text: 'Imprimir',
        onPress: async () => {
          try {
            await Print.printAsync({ html });
          } catch (e: any) {
            // Cancelar el cuadro de impresion no es un error que avisar.
            if (!/cancel/i.test(e?.message || '')) {
              Aviso.alert('No se pudo imprimir', mensajeDeError(e, 'imprimir el documento'));
            }
          }
          listo();
        },
      },
      {
        text: 'Compartir',
        onPress: async () => {
          try {
            const { uri } = await Print.printToFileAsync({ html });
            await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
          } catch (e: any) {
            Aviso.alert('No se pudo compartir', mensajeDeError(e, 'compartir el documento'));
          }
          listo();
        },
      },
      { text: 'Cancelar', style: 'cancel', onPress: () => listo() },
    ]);
  });
}

/* El mismo reporte, por el camino que ya funciona en celular.
 *
 * Aquí no se usa jsPDF: expo-print imprime el HTML con el motor del sistema,
 * que maneja acentos y saltos de página mejor, y el menú de compartir ya sale
 * solo. jsPDF se queda para el navegador, que es donde hacía falta un archivo.
 */
export async function exportarReporte(reporte: Reporte, nombreArchivo: string): Promise<void> {
  await exportarPDF(reporteAHtml(reporte), nombreArchivo);
}

/* En celular no hace falta armar el archivo aparte: expo-print lo genera y
 * el sistema abre su menu de compartir. El generador se ignora. */
export async function exportarDocumento(
  html: string,
  nombreArchivo: string,
  _hacerPdf?: unknown
): Promise<void> {
  await exportarPDF(html, nombreArchivo);
}

/** En celular el menú de compartir siempre está. */
export function sePuedeCompartir(): boolean {
  return true;
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
