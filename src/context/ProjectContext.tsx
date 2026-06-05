import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase'; // <-- Necesitamos Supabase aquí para subir los datos

type ProjectContextType = {
  activeProject: any;
  setActiveProject: (project: any) => void;
  isOffline: boolean;
};

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [activeProject, setActiveProject] = useState<any>(null);
  const [isOffline, setIsOffline] = useState(false);

  // 1. EL VIGILANTE DE INTERNET
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOffline(state.isConnected === false);
    });
    return () => unsubscribe();
  }, []);

  // 2. EL MOTOR DE SINCRONIZACIÓN AUTOMÁTICA
  useEffect(() => {
    // Si isOffline es FALSE (o sea, hay internet), revisamos la bandeja de salida
    if (!isOffline) {
      sincronizarBandejaDeSalida();
    }
  }, [isOffline]);

  const sincronizarBandejaDeSalida = async () => {
    try {
      // Leemos si hay algo pendiente de subir
      const pendingData = await AsyncStorage.getItem('@bandeja_salida_logs');
      
      if (pendingData) {
        const logsPendientes = JSON.parse(pendingData);
        
        if (logsPendientes.length > 0) {
          console.log(`📡 Sincronizando ${logsPendientes.length} reportes pendientes...`);
          
          // Subimos todos los reportes a Supabase de golpe
          const { error } = await supabase.from('logs').insert(logsPendientes);
          
          if (!error) {
            // Si se subieron con éxito, vaciamos la bandeja de salida
            await AsyncStorage.removeItem('@bandeja_salida_logs');
            Alert.alert("Sincronización Exitosa", "Tus reportes guardados sin conexión ya están en la nube.");
            // (Opcional: Aquí podrías forzar que se recargue la pantalla de bitácora)
          } else {
            console.error("Error al sincronizar:", error.message);
          }
        }
      }
    } catch (error) {
      console.error("Fallo al leer la bandeja de salida:", error);
    }
  };

  return (
    <ProjectContext.Provider value={{ activeProject, setActiveProject, isOffline }}>
      {children}
      
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Feather name="wifi-off" size={14} color="#FFF" style={{ marginRight: 8 }} />
          <Text style={styles.offlineText}>Sin conexión - Guardando localmente</Text>
        </View>
      )}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProject debe usarse dentro de un ProjectProvider');
  }
  return context;
}

const styles = StyleSheet.create({
  offlineBanner: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 40, 
    alignSelf: 'center',
    backgroundColor: '#D97706', // Lo cambiamos a naranja para indicar que sí se puede trabajar
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999, 
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  offlineText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' }
});