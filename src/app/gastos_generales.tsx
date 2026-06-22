import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import SummaryCard from '../components/SummaryCard'; // 🧠 Agregamos el Card Resumen
import { useProject } from '../context/ProjectContext';
import { useUser } from '../context/UserContext';
import { supabase } from '../lib/supabase';
import { generarPlantillaGastos } from './utils/pdfGastosGen';

interface GastoEstructural {
  id: string;
  concepto: string;
  monto: number;
  categoria: 'material' | 'administrativo' | 'burocrata' | 'asesoria';
  cantidad?: number | null;
  unidad?: string | null;
  proveedor?: string | null;
  estado_pago: 'pagado' | 'credito'; // 🆕 Nuevo campo
  fecha: string;
}

export default function GastosGeneralesScreen() {
  const router = useRouter();
  const { activeProject, isOffline } = useProject();
  const { profile } = useUser(); 
  
  const [gastos, setGastos] = useState<GastoEstructural[]>([]);
  const [loading, setLoading] = useState(true);

  // 🔒 Validadores de Permisos
  const isAdmin = profile?.role === 'admin';

  // Filtros
  const [filtroCategoria, setFiltroCategoria] = useState<'todos' | 'material' | 'administrativo' | 'burocrata' | 'asesoria'>('todos');

  // Modal Detalles y Edición
  const [gastoSeleccionado, setGastoSeleccionado] = useState<GastoEstructural | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Estados del Formulario Dinámico
  const [isFormModalVisible, setIsFormModalVisible] = useState(false);
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  const [categoriaForm, setCategoriaForm] = useState<'material' | 'administrativo' | 'burocrata' | 'asesoria'>('material');
  const [estadoPagoForm, setEstadoPagoForm] = useState<'pagado' | 'credito'>('pagado'); // 🆕 Estado de Pago
  
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

  const iniciarEdicion = (gasto: GastoEstructural) => {
    setGastoSeleccionado(null);
    setConcepto(gasto.concepto);
    setMonto(gasto.monto.toString());
    setCategoriaForm(gasto.categoria);
    setEstadoPagoForm(gasto.estado_pago || 'pagado');
    setCantidad(gasto.cantidad?.toString() || '');
    setUnidad(gasto.unidad || '');
    setProveedor(gasto.proveedor || '');
    
    setIsEditing(true);
    setIsFormModalVisible(true);
  };

  const handleGuardarGasto = async () => {
    if (!concepto.trim() || !monto.trim()) {
      Alert.alert("Campos incompletos", "Por favor ingresa la descripción y el monto del gasto.");
      return;
    }

    const pid = activeProject?.id;
    if (!pid) return;

    if (isOffline) {
      Alert.alert("Modo Offline", "Conéctate a internet para registrar o editar conceptos.");
      return;
    }

    setIsSaving(true);
    
    const datosGasto = {
      project_id: pid,
      concepto: concepto.trim(),
      monto: Number(monto),
      categoria: categoriaForm,
      estado_pago: estadoPagoForm,
      cantidad: categoriaForm === 'material' && cantidad ? Number(cantidad) : null,
      unidad: categoriaForm === 'material' && unidad.trim() ? unidad.trim() : null,
      proveedor: proveedor.trim() ? proveedor.trim() : null,
      is_active: true,
      fecha: isEditing && gastoSeleccionado ? gastoSeleccionado.fecha : new Date().toISOString()
    };

    try {
      if (isEditing && gastoSeleccionado) {
        const { error } = await supabase.from('gastos_generales').update(datosGasto).eq('id', gastoSeleccionado.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('gastos_generales').insert([datosGasto]);
        if (error) throw error;
      }

      setIsFormModalVisible(false);
      limpiarFormulario();
      fetchGastos();
      Alert.alert("¡Éxito!", isEditing ? "Gasto actualizado correctamente." : "Gasto registrado correctamente.");
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
    setEstadoPagoForm('pagado');
    setIsEditing(false);
    setGastoSeleccionado(null);
  };

  const handleEliminarGasto = async (id: string, nombre: string) => {
    if (isOffline) {
      Alert.alert("Modo Lectura", "Requiere conexión para eliminar registros.");
      return;
    }

    Alert.alert("Eliminar gasto", `¿Quitar "${nombre}" de la lista permanentemente?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          try {
            const { error } = await supabase.from('gastos_generales').update({ is_active: false }).eq('id', id);
            if (error) throw error;
            setGastos(prev => prev.filter(g => g.id !== id));
            setGastoSeleccionado(null);
          } catch (e: any) {
            Alert.alert("Error", e.message);
          }
        }
      }
    ]);
  };

  const handleExportarExcel = async () => {
    const listadoExportar = filtroCategoria === 'todos' ? gastos : gastosFiltrados;
    if (listadoExportar.length === 0) { Alert.alert("Sin datos", "No hay registros en esta categoría."); return; }
    try {
      const encabezados = ["Fecha", "Categoria", "Concepto", "Cantidad", "Unidad", "Proveedor/Origen", "Estado de Pago", "Monto ($)\n"];
      const filas = listadoExportar.map(g => {
        const fecha = new Date(g.fecha).toLocaleDateString('es-MX');
        const conceptoLimpio = g.concepto.replace(/,/g, ' ');
        const provLimpio = g.proveedor ? g.proveedor.replace(/,/g, ' ') : '';
        const estado = g.estado_pago === 'credito' ? 'DEUDA / CRÉDITO' : 'PAGADO';
        return `${fecha},"${g.categoria.toUpperCase()}","${conceptoLimpio}",${g.cantidad || ''},"${g.unidad || ''}","${provLimpio}","${estado}",${g.monto}`;
      }).join("\n");

      const contenidoCSV = "\uFEFF" + encabezados.join(",") + filas;
      const nombreArchivo = `Gastos_${filtroCategoria}_${activeProject?.name?.replace(/\s+/g, '_') || 'Obra'}.csv`;

      const fsModulo = FileSystem as any;
      const fileUri = `${fsModulo.documentDirectory}${nombreArchivo}`;
      await fsModulo.writeAsStringAsync(fileUri, contenidoCSV, { encoding: 'utf8' });
      await Sharing.shareAsync(fileUri, { mimeType: 'text/csv' });
    } catch (error: any) { Alert.alert("Error Excel", error.message); }
  };

  const handleExportarPDF = async () => {
    const listadoExportar = filtroCategoria === 'todos' ? gastos : gastosFiltrados;
    if (listadoExportar.length === 0) { Alert.alert("Sin datos", "No hay registros."); return; }
    
    setIsExportingPDF(true);
    try {
      const htmlContent = generarPlantillaGastos(
        activeProject?.name || 'Obra Sin Nombre',
        totalGastado,
        totalDeuda,
        filtroCategoria,
        listadoExportar
      );
      
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Compartir Reporte de Gastos' });
    } catch (error: any) { 
      Alert.alert("Error PDF", error.message); 
    } finally { 
      setIsExportingPDF(false); 
    }
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

  // 🧠 CÁLCULOS PARA EL SUMMARY CARD Y FILTRADO
  const gastosFiltrados = useMemo(() => {
    if (filtroCategoria === 'todos') return gastos;
    return gastos.filter(g => g.categoria === filtroCategoria);
  }, [gastos, filtroCategoria]);

  const totalGastado = gastosFiltrados.reduce((sum, g) => sum + g.monto, 0);
  const totalDeuda = gastosFiltrados.filter(g => g.estado_pago === 'credito').reduce((sum, g) => sum + g.monto, 0);

  return (
    <View style={styles.container}>
      {/* 🔵 HEADER */}
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
        
        {/* 🧠 SUMMARY CARD CON TOTALES Y DEUDAS */}
        <View style={{ marginBottom: 15 }}>
          <SummaryCard 
            labelLeft={`Total ${filtroCategoria === 'todos' ? 'Gastado' : filtroCategoria}`} 
            valueLeft={totalGastado} 
            labelRight="Por Pagar (Crédito)" 
            valueRight={totalDeuda} 
            colorRight="#DC2626" 
          />
        </View>

        {/* BOTONES GRANDES DE EXPORTACIÓN */}
        {isAdmin && (
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
        )}

        <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Historial de Movimientos</Text>
            <View style={styles.countBadge}>
                <Text style={styles.countText}>{gastosFiltrados.length} registros</Text>
            </View>
        </View>

        {/* 📑 SUBMENÚ DE PÍLDORAS PARA FILTRAR */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterContainer}>
          {['todos', 'material', 'administrativo', 'burocrata', 'asesoria'].map((cat) => (
            <TouchableOpacity 
              key={cat}
              style={[styles.filterPill, filtroCategoria === cat && styles.filterPillActive]}
              onPress={() => setFiltroCategoria(cat as any)}
            >
              <Text style={[styles.filterText, filtroCategoria === cat && styles.filterTextActive]}>
                {cat.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {loading ? (
          <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 50 }} />
        ) : gastosFiltrados.length === 0 ? (
          <Text style={styles.emptyText}>No hay gastos registrados en esta categoría.</Text>
        ) : (
          gastosFiltrados.map((g) => (
            <TouchableOpacity 
              key={g.id} 
              style={[styles.gastoCard, g.estado_pago === 'credito' && { borderLeftWidth: 4, borderLeftColor: '#EF4444' }]}
              activeOpacity={0.7}
              onPress={() => setGastoSeleccionado(g)}
            >
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.gastoConcepto} numberOfLines={2}>{g.concepto}</Text>
                
                <View style={{marginTop: 4, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6}}>
                  {g.estado_pago === 'credito' && (
                    <View style={{backgroundColor: '#FEE2E2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4}}>
                      <Text style={{color: '#DC2626', fontSize: 9, fontWeight: 'bold'}}>POR PAGAR</Text>
                    </View>
                  )}
                  {g.proveedor ? (
                    <Text style={styles.gastoDetalleTexto}>🏢 {g.proveedor}</Text>
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
                <Text style={[styles.gastoMonto, g.estado_pago === 'credito' && {color: '#DC2626'}]}>
                  ${g.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => setIsFormModalVisible(true)}>
        <Feather name="plus" size={30} color="#FFF" />
      </TouchableOpacity>

      {/* 🔍 MODAL DE DETALLES DEL GASTO */}
      <Modal visible={!!gastoSeleccionado} animationType="fade" transparent={true} onRequestClose={() => setGastoSeleccionado(null)}>
        <View style={styles.modalOverlayDetail}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setGastoSeleccionado(null)} />
          <View style={styles.detailModalContent}>
            {gastoSeleccionado && (
              <>
                <View style={styles.detailHeader}>
                  <View style={styles.detailTitleBox}>
                    <Text style={styles.detailTitleCat}>{gastoSeleccionado.categoria.toUpperCase()}</Text>
                    <Text style={styles.detailTitleMain} numberOfLines={2}>{gastoSeleccionado.concepto}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setGastoSeleccionado(null)} style={styles.detailCloseBtn}>
                    <Feather name="x" size={24} color="#64748B" />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false}>
                  <Text style={[styles.detailAmount, gastoSeleccionado.estado_pago === 'credito' && {color: '#DC2626'}]}>
                    ${gastoSeleccionado.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </Text>
                  
                  <View style={styles.detailDataBox}>
                    <View style={styles.detailRowGrid}>
                      <View style={{flex: 1}}>
                        <Text style={styles.detailLabel}>Estado de Pago</Text>
                        <Text style={[styles.detailValue, {color: gastoSeleccionado.estado_pago === 'credito' ? '#DC2626' : '#10B981'}]}>
                          {gastoSeleccionado.estado_pago === 'credito' ? 'DEUDA / CRÉDITO' : 'LIQUIDADO'}
                        </Text>
                      </View>
                      <View style={{flex: 1}}>
                        <Text style={styles.detailLabel}>Fecha de Registro</Text>
                        <Text style={styles.detailValue}>{new Date(gastoSeleccionado.fecha).toLocaleDateString('es-MX')}</Text>
                      </View>
                    </View>

                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Proveedor / Emisor</Text>
                      <Text style={styles.detailValue}>{gastoSeleccionado.proveedor || 'No especificado'}</Text>
                    </View>

                    {gastoSeleccionado.categoria === 'material' && gastoSeleccionado.cantidad && (
                      <View style={styles.detailRowGrid}>
                        <View style={{flex: 1}}>
                          <Text style={styles.detailLabel}>Cantidad Comprada</Text>
                          <Text style={styles.detailValue}>{gastoSeleccionado.cantidad} {gastoSeleccionado.unidad}</Text>
                        </View>
                        <View style={{flex: 1}}>
                          <Text style={styles.detailLabel}>Precio Aprox. Unitario</Text>
                          <Text style={styles.detailValue}>${(gastoSeleccionado.monto / gastoSeleccionado.cantidad).toFixed(2)}</Text>
                        </View>
                      </View>
                    )}
                  </View>

                  {isAdmin && (
                    <View style={styles.detailActionsRow}>
                      <TouchableOpacity style={styles.editActionBtn} onPress={() => iniciarEdicion(gastoSeleccionado)}>
                        <Feather name="edit-2" size={16} color="#FFF" />
                        <Text style={styles.editActionBtnText}>Editar Registro</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.deleteActionBtn} onPress={() => handleEliminarGasto(gastoSeleccionado.id, gastoSeleccionado.concepto)}>
                        <Feather name="trash-2" size={16} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  )}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ✏️ FORMULARIO DINÁMICO (ALTA / EDICIÓN) */}
      <Modal visible={isFormModalVisible} animationType="slide" transparent={true} onRequestClose={() => { setIsFormModalVisible(false); limpiarFormulario(); }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
            <Pressable style={{ flex: 1 }} onPress={() => { setIsFormModalVisible(false); limpiarFormulario(); }} />
            <View style={styles.modalContent}>
              <View style={styles.modalHeaderTitleRow}>
                <Text style={styles.modalTitle}>{isEditing ? 'Editar Gasto Registrado' : 'Registrar Gasto Directo'}</Text>
                <TouchableOpacity onPress={() => { setIsFormModalVisible(false); limpiarFormulario(); }}>
                  <Feather name="x" size={24} color="#64748B" />
                </TouchableOpacity>
              </View>

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

              {/* 🆕 CONTROL DE ESTADO DE PAGO */}
              <View style={styles.rowInputs}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.modalLabel}>Estado de Pago</Text>
                  <View style={{flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 10, padding: 4}}>
                    <TouchableOpacity style={[styles.pagoBtn, estadoPagoForm === 'pagado' && {backgroundColor: '#10B981'}]} onPress={() => setEstadoPagoForm('pagado')}>
                      <Text style={[styles.pagoBtnText, estadoPagoForm === 'pagado' && {color: '#FFF'}]}>Liquidado</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.pagoBtn, estadoPagoForm === 'credito' && {backgroundColor: '#EF4444'}]} onPress={() => setEstadoPagoForm('credito')}>
                      <Text style={[styles.pagoBtnText, estadoPagoForm === 'credito' && {color: '#FFF'}]}>A Crédito</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalLabel}>Monto Total ($)</Text>
                  <TextInput style={[styles.modalInput, {fontSize: 18, fontWeight: 'bold'}]} placeholder="0.00" keyboardType="numeric" value={monto} onChangeText={(v) => setMonto(v.replace(/[^0-9.]/g, ''))} />
                </View>
              </View>

              <Text style={styles.modalLabel}>Concepto o Descripción</Text>
              <TextInput style={styles.modalInput} placeholder="Ej. Varilla de 3/8 o Licencia de construcción" placeholderTextColor="#94A3B8" value={concepto} onChangeText={setConcepto} />

              {categoriaForm === 'material' && (
                <View style={styles.rowInputs}>
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

              <TouchableOpacity style={styles.saveBtn} onPress={handleGuardarGasto} disabled={isSaving}>
                {isSaving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>{isEditing ? 'Guardar Cambios' : 'Registrar en Bitácora'}</Text>}
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
  header: { backgroundColor: '#2563EB', paddingTop: 60, paddingBottom: 25, paddingHorizontal: 25, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, elevation: 5, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { padding: 5, marginLeft: -10 },
  headerSubtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: 'bold', letterSpacing: 1.5 },
  headerTitle: { color: '#FFF', fontSize: 28, fontWeight: 'bold', marginTop: 15 },
  projectBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginTop: 8 },
  projectName: { color: '#FFF', fontSize: 12, fontWeight: '600', marginLeft: 5 },
  
  body: { padding: 20, paddingBottom: 120 },
  exportContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, gap: 12 },
  bigExportBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4 },
  bigExportText: { color: '#FFF', fontSize: 13, fontWeight: 'bold', marginLeft: 8 },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', color: '#334155', textTransform: 'uppercase' },
  countBadge: { backgroundColor: '#E2E8F0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  countText: { fontSize: 11, color: '#64748B', fontWeight: 'bold' },
  
  // 📑 Filtros Deslizables
  filterContainer: { flexDirection: 'row', marginBottom: 15, paddingBottom: 5 },
  filterPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#CBD5E1', marginRight: 8 },
  filterPillActive: { backgroundColor: '#1E293B', borderColor: '#1E293B' },
  filterText: { fontSize: 11, fontWeight: 'bold', color: '#64748B' },
  filterTextActive: { color: '#FFF' },

  emptyText: { textAlign: 'center', color: '#94A3B8', marginTop: 60, fontStyle: 'italic' },
  
  gastoCard: { backgroundColor: '#FFF', padding: 16, borderRadius: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6 },
  gastoConcepto: { fontSize: 15, fontWeight: 'bold', color: '#1E293B' },
  gastoDetalleTexto: { fontSize: 11, color: '#475569', fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  badge: { fontSize: 9, fontWeight: 'bold', paddingVertical: 3, paddingHorizontal: 6, borderRadius: 6, overflow: 'hidden' },
  gastoFecha: { fontSize: 11, color: '#94A3B8', marginLeft: 8 },
  gastoMonto: { fontSize: 18, fontWeight: 'bold', color: '#0F172A' },

  fab: { position: 'absolute', bottom: 35, right: 25, width: 65, height: 65, borderRadius: 32.5, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#2563EB', shadowOpacity: 0.4, shadowRadius: 10 },
  
  // Modales
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalScroll: { flexGrow: 1, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, paddingBottom: 45 },
  modalHeaderTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#0F172A' },
  modalLabel: { fontSize: 12, fontWeight: '700', color: '#475569', marginTop: 15, marginBottom: 6 },
  modalInput: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 12, fontSize: 14, color: '#0F172A' },
  rowInputs: { flexDirection: 'row', justifyContent: 'space-between' },
  
  categorySelectorContainer: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#F1F5F9', borderRadius: 15, padding: 6, gap: 6 },
  catBtn: { flex: 1, minWidth: '45%', paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  catText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  catTextActive: { color: '#FFF' },
  
  catActiveMaterial: { backgroundColor: '#D97706' },
  catActiveAdmin: { backgroundColor: '#0284C7' },
  catActiveBuro: { backgroundColor: '#DC2626' },
  catActiveAsesoria: { backgroundColor: '#7C3AED' },
  
  pagoBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8 },
  pagoBtnText: { fontSize: 12, fontWeight: 'bold', color: '#64748B' },

  saveBtn: { backgroundColor: '#1E293B', padding: 16, borderRadius: 15, alignItems: 'center', marginTop: 30 },
  saveBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  
  // 🔍 Estilos Modal Detalles
  modalOverlayDetail: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.7)', justifyContent: 'center', padding: 20 },
  detailModalContent: { backgroundColor: '#FFF', borderRadius: 24, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 10 },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 },
  detailTitleBox: { flex: 1, paddingRight: 15 },
  detailTitleCat: { fontSize: 11, fontWeight: 'bold', color: '#2563EB', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  detailTitleMain: { fontSize: 18, fontWeight: 'bold', color: '#1E293B' },
  detailCloseBtn: { padding: 6, backgroundColor: '#F1F5F9', borderRadius: 10 },
  detailAmount: { fontSize: 32, fontWeight: '900', color: '#0F172A', marginBottom: 20 },
  detailDataBox: { backgroundColor: '#F8FAFC', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E2E8F0', gap: 16 },
  detailRow: { flexDirection: 'column' },
  detailRowGrid: { flexDirection: 'row', gap: 16 },
  detailLabel: { fontSize: 10, fontWeight: 'bold', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 4 },
  detailValue: { fontSize: 14, fontWeight: '600', color: '#1E293B' },
  
  detailActionsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 25, gap: 10 },
  editActionBtn: { flex: 1, backgroundColor: '#1E293B', padding: 14, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  editActionBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 13, marginLeft: 8 },
  deleteActionBtn: { backgroundColor: '#FEF2F2', padding: 14, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#FECACA' }
});