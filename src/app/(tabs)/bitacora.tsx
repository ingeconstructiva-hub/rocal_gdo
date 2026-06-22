import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useProject } from '../../context/ProjectContext';
import { useUser } from '../../context/UserContext'; // 🧠 Importamos el motor de roles
import { supabase } from '../../lib/supabase';
import { generarPlantillaBitacora } from '../utils/pdfTemplate';

export default function BitacoraScreen() {
  const router = useRouter();
  const { activeProject, isOffline } = useProject();
  const { profile } = useUser(); // 🧠 Obtenemos el rol del usuario

  const [logs, setLogs] = useState<any[]>([]);
  const [categoryStats, setCategoryStats] = useState<any[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  // Validador rápido de permisos
  const isAdmin = profile?.role === 'admin';

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Estructura': return '#4F46E5'; 
      case 'Concreto': return '#059669';   
      case 'Eléctrico': return '#D97706';  
      case 'Seguridad': return '#DC2626';  
      case 'Acabados': return '#8B5CF6';   
      default: return '#2563EB';           
    }
  };

  const processData = (data: any[]) => {
    setLogs(data);
    const counts: Record<string, number> = {};
    data.forEach(log => {
      const cat = log.category || 'General';
      counts[cat] = (counts[cat] || 0) + 1;
    });

    const sortedStats = Object.keys(counts).map(key => ({
      label: key,
      count: counts[key],
      color: getCategoryColor(key)
    })).sort((a, b) => b.count - a.count);

    setCategoryStats(sortedStats);
  };

  useFocusEffect(
    useCallback(() => {
      if (activeProject?.id) {
        fetchLogs();
      }
    }, [activeProject, isOffline])
  );

  const fetchLogs = async () => {
    if (!activeProject?.id) return;
    const storageKey = `@bitacora_cache_${activeProject.id}`;

    const getOutboxLogs = async () => {
      try {
        const outboxData = await AsyncStorage.getItem('@bandeja_salida_logs');
        if (outboxData) {
          const parsed = JSON.parse(outboxData);
          return parsed
            .filter((log: any) => log.project_id === activeProject.id)
            .map((log: any) => ({ ...log, isPending: true }));
        }
      } catch (e) { console.log(e); }
      return [];
    };

    if (isOffline) {
      try {
        const cachedData = await AsyncStorage.getItem(storageKey);
        let finalLogs = cachedData ? JSON.parse(cachedData) : [];

        const pendingLogs = await getOutboxLogs();
        finalLogs = [...pendingLogs, ...finalLogs];
        
        finalLogs.sort((a: any , b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        processData(finalLogs);
      } catch (error) {
        console.error("Error leyendo caché:", error);
      }
    } else {
      try {
        const { data, error } = await supabase
          .from('logs')
          .select('*')
          .eq('project_id', activeProject.id) 
          .order('created_at', { ascending: false });

        if (error) throw error;
        
        if (data) {
          const pendingLogs = await getOutboxLogs();
          let finalLogs = [...pendingLogs, ...data];
          finalLogs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          
          processData(finalLogs);
          await AsyncStorage.setItem(storageKey, JSON.stringify(data)); 
        }
      } catch (error: any) {
        if (error.message !== 'Network request failed' && error.message !== 'Failed to fetch') {
          console.error("Error al cargar bitácora:", error);
        }
      }
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth();
    
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.getDate() === yesterday.getDate() && date.getMonth() === yesterday.getMonth();

    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const time = `${hours}:${minutes}`;

    if (isToday) return `Hoy ${time}`;
    if (isYesterday) return `Ayer ${time}`;
    
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}/${month} ${time}`;
  };

  const ejecutarGeneracionPDF = async () => {
    setIsExporting(true);
    try {
      const htmlContent = await generarPlantillaBitacora(logs, isOffline);

      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri, { 
        UTI: '.pdf', 
        mimeType: 'application/pdf',
        dialogTitle: 'Exportar Bitácora de Obra'
      });
    } catch (error) {
      console.error("Error al exportar:", error);
      Alert.alert("Error", "Ocurrió un problema al generar el documento.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPDF = async () => {
    if (logs.length === 0) {
      Alert.alert("Sin datos", "No hay entradas en la bitácora para exportar.");
      return;
    }
    
    if (isOffline) {
      Alert.alert(
        "Modo Lectura Activo",
        "El PDF se generará con tus textos y notas. Tus fotos nuevas offline aparecerán bien, pero las fotos antiguas de la nube no saldrán porque no hay internet para descargarlas.\n\n¿Deseas generarlo?",
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Sí, generar PDF", onPress: ejecutarGeneracionPDF }
        ]
      );
    } else {
      ejecutarGeneracionPDF();
    }
  };

  const maxCount = categoryStats.length > 0 ? categoryStats[0].count : 1;

  const handleAddNewLog = () => {
    router.push('/new-log');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Feather name="chevron-left" size={28} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerSubtitle}>GESTIÓN DE OBRA</Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={styles.headerBottomRow}>
          <Text style={styles.headerTitle}>Bitácora de Obra</Text>
        </View>
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        
        <View style={styles.chartCard}>
          <Text style={styles.sectionTitle}>ACTIVIDAD POR CONCEPTO</Text>
          {categoryStats.length === 0 ? (
            <Text style={styles.emptyStateText}>Registra tu primera nota para ver la actividad.</Text>
          ) : (
            categoryStats.map((item, index) => {
              const widthPercentage = Math.max((item.count / maxCount) * 100, 5);
              return (
                <View key={index} style={styles.chartRow}>
                  <View style={styles.chartTextRow}>
                    <Text style={styles.chartLabel}>{item.label}</Text>
                    <Text style={[styles.chartValue, { color: item.color }]}>{item.count} {item.count === 1 ? 'nota' : 'notas'}</Text>
                  </View>
                  <View style={styles.chartBarBackground}>
                    <View style={[styles.chartBarFill, { width: `${widthPercentage}%`, backgroundColor: item.color }]} />
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>HISTORIAL DE ENTRADAS</Text>
          
          {/* 🔒 El botón de Exportar PDF solo es visible para el Administrador */}
          {isAdmin && (
            <TouchableOpacity style={styles.pdfButton} onPress={handleExportPDF} disabled={isExporting}>
              {isExporting ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <><Feather name="file-text" size={14} color="#FFF" /><Text style={styles.saveButtonText}>Exportar PDF</Text></>
              )}
            </TouchableOpacity>
          )}
        </View>

        {logs.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No hay entradas en la bitácora aún.</Text>
          </View>
        ) : (
          logs.map((log) => (
            <View key={log.id || Math.random().toString()} style={[styles.entryCard, log.isPending && styles.entryCardPending]}>
              <View style={styles.entryHeader}>
                <Text style={styles.entryTitle} numberOfLines={1}>{log.description}</Text>
                <View style={styles.photoBadge}>
                  <Feather name="camera" size={14} color="#6B7280" />
                  <Text style={styles.photoCount}>{log.photo_url ? '1' : '0'}</Text>
                </View>
              </View>

              <View style={styles.entryMetaRow}>
                <Feather name="user" size={14} color="#6B7280" />
                <Text style={styles.entryMetaText}>Ingeniero</Text>
                <Text style={styles.entryMetaDot}>•</Text>
                
                {log.isPending ? (
                  <>
                    <Feather name="refresh-cw" size={14} color="#D97706" />
                    <Text style={[styles.entryMetaText, { color: '#D97706', fontWeight: 'bold' }]}>Pendiente de subir</Text>
                  </>
                ) : (
                  <>
                    <Feather name="clock" size={14} color="#6B7280" />
                    <Text style={styles.entryMetaText}>{formatTime(log.created_at)}</Text>
                  </>
                )}
              </View>

              <View style={styles.tagsRow}>
                <View style={styles.primaryTag}><Text style={styles.primaryTagText}>{log.category}</Text></View>
                {log.sector && <View style={styles.secondaryTag}><Text style={styles.secondaryTagText}>{log.sector}</Text></View>}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={handleAddNewLog}>
        <Feather name="plus" size={28} color="#FFF" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F8' },
  header: { backgroundColor: '#2563EB', paddingTop: 60, paddingBottom: 25, paddingHorizontal: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 },
  backButton: { padding: 4, marginLeft: -4 },
  headerSubtitle: { color: 'rgba(255, 255, 255, 0.8)', fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  headerBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: '#FFF', fontSize: 26, fontWeight: 'bold' },
  
  body: { padding: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#6B7280', letterSpacing: 0.5 },
  
  chartCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 20, marginBottom: 25, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3 },
  chartRow: { marginBottom: 16 },
  chartTextRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  chartLabel: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
  chartValue: { fontSize: 14, fontWeight: 'bold' },
  chartBarBackground: { height: 8, backgroundColor: '#E5E7EB', borderRadius: 4, overflow: 'hidden' },
  chartBarFill: { height: '100%', borderRadius: 4 },

  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 5, marginBottom: 15 },
  pdfButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#DC2626', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10 },
  saveButtonText: { color: '#FFF', fontSize: 12, fontWeight: 'bold', marginLeft: 4 },

  entryCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 18, marginBottom: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  entryCardPending: { borderWidth: 1, borderColor: '#FCD34D', backgroundColor: '#FFFBEB' },
  entryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  entryTitle: { flex: 1, fontSize: 16, fontWeight: 'bold', color: '#111827', marginRight: 10, lineHeight: 22 },
  photoBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  photoCount: { marginLeft: 4, fontSize: 12, fontWeight: 'bold', color: '#6B7280' },
  
  entryMetaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  entryMetaText: { fontSize: 13, color: '#6B7280', marginLeft: 4, fontWeight: '500' },
  entryMetaDot: { fontSize: 12, color: '#9CA3AF', marginHorizontal: 8 },

  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primaryTag: { backgroundColor: '#EFF6FF', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16 },
  primaryTagText: { color: '#2563EB', fontSize: 12, fontWeight: '700' },
  secondaryTag: { backgroundColor: '#F3F4F6', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16 },
  secondaryTagText: { color: '#4B5563', fontSize: 12, fontWeight: '600' },

  emptyState: { padding: 20, alignItems: 'center' },
  emptyStateText: { color: '#9CA3AF', fontStyle: 'italic', fontSize: 14 },

  fab: { position: 'absolute', bottom: 30, right: 25, backgroundColor: '#2563EB', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: '#2563EB', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5 }
});