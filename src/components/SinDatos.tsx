/* Lo que se ve cuando una pantalla termino de cargar y no tiene nada que
 * mostrar.
 *
 * Antes cada pantalla suponia la causa, y suponer sale caro: decirle "no has
 * elegido obra" a alguien que si la eligio confunde mas de lo que ayuda, y el
 * esqueleto girando para siempre parece que la app se trabo. Este aviso no
 * culpa a nadie, no adivina el motivo, y deja salir con un toque.
 */

import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  mensaje?: string;
  onReintentar?: () => void;
};

export function SinDatos({ mensaje = 'No hay datos para mostrar.', onReintentar }: Props) {
  return (
    <View style={estilos.caja}>
      <Text style={estilos.texto}>{mensaje}</Text>

      {onReintentar ? (
        <TouchableOpacity style={estilos.boton} onPress={onReintentar} activeOpacity={0.7}>
          <Feather name="refresh-cw" size={14} color="#2563EB" />
          <Text style={estilos.botonTexto}>Reintentar</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  caja: { alignItems: 'center', justifyContent: 'center', paddingVertical: 36, paddingHorizontal: 20 },
  texto: { textAlign: 'center', color: '#64748B', fontSize: 14 },
  boton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
  },
  botonTexto: { color: '#2563EB', fontWeight: 'bold', fontSize: 13 },
});
