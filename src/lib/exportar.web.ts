import { mostrarVistaPrevia, type HacerPdf } from '../components/VistaPreviaPDF';
import { crearPdfReporte } from './pdfReporte.web';
import { reporteAHtml, type Reporte } from './reporte';

/* Exportar PDF y hojas de cálculo (versión navegador).
 *
 * PDF viejo (HTML suelto): se muestra dentro de la app, en una ventana con
 * botón de cerrar y de guardar. Antes se abría en otra pestaña y el usuario
 * quedaba atrapado ahí, sin forma de volver.
 *
 * PDF nuevo (reporte con datos): se arma el archivo con jsPDF y se ofrece
 * compartir. Es lo que destraba iOS, donde el camino de imprimir abre un menú
 * de impresora del que hay que adivinar cómo salir con un archivo.
 *
 * CSV: se arma en memoria y se comparte, o se descarga si el navegador no
 * sabe compartir archivos.
 */

/* Compartir si se puede, descargar si no.
 *
 * El menú de compartir del sistema solo existe en celular (y en Safari de
 * Mac). En una computadora con Chrome, `canShare` con archivos dice que no, y
 * ahí la descarga de toda la vida es lo correcto: no tiene caso ofrecer un
 * botón que no va a hacer nada.
 */
export async function compartirODescargar(
  blob: Blob,
  nombreArchivo: string,
  tipo: string
): Promise<void> {
  const archivo = new File([blob], nombreArchivo, { type: tipo });

  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: nombreArchivo });
      return;
    } catch (error: any) {
      // Cancelar no es un error: el usuario cerró el menú y ya.
      if (error?.name === 'AbortError') return;
      // Cualquier otra falla cae a la descarga, que siempre funciona.
    }
  }

  descargar(blob, nombreArchivo);
}

function descargar(blob: Blob, nombreArchivo: string) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** ¿Este navegador sabe abrir el menú de compartir con un archivo? */
export function sePuedeCompartir(): boolean {
  if (typeof navigator === 'undefined' || !navigator.canShare) return false;
  try {
    const prueba = new File(['x'], 'prueba.pdf', { type: 'application/pdf' });
    return navigator.canShare({ files: [prueba] });
  } catch {
    return false;
  }
}

/* El reporte se muestra primero y desde ahi se comparte.
 *
 * Saltarse la vista previa seria mas corto, pero nadie manda por WhatsApp un
 * documento que no ha visto: la vista previa es donde se cacha que falto una
 * semana o que el saldo no cuadra, antes de que lo vea el proveedor. */
export async function exportarReporte(reporte: Reporte, nombreArchivo: string): Promise<void> {
  mostrarVistaPrevia(reporteAHtml(reporte), nombreArchivo, () => crearPdfReporte(reporte));
}

/* Un documento que no es tabla: la responsiva, la bitacora.
 *
 * Trae su HTML para verlo y quien sabe armarlo como archivo. Si no hay quien
 * lo arme, se muestra igual y solo se puede imprimir. */
export async function exportarDocumento(
  html: string,
  nombreArchivo: string,
  hacerPdf?: HacerPdf
): Promise<void> {
  mostrarVistaPrevia(html, nombreArchivo, hacerPdf);
}

/** Muestra el reporte dentro de la app, con botón para guardarlo como PDF. */
export async function exportarPDF(html: string, nombreArchivo: string): Promise<void> {
  mostrarVistaPrevia(html, nombreArchivo);
}

/** Comparte o descarga un archivo de texto (CSV). */
export async function exportarTexto(
  contenido: string,
  nombreArchivo: string,
  tipo = 'text/csv'
): Promise<void> {
  const blob = new Blob([contenido], { type: `${tipo};charset=utf-8` });
  await compartirODescargar(blob, nombreArchivo, tipo);
}
