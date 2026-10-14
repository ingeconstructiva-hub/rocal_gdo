/* Selector de hora (versión celular).
 *
 * Hermano de SelectorFecha. En iOS el reloj se muestra incrustado y en Android
 * se abre al tocar, que es como ya se comportaba la pantalla de maquinaria.
 * La versión de navegador vive en SelectorHora.web.tsx.
 */

import DateTimePicker from '@react-native-community/datetimepicker';
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export type PropsSelectorHora = {
  /** null cuando todavía no se ha elegido hora. */
  valor: Date | null;
  alCambiar: (hora: Date) => void;
  /** Qué decir mientras no hay hora elegida, por ejemplo 'Inicio'. */
  textoVacio?: string;
};

/** La hora como la lee la gente: 09:30 a. m. */
function textoDeHora(fecha: Date): string {
  return fecha.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function SelectorHora({ valor, alCambiar, textoVacio }: PropsSelectorHora) {
  const [abierto, setAbierto] = useState(false);

  if (Platform.OS === 'ios') {
    return (
      <View style={estilos.cajaIOS}>
        <DateTimePicker
          value={valor ?? new Date()}
          mode="time"
          display="default"
          style={{ height: 30 }}
          onChange={(_evento, hora) => { if (hora) alCambiar(hora); }}
        />
      </View>
    );
  }

  return (
    <View>
      <TouchableOpacity style={estilos.boton} onPress={() => setAbierto(true)}>
        <Feather name="clock" size={14} color={valor ? '#2563EB' : '#94A3B8'} />
        <Text style={[estilos.texto, valor ? estilos.textoLleno : null]}>
          {valor ? textoDeHora(valor) : textoVacio ?? 'Hora'}
        </Text>
      </TouchableOpacity>

      {abierto && (
        <DateTimePicker
          value={valor ?? new Date()}
          mode="time"
          display="default"
          onChange={(_evento, hora) => {
            setAbierto(false);
            if (hora) alCambiar(hora);
          }}
        />
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  cajaIOS: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 4,
    minHeight: 46,
    justifyContent: 'center',
  },
  boton: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  texto: { color: '#94A3B8', fontSize: 13, fontWeight: '600' },
  textoLleno: { color: '#0F172A' },
});
