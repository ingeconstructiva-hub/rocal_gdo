/* Deslizar hacia abajo para actualizar (versión navegador).
 *
 * react-native-web ignora RefreshControl (lo reemplaza por un contenedor vacío),
 * así que el gesto que ya estaba en varias pantallas nunca funcionó en la PWA.
 * Aquí se implementa a mano, reutilizando el mismo registro que usa el botón de
 * refrescar: cada pantalla ya dice cuál es su función de recarga.
 *
 * Reglas para que no estorbe al desplazarse normal:
 *   - Solo se activa si la lista ya está hasta arriba.
 *   - Solo si el dedo baja más de lo que se mueve en horizontal.
 *   - Se arrastra con resistencia, como en las apps nativas.
 */

import { Feather } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { dispararRefresco, escucharSiHayQueRefrescar } from '../lib/refrescar';

const DISTANCIA_PARA_SOLTAR = 70; // Cuánto hay que bajar para que dispare
const MAXIMO = 110;
const RESISTENCIA = 0.5;

/** Busca el contenedor que realmente se desplaza bajo el dedo. */
function contenedorDesplazable(inicio: EventTarget | null): Element | null {
  let el = inicio as Element | null;
  while (el && el !== document.body) {
    const estilo = window.getComputedStyle(el);
    const desbordaY = /(auto|scroll)/.test(estilo.overflowY);
    if (desbordaY && el.scrollHeight - el.clientHeight > 2) return el;
    el = el.parentElement;
  }
  return document.scrollingElement;
}

export function TirarParaRefrescar() {
  const [hayQueRefrescar, setHayQueRefrescar] = useState(false);
  const [refrescando, setRefrescando] = useState(false);
  const distancia = useRef(new Animated.Value(0)).current;

  const inicioY = useRef(0);
  const inicioX = useRef(0);
  const arrastrando = useRef(false);
  const avance = useRef(0);

  useEffect(() => escucharSiHayQueRefrescar(setHayQueRefrescar), []);

  useEffect(() => {
    if (!hayQueRefrescar) return;

    const alTocar = (e: TouchEvent) => {
      if (refrescando || e.touches.length !== 1) return;
      const contenedor = contenedorDesplazable(e.target);
      if (!contenedor || contenedor.scrollTop > 0) return;

      inicioY.current = e.touches[0].clientY;
      inicioX.current = e.touches[0].clientX;
      arrastrando.current = true;
      avance.current = 0;
    };

    const alMover = (e: TouchEvent) => {
      if (!arrastrando.current || refrescando) return;

      const dy = e.touches[0].clientY - inicioY.current;
      const dx = Math.abs(e.touches[0].clientX - inicioX.current);

      // Si va hacia arriba o de lado, es desplazamiento normal: no interferimos.
      if (dy <= 0 || dx > Math.abs(dy)) {
        arrastrando.current = false;
        distancia.setValue(0);
        return;
      }

      avance.current = Math.min(dy * RESISTENCIA, MAXIMO);
      distancia.setValue(avance.current);

      // Evita el rebote propio del navegador mientras se arrastra.
      if (e.cancelable) e.preventDefault();
    };

    const alSoltar = async () => {
      if (!arrastrando.current) return;
      arrastrando.current = false;

      if (avance.current < DISTANCIA_PARA_SOLTAR) {
        Animated.spring(distancia, { toValue: 0, useNativeDriver: false }).start();
        return;
      }

      setRefrescando(true);
      Animated.spring(distancia, { toValue: 55, useNativeDriver: false }).start();

      try {
        await dispararRefresco();
      } finally {
        setRefrescando(false);
        Animated.timing(distancia, { toValue: 0, duration: 200, useNativeDriver: false }).start();
      }
    };

    // touchmove NO pasivo: es la única forma de poder frenar el rebote.
    document.addEventListener('touchstart', alTocar, { passive: true });
    document.addEventListener('touchmove', alMover, { passive: false });
    document.addEventListener('touchend', alSoltar, { passive: true });
    document.addEventListener('touchcancel', alSoltar, { passive: true });

    return () => {
      document.removeEventListener('touchstart', alTocar);
      document.removeEventListener('touchmove', alMover as any);
      document.removeEventListener('touchend', alSoltar);
      document.removeEventListener('touchcancel', alSoltar);
    };
  }, [hayQueRefrescar, refrescando, distancia]);

  if (!hayQueRefrescar) return null;

  return (
    <Animated.View style={[estilos.contenedor, { transform: [{ translateY: distancia }], opacity: distancia.interpolate({ inputRange: [0, 30], outputRange: [0, 1] }) }]} pointerEvents="none">
      <View style={estilos.burbuja}>
        <Feather name="refresh-cw" size={15} color="#1A56DB" />
        <Text style={estilos.texto}>{refrescando ? 'Actualizando…' : 'Suelta para actualizar'}</Text>
      </View>
    </Animated.View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { position: 'absolute', top: -50, left: 0, right: 0, alignItems: 'center', zIndex: 9997 },
  burbuja: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    boxShadow: '0px 3px 8px rgba(15, 23, 42, 0.18)',
  },
  texto: { fontSize: 12, fontWeight: '700', color: '#1A56DB' },
});
