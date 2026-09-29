/* Deslizar hacia abajo para actualizar (versión nativa).
 *
 * En celular las pantallas ya usan RefreshControl de React Native, así que aquí
 * no se dibuja nada. La versión de navegador sí implementa el gesto, porque
 * react-native-web ignora RefreshControl: lo reemplaza por un contenedor vacío
 * y el gesto nunca funcionó en la PWA.
 */

export function TirarParaRefrescar() {
  return null;
}
