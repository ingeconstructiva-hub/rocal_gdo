/* Selector de hora (versión navegador).
 *
 * datetimepicker no funciona en la PWA, así que las horas de entrada y salida
 * de maquinaria no se podían capturar desde el navegador. Aquí se usa el campo
 * de hora propio del navegador, que en el celular abre el reloj del sistema.
 */

import type { PropsSelectorHora } from './SelectorHora';

/** La hora en formato HH:MM, que es lo que espera el campo del navegador. */
function aTextoDeCampo(fecha: Date): string {
  const horas = `${fecha.getHours()}`.padStart(2, '0');
  const minutos = `${fecha.getMinutes()}`.padStart(2, '0');
  return `${horas}:${minutos}`;
}

export function SelectorHora({ valor, alCambiar, textoVacio }: PropsSelectorHora) {
  return (
    <input
      type="time"
      value={valor ? aTextoDeCampo(valor) : ''}
      aria-label={textoVacio}
      onChange={(evento) => {
        const [horas, minutos] = evento.target.value.split(':').map(Number);
        if (Number.isNaN(horas) || Number.isNaN(minutos)) return;
        // Se conserva el día que ya traía: la pantalla de maquinaria resta la
        // entrada de la salida, y cambiar el día descuadraría esa cuenta.
        const base = valor ? new Date(valor) : new Date();
        base.setHours(horas, minutos, 0, 0);
        alCambiar(base);
      }}
      style={{
        width: '100%',
        boxSizing: 'border-box',
        backgroundColor: '#FFF',
        border: '1px solid #E2E8F0',
        borderRadius: 8,
        minHeight: 46,
        padding: 12,
        fontSize: 13,
        fontWeight: 600,
        color: valor ? '#0F172A' : '#94A3B8',
        fontFamily: 'inherit',
      }}
    />
  );
}
