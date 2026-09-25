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
