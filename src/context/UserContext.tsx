import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface UserProfile {
  id: string;
  name?: string; 
  full_name?: string;
  role?: string;
  displayRole?: string;
 
  carrera_especialidad?: string | null;
  edad?: number | null;
  direccion?: string | null;
  telefono?: string | null;
  foto_ine_url?: string | null;
  foto_perfil_url?: string | null;
}

type UserContextType = {
  profile: UserProfile | null;
  isLoadingUser: boolean;
  refreshProfile: () => Promise<void>;
};

// 🟢 CORRECCIÓN 1: Agregamos una función vacía por defecto
const UserContext = createContext<UserContextType>({ 
  profile: null, 
  isLoadingUser: true,
  refreshProfile: async () => {} 
});

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);

  useEffect(() => {
    const loadSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await fetchProfile(session.user.id);
      } else {
        setIsLoadingUser(false);
      }
    };

    loadSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        await fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setIsLoadingUser(false);
      }
    });

    return () => { authListener.subscription.unsubscribe(); };
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;

      if (data) {
        const dbRole = data.rol || data.role || 'residente';
        const dbName = data.nombre || data.full_name || 'Usuario';
        
        let display = "Residente de Obra";
        if (dbRole === 'admin') display = "Administrador";
        else if (dbRole === 'oficina') display = "Personal de Oficina";

        // 🟢 CORRECCIÓN 2: Asegurarnos de guardar TODOS los datos en el estado, no solo el nombre
        setProfile({
          id: userId,
          name: dbName,
          full_name: data.full_name,
          role: dbRole as 'admin' | 'residente' | 'oficina',
          displayRole: display,
          carrera_especialidad: data.carrera_especialidad,
          edad: data.edad,
          direccion: data.direccion,
          telefono: data.telefono,
          foto_ine_url: data.foto_ine_url,
          foto_perfil_url: data.foto_perfil_url
        });
      }
    } catch (error) {
      console.log("Error cargando perfil global:", error);
    } finally {
      setIsLoadingUser(false);
    }
  };

  // 🟢 CORRECCIÓN 3: Creamos la función que la App va a llamar al editar el perfil
  const refreshProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await fetchProfile(session.user.id);
    }
  };

  return (
    // 🟢 CORRECCIÓN 4: Enviamos refreshProfile en el Provider
    <UserContext.Provider value={{ profile, isLoadingUser, refreshProfile }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);