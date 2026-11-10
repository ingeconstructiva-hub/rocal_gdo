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
import autoTable from 'jspdf-autotable';
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
  estado?: string;
  /** Fotos de lo acordado, ya con dirección firmada. */
  evidencias?: string[];
};

function medir(dataUrl: string): Promise<{ ancho: number; alto: number }> {
  return new Promise((resolver) => {
    const img = new Image();
    img.onload = () => resolver({ ancho: img.naturalWidth, alto: img.naturalHeight });
    img.onerror = () => resolver({ ancho: 0, alto: 0 });
    img.src = dataUrl;
  });
}

/* Las fotos vienen como direcciones firmadas de Supabase, no como datos.
 * jsPDF necesita los bytes, asi que hay que bajarlas. Una que falle devuelve
 * null y se salta, sin tumbar el documento. */
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
  /* Las fotos se bajan antes de empezar. A media hoja ya no se puede
   * esperar sin dejar el recuadro de evidencias vacío. Una que falle se
   * salta: vale más una minuta con una foto de menos que ninguna. */
  const fotos = (
    await Promise.all((datos.evidencias || []).slice(0, 4).map(comoDataUrl))
  ).filter(Boolean) as string[];

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

  /* Tres espacios de firma, no una tabla.
   *
   * La minuta se imprime en una portatil y se firma ahi mismo, de pie en
   * la obra. Una tabla con ocho renglones de 6 mm deja celdas donde no cabe
   * una firma de verdad, y ocho espacios para tres personas es papel
   * desperdiciado. Tres lineas anchas, con el nombre y el cargo debajo para
   * escribirlos a mano, es lo que se usa. */
  const FIRMAS = 3;
  const altoFirmas = 32;

  const tope = alto - margen - altoPie - altoFirmas;
  const anchoColumna = util / 2 - 3;
  const xEvidencias = margen + util / 2 + 3;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...PIZARRA);
  doc.text('TEMAS TRATADOS:', margen, y);
  doc.text('EVIDENCIAS:', xEvidencias, y);
  y += 5;

  const altoCuerpo = Math.max(45, tope - y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const temas = doc.splitTextToSize(datos.indicacion || '', anchoColumna - 4);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.roundedRect(margen, y, anchoColumna, altoCuerpo, 2, 2, 'S');
  doc.text(temas, margen + 2, y + 5, { align: 'justify', maxWidth: anchoColumna - 4 });

  doc.roundedRect(xEvidencias, y, anchoColumna, altoCuerpo, 2, 2, 'S');

  /* Las fotos se reparten el recuadro COMPLETO segun cuantas sean.
   *
   * Antes siempre se dividia en dos renglones, asi que con una o dos fotos
   * quedaba media caja vacia y la evidencia salia del tamano de una estampa.
   *
   * El recuadro es angosto y alto, y una foto de obra es mas ancha que alta:
   * por eso hasta dos van apiladas, usando todo el ancho. De tres en adelante
   * ya no cabe de otra forma y van en rejilla. */
  if (fotos.length > 0) {
    const hueco = 2;
    const relleno = 3;
    const columnas = fotos.length <= 2 ? 1 : 2;
    const renglones = Math.ceil(fotos.length / columnas);

    const anchoFoto = (anchoColumna - relleno * 2 - hueco * (columnas - 1)) / columnas;
    const altoFoto = (altoCuerpo - relleno * 2 - hueco * (renglones - 1)) / renglones;

    for (let i = 0; i < fotos.length; i++) {
      const { ancho: aImg, alto: aAlt } = await medir(fotos[i]);
      if (aImg === 0) continue;

      const columna = i % columnas;
      const renglon = Math.floor(i / columnas);

      const escala = Math.min(anchoFoto / aImg, altoFoto / aAlt);
      const w = aImg * escala;
      const h = aAlt * escala;

      const xFoto = xEvidencias + relleno + columna * (anchoFoto + hueco) + (anchoFoto - w) / 2;
      const yFoto = y + relleno + renglon * (altoFoto + hueco) + (altoFoto - h) / 2;

      doc.addImage(fotos[i], xFoto, yFoto, w, h);
    }
  }

  y += altoCuerpo + 14;

  /* Las tres firmas, repartidas a lo ancho. La primera trae el nombre de a
   * quien va dirigida la minuta, que es quien queda enterado por
   * definicion; las otras dos quedan en blanco para quien haya estado. */
  const anchoFirma = (util - 16) / FIRMAS;

  for (let i = 0; i < FIRMAS; i++) {
    const x = margen + i * (anchoFirma + 8);

    doc.setDrawColor(71, 85, 105);
    doc.setLineWidth(0.3);
    doc.line(x, y, x + anchoFirma, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...GRIS);
    doc.text('NOMBRE', x + anchoFirma / 2, y + 4, { align: 'center' });
    doc.text('CARGO', x + anchoFirma / 2, y + 8.5, { align: 'center' });

    if (i === 0 && datos.dirigidaA) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...PIZARRA);
      doc.text(datos.dirigidaA, x + anchoFirma / 2, y - 2, { align: 'center' });
    }
  }

  y += 14;
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

/* Todas las minutas de la obra en una hoja.
 *
 * Es lo que se lleva a la junta de avance: de un vistazo se ve qué quedó
 * pendiente y desde cuándo. Por eso va en tabla y no una minuta por página,
 * y por eso lo pendiente se marca en rojo: una lista donde todo se ve igual
 * no sirve para decidir nada.
 */
export async function crearPdfReporteMinutas(
  minutas: DatosDeMinuta[],
  clave: Empresa['clave'],
  proyecto: string
): Promise<Blob> {
  const empresa = EMPRESAS[clave];

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const margen = 15;

  const { ancho: aLogo, alto: altoLogo } = await medir(empresa.logo);
  let y = 12;
  let abajoDelLogo = y;

  if (aLogo > 0) {
    const w = empresa.anchoLogo;
    const h = (altoLogo / aLogo) * w;
    doc.addImage(empresa.logo, margen, y, w, h);
    abajoDelLogo = y + h;
  }

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
  y += 9;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('CONTROL DE MINUTAS', ancho / 2, y, { align: 'center' });
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(proyecto, ancho / 2, y, { align: 'center' });
  y += 5;

  const pendientes = minutas.filter((m) => m.estado !== 'atendida').length;
  doc.setFontSize(8);
  doc.text(
    `${minutas.length} minutas · ${pendientes} pendientes · al ${new Date().toLocaleDateString('es-MX')}`,
    ancho / 2,
    y,
    { align: 'center' }
  );
  y += 6;

  const altoPie = empresa.pie.length * 3.4 + 10;

  autoTable(doc, {
    startY: y,
    head: [['No.', 'Fecha', 'Asunto / indicación', 'Dirigida a', 'Plazo', 'Estado']],
    body: minutas.map((m) => [
      m.numero,
      fecha(m.creada),
      `${m.asunto}\n${m.indicacion}`,
      m.dirigidaA || '—',
      m.plazo ? fecha(m.plazo) : '—',
      m.estado === 'atendida' ? 'Atendida' : 'Pendiente',
    ]),
    margin: { left: margen, right: margen, bottom: altoPie + 6 },
    styles: { fontSize: 7.5, cellPadding: 1.8, textColor: [30, 41, 59], valign: 'top' },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 7 },
    alternateRowStyles: { fillColor: [250, 251, 252] },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 20 },
      3: { cellWidth: 28 },
      4: { cellWidth: 20 },
      5: { cellWidth: 18, halign: 'center' },
    },
    // Lo pendiente salta a la vista: es lo unico que hay que accionar.
    didParseCell: (d: any) => {
      if (d.section === 'body' && d.column.index === 5 && d.cell.raw === 'Pendiente') {
        d.cell.styles.textColor = [185, 28, 28];
        d.cell.styles.fontStyle = 'bold';
      }
    },
    rowPageBreak: 'avoid',
  });

  /* El pie membretado va en TODAS las hojas: un reporte de varias paginas
   * que solo trae membrete en la primera deja de ser papel de la empresa en
   * cuanto alguien separa las hojas. */
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    let yPie = alto - margen - altoPie + 4;

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

    doc.text(`Hoja ${p} de ${paginas}`, ancho - margen, alto - margen + 2, { align: 'right' });
  }

  return doc.output('blob');
}
