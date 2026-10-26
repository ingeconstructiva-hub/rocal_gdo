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

/* La semana de raya va de lunes a sabado.
 *
 * Antes week_start guardaba la fecha de hoy, asi que con el indice unico
 * (worker_id, week_start) cada dia nacia un registro distinto y no habia
 * manera de acumular por semana: la columna decia "semana" pero guardaba dias.
 */
export const inicioDeSemana = (fecha: Date = new Date()): string => {
  const d = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const corrimiento = (d.getDay() + 6) % 7; // lunes = 0, domingo = 6
  d.setDate(d.getDate() - corrimiento);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
};

/** "13 al 18 de oct de 2026", para encabezar cada corte. */
export const etiquetaSemana = (inicio: string): string => {
  const [anio, mes, dia] = inicio.split('-').map(Number);
  if (!anio || !mes || !dia) return inicio;
  const lunes = new Date(anio, mes - 1, dia);
  const sabado = new Date(anio, mes - 1, dia + 5);
  const soloDia = (f: Date) => f.getDate();
  const mesCorto = (f: Date) => f.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '');
  return lunes.getMonth() === sabado.getMonth()
    ? `${soloDia(lunes)} al ${soloDia(sabado)} de ${mesCorto(lunes)} de ${lunes.getFullYear()}`
    : `${soloDia(lunes)} de ${mesCorto(lunes)} al ${soloDia(sabado)} de ${mesCorto(sabado)} de ${lunes.getFullYear()}`;
};

/* Los seis dias de la semana con su numero.
 *
 * La lista mostraba solo "L M M J V S" y no habia forma de saber a que fechas
 * correspondian: con el corte semanal eso importa, porque quien pasa lista el
 * jueves tiene que ver que esta marcando el jueves y no otro dia.
 */
export const diasDeSemana = (inicio: string) => {
  const [anio, mes, dia] = inicio.split('-').map(Number);
  const letras = ['L', 'M', 'M', 'J', 'V', 'S'];
  const hoy = new Date();

  return letras.map((letra, i) => {
    const f = new Date(anio, mes - 1, dia + i);
    return {
      letra,
      dia: f.getDate(),
      esHoy:
        f.getFullYear() === hoy.getFullYear() &&
        f.getMonth() === hoy.getMonth() &&
        f.getDate() === hoy.getDate(),
    };
  });
};

/** "26 OCT - 31 OCT 2026", para la barra que encabeza la semana en curso. */
export const rangoSemana = (inicio: string): string => {
  const [anio, mes, dia] = inicio.split('-').map(Number);
  if (!anio || !mes || !dia) return inicio;
  const lunes = new Date(anio, mes - 1, dia);
  const sabado = new Date(anio, mes - 1, dia + 5);
  const mesCorto = (f: Date) =>
    f.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '').toUpperCase();
  return `${lunes.getDate()} ${mesCorto(lunes)} - ${sabado.getDate()} ${mesCorto(sabado)} ${sabado.getFullYear()}`;
};
