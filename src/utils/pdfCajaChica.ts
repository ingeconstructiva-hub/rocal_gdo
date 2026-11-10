import type { Reporte } from '../lib/reporte';

/* El estado de caja chica, como datos.
 *
 * El desglose de artículos de una compra va dentro de la celda del concepto,
 * en renglones aparte. Sacarlo a columnas propias obligaría a repetir la
 * fecha y el responsable en cada artículo, y el documento dejaría de leerse
 * como una lista de movimientos.
 */

const pesos = (n: number) =>
  Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const generarReporteCajaChica = (
  projectName: string,
  saldoDisponible: number,
  totalIngresos: number,
  totalEgresos: number,
  movimientos: any[]
): Reporte => {
  const filas = movimientos.map((mov) => {
    const esIngreso = mov.tipo === 'ingreso';

    const encabezado = esIngreso ? mov.concepto : 'Compra / salida de efectivo';
    const referencia = esIngreso
      ? `Ref: ${mov.tipo_deposito || 'S/R'}`
      : `Nota: ${mov.numero_nota || 'S/N'} · ${mov.unidad || 'General'}`;

    const articulos =
      !esIngreso && Array.isArray(mov.detalles_json)
        ? mov.detalles_json.map(
            (art: any) =>
              `• ${art.cantidad}x ${art.concepto} — $${pesos(Number(art.precioUnitario))} c/u = $${pesos(
                Number(art.cantidad) * Number(art.precioUnitario)
              )}`
          )
        : [];

    // Un egreso sin desglose trae su propio concepto, que si no se pierde.
    const notaSuelta = !esIngreso && mov.concepto && !mov.detalles_json ? [mov.concepto] : [];

    const concepto = [encabezado, referencia, ...articulos, ...notaSuelta].join('\n');

    return [
      new Date(mov.fecha).toLocaleDateString('es-MX'),
      concepto,
      esIngreso ? 'Ingreso' : 'Egreso',
      mov.encargado || '--',
      `${esIngreso ? '+' : '-'}$${pesos(mov.monto)}`,
    ];
  });

  return {
    titulo: 'CONSTRUCTORA ROCAL',
    subtitulo: `Estado de caja chica - ${projectName}`,
    resumen: [
      { etiqueta: 'Total de inversiones', valor: `$${pesos(totalIngresos)}`, color: '#059669' },
      { etiqueta: 'Total de gastos', valor: `$${pesos(totalEgresos)}`, color: '#ef4444' },
      {
        etiqueta: 'Saldo disponible',
        valor: `$${pesos(saldoDisponible)}`,
        color: saldoDisponible < 0 ? '#dc2626' : '#059669',
      },
    ],
    columnas: ['Fecha', 'Concepto / detalle', 'Tipo', 'Responsable', 'Importe'],
    columnasNumericas: [4],
    filas,
    totales: ['', '', '', 'SALDO DISPONIBLE:', `$${pesos(saldoDisponible)}`],
  };
};
