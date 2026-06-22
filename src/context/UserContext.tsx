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
}

type UserContextType = {
  profile: UserProfile | null;
  isLoadingUser: boolean;
};

const UserContext = createContext<UserContextType>({ profile: null, isLoadingUser: true });

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

        setProfile({
          id: userId,
          name: dbName,
          role: dbRole as 'admin' | 'residente' | 'oficina',
          displayRole: display
        });
      }
    } catch (error) {
      console.log("Error cargando perfil global:", error);
    } finally {
      setIsLoadingUser(false);
    }
  };

  return (
    <UserContext.Provider value={{ profile, isLoadingUser }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);