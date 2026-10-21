/* El calculo de la nomina vive aqui, no en la pantalla.
 *
 * El motivo: el PDF que firman los trabajadores tenia su propia copia de las
 * cuentas, y no coincidia con lo que se ve en Lista. Pagaba el sabado como dia
 * completo, no contaba las horas extra y leia el descuento de un campo que no
 * existe ('extraDeduction' en vez de 'discount'), asi que la deduccion
 * capturada a mano nunca aparecia. Una hoja de raya que no cuadra con la app
 * es peor que no tenerla.
 */

/** 5 dias de 8 horas mas el sabado de 5. */
export const HORAS_SEMANA = 45;

/** Lunes a sabado. */
export const DIAS_SEMANA = 6;

export interface TrabajadorNomina {
  weekly_salary: number;
  attendance?: boolean[];
  extraHours?: string | number;
  discount?: string | number;
}

export const tarifaPorHora = (w: TrabajadorNomina) =>
  Number(w.weekly_salary || 0) / HORAS_SEMANA;

/** Horas devengadas segun los dias asistidos: 8 de lunes a viernes, 5 el sabado. */
export const horasTrabajadas = (w: TrabajadorNomina) => {
  const asistencia = w.attendance || [];
  let horas = 0;
  for (let i = 0; i < 5; i++) if (asistencia[i]) horas += 8;
  if (asistencia[5]) horas += 5;
  return horas;
};

export const diasAsistidos = (w: TrabajadorNomina) =>
  (w.attendance || []).filter(Boolean).length;

export const diasFaltados = (w: TrabajadorNomina) =>
  DIAS_SEMANA - diasAsistidos(w);

/** Las horas extra se pagan al doble de la tarifa ordinaria integrada. */
export const montoHorasExtra = (w: TrabajadorNomina) =>
  Number(w.extraHours || 0) * tarifaPorHora(w) * 2;

/** Lo que se deja de pagar: las faltas mas el descuento capturado a mano. */
export const descuentoTotal = (w: TrabajadorNomina) =>
  Number(w.weekly_salary || 0) - horasTrabajadas(w) * tarifaPorHora(w) + Number(w.discount || 0);

export const calcularTotalFinal = (w: TrabajadorNomina) =>
  horasTrabajadas(w) * tarifaPorHora(w) + montoHorasExtra(w) - Number(w.discount || 0);
