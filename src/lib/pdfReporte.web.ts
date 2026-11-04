/* El reporte como PDF de verdad, armado en el navegador.
 *
 * jsPDF dibuja texto real, no una foto del HTML: el documento pesa poco, las
 * cifras se pueden buscar y copiar, y se ve nítido en cualquier pantalla. Eso
 * importa en un reporte que se coteja renglón por renglón contra una factura.
 *
 * Lo que esto destraba es compartir. El camino anterior solo abría el diálogo
 * de impresión, que en iOS es un menú de impresora del que hay que adivinar
 * cómo salir con un archivo. Aquí sale un archivo desde el principio.
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Reporte } from './reporte';

const AZUL: [number, number, number] = [37, 99, 235];
const PIZARRA: [number, number, number] = [15, 23, 42];
const GRIS: [number, number, number] = [100, 116, 139];

/** Un color de CSS (#RRGGBB) en lo que jsPDF entiende. */
const aRgb = (css?: string): [number, number, number] => {
  const m = /^#([0-9a-f]{6})$/i.exec(css || '');
  if (!m) return [30, 41, 59];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export function crearPdfReporte(r: Reporte): Blob {
  const doc = new jsPDF({
    unit: 'mm',
    format: 'a4',
    orientation: r.horizontal ? 'landscape' : 'portrait',
  });

  const ancho = doc.internal.pageSize.getWidth();
  const margen = 12;
  let y = margen + 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...AZUL);
  doc.text(r.titulo, margen, y);

  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(r.subtitulo, margen, y);

  const fecha = new Date().toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  doc.setFontSize(9);
  doc.text(`Fecha: ${fecha}`, ancho - margen, margen + 4, { align: 'right' });

  y += 3;
  doc.setDrawColor(...AZUL);
  doc.setLineWidth(0.8);
  doc.line(margen, y, ancho - margen, y);
  y += 8;

  /* El resumen va en columnas repartidas a lo ancho. Se dibuja a mano y no
   * como tabla porque son tres cifras grandes, no datos que se recorran. */
  if (r.resumen && r.resumen.length > 0) {
    const anchoCol = (ancho - margen * 2) / r.resumen.length;

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.roundedRect(margen, y, ancho - margen * 2, 16, 2, 2, 'FD');

    r.resumen.forEach((cifra, i) => {
      const centro = margen + anchoCol * i + anchoCol / 2;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(...GRIS);
      doc.text(cifra.etiqueta.toUpperCase(), centro, y + 6, { align: 'center' });

      doc.setFontSize(12);
      doc.setTextColor(...aRgb(cifra.color));
      doc.text(cifra.valor, centro, y + 12.5, { align: 'center' });

      if (i > 0) {
        doc.setDrawColor(226, 232, 240);
        doc.line(margen + anchoCol * i, y + 1, margen + anchoCol * i, y + 15);
      }
    });

    y += 22;
  }

  const alaDerecha = new Set(r.columnasNumericas || []);
  const estilosPorColumna: Record<number, { halign: 'right' }> = {};
  alaDerecha.forEach((i) => {
    estilosPorColumna[i] = { halign: 'right' };
  });

  autoTable(doc, {
    startY: y,
    head: [r.columnas],
    body: r.filas.map((fila) => fila.map((celda) => String(celda ?? ''))),
    foot: r.totales ? [r.totales.map((celda) => String(celda ?? ''))] : undefined,
    margin: { left: margen, right: margen },
    styles: { fontSize: r.horizontal ? 7.5 : 8, cellPadding: 1.8, textColor: [30, 41, 59] },
    headStyles: { fillColor: PIZARRA, textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold' },
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 251, 252] },
    columnStyles: estilosPorColumna,
    // Sin esto, una tabla larga corta el ultimo renglon a la mitad entre hojas.
    rowPageBreak: 'avoid',
  });

  return doc.output('blob');
}
