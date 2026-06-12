import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useProject } from '../context/ProjectContext';
import { useUser } from '../context/UserContext'; // 🧠 Importamos el motor de roles
import { supabase } from '../lib/supabase';

interface MovimientoFinanciero {
  id: string;
  tipo: 'ingreso' | 'egreso';
  concepto: string;
  encargado: string;
  unidad?: string;
  monto: number;
  precio_unitario?: number;
  cantidad?: number;
  tipo_deposito: string;
  numero_nota?: string;
  foto_ticket: string | null;
  fecha: string;
  is_pending?: boolean;
}

export default function CajaChicaScreen() {
  const router = useRouter();
  const { activeProject, isOffline } = useProject();
  const { profile } = useUser(); // 🧠 Obtenemos el perfil y el rol del usuario

  const [movimientos, setMovimientos] = useState<MovimientoFinanciero[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);

  const [trabajadores, setTrabajadores] = useState<any[]>([]);
  const [showTrabajadorModal, setShowTrabajadorModal] = useState(false);

  const [tipoMovimientoForm, setTipoMovimientoForm] = useState<'ingreso' | 'egreso'>('egreso');

  const [numeroNota, setNumeroNota] = useState('');
  const [encargado, setEncargado] = useState('');
  const [unidad, setUnidad] = useState('');
  const [tipoDeposito, setTipoDeposito] = useState<'efectivo' | 'transferencia'>('efectivo');
  const [justificacion, setJustificacion] = useState('');
  const [fotoTicket, setFotoTicket] = useState<string | null>(null);
  
  const [cantidad, setCantidad] = useState('1');
  const [precioUnitario, setPrecioUnitario] = useState('');
  const [importeInvertido, setImporteInvertido] = useState('');

  // Validadores rápidos de permisos
  const isResidente = profile?.role === 'residente';
  const isAdminOrOficina = profile?.role === 'admin' || profile?.role === 'oficina';

  useEffect(() => {
    if (activeProject?.id) {
      loadLibroMayor();
      loadTrabajadores(); 
    }
  }, [activeProject, isOffline]);

  const loadTrabajadores = async () => {
    const pid = activeProject?.id;
    if (!pid) return;
    try {
      const storageKey = `@lista_workers_${pid}`;
      const cached = await AsyncStorage.getItem(storageKey);
      if (cached) setTrabajadores(JSON.parse(cached));

      if (!isOffline) {
        const { data, error } = await supabase
          .from('workers')
          .select('id, name, role')
          .eq('project_id', pid)
          .eq('is_active', true)
          .order('name', { ascending: true });
          
        if (data && !error) {
          setTrabajadores(data);
          await AsyncStorage.setItem(storageKey, JSON.stringify(data));
        }
      }
    } catch (e) {
      console.log("Error cargando trabajadores", e);
    }
  };

  const loadLibroMayor = async () => {
    setLoading(true);
    const pid = activeProject?.id;
    if (!pid) return;

    const storageKeyCaja = `@caja_chica_cache_${pid}`;
    const storageKeyIngresos = `@ingresos_cache_${pid}`;

    try {
      let listaEgresos: any[] = [];
      let listaIngresos: any[] = [];

      if (isOffline) {
        const cachedCaja = await AsyncStorage.getItem(storageKeyCaja);
        const cachedIngresos = await AsyncStorage.getItem(storageKeyIngresos);
        listaEgresos = cachedCaja ? JSON.parse(cachedCaja) : [];
        listaIngresos = cachedIngresos ? JSON.parse(cachedIngresos) : [];
      } else {
        const { data: egresos } = await supabase.from('caja_chica').select('*').eq('project_id', pid).eq('is_active', true);
        const { data: ingresos } = await supabase.from('ingresos_obra').select('*').eq('project_id', pid).eq('is_active', true);
        
        listaEgresos = egresos || [];
        listaIngresos = ingresos || [];

        await AsyncStorage.setItem(storageKeyCaja, JSON.stringify(listaEgresos));
        await AsyncStorage.setItem(storageKeyIngresos, JSON.stringify(listaIngresos));
      }

      const egresosFormateados: MovimientoFinanciero[] = listaEgresos.map(e => ({
        id: e.id,
        tipo: 'egreso',
        concepto: e.justificacion || e.concepto,
        encargado: e.encargado,
        unidad: e.unidad,
        monto: Number(e.monto),
        precio_unitario: Number(e.precio_unitario || 0),
        cantidad: Number(e.cantidad || 1),
        tipo_deposito: e.tipo_deposito,
        numero_nota: e.numero_nota,
        foto_ticket: e.foto_ticket,
        fecha: e.fecha
      }));

      const ingresosFormateados: MovimientoFinanciero[] = listaIngresos.map(i => ({
        id: i.id,
        tipo: 'ingreso',
        concepto: i.concepto,
        encargado: i.solicitante || 'Administración',
        monto: Number(i.monto),
        tipo_deposito: i.referencia || 'Depósito',
        foto_ticket: null,
        fecha: i.fecha
      }));

      const historialUnificado = [...ingresosFormateados, ...egresosFormateados];
      historialUnificado.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
      
      setMovimientos(historialUnificado);
    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
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

  const gastoCalculado = Number(cantidad || 0) * Number(precioUnitario || 0);

  const handleGuardarMovimiento = async () => {
    const pid = activeProject?.id;
    if (!pid) return;

    setIsSaving(true);

    try {
      if (tipoMovimientoForm === 'ingreso') {
        if (!importeInvertido.trim() || !encargado.trim()) {
          Alert.alert("Campos incompletos", "El importe y el nombre del solicitante son obligatorios.");
          setIsSaving(false);
          return;
        }

        const nuevoIngreso = {
          project_id: pid,
          monto: Number(importeInvertido),
          concepto: `Fondeo solicitado por: ${encargado.trim()}`,
          referencia: tipoDeposito,
          fecha: new Date().toISOString()
        };

        if (!isOffline) {
          const { error } = await supabase.from('ingresos_obra').insert([nuevoIngreso]);
          if (error) throw error;
        }

      } else {
        if (!precioUnitario.trim() || !justificacion.trim() || !encargado.trim()) {
          Alert.alert("Campos incompletos", "Descripción, Encargado y P.U. son obligatorios.");
          setIsSaving(false);
          return;
        }

        let fotoUrl = null;
        if (fotoTicket && !isOffline) {
          const filename = `ticket_${Date.now()}.jpg`;
          const formData = new FormData();
          formData.append('file', { uri: fotoTicket, name: filename, type: 'image/jpeg' } as any);
          const { error: uploadError } = await supabase.storage.from('tickets').upload(filename, formData as any);
          if (!uploadError) {
            const { data: urlData } = supabase.storage.from('tickets').getPublicUrl(filename);
            fotoUrl = urlData.publicUrl;
          }
        }

        const nuevoGasto = {
          project_id: pid,
          numero_nota: numeroNota.trim() || 'S/N',
          encargado: encargado.trim(),
          monto: gastoCalculado,
          precio_unitario: Number(precioUnitario),
          cantidad: Number(cantidad),
          unidad: unidad.trim() || 'General',
          tipo_deposito: tipoDeposito,
          justificacion: justificacion.trim(),
          concepto: justificacion.trim(),
          foto_ticket: fotoUrl,
          fecha: new Date().toISOString()
        };

        if (!isOffline) {
          const { error } = await supabase.from('caja_chica').insert([nuevoGasto]);
          if (error) throw error;
        }
      }

      setIsModalVisible(false);
      limpiarFormulario();
      Alert.alert("¡Éxito!", "Movimiento financiero registrado correctamente.");
      loadLibroMayor();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setIsSaving(false);
    }
  };

  // 🗑️ FUNCIÓN PARA ELIMINAR (Solo para Admins y Oficina)
  const handleEliminarMovimiento = async (id: string, tipo: 'ingreso' | 'egreso') => {
    if (isOffline) {
      Alert.alert("Modo Offline", "Necesitas internet para eliminar registros.");
      return;
    }

    Alert.alert(
      "Confirmar Eliminación", 
      "¿Estás seguro de que quieres borrar este movimiento? Esto afectará los saldos.", 
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Sí, Eliminar", 
          style: "destructive",
          onPress: async () => {
            try {
              const tabla = tipo === 'ingreso' ? 'ingresos_obra' : 'caja_chica';
              const { error } = await supabase.from(tabla).update({ is_active: false }).eq('id', id);
              if (error) throw error;
              
              setMovimientos(prev => prev.filter(m => m.id !== id));
            } catch (error: any) {
              Alert.alert("Error", error.message);
            }
          }
        }
      ]
    );
  };

  const limpiarFormulario = () => {
    setNumeroNota('');
    setEncargado('');
    setUnidad('');
    setJustificacion('');
    setFotoTicket(null);
    setCantidad('1');
    setPrecioUnitario('');
    setImporteInvertido('');
    setTipoMovimientoForm('egreso'); // Resetear siempre a Egreso por si el admin entró a ingreso
  };

  const handleExportarExcel = async () => {
    if (movimientos.length === 0) {
      Alert.alert("Sin datos", "No hay movimientos registrados para exportar.");
      return;
    }
    try {
      const encabezados = ["Fecha", "Tipo", "No. Nota", "Concepto/Justificacion", "Responsable", "Unidad/Frente", "Metodo Pago", "Cantidad", "P.U. ($)", "Monto Total ($)\n"];
      const filas = movimientos.map(g => {
        const fechaFormateada = new Date(g.fecha).toLocaleDateString('es-MX');
        const conceptoLimpio = g.concepto.replace(/,/g, ' ');
        const encargadoLimpio = g.encargado.replace(/,/g, ' ');
        const unidadLimpia = (g.unidad || '').replace(/,/g, ' ');
        
        return `${fechaFormateada},"${g.tipo}","${g.numero_nota || 'S/N'}","${conceptoLimpio}","${encargadoLimpio}","${unidadLimpia}","${g.tipo_deposito}",${g.cantidad || 1},${g.precio_unitario || g.monto},${g.monto}`;
      }).join("\n");

      const contenidoCSV = "\uFEFF" + encabezados.join(",") + filas;
      const nombreArchivo = `Caja_Chica_${activeProject?.name?.replace(/\s+/g, '_') || 'Obra'}.csv`;
      
      const fsModulo = FileSystem as any;
      const fileUri = `${fsModulo.documentDirectory}${nombreArchivo}`;
      
      await fsModulo.writeAsStringAsync(fileUri, contenidoCSV, { encoding: 'utf8' });
      await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Exportar Reporte Financiero' });
    } catch (error: any) { Alert.alert("Error", error.message); }
  };

  const totalIngresos = movimientos.filter(m => m.tipo === 'ingreso').reduce((sum, m) => sum + m.monto, 0);
  const totalEgresos = movimientos.filter(m => m.tipo === 'egreso').reduce((sum, m) => sum + m.monto, 0);
  const saldoDisponible = totalIngresos - totalEgresos;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={() => { Keyboard.dismiss(); router.back(); }} style={styles.backButton}>
            <Feather name="chevron-left" size={28} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerSubtitle}>LIBRO MAYOR DE CAJA</Text>
        </View>
        
        <Text style={styles.headerTitle}>Saldo Neto Disponible</Text>
        <Text style={styles.totalAmount}>${saldoDisponible.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</Text>

        <View style={styles.contrastContainer}>
          <View style={styles.contrastBox}>
            <Text style={styles.contrastLabel}>📥 TOTAL INVERTIDO</Text>
            <Text style={styles.contrastValueIngreso}>+${totalIngresos.toLocaleString('es-MX', { maximumFractionDigits: 0 })}</Text>
          </View>
          <View style={styles.contrastDivider} />
          <View style={styles.contrastBox}>
            <Text style={styles.contrastLabel}>📤 TOTAL GASTADO</Text>
            <Text style={styles.contrastValueEgreso}>-${totalEgresos.toLocaleString('es-MX', { maximumFractionDigits: 0 })}</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Historial de Movimientos</Text>
          
          {/* 🔒 Solo Admin/Oficina pueden descargar el Excel global */}
          {isAdminOrOficina && (
            <TouchableOpacity onPress={handleExportarExcel} style={styles.excelBtnHeader}>
              <Feather name="grid" size={14} color="#FFF" />
              <Text style={styles.excelBtnText}>Excel</Text>
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 30 }} />
        ) : movimientos.length === 0 ? (
          <Text style={styles.emptyText}>No hay registros financieros en esta obra.</Text>
        ) : (
          movimientos.map((mov) => (
            <View key={mov.id} style={styles.gastoCard}>
              <View style={styles.gastoMainRow}>
                <Feather 
                  name={mov.tipo === 'ingreso' ? "arrow-down-left" : "arrow-up-right"} 
                  size={24} 
                  color={mov.tipo === 'ingreso' ? "#10B981" : "#EF4444"} 
                  style={{ marginRight: 12 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.gastoJustificacion}>{mov.concepto}</Text>
                  <Text style={styles.gastoMeta}>Por: {mov.encargado} • {new Date(mov.fecha).toLocaleDateString('es-MX')}</Text>
                  
                  {mov.tipo === 'egreso' && (
                    <Text style={styles.apuText}>
                      Cant: {mov.cantidad} | P.U: ${mov.precio_unitario} | Unidad: {mov.unidad}
                    </Text>
                  )}
                </View>

                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.gastoMonto, { color: mov.tipo === 'ingreso' ? '#10B981' : '#DC2626' }]}>
                    {mov.tipo === 'ingreso' ? '+' : '-'}${mov.monto.toFixed(2)}
                  </Text>
                  
                  {/* 🔒 Botón de Eliminar solo para Administradores y Oficina */}
                  {isAdminOrOficina && (
                    <TouchableOpacity onPress={() => handleEliminarMovimiento(mov.id, mov.tipo)} style={{ marginTop: 8, padding: 4 }}>
                      <Feather name="trash-2" size={16} color="#FCA5A5" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => setIsModalVisible(true)}>
        <Feather name="plus" size={28} color="#FFF" />
      </TouchableOpacity>

      <Modal visible={isModalVisible} animationType="slide" transparent={true} onRequestClose={() => { setIsModalVisible(false); limpiarFormulario(); }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
            
            <Pressable style={{ flex: 1 }} onPress={() => { setIsModalVisible(false); limpiarFormulario(); }} />

            <View style={styles.modalContent}>
              
              {/* 🔒 Pestañas de Ingreso/Egreso. El residente solo ve la de Egreso y no puede cambiarla */}
              {isAdminOrOficina ? (
                <View style={styles.formToggleContainer}>
                  <TouchableOpacity style={[styles.formToggleBtn, tipoMovimientoForm === 'ingreso' && styles.toggleActiveIngreso]} onPress={() => setTipoMovimientoForm('ingreso')}>
                    <Text style={[styles.toggleText, tipoMovimientoForm === 'ingreso' && styles.toggleTextActive]}>📥 Registrar Inversión</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.formToggleBtn, tipoMovimientoForm === 'egreso' && styles.toggleActiveEgreso]} onPress={() => setTipoMovimientoForm('egreso')}>
                    <Text style={[styles.toggleText, tipoMovimientoForm === 'egreso' && styles.toggleTextActive]}>📤 Registrar Gasto</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={[styles.formToggleContainer, { backgroundColor: '#FEE2E2' }]}>
                  <View style={[styles.formToggleBtn, styles.toggleActiveEgreso]}>
                    <Text style={[styles.toggleText, styles.toggleTextActive]}>📤 Registrar Gasto de Campo</Text>
                  </View>
                </View>
              )}

              {tipoMovimientoForm === 'ingreso' ? (
                <View>
                  <Text style={styles.modalLabel}>Importe Invertido / Recibido ($)</Text>
                  <TextInput style={styles.modalInput} placeholder="Ej. 5000" keyboardType="numeric" value={importeInvertido} onChangeText={setImporteInvertido} returnKeyType="done" />

                  <Text style={styles.modalLabel}>Solicitante / Receptor</Text>
                  <View style={styles.workerInputContainer}>
                    <TextInput 
                      style={[styles.modalInput, { flex: 1, marginRight: 8 }]} 
                      placeholder="Escribe nombre o elige de la lista..." 
                      placeholderTextColor="#9CA3AF"
                      value={encargado} 
                      onChangeText={setEncargado} 
                      returnKeyType="done" 
                    />
                    <TouchableOpacity style={styles.workerListBtn} onPress={() => { Keyboard.dismiss(); setShowTrabajadorModal(true); }}>
                      <Feather name="users" size={20} color="#FFF" />
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.modalLabel}>Método de Recepción</Text>
                  <View style={styles.selectorContainer}>
                    <TouchableOpacity style={[styles.selectorBtn, tipoDeposito === 'efectivo' && styles.selectorActive]} onPress={() => setTipoDeposito('efectivo')}>
                      <Text style={[styles.selectorText, tipoDeposito === 'efectivo' && styles.selectorTextActive]}>Efectivo</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.selectorBtn, tipoDeposito === 'transferencia' && styles.selectorActive]} onPress={() => setTipoDeposito('transferencia')}>
                      <Text style={[styles.selectorText, tipoDeposito === 'transferencia' && styles.selectorTextActive]}>Transferencia</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View>
                  <View style={styles.rowInputs}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text style={styles.modalLabel}>No. de Nota</Text>
                      <TextInput style={styles.modalInput} placeholder="Ej. 104B" value={numeroNota} onChangeText={setNumeroNota} returnKeyType="done" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalLabel}>Unidad / Frente</Text>
                      <TextInput style={styles.modalInput} placeholder="Ej. Frente 1" value={unidad} onChangeText={setUnidad} returnKeyType="done" />
                    </View>
                  </View>

                  <View style={styles.rowInputs}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text style={styles.modalLabel}>Cantidad</Text>
                      <TextInput style={styles.modalInput} keyboardType="numeric" value={cantidad} onChangeText={setCantidad} returnKeyType="done" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalLabel}>Precio Unitario (P.U.)</Text>
                      <TextInput style={styles.modalInput} placeholder="$25.00" keyboardType="numeric" value={precioUnitario} onChangeText={setPrecioUnitario} returnKeyType="done" />
                    </View>
                  </View>

                  <View style={styles.totalGastoRow}>
                    <Text style={styles.totalGastoLabel}>Importe Total del Gasto:</Text>
                    <Text style={styles.totalGastoValue}>${gastoCalculado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</Text>
                  </View>

                  <Text style={styles.modalLabel}>Encargado del Gasto</Text>
                  <View style={styles.workerInputContainer}>
                    <TextInput 
                      style={[styles.modalInput, { flex: 1, marginRight: 8 }]} 
                      placeholder="Escribe nombre o elige de la lista..." 
                      placeholderTextColor="#9CA3AF"
                      value={encargado} 
                      onChangeText={setEncargado} 
                      returnKeyType="done" 
                    />
                    <TouchableOpacity style={styles.workerListBtn} onPress={() => { Keyboard.dismiss(); setShowTrabajadorModal(true); }}>
                      <Feather name="users" size={20} color="#FFF" />
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.modalLabel}>Concepto / Descripción del Gasto</Text>
                  <TextInput style={[styles.modalInput, { height: 55, textAlignVertical: 'top' }]} placeholder="Ej. Compra de cemento gris" value={justificacion} onChangeText={setJustificacion} multiline />

                  <Text style={styles.modalLabel}>Evidencia (Ticket)</Text>
                  <TouchableOpacity style={styles.cameraBtn} onPress={seleccionarFoto}>
                    {fotoTicket ? <Image source={{ uri: fotoTicket }} style={styles.previewImage} /> : <Text style={styles.cameraBtnText}>Tomar foto de evidencia</Text>}
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity style={styles.saveBtn} onPress={handleGuardarMovimiento} disabled={isSaving}>
                {isSaving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Guardar Registro en Libro Mayor</Text>}
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setIsModalVisible(false); limpiarFormulario(); }}>
                <Text style={styles.cancelBtnText}>Cerrar Ventana</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* 👷 MODAL DE TRABAJADORES */}
          {showTrabajadorModal && (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', zIndex: 999 }]}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowTrabajadorModal(false)} />
              <View style={[styles.modalContent, { maxHeight: '70%', marginHorizontal: 20 }]}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Seleccionar Encargado</Text>
                  <TouchableOpacity onPress={() => setShowTrabajadorModal(false)}>
                    <Feather name="x" size={24} color="#6B7280" />
                  </TouchableOpacity>
                </View>
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {trabajadores.length === 0 ? (
                    <Text style={styles.emptyText}>No tienes trabajadores registrados.</Text>
                  ) : (
                    trabajadores.map(t => (
                      <TouchableOpacity 
                        key={t.id} 
                        style={styles.workerListItem}
                        onPress={() => {
                          setEncargado(t.name);
                          setShowTrabajadorModal(false);
                        }}
                      >
                        <Feather name="user" size={16} color="#64748B" style={{ marginRight: 10 }} />
                        <View>
                          <Text style={styles.workerListName}>{t.name}</Text>
                          <Text style={styles.workerListRole}>{t.role}</Text>
                        </View>
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              </View>
            </View>
          )}

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
  headerSubtitle: { color: 'rgba(255, 255, 255, 0.6)', fontSize: 11, fontWeight: '700', letterSpacing: 5, textAlign: 'center', flex: 1 },
  excelBtnHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#10B981', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8 },
  excelBtnText: { color: '#FFF', fontSize: 12, fontWeight: 'bold', marginLeft: 4 },
  headerTitle: { color: '#94A3B8', fontSize: 13, fontWeight: '500', marginTop: 5 },
  totalAmount: { color: '#FFF', fontSize: 32, fontWeight: 'bold', marginTop: 2 },
  contrastContainer: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: 12, marginTop: 15, alignItems: 'center' },
  contrastBox: { flex: 1, alignItems: 'center' },
  contrastDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.1)' },
  contrastLabel: { fontSize: 10, color: '#94A3B8', fontWeight: '700' },
  contrastValueIngreso: { fontSize: 16, fontWeight: 'bold', color: '#10B981', marginTop: 4 },
  contrastValueEgreso: { fontSize: 16, fontWeight: 'bold', color: '#EF4444', marginTop: 4 },
  body: { padding: 15, paddingBottom: 120 },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', color: '#334155' },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  emptyText: { textAlign: 'center', color: '#64748B', marginTop: 30, fontStyle: 'italic' },
  gastoCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  gastoMainRow: { flexDirection: 'row', alignItems: 'center' },
  gastoJustificacion: { fontSize: 13, fontWeight: 'bold', color: '#1E293B' },
  gastoMeta: { fontSize: 11, color: '#64748B', marginTop: 2 },
  apuText: { fontSize: 10, color: '#2563EB', fontWeight: '600', marginTop: 3 },
  gastoMonto: { fontSize: 14, fontWeight: 'bold', marginLeft: 10 },
  fab: { position: 'absolute', bottom: 30, right: 25, width: 60, height: 60, borderRadius: 30, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center', elevation: 5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalScroll: { flexGrow: 1, justifyContent: 'flex-end' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#0F172A' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  formToggleContainer: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 12, padding: 4, marginBottom: 15 },
  formToggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  toggleActiveIngreso: { backgroundColor: '#10B981' },
  toggleActiveEgreso: { backgroundColor: '#EF4444' },
  toggleText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  toggleTextActive: { color: '#FFF' },
  modalLabel: { fontSize: 12, fontWeight: '700', color: '#475569', marginTop: 10, marginBottom: 4 },
  modalInput: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, padding: 10, fontSize: 14, color: '#0F172A', minHeight: 44 },
  rowInputs: { flexDirection: 'row', justifyContent: 'space-between' },
  totalGastoRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#EFF6FF', padding: 12, borderRadius: 10, marginTop: 10, borderWidth: 1, borderColor: '#BFDBFE' },
  totalGastoLabel: { fontSize: 12, color: '#1E4ED8', fontWeight: 'bold' },
  totalGastoValue: { fontSize: 14, color: '#1D4ED8', fontWeight: 'bold' },
  selectorContainer: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 10, padding: 4, marginTop: 4 },
  selectorBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  selectorActive: { backgroundColor: '#1E293B' },
  selectorText: { fontSize: 12, color: '#4B5563', fontWeight: '600' },
  selectorTextActive: { color: '#FFF' },
  cameraBtn: { height: 60, borderWidth: 1, borderColor: '#BFDBFE', borderStyle: 'dashed', backgroundColor: '#EFF6FF', borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginTop: 5 },
  cameraBtnText: { color: '#2563EB', fontSize: 12, fontWeight: '600' },
  previewImage: { width: '100%', height: '100%' },
  saveBtn: { backgroundColor: '#1E293B', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  cancelBtn: { padding: 12, alignItems: 'center', marginTop: 8 },
  cancelBtnText: { color: '#94A3B8', fontSize: 13, fontWeight: '600' },
  workerListItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  workerListName: { fontSize: 14, fontWeight: 'bold', color: '#1E293B' },
  workerListRole: { fontSize: 11, color: '#64748B', marginTop: 2 },
  workerInputContainer: { flexDirection: 'row', alignItems: 'center' },
  workerListBtn: { backgroundColor: '#2563EB', width: 44, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center' }
});