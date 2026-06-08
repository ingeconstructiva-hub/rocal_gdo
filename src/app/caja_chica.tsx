import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useProject } from '../context/ProjectContext';
import { supabase } from '../lib/supabase';

interface GastoCaja {
  id: string;
  concepto: string;
  monto: number;
  foto_ticket: string | null;
  fecha: string;
  is_pending?: boolean;
}

export default function CajaChicaScreen() {
  const router = useRouter();
  const { activeProject, isOffline, lastSync } = useProject();

  const [gastos, setGastos] = useState<GastoCaja[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Estados para el formulario
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('');
  const [foto, setFoto] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Carga inicial y por pestaña
  useFocusEffect(
    useCallback(() => {
      if (activeProject?.id) loadGastos();
    }, [activeProject])
  );

  // Recarga en vivo por timbre de sincronización
  useEffect(() => {
    if (activeProject?.id) {
      setTimeout(() => loadGastos(), 500);
    }
  }, [isOffline, lastSync]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadGastos();
    setRefreshing(false);
  }, [activeProject, isOffline]);

  const loadGastos = async () => {
    const projectId = activeProject?.id;
    if (!projectId) return;

    const storageKey = `@caja_chica_cache_${projectId}`;

    // 1. Leer Pendientes de la bandeja de salida
    let uiPending: GastoCaja[] = [];
    try {
      const pendingData = await AsyncStorage.getItem('@bandeja_salida_caja');
      if (pendingData) {
        const allPending = JSON.parse(pendingData);
        uiPending = allPending
          .filter((g: any) => g.project_id === projectId)
          .map((g: any) => ({
            id: `temp_${Date.now()}_${Math.random()}`,
            concepto: g.concepto,
            monto: g.monto,
            foto_ticket: g.foto_local_uri,
            fecha: new Date().toISOString(),
            is_pending: true
          }));
      }
    } catch (e) { console.log(e); }

    if (isOffline) {
      const cached = await AsyncStorage.getItem(storageKey);
      setGastos([...uiPending, ...(cached ? JSON.parse(cached) : [])]);
      setLoading(false);
    } else {
      const { data, error } = await supabase
        .from('caja_chica')
        .select('*')
        .eq('project_id', projectId)
        .eq('is_active', true)
        .order('fecha', { ascending: false });

      if (data) {
        setGastos([...uiPending, ...data]);
        await AsyncStorage.setItem(storageKey, JSON.stringify(data));
      }
      setLoading(false);
    }
  };

  const handleTomarFoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Error', 'Se necesita permiso de cámara.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.6,
      allowsEditing: true,
    });

    if (!result.canceled) {
      setFoto(result.assets[0].uri);
    }
  };

  const handleGuardarGasto = async () => {
    if (!monto || !concepto) {
      Alert.alert("Campos incompletos", "Por favor indica el monto y el concepto.");
      return;
    }

    setIsSaving(true);
    const projectId = activeProject.id;

    const nuevoGasto = {
      project_id: projectId,
      monto: parseFloat(monto),
      concepto: concepto.trim(),
      foto_local_uri: foto,
      fecha: new Date().toISOString(),
      local_uuid: Crypto.randomUUID(),
    };

    if (isOffline) {
      // 🔴 GUARDADO OFFLINE
      const existing = await AsyncStorage.getItem('@bandeja_salida_caja');
      const outbox = existing ? JSON.parse(existing) : [];
      outbox.push(nuevoGasto);
      await AsyncStorage.setItem('@bandeja_salida_caja', JSON.stringify(outbox));

      Alert.alert("Guardado Local", "El gasto se sincronizará cuando tengas internet.");
      cerrarModal();
      loadGastos();
      setIsSaving(false);
    } else {
      // 🟢 GUARDADO ONLINE (Simplificado para el ejemplo, subiría foto primero)
      try {
        let fotoUrl = null;
        if (foto) {
          const fileName = `ticket_${Date.now()}.jpg`;
          const formData = new FormData();
          formData.append('file', { uri: foto, name: fileName, type: 'image/jpeg' } as any);
          
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('tickets_caja_chica')
            .upload(fileName, formData);
          
          if (!uploadError) {
            const { data: pUrl } = supabase.storage.from('tickets_caja_chica').getPublicUrl(fileName);
            fotoUrl = pUrl.publicUrl;
          }
        }

        const { error } = await supabase.from('caja_chica').insert([{
          project_id: projectId,
          monto: nuevoGasto.monto,
          concepto: nuevoGasto.concepto,
          foto_ticket: fotoUrl
        }]);

        if (error) throw error;
        Alert.alert("Éxito", "Gasto registrado en la nube.");
        cerrarModal();
        loadGastos();
      } catch (e: any) {
        Alert.alert("Error", e.message);
      } finally {
        setIsSaving(false);
      }
    }
  };

  const cerrarModal = () => {
    setIsModalVisible(false);
    setMonto('');
    setConcepto('');
    setFoto(null);
  };

  const totalGastado = gastos.reduce((acc, curr) => acc + Number(curr.monto), 0);

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Feather name="chevron-left" size={28} color="#FFF" />
          </TouchableOpacity>
          <View style={{ width: 28 }} />
        </View>
        <View style={styles.headerBottomRow}>
          <Text style={styles.headerTitle}>Caja Chica</Text>
        </View>
      </View>

      <ScrollView 
        style={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} />}
      >
        {/* CARD RESUMEN */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total Gastado (Esta Obra)</Text>
          <Text style={styles.summaryValue}>${totalGastado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</Text>
        </View>

        <Text style={styles.sectionTitle}>Historial de Gastos</Text>

        {loading ? <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 20 }} /> : 
         gastos.length === 0 ? <Text style={styles.emptyText}>No hay gastos registrados aún.</Text> :
         gastos.map((item) => (
          <View key={item.id} style={[styles.gastoCard, item.is_pending && styles.pendingCard]}>
            <View style={styles.gastoInfo}>
              <Text style={styles.gastoConcepto}>{item.concepto}</Text>
              <Text style={styles.gastoFecha}>{new Date(item.fecha).toLocaleDateString()}</Text>
              {item.is_pending && <Text style={styles.pendingTag}>⏳ Pendiente de subir</Text>}
            </View>
            <View style={styles.gastoMontoContainer}>
              <Text style={styles.gastoMonto}>${Number(item.monto).toFixed(2)}</Text>
              {item.foto_ticket && (
                <TouchableOpacity onPress={() => Alert.alert("Comprobante", "Abriendo foto...")}>
                  <Feather name="image" size={18} color="#2563EB" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* BOTÓN FLOTANTE */}
      <TouchableOpacity style={styles.fab} onPress={() => setIsModalVisible(true)}>
        <Feather name="plus" size={30} color="#FFF" />
      </TouchableOpacity>

      {/* MODAL NUEVO GASTO */}
      <Modal visible={isModalVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nuevo Gasto de Caja</Text>
              <TouchableOpacity onPress={cerrarModal}><Feather name="x" size={24} color="#6B7280" /></TouchableOpacity>
            </View>

            <Text style={styles.label}>Monto ($)</Text>
            <TextInput 
              style={styles.inputMonto} 
              placeholder="0.00" 
              keyboardType="numeric" 
              value={monto} 
              onChangeText={setMonto} 
            />

            <Text style={styles.label}>Concepto</Text>
            <TextInput 
              style={styles.input} 
              placeholder="Ej. Gasolina, Clavos, Comida..." 
              value={concepto} 
              onChangeText={setConcepto} 
            />

            <TouchableOpacity style={styles.fotoBtn} onPress={handleTomarFoto}>
              {foto ? (
                <Image source={{ uri: foto }} style={styles.previewFoto} />
              ) : (
                <>
                  <Feather name="camera" size={24} color="#2563EB" />
                  <Text style={styles.fotoBtnText}>Tomar foto al ticket</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.saveButton, isSaving && { opacity: 0.7 }]} 
              onPress={handleGuardarGasto}
              disabled={isSaving}
            >
              {isSaving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveButtonText}>Guardar Gasto</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: { backgroundColor: '#2563EB', paddingTop: 60, paddingBottom: 25, paddingHorizontal: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 },
  backButton: { padding: 4, marginLeft: -4, top: 26},
  headerSubtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  headerBottomRow: { flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: '#FFF', fontSize: 26, fontWeight: 'bold', textAlign: 'center', top: -25 },
  headerSmall: { color: 'rgba(255,255,255,0.9)', fontSize: 14, marginTop: 4 },
  body: { flex: 1, padding: 20 },
  summaryCard: { backgroundColor: '#1E293B', padding: 20, borderRadius: 16, alignItems: 'center', marginBottom: 25 },
  summaryLabel: { color: '#94A3B8', fontSize: 13, marginBottom: 5 },
  summaryValue: { color: '#FFF', fontSize: 28, fontWeight: 'bold' },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#374151', marginBottom: 15 },
  gastoCard: { backgroundColor: '#FFF', padding: 15, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  gastoInfo: { flex: 1, paddingRight: 10 },
  pendingCard: { borderColor: '#F59E0B', borderLeftWidth: 4 },
  gastoConcepto: { fontSize: 15, fontWeight: '600', color: '#111827' },
  gastoFecha: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  pendingTag: { fontSize: 10, color: '#D97706', fontWeight: 'bold', marginTop: 4 },
  gastoMontoContainer: { alignItems: 'flex-end' },
  gastoMonto: { fontSize: 16, fontWeight: 'bold', color: '#059669', marginBottom: 5 },
  emptyText: { textAlign: 'center', color: '#9CA3AF', marginTop: 40, fontStyle: 'italic' },
  fab: { position: 'absolute', bottom: 30, right: 20, backgroundColor: '#2563EB', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 25, minHeight: 450 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold' },
  label: { fontSize: 13, fontWeight: 'bold', color: '#4B5563', marginBottom: 8, marginTop: 10 },
  inputMonto: { fontSize: 32, fontWeight: 'bold', color: '#059669', borderBottomWidth: 2, borderColor: '#E5E7EB', paddingVertical: 5, marginBottom: 15 },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, padding: 12, fontSize: 16, marginBottom: 15 },
  fotoBtn: { borderStyle: 'dashed', borderWidth: 2, borderColor: '#BFDBFE', borderRadius: 12, height: 100, justifyContent: 'center', alignItems: 'center', marginBottom: 20, overflow: 'hidden' },
  fotoBtnText: { color: '#2563EB', fontWeight: 'bold', marginTop: 5 },
  previewFoto: { width: '100%', height: '100%' },
  saveButton: { backgroundColor: '#2563EB', padding: 16, borderRadius: 12, alignItems: 'center' },
  saveButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 }
});