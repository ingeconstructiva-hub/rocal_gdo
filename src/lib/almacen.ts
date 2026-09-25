/* Almacén local de la app (versión nativa).
 *
 * En celular usamos AsyncStorage de siempre, que guarda en el disco del
 * teléfono y no tiene límites incómodos.
 *
 * En navegador Metro toma automáticamente `almacen.web.ts`, que guarda en
 * IndexedDB. Lo hacemos así porque en web AsyncStorage usa localStorage, que
 * solo aguanta unos 5 MB: suficiente para texto, pero no para fotos.
 *
 * La forma es la misma en los dos lados (getItem / setItem / removeItem), así
 * que el código que lo usa no necesita saber en dónde está corriendo.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const Almacen = {
  getItem: (clave: string) => AsyncStorage.getItem(clave),
  setItem: (clave: string, valor: string) => AsyncStorage.setItem(clave, valor),
  removeItem: (clave: string) => AsyncStorage.removeItem(clave),
};

export default Almacen;
