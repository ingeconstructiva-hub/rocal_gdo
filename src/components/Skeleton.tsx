/* Esqueletos de carga.
 *
 * En vez de un círculo girando, mostramos la silueta de lo que está por llegar.
 * Se siente más corto porque la pantalla ya tiene forma desde el primer momento,
 * y el salto al llegar los datos es menor.
 *
 * Regla al usarlos: el esqueleto debe parecerse a lo que viene. Un esqueleto que
 * no se parece al contenido real molesta más que el círculo.
 */

import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, ViewStyle } from 'react-native';

const BASE = '#E5E7EB';
const TARJETA = '#FFFFFF';

/** Bloque gris que late. Es la pieza con la que se arma todo lo demás. */
export function Skeleton({
  ancho = '100%',
  alto = 14,
  radio = 8,
  estilo,
}: {
  ancho?: number | `${number}%`;
  alto?: number;
  radio?: number;
  estilo?: ViewStyle;
}) {
  const pulso = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const animacion = Animated.loop(
      Animated.sequence([
        Animated.timing(pulso, { toValue: 1, duration: 750, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulso, { toValue: 0.6, duration: 750, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    animacion.start();
    return () => animacion.stop();
  }, [pulso]);

  return (
    <Animated.View
      style={[
        { width: ancho, height: alto, borderRadius: radio, backgroundColor: BASE, opacity: pulso },
        estilo,
      ]}
    />
  );
}

/** Silueta de una tarjeta de lista: título, detalle y un dato a la derecha. */
export function SkeletonRenglon() {
  return (
    <View style={estilos.renglon}>
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton ancho="65%" alto={14} />
        <Skeleton ancho="40%" alto={11} />
      </View>
      <Skeleton ancho={64} alto={16} />
    </View>
  );
}

/** Varias siluetas de renglón, para listas (gastos, bitácora, trabajadores...). */
export function SkeletonLista({ filas = 4 }: { filas?: number }) {
  return (
    <View style={estilos.lista}>
      {Array.from({ length: filas }).map((_, i) => (
        <SkeletonRenglon key={i} />
      ))}
    </View>
  );
}

/** Silueta de tarjeta grande, para obras y resúmenes. */
export function SkeletonTarjeta() {
  return (
    <View style={estilos.tarjeta}>
      <Skeleton ancho="55%" alto={18} />
      <Skeleton ancho="35%" alto={12} estilo={{ marginTop: 10 }} />
      <View style={estilos.separador} />
      <View style={estilos.fila}>
        <Skeleton ancho={90} alto={12} />
        <Skeleton ancho={90} alto={12} />
      </View>
    </View>
  );
}

export function SkeletonTarjetas({ cantidad = 3 }: { cantidad?: number }) {
  return (
    <View style={estilos.lista}>
      {Array.from({ length: cantidad }).map((_, i) => (
        <SkeletonTarjeta key={i} />
      ))}
    </View>
  );
}

const estilos = StyleSheet.create({
  lista: { gap: 10, marginTop: 12 },
  renglon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: TARJETA,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  tarjeta: {
    backgroundColor: TARJETA,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  separador: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 14 },
  fila: { flexDirection: 'row', justifyContent: 'space-between' },
});
