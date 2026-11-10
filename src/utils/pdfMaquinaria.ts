import { corteDe } from '../lib/maquinaria';
import type { Reporte } from '../lib/reporte';

/* El reporte de maquinaria, como datos.
 *
 * Antes esto devolvía una cadena de HTML. Ahora devuelve la estructura del
 * reporte y cada plataforma lo dibuja a su manera: en celular como HTML para
 * expo-print, en navegador como PDF de verdad con jsPDF. El navegador era el
 * que no tenía archivo que compartir, y en iOS eso dejaba al usuario peleando
 * con un menú de impresora.
 */

const formatMXN = (val: number) =>
  Number(val || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const generarReporteMaquinaria = (
  projectName: string,
  totalGenerado: number,
  totalPagado: number,
  saldo: number,
  registros: any[]
): Reporte => {
  const filas = registros
    .filter((r) => r.categoria !== 'config')
    .map((g) => {
      const esAnticipo = g.categoria === 'anticipo';
      const corte = corteDe(g.tipo_renta);

      return [
        new Date(g.fecha).toLocaleDateString('es-MX'),
        g.equipo,
        g.proveedor || '--',
        String(g.categoria || '').toUpperCase(),
        g.concepto || '',
        g.asistencia_dias ? `${g.asistencia_dias} ${corte.corta}` : '--',
        g.costo_tarifa ? `$${formatMXN(g.costo_tarifa)} / ${corte.unidad}` : '--',
        !esAnticipo ? `$${formatMXN(g.monto)}` : '--',
        esAnticipo ? `$${formatMXN(g.monto)}` : '--',
        esAnticipo ? g.pagado_por || '--' : '--',
      ];
    });

  return {
    titulo: 'CONSTRUCTORA ROCAL',
    subtitulo: `Control de maquinaria - ${projectName}`,
    horizontal: true,
    resumen: [
      { etiqueta: 'Costo generado', valor: `$${formatMXN(totalGenerado)}`, color: '#ef4444' },
      { etiqueta: 'Total abonado', valor: `$${formatMXN(totalPagado)}`, color: '#059669' },
      {
        etiqueta: 'Saldo pendiente',
        valor: `$${formatMXN(saldo)}`,
        color: saldo > 0 ? '#dc2626' : '#059669',
      },
    ],
    columnas: [
      'Fecha',
      'Equipo',
      'Proveedor',
      'Tipo',
      'Concepto',
      'Cantidad',
      'Tarifa',
      'Cargo',
      'Abono',
      'Quién paga',
    ],
    // Las cifras a la derecha: alineadas se comparan de un vistazo, y este
    // reporte se lee renglon por renglon contra la factura del proveedor.
    columnasNumericas: [7, 8],
    filas,
    totales: [
      'TOTALES:',
      '',
      '',
      '',
      '',
      '',
      '',
      `$${formatMXN(totalGenerado)}`,
      `$${formatMXN(totalPagado)}`,
      '',
    ],
  };
};
