/* Selector de fecha (versión celular).
 *
 * Usa el calendario nativo del sistema. La versión de navegador vive en
 * SelectorFecha.web.tsx, porque @react-native-community/datetimepicker no
 * funciona en la PWA y ahí hay que usar el campo de fecha propio del navegador.
 */

import DateTimePicker from '@react-native-community/datetimepicker';
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

export type PropsSelectorFecha = {
  valor: Date;
  alCambiar: (fecha: Date) => void;
  /** Fecha máxima que se puede elegir. Para registros atrasados, hoy. */
  maxima?: Date;
};

export function SelectorFecha({ valor, alCambiar, maxima }: PropsSelectorFecha) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <TouchableOpacity style={estilos.campo} onPress={() => setAbierto(true)}>
        <Feather name="calendar" size={18} color="#64748B" style={{ marginRight: 10 }} />
        <Text style={estilos.texto}>{valor.toLocaleDateString('es-MX')}</Text>
      </TouchableOpacity>

      {abierto && (
        <DateTimePicker
          value={valor}
          mode="date"
          display="default"
          maximumDate={maxima}
          onChange={(_evento, fecha) => {
            setAbierto(false);
            if (fecha) alCambiar(fecha);
          }}
        />
      )}
    </>
  );
}

const estilos = StyleSheet.create({
  campo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    marginTop: 5,
  },
  texto: { fontSize: 15, color: '#1E293B', fontWeight: '600' },
});
