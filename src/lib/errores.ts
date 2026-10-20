/* Traduce los errores de Supabase a algo que se entienda en obra.
 *
 * El motivo: cuando a un residente le falta permiso, Supabase contesta en
 * inglés "new row violates row-level security policy for table ...". Eso no le
 * dice nada a quien está parado en la obra con el ticket en la mano, y nos
 * costó un reporte de "no me deja subir mis tickets" sin más pistas.
 */

/** Mensaje claro para el usuario. `accion` se usa en la frase: "subir la foto". */
export function mensajeDeError(error: any, accion = 'guardar esto'): string {
  const texto = `${error?.message ?? ''} ${error?.error ?? ''} ${error?.hint ?? ''}`.toLowerCase();
  const codigo = String(error?.code ?? error?.statusCode ?? '');

  // Falta de permiso: es el caso más común y el más confuso para el usuario.
  if (
    codigo === '42501' ||
    codigo === '403' ||
    texto.includes('row-level security') ||
    texto.includes('unauthorized') ||
    texto.includes('not authorized') ||
    texto.includes('permission denied')
  ) {
    return `Tu usuario no tiene permiso para ${accion}. Pídele a un administrador que te habilite el acceso a esta obra; el trabajo no se perdió. (código 42501)`;
  }

  // La obra activa apunta a algo que ya no está. Pasa porque la obra elegida se
  // guarda en el teléfono y no se revalida: si la obra se borró o se recreó, el
  // project_id que manda la app ya no existe. Le pega igual a un admin, así que
  // es la pista que distingue este caso de una falta de permisos.
  if (codigo === '23503' || texto.includes('foreign key') || texto.includes('violates foreign key')) {
    return `La obra que tienes seleccionada ya no existe. Entra a Proyectos, vuelve a elegir tu obra y reintenta. (código 23503)`;
  }

  // Sin obra activa el project_id se va vacío y la base lo rechaza.
  if (codigo === '23502' || texto.includes('null value in column') || texto.includes('not-null')) {
    return `No tienes una obra seleccionada. Entra a Proyectos, elige tu obra y reintenta. (código 23502)`;
  }

  // La base de datos no tiene lo que la app espera: es un problema de
  // configuración, no del usuario, así que conviene que llegue el detalle.
  if (codigo === '42703' || codigo === '42P10' || texto.includes('does not exist') || texto.includes('on conflict')) {
    return `La base de datos no está configurada para recibir esto. Muéstrale este detalle a un administrador: ${error?.message ?? codigo}`;
  }

  if (texto.includes('duplicate key') || codigo === '23505') {
    return 'Ese registro ya existe. Revisa si lo capturaste dos veces.';
  }

  if (texto.includes('network') || texto.includes('failed to fetch') || texto.includes('timeout')) {
    return 'No se pudo conectar. Revisa tu internet y vuelve a intentarlo.';
  }

  return error?.message || `No se pudo ${accion}.`;
}
