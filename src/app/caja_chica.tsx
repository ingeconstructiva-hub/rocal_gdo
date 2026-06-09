import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useProject } from '../context/ProjectContext';
import { supabase } from '../lib/supabase';

interface GastoCaja {
  id: string;
  numero_nota: string;
  encargado: string;
  monto: number;
  unidad: string;
  tipo_deposito: 'efectivo' | 'transferencia';
  justificacion: string;
  foto_ticket: string | null;
  fecha: string;
  is_pending?: boolean;
}

export default function CajaChicaScreen() {
  const router = useRouter();
  const { activeProject, isOffline } = useProject();

  const [gastos, setGastos] = useState<GastoCaja[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);

  // NUEVOS ESTADOS DEL FORMULARIO
  const [numeroNota, setNumeroNota] = useState('');
  const [encargado, setEncargado] = useState('');
  const [monto, setMonto] = useState(''); // Importe
  const [unidad, setUnidad] = useState('');
  const [tipoDeposito, setTipoDeposito] = useState<'efectivo' | 'transferencia'>('efectivo');
  const [justificacion, setJustificacion] = useState('');
  const [fotoTicket, setFotoTicket] = useState<string | null>(null);

  useEffect(() => {
    if (activeProject?.id) {
      loadGastos();
    }
  }, [activeProject, isOffline]);

  const loadGastos = async () => {
    setLoading(true);
    const projectId = activeProject?.id;
    if (!projectId) return;

    const storageKey = `@caja_chica_cache_${projectId}`;

    // Cargar pendientes locales para pintar en la UI inmediatamente
    let uiPending: GastoCaja[] = [];
    try {
      const pendingData = await AsyncStorage.getItem('@bandeja_salida_caja');
      if (pendingData) {
        const allPending = JSON.parse(pendingData);
        const projectPending = allPending.filter((g: any) => g.project_id === projectId);
        uiPending = projectPending.map((g: any, i: number) => ({
          id: g.id || `temp_caja_${Date.now()}_${i}`,
          numero_nota: g.numero_nota,
          encargado: g.encargado,
          monto: Number(g.monto),
          unidad: g.unidad,
          tipo_deposito: g.tipo_deposito,
          justificacion: g.justificacion,
          foto_ticket: g.foto_ticket,
          fecha: g.fecha,
          is_pending: true
        }));
      }
    } catch (e) { console.log(e); }

    if (isOffline) {
      const cached = await AsyncStorage.getItem(storageKey);
      const parsedCached = cached ? JSON.parse(cached) : [];
      setGastos([...uiPending, ...parsedCached]);
      setLoading(false);
    } else {
      try {
        const { data, error } = await supabase
          .from('caja_chica')
          .select('*')
          .eq('project_id', projectId)
          .eq('is_active', true)
          .order('fecha', { ascending: false });

        if (error) throw error;

        if (data) {
          await AsyncStorage.setItem(storageKey, JSON.stringify(data));
          setGastos([...uiPending, ...data]);
        }
      } catch (err) {
        const cached = await AsyncStorage.getItem(storageKey);
        setGastos([...uiPending, ...(cached ? JSON.parse(cached) : [])]);
      } finally {
        setLoading(false);
      }
    }
  };

  const seleccionarFoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert("Permiso requerido", "Necesitamos acceso a la cámara para el ticket.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.6,
    });
    if (!result.canceled) {
      setFotoTicket(result.assets[0].uri);
    }
  };

  const limpiarFormulario = () => {
    setNumeroNota('');
    setEncargado('');
    setMonto('');
    setUnidad('');
    setTipoDeposito('efectivo');
    setJustificacion('');
    setFotoTicket(null);
  };

  const handleGuardarGasto = async () => {
    if (!monto.trim() || !justificacion.trim() || !encargado.trim()) {
      Alert.alert("Campos incompletos", "Importe, Encargado y Justificación son obligatorios.");
      return;
    }

    const projectId = activeProject?.id;
    if (!projectId) return;

    setIsSaving(true);
    const uniqueId = `caja_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    
    const nuevoGastoPayload = {
      id: uniqueId,
      project_id: projectId,
      numero_nota: numeroNota.trim() || 'S/N',
      encargado: encargado.trim(),
      monto: Number(monto),
      unidad: unidad.trim() || 'General',
      tipo_deposito: tipoDeposito,
      justificacion: justificacion.trim(),
      foto_ticket: fotoTicket,
      fecha: new Date().toISOString()
    };

    const saveToOutbox = async () => {
      const existing = await AsyncStorage.getItem('@bandeja_salida_caja');
      const outbox = existing ? JSON.parse(existing) : [];
      outbox.push(nuevoGastoPayload);
      await AsyncStorage.setItem('@bandeja_salida_caja', JSON.stringify(outbox));

      setGastos(prev => [{ ...nuevoGastoPayload, is_pending: true }, ...prev]);
      setIsModalVisible(false);
      limpiarFormulario();
      setTimeout(() => {
        Alert.alert("Guardado Local", "Gasto registrado en la memoria interna de la obra. Se subirá al recuperar señal.");
      }, 300);
    };

    if (isOffline) {
      await saveToOutbox();
      setIsSaving(false);
      return;
    }

    try {
      let fotoUrl = null;
      if (fotoTicket) {
        // Lógica de subida al bucket (se mantiene intacta usando el id único generado)
        const filename = `${uniqueId}.jpg`;
        const formData = new FormData();
        formData.append('file', { uri: fotoTicket, name: filename, type: 'image/jpeg' } as any);
        
        const { error: uploadError } = await supabase.storage
          .from('tickets')
          .upload(filename, formData as any);
          
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('tickets').getPublicUrl(filename);
          fotoUrl = urlData.publicUrl;
        }
      }

      const { error } = await supabase.from('caja_chica').insert([{
        id: nuevoGastoPayload.id,
        project_id: nuevoGastoPayload.project_id,
        numero_nota: nuevoGastoPayload.numero_nota,
        encargado: nuevoGastoPayload.encargado,
        monto: nuevoGastoPayload.monto,
        unidad: nuevoGastoPayload.unidad,
        tipo_deposito: nuevoGastoPayload.tipo_deposito,
        justificacion: nuevoGastoPayload.justificacion,
        foto_ticket: fotoUrl,
        fecha: nuevoGastoPayload.fecha
      }]);

      if (error) throw error;

      setIsModalVisible(false);
      limpiarFormulario();
      setTimeout(() => { Alert.alert("Éxito", "Gasto sincronizado en la nube correctamente."); }, 300);
      loadGastos();
    } catch (e: any) {
      if (e.message?.includes('network') || e.message?.includes('Fetch')) {
        await saveToOutbox();
      } else {
        Alert.alert("Error", e.message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const totalCaja = gastos.reduce((sum, g) => sum + Number(g.monto), 0);

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Feather name="chevron-left" size={28} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerSubtitle}>CAJA CHICA</Text>
          <View style={{ width: 28 }} />
        </View>
        <Text style={styles.headerTitle}>Flujo de Efectivo</Text>
        <Text style={styles.totalAmount}>${totalCaja.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</Text>
      </View>

      {/* LISTA DE GASTOS */}
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Historial de Movimientos</Text>
        {loading ? (
          <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 30 }} />
        ) : gastos.length === 0 ? (
          <Text style={styles.emptyText}>No hay gastos registrados en esta obra.</Text>
        ) : (
          gastos.map((gasto) => (
            <View key={gasto.id} style={styles.gastoCard}>
              <View style={styles.gastoMainRow}>
                <View style={{ flex: 1 }}>
                  <View style={{flexDirection: 'row', alignItems: 'center'}}>
                    <Text style={styles.gastoJustificacion}>{gasto.justificacion}</Text>
                    {gasto.is_pending && <Text style={styles.pendingBadge}>PENDIENTE</Text>}
                  </View>
                  <Text style={styles.gastoMeta}>Resp: {gasto.encargado} • Nota: {gasto.numero_nota}</Text>
                  <Text style={styles.gastoSubMeta}>Unidad/Área: {gasto.unidad} • Tipo: {gasto.tipo_deposito}</Text>
                </View>
                <Text style={styles.gastoMonto}>-${Number(gasto.monto).toFixed(0)}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setIsModalVisible(true)}>
        <Feather name="plus" size={28} color="#FFF" />
      </TouchableOpacity>

      {/* MODAL NUEVO GASTO */}
      <Modal visible={isModalVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Registrar Gasto</Text>
                <TouchableOpacity onPress={() => { setIsModalVisible(false); limpiarFormulario(); }}>
                  <Feather name="x" size={24} color="#6B7280" />
                </TouchableOpacity>
              </View>

              <View style={styles.rowInputs}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.modalLabel}>No. de Nota</Text>
                  <TextInput style={styles.modalInput} placeholder="Ej. 451A" placeholderTextColor="#9CA3AF" value={numeroNota} onChangeText={setNumeroNota} returnKeyType="done" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalLabel}>Importe ($)</Text>
                  <TextInput style={styles.modalInput} placeholder="Ej. 1250" keyboardType="numeric" placeholderTextColor="#9CA3AF" value={monto} onChangeText={setMonto} returnKeyType="done" />
                </View>
              </View>

              <Text style={styles.modalLabel}>Encargado / Responsable</Text>
              <TextInput style={styles.modalInput} placeholder="Ej. Ing. Héctor Escobar" placeholderTextColor="#9CA3AF" value={encargado} onChangeText={setEncargado} returnKeyType="done" />

              <Text style={styles.modalLabel}>Unidad / Vehículo / Frente</Text>
              <TextInput style={styles.modalInput} placeholder="Ej. Camioneta Ford / Frente 2" placeholderTextColor="#9CA3AF" value={unidad} onChangeText={setUnidad} returnKeyType="done" />

              <Text style={styles.modalLabel}>Tipo de Depósito</Text>
              <View style={styles.selectorContainer}>
                <TouchableOpacity style={[styles.selectorBtn, tipoDeposito === 'efectivo' && styles.selectorActive]} onPress={() => setTipoDeposito('efectivo')}>
                  <Feather name="dollar-sign" size={16} color={tipoDeposito === 'efectivo' ? '#FFF' : '#4B5563'} />
                  <Text style={[styles.selectorText, tipoDeposito === 'efectivo' && styles.selectorTextActive]}>Efectivo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.selectorBtn, tipoDeposito === 'transferencia' && styles.selectorActive]} onPress={() => setTipoDeposito('transferencia')}>
                  <Feather name="credit-card" size={16} color={tipoDeposito === 'transferencia' ? '#FFF' : '#4B5563'} />
                  <Text style={[styles.selectorText, tipoDeposito === 'transferencia' && styles.selectorTextActive]}>Transferencia</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.modalLabel}>Justificación / Concepto</Text>
              <TextInput style={[styles.modalInput, { height: 70, textAlignVertical: 'top' }]} placeholder="Ej. Compra de clavos de 2 pulgadas para cimbra" placeholderTextColor="#9CA3AF" value={justificacion} onChangeText={setJustificacion} multiline />

              <Text style={styles.modalLabel}>Evidencia (Ticket/Comprobante)</Text>
              <TouchableOpacity style={styles.cameraBtn} onPress={seleccionarFoto}>
                {fotoTicket ? (
                  <Image source={{ uri: fotoTicket }} style={styles.previewImage} />
                ) : (
                  <>
                    <Feather name="camera" size={24} color="#2563EB" />
                    <Text style={styles.cameraBtnText}>Tomar foto de evidencia</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.saveBtn} onPress={handleGuardarGasto} disabled={isSaving}>
                {isSaving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Guardar Movimiento</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { backgroundColor: '#2563EB', paddingTop: 60, paddingBottom: 25, paddingHorizontal: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  backButton: { padding: 4, marginLeft: -4 },
  headerSubtitle: { color: 'rgba(255, 255, 255, 0.6)', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  headerTitle: { color: '#94A3B8', fontSize: 14, fontWeight: '500', marginTop: 5 },
  totalAmount: { color: '#FFF', fontSize: 32, fontWeight: 'bold', marginTop: 2 },
  body: { padding: 20, paddingBottom: 120 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#334155', marginBottom: 15 },
  emptyText: { textAlign: 'center', color: '#64748B', marginTop: 30, fontStyle: 'italic' },
  gastoCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 12, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, borderWidth: 1, borderColor: '#F1F5F9' },
  gastoMainRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gastoJustificacion: { fontSize: 14, fontWeight: 'bold', color: '#1E293B', flex: 1 },
  pendingBadge: { fontSize: 8, color: '#D97706', backgroundColor: '#FEF3C7', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, fontWeight: 'bold', marginLeft: 6, alignSelf: 'center' },
  gastoMeta: { fontSize: 11, color: '#475569', marginTop: 4 },
  gastoSubMeta: { fontSize: 10, color: '#64748B', marginTop: 2 },
  gastoMonto: { fontSize: 16, fontWeight: 'bold', color: '#DC2626', marginLeft: 10 },
  fab: { position: 'absolute', bottom: 30, right: 25, width: 60, height: 60, borderRadius: 30, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalScroll: { flexGrow: 1, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#0F172A' },
  modalLabel: { fontSize: 12, fontWeight: '700', color: '#475569', marginTop: 12, marginBottom: 6 },
  modalInput: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 12, fontSize: 14, color: '#0F172A' },
  rowInputs: { flexDirection: 'row', justifyContent: 'space-between' },
  selectorContainer: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 12, padding: 4, marginTop: 2 },
  selectorBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10 },
  selectorActive: { backgroundColor: '#2563EB' },
  selectorText: { fontSize: 13, color: '#4B5563', fontWeight: '600', marginLeft: 6 },
  selectorTextActive: { color: '#FFF' },
  cameraBtn: { height: 90, borderWidth: 1, borderColor: '#BFDBFE', borderStyle: 'dashed', backgroundColor: '#EFF6FF', borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 5, overflow: 'hidden' },
  cameraBtnText: { color: '#2563EB', fontSize: 13, fontWeight: '600', marginTop: 6 },
  previewImage: { width: '100%', height: '100%' },
  saveBtn: { backgroundColor: '#059669', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 25 },
  saveBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 15 }
});