import { Feather } from '@expo/vector-icons';
import Almacen from '../lib/almacen';
import { borrarArchivoLocal } from '../lib/archivos';
import { subirArchivo } from '../lib/subidas';
import { dispararRefresco, escucharSiHayBoton } from '../lib/refrescar';
import { BANDEJAS, contarPendientes, leerBandeja, reemplazarBandeja, vaciarBandeja } from '../lib/bandeja';
import NetInfo from '@react-native-community/netinfo';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Aviso } from '../lib/aviso';
import { supabase } from '../lib/supabase';

type ProjectContextType = {
  activeProject: any;
  setActiveProject: (project: any) => void;
  isOffline: boolean;
  lastSync: number;
};

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

const LLAVE_OBRA_ACTIVA = '@obra_activa';

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [activeProject, setActiveProjectState] = useState<any>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [lastSync, setLastSync] = useState(0);
  const [pendientes, setPendientes] = useState(0);
  const [refrescando, setRefrescando] = useState(false);
  const [hayQueRefrescar, setHayQueRefrescar] = useState(false);

  // El botón solo aparece donde hay algo que recargar (en login, por ejemplo, no).
  useEffect(() => escucharSiHayBoton(setHayQueRefrescar), []);

  const refrescar = async () => {
    setRefrescando(true);
    try {
      await dispararRefresco();
    } finally {
      setRefrescando(false);
    }
  };

  /* Cuántos registros esperan subirse. Se revisa cada 3 segundos y después de
   * cada intento de sincronización, para que el letrero diga la verdad en todo
   * momento: si el número no baja al volver el internet, algo está fallando. */
  useEffect(() => {
    let vivo = true;
    const revisar = () => {
      contarPendientes()
        .then((total) => {
          if (vivo) setPendientes(total);
        })
        .catch(() => {});
    };

    revisar();
    const intervalo = setInterval(revisar, 3000);

    return () => {
      vivo = false;
      clearInterval(intervalo);
    };
  }, [isOffline, lastSync]);

  /* La obra activa se guarda en el dispositivo.
   * Antes vivía solo en memoria: al recargar la página (o al reabrir la app)
   * se perdía y el tablero se quedaba en "Cargando proyecto..." para siempre,
   * porque sin obra activa no hay nada que pedir. */
  useEffect(() => {
    Almacen.getItem(LLAVE_OBRA_ACTIVA)
      .then((guardada) => {
        if (guardada) setActiveProjectState(JSON.parse(guardada));
      })
      .catch(() => {});
  }, []);

  const setActiveProject = (project: any) => {
    setActiveProjectState(project);
    if (project) {
      Almacen.setItem(LLAVE_OBRA_ACTIVA, JSON.stringify(project)).catch(() => {});
    } else {
      Almacen.removeItem(LLAVE_OBRA_ACTIVA).catch(() => {});
    }
  };

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

/* Sube una foto al almacén de archivos y devuelve su dirección pública.
 * Recibe una referencia local (archivo del celular o guardado del navegador)
 * o un texto base64 ya listo. */
const subirFoto = (referencia: string, bucket: string): Promise<string> =>
  subirArchivo(referencia, bucket, { prefijo: 'foto' });

/* Registros viejos guardaban las fotos como texto base64 dentro de photo_url.
 * Las sacamos para poder subirlas como archivos. */
const leerFotosEmbebidas = (photoUrl: any): string[] => {
  if (typeof photoUrl !== 'string' || !photoUrl.startsWith('[')) return [];
  try {
    const lista = JSON.parse(photoUrl);
    return Array.isArray(lista) ? lista.filter((u: any) => typeof u === 'string' && u.startsWith('data:')) : [];
  } catch {
    return [];
  }
};

const sincronizarBandejasDeSalida = async () => {
  let subidos = 0;

  /* Sube una bandeja completa de un jalón (para registros sin archivos).
   * Regla de oro: si Supabase rechaza el lote, la bandeja NO se toca. Se queda
   * para el siguiente intento. Antes se borraba aunque fallara, y eso perdía
   * trabajo del día. */
  const subirLote = async (
    clave: string,
    enviar: (registros: any[]) => PromiseLike<{ error: any }>,
    prepara: (registros: any[]) => any[] = (r) => r
  ) => {
    const pendientes = await leerBandeja(clave);
    if (pendientes.length === 0) return;

    const listos = prepara(pendientes);
    if (listos.length === 0) {
      await vaciarBandeja(clave); // Nada válido que subir (por ejemplo, solo temporales)
      return;
    }

    const { error } = await enviar(listos);
    if (error) {
      console.log(`No se pudo subir ${clave}, se queda en la bandeja:`, error.message);
      return;
    }

    await vaciarBandeja(clave);
    subidos += listos.length;
  };

  /* Sube uno por uno (para lo que lleva archivo). Los que fallan SE QUEDAN en
   * la bandeja; solo se borran los que sí subieron. */
  const subirUnoPorUno = async (clave: string, procesar: (registro: any) => Promise<void>) => {
    const pendientes = await leerBandeja(clave);
    if (pendientes.length === 0) return;

    const fallidos: any[] = [];
    for (const registro of pendientes) {
      try {
        await procesar(registro);
        subidos += 1;
      } catch (error) {
        console.log(`Registro de ${clave} no subió, se queda en la bandeja:`, error);
        fallidos.push(registro);
      }
    }

    await reemplazarBandeja(clave, fallidos);
  };

  try {
    // --- A. BITÁCORAS ---
    // Van una por una porque pueden traer fotos que hay que subir primero al
    // almacén de archivos. Si una falla, se queda en la bandeja.
    await subirUnoPorUno(BANDEJAS.bitacora, async (log) => {
      const { fotos_locales, ...datos } = log;
      const urls: string[] = [];

      // Fotos guardadas como archivo (lo normal desde ahora).
      for (const referencia of fotos_locales ?? []) {
        urls.push(await subirFoto(referencia, 'foto_bitacora'));
      }

      // Registros viejos que traen la foto como texto base64 dentro del propio
      // registro: se suben igual, para no dejar a nadie con su reporte atorado.
      const fotosViejas = leerFotosEmbebidas(datos.photo_url);
      for (const base64 of fotosViejas) {
        urls.push(await subirFoto(base64, 'foto_bitacora'));
      }

      const { error } = await supabase
        .from('logs')
        .upsert([{ ...datos, photo_url: urls.length > 0 ? JSON.stringify(urls) : null }], {
          onConflict: 'local_uuid',
        });
      if (error) throw error;

      // Ya subió: liberamos el espacio de las fotos guardadas
      for (const referencia of fotos_locales ?? []) {
        await borrarArchivoLocal(referencia);
      }
    });

    // --- B. GASTOS (INVENTARIO / DESTAJO) ---
    await subirLote(BANDEJAS.inventario, (registros) =>
      supabase.from('inventory').upsert(registros, { onConflict: 'local_uuid' })
    );

    // --- C. TRABAJADORES NUEVOS ---
    await subirLote(BANDEJAS.trabajadores, (registros) =>
      supabase.from('workers').upsert(registros, { onConflict: 'local_uuid' })
    );

    // --- D. ASISTENCIA Y NÓMINA ---
    // Los trabajadores todavía sin id real (temp_) no se pueden subir aún.
    await subirLote(
      BANDEJAS.nomina,
      (registros) => supabase.from('payroll_records').upsert(registros, { onConflict: 'worker_id,week_start' }),
      (registros) => registros.filter((r: any) => !String(r.worker_id).startsWith('temp_'))
    );

    // --- E. INGRESOS DE OBRA (FONDEOS) ---
    // Sin columna local_uuid en la tabla: por eso va uno por uno y solo se
    // borra de la bandeja el que confirmó, para no duplicar depósitos.
    await subirUnoPorUno(BANDEJAS.ingresos, async (ingreso) => {
      const { local_uuid, ...datos } = ingreso;
      const { error } = await supabase.from('ingresos_obra').insert([datos]);
      if (error) throw error;
    });

    // --- F. PLANOS Y DOCUMENTOS PESADOS ---
    await subirUnoPorUno(BANDEJAS.planos, async (doc) => {
      const url = await subirArchivo(doc.local_file_uri, 'planos_obras', {
        prefijo: 'doc',
        extension: 'pdf',
        contentType: 'application/pdf',
      });

      const { error: dbError } = await supabase.from('planos').insert([
        { title: doc.title, category: doc.category, version: doc.version, file_url: url, project_id: doc.project_id }
      ]);
      if (dbError) throw dbError;

      // Ya subió: liberamos el espacio guardado
      await borrarArchivoLocal(doc.local_file_uri);
    });

    // --- G. CAJA CHICA (EGRESOS) ---
    await subirUnoPorUno(BANDEJAS.caja, async (gasto) => {
      // Se conservan TODOS los campos del gasto (nota, encargado, desglose...).
      // Solo quitamos lo que es puramente local.
      const { foto_local_uri, ...datos } = gasto;
      let fotoUrl = gasto.foto_ticket ?? null;

      if (foto_local_uri) {
        // Bucket 'tickets_caja_chica': es el que existe en Supabase.
        // Si la foto falla, el gasto entero se queda para reintentar.
        fotoUrl = await subirFoto(foto_local_uri, 'tickets_caja_chica');
      }

      const { error } = await supabase
        .from('caja_chica')
        .upsert([{ ...datos, foto_ticket: fotoUrl }], { onConflict: 'local_uuid' });
      if (error) throw error;

      if (foto_local_uri) await borrarArchivoLocal(foto_local_uri);
    });

    if (subidos > 0) {
      setLastSync(Date.now());
      Aviso.alert(
        'Sincronización exitosa',
        `Se subieron ${subidos} ${subidos === 1 ? 'registro guardado' : 'registros guardados'} sin conexión.`
      );
    }
  } catch (error) {
    console.error('Fallo general al procesar la cola offline:', error);
  }
};

  return (
    <ProjectContext.Provider value={{ activeProject, setActiveProject, isOffline, lastSync }}>
      {children}
      
      {/* Botón de refrescar: en web la pantalla no se recarga sola al volver a
          ella, así que hay que poder pedir datos frescos a mano. */}
      {!isOffline && hayQueRefrescar && (
        <Pressable
          onPress={refrescar}
          disabled={refrescando}
          style={({ pressed }) => [styles.botonRefrescar, pressed && { opacity: 0.7 }]}
          accessibilityLabel="Actualizar datos de esta pantalla"
        >
          <Feather name="refresh-cw" size={16} color="#1A56DB" style={refrescando ? { opacity: 0.4 } : undefined} />
        </Pressable>
      )}

      {isOffline && (
        <View style={styles.offlineBanner}>
          <Feather name="wifi-off" size={14} color="#FFF" style={{ marginRight: 8 }} />
          <Text style={styles.offlineText}>
            {pendientes > 0
              ? `Sin conexión - ${pendientes} ${pendientes === 1 ? 'registro guardado' : 'registros guardados'}`
              : 'Sin conexión - Guardando localmente'}
          </Text>
        </View>
      )}

      {/* Con internet pero con cosas sin subir: hay que decirlo, no esconderlo.
          Si esto se queda fijo, algo está fallando al subir. */}
      {!isOffline && pendientes > 0 && (
        <View style={[styles.offlineBanner, styles.pendingBanner]}>
          <Feather name="upload-cloud" size={14} color="#FFF" style={{ marginRight: 8 }} />
          <Text style={styles.offlineText}>
            {pendientes} {pendientes === 1 ? 'registro pendiente' : 'registros pendientes'} por subir
          </Text>
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
  offlineBanner: { pointerEvents: 'none', position: 'absolute', top: Platform.OS === 'ios' ? 50 : 40, alignSelf: 'center', backgroundColor: '#D97706', paddingVertical: 8, paddingHorizontal: 20, borderRadius: 20, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', zIndex: 9999, elevation: 10, boxShadow: '0px 4px 5px rgba(0, 0, 0, 0.3)',    },
  offlineText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  pendingBanner: { backgroundColor: '#1A56DB' },
  botonRefrescar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 52 : 42,
    right: 14,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9998,
    elevation: 6,
    boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.18)', 
    
    
    
  }
});