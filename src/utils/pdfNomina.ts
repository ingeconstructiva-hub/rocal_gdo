import {
  calcularTotalFinal,
  descuentoTotal,
  diasFaltados,
  HORAS_SEMANA,
  montoHorasExtra,
} from '../lib/nomina';
import type { Reporte } from '../lib/reporte';

/* La raya de la semana, como datos.
 *
 * Las cuentas salen de lib/nomina, las mismas que muestra la pantalla. Antes
 * esta plantilla tenía su propia versión y no cuadraba con la app: el PDF que
 * se le entregaba al trabajador decía un número y la pantalla otro.
 */

const pesos = (n: number) =>
  Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const filaDeTrabajador = (w: any) => {
  const faltas = diasFaltados(w);
  const descuentos = descuentoTotal(w);
  const extra = montoHorasExtra(w);

  /* Las extras pasaron de nota bajo el nombre a columna propia: se pagan
   * aparte del sueldo y quien revisa la raya las busca como un numero, no
   * dentro de una frase. El motivo si se queda abajo, porque explica. */
  const notas = [
    w.reason ? `Descuento: ${w.reason}` : '',
    extra > 0 && (w.extraHours || w.extraReason)
      ? `Extras: ${w.extraHours || '?'} hrs${w.extraReason ? ` (${w.extraReason})` : ''}`
      : '',
  ].filter(Boolean);

  return [
    [w.name_worker, w.role, ...notas].filter(Boolean).join('\n'),
    `$${pesos(w.weekly_salary)}`,
    faltas > 0 ? String(faltas) : '-',
    descuentos > 0 ? `-$${pesos(descuentos)}` : '-',
    extra > 0 ? `+$${pesos(extra)}` : '-',
    `$${pesos(calcularTotalFinal(w))}`,
    '',
  ];
};

const COLUMNAS = [
  'Trabajador / puesto',
  'Sueldo base',
  'Faltas',
  'Descuentos',
  'Pago de extras',
  'Total a pagar',
  'Firma de recibido',
];

export const generarReporteNomina = (workers: any[], weekLabel: string): Reporte => {
  const totalBase = workers.reduce((s, w) => s + Number(w.weekly_salary || 0), 0);
  const totalDescuentos = workers.reduce((s, w) => s + descuentoTotal(w), 0);
  const totalFinal = workers.reduce((s, w) => s + calcularTotalFinal(w), 0);
  const totalExtras = workers.reduce((s, w) => s + montoHorasExtra(w), 0);

  return {
    titulo: 'CONSTRUCTORA ROCAL',
    subtitulo: `Nómina semanal\nSemana: ${weekLabel}`,
    resumen: [
      { etiqueta: 'Suma de sueldos base', valor: `$${pesos(totalBase)}`, color: '#1e293b' },
      { etiqueta: 'Descuentos', valor: `$${pesos(totalDescuentos)}`, color: '#ef4444' },
      { etiqueta: 'Pago de extras', valor: `$${pesos(totalExtras)}`, color: '#047857' },
      { etiqueta: 'Total a pagar', valor: `$${pesos(totalFinal)}`, color: '#059669' },
    ],
    columnas: COLUMNAS,
    columnasNumericas: [1, 3, 4, 5],
    filas: workers.map(filaDeTrabajador),
    totales: ['', '', '', 'TOTALES:', `+$${pesos(totalExtras)}`, `$${pesos(totalFinal)}`, ''],
  };
};

/* El historial: varias semanas en un solo documento, cada una con su corte.
 *
 * Es lo que se archiva al cerrar el mes, así que cada semana necesita su
 * propio subtotal: un total global no sirve para cotejar contra lo que se
 * entregó cada viernes.
 *
 * Aquí los datos vienen de payroll_records, con el trabajador anidado, y NO
 * en la misma forma que usa la pantalla. Se leen los valores ya guardados en
 * vez de recalcularlos: lo que se entregó esa semana es lo que quedó escrito,
 * aunque después se haya corregido el sueldo del trabajador.
 */
export const generarReporteHistorial = (semanas: any[], obra: string): Reporte => {
  let granTotal = 0;

  const grupos = (semanas || []).map((s: any) => {
    const registros = s.registros || [];
    const totalSemana = Number(s.total || 0);
    granTotal += totalSemana;

    const filas = registros.map((r: any) => {
      const trabajador = r.workers || {};
      const faltas = Number(r.days_absent || 0);
      const descuentos = Number(r.deduction_amount || 0);

      /* En el historial el pago de extras no viene guardado aparte: solo las
       * horas. Se reconstruye con la tarifa del trabajador, que es como se
       * calculo en su momento. Sin sueldo base no hay de donde sacarlo y se
       * deja en blanco antes que inventar una cifra. */
      const extras =
        Number(r.extra_hours || 0) > 0 && Number(trabajador.weekly_salary || 0) > 0
          ? (Number(trabajador.weekly_salary) / HORAS_SEMANA) * Number(r.extra_hours)
          : 0;

      const notas = [
        r.extra_hours > 0
          ? `Extras: ${r.extra_hours} hrs${r.extra_reason ? ` (${r.extra_reason})` : ''}`
          : '',
      ].filter(Boolean);

      return [
        [trabajador.name_worker || 'Sin nombre', trabajador.role || '', ...notas]
          .filter(Boolean)
          .join('\n'),
        `$${pesos(trabajador.weekly_salary)}`,
        faltas > 0 ? String(faltas) : '-',
        descuentos > 0 ? `-$${pesos(descuentos)}` : '-',
        extras > 0 ? `+$${pesos(extras)}` : '-',
        `$${pesos(r.final_salary)}`,
        '',
      ];
    });

    return {
      titulo: s.etiqueta || s.semana || 'Semana sin definir',
      filas,
      subtotal: ['', '', '', '', 'Subtotal de la semana:', `$${pesos(totalSemana)}`, ''],
    };
  });

  return {
    titulo: 'CONSTRUCTORA ROCAL',
    subtitulo: `Historial de nómina - ${obra}`,
    columnas: COLUMNAS,
    columnasNumericas: [1, 3, 4, 5],
    filas: [],
    grupos,
    totales: ['', '', '', '', 'GRAN TOTAL:', `$${pesos(granTotal)}`, ''],
  };
};
