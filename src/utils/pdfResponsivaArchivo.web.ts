/* La responsiva como archivo PDF, armada en el navegador.
 *
 * No pasa por el generador de reportes porque no es una tabla: es una carta
 * con firmas autógrafas, el anexo del INE y el sello de certificación. El
 * texto legal se copia tal cual del documento que ya se emitía; cambiarle una
 * palabra le cambiaría el valor al papel.
 */

import { jsPDF } from 'jspdf';

const PIZARRA: [number, number, number] = [30, 41, 59];
const GRIS: [number, number, number] = [100, 116, 139];

/** Mide una imagen para encajarla sin deformarla. */
function medir(dataUrl: string): Promise<{ ancho: number; alto: number }> {
  return new Promise((resolver) => {
    const img = new Image();
    img.onload = () => resolver({ ancho: img.naturalWidth, alto: img.naturalHeight });
    img.onerror = () => resolver({ ancho: 0, alto: 0 });
    img.src = dataUrl;
  });
}

/* Las firmas y el INE vienen como direcciones firmadas de Supabase, no como
 * datos. jsPDF necesita los bytes, así que hay que bajarlas primero. Una que
 * falle no tumba el documento: se deja el espacio en blanco, como cuando no
 * hay firma. */
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

export async function crearPdfResponsiva(vale: any): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const margen = 20;
  const util = ancho - margen * 2;
  let y = margen;

  /* Antes de dibujar nada se bajan las imágenes: a media hoja ya no se puede
   * esperar sin dejar huecos donde iban las firmas. */
  const [firmaEntrega, firmaRecibe, ineFrente, ineReverso] = await Promise.all([
    comoDataUrl(vale.firma_entrega_url),
    comoDataUrl(vale.firma_recibe_url),
    comoDataUrl(vale.ine_url),
    comoDataUrl(vale.ine_reverso_url),
  ]);

  /** Escribe un párrafo justificado y devuelve cuánto bajó. */
  const parrafo = (texto: string, tamano = 10, estilo: 'normal' | 'bold' = 'normal') => {
    doc.setFont('helvetica', estilo);
    doc.setFontSize(tamano);
    doc.setTextColor(...PIZARRA);
    const renglones = doc.splitTextToSize(texto, util);
    doc.text(renglones, margen, y, { align: 'justify', maxWidth: util });
    y += renglones.length * (tamano * 0.42) + 3;
  };

  /** Deja espacio o pasa de hoja si lo que sigue no cabe. */
  const asegurar = (milimetros: number) => {
    if (y + milimetros > alto - margen) {
      doc.addPage();
      y = margen;
    }
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...PIZARRA);
  for (const renglon of [
    String(vale.fecha_prestamo || ''),
    'San Pablo del Monte, Tlaxcala',
    'ASUNTO: RESPONSIVA DE EQUIPAMIENTO',
    `N. DE RESPONSIVA: ${vale.n_responsiva || ''}`,
  ]) {
    doc.text(renglon, ancho - margen, y, { align: 'right' });
    y += 4.5;
  }

  y += 10;
  parrafo('A QUIEN CORRESPONDA', 11, 'bold');
  parrafo('PARA FINES ADMINISTRATIVOS Y LEGALES', 11, 'bold');
  parrafo('PRESENTE:', 11, 'bold');

  y += 5;
  parrafo(
    `En referencia al proyecto "${vale.obra_nombre || ''}" en el que en lo sucesivo a través de la carta de acuerdos de trabajo ${vale.n_convenio || ''} se establece que el responsable de la ejecución de los trabajos será el ${vale.nombre_recibe || ''}, el cual en mutuo acuerdo con el representante de la empresa acuerdan entregar en ÓPTIMAS CONDICIONES LOS EQUIPOS para la realización de los trabajos que a continuación se describen:`
  );

  y += 3;
  const equipos = doc.splitTextToSize(String(vale.equipos_detalle || ''), util - 8);
  const altoCaja = equipos.length * 4.4 + 8;
  asegurar(altoCaja);
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margen, y, util, altoCaja, 2, 2, 'FD');
  doc.setFont('courier', 'normal');
  doc.setFontSize(9);
  doc.text(equipos, margen + 4, y + 6);
  y += altoCaja + 6;

  parrafo(
    'El receptor asume la RESPONSABILIDAD Y EL CUIDADO DE DICHO EQUIPO Y HERRAMIENTAS y se compromete a utilizarlo con un uso estrictamente laboral. Cualquier problema o fallo deberá ser informado de inmediato para su renovación o mantenimiento. En caso de que los equipos sean extraviados o dañados por el mal uso, estos tendrán que reponerse por el encargado, aceptando que se reciben listos para usarse y sin deterioros significativos.'
  );

  // --- Firmas ---
  asegurar(50);
  y += 14;
  const anchoCol = util / 2 - 6;

  const columnaDeFirma = async (
    x: number,
    firma: string | null,
    titulo: string,
    nombre: string,
    nota: string,
    colorNota: [number, number, number]
  ) => {
    const baseLinea = y + 26;

    if (firma) {
      const { ancho: aImg, alto: aAlt } = await medir(firma);
      if (aImg > 0) {
        const escala = Math.min(anchoCol / aImg, 24 / aAlt);
        const w = aImg * escala;
        const h = aAlt * escala;
        doc.addImage(firma, x + (anchoCol - w) / 2, baseLinea - h - 1, w, h);
      }
    }

    doc.setDrawColor(71, 85, 105);
    doc.setLineWidth(0.3);
    doc.line(x, baseLinea, x + anchoCol, baseLinea);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...PIZARRA);
    doc.text(titulo, x + anchoCol / 2, baseLinea + 5, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(String(nombre || ''), x + anchoCol / 2, baseLinea + 10, { align: 'center' });

    doc.setFont('courier', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...colorNota);
    doc.text(nota, x + anchoCol / 2, baseLinea + 14.5, { align: 'center' });
  };

  await columnaDeFirma(margen, firmaEntrega, 'ENTREGA', vale.nombre_entrega, 'EMISOR AUTORIZADO', GRIS);
  await columnaDeFirma(
    margen + util / 2 + 6,
    firmaRecibe,
    'RECIBE Y ACEPTA',
    vale.nombre_recibe,
    'FIRMA AUTÓGRAFA DIGITAL',
    [22, 163, 74]
  );
  y += 44;

  // --- Anexo del INE ---
  if (ineFrente || ineReverso) {
    asegurar(70);
    doc.setDrawColor(148, 163, 184);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(margen, y, ancho - margen, y);
    doc.setLineDashPattern([], 0);
    y += 6;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.text('ANEXO: IDENTIFICACIÓN OFICIAL DE QUIEN RECIBE', ancho / 2, y, { align: 'center' });
    y += 6;

    const caras = [
      { img: ineFrente, lado: 'FRENTE' },
      { img: ineReverso, lado: 'REVERSO' },
    ].filter((c) => c.img);

    const anchoCara = Math.min(70, (util - 10) / caras.length);
    let x = (ancho - (anchoCara * caras.length + 10 * (caras.length - 1))) / 2;
    let altoMaximo = 0;

    for (const cara of caras) {
      const { ancho: aImg, alto: aAlt } = await medir(cara.img!);
      if (aImg > 0) {
        const escala = Math.min(anchoCara / aImg, 45 / aAlt);
        const w = aImg * escala;
        const h = aAlt * escala;
        doc.addImage(cara.img!, x + (anchoCara - w) / 2, y, w, h);
        altoMaximo = Math.max(altoMaximo, h);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...GRIS);
        doc.text(cara.lado, x + anchoCara / 2, y + h + 3.5, { align: 'center' });
      }
      x += anchoCara + 10;
    }

    y += altoMaximo + 8;
    doc.setFontSize(8);
    doc.setTextColor(...GRIS);
    doc.text(
      `Documento cotejado al momento de la entrega. ${vale.nombre_recibe || ''}`,
      ancho / 2,
      y,
      { align: 'center' }
    );
    y += 8;
  }

  // --- Sello ---
  asegurar(26);
  const sello = [
    'SELLO DE CERTIFICACIÓN DIGITAL CRIPTOGRÁFICA MUTUA',
    `HASH DE AUDITORÍA: ${vale.token_firma || 'PENDIENTE'}`,
    `UUID DEL REGISTRO: ${vale.id || ''}`,
    'Estado de Validación: CERTIFICADO - EXPEDIENTE CON INTERFAZ DE FIRMAS HISTÓRICAS PERMANENTES',
  ];
  doc.setFont('courier', 'normal');
  doc.setFontSize(7);
  const renglonesSello = sello.flatMap((s) => doc.splitTextToSize(s, util - 8));
  const altoSello = renglonesSello.length * 3.4 + 12;

  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.setLineDashPattern([1, 1], 0);
  doc.roundedRect(margen, y, util, altoSello, 2, 2, 'FD');
  doc.setLineDashPattern([], 0);

  doc.setTextColor(...GRIS);
  doc.text(renglonesSello, margen + 4, y + 5);
  doc.text(`Timestamp de Sello: ${vale.fecha_firma || 'N/A'}`, margen + 4, y + altoSello - 4);
  y += altoSello + 10;

  asegurar(12);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(...GRIS);
  doc.text(
    '"Porque toda casa tiene su constructor, pero el constructor de todo es Dios." - Hebreos 3:4',
    ancho / 2,
    y,
    { align: 'center' }
  );

  return doc.output('blob');
}
