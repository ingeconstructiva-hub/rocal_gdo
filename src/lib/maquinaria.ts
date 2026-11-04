/* Los cortes de facturación de maquinaria, en un solo lugar.
 *
 * Antes la tarifa SIEMPRE era por hora y los demás cortes se sacaban de ahí
 * suponiendo una jornada fija de 8 horas y semanas de 6 días. Eso no es como
 * se renta: una pipa se cobra por viaje, un revolvedor por semana, y ninguno
 * de los dos tiene que ver con 8 horas de operación. El número que se
 * suponía terminaba discutiéndose con el proveedor.
 *
 * Ahora la tarifa es el costo de UNA unidad del corte que se haya elegido, y
 * lo capturado es cuántas de esas unidades se usaron. Sin conversiones.
 *
 * La pantalla, el PDF y el CSV leen de aquí para que los tres digan lo mismo.
 */

export type Corte = 'hora' | 'dia' | 'semana' | 'viaje' | 'mes';

type DefinicionDeCorte = {
  valor: Corte;
  /** Para el botón: "Por Viaje". */
  etiqueta: string;
  /** Una sola: "viaje". Para "Tarifa por VIAJE ($)". */
  unidad: string;
  /** Varias: "Viajes". Encabeza el campo de captura. */
  unidades: string;
  /** Cómo se abrevia junto a una cantidad: "3 hrs", "2 viajes". */
  corta: string;
};

export const CORTES: DefinicionDeCorte[] = [
  { valor: 'hora',   etiqueta: 'Por Hora',   unidad: 'hora',   unidades: 'Horas',   corta: 'hrs' },
  { valor: 'dia',    etiqueta: 'Por Día',    unidad: 'día',    unidades: 'Días',    corta: 'días' },
  { valor: 'semana', etiqueta: 'Por Semana', unidad: 'semana', unidades: 'Semanas', corta: 'sem' },
  { valor: 'viaje',  etiqueta: 'Por Viaje',  unidad: 'viaje',  unidades: 'Viajes',  corta: 'viajes' },
  { valor: 'mes',    etiqueta: 'Por Mes',    unidad: 'mes',    unidades: 'Meses',   corta: 'meses' },
];

/* El corte de una máquina, o semana si viene vacío o desconocido.
 *
 * Nunca devuelve undefined a propósito: las pantallas lo usan para armar
 * etiquetas, y un corte viejo o mal escrito tumbaría la vista entera en vez
 * de mostrarse como lo que es, un dato por corregir.
 */
export const corteDe = (valor?: string | null): DefinicionDeCorte =>
  CORTES.find((c) => c.valor === valor) ?? CORTES[2];

/* De qué fue el viaje.
 *
 * Solo aparece cuando el corte es por viaje. Sin esto, tres viajes del mismo
 * equipo en un día quedaban idénticos en la bitácora y no había forma de
 * saber cuál era la pipa de agua y cuál el acarreo de escombro.
 */
export const TIPOS_DE_VIAJE = ['Pipa', 'Material', 'Escombro', 'Agua', 'Otro'] as const;
