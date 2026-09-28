/* Armar un PDF a partir de fotos escaneadas (versión navegador).
 *
 * Se arma con jsPDF, que sí produce un archivo de verdad en el navegador.
 * expo-print no sirve aquí: solo abre el diálogo de impresión y no devuelve
 * nada que se pueda subir.
 *
 * Devuelve el PDF como texto base64 (data:application/pdf;base64,...), que es
 * justo lo que `subirArchivo` y `guardarArchivoLocal` saben manejar.
 */

import { jsPDF } from 'jspdf';
import { guardarArchivoLocal, leerComoBase64 } from './archivos';

/** Mide una imagen para poder encajarla en la hoja sin deformarla. */
function medir(dataUrl: string): Promise<{ ancho: number; alto: number }> {
  return new Promise((resolver) => {
    const img = new Image();
    img.onload = () => resolver({ ancho: img.naturalWidth, alto: img.naturalHeight });
    img.onerror = () => resolver({ ancho: 1, alto: 1 });
    img.src = dataUrl;
  });
}

export async function crearPdfDesdeImagenes(imagenes: string[]): Promise<string> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const anchoHoja = doc.internal.pageSize.getWidth();
  const altoHoja = doc.internal.pageSize.getHeight();
  const margen = 8;

  for (let i = 0; i < imagenes.length; i++) {
    const base64 = await leerComoBase64(imagenes[i]);
    const dataUrl = `data:image/jpeg;base64,${base64}`;
    const { ancho, alto } = await medir(dataUrl);

    // Se escala para que quepa completa, conservando la proporción.
    const escala = Math.min((anchoHoja - margen * 2) / ancho, (altoHoja - margen * 2) / alto);
    const anchoFinal = ancho * escala;
    const altoFinal = alto * escala;

    if (i > 0) doc.addPage();
    doc.addImage(
      dataUrl,
      'JPEG',
      (anchoHoja - anchoFinal) / 2,
      (altoHoja - altoFinal) / 2,
      anchoFinal,
      altoFinal
    );
  }

  // jsPDF devuelve algo como "data:application/pdf;filename=generated.pdf;base64,..."
  // Nos quedamos solo con el contenido para que la dirección sea la normal.
  const salida = doc.output('datauristring');
  const base64Pdf = salida.slice(salida.indexOf(',') + 1);
  return `data:application/pdf;base64,${base64Pdf}`;
}

/** En navegador el PDF ya es texto: se guarda en IndexedDB para que aguante recargas. */
export async function guardarPdfParaDespues(pdf: string): Promise<string> {
  return guardarArchivoLocal(pdf);
}
