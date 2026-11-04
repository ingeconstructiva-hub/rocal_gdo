/* Vista previa de documentos (versión nativa).
 *
 * En celular no hace falta: el sistema operativo ya abre su propia vista previa
 * al compartir o imprimir el PDF. Aquí no se dibuja nada.
 */

export function mostrarVistaPrevia(_html: string, _nombreArchivo: string, _reporte?: unknown) {
  // En nativo no se usa: exportar.ts genera el PDF y abre el menú de compartir.
}

export function VistaPreviaPDF() {
  return null;
}
