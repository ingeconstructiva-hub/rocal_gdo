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

  /* Temas tratados y croquis van LADO A LADO, como en el formato de Word:
   * lo que se acordó a la izquierda y el dibujo a la derecha, para poder
   * señalar sobre el croquis mientras se lee el acuerdo. Apilarlos partía esa
   * relación y dejaba el croquis en otra página.
   */
  const altoPie = empresa.pie.length * 3.4 + 8;
  const altoFirmas = 6 + 5 * 7 + 12;
  const tope = alto - margen - altoPie - altoFirmas;
  const anchoColumna = util / 2 - 3;
  const xCroquis = margen + util / 2 + 3;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...PIZARRA);
  doc.text('TEMAS TRATADOS:', margen, y);
  doc.text('CROQUIS:', xCroquis, y);
  y += 5;

  const altoCuerpo = Math.max(45, tope - y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const temas = doc.splitTextToSize(datos.indicacion || '', anchoColumna - 4);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.roundedRect(margen, y, anchoColumna, altoCuerpo, 2, 2, 'S');
  doc.text(temas, margen + 2, y + 5, { align: 'justify', maxWidth: anchoColumna - 4 });

  // El croquis se dibuja a mano sobre el papel impreso.
  doc.roundedRect(xCroquis, y, anchoColumna, altoCuerpo, 2, 2, 'S');

  y += altoCuerpo + 6;

  /* La lista de asistentes, igual que en el formato: quien estuvo, con qué
   * cargo, y su firma. Cinco renglones, que es lo que trae la plantilla. */
  const anchos = [util * 0.42, util * 0.28, util * 0.3];

  const titulos = ['NOMBRE Y APELLIDO', 'CARGO', 'FIRMA'];

  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.3);

  let x = margen;
  anchos.forEach((ancho) => {
    doc.rect(x, y, ancho, 6, 'FD');
    x += ancho;
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...PIZARRA);
  x = margen;
  titulos.forEach((titulo, i) => {
    doc.text(titulo, x + anchos[i] / 2, y + 4, { align: 'center' });
    x += anchos[i];
  });
  y += 6;

  for (let fila = 0; fila < 5; fila++) {
    x = margen;
    for (const ancho of anchos) {
      doc.rect(x, y, ancho, 7, 'S');
      x += ancho;
    }
    y += 7;
  }

  // --- Pie membretado ---
  let yPie = alto - margen - altoPie + 2;
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(0.5);
  doc.line(margen, yPie - 3, ancho - margen, yPie - 3);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...GRIS);
  empresa.pie.forEach((renglon) => {
    doc.text(renglon, ancho / 2, yPie, { align: 'center' });
    yPie += 3.4;
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
