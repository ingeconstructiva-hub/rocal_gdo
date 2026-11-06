import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

/* Se recortan las orillas a proposito.
 *
 * El .env se edita en Windows, donde las lineas terminan con retorno de
 * carro. Al compilar, ese caracter invisible se queda PEGADO al valor: la
 * direccion sale como '...supabase.co' y el servidor responde
 * 'Invalid API Key', que no se parece en nada a la causa. El PWA nunca lo
 * sufrio porque Vercel inyecta las variables limpias.
 */
const limpiar = (v?: string) => (v || '').trim();

const supabaseUrl = limpiar(process.env.EXPO_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = limpiar(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

/* Tiempo limite en cada peticion.
 *
 * Sin esto, una peticion que sale cuando la senal se esta cayendo no falla:
 * se queda colgada. La promesa nunca se resuelve, el `finally` que apaga el
 * cargando nunca corre, y la pantalla se queda en los esqueletos para siempre.
 * En la obra, donde la senal va y viene, eso se ve como que la app se pego.
 *
 * Con un limite la peticion falla de verdad, y ahi si el codigo de cada
 * pantalla hace lo suyo: avisar, o mostrar la copia guardada.
 */
const LIMITE_CONSULTA = 25_000;
// Subir un archivo con datos moviles tarda mas y es legitimo: no se corta igual.
const LIMITE_SUBIDA = 120_000;

const conLimite: typeof fetch = (entrada, opciones = {}) => {
  const direccion = typeof entrada === 'string' ? entrada : (entrada as Request).url ?? String(entrada);
  const limite = direccion.includes('/storage/v1/object') ? LIMITE_SUBIDA : LIMITE_CONSULTA;

  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), limite);

  // Si quien llama ya traia su propia cancelacion, se respeta.
  const propia = opciones.signal;
  if (propia) propia.addEventListener('abort', () => control.abort(), { once: true });

  return fetch(entrada, { ...opciones, signal: control.signal })
    .catch((e) => {
      if (control.signal.aborted && !propia?.aborted) {
        throw new Error('La conexión tardó demasiado. Revisa tu señal e intenta de nuevo.');
      }
      throw e;
    })
    .finally(() => clearTimeout(reloj));
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: { fetch: conLimite },
});
