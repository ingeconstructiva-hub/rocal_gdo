/* Vista previa de documentos (versión nativa).
 *
 * En celular no hace falta: el sistema operativo ya abre su propia vista previa
 * al compartir o imprimir el PDF. Aquí no se dibuja nada.
 */

/* El mismo tipo que la version web, para que quien importe este modulo
 * lo encuentre sin importar en que plataforma se compile. */
export type HacerPdf = () => Blob | Promise<Blob>;

export function mostrarVistaPrevia(_html: string, _nombreArchivo: string, _hacerPdf?: unknown) {
  // En nativo no se usa: exportar.ts genera el PDF y abre el menú de compartir.
}

export function VistaPreviaPDF() {
  return null;
}
