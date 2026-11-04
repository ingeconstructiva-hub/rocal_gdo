/* La forma de un reporte, sin decidir todavía cómo se dibuja.
 *
 * Antes cada pantalla armaba su propio HTML a mano y se lo pasaba a expo-print.
 * En celular funciona bien, pero en el navegador expo-print no devuelve ningún
 * archivo: solo abre el diálogo de impresión. Por eso en la PWA —y sobre todo
 * en iOS— no había nada que compartir, y el usuario quedaba atorado eligiendo
 * "Guardar como PDF" en un menú de impresora.
 *
 * Con los datos separados del dibujo, el mismo reporte se puede sacar de dos
 * formas: en celular como HTML para expo-print, que ya se ve bien y ya
 * comparte; en navegador como PDF de verdad, armado con jsPDF, que sí se puede
 * mandar por WhatsApp.
 */

/** Una cifra del encabezado: "Saldo pendiente: $4,673.00". */
export type CifraDeResumen = {
  etiqueta: string;
  valor: string;
  /** Para que un saldo en rojo se lea en rojo. Opcional. */
  color?: string;
};

export type Reporte = {
  /** Siempre la constructora. Encabeza la hoja. */
  titulo: string;
  /** Qué es y de qué obra: "Control de maquinaria - Ampliación C2 SPM". */
  subtitulo: string;
  resumen?: CifraDeResumen[];
  columnas: string[];
  filas: (string | number)[][];
  /** El renglón de totales, ya armado, con el mismo número de celdas. */
  totales?: (string | number)[];
  /** Con muchas columnas la hoja vertical aprieta las cifras hasta encimarlas. */
  horizontal?: boolean;
  /** Qué columnas son cifras, para alinearlas a la derecha. */
  columnasNumericas?: number[];
};

const AZUL = '#2563eb';

const escapar = (valor: string | number) =>
  String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/* El reporte dibujado como HTML, que es lo que expo-print imprime en celular.
 *
 * Se escapa todo lo que viene de la base: un concepto con un "<" tecleado por
 * alguien rompía el documento entero, y el PDF salía cortado a la mitad sin
 * ninguna señal de por qué.
 */
export const reporteAHtml = (r: Reporte): string => {
  const fecha = new Date().toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const alaDerecha = new Set(r.columnasNumericas || []);
  const alineacion = (i: number) => (alaDerecha.has(i) ? ' style="text-align:right;"' : '');

  const resumen = (r.resumen || [])
    .map(
      (c) => `
        <div class="col">
          <div class="etiqueta">${escapar(c.etiqueta)}</div>
          <div class="cifra" style="color:${c.color || '#1e293b'}">${escapar(c.valor)}</div>
        </div>`
    )
    .join('');

  const encabezados = r.columnas.map((c) => `<th>${escapar(c)}</th>`).join('');

  const filas = r.filas
    .map(
      (fila) =>
        `<tr>${fila.map((celda, i) => `<td${alineacion(i)}>${escapar(celda)}</td>`).join('')}</tr>`
    )
    .join('');

  const totales = r.totales
    ? `<tr class="totales">${r.totales
        .map((celda, i) => `<td${alineacion(i)}>${escapar(celda)}</td>`)
        .join('')}</tr>`
    : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        @page { size: A4 ${r.horizontal ? 'landscape' : 'portrait'}; margin: 15mm; }
        body { font-family: 'Helvetica', sans-serif; padding: 20px; color: #1e293b; font-size: ${r.horizontal ? 10 : 11}px; }
        .encabezado { width: 100%; margin-bottom: 25px; border-bottom: 3px solid ${AZUL}; padding-bottom: 15px; }
        .titulo { color: ${AZUL}; font-size: 20px; font-weight: bold; }
        .resumen { display: flex; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 20px; }
        .col { flex: 1; padding: 10px; text-align: center; border-right: 1px solid #e2e8f0; }
        .col:last-child { border-right: none; }
        .etiqueta { font-size: 9px; text-transform: uppercase; color: #64748B; font-weight: 800; }
        .cifra { font-size: 14px; font-weight: bold; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th { background: #0f172a; color: #fff; padding: 6px; text-align: left; font-size: 9px; text-transform: uppercase; }
        td { border: 1px solid #e2e8f0; padding: 6px; }
        .totales { background: #f1f5f9; font-weight: bold; }
      </style>
    </head>
    <body>
      <table class="encabezado">
        <tr>
          <td>
            <div class="titulo">${escapar(r.titulo)}</div>
            <div style="font-size:12px; color:#475569;">${escapar(r.subtitulo)}</div>
          </td>
          <td style="text-align:right;">Fecha: ${fecha}</td>
        </tr>
      </table>
      ${resumen ? `<div class="resumen">${resumen}</div>` : ''}
      <table>
        <thead><tr>${encabezados}</tr></thead>
        <tbody>${filas}${totales}</tbody>
      </table>
    </body>
    </html>
  `;
};
