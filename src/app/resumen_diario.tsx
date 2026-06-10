import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PieChart } from 'react-native-chart-kit';
import { useProject } from '../context/ProjectContext';
import { supabase } from '../lib/supabase';

const screenWidth = Dimensions.get('window').width;

// Paleta de colores ejecutiva para los rubros financieros
const chartColors = ['#4F46E5', '#2563EB', '#EF4444', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#14B8A6'];

interface CategoriaCosto {
  nombre: string;
  importe: number;
  porcentaje: number;
  color: string;
  legendFontColor: string;
  legendFontSize: number;
}

export default function ResumenDiarioScreen() {
  const router = useRouter();
  const { activeProject, isOffline } = useProject();
  
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'general' | 'analisis'>('general');

  // Estados financieros unificados
  const [balanceGeneral, setBalanceGeneral] = useState({ ingresos: 0, egresos: 0, disponible: 0 });
  const [analisisCostos, setAnalisisCostos] = useState<CategoriaCosto[]>([]);

  useEffect(() => {
    if (activeProject?.id) {
      cargarHistorialFinanciero();
    }
  }, [activeProject, isOffline]);

  const cargarHistorialFinanciero = async () => {
    setLoading(true);
    const pid = activeProject?.id;
    if (!pid) return;

    const storageKeyCaja = `@caja_chica_cache_${pid}`;
    const storageKeyIngresos = `@ingresos_cache_${pid}`;
    const storageKeyNomina = `@nomina_cache_${pid}`;

    // 1. Cargar gastos atrapados en la bandeja de salida local (Caja Chica Offline)
    let gastosPendientesLocales: any[] = [];
    try {
      const pendingData = await AsyncStorage.getItem('@bandeja_salida_caja');
      if (pendingData) {
        const allPending = JSON.parse(pendingData);
        gastosPendientesLocales = allPending.filter((g: any) => g.project_id === pid);
      }
    } catch (e) {
      console.log("Error leyendo bandeja de salida:", e);
    }

    try {
      let listaEgresos: any[] = [];
      let listaIngresos: any[] = [];
      let listaNomina: any[] = [];

      if (isOffline) {
        // MODO OFFLINE: Jalamos de las memorias caché locales
        const cachedCaja = await AsyncStorage.getItem(storageKeyCaja);
        const cachedIngresos = await AsyncStorage.getItem(storageKeyIngresos);
        const cachedNomina = await AsyncStorage.getItem(storageKeyNomina);
        
        listaEgresos = cachedCaja ? JSON.parse(cachedCaja) : [];
        listaIngresos = cachedIngresos ? JSON.parse(cachedIngresos) : [];
        listaNomina = cachedNomina ? JSON.parse(cachedNomina) : [];
      } else {
        // MODO ONLINE: Consultamos la nube en tiempo real (Caja Chica, Ingresos y Nóminas)
        const { data: egresos, error: errE } = await supabase.from('caja_chica').select('*').eq('project_id', pid).eq('is_active', true);
        const { data: ingresos, error: errI } = await supabase.from('ingresos_obra').select('*').eq('project_id', pid).eq('is_active', true);
        
        // 📥 CONSULTA DE NÓMINA: Jalamos los registros de rayas semanales calculadas
        const { data: nomina, error: errN } = await supabase.from('payroll_records').select('*').eq('project_id', pid);

        if (errE || errI || errN) throw new Error(errE?.message || errI?.message || errN?.message || "Error en queries");

        listaEgresos = egresos || [];
        listaIngresos = ingresos || [];
        listaNomina = nomina || [];

        // Respaldamos los datos limpios en la caché
        await AsyncStorage.setItem(storageKeyCaja, JSON.stringify(listaEgresos));
        await AsyncStorage.setItem(storageKeyIngresos, JSON.stringify(listaIngresos));
        await AsyncStorage.setItem(storageKeyNomina, JSON.stringify(listaNomina));
      }

      // Fusionamos los egresos de caja chica de la base de datos con los locales pendientes
      const todosLosEgresosCaja = [...gastosPendientesLocales, ...listaEgresos];

      // --- CÁLCULO DE TOTALES ---
      const totalIngresos = listaIngresos.reduce((sum, i) => sum + Number(i.monto), 0);
      const totalCajaChica = todosLosEgresosCaja.reduce((sum, e) => sum + Number(e.monto), 0);
      
      // Calculamos el costo acumulado de la nómina (Mano de Obra) utilizando la columna total_amount o monto
      const totalManoObra = listaNomina.reduce((sum, n) => sum + Number(n.final_salary || 0), 0);

      // El egreso global es la suma de Caja Chica + Nómina
      const totalEgresosGlobal = totalCajaChica + totalManoObra;

      setBalanceGeneral({
        ingresos: totalIngresos,
        egresos: totalEgresosGlobal,
        disponible: totalIngresos - totalEgresosGlobal
      });

      // --- CÁLCULO DE RUBROS (EXPLOSIÓN DE INSUMOS FINANCIEROS) ---
      const grupos: { [key: string]: number } = {};
      
      // 1. Insertamos de golpe el rubro de Nómina si es que ya existen pagos
      if (totalManoObra > 0) {
        grupos['Mano de Obra (Nómina)'] = totalManoObra;
      }

      // 2. Agrupamos los gastos corrientes de caja chica por unidad/frente
      todosLosEgresosCaja.forEach(gasto => {
        const rubro = gasto.unidad && gasto.unidad.trim() !== '' ? gasto.unidad.trim() : 'Gastos Generales';
        if (!grupos[rubro]) grupos[rubro] = 0;
        grupos[rubro] += Number(gasto.monto);
      });

      const analisisArreglo: CategoriaCosto[] = Object.keys(grupos).map((key, index) => {
        const importe = grupos[key];
        const porcentaje = totalEgresosGlobal > 0 ? (importe / totalEgresosGlobal) * 100 : 0;
        return {
          nombre: key,
          importe: importe,
          porcentaje: porcentaje,
          color: chartColors[index % chartColors.length],
          legendFontColor: '#475569',
          legendFontSize: 11
        };
      });

      // Ordenamos la explosión de mayor a menor costo
      analisisArreglo.sort((a, b) => b.importe - a.importe);
      setAnalisisCostos(analisisArreglo);

    } catch (e: any) {
      Alert.alert("Aviso de Información", e.message || "Se están mostrando los datos financieros locales.");
    } finally {
      setLoading(false);
    }
  };

  const renderTabContent = () => {
    // --- PESTAÑA 1: RESUMEN FINANCIERO GENERAL ---
    if (activeTab === 'general') {
      const porcentajeConsumido = balanceGeneral.ingresos > 0 ? (balanceGeneral.egresos / balanceGeneral.ingresos) * 100 : 0;
      
      return (
        <View>
          <Text style={styles.sectionTitle}>Estado de Cuenta de la Obra</Text>
          
          {/* Card Principal: Disponible Real */}
          <View style={styles.mainBalanceCard}>
            <Text style={styles.mainBalanceLabel}>SALDO DISPONIBLE NETO</Text>
            <Text style={[styles.mainBalanceValue, { color: balanceGeneral.disponible >= 0 ? '#10B981' : '#EF4444' }]}>
              ${balanceGeneral.disponible.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </Text>
            
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${Math.min(porcentajeConsumido, 100)}%`, backgroundColor: porcentajeConsumido > 90 ? '#EF4444' : '#2563EB' }]} />
            </View>
            <Text style={styles.progressText}>Presupuesto ejercido: {porcentajeConsumido.toFixed(1)}%</Text>
          </View>

          {/* Tarjetas Secundarias */}
          <View style={styles.generalCardsContainer}>
            <View style={[styles.infoCard, { borderColor: '#10B981' }]}>
              <View style={[styles.cardHeaderIcon, { backgroundColor: '#D1FAE5' }]}>
                <Feather name="arrow-down-left" size={20} color="#10B981" />
              </View>
              <Text style={[styles.infoCardValue, { color: '#059669' }]}>
                ${balanceGeneral.ingresos.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
              </Text>
              <Text style={styles.infoCardLabel}>Total Recibido</Text>
            </View>

            <View style={[styles.infoCard, { borderColor: '#EF4444' }]}>
              <View style={[styles.cardHeaderIcon, { backgroundColor: '#FEE2E2' }]}>
                <Feather name="arrow-up-right" size={20} color="#EF4444" />
              </View>
              <Text style={[styles.infoCardValue, { color: '#DC2626' }]}>
                ${balanceGeneral.egresos.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
              </Text>
              <Text style={styles.infoCardLabel}>Total Egresado</Text>
            </View>
          </View>

          <View style={styles.financialNoticeBox}>
            <Feather name="info" size={20} color="#475569" style={{ marginRight: 12 }} />
            <Text style={styles.financialNoticeText}>
              Este balance descuenta de forma automática las listas de raya semanales liberadas y los vales de caja chica.
            </Text>
          </View>
        </View>
      );
    }

    // --- PESTAÑA 2: ANÁLISIS DE COSTOS POR PARTICIPACIÓN ---
    return (
      <View>
        <View style={styles.analisisHeader}>
          <View>
            <Text style={styles.analisisLabel}>Costo Directo Controlado</Text>
            <Text style={styles.analisisTotal}>${balanceGeneral.egresos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.analisisLabel}>Rubros Activos</Text>
            <Text style={styles.analisisCount}>{analisisCostos.length}</Text>
          </View>
        </View>

        {analisisCostos.length > 0 ? (
          <View style={styles.chartContainer}>
            <PieChart
              data={analisisCostos.map(c => ({
                name: c.nombre.length > 12 ? c.nombre.substring(0, 12) + '.' : c.nombre,
                population: c.importe,
                color: c.color,
                legendFontColor: c.legendFontColor,
                legendFontSize: c.legendFontSize
              }))}
              width={screenWidth - 40}
              height={200}
              chartConfig={{ color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})` }}
              accessor={"population"}
              backgroundColor={"transparent"}
              paddingLeft={"15"}
              absolute
            />
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Registra movimientos o cierra una nómina para aperturar los gráficos.</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>Distribución General de Gastos e Insumos</Text>
        <View style={styles.tableCard}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, { flex: 2 }]}>Descripción del Rubro</Text>
            <Text style={[styles.tableHeaderText, { flex: 1.5, textAlign: 'right' }]}>Importe</Text>
            <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'right' }]}>% Part.</Text>
          </View>

          {analisisCostos.map((item, index) => (
            <View key={index} style={styles.tableRow}>
              <View style={[styles.tableCol, { flex: 2, flexDirection: 'row', alignItems: 'center' }]}>
                <View style={[styles.colorBox, { backgroundColor: item.color }]} />
                <Text style={styles.rowTextName} numberOfLines={1}>{item.nombre}</Text>
              </View>
              <Text style={[styles.rowTextValue, { flex: 1.5, textAlign: 'right' }]}>
                ${item.importe.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </Text>
              <Text style={[styles.rowTextValue, { flex: 1, textAlign: 'right', fontWeight: '700' }]}>
                {item.porcentaje.toFixed(2)}%
              </Text>
            </View>
          ))}
          
          <View style={styles.tableFooter}>
            <Text style={[styles.footerText, { flex: 2, paddingLeft: 18 }]}>Costo Total Erogado</Text>
            <Text style={[styles.footerText, { flex: 1.5, textAlign: 'right' }]}>
              ${balanceGeneral.egresos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </Text>
            <Text style={[styles.footerText, { flex: 1, textAlign: 'right' }]}>100.00%</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Feather name="chevron-left" size={28} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerSubtitle}>REPORTE GERENCIAL FINANCIERO</Text>
          <TouchableOpacity onPress={cargarHistorialFinanciero}>
            <Feather name="refresh-cw" size={18} color="#FFF" />
          </TouchableOpacity>
        </View>
        <Text style={styles.headerTitle}>{activeProject?.name || "Cargando Obra..."}</Text>
      </View>

      {/* TABS DE SELECCIÓN */}
      <View style={styles.tabBar}>
        <TouchableOpacity style={[styles.tabBtn, activeTab === 'general' && styles.tabBtnActive]} onPress={() => setActiveTab('general')}>
          <Text style={[styles.tabText, activeTab === 'general' && styles.tabTextActive]}>Resumen General</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, activeTab === 'analisis' && styles.tabBtnActive]} onPress={() => setActiveTab('analisis')}>
          <Text style={[styles.tabText, activeTab === 'analisis' && styles.tabTextActive]}>Análisis de Costos</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Procesando estados financieros consolidados...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {renderTabContent()}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { backgroundColor: '#2563EB', paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20, borderRadius: 20 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { padding: 4, marginLeft: -4 },
  headerSubtitle: { color: 'rgba(255, 255, 255, 0.6)', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginTop: 8 },
  
  tabBar: { flexDirection: 'row', backgroundColor: '#FFF', padding: 5, marginHorizontal: 15, marginTop: 15, marginBottom: 10, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabBtnActive: { backgroundColor: '#2563EB' },
  tabText: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  tabTextActive: { color: '#FFF', fontWeight: '700' },

  body: { paddingHorizontal: 15, paddingBottom: 40 },
  center: { marginTop: 120, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: '#64748B', fontSize: 13, marginTop: 12 },
  emptyCard: { backgroundColor: '#FFF', padding: 25, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 15 },
  emptyText: { textAlign: 'center', fontStyle: 'italic', color: '#94A3B8', fontSize: 13 },

  mainBalanceCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 20, marginBottom: 15, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', marginTop: 5 },
  mainBalanceLabel: { fontSize: 11, color: '#64748B', fontWeight: '700', letterSpacing: 0.5 },
  mainBalanceValue: { fontSize: 30, fontWeight: 'bold', marginTop: 6 },
  progressBarBg: { width: '100%', height: 8, backgroundColor: '#E2E8F0', borderRadius: 4, marginTop: 15, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 4 },
  progressText: { fontSize: 11, color: '#64748B', marginTop: 8, fontWeight: '500' },

  generalCardsContainer: { flexDirection: 'row', gap: 12, marginBottom: 15 },
  infoCard: { flex: 1, backgroundColor: '#FFF', padding: 16, borderRadius: 16, borderWidth: 1, elevation: 1, shadowColor: '#000', shadowOpacity: 0.01 },
  cardHeaderIcon: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  infoCardValue: { fontSize: 20, fontWeight: 'bold' },
  infoCardLabel: { fontSize: 11, color: '#64748B', marginTop: 2, fontWeight: '600' },
  financialNoticeBox: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 5 },
  financialNoticeText: { flex: 1, color: '#475569', fontSize: 12, lineHeight: 16, fontWeight: '500' },

  analisisHeader: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#FFF', padding: 16, borderRadius: 16, marginBottom: 15, borderWidth: 1, borderColor: '#E2E8F0' },
  analisisLabel: { fontSize: 11, color: '#64748B', fontWeight: '600', textTransform: 'uppercase' },
  analisisTotal: { fontSize: 22, fontWeight: 'bold', color: '#0F172A', marginTop: 4 },
  analisisCount: { fontSize: 22, fontWeight: 'bold', color: '#2563EB', marginTop: 4 },
  chartContainer: { backgroundColor: '#FFF', paddingVertical: 15, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 15, borderWidth: 1, borderColor: '#E2E8F0' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 10, marginLeft: 4, marginTop: 10 },
  
  tableCard: { backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#F8FAFC', paddingVertical: 12, paddingHorizontal: 15, borderBottomWidth: 1, borderColor: '#E2E8F0' },
  tableHeaderText: { fontSize: 11, fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 15, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', alignItems: 'center' },
  tableCol: { justifyContent: 'center' },
  colorBox: { width: 10, height: 10, borderRadius: 3, marginRight: 8 },
  rowTextName: { fontSize: 13, color: '#1E293B', fontWeight: '500', flex: 1 },
  rowTextValue: { fontSize: 13, color: '#334155' },
  tableFooter: { flexDirection: 'row', backgroundColor: '#F8FAFC', paddingVertical: 14, paddingHorizontal: 15, borderTopWidth: 1, borderTopColor: '#CBD5E1' },
  footerText: { fontSize: 12, fontWeight: 'bold', color: '#0F172A' }
});