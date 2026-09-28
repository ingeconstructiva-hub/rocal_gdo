import { mostrarVistaPrevia } from '../components/VistaPreviaPDF';

/* Exportar PDF y hojas de cálculo (versión navegador).
 *
 * PDF: se muestra dentro de la app, en una ventana con botón de cerrar y de
 * guardar. Antes se abría en otra pestaña del navegador y el usuario quedaba
 * atrapado ahí, sin forma de volver. No se usa expo-print porque en navegador
 * no devuelve ningún archivo.
 *
 * CSV: se arma el archivo en memoria y se dispara la descarga del navegador.
 * No se usa expo-sharing porque en web no puede compartir archivos locales.
 */

/** Muestra el reporte dentro de la app, con botón para guardarlo como PDF. */
export async function exportarPDF(html: string, nombreArchivo: string): Promise<void> {
  mostrarVistaPrevia(html, nombreArchivo);
}

/** Descarga un archivo de texto (CSV) desde el navegador. */
export async function exportarTexto(
  contenido: string,
  nombreArchivo: string,
  tipo = 'text/csv'
): Promise<void> {
  const blob = new Blob([contenido], { type: `${tipo};charset=utf-8` });
  const url = URL.createObjectURL(blob);

  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);

  // Liberamos la memoria del archivo temporal
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
