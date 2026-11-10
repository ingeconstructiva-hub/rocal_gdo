/* La bitácora como archivo PDF, armada en el navegador.
 *
 * Tampoco es una tabla: es una sucesión de entradas con su fecha, su
 * categoría, lo que se reportó y las fotos de evidencia. Las fotos son la
 * mitad del documento —sin ellas una bitácora no prueba nada— así que van
 * dibujadas, no descritas.
 */

import { jsPDF } from 'jspdf';
import { altoDelPie, dibujarMembrete, dibujarPieMembrete } from '../lib/membretePdf.web';
import type { ClaveEmpresa } from '../lib/membreteHtml';

const AZUL: [number, number, number] = [37, 99, 235];
const PIZARRA: [number, number, number] = [30, 41, 59];
const GRIS: [number, number, number] = [100, 116, 139];

function medir(dataUrl: string): Promise<{ ancho: number; alto: number }> {
  return new Promise((resolver) => {
    const img = new Image();
    img.onload = () => resolver({ ancho: img.naturalWidth, alto: img.naturalHeight });
    img.onerror = () => resolver({ ancho: 0, alto: 0 });
    img.src = dataUrl;
  });
}

/* Una foto que no se pueda bajar se salta, sin tumbar el documento: vale más
 * una bitácora con una evidencia de menos que ninguna bitácora. */
async function comoDataUrl(url?: string | null): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('data:')) return url;

  try {
    const respuesta = await fetch(url);
    if (!respuesta.ok) return null;
    const blob = await respuesta.blob();

    return await new Promise<string | null>((resolver) => {
      const lector = new FileReader();
      lector.onload = () => resolver(String(lector.result));
      lector.onerror = () => resolver(null);
      lector.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Las fotos de una entrada, que pueden venir como lista o como una sola. */
function urlsDeFotos(log: any): string[] {
  const crudo = log?.photo_url;
  if (!crudo) return [];

  if (typeof crudo === 'string' && crudo.trim().startsWith('[')) {
    try {
      const lista = JSON.parse(crudo);
      return Array.isArray(lista) ? lista.filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  return typeof crudo === 'string' ? [crudo] : [];
}

export async function crearPdfBitacora(
  logs: any[],
  projectName: string = 'Obra sin nombre',
  empresa?: ClaveEmpresa | null
): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const margen = 15;
  const util = ancho - margen * 2;
  let y = margen;

  /* Las fotos se bajan todas de una vez antes de dibujar. A media hoja ya no
   * se puede esperar sin dejar huecos donde iban las evidencias. */
  const fotosPorEntrada = await Promise.all(
    logs.map(async (log) => {
      const urls = urlsDeFotos(log).slice(0, 4); // Más de cuatro no cabe en la hoja.
      const bajadas = await Promise.all(urls.map(comoDataUrl));
      return bajadas.filter(Boolean) as string[];
    })
  );

  /* La franja de contacto se dibuja en la hoja que se deja atras, antes de
   * abrir la siguiente: si se dejara para el final solo saldria en la ultima. */
  const asegurar = (milimetros: number) => {
    if (y + milimetros > alto - margen - altoDelPie(empresa)) {
      dibujarPieMembrete(doc, empresa, margen);
      doc.addPage();
      y = margen;
    }
  };

  // Con membrete, el nombre de la empresa ya va arriba: repetirlo sobraria.
  y = dibujarMembrete(doc, empresa, margen, margen);

  if (!empresa) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...AZUL);
    doc.text('CONSTRUCTORA ROCAL', margen, y + 4);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(`Bitácora de obra - ${projectName}`, margen, y + 9);

  doc.setFontSize(9);
  doc.text(
    `Fecha: ${new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}`,
    ancho - margen,
    y + 4,
    { align: 'right' }
  );
  doc.text(`Entradas: ${logs.length}`, ancho - margen, y + 9, { align: 'right' });

  y += 13;
  doc.setDrawColor(...AZUL);
  doc.setLineWidth(0.8);
  doc.line(margen, y, ancho - margen, y);
  y += 8;

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    const fotos = fotosPorEntrada[i];

    const fecha = new Date(log.created_at);
    const cuando = `${fecha.toLocaleDateString('es-MX')} · ${fecha.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const descripcion = doc.splitTextToSize(String(log.description || ''), util - 4);

    // Una entrada no se parte entre hojas: su encabezado debe quedar con lo
    // que describe, o deja de leerse como una sola cosa.
    asegurar(16 + descripcion.length * 4 + (fotos.length > 0 ? 42 : 0));

    doc.setFillColor(241, 245, 249);
    doc.rect(margen, y, util, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...PIZARRA);
    doc.text(cuando, margen + 3, y + 4.8);

    const etiquetas = [log.category, log.sector ? `Ubicación: ${log.sector}` : '']
      .filter(Boolean)
      .join('   ·   ');
    if (etiquetas) {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...GRIS);
      doc.text(etiquetas, ancho - margen - 3, y + 4.8, { align: 'right' });
    }

    y += 11;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...PIZARRA);
    doc.text(descripcion, margen + 2, y);
    y += descripcion.length * 4 + 3;

    if (fotos.length > 0) {
      const porRenglon = Math.min(fotos.length, 2);
      const anchoFoto = (util - 6 * (porRenglon - 1)) / porRenglon;
      let x = margen;
      let altoRenglon = 0;

      for (let j = 0; j < fotos.length; j++) {
        const { ancho: aImg, alto: aAlt } = await medir(fotos[j]);
        if (aImg === 0) continue;

        const escala = Math.min(anchoFoto / aImg, 45 / aAlt);
        const w = aImg * escala;
        const h = aAlt * escala;

        if (j > 0 && j % porRenglon === 0) {
          y += altoRenglon + 4;
          x = margen;
          altoRenglon = 0;
          asegurar(50);
        }

        doc.addImage(fotos[j], x, y, w, h);
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.2);
        doc.rect(x, y, w, h);

        altoRenglon = Math.max(altoRenglon, h);
        x += anchoFoto + 6;
      }

      y += altoRenglon + 4;
    }

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(margen, y, ancho - margen, y);
    y += 6;
  }

  // La ultima hoja tambien lleva su franja de contacto.
  dibujarPieMembrete(doc, empresa, margen);

  return doc.output('blob');
}
