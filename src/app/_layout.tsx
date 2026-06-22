import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { ProjectProvider } from '../context/ProjectContext'; // <-- Ajusta la ruta si tus context están en /src/context
import { UserProvider } from '../context/UserContext';
import { supabase } from '../lib/supabase';

export default function RootLayout() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [session, setSession] = useState<any>(null);
  
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsInitialized(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isInitialized) return;

    const inAuthGroup = segments[0] === 'login';

    if (!session && !inAuthGroup) {
      router.replace('/login');
    } else if (session && inAuthGroup) {
      router.replace('/proyectos');
    }
  }, [session, isInitialized]);

  if (!isInitialized) return null;

  return (
    <UserProvider>
      <ProjectProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="login" />
          <Stack.Screen name="proyectos" />
          <Stack.Screen name="(tabs)" />
        </Stack>
      </ProjectProvider>
    </UserProvider>
  );
}