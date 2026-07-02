'use client';

import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import SignatureScreen, { SignatureViewRef } from 'react-native-signature-canvas';

// 🟢 RUTAS CORREGIDAS PARA LA NUEVA UBICACIÓN DENTRO DE (TABS)
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useProject } from '../../context/ProjectContext';
import { useUser } from '../../context/UserContext';
import { supabase } from '../../lib/supabase';
import { generarPlantillaResponsiva } from '../utils/pdfResponsiva';

interface HerramientaAlmacen {
  id: string;
  codigo: string; 
  nombre: string;
  marca_modelo: string;
  ubicacion: 'bodega' | 'obra'; 
  asignado_a?: string | null;   
  notas?: string | null;        
  token_firma?: string | null;  
  fecha_firma?: string | null;  
}

export default function ResguardosScreen() {
  const router = useRouter();
  const { activeProject } = useProject();
  const { profile } = useUser();
  const signatureRef = useRef<SignatureViewRef>(null);
  const isAdminOrOficina = profile?.role === 'admin' || profile?.role === 'oficina';

  const [herramientas, setHerramientas] = useState<HerramientaAlmacen[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filtroUbicacion, setFiltroUbicacion] = useState<'todos' | 'bodega' | 'obra'>('todos');

  // 📝 ESTADOS DEL FORMULARIO UNIFICADO
  const [modalVisible, setModalVisible] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [marcaModelo, setMarcaModelo] = useState('');
  const [ubicacionInicial, setUbicacionOriginal] = useState<'bodega' | 'obra'>('bodega');
  const [asignadoA, setAsignadoA] = useState('');
  const [notas, setNotas] = useState('');

  // 🔒 MODAL DE FIRMA POR DIBUJO TÁCTIL
  const [modalFirmaVisible, setModalFirmaVisible] = useState(false);
  const [selectedItemForSign, setSelectedItemForSign] = useState<HerramientaAlmacen | null>(null);
  const [nombreResponsableSign, setNombreResponsableSign] = useState('');
  const [editingTool, setEditingTool] = useState<HerramientaAlmacen | null>(null);

  // 🟢 REUBICACIÓN DE FUNCIONES DE INICIALIZACIÓN (Mover arriba para solucionar error ts(2304))
  const iniciarEdicion = (item: HerramientaAlmacen) => {
    setEditingTool(item);
    setCodigo(item.codigo);
    setNombre(item.nombre);
    setMarcaModelo(item.marca_modelo);
    setUbicacionOriginal(item.ubicacion);
    setAsignadoA(item.asignado_a || '');
    setNotas(item.notas || '');
    setModalVisible(true);
  };

  const iniciarAltaNueva = () => {
    setEditingTool(null);
    setCodigo(''); setNombre(''); setMarcaModelo(''); setUbicacionOriginal('bodega'); setAsignadoA(''); setNotas('');
    setModalVisible(true);
  };

  const abrirModalFirma = (item: HerramientaAlmacen) => {
    setSelectedItemForSign(item);
    setModalFirmaVisible(true);
  };

  useEffect(() => {
    if (activeProject?.id) fetchInventarioAlmacen();
  }, [activeProject]);

  const fetchInventarioAlmacen = async () => {
    setLoading(true);
    const pid = activeProject?.id;
    if (!pid) return;
    try {
      const { data, error } = await supabase
        .from('almacen_herramientas')
        .select('*')
        .eq('project_id', pid)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) setHerramientas(data);
    } catch (error) {
      console.log("Error loading warehouse inventory:", error);
    } finally {
      setLoading(false);
    }
  };

  const ejecutarExportacionPDF = async (item: HerramientaAlmacen, signatureDataUri?: string) => {
    try {
      const valePayload = {
        id: item.id,
        n_responsiva: item.codigo,
        n_convenio: 'CV-' + item.id.slice(-4).toUpperCase(),
        fecha_prestamo: new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase(),
        nombre_entrega: profile?.full_name?.toUpperCase() || 'INGENIERO RESIDENTE DE OBRA',
        nombre_recibe: item.asignado_a?.toUpperCase() || 'RESPONSABLE NO ASIGNADO',
        obra_nombre: activeProject?.name || 'PROYECTO DE CONSTRUCCIÓN',
        equipos_detalle: `- 1 Unidad de ${item.nombre} \n- Marca/Modelo: ${item.marca_modelo} \n- Notas: ${item.notas || 'ÓPTIMAS CONDICIONES'}`,
        token_firma: item.token_firma, 
        fecha_firma: item.fecha_firma,
        firma_img: signatureDataUri || null 
      };

      const htmlContent = generarPlantillaResponsiva(valePayload);
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      
      await Sharing.shareAsync(uri, { 
        mimeType: 'application/pdf', 
        dialogTitle: `Responsiva_${item.codigo}` 
      });
    } catch (error: any) {
      Alert.alert("Error", "No se pudo generar el PDF: " + error.message);
    }
  };

  const handleOK = async (signature: string) => {
    if (!nombreResponsableSign.trim()) {
      Alert.alert("Nombre Requerido", "Por favor ingresa el nombre de quien recibe antes de guardar la firma.");
      return;
    }
    if (!selectedItemForSign) return;

    const tokenGenerado = `TS-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const timestampActual = new Date().toLocaleString('es-MX');

    const payloadActualizado = {
      ubicacion: 'obra',
      asignado_a: nombreResponsableSign.trim().toUpperCase(),
      token_firma: tokenGenerado,
      fecha_firma: timestampActual
    };

    try {
      const { error } = await supabase
        .from('almacen_herramientas')
        .update(payloadActualizado)
        .eq('id', selectedItemForSign.id);

      if (error) throw error;

      const itemActualizado: HerramientaAlmacen = {
        ...selectedItemForSign,
        ubicacion: 'obra',
        asignado_a: payloadActualizado.asignado_a,
        token_firma: tokenGenerado,
        fecha_firma: timestampActual
      };

      setHerramientas(prev => prev.map(h => h.id === selectedItemForSign.id ? itemActualizado : h));
      setModalFirmaVisible(false);
      setNombreResponsableSign('');
      setSelectedItemForSign(null);

      Alert.alert(
        "🔒 Documento Firmado",
        "La firma autógrafa digital ha sido capturada e indexada exitosamente.",
        [{ text: "Generar PDF Responsiva", onPress: () => ejecutarExportacionPDF(itemActualizado, signature) }]
      );
    } catch (err: any) {
      Alert.alert("Error al procesar", err.message);
    }
  };

  const handleGuardarHerramienta = async () => {
    if (!nombre.trim() || !codigo.trim()) {
      Alert.alert("Campos Incompletos", "El código y el nombre son obligatorios.");
      return;
    }

    const payload = {
      project_id: activeProject?.id,
      codigo: codigo.trim().toUpperCase(),
      nombre: nombre.trim(),
      marca_modelo: marcaModelo.trim() || 'Genérico',
      ubicacion: ubicacionInicial,
      asignado_a: ubicacionInicial === 'obra' ? asignadoA.trim() : null,
      notas: notas.trim() || null
    };

    try {
      if (editingTool) {
        const { error } = await supabase.from('almacen_herramientas').update(payload).eq('id', editingTool.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('almacen_herramientas').insert([payload]);
        if (error) throw error;
      }
      fetchInventarioAlmacen();
      setModalVisible(false);
      setEditingTool(null);
      setCodigo(''); setNombre(''); setMarcaModelo(''); setAsignadoA(''); setNotas('');
    } catch (err: any) {
      Alert.alert("Error", err.message);
    }
  };

  const handleEliminarHerramienta = (id: string) => {
    Alert.alert(
      "⚠️ Dar de Baja Equipo",
      "¿Estás seguro de que deseas eliminar permanentemente este elemento del almacén?",
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Sí, Eliminar", 
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase.from('almacen_herramientas').update({ is_active: false }).eq('id', id);
              if (error) throw error;
              setHerramientas(prev => prev.filter(h => h.id !== id));
              setModalVisible(false);
              setEditingTool(null);
            } catch (err: any) {
              Alert.alert("Error", err.message);
            }
          }
        }
      ]
    );
  };

  const handleCambiarUbicacion = (item: HerramientaAlmacen) => {
    if (item.ubicacion === 'bodega') {
      abrirModalFirma(item);
    } else {
      Alert.alert(
        "📦 Regreso a Bodega",
        `¿Confirmas que el equipo "${item.nombre}" ha sido devuelto físicamente al almacén?`,
        [
          { text: "Cancelar", style: "cancel" },
          { 
            text: "Confirmar Devolución", 
            onPress: async () => {
              try {
                const { error } = await supabase
                  .from('almacen_herramientas')
                  .update({ ubicacion: 'bodega', asignado_a: null, token_firma: null, fecha_firma: null })
                  .eq('id', item.id);

                if (error) throw error;
                setHerramientas(prev => prev.map(h => h.id === item.id ? { ...h, ubicacion: 'bodega', asignado_a: null, token_firma: null, fecha_firma: null } : h));
              } catch (err: any) {
                Alert.alert("Error", err.message);
              }
            } 
          }
        ]
      );
    }
  };

  const filteredHerramientas = herramientas.filter(h => {
    const cumpleBusqueda = 
      h.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
      h.codigo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      h.marca_modelo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (h.asignado_a && h.asignado_a.toLowerCase().includes(searchQuery.toLowerCase()));

    return cumpleBusqueda && (filtroUbicacion === 'todos' ? true : h.ubicacion === filtroUbicacion);
  });

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={() => router.back()}><Feather name="chevron-left" size={28} color="#FFF" /></TouchableOpacity>
          <Text style={styles.headerSubtitle}>CONTROL DE INVENTARIO</Text>
          <View style={{ width: 28 }} />
        </View>
        <Text style={styles.headerTitle}>Almacén de Herramientas</Text>
      </View>

      {/* PANEL DE MÉTRICAS */}
      <View style={styles.metricsRowContainer}>
        <TouchableOpacity style={[styles.metricBoxCompact, filtroUbicacion === 'todos' ? styles.metricBoxActiveTodos : styles.metricBoxInactive]} onPress={() => setFiltroUbicacion('todos')}>
          <Text style={[styles.metricNumberCompact, filtroUbicacion === 'todos' ? { color: '#FFF' } : { color: '#475569' }]}>{herramientas.length}</Text>
          <Text style={[styles.metricLabelCompact, filtroUbicacion === 'todos' ? { color: '#FFF' } : { color: '#475569' }]}>📋 Todos</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.metricBox, styles.metricBoxBodegaStyle, filtroUbicacion === 'bodega' && styles.metricBoxActiveBodega]} onPress={() => setFiltroUbicacion('bodega')}>
          <Text style={styles.metricNumber}>{herramientas.filter(h => h.ubicacion === 'bodega').length}</Text>
          <Text style={styles.metricLabel}>📦 En Bodega</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.metricBox, styles.metricBoxObraStyle, filtroUbicacion === 'obra' && styles.metricBoxActiveObra]} onPress={() => setFiltroUbicacion('obra')}>
          <Text style={[styles.metricNumber, { color: '#EA580C' }]}>{herramientas.filter(h => h.ubicacion === 'obra').length}</Text>
          <Text style={[styles.metricLabel, { color: '#C2410C' }]}>🏗️ En Obra</Text>
        </TouchableOpacity>
      </View>

      {/* BUSCADOR */}
      <View style={styles.searchContainer}>
        <Feather name="search" size={16} color="#64748B" />
        <TextInput style={styles.searchInput} placeholder="Buscar herramienta..." value={searchQuery} onChangeText={setSearchQuery} placeholderTextColor="#94A3B8" />
      </View>

      {isAdminOrOficina && (
        <TouchableOpacity style={styles.staticAddBtn} onPress={iniciarAltaNueva}>
          <Feather name="plus-circle" size={16} color="#FFF" />
          <Text style={styles.staticAddBtnText}>Agregar Herramienta al Almacén</Text>
        </TouchableOpacity>
      )}

      {/* CARDS */}
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {filteredHerramientas.map((item) => (
          <View key={item.id} style={styles.toolCard}>
            <View style={styles.metaLabelRow}>
              <Text style={styles.codeText}>{item.codigo}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => iniciarEdicion(item)} style={styles.editCardBtn}><Text style={styles.editCardBtnText}>Editar</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.locationBadge, item.ubicacion === 'obra' ? styles.badgeObra : styles.badgeBodega]} onPress={() => handleCambiarUbicacion(item)}>
                  <Text style={[styles.locationBadgeText, item.ubicacion === 'obra' ? styles.textObra : styles.textBodega]}>{item.ubicacion === 'obra' ? '🏗️ En Obra' : '📦 En Bodega'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <Text style={styles.toolName}>{item.nombre}</Text>
            <Text style={styles.toolBrand}>{item.marca_modelo}</Text>

            {item.ubicacion === 'bodega' ? (
              <TouchableOpacity style={[styles.pdfActionBtn, { backgroundColor: '#2563EB' }]} onPress={() => abrirModalFirma(item)}>
                <Feather name="edit-3" size={13} color="#FFF" />
                <Text style={styles.pdfActionBtnText}>Asignar y Firmar Entrega</Text>
              </TouchableOpacity>
            ) : (
              <>
                <View style={styles.responsibleBox}>
                  <Feather name="user" size={11} color="#EA580C" />
                  <Text style={styles.responsibleText}>Resguardo: <Text style={{fontWeight: '700'}}>{item.asignado_a}</Text></Text>
                </View>
                {item.token_firma && (
                  <View style={styles.signatureBadgeRow}>
                    <Feather name="shield" size={10} color="#16A34A" />
                    <Text style={styles.signatureBadgeText}>Firmado Autógrafo Digital: {item.token_firma}</Text>
                  </View>
                )}
                <TouchableOpacity style={styles.pdfActionBtn} onPress={() => ejecutarExportacionPDF(item)}>
                  <Feather name="file-text" size={13} color="#FFF" />
                  <Text style={styles.pdfActionBtnText}>Reimprimir Responsiva PDF</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ))}
      </ScrollView>

      {/* 🔒 MODAL DE FIRMA DIGITAL DIBUJADA */}
      <Modal visible={modalFirmaVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.signatureModalBox}>
            <Text style={styles.signatureModalTitle}>✍️ Captura de Firma Autógrafa Digital</Text>
            <Text style={styles.signatureModalSubtitle}>Solicite al receptor que plasme su firma directamente en el cuadro blanco utilizando su dedo.</Text>
            
            <View style={styles.signItemDetailCard}>
              <Text style={{fontSize: 13, fontWeight: 'bold', color: '#1E3A8A'}}>Equipo: {selectedItemForSign?.nombre} ({selectedItemForSign?.codigo})</Text>
            </View>

            <Text style={styles.label}>Nombre de quien Recibe y Acepta Resguardo</Text>
            <TextInput style={styles.input} placeholder="Ej. C. Ing. Alejandro Pérez Acocal" value={nombreResponsableSign} onChangeText={setNombreResponsableSign} />

            <View style={styles.canvasContainer}>
              <SignatureScreen
                ref={signatureRef}
                onOK={handleOK}
                descriptionText="Firme aquí con el dedo"
                clearText="Limpiar"
                confirmText="Procesar"
                webStyle={`.m-signature-pad--footer { display: none; margin: 0px; } body,html { width: 100%; height: 100%; }`}
                autoClear={false}
              />
            </View>

            <View style={{flexDirection: 'row', gap: 10, marginTop: 15}}>
              <TouchableOpacity style={styles.cancelSignBtn} onPress={() => { signatureRef.current?.clearSignature(); }}><Text style={{color: '#475569', fontWeight: 'bold'}}>Borrar Trazo</Text></TouchableOpacity>
              <TouchableOpacity style={styles.confirmSignBtn} onPress={() => { signatureRef.current?.readSignature(); }}><Text style={{color: '#FFF', fontWeight: 'bold'}}>Validar Trazo</Text></TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => setModalFirmaVisible(false)}>
              <Text style={{color: '#EF4444', textAlign: 'center', marginTop: 14, fontSize: 13}}>Cancelar Operación</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL EDICIÓN / ALTA */}
      <Modal visible={modalVisible} animationType="slide" transparent={true} onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setModalVisible(false)} />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingTool ? '✏️ Editar Datos de Equipo' : '📦 Registrar Nueva Herramienta'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}><Feather name="x-circle" size={22} color="#64748B" /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Código</Text>
              <TextInput style={styles.input} value={codigo} onChangeText={setCodigo} autoCapitalize="characters" />
              <Text style={styles.label}>Nombre</Text>
              <TextInput style={styles.input} value={nombre} onChangeText={setNombre} />
              <Text style={styles.label}>Marca/Modelo</Text>
              <TextInput style={styles.input} value={marcaModelo} onChangeText={setMarcaModelo} />
              <Text style={styles.label}>Observaciones</Text>
              <TextInput style={styles.input} value={notas} onChangeText={setNotas} />
              <TouchableOpacity style={styles.saveBtn} onPress={handleGuardarHerramienta}><Text style={styles.saveBtnText}>Guardar Cambios</Text></TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { backgroundColor: '#2563EB', paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerSubtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 'bold', letterSpacing: 1 },
  headerTitle: { color: '#FFF', fontSize: 22, fontWeight: 'bold', marginTop: 8 },
  metricsRowContainer: { flexDirection: 'row', gap: 10, paddingHorizontal: 15, marginTop: 15 },
  metricBox: { flex: 1.2, padding: 10, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  metricNumber: { fontSize: 18, fontWeight: '900', color: '#0369A1' },
  metricLabel: { fontSize: 10, fontWeight: '700', color: '#0369A1', marginTop: 2 },
  metricBoxCompact: { flex: 0.8, padding: 10, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  metricNumberCompact: { fontSize: 18, fontWeight: '900' },
  metricLabelCompact: { fontSize: 10, fontWeight: '700', marginTop: 2 },
  metricBoxActiveTodos: { backgroundColor: '#2563EB', borderColor: '#1D4ED8' },
  metricBoxInactive: { backgroundColor: '#FFF', borderColor: '#E2E8F0' },
  metricBoxActiveBodega: { backgroundColor: '#E0F2FE', borderWidth: 2, borderColor: '#0284C7' },
  metricBoxActiveObra: { backgroundColor: '#FFEDD5', borderWidth: 2, borderColor: '#EA580C' },
  metricBoxBodegaStyle: { backgroundColor: '#E0F2FE', borderColor: '#BAE6FD' },
  metricBoxObraStyle: { backgroundColor: '#FFEDD5', borderColor: '#FED7AA' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', marginHorizontal: 15, marginTop: 15, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 13, color: '#1E293B' },
  staticAddBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#2563EB', marginHorizontal: 15, marginTop: 12, paddingVertical: 12, borderRadius: 12, gap: 8 },
  staticAddBtnText: { color: '#FFF', fontSize: 13, fontWeight: 'bold' },
  body: { padding: 15, paddingBottom: 120 },
  toolCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  metaLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  codeText: { fontSize: 11, fontWeight: '800', color: '#2563EB', backgroundColor: '#EFF6FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  editCardBtn: { backgroundColor: '#EFF6FF', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: '#BFDBFE' },
  editCardBtnText: { color: '#2563EB', fontSize: 11, fontWeight: '700' },
  toolName: { fontSize: 15, fontWeight: 'bold', color: '#0F172A' },
  toolBrand: { fontSize: 12, color: '#64748B', marginTop: 1 },
  locationBadge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 10 },
  badgeBodega: { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#DCFCE7' },
  badgeObra: { backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FFEDD5' },
  locationBadgeText: { fontSize: 10, fontWeight: 'bold' },
  textBodega: { color: '#16A34A' },
  textObra: { color: '#C2410C' },
  responsibleBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF7ED', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginTop: 6, gap: 4, alignSelf: 'flex-start' },
  responsibleText: { fontSize: 11, color: '#C2410C' },
  pdfActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1E293B', paddingVertical: 8, borderRadius: 10, marginTop: 10, gap: 6 },
  pdfActionBtnText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  
  modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  signatureModalBox: { backgroundColor: '#FFF', borderRadius: 20, padding: 20, width: '100%', maxWidth: 400 },
  signatureModalTitle: { fontSize: 16, fontWeight: 'bold', color: '#0F172A', textAlign: 'center' },
  signatureModalSubtitle: { fontSize: 11, color: '#64748B', textAlign: 'center', marginVertical: 6, lineHeight: 15 },
  signItemDetailCard: { backgroundColor: '#F8FAFC', padding: 12, borderRadius: 10, marginVertical: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  canvasContainer: { width: '100%', height: 200, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12, overflow: 'hidden', marginTop: 10, backgroundColor: '#FFF' },
  cancelSignBtn: { flex: 1, backgroundColor: '#E2E8F0', padding: 12, borderRadius: 8, alignItems: 'center' },
  confirmSignBtn: { flex: 2, backgroundColor: '#16A34A', padding: 12, borderRadius: 8, alignItems: 'center' },
  signatureBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  signatureBadgeText: { fontSize: 10, fontWeight: 'bold', color: '#16A34A', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1E293B' },
  label: { fontSize: 12, fontWeight: '700', color: '#475569', marginTop: 10, marginBottom: 4 },
  input: { backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 10, fontSize: 14, color: '#1E293B', marginBottom: 5 },
  saveBtn: { backgroundColor: '#2563EB', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 }
});