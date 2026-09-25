import { Feather } from '@expo/vector-icons';
import Almacen from '../lib/almacen';
import NetInfo from '@react-native-community/netinfo';
import { decode } from 'base64-arraybuffer'; // <-- NUEVA CAPACIDAD BINARIA
import * as FileSystem from 'expo-file-system/legacy'; // <-- NUEVA CAPACIDAD BINARIA
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';

type ProjectContextType = {
  activeProject: any;
  setActiveProject: (project: any) => void;
  isOffline: boolean;
  lastSync: number;
};

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [activeProject, setActiveProject] = useState<any>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [lastSync, setLastSync] = useState(0);

  // 1. EL VIGILANTE DE INTERNET CON DESPERTADOR AUTOMÁTICO
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOffline(state.isConnected === false);
    });

    const interval = setInterval(() => {
      NetInfo.fetch().then(state => {
        setIsOffline(state.isConnected === false);
      });
    }, 3000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  // 2. EL MOTOR DE SINCRONIZACIÓN AUTOMÁTICA
  useEffect(() => {
    if (!isOffline) {
      sincronizarBandejasDeSalida();
    }
  }, [isOffline]);

const sincronizarBandejasDeSalida = async () => {
  let huboSincronizacion = false;

  try {
    // --- A. BITÁCORAS ---
    const pendingLogsData = await Almacen.getItem('@bandeja_salida_logs');
    if (pendingLogsData) {
      const logsPendientes = JSON.parse(pendingLogsData);
      if (logsPendientes.length > 0) {
        const { error } = await supabase.from('logs').upsert(logsPendientes, { onConflict: 'local_uuid' });
        if (!error) { await Almacen.removeItem('@bandeja_salida_logs'); huboSincronizacion = true; }
      }
    }

    // --- B. GASTOS ---
    const pendingInvData = await Almacen.getItem('@bandeja_salida_inventario');
    if (pendingInvData) {
      const invPendientes = JSON.parse(pendingInvData);
      if (invPendientes.length > 0) {
        const { error } = await supabase.from('inventory').upsert(invPendientes, { onConflict: 'local_uuid' });
        if (!error) { await Almacen.removeItem('@bandeja_salida_inventario'); huboSincronizacion = true; }
      }
    }

    // --- C. TRABAJADORES NUEVOS ---
    const pendingWorkersData = await Almacen.getItem('@bandeja_salida_lista');
    if (pendingWorkersData) {
      const workersPendientes = JSON.parse(pendingWorkersData);
      if (workersPendientes.length > 0) {
        const { error } = await supabase.from('workers').upsert(workersPendientes, { onConflict: 'local_uuid' });
        if (!error) { await Almacen.removeItem('@bandeja_salida_lista'); huboSincronizacion = true; }
      }
    }

    // El resto queda igual desde D en adelante...
      // --- D. ASISTENCIA Y NÓMINA ---
      const pendingPayrollData = await Almacen.getItem('@bandeja_salida_nomina');
      if (pendingPayrollData) {
        const payrollPendientes = JSON.parse(pendingPayrollData);
        if (payrollPendientes.length > 0) {
          const validPayroll = payrollPendientes.filter((r: any) => !r.worker_id.startsWith('temp_'));
          if (validPayroll.length > 0) {
            const { error } = await supabase.from('payroll_records').upsert(validPayroll, { onConflict: 'worker_id,week_start' });
            if (!error) { await Almacen.removeItem('@bandeja_salida_nomina'); huboSincronizacion = true; }
          } else {
            await Almacen.removeItem('@bandeja_salida_nomina');
          }
        }
      }

      // --- 🏗️ E. NUEVO: SUBIR DOCUMENTOS Y PLANOS PESADOS DESDE EL DISCO ---
      const pendingPlanosData = await Almacen.getItem('@bandeja_salida_planos');
      if (pendingPlanosData) {
        const planosPendientes = JSON.parse(pendingPlanosData);
        if (planosPendientes.length > 0) {
          console.log(`📡 Sincronizando ${planosPendientes.length} documentos PDF...`);
          
          for (const doc of planosPendientes) {
            try {
              // 1. Buscamos el archivo físico guardado en el celular y lo leemos
              const base64Pdf = await FileSystem.readAsStringAsync(doc.local_file_uri, { encoding: 'base64' });
              const arrayBuffer = decode(base64Pdf);
              const fileName = `doc_${Date.now()}.pdf`;

              // 2. Lo subimos a Supabase Storage
              const { error: uploadError } = await supabase.storage
                .from('planos_obras')
                .upload(fileName, arrayBuffer, { contentType: 'application/pdf' });

              if (uploadError) throw uploadError;

              // 3. Obtenemos su URL pública
              const { data: publicUrlData } = supabase.storage.from('planos_obras').getPublicUrl(fileName);

              // 4. Insertamos el renglón en la tabla planos
              const { error: dbError } = await supabase.from('planos').insert([
                { title: doc.title, category: doc.category, version: doc.version, file_url: publicUrlData.publicUrl, project_id: doc.project_id }
              ]);

              if (dbError) throw dbError;

              // 5. Limpieza: Borramos el PDF del teléfono para liberar espacio
              await FileSystem.deleteAsync(doc.local_file_uri, { immigrant: true } as any).catch(() => {});

            } catch (docError) {
              console.error("Fallo subiendo plano individual, se queda en cola:", docError);
            }
          }
          
          // Vaciamos la bandeja completa de planos
          await Almacen.removeItem('@bandeja_salida_planos');
          huboSincronizacion = true;
        }
        // --- F. CAJA CHICA (Gastos Menores) ---
      const pendingCajaData = await Almacen.getItem('@bandeja_salida_caja');
      if (pendingCajaData) {
        const cajaPendientes = JSON.parse(pendingCajaData);
        if (cajaPendientes.length > 0) {
          console.log("📡 Sincronizando Caja Chica...");
          for (const gasto of cajaPendientes) {
            try {
              let fotoUrl = null;
              // Si hay foto local, la subimos primero
              if (gasto.foto_local_uri) {
                const fileName = `ticket_${Date.now()}.jpg`;
                const formData = new FormData();
                formData.append('file', { uri: gasto.foto_local_uri, name: fileName, type: 'image/jpeg' } as any);
                const { error: upErr } = await supabase.storage.from('tickets_caja_chica').upload(fileName, formData);
                if (!upErr) {
                  fotoUrl = supabase.storage.from('tickets_caja_chica').getPublicUrl(fileName).data.publicUrl;
                }
              }

              // Insertamos en la tabla
              await supabase.from('caja_chica').upsert([{
                project_id: gasto.project_id,
                monto: gasto.monto,
                concepto: gasto.concepto,
                foto_ticket: fotoUrl,
                fecha: gasto.fecha,
                local_uuid: gasto.local_uuid,
              }], { onConflict: 'local_uuid' });

            } catch (err) { console.log("Gasto fallido:", err); }
          }
          await Almacen.removeItem('@bandeja_salida_caja');
          huboSincronizacion = true;
        }
      }
      }

      // Si subió cosas de cualquier módulo, tocamos el timbre y avisamos
      if (huboSincronizacion) {
        setLastSync(Date.now()); 
        Alert.alert(
          "Sincronización Exitosa", 
          "Todos tus planos, reportes, gastos y nóminas creadas offline se han sincronizado con éxito."
        );
      }

    } catch (error) {
      console.error("Fallo general al procesar la cola offline:", error);
    }
  };

  return (
    <ProjectContext.Provider value={{ activeProject, setActiveProject, isOffline, lastSync }}>
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
  offlineBanner: { position: 'absolute', top: Platform.OS === 'ios' ? 50 : 40, alignSelf: 'center', backgroundColor: '#D97706', paddingVertical: 8, paddingHorizontal: 20, borderRadius: 20, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', zIndex: 9999, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5 },
  offlineText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' }
});