import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useProject } from '../context/ProjectContext';
import { supabase } from '../lib/supabase';
import { generarPlantillaGastos } from './utils/pdfGastosGen';

export default function GastosGeneralesScreen() {
  const router = useRouter();
  const { activeProject, isOffline } = useProject();
  
  const [loading, setLoading] = useState(true);
  const [resumen, setResumen] = useState({ destajo: 0, caja: 0, otros: 0 });
  const [detallesDestajo, setDetallesDestajo] = useState<any[]>([]);
  const [detallesCaja, setDetallesCaja] = useState<any[]>([]);
  const [detallesOtros, setDetallesOtros] = useState<any[]>([]);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  useEffect(() => {
    fetchData();
  }, [activeProject, isOffline]);

  const fetchData = async () => {
    setLoading(true);
    const pid = activeProject?.id;
    if (!pid) return;

    const storageKey = `@gastos_generales_cache_${pid}`;

    // MODO OFFLINE: leer desde cache
    if (isOffline) {
      try {
        const cached = await AsyncStorage.getItem(storageKey);
        if (cached) {
          const { destajo, caja, otros } = JSON.parse(cached);
          setDetallesDestajo(destajo);
          setDetallesCaja(caja);
          setDetallesOtros(otros);
          setResumen({
            destajo: destajo.reduce((acc: number, curr: any) => acc + (curr.quantity * curr.unit_price), 0),
            caja: caja.reduce((acc: number, curr: any) => acc + Number(curr.monto), 0),
            otros: otros.reduce((acc: number, curr: any) => acc + Number(curr.monto), 0),
          });
        }
      } catch (e) {
        console.log("Error leyendo cache gastos:", e);
      } finally {
        setLoading(false);
      }
      return;
    }

    // MODO ONLINE: fetch normal
    try {
      const [invRes, cajaRes, otrosRes] = await Promise.all([
        supabase.from('inventory').select('*').eq('project_id', pid).eq('is_active', true),
        supabase.from('caja_chica').select('*').eq('project_id', pid).eq('is_active', true),
        supabase.from('gastos_generales').select('*').eq('project_id', pid).eq('is_active', true),
      ]);

      const inv = invRes.data || [];
      const caja = cajaRes.data || [];
      const otros = otrosRes.data || [];

      setDetallesDestajo(inv);
      setDetallesCaja(caja);
      setDetallesOtros(otros);
      setResumen({
        destajo: inv.reduce((acc, curr) => acc + (curr.quantity * curr.unit_price), 0),
        caja: caja.reduce((acc, curr) => acc + Number(curr.monto), 0),
        otros: otros.reduce((acc, curr) => acc + Number(curr.monto), 0),
      });

      // Guardar en cache para uso offline
      await AsyncStorage.setItem(storageKey, JSON.stringify({ destajo: inv, caja, otros }));

    } catch (error) {
      console.log("Error cargando resumen:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePDF = async () => {
    setIsGeneratingPDF(true);
    try {
      const htmlContent = generarPlantillaGastos(
        activeProject?.name || 'Obra Sin Nombre',
        resumen,
        detallesDestajo,
        detallesCaja,
        detallesOtros
      );
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (error: any) {
      Alert.alert("Error", "No se pudo generar el PDF: " + error.message);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const totalObra = resumen.destajo + resumen.caja + resumen.otros;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="chevron-left" size={28} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.title}>Gastos Generales</Text>
        {loading ? (
          <ActivityIndicator color="#FFF" style={{ marginTop: 10 }} />
        ) : (
          <Text style={styles.total} adjustsFontSizeToFit numberOfLines={1}>
            Total: ${totalObra.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </Text>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

        {/* BANNER OFFLINE */}
        {isOffline && (
          <View style={{ backgroundColor: '#FEF3C7', padding: 10, borderRadius: 8, marginBottom: 15, flexDirection: 'row', alignItems: 'center' }}>
            <Feather name="wifi-off" size={16} color="#D97706" style={{ marginRight: 8 }} />
            <Text style={{ color: '#D97706', fontSize: 12, flex: 1 }}>Mostrando datos guardados. Conéctate para ver los más recientes.</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>Desglose por área</Text>

        <View style={styles.item}>
          <View style={styles.itemLeft}>
            <View style={[styles.iconBox, { backgroundColor: '#FEF3C7' }]}>
              <Feather name="package" size={20} color="#D97706" />
            </View>
            <Text style={styles.itemLabel}>Destajos y Materiales</Text>
          </View>
          <Text style={styles.itemValue}>${resumen.destajo.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</Text>
        </View>

        <View style={styles.item}>
          <View style={styles.itemLeft}>
            <View style={[styles.iconBox, { backgroundColor: '#FCE7F3' }]}>
              <Feather name="dollar-sign" size={20} color="#DB2777" />
            </View>
            <Text style={styles.itemLabel}>Caja Chica</Text>
          </View>
          <Text style={styles.itemValue}>${resumen.caja.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</Text>
        </View>

        <View style={styles.item}>
          <View style={styles.itemLeft}>
            <View style={[styles.iconBox, { backgroundColor: '#EDE9FE' }]}>
              <Feather name="pie-chart" size={20} color="#7C3AED" />
            </View>
            <Text style={styles.itemLabel}>Gastos de Administración</Text>
          </View>
          <Text style={styles.itemValue}>${resumen.otros.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</Text>
        </View>

        <TouchableOpacity style={styles.pdfBtn} onPress={handleGeneratePDF} disabled={isGeneratingPDF}>
          {isGeneratingPDF ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Feather name="file-text" size={20} color="#FFF" />
              <Text style={styles.pdfBtnText}>Generar Reporte Consolidado</Text>
            </>
          )}
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  header: { backgroundColor: '#2563EB', paddingTop: 60, paddingBottom: 30, paddingHorizontal: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  backButton: { padding: 5, marginLeft: -5, top: 10, left: 10 },
  title: { color: '#FFF', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  total: { color: '#FFF', fontSize: 36, fontWeight: 'bold', textAlign: 'center', marginTop: 5 },
  body: { padding: 20, paddingBottom: 40 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#475569', marginBottom: 15, marginTop: 5 },
  item: { backgroundColor: '#FFF', padding: 16, borderRadius: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
  itemLeft: { flexDirection: 'row', alignItems: 'center' },
  iconBox: { padding: 10, borderRadius: 10, marginRight: 15 },
  itemLabel: { fontSize: 14, color: '#334155', fontWeight: '500' },
  itemValue: { fontSize: 16, fontWeight: 'bold', color: '#0F172A' },
  pdfBtn: { backgroundColor: '#DC2626', padding: 18, borderRadius: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 30, elevation: 3, shadowColor: '#DC2626', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5 },
  pdfBtnText: { color: '#FFF', marginLeft: 10, fontWeight: 'bold', fontSize: 16 }
});