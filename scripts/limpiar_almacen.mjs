/* Limpia el almacén de Supabase, conservando lo que no es de los registros.
 *
 * Supabase ya no deja borrar desde SQL: "Direct deletion from storage tables
 * is not allowed". Hay que pasar por su API, y para eso hace falta la llave
 * de servicio, que tiene permisos de administrador.
 *
 * POR ESO ESTE SCRIPT SE CORRE EN TU MÁQUINA Y LA LLAVE NO SE ESCRIBE AQUÍ:
 * se lee de una variable de entorno. Esa llave se salta todas las reglas de
 * seguridad de la base, así que no debe quedar en el repositorio, ni en un
 * chat, ni en una captura de pantalla.
 *
 * Cómo correrlo, desde la carpeta del proyecto:
 *
 *   PowerShell:
 *     $env:SUPABASE_SERVICE_ROLE_KEY = "la-llave"
 *     node scripts/limpiar_almacen.mjs            <- solo mira, no borra
 *     node scripts/limpiar_almacen.mjs --borrar   <- borra de verdad
 *
 * Sin --borrar únicamente enseña qué haría. Empieza siempre por ahí.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

/* La dirección sale del .env del proyecto, no de una variable aparte: así no
 * hay forma de apuntarle sin querer a otra base. */
function leerUrlDelEnv() {
  const texto = readFileSync('.env', 'utf8');
  for (const linea of texto.split(/\r?\n/)) {
    const i = linea.indexOf('=');
    if (i === -1) continue;
    if (linea.slice(0, i).trim() === 'EXPO_PUBLIC_SUPABASE_URL') return linea.slice(i + 1).trim();
  }
  return null;
}

const url = leerUrlDelEnv();
const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) {
  console.error('No encontré EXPO_PUBLIC_SUPABASE_URL en el .env del proyecto.');
  process.exit(1);
}
if (!llave) {
  console.error('Falta la variable SUPABASE_SERVICE_ROLE_KEY.');
  console.error('La tomas de Supabase: Project Settings > API > service_role.');
  process.exit(1);
}

const deVerdad = process.argv.includes('--borrar');
const cliente = createClient(url, llave, { auth: { persistSession: false } });

/* Lo que se conserva.
 *
 * 'obras' entero: la imagen de una obra es parte de ella, y las obras se
 * quedan. De 'identificaciones' solo la carpeta de perfiles, porque ahí
 * también viven las firmas y los INE de los resguardos, que sí se van.
 */
const BUCKETS_INTACTOS = new Set(['obras']);
const CARPETAS_INTACTAS = { identificaciones: ['perfiles/'] };

/** Recorre un bucket entero, carpeta por carpeta. */
async function listarTodo(bucket, prefijo = '') {
  const encontrados = [];
  let desde = 0;

  for (;;) {
    const { data, error } = await cliente.storage
      .from(bucket)
      .list(prefijo, { limit: 100, offset: desde });

    if (error) throw new Error(`${bucket}/${prefijo}: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const entrada of data) {
      const ruta = prefijo ? `${prefijo}${entrada.name}` : entrada.name;
      // Sin id es una carpeta, no un archivo.
      if (entrada.id === null) encontrados.push(...(await listarTodo(bucket, `${ruta}/`)));
      else encontrados.push(ruta);
    }

    if (data.length < 100) break;
    desde += data.length;
  }

  return encontrados;
}

const seConserva = (bucket, ruta) => {
  if (BUCKETS_INTACTOS.has(bucket)) return true;
  const salvadas = CARPETAS_INTACTAS[bucket];
  return salvadas ? salvadas.some((c) => ruta.startsWith(c)) : false;
};

const { data: buckets, error: errorBuckets } = await cliente.storage.listBuckets();
if (errorBuckets) {
  console.error('No pude leer los buckets: ' + errorBuckets.message);
  process.exit(1);
}

console.log(deVerdad ? '=== BORRANDO ===\n' : '=== SOLO MIRANDO (agrega --borrar para hacerlo) ===\n');

let totalBorrados = 0;
let totalConservados = 0;

for (const bucket of buckets) {
  const archivos = await listarTodo(bucket.name);
  const aBorrar = archivos.filter((r) => !seConserva(bucket.name, r));
  const seQuedan = archivos.length - aBorrar.length;

  totalConservados += seQuedan;
  console.log(
    `${bucket.name.padEnd(22)} ${String(archivos.length).padStart(5)} archivos` +
      `  ->  borrar ${String(aBorrar.length).padStart(5)}, conservar ${seQuedan}`
  );

  if (!deVerdad || aBorrar.length === 0) continue;

  // La API acepta tandas; de a 100 para no pasarse del límite.
  for (let i = 0; i < aBorrar.length; i += 100) {
    const tanda = aBorrar.slice(i, i + 100);
    const { error } = await cliente.storage.from(bucket.name).remove(tanda);
    if (error) {
      console.error(`   falló una tanda en ${bucket.name}: ${error.message}`);
      continue;
    }
    totalBorrados += tanda.length;
  }
}

console.log(
  deVerdad
    ? `\nBorrados: ${totalBorrados}. Conservados: ${totalConservados}.`
    : `\nSe conservarían ${totalConservados} archivos. Nada se ha borrado.`
);
