/* Armar un PDF a partir de fotos escaneadas (versión nativa).
 *
 * En celular se arma con expo-print, que sí genera un archivo real y devuelve
 * su ruta. En navegador Metro toma `pdfDesdeImagenes.web.ts`, porque ahí
 * printToFileAsync solo abre el diálogo de impresión y no devuelve archivo:
 * por eso escanear documentos no funcionaba en la PWA.
 *
 * Las dos versiones devuelven algo que `subirArchivo` sabe subir.
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import { comprimirImagen } from './comprimir';

export async function crearPdfDesdeImagenes(imagenes: string[]): Promise<string> {
  /* Cada foto se reduce ANTES de volverse texto.
   *
   * Una foto de camara pesa varios megas y en base64 crece un tercio mas.
   * Todas juntas iban a dar a una sola cadena de HTML: con tres paginas eran
   * unos 15 MB, y al imprimir eso el telefono se quedaba pegado sin dar
   * ninguna senal. Reducidas, las mismas tres paginas pesan menos de 1 MB. */
  let paginas = '';
  for (const uri of imagenes) {
    const reducida = await comprimirImagen(uri);
    const base64 = await FileSystem.readAsStringAsync(reducida, { encoding: 'base64' });
    paginas += `<div class="page"><img src="data:image/jpeg;base64,${base64}" /></div>`;
  }

  const html = `
    <html>
      <head>
        <style>
          @page { margin: 0px; }
          body { margin: 0; padding: 0; background-color: #f0f0f0; }
          .page { width: 100vw; height: 100vh; page-break-after: always; display: flex; justify-content: center; align-items: center; background-color: white; }
          img { max-width: 100%; max-height: 100%; object-fit: contain; }
        </style>
      </head>
      <body>${paginas}</body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });
  return uri;
}

/** Deja el PDF en un lugar que sobrevive al cierre de la app (para la bandeja). */
export async function guardarPdfParaDespues(pdf: string): Promise<string> {
  const destino = `${FileSystem.documentDirectory}offline_doc_${Date.now()}.pdf`;
  await FileSystem.moveAsync({ from: pdf, to: destino });
  return destino;
}
