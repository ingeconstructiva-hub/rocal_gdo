import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { ProjectProvider } from '../context/ProjectContext';
import { supabase } from '../lib/supabase';

export default function RootLayout() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [session, setSession] = useState<any>(null);
  
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    // 1. Revisamos si hay una sesión guardada
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsInitialized(true);
    });

    // 2. Escuchamos si el usuario inicia o cierra sesión
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isInitialized) return;

    // AHORA RECONOCE TANTO LOGIN COMO REGISTER COMO PANTALLAS PÚBLICAS; AGREGAR EN CASO DE QUE SE REQUIERA ->|| segments[0] === 'register'
    const inAuthGroup = segments[0] === 'login' ;

    // Usamos un micro-retraso para asegurar que el <Stack> 
    // ya se dibujó antes de intentar cambiar de ruta.
    setTimeout(() => {
      if (!session && !inAuthGroup) {
        router.replace('/login');
      } else if (session && inAuthGroup) {
        router.replace('/proyectos');
      }
    }, 10);

  }, [session, isInitialized, segments]);

  return (
    <ProjectProvider> 
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="register" /> {/* DECLARAMOS LA NUEVA PANTALLA */}
        <Stack.Screen name="proyectos" />
        <Stack.Screen name="(tabs)" /> 
      </Stack>
    </ProjectProvider>
  );
}