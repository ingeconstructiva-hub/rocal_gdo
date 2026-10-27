/* Cuanto cabe en un campo de dinero o de cantidad.
 *
 * Las columnas numeric de la base tienen un limite de digitos. Al pasarse, el
 * guardado truena con "numeric field overflow": un error de Postgres, en
 * ingles, y hasta despues de que la persona lleno todo el formulario y le dio
 * guardar. Mejor no dejarla teclear de mas desde el principio.
 *
 * Los dos topes viven aqui y en ningun otro lado: si algun dia se ensanchan
 * las columnas de la base, se cambia este archivo y toda la app obedece.
 */

/** Tope de un importe en pesos. */
export const MAX_IMPORTE = 9999999.99;

/** Tope de una cantidad, de horas o de piezas. */
export const MAX_CANTIDAD = 999999.99;

const conPesos = (n: number) =>
  `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* Deja solo un numero valido y no deja pasar del tope.
 *
 * Se usa en onChangeText, asi que el usuario nota el tope al momento: la
 * tecla simplemente no entra. Es mas claro que recortarle el numero por
 * detras, que se sentiria como que la app le cambio lo que escribio.
 */
export const limitarNumero = (texto: string, maximo: number = MAX_IMPORTE): string => {
  // Un solo punto decimal: "12.3.4" no es un numero.
  let limpio = texto.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
  if (limpio === '' || limpio === '.') return limpio;

  // Pesos y centavos: mas de dos decimales no se guardan de todas formas.
  const [entero, decimales] = limpio.split('.');
  limpio = decimales === undefined ? entero : `${entero}.${decimales.slice(0, 2)}`;

  // Si se paso, se van digitos hasta que quepa. Con un pegado de golpe puede
  // ser mas de uno, por eso el ciclo y no un solo recorte.
  while (limpio && Number(limpio) > maximo) {
    limpio = limpio.slice(0, -1);
  }

  return limpio;
};

/* Revisa antes de guardar y devuelve el primer problema, o null si todo cabe.
 *
 * Hace falta ademas del tope por tecla porque los totales se calculan: una
 * cantidad y un precio que caben por separado pueden dar un producto que no.
 */
export const revisarNumeros = (
  campos: { etiqueta: string; valor: string | number; maximo?: number }[]
): string | null => {
  for (const campo of campos) {
    const n = Number(campo.valor || 0);
    const tope = campo.maximo ?? MAX_IMPORTE;

    if (!Number.isFinite(n)) return `${campo.etiqueta} no es un número válido.`;
    if (n > tope) return `${campo.etiqueta} no puede pasar de ${conPesos(tope)}.`;
  }

  return null;
};
