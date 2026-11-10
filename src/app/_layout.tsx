import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { ProjectProvider } from '../context/ProjectContext'; // <-- Ajusta la ruta si tus context están en /src/context
import { UserProvider } from '../context/UserContext';
import { TirarParaRefrescar } from '../components/TirarParaRefrescar';
import { SelectorEmpresa } from '../components/SelectorEmpresa';
import { VistaPreviaPDF } from '../components/VistaPreviaPDF';
import { ContenedorDeAvisos } from '../lib/aviso';
import { supabase } from '../lib/supabase';

export default function RootLayout() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [session, setSession] = useState<any>(null);
  
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    let vivo = true;

    /* Arranque a prueba de sesion podrida.
     *
     * getSession() lee el token guardado y, si ya caduco, intenta refrescarlo
     * contra la red. Cuando eso fallaba o se colgaba, la promesa nunca llegaba
     * a setIsInitialized, y mas abajo hay un `return null`: la app se quedaba
     * en blanco para siempre, sin reintentar y sin decir nada. La unica salida
     * era borrar la app, que funcionaba justo porque limpiaba el token.
     *
     * Ahora arranca pase lo que pase, y con su propio limite de tiempo por si
     * la peticion no responde. Sin sesion valida se va a login, que es
     * recuperable; quedarse en blanco no lo es.
     */
    const arrancar = async () => {
      try {
        const lectura = supabase.auth.getSession();
        const limite = new Promise<never>((_, falla) =>
          setTimeout(() => falla(new Error('La sesion tardo demasiado en leerse.')), 8000)
        );
        const { data } = await Promise.race([lectura, limite]);
        if (vivo) setSession(data.session);
      } catch (e) {
        console.log('No se pudo leer la sesion al arrancar:', e);
        if (vivo) setSession(null);
      } finally {
        if (vivo) setIsInitialized(true);
      }
    };

    arrancar();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (vivo) setSession(session);
    });

    return () => {
      vivo = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isInitialized) return;

    const inAuthGroup = segments[0] === 'login';

    if (!session && !inAuthGroup) {
      router.replace('/login');
    } else if (session && inAuthGroup) {
      router.replace('/proyectos');
    }
  }, [session, isInitialized, segments]);

  if (!isInitialized) return null;

  return (
    <UserProvider>
      <ProjectProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="login" />
          <Stack.Screen name="proyectos" />
          <Stack.Screen name="(tabs)" />
        </Stack>

        {/* Dibuja los avisos en web. En nativo no pinta nada: usa el cuadro del sistema. */}
        <ContenedorDeAvisos />

        {/* Vista previa de reportes en web. En nativo no dibuja nada. */}
        <VistaPreviaPDF />
        <SelectorEmpresa />

        {/* Deslizar hacia abajo para actualizar (solo web). */}
        <TirarParaRefrescar />
      </ProjectProvider>
    </UserProvider>
  );
}