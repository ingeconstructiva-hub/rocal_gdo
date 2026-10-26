/* Regresar sin quedarse atorado.
 *
 * `router.back()` solo funciona si hay historial. No lo hay cuando:
 *   - se abre un link directo a una pantalla,
 *   - la app instalada arranca en una pantalla interna,
 *   - el servidor de desarrollo recarga la app mientras trabajas en ella.
 *
 * En esos casos el botón de regresar simplemente no hacía nada, y parecía
 * descompuesto. Aquí, si no hay a dónde volver, mandamos al tablero.
 */

import { router } from 'expo-router';

export function regresar(destinoSiNoHayHistorial: string = '/(tabs)') {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(destinoSiNoHayHistorial as any);
}

/* Para las pantallas a las que SIEMPRE se llega desde el tablero.
 *
 * En esas el historial estorba en vez de ayudar: si entraste a una nota y
 * volviste, `router.back()` te regresa a la nota, y desde ahi otra vez a la
 * lista. Se siente como que el boton no sirve o como que la app se quedo
 * pegada, cuando en realidad esta haciendo exactamente lo que se le pidio.
 *
 * Estas pantallas no preguntan por el historial: siempre vuelven al mismo
 * lugar, que es de donde se entra a ellas.
 */
export function volverAlTablero(destino: string = '/(tabs)') {
  router.replace(destino as any);
}
