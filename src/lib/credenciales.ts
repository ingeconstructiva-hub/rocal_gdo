/* Limpiar lo que se cuela al copiar y pegar un correo o una contraseña.
 *
 * Las cuentas se reparten por WhatsApp, y ahí el texto no viaja limpio: al
 * seleccionar se arrastra un espacio al final, el teclado del teléfono mete
 * un espacio duro en vez de uno normal, y algunas apps dejan marcas de ancho
 * cero que no se ven en pantalla.
 *
 * El resultado es cruel: la persona ve su contraseña correcta en el campo, la
 * app la manda con un carácter de más, y el servidor responde que está mal.
 * No hay forma de darse cuenta mirando.
 *
 * Por eso se limpia antes de enviar. Nada de esto puede ser parte de una
 * contraseña de verdad: nadie elige terminar su clave con un espacio
 * invisible.
 */

/* Caracteres que se ven como nada o como un espacio normal, pero no lo son.
 *
 * - 200B a 200D: espacios y uniones de ancho cero.
 * - FEFF: la marca de orden de bytes, que viaja pegada a textos copiados.
 * - 00A0 y 2007/202F: espacios duros, los que mete el teclado del celular.
 * - 2000 a 200A: espacios tipográficos de distinto ancho.
 */
const INVISIBLES = /[​-‍﻿⁠]/g;
const ESPACIOS_RAROS = /[  -    　]/g;

/** El texto tal cual lo tecleó alguien, sin lo que se colo al pegarlo. */
export function limpiarCredencial(valor: string): string {
  return (valor || '')
    .replace(INVISIBLES, '')
    .replace(ESPACIOS_RAROS, ' ')
    // Saltos de linea y tabuladores: siempre vienen del pegado, nunca del teclado.
    .replace(/[\r\n\t]/g, '')
    .trim();
}

/* Un correo no lleva espacios, ni en medio.
 *
 * Al pegar desde WhatsApp se cuela un espacio duro que se ve igual que nada,
 * y el correo deja de existir. Aquí se quitan todos: no hay caso en que un
 * espacio dentro de un correo sea correcto.
 */
export function limpiarCorreo(valor: string): string {
  return limpiarCredencial(valor)
    .replace(/\s+/g, '')
    .toLowerCase();
}

/* Si limpiar cambió algo, vale la pena intentar también con el original.
 *
 * Es poco probable, pero una contraseña podría llevar un espacio al final a
 * propósito. Antes de decirle a alguien que sus datos están mal, se prueban
 * las dos formas: cuesta una petición y evita dejar a una persona fuera de su
 * propia cuenta.
 */
export function variantesDe(valor: string): string[] {
  const limpio = limpiarCredencial(valor);
  return limpio === valor ? [valor] : [limpio, valor];
}
