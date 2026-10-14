/* Selector de fecha (versión navegador).
 *
 * @react-native-community/datetimepicker no funciona en la PWA: por eso las
 * fechas de obra nunca se pudieron elegir desde el navegador. Aquí se usa el
 * campo de fecha propio del navegador, que en el celular abre el mismo
 * calendario del sistema y no necesita ninguna librería.
 */

import type { PropsSelectorFecha } from './SelectorFecha';

/** La fecha en formato aaaa-mm-dd, que es lo que espera el campo del navegador. */
function aTextoDeCampo(fecha: Date): string {
  const mes = `${fecha.getMonth() + 1}`.padStart(2, '0');
  const dia = `${fecha.getDate()}`.padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

export function SelectorFecha({ valor, alCambiar, maxima }: PropsSelectorFecha) {
  // Sin fecha elegida se deja vacío: el navegador ya muestra 'dd/mm/aaaa'.
  return (
    <input
      type="date"
      value={valor ? aTextoDeCampo(valor) : ''}
      max={maxima ? aTextoDeCampo(maxima) : undefined}
      onChange={(evento) => {
        const [anio, mes, dia] = evento.target.value.split('-').map(Number);
        if (!anio || !mes || !dia) return;
        // Se arma a mediodía a propósito: con la medianoche, el cambio de huso
        // horario puede recorrer el registro al día anterior o al siguiente.
        alCambiar(new Date(anio, mes - 1, dia, 12, 0, 0));
      }}
      style={{
        width: '100%',
        boxSizing: 'border-box',
        backgroundColor: '#F8FAFC',
        border: '1px solid #E2E8F0',
        borderRadius: 10,
        padding: 12,
        marginTop: 5,
        fontSize: 15,
        fontWeight: 600,
        color: '#1E293B',
        fontFamily: 'inherit',
      }}
    />
  );
}
