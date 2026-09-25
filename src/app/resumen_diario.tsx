import { Feather } from '@expo/vector-icons';
import Almacen from '../lib/almacen';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SkeletonLista, SkeletonTarjeta } from '../components/Skeleton';
import { Aviso } from '../lib/aviso';
import { PieChart } from 'react-native-chart-kit';
import { useProject } from '../context/ProjectContext';
import { useUser } from '../context/UserContext'; // 🧠 Importamos el motor de roles
import { supabase } from '../lib/supabase';

const screenWidth = Dimensions.get('window').width;

// Colores fijos y ejecutivos para cada macro-rubro
const coloresFijos: Record<string, string> = {
  'Mano de Obra': '#2563EB',       // Azul
  'Maquinaria y Equipo': '#EF4444',// Rojo
  'Caja Chica': '#10B981',         // Verde
  'Destajos y Materiales': '#F59E0B',// Naranja
  'Gastos Generales': '#8B5CF6'    // Morado
};

const chartColors = ['#0891B2', '#C2410C', '#CA8A04', '#4F46E5', '#059669', '#047857', '#9333EA', '#16A34A'];

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
  const { profile } = useUser(); // 🧠 Extraemos el perfil activo
  
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'general' | 'analisis'>('general');

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

    const keys = {
      ingresos: `@ingresos_cache_${pid}`,
      caja: `@caja_chica_cache_${pid}`,
      nomina: `@nomina_cache_${pid}`,
      destajos: `@inventory_cache_${pid}`,
      generales: `@gastos_generales_cache_${pid}`,
      maquinaria: `@gastos_maquinaria_cache_${pid}`
    };

    let gastosPendientesLocales: any[] = [];
    try {
      const pendingData = await Almacen.getItem('@bandeja_salida_caja');
      if (pendingData) {
        gastosPendientesLocales = JSON.parse(pendingData).filter((g: any) => g.project_id === pid);
      }
    } catch (e) { console.log("Error leyendo bandeja de salida:", e); }

    try {
      let data: { ingresos: any[]; caja: any[]; nomina: any[]; destajos: any[]; generales: any[]; maquinaria: any[] } = { ingresos: [], caja: [], nomina: [], destajos: [], generales: [], maquinaria: [] };

      if (isOffline) {
        const caches = await Promise.all([
          Almacen.getItem(keys.ingresos), Almacen.getItem(keys.caja), Almacen.getItem(keys.nomina),
          Almacen.getItem(keys.destajos), Almacen.getItem(keys.generales), Almacen.getItem(keys.maquinaria)
        ]);
        
        data.ingresos = caches[0] ? JSON.parse(caches[0]) : [];
        data.caja = caches[1] ? JSON.parse(caches[1]) : [];
        data.nomina = caches[2] ? JSON.parse(caches[2]) : [];
        data.destajos = caches[3] ? JSON.parse(caches[3]) : [];
        
        const genCache = caches[4] ? JSON.parse(caches[4]) : [];
        data.generales = Array.isArray(genCache) ? genCache : (genCache.otros || []);
        
        data.maquinaria = caches[5] ? JSON.parse(caches[5]) : [];
      } else {
        const [resI, resC, resN, resD, resG, resM] = await Promise.all([
          supabase.from('ingresos_obra').select('monto').eq('project_id', pid).eq('is_active', true),
          supabase.from('caja_chica').select('monto').eq('project_id', pid).eq('is_active', true),
          supabase.from('payroll_records').select('final_salary').eq('project_id', pid).eq('is_active', true),
          supabase.from('inventory').select('quantity, unit_price').eq('project_id', pid).eq('is_active', true),
          supabase.from('gastos_generales').select('monto').eq('project_id', pid).eq('is_active', true),
          supabase.from('gastos_maquinaria').select('monto').eq('project_id', pid).eq('is_active', true),
        ]);

        data.ingresos = resI.data || [];
        data.caja = resC.data || [];
        data.nomina = resN.data || [];
        data.destajos = resD.data || [];
        data.generales = resG.data || [];
        data.maquinaria = resM.data || [];

        await Almacen.setItem(keys.ingresos, JSON.stringify(data.ingresos));
        await Almacen.setItem(keys.caja, JSON.stringify(data.caja));
        await Almacen.setItem(keys.nomina, JSON.stringify(data.nomina));
        await Almacen.setItem(keys.destajos, JSON.stringify(data.destajos));
        await Almacen.setItem(keys.generales, JSON.stringify(data.generales));
        await Almacen.setItem(keys.maquinaria, JSON.stringify(data.maquinaria));
      }

      const cajaTotalArr = [...gastosPendientesLocales, ...data.caja];

      const sumIngresos = data.ingresos.reduce((sum, i: any) => sum + Number(i.monto || 0), 0);
      const sumCaja = cajaTotalArr.reduce((sum, c: any) => sum + Number(c.monto || 0), 0);
      const sumNomina = data.nomina.reduce((sum, n: any) => sum + Number(n.final_salary || 0), 0);
      const sumDestajos = data.destajos.reduce((sum, d: any) => sum + (Number(d.quantity || 0) * Number(d.unit_price || 0)), 0);
      const sumGenerales = data.generales.reduce((sum, g: any) => sum + Number(g.monto || 0), 0);
      const sumMaquinaria = data.maquinaria.reduce((sum, m: any) => sum + Number(m.monto || 0), 0);

      const totalEgresosGlobal = sumCaja + sumNomina + sumDestajos + sumGenerales + sumMaquinaria;

      setBalanceGeneral({
        ingresos: sumIngresos,
        egresos: totalEgresosGlobal,
        disponible: sumIngresos - totalEgresosGlobal
      });

      const macroGrupos = [
        { nombre: 'Mano de Obra', importe: sumNomina },
        { nombre: 'Destajos y Materiales', importe: sumDestajos },
        { nombre: 'Maquinaria y Equipo', importe: sumMaquinaria },
        { nombre: 'Gastos Generales', importe: sumGenerales },
        { nombre: 'Caja Chica', importe: sumCaja }
      ].filter(item => item.importe > 0);

      let colorIndex = 0;
      const analisisArreglo: CategoriaCosto[] = macroGrupos.map((item) => {
        const porcentaje = totalEgresosGlobal > 0 ? (item.importe / totalEgresosGlobal) * 100 : 0;
        const assignedColor = coloresFijos[item.nombre] || chartColors[colorIndex++ % chartColors.length];

        return {
          nombre: item.nombre,
          importe: item.importe,
          porcentaje: porcentaje,
          color: assignedColor,
          legendFontColor: '#475569',
          legendFontSize: 11
        };
      });

      analisisArreglo.sort((a, b) => b.importe - a.importe);
      setAnalisisCostos(analisisArreglo);

    } catch (e: any) {
      Aviso.alert("Aviso", "Hubo un problema sincronizando algunos totales.");
      console.log(e);
    } finally {
      setLoading(false);
    }
  };

  const renderTabContent = () => {
    if (activeTab === 'general') {
      const porcentajeConsumido = balanceGeneral.ingresos > 0 ? (balanceGeneral.egresos / balanceGeneral.ingresos) * 100 : 0;
      
      return (
        <View>
          <Text style={styles.sectionTitle}>Estado de Cuenta de la Obra</Text>
          
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

          <View style={styles.generalCardsContainer}>
            <View style={[styles.infoCard, { borderColor: '#10B981' }]}>
              <View style={[styles.cardHeaderIcon, { backgroundColor: '#D1FAE5' }]}>
                <Feather name="arrow-down-left" size={20} color="#10B981" />
              </View>
              <Text style={[styles.infoCardValue, { color: '#059669' }]} adjustsFontSizeToFit numberOfLines={1}>
                ${balanceGeneral.ingresos.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
              </Text>
              <Text style={styles.infoCardLabel}>Total Recibido</Text>
            </View>

            <View style={[styles.infoCard, { borderColor: '#EF4444' }]}>
              <View style={[styles.cardHeaderIcon, { backgroundColor: '#FEE2E2' }]}>
                <Feather name="arrow-up-right" size={20} color="#EF4444" />
              </View>
              <Text style={[styles.infoCardValue, { color: '#DC2626' }]} adjustsFontSizeToFit numberOfLines={1}>
                ${balanceGeneral.egresos.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
              </Text>
              <Text style={styles.infoCardLabel}>Total Egresado</Text>
            </View>
          </View>

          <View style={styles.financialNoticeBox}>
            <Feather name="info" size={20} color="#475569" style={{ marginRight: 12 }} />
            <Text style={styles.financialNoticeText}>
              Este balance es consolidado. Resta automáticamente nóminas, caja chica, maquinaria, destajos y gastos estructurales.
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View>
        <View style={styles.analisisHeader}>
          <View>
            <Text style={styles.analisisLabel}>Costo Directo</Text>
            <Text style={styles.analisisTotal}>${balanceGeneral.egresos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.analisisLabel}>Rubros Activos</Text>
            <Text style={styles.analisisCount}>{analisisCostos.length}</Text>
          </View>
        </View>

        {analisisCostos.length > 0 ? (
          <View style={styles.chartContainer}>
            <View style={styles.pieWrapper}>
              <PieChart
                data={analisisCostos.map(c => ({
                  name: ' ', 
                  population: c.importe,
                  color: c.color,
                  legendFontColor: c.legendFontColor,
                  legendFontSize: c.legendFontSize
                }))}
                width={screenWidth * 0.45} 
                height={160}
                chartConfig={{ color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})` }}
                accessor={"population"}
                backgroundColor={"transparent"}
                paddingLeft={"0"}
                center={[screenWidth * 0.1, 0]} 
                hasLegend={false} 
                absolute
              />
            </View>

            <View style={styles.legendContainer}>
              {analisisCostos.map((item, index) => (
                <View key={index} style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                  <Text style={styles.legendText} numberOfLines={2} ellipsizeMode="tail">
                    {item.nombre}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No hay datos suficientes para graficar. Registra movimientos en las diferentes áreas para generar el análisis.</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>Distribución de Egresos por Área Operativa</Text>
        <View style={styles.tableCard}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, { flex: 2.2 }]}>Macro Rubro</Text>
            <Text style={[styles.tableHeaderText, { flex: 1.5, textAlign: 'right' }]}>Importe</Text>
            <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'right' }]}>Part %</Text>
          </View>

          {analisisCostos.map((item, index) => (
            <View key={index} style={styles.tableRow}>
              <View style={[styles.tableCol, { flex: 2.2, flexDirection: 'row', alignItems: 'center' }]}>
                <View style={[styles.colorBox, { backgroundColor: item.color }]} />
                <Text style={styles.rowTextName} numberOfLines={2}>{item.nombre}</Text>
              </View>
              <Text style={[styles.rowTextValue, { flex: 1.5, textAlign: 'right' }]}>
                ${item.importe.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </Text>
              <Text style={[styles.rowTextValue, { flex: 1, textAlign: 'right', fontWeight: '700' }]}>
                {item.porcentaje.toFixed(1)}%
              </Text>
            </View>
          ))}
          
          <View style={styles.tableFooter}>
            <Text style={[styles.footerText, { flex: 2.2, paddingLeft: 18 }]}>Gasto Directo </Text>
            <Text style={[styles.footerText, { flex: 1.5, textAlign: 'right' }]}>
              ${balanceGeneral.egresos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </Text>
            <Text style={[styles.footerText, { flex: 1, textAlign: 'right' }]}>100%</Text>
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
        
        {/* 🧠 Saludo Personalizado del Contexto de Usuario */}
        <Text style={{color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 4}}>
          Reporte visualizado por: <Text style={{fontWeight: 'bold'}}>{profile?.name || 'Oficina'}</Text>
        </Text>
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
        <View style={styles.body}>
          <SkeletonTarjeta />
          <SkeletonLista filas={4} />
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
  header: { backgroundColor: '#2563EB', paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
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
  emptyText: { textAlign: 'center', fontStyle: 'italic', color: '#94A3B8', fontSize: 13, lineHeight: 20 },

  mainBalanceCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 20, marginBottom: 15, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', marginTop: 5 },
  mainBalanceLabel: { fontSize: 11, color: '#64748B', fontWeight: '700', letterSpacing: 0.5 },
  mainBalanceValue: { fontSize: 30, fontWeight: 'bold', marginTop: 6 },
  progressBarBg: { width: '100%', height: 8, backgroundColor: '#E2E8F0', borderRadius: 4, marginTop: 15, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 4 },
  progressText: { fontSize: 11, color: '#64748B', marginTop: 8, fontWeight: '500' },

  generalCardsContainer: { flexDirection: 'row', gap: 12, marginBottom: 15 },
  infoCard: { flex: 1, backgroundColor: '#FFF', padding: 16, borderRadius: 16, borderWidth: 1, elevation: 1, shadowColor: '#000', shadowOpacity: 0.01, overflow: 'hidden' },
  cardHeaderIcon: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  infoCardValue: { fontSize: 18, fontWeight: 'bold' },
  infoCardLabel: { fontSize: 11, color: '#64748B', marginTop: 2, fontWeight: '600' },
  financialNoticeBox: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 5 },
  financialNoticeText: { flex: 1, color: '#475569', fontSize: 12, lineHeight: 16, fontWeight: '500' },

  analisisHeader: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#FFF', padding: 16, borderRadius: 16, marginBottom: 15, borderWidth: 1, borderColor: '#E2E8F0' },
  analisisLabel: { fontSize: 11, color: '#64748B', fontWeight: '600', textTransform: 'uppercase' },
  analisisTotal: { fontSize: 22, fontWeight: 'bold', color: '#0F172A', marginTop: 4 },
  analisisCount: { fontSize: 22, fontWeight: 'bold', color: '#2563EB', marginTop: 4 },
  
  chartContainer: { backgroundColor: '#FFF', paddingVertical: 15, paddingHorizontal: 15, borderRadius: 16, alignItems: 'center', justifyContent: 'space-between', marginBottom: 15, borderWidth: 1, borderColor: '#E2E8F0', flexDirection: 'row' },
  pieWrapper: { width: '50%', alignItems: 'center', justifyContent: 'center' },
  legendContainer: { width: '50%', paddingLeft: 10, justifyContent: 'center' },
  legendRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  legendDot: { width: 12, height: 12, borderRadius: 6, marginRight: 8 },
  legendText: { fontSize: 11, color: '#334155', flex: 1, fontWeight: '500' },
  
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 10, marginLeft: 4, marginTop: 10 },
  
  tableCard: { backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#F8FAFC', paddingVertical: 12, paddingHorizontal: 15, borderBottomWidth: 1, borderColor: '#E2E8F0' },
  tableHeaderText: { fontSize: 11, fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 15, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', alignItems: 'center' },
  tableCol: { justifyContent: 'center' },
  colorBox: { width: 10, height: 10, borderRadius: 3, marginRight: 8 },
  rowTextName: { fontSize: 12, color: '#1E293B', fontWeight: '600', flex: 1 },
  rowTextValue: { fontSize: 12, color: '#334155' },
  tableFooter: { flexDirection: 'row', backgroundColor: '#F8FAFC', paddingVertical: 14, paddingHorizontal: 15, borderTopWidth: 1, borderTopColor: '#CBD5E1' },
  footerText: { fontSize: 12, fontWeight: 'bold', color: '#0F172A' }
});