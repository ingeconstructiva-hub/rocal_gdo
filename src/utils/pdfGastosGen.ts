import type { Reporte } from '../lib/reporte';

/* Los gastos generales de la obra, como datos.
 *
 * La categoría, el proveedor y la cantidad van bajo el concepto en vez de en
 * columnas propias: son tres datos cortos que juntos explican el gasto, y en
 * columnas aparte dejaban al concepto sin ancho para leerse.
 */

const pesos = (n: number) =>
  Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });

export const generarReporteGastos = (
  projectName: string,
  totalGastado: number,
  totalDeuda: number,
  filtroActual: string,
  gastos: any[]
): Reporte => {
  const filas = gastos.map((g) => {
    const detalle = [
      g.categoria,
      g.proveedor && g.proveedor !== 'No especificado' ? g.proveedor : '',
      g.cantidad ? `${g.cantidad} ${g.unidad || ''}`.trim() : '',
    ]
      .filter(Boolean)
      .join(' · ');

    return [
      new Date(g.fecha).toLocaleDateString('es-MX'),
      detalle ? `${g.concepto}\n${detalle}` : g.concepto,
      g.estado_pago === 'credito' ? 'CRÉDITO' : 'PAGADO',
      `$${pesos(g.monto)}`,
    ];
  });

  const filtro =
    filtroActual === 'todos' ? 'Todas las categorías' : String(filtroActual || '').toUpperCase();

  return {
    titulo: 'CONSTRUCTORA ROCAL',
    subtitulo: `Gastos generales - ${projectName}\n${filtro}`,
    resumen: [
      { etiqueta: 'Total gastado', valor: `$${pesos(totalGastado)}`, color: '#1e293b' },
      {
        etiqueta: 'Por pagar (crédito)',
        valor: `$${pesos(totalDeuda)}`,
        color: totalDeuda > 0 ? '#dc2626' : '#059669',
      },
    ],
    columnas: ['Fecha', 'Concepto', 'Estado', 'Importe'],
    columnasNumericas: [3],
    filas,
    totales: ['', '', 'TOTAL:', `$${pesos(totalGastado)}`],
  };
};
