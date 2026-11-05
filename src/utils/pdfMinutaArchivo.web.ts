/* La minuta de trabajo, en hoja membretada.
 *
 * Sigue el formato que las dos empresas ya usaban en Word: asunto, proyecto,
 * ubicación, fecha, hora, número, temas tratados y el espacio del croquis.
 * Se respeta el orden y los nombres de los campos porque es un documento que
 * se firma y se archiva; cambiarle la forma lo vuelve otro papel.
 *
 * La empresa se elige al generarlo. El mismo residente levanta minutas para
 * ROCAL y para JD según de quién sea el contrato, y hasta ahora las tenía que
 * pasar a mano a la hoja membretada que tocara.
 */

import { jsPDF } from 'jspdf';
import { EMPRESAS, type Empresa } from '../lib/membretes';

const PIZARRA: [number, number, number] = [30, 41, 59];
const GRIS: [number, number, number] = [100, 116, 139];

export type DatosDeMinuta = {
  asunto: string;
  indicacion: string;
  dirigidaA?: string | null;
  plazo?: string | null;
  creada: string;
  numero: string;
  proyecto: string;
  ubicacion?: string | null;
};

function medir(dataUrl: string): Promise<{ ancho: number; alto: number }> {
  return new Promise((resolver) => {
    const img = new Image();
    img.onload = () => resolver({ ancho: img.naturalWidth, alto: img.naturalHeight });
    img.onerror = () => resolver({ ancho: 0, alto: 0 });
    img.src = dataUrl;
  });
}

export async function crearPdfMinuta(
  datos: DatosDeMinuta,
  clave: Empresa['clave']
): Promise<Blob> {
  const empresa = EMPRESAS[clave];

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const margen = 18;
  const util = ancho - margen * 2;

  // --- Membrete ---
  const { ancho: aLogo, alto: altoLogo } = await medir(empresa.logo);
  let y = 12;
  let abajoDelLogo = y;

  if (aLogo > 0) {
    const w = empresa.anchoLogo;
    const h = (altoLogo / aLogo) * w;
    doc.addImage(empresa.logo, margen, y, w, h);
    abajoDelLogo = y + h;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...PIZARRA);
  let yTexto = y + 3;
  empresa.encabezado.forEach((renglon, i) => {
    doc.setFont('helvetica', i === 0 ? 'bold' : 'normal');
    doc.setFontSize(i === 0 ? 9.5 : 7.5);
    doc.text(renglon, ancho - margen, yTexto, { align: 'right' });
    yTexto += i === 0 ? 5 : 3.6;
  });

  y = Math.max(abajoDelLogo, yTexto) + 3;
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(0.8);
  doc.line(margen, y, ancho - margen, y);
  y += 10;

  // --- Título ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...PIZARRA);
  doc.text('MINUTA DE TRABAJO', ancho / 2, y, { align: 'center' });
  y += 10;

  /* Los datos van en dos columnas con la etiqueta en negritas, como en el
   * formato de Word. Cada renglón se parte si no cabe, para que una ubicación
   * larga no se salga de la hoja. */
  const campo = (etiqueta: string, valor: string, x: number, anchoCampo: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(etiqueta, x, y);

    const sangria = doc.getTextWidth(etiqueta) + 2;
    doc.setFont('helvetica', 'normal');
    const renglones = doc.splitTextToSize(valor || '—', anchoCampo - sangria);
    doc.text(renglones, x + sangria, y);

    return renglones.length;
  };

  const col2 = margen + util / 2 + 4;
  const anchoCol = util / 2 - 4;

  const parejas: [string, string, string, string][] = [
    ['ASUNTO:', datos.asunto, 'NO. DE MINUTA:', datos.numero],
    ['PROYECTO:', datos.proyecto, 'FECHA:', fecha(datos.creada)],
    ['UBICACIÓN:', datos.ubicacion || '—', 'HORA:', hora(datos.creada)],
  ];

  for (const [e1, v1, e2, v2] of parejas) {
    const altoIzq = campo(e1, v1, margen, anchoCol);
    const altoDer = campo(e2, v2, col2, anchoCol);
    y += Math.max(altoIzq, altoDer) * 4.2 + 2.5;
  }

  if (datos.dirigidaA || datos.plazo) {
    const extra = [
      datos.dirigidaA ? `DIRIGIDA A: ${datos.dirigidaA}` : '',
      datos.plazo ? `PLAZO: ${fecha(datos.plazo)}` : '',
    ]
      .filter(Boolean)
      .join('        ');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(extra, margen, y);
    y += 6;
  }

  y += 2;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(margen, y, ancho - margen, y);
  y += 7;

  // --- Temas tratados ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('TEMAS TRATADOS:', margen, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  const temas = doc.splitTextToSize(datos.indicacion || '', util);
  doc.text(temas, margen, y, { align: 'justify', maxWidth: util });
  y += temas.length * 4.4 + 8;

  // --- Croquis ---
  const altoPie = empresa.pie.length * 3.4 + 8;
  const espacioFirmas = 32;
  const tope = alto - margen - altoPie - espacioFirmas;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('CROQUIS:', margen, y);
  y += 4;

  /* El croquis se dibuja a mano sobre el papel impreso. Se deja el recuadro
   * con lo que sobre de hoja: si queda chico no sirve de nada, así que si no
   * cabe un mínimo razonable se pasa a la hoja siguiente. */
  if (tope - y < 40) {
    doc.addPage();
    y = margen;
  }

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.roundedRect(margen, y, util, Math.max(40, tope - y), 2, 2, 'S');

  // --- Firmas ---
  let yFirma = alto - margen - altoPie - 18;
  const anchoFirma = util / 2 - 14;

  [
    { x: margen + 6, titulo: 'ELABORÓ' },
    { x: margen + util / 2 + 8, titulo: 'DE ENTERADO' },
  ].forEach(({ x, titulo }) => {
    doc.setDrawColor(71, 85, 105);
    doc.setLineWidth(0.3);
    doc.line(x, yFirma, x + anchoFirma, yFirma);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...PIZARRA);
    doc.text(titulo, x + anchoFirma / 2, yFirma + 4, { align: 'center' });
  });

  // --- Pie membretado ---
  yFirma = alto - margen - altoPie + 2;
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(0.5);
  doc.line(margen, yFirma - 3, ancho - margen, yFirma - 3);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...GRIS);
  empresa.pie.forEach((renglon) => {
    doc.text(renglon, ancho / 2, yFirma, { align: 'center' });
    yFirma += 3.4;
  });

  return doc.output('blob');
}

/* "2026-11-07" se lee como medianoche UTC, y al mostrarla en México se
 * corre al día anterior: un plazo del 7 salía impreso como 6. Una fecha sin
 * hora se arma a mano para que sea el día que dice, en el reloj de aquí. */
const comoLocal = (iso: string): Date => {
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!soloFecha) return new Date(iso);
  return new Date(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3]));
};

const fecha = (iso: string) => {
  const d = comoLocal(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
};

const hora = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
};
