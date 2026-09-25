'use client';

import { Feather } from '@expo/vector-icons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Almacen from '../../lib/almacen';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { regresar } from '../../lib/navegar';
import { Aviso } from '../../lib/aviso';
import { useProject } from '../../context/ProjectContext';
import { useUser } from '../../context/UserContext';
import { supabase } from '../../lib/supabase';

export default function GastosHubScreen() {
  const router = useRouter();
  const { activeProject, isOffline } = useProject();
  const { profile } = useUser();

  const [isSyncingAll, setIsSyncingAll] = useState(false);

  /**
   * 📌 NOTA: handleSyncAllGastos
   * Sincroniza en paralelo todos los módulos financieros de la obra activa
   * (Destajos, Caja Chica, Ingresos, Maquinaria y Gastos Generales)
   * consultando a Supabase y reescribiendo la caché local de Almacen.
   */
  const handleSyncAllGastos = async () => {
    if (isOffline) {
      Aviso.alert("Modo Offline", "Conéctate a internet para sincronizar los datos con el servidor web.");
      return;
    }

    const projectId = activeProject?.id;
    if (!projectId) {
      Aviso.alert("Atención", "No hay una obra activa seleccionada.");
      return;
    }

    setIsSyncingAll(true);

    try {
      // 🟢 Consultas simultáneas a todas las tablas financieras
      const [
        destajosRes,
        cajaEgresosRes,
        cajaIngresosRes,
        maquinariaRes,
        generalesRes
      ] = await Promise.all([
        supabase.from('inventory').select('*').eq('project_id', projectId).eq('is_active', true).order('created_at', { ascending: false }),
        supabase.from('caja_chica').select('*').eq('project_id', projectId).eq('is_active', true),
        supabase.from('ingresos_obra').select('*').eq('project_id', projectId).eq('is_active', true),
        supabase.from('gastos_maquinaria').select('*').eq('project_id', projectId).eq('is_active', true).order('fecha', { ascending: true }),
        supabase.from('gastos_generales').select('*').eq('project_id', projectId).eq('is_active', true).order('fecha', { ascending: false })
      ]);

      // Guardar en las llaves de caché correspondientes
      if (destajosRes.data) {
        await Almacen.setItem(`@inventario_cache_${projectId}`, JSON.stringify(destajosRes.data));
      }
      if (cajaEgresosRes.data) {
        await Almacen.setItem(`@caja_chica_cache_${projectId}`, JSON.stringify(cajaEgresosRes.data));
      }
      if (cajaIngresosRes.data) {
        await Almacen.setItem(`@ingresos_cache_${projectId}`, JSON.stringify(cajaIngresosRes.data));
      }
      if (maquinariaRes.data) {
        await Almacen.setItem(`@gastos_maquinaria_log_${projectId}`, JSON.stringify(maquinariaRes.data));
      }
      if (generalesRes.data) {
        await Almacen.setItem(`@gastos_generales_log_${projectId}`, JSON.stringify(generalesRes.data));
      }

      Aviso.alert(
        "¡Sincronización Completa!", 
        "Todos los módulos de gastos (Destajos, Caja Chica, Maquinaria y Gastos Generales) se han actualizado desde el servidor web."
      );
    } catch (error: any) {
      Aviso.alert("Error de Sincronización", error.message || "No se pudo actualizar la información.");
    } finally {
      setIsSyncingAll(false);
    }
  };

  const allOptions = [
    {
      title: 'Control de Destajos',
      sub: 'Materiales, volúmenes y mano de obra',
      type: 'Feather',
      icon: 'package', 
      color: '#F59E0B',
      path: '../destajo',
      roles: ['admin', 'residente', 'oficina']
    },
    {
      title: 'Caja Chica',
      sub: 'Gastos menores del día a día',
      type: 'Feather',
      icon: 'dollar-sign', 
      color: '#EC4899',
      path: '../caja_chica',
      roles: ['admin', 'residente', 'oficina']
    },
    {
      title: 'Gastos de Maquinaria',
      sub: 'Costos horarios, operación y mantenimiento',
      type: 'material-community',
      icon: 'tractor', 
      color: '#4750f6',
      path: '../gastos_maquinaria',
      roles: ['admin', 'residente', 'oficina']
    },
    {
      title: 'Gastos Generales',
      sub: 'Trámites, facturas y administración central',
      type: 'material-community', 
      icon: 'office-building-cog', 
      color: '#8B5CF6',
      path: '../gastos_generales',
      roles: ['admin', 'oficina']
    },
    {
      title: 'Análisis de Gastos',
      sub: 'Rentabilidad, gráficas y balance general',
      type: 'material-community',
      icon: 'chart-line', 
      color: '#1823f8',
      path: '../resumen_diario',
      roles: ['admin', 'oficina']
    }
  ];

  const visibleOptions = allOptions.filter(opt => opt.roles.includes(profile?.role || 'residente'));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={() => regresar()} style={styles.backButton}>
            <Feather name="chevron-left" size={28} color="#FFF" />
          </TouchableOpacity>
          
          <Text style={styles.headerSubtitle}>GASTOS</Text>
          
          {/* 🟢 BOTÓN DE ACTUALIZACIÓN GLOBAL DE TODOS LOS MÓDULOS */}
          <TouchableOpacity 
            onPress={handleSyncAllGastos} 
            disabled={isSyncingAll}
            style={styles.syncButton}
            activeOpacity={0.7}
          >
            {isSyncingAll ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Feather name="refresh-cw" size={18} color="#FFF" />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.headerBottomRow}>
          <Text style={styles.headerTitle}>Administración Financiera</Text>
          {activeProject?.name && (
            <Text style={styles.headerSmall}>📍 {activeProject.name}</Text>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {visibleOptions.map((opt, i) => (
          <TouchableOpacity key={i} style={styles.card} onPress={() => router.push(opt.path as any)} activeOpacity={0.7}>
            <View style={[styles.iconBox, { backgroundColor: opt.color }]}>
              {opt.type === 'Feather' ? (
                <Feather name={opt.icon as any} size={28} color="#FFF" />
              ) : (
                <MaterialCommunityIcons name={opt.icon as any} size={28} color="#FFF" />
              )}  
            </View>
            <View style={styles.textBox}>
              <Text style={styles.cardTitle}>{opt.title}</Text>
              <Text style={styles.cardSub}>{opt.sub}</Text>
            </View>
            <Feather name="chevron-right" size={20} color="#CBD5E1" />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { backgroundColor: '#2563EB', paddingTop: 60, paddingBottom: 25, paddingHorizontal: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  backButton: { padding: 4, marginLeft: -4 },
  headerSubtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  syncButton: { 
    width: 36, 
    height: 36, 
    borderRadius: 10, 
    backgroundColor: 'rgba(255, 255, 255, 0.2)', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  headerBottomRow: { flexDirection: 'column', alignItems: 'center', marginTop: 5 },
  headerTitle: { color: '#FFF', fontSize: 22, fontWeight: 'bold' },
  headerSmall: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 4, fontWeight: '600' },
  body: { padding: 20, paddingBottom: 60 },
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, flexDirection: 'row', alignItems: 'center', marginBottom: 15, elevation: 2, boxShadow: '0px 0px 5px rgba(0, 0, 0, 0.05)',   },
  iconBox: { width: 55, height: 55, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  textBox: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#1E293B' },
  cardSub: { fontSize: 13, color: '#64748B', marginTop: 3 }
});