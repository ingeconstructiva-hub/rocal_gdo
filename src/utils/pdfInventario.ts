import type { Reporte } from '../lib/reporte';

/* El reporte de destajos, como datos.
 *
 * Se lee por semana, no por renglón suelto: lo que se revisa es cuánto se le
 * debe al maestro de esa semana. Por eso va en grupos con su subtotal, igual
 * que antes, nada más que ahora cada plataforma lo dibuja por su lado.
 */

const pesos = (n: number) =>
  `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

/* Convierte una etiqueta de semana en fecha para poder ordenarla.
 *
 * Las etiquetas son texto del estilo "28 SEP - 2 OCT 2026", así que ordenarlas
 * alfabéticamente pone "12 OCT" antes que "5 OCT". Se lee la fecha de cierre,
 * que es la que trae el año.
 */
const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

const fechaDeSemana = (etiqueta: string): number => {
  const cierre = (etiqueta || '').split('-').pop()?.trim().toUpperCase() || '';
  const partes = cierre.match(/^(\d{1,2})\s+([A-ZÁÉÍÓÚ]{3})\s+(\d{4})$/);
  if (!partes) return -Infinity;

  const mes = MESES.indexOf(partes[2]);
  if (mes === -1) return -Infinity;

  return new Date(Number(partes[3]), mes, Number(partes[1])).getTime();
};

export const generarReporteInventario = (
  items: any[],
  projectName: string = 'Obra sin nombre',
  responsable: string = ''
): Reporte => {
  const porSemana: Record<string, any[]> = {};
  for (const item of items) {
    const semana = item.week_label || 'Semana sin definir';
    if (!porSemana[semana]) porSemana[semana] = [];
    porSemana[semana].push(item);
  }

  let granTotal = 0;

  const grupos = Object.entries(porSemana)
    .sort(([a], [b]) => fechaDeSemana(b) - fechaDeSemana(a))
    .map(([semana, registros]) => {
      let subtotal = 0;

      const filas = registros.map((item) => {
        const importe = Number(item.quantity || 0) * Number(item.unit_price || 0);
        subtotal += importe;

        /* Quién recibe y quién solicita van bajo el concepto, no en columnas
         * propias: son nombres largos y en una hoja vertical se comen el
         * ancho que necesitan las cifras. */
        const personas = [
          item.in_charge ? `Recibe: ${item.in_charge}` : '',
          item.requested_by ? `Solicita: ${item.requested_by}` : '',
        ]
          .filter(Boolean)
          .join(' | ');

        return [
          personas ? `${item.name}\n${personas}` : item.name,
          String(item.quantity ?? ''),
          item.unit || '',
          pesos(item.unit_price),
          pesos(importe),
          '',
        ];
      });

      granTotal += subtotal;

      return {
        titulo: semana,
        filas,
        subtotal: ['', '', '', `Subtotal ${semana}:`, pesos(subtotal), ''],
      };
    });

  const encabezado = [
    responsable ? `Responsable: ${responsable}` : '',
    `Registros: ${items.length}`,
  ]
    .filter(Boolean)
    .join('  ·  ');

  return {
    titulo: 'CONSTRUCTORA ROCAL',
    subtitulo: `Control de destajos y materiales - ${projectName}${encabezado ? `\n${encabezado}` : ''}`,
    columnas: ['Concepto / asignación', 'Cant.', 'Unid.', 'P.U.', 'Importe', 'Firma / Vo.Bo.'],
    columnasNumericas: [3, 4],
    filas: [],
    grupos,
    totales: ['', '', '', 'GRAN TOTAL ACUMULADO:', pesos(granTotal), ''],
  };
};
