/* Refresco manual de la pantalla actual.
 *
 * En la app nativa, al cambiar de pestaña la pantalla se recarga sola
 * (useFocusEffect). En el navegador eso no ocurre: la pantalla se queda con los
 * datos con los que entró. Por eso hace falta un botón para pedir datos frescos.
 *
 * Cada pantalla registra su función de carga con `useRefrescar(...)`, y el botón
 * del contexto llama a las registradas.
 */

import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

type Recarga = () => void | Promise<void>;

const registradas = new Set<Recarga>();
const conBoton = new Set<Recarga>();
const oyentes = new Set<(hay: boolean) => void>();
const oyentesBoton = new Set<(hay: boolean) => void>();

function avisarCambio() {
  oyentes.forEach((oyente) => oyente(registradas.size > 0));
  oyentesBoton.forEach((oyente) => oyente(conBoton.size > 0));
}

/** Avisa si la pantalla actual tiene algo que recargar. Lo usa el gesto de
 *  deslizar hacia abajo, que aplica en todas las pantallas con datos. */
export function escucharSiHayQueRefrescar(oyente: (hay: boolean) => void) {
  oyentes.add(oyente);
  oyente(registradas.size > 0);
  return () => {
    oyentes.delete(oyente);
  };
}

/** Avisa si además hay que mostrar el botón flotante. Se excluyen las pantallas
 *  que ya tienen su propio botón de refrescar en el encabezado. */
export function escucharSiHayBoton(oyente: (hay: boolean) => void) {
  oyentesBoton.add(oyente);
  oyente(conBoton.size > 0);
  return () => {
    oyentesBoton.delete(oyente);
  };
}

/** La pantalla dice: "cuando toquen refrescar, llama a esto".
 *
 * Guardamos la función en una referencia y registramos un envoltorio fijo: así
 * la pantalla puede pasar una función nueva en cada dibujado sin que esto se
 * dé de alta y de baja a cada rato.
 *
 * Va con useFocusEffect, NO con useEffect: las pantallas con pestañas se quedan
 * cargadas en memoria aunque no se estén viendo. Con useEffect, el botón seguía
 * registrado desde otra pantalla y aparecía encima de pantallas que ya tienen
 * su propio botón de refrescar. */
export function useRefrescar(recarga: Recarga, opciones?: { boton?: boolean }) {
  const quiereBoton = opciones?.boton !== false;
  const ultima = useRef(recarga);
  ultima.current = recarga;

  useFocusEffect(
    useCallback(() => {
      const envoltorio = () => ultima.current();
      registradas.add(envoltorio);
      if (quiereBoton) conBoton.add(envoltorio);
      avisarCambio();
      return () => {
        registradas.delete(envoltorio);
        conBoton.delete(envoltorio);
        avisarCambio();
      };
    }, [quiereBoton])
  );
}

/** Lo llama el botón. Devuelve cuando todas las recargas terminaron. */
export async function dispararRefresco(): Promise<void> {
  await Promise.all(Array.from(registradas).map((recarga) => Promise.resolve(recarga()).catch(() => {})));
}

/** Para saber si hay algo que refrescar en la pantalla actual. */
export function hayAlgoQueRefrescar(): boolean {
  return registradas.size > 0;
}
