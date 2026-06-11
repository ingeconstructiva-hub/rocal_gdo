import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { useProject } from '../context/ProjectContext';
import { supabase } from '../lib/supabase';

interface GastoEstructural {
  id: string;
  concepto: string;
  monto: number;
  categoria: 'material' | 'administrativo' | 'burocrata' | 'asesoria';
  cantidad?: number | null;
  unidad?: string | null;
  proveedor?: string | null;
  fecha: string;
}

export default function GastosGeneralesScreen() {
  const router = useRouter();
  const { activeProject, isOffline } = useProject();
  
  const [gastos, setGastos] = useState<GastoEstructural[]>([]);
  const [loading, setLoading] = useState(true);

  // Estados del Formulario Dinámico
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  const [categoriaForm, setCategoriaForm] = useState<'material' | 'administrativo' | 'burocrata' | 'asesoria'>('material');
  
  const [cantidad, setCantidad] = useState('');
  const [unidad, setUnidad] = useState('');
  const [proveedor, setProveedor] = useState('');
  
  const [isSaving, setIsSaving] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  useEffect(() => {
    if (activeProject?.id) {
      fetchGastos();
    }
  }, [activeProject, isOffline]);

  const fetchGastos = async () => {
    setLoading(true);
    const pid = activeProject?.id;
    if (!pid) return;

    const storageKey = `@gastos_generales_log_${pid}`;

    if (isOffline) {
      try {
        const cached = await AsyncStorage.getItem(storageKey);
        if (cached) setGastos(JSON.parse(cached));
      } catch (e) {
        console.log("Error leyendo caché:", e);
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const { data, error } = await supabase
        .from('gastos_generales')
        .select('*')
        .eq('project_id', pid)
        .eq('is_active', true)
        .order('fecha', { ascending: false });

      if (error) throw error;
      if (data) {
        setGastos(data);
        await AsyncStorage.setItem(storageKey, JSON.stringify(data));
      }
    } catch (error) {
      console.log("Error cargando gastos:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleGuardarGasto = async () => {
    if (!concepto.trim() || !monto.trim()) {
      Alert.alert("Campos incompletos", "Por favor ingresa la descripción y el monto del gasto.");
      return;
    }

    const pid = activeProject?.id;
    if (!pid) return;

    setIsSaving(true);
    
    const nuevoGasto = {
      project_id: pid,
      concepto: concepto.trim(),
      monto: Number(monto),
      categoria: categoriaForm,
      cantidad: categoriaForm === 'material' && cantidad ? Number(cantidad) : null,
      unidad: categoriaForm === 'material' && unidad.trim() ? unidad.trim() : null,
      proveedor: proveedor.trim() ? proveedor.trim() : null,
      is_active: true,
      fecha: new Date().toISOString()
    };

    try {
      if (isOffline) {
        Alert.alert("Modo Offline", "Conéctate a internet para registrar nuevos conceptos estructurales.");
        setIsSaving(false);
        return;
      }

      const { error } = await supabase.from('gastos_generales').insert([nuevoGasto]);
      if (error) throw error;

      setIsModalVisible(false);
      limpiarFormulario();
      fetchGastos();
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const limpiarFormulario = () => {
    setConcepto('');
    setMonto('');
    setCantidad('');
    setUnidad('');
    setProveedor('');
  };

  const handleEliminarGasto = async (id: string, nombre: string) => {
    if (isOffline) {
      Alert.alert("Modo Lectura", "Requiere conexión para eliminar registros.");
      return;
    }

    Alert.alert("Eliminar gasto", `¿Quitar "${nombre}" de la lista?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          try {
            const { error } = await supabase.from('gastos_generales').update({ is_active: false }).eq('id', id);
            if (error) throw error;
            setGastos(prev => prev.filter(g => g.id !== id));
          } catch (e: any) {
            Alert.alert("Error", e.message);
          }
        }
      }
    ]);
  };

  const handleExportarExcel = async () => {
    if (gastos.length === 0) { Alert.alert("Sin datos", "No hay registros."); return; }
    try {
      const encabezados = ["Fecha", "Categoria", "Concepto", "Cantidad", "Unidad", "Proveedor/Origen", "Monto ($)\n"];
      const filas = gastos.map(g => {
        const fecha = new Date(g.fecha).toLocaleDateString('es-MX');
        const conceptoLimpio = g.concepto.replace(/,/g, ' ');
        const provLimpio = g.proveedor ? g.proveedor.replace(/,/g, ' ') : '';
        return `${fecha},"${g.categoria.toUpperCase()}","${conceptoLimpio}",${g.cantidad || ''},"${g.unidad || ''}","${provLimpio}",${g.monto}`;
      }).join("\n");

      const contenidoCSV = "\uFEFF" + encabezados.join(",") + filas;
      const nombreArchivo = `Bitacora_Gastos_${activeProject?.name?.replace(/\s+/g, '_') || 'Obra'}.csv`;

      const fsModulo = FileSystem as any;
      const fileUri = `${fsModulo.documentDirectory}${nombreArchivo}`;
      await fsModulo.writeAsStringAsync(fileUri, contenidoCSV, { encoding: 'utf8' });
      await Sharing.shareAsync(fileUri, { mimeType: 'text/csv' });
    } catch (error: any) { Alert.alert("Error Excel", error.message); }
  };

  const handleExportarPDF = async () => {
    if (gastos.length === 0) { Alert.alert("Sin datos", "No hay registros."); return; }
    setIsExportingPDF(true);
    try {
      const total = gastos.reduce((sum, g) => sum + g.monto, 0);
      const htmlContent = `
        <html>
          <head>
            <style>
              body { font-family: 'Helvetica', sans-serif; padding: 25px; color: #1E293B; }
              h1 { color: #2563EB; font-size: 22px; margin-bottom: 5px; }
              p { margin: 0 0 20px 0; color: #64748B; font-size: 13px; }
              table { width: 100%; border-collapse: collapse; }
              th, td { border: 1px solid #E2E8F0; padding: 10px; text-align: left; font-size: 12px; }
              th { background-color: #F8FAFC; color: #334155; text-transform: uppercase; font-size: 10px; }
              .monto { text-align: right; font-weight: bold; }
              .total-row { background-color: #EFF6FF; font-weight: bold; color: #1D4ED8; }
            </style>
          </head>
          <body>
            <h1>Bitácora de Gastos Directos</h1>
            <p>Obra: ${activeProject?.name || 'Obra Sin Nombre'} | Fecha: ${new Date().toLocaleDateString('es-MX')}</p>
            <table>
              <tr>
                <th>Fecha</th>
                <th>Rubro</th>
                <th>Concepto</th>
                <th>Detalle Cant.</th>
                <th>Proveedor / Tercero</th>
                <th style="text-align: right;">Monto</th>
              </tr>
              ${gastos.map(g => `
                <tr>
                  <td>${new Date(g.fecha).toLocaleDateString('es-MX')}</td>
                  <td>${g.categoria.toUpperCase()}</td>
                  <td>${g.concepto}</td>
                  <td>${g.cantidad ? `${g.cantidad} ${g.unidad}` : 'N/A'}</td>
                  <td>${g.proveedor || 'No indicado'}</td>
                  <td class="monto">$${g.monto.toFixed(2)}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td colspan="5" style="text-align: right; padding: 12px;">TOTAL ACUMULADO</td>
                <td style="text-align: right; padding: 12px;">$${total.toFixed(2)}</td>
              </tr>
            </table>
          </body>
        </html>
      `;
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
    } catch (error: any) { Alert.alert("Error PDF", error.message); } finally { setIsExportingPDF(false); }
  };

  const renderBadge = (cat: string) => {
    switch (cat) {
      case 'material': return <Text style={[styles.badge, { backgroundColor: '#FEF3C7', color: '#D97706' }]}>📦 Material</Text>;
      case 'administrativo': return <Text style={[styles.badge, { backgroundColor: '#E0F2FE', color: '#0284C7' }]}>📄 Admin</Text>;
      case 'burocrata': return <Text style={[styles.badge, { backgroundColor: '#FEE2E2', color: '#DC2626' }]}>🛡️ Burócrata</Text>;
      case 'asesoria': return <Text style={[styles.badge, { backgroundColor: '#EDE9FE', color: '#7C3AED' }]}>👥 Asesoría</Text>;
      default: return null;
    }
  };

  const getProveedorLabel = () => {
    if (categoriaForm === 'burocrata') return 'Dependencia / Institución';
    if (categoriaForm === 'asesoria') return 'Consultor / Especialista';
    if (categoriaForm === 'administrativo') return 'Comercio / Establecimiento';
    return 'Proveedor de Materiales';
  };

  return (
    <View style={styles.container}>
      {/* 🔵 HEADER AZUL ESTILO REFORZADO */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Feather name="chevron-left" size={32} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerSubtitle}>REGISTRO ESTRUCTURAL</Text>
          <View style={{ width: 32 }} />
        </View>
        <Text style={styles.headerTitle}>Bitácora de Gastos</Text>
        <View style={styles.projectBadge}>
          <Feather name="map-pin" size={12} color="rgba(255,255,255,0.7)" />
          <Text style={styles.projectName}>{activeProject?.name || "Obra"}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        
        {/* BOTONES GRANDES DE EXPORTACIÓN */}
        <View style={styles.exportContainer}>
          <TouchableOpacity style={[styles.bigExportBtn, { backgroundColor: '#DC2626' }]} onPress={handleExportarPDF} disabled={isExportingPDF}>
            {isExportingPDF ? <ActivityIndicator color="#FFF" /> : (
              <>
                <Feather name="file-text" size={20} color="#FFF" />
                <Text style={styles.bigExportText}>Generar PDF</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={[styles.bigExportBtn, { backgroundColor: '#10B981' }]} onPress={handleExportarExcel}>
            <Feather name="grid" size={20} color="#FFF" />
            <Text style={styles.bigExportText}>Generar Excel</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Historial de Movimientos</Text>
            <View style={styles.countBadge}>
                <Text style={styles.countText}>{gastos.length} registros</Text>
            </View>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 50 }} />
        ) : gastos.length === 0 ? (
          <Text style={styles.emptyText}>No hay gastos registrados todavía.</Text>
        ) : (
          gastos.map((g) => (
            <View key={g.id} style={styles.gastoCard}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.gastoConcepto}>{g.concepto}</Text>
                
                <View style={{marginTop: 4}}>
                  {g.categoria === 'material' && g.cantidad ? (
                    <Text style={styles.gastoDetalleTexto}>🛠️ Cantidad: {g.cantidad} {g.unidad}</Text>
                  ) : null}
                  {g.proveedor ? (
                    <Text style={styles.gastoDetalleTexto}>🏢 {g.categoria === 'burocrata' ? 'Dep' : g.categoria === 'asesoria' ? 'Consultor' : 'Prov'}: {g.proveedor}</Text>
                  ) : null}
                </View>

                <View style={styles.metaRow}>
                  {renderBadge(g.categoria)}
                  <Text style={styles.gastoFecha}>
                    • {new Date(g.fecha).toLocaleDateString('es-MX')}
                  </Text>
                </View>
              </View>
              
              <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                <Text style={styles.gastoMonto}>${g.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</Text>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleEliminarGasto(g.id, g.concepto)}>
                  <Feather name="trash-2" size={16} color="#FCA5A5" />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => setIsModalVisible(true)}>
        <Feather name="plus" size={30} color="#FFF" />
      </TouchableOpacity>

      {/* FORMULARIO DINÁMICO */}
      <Modal visible={isModalVisible} animationType="slide" transparent={true} onRequestClose={() => { setIsModalVisible(false); limpiarFormulario(); }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
            <Pressable style={{ flex: 1 }} onPress={() => { setIsModalVisible(false); limpiarFormulario(); }} />
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Registrar Gasto Directo</Text>

              <Text style={styles.modalLabel}>Clasificación del Rubro</Text>
              <View style={styles.categorySelectorContainer}>
                <TouchableOpacity style={[styles.catBtn, categoriaForm === 'material' && styles.catActiveMaterial]} onPress={() => setCategoriaForm('material')}>
                  <Text style={[styles.catText, categoriaForm === 'material' && styles.catTextActive]}>📦 Material</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.catBtn, categoriaForm === 'administrativo' && styles.catActiveAdmin]} onPress={() => setCategoriaForm('administrativo')}>
                  <Text style={[styles.catText, categoriaForm === 'administrativo' && styles.catTextActive]}>📄 Admin</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.catBtn, categoriaForm === 'burocrata' && styles.catActiveBuro]} onPress={() => setCategoriaForm('burocrata')}>
                  <Text style={[styles.catText, categoriaForm === 'burocrata' && styles.catTextActive]}>🛡️ Burócrata</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.catBtn, categoriaForm === 'asesoria' && styles.catActiveAsesoria]} onPress={() => setCategoriaForm('asesoria')}>
                  <Text style={[styles.catText, categoriaForm === 'asesoria' && styles.catTextActive]}>👥 Asesoría</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.modalLabel}>Concepto o Descripción</Text>
              <TextInput style={styles.modalInput} placeholder="Ej. Varilla de 3/8 o Licencia de construcción" placeholderTextColor="#94A3B8" value={concepto} onChangeText={setConcepto} />

              {categoriaForm === 'material' && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 }}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.modalLabel}>Cantidad</Text>
                    <TextInput style={styles.modalInput} placeholder="Ej. 50" keyboardType="numeric" value={cantidad} onChangeText={(v) => setCantidad(v.replace(/[^0-9.]/g, ''))} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalLabel}>Unidad</Text>
                    <TextInput style={styles.modalInput} placeholder="Ej. Pzas / Ton" placeholderTextColor="#94A3B8" value={unidad} onChangeText={setUnidad} />
                  </View>
                </View>
              )}

              <Text style={styles.modalLabel}>{getProveedorLabel()}</Text>
              <TextInput style={styles.modalInput} placeholder="Nombre o Razón social..." placeholderTextColor="#94A3B8" value={proveedor} onChangeText={setProveedor} />

              <Text style={styles.modalLabel}>Monto total del Gasto ($)</Text>
              <TextInput style={styles.modalInput} placeholder="0.00" keyboardType="numeric" value={monto} onChangeText={(v) => setMonto(v.replace(/[^0-9.]/g, ''))} />

              <TouchableOpacity style={styles.saveBtn} onPress={handleGuardarGasto} disabled={isSaving}>
                {isSaving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Guardar en Bitácora</Text>}
              </TouchableOpacity>

              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setIsModalVisible(false); limpiarFormulario(); }}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  header: { backgroundColor: '#2563EB', paddingTop: 60, paddingBottom: 30, paddingHorizontal: 25, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, elevation: 5, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { padding: 5, marginLeft: -10 },
  headerSubtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: 'bold', letterSpacing: 1.5 },
  headerTitle: { color: '#FFF', fontSize: 28, fontWeight: 'bold', marginTop: 15 },
  projectBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginTop: 8 },
  projectName: { color: '#FFF', fontSize: 12, fontWeight: '600', marginLeft: 5 },
  
  body: { padding: 20, paddingBottom: 120 },
  exportContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 25, gap: 12 },
  bigExportBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 14, elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4 },
  bigExportText: { color: '#FFF', fontSize: 14, fontWeight: 'bold', marginLeft: 8 },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', color: '#334155', textTransform: 'uppercase' },
  countBadge: { backgroundColor: '#E2E8F0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  countText: { fontSize: 11, color: '#64748B', fontWeight: 'bold' },
  
  emptyText: { textAlign: 'center', color: '#94A3B8', marginTop: 60, fontStyle: 'italic' },
  
  gastoCard: { backgroundColor: '#FFF', padding: 18, borderRadius: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, elevation: 3, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8 },
  gastoConcepto: { fontSize: 15, fontWeight: 'bold', color: '#1E293B' },
  gastoDetalleTexto: { fontSize: 12, color: '#475569', marginTop: 2, fontWeight: '500' },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  badge: { fontSize: 10, fontWeight: 'bold', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 8, overflow: 'hidden' },
  gastoFecha: { fontSize: 12, color: '#94A3B8', marginLeft: 8 },
  gastoMonto: { fontSize: 18, fontWeight: 'bold', color: '#0F172A' },
  deleteBtn: { marginTop: 10, padding: 6, backgroundColor: '#FEF2F2', borderRadius: 8 },

  fab: { position: 'absolute', bottom: 35, right: 25, width: 65, height: 65, borderRadius: 32.5, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#2563EB', shadowOpacity: 0.4, shadowRadius: 10 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalScroll: { flexGrow: 1, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, paddingBottom: 45 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#0F172A', marginBottom: 20 },
  modalLabel: { fontSize: 13, fontWeight: '700', color: '#475569', marginTop: 15, marginBottom: 8 },
  modalInput: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 14, fontSize: 15, color: '#0F172A' },
  
  categorySelectorContainer: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#F1F5F9', borderRadius: 15, padding: 6, marginTop: 5, gap: 6, marginBottom: 10 },
  catBtn: { flex: 1, minWidth: '45%', paddingVertical: 12, alignItems: 'center', borderRadius: 12 },
  catText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  catTextActive: { color: '#FFF' },
  
  catActiveMaterial: { backgroundColor: '#D97706' },
  catActiveAdmin: { backgroundColor: '#0284C7' },
  catActiveBuro: { backgroundColor: '#DC2626' },
  catActiveAsesoria: { backgroundColor: '#7C3AED' },
  
  saveBtn: { backgroundColor: '#1E293B', padding: 16, borderRadius: 15, alignItems: 'center', marginTop: 30 },
  saveBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  cancelBtn: { padding: 15, alignItems: 'center', marginTop: 10 },
  cancelBtnText: { color: '#94A3B8', fontSize: 14, fontWeight: '600' }
});