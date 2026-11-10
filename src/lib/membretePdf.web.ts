/* El membrete de la empresa, dibujado con jsPDF.
 *
 * El gemelo de `membreteHtml.ts`: el celular imprime el HTML y el navegador
 * arma el PDF, pero los dos tienen que sacar la misma hoja. Lo que cambie aquí
 * hay que cambiarlo allá.
 */

import type { jsPDF } from 'jspdf';
import { EMPRESAS } from './membretes';
import type { ClaveEmpresa } from './membreteHtml';

const PIZARRA: [number, number, number] = [15, 23, 42];
const GRIS: [number, number, number] = [100, 116, 139];
const AZUL: [number, number, number] = [37, 99, 235];

/* El alto del logo sale de su propio encabezado.
 *
 * Medirlo con `Image` obligaría a esperar, y armar el PDF dejaría de ser
 * inmediato. Un PNG lleva el ancho y el alto en los bytes 16 a 24, así que se
 * leen directo. Si algo no cuadra se devuelve 0 y el logo simplemente no se
 * dibuja: vale más una hoja sin logo que un reporte que no sale.
 */
const proporcionDelLogo = (dataUrl: string): number => {
  try {
    const base64 = dataUrl.split(',')[1];
    const binario = atob(base64.slice(0, 64));
    const leer = (i: number) =>
      (binario.charCodeAt(i) << 24) |
      (binario.charCodeAt(i + 1) << 16) |
      (binario.charCodeAt(i + 2) << 8) |
      binario.charCodeAt(i + 3);

    const ancho = leer(16);
    const alto = leer(20);
    return ancho > 0 ? alto / ancho : 0;
  } catch {
    return 0;
  }
};

/** Lo que hay que dejar libre abajo para que el pie no se encime. */
export const altoDelPie = (clave?: ClaveEmpresa | null): number =>
  clave ? EMPRESAS[clave].pie.length * 3.4 + 10 : 0;

/** Dibuja el encabezado y devuelve la altura en que puede empezar el contenido. */
export function dibujarMembrete(
  doc: jsPDF,
  clave: ClaveEmpresa | null | undefined,
  margen: number,
  yInicial: number
): number {
  if (!clave) return yInicial;

  const empresa = EMPRESAS[clave];
  const ancho = doc.internal.pageSize.getWidth();

  let abajoDelLogo = yInicial;
  const proporcion = proporcionDelLogo(empresa.logo);
  if (proporcion > 0) {
    const w = empresa.anchoLogo;
    const h = proporcion * w;
    doc.addImage(empresa.logo, margen, yInicial, w, h);
    abajoDelLogo = yInicial + h;
  }

  let yTexto = yInicial + 3;
  doc.setTextColor(...PIZARRA);
  empresa.encabezado.forEach((renglon, i) => {
    doc.setFont('helvetica', i === 0 ? 'bold' : 'normal');
    doc.setFontSize(i === 0 ? 9.5 : 7.5);
    doc.text(renglon, ancho - margen, yTexto, { align: 'right' });
    yTexto += i === 0 ? 5 : 3.6;
  });

  const y = Math.max(abajoDelLogo, yTexto) + 3;
  doc.setDrawColor(...AZUL);
  doc.setLineWidth(0.8);
  doc.line(margen, y, ancho - margen, y);

  return y + 7;
}

/** Dibuja la franja de contacto al ras del margen inferior de la hoja actual. */
export function dibujarPieMembrete(
  doc: jsPDF,
  clave: ClaveEmpresa | null | undefined,
  margen: number
): void {
  if (!clave) return;

  const empresa = EMPRESAS[clave];
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();

  let y = alto - margen - empresa.pie.length * 3.4 + 2;

  doc.setDrawColor(...AZUL);
  doc.setLineWidth(0.5);
  doc.line(margen, y - 3, ancho - margen, y - 3);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...GRIS);
  empresa.pie.forEach((renglon) => {
    doc.text(renglon, ancho / 2, y, { align: 'center' });
    y += 3.4;
  });
}
