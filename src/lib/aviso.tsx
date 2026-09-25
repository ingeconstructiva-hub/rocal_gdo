/* Avisos de la app (versión nativa).
 *
 * En celular usamos el Alert de siempre del sistema operativo.
 *
 * En navegador Metro toma `aviso.web.tsx`, que dibuja un cuadro propio.
 * ¿Por qué? Porque en react-native-web el Alert es literalmente una función
 * vacía: `static alert() {}`. Es decir, en web la app mostraba 165 mensajes
 * que nadie veía nunca, incluidos los errores.
 *
 * La forma es la misma que la de Alert, así que las pantallas no cambian.
 */

import { Alert as AlertNativo } from 'react-native';

export type BotonAviso = {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

export const Aviso = {
  alert(titulo: string, mensaje?: string, botones?: BotonAviso[]) {
    AlertNativo.alert(titulo, mensaje, botones);
  },
};

/** En nativo no dibuja nada: el sistema operativo pone el cuadro. */
export function ContenedorDeAvisos() {
  return null;
}
