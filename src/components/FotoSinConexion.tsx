/* Aviso en el lugar de una foto que no se puede mostrar sin internet.
 *
 * Las fotos viven en Supabase, no en el dispositivo. Sin señal, el hueco vacío
 * se lee como "no hay foto" o como que la app está fallando. Este aviso dice lo
 * que de verdad pasa: la foto existe y se verá cuando vuelva el internet.
 */

import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

export function FotoSinConexion({ alto = 160 }: { alto?: number }) {
  return (
    <View style={[estilos.caja, { minHeight: alto }]}>
      <Feather name="wifi-off" size={22} color="#94A3B8" />
      <Text style={estilos.titulo}>Foto guardada en la nube</Text>
      <Text style={estilos.detalle}>Se mostrará cuando vuelva el internet.</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  caja: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    gap: 6,
  },
  titulo: { fontSize: 13, fontWeight: '700', color: '#475569' },
  detalle: { fontSize: 11, color: '#94A3B8', textAlign: 'center' },
});
