/* Exportar PDF y hojas de cálculo (versión navegador).
 *
 * PDF: se abre el HTML en una ventana aparte y se manda a imprimir. Desde ahí
 * el usuario elige "Guardar como PDF", que es como se hace en la web. No se
 * usa expo-print porque en navegador no devuelve ningún archivo.
 *
 * CSV: se arma el archivo en memoria y se dispara la descarga del navegador.
 * No se usa expo-sharing porque en web no puede compartir archivos locales.
 */

/** Abre el HTML en una ventana e inicia la impresión (de ahí: Guardar como PDF). */
export async function exportarPDF(html: string, nombreArchivo: string): Promise<void> {
  const ventana = window.open('', '_blank');

  if (!ventana) {
    throw new Error(
      'El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes de este sitio e inténtalo de nuevo.'
    );
  }

  // El título es el nombre que propone el navegador al guardar el PDF.
  ventana.document.write(`<!DOCTYPE html><html><head><title>${nombreArchivo}</title></head><body>${html}</body></html>`);
  ventana.document.close();

  // Esperamos a que carguen las imágenes; si no, el PDF sale sin fotos.
  await new Promise<void>((resolver) => {
    const listo = () => resolver();
    if (ventana.document.readyState === 'complete') setTimeout(listo, 300);
    else ventana.addEventListener('load', () => setTimeout(listo, 300));
    setTimeout(listo, 3000); // Tope, por si alguna imagen nunca carga
  });

  ventana.focus();
  ventana.print();
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
