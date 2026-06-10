import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useProject } from '../../context/ProjectContext';
import { supabase } from '../../lib/supabase';
import { generarPlantillaNomina } from '../utils/pdfNomina';

interface WorkerState {
  id: string;
  name: string;
  role: string;
  weekly_salary: number;
  attendance: boolean[]; // L, M, M, J, V, S
  extraHours: string;
  discount: string;
  reason: string;
}

const DAYS = ['L', 'M', 'M', 'J', 'V', 'S'];

export default function ListaScreen() {
  const router = useRouter();
  const { activeProject, isOffline } = useProject();

  const [workers, setWorkers] = useState<WorkerState[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // MODAL TRABAJADOR NUEVO
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newSalary, setNewSalary] = useState('');

  // 🕒 CONJUNTO DE ESTADOS PARA ACCIONES INTERNAS
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [isExtrasModalOpen, setIsExtrasModalOpen] = useState(false);
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);

  // Campos temporales para los modales de edición
  const [tempExtras, setTempExtras] = useState('0');
  const [tempDiscount, setTempDiscount] = useState('0');
  const [tempReason, setTempReason] = useState('');

  // Carga inicial
  useEffect(() => {
    if (activeProject?.id) {
      fetchWorkers();
    }
  }, [activeProject]);

  // Autoguardado silencioso automatizado
  useEffect(() => {
    if (loading || workers.length === 0) return;
    
    const autoSaveTimer = setTimeout(() => {
      handleSavePayroll(true); 
    }, 2000);
    
    return () => clearTimeout(autoSaveTimer);
  }, [workers]);

  const fetchWorkers = async () => {
    setLoading(true);
    const pid = activeProject?.id;
    if (!pid) return;

    try {
      const { data, error } = await supabase
        .from('workers')
        .select('*')
        .eq('project_id', pid)
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) throw error;

      const initialUI = data.map(w => ({
        id: w.id,
        name: w.name,
        role: w.role,
        weekly_salary: w.weekly_salary || 0,
        attendance: [true, true, true, true, true, true],
        extraHours: '0',
        discount: '0',
        reason: ''
      }));

      setWorkers(initialUI);
    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
    }
  };

  const toggleAttendance = (workerId: string, dayIdx: number) => {
    setWorkers(prev => prev.map(w => {
      if (w.id === workerId) {
        const newAtt = [...w.attendance];
        newAtt[dayIdx] = !newAtt[dayIdx];
        return { ...w, attendance: newAtt };
      }
      return w;
    }));
  };

  const handleAddWorker = async () => {
    if (!newName || !newSalary) return;
    setIsSaving(true);
    try {
      const { data, error } = await supabase.from('workers').insert([{
        name: newName,
        role: newRole,
        weekly_salary: Number(newSalary),
        project_id: activeProject?.id,
        is_active: true
      }]).select();

      if (error) throw error;
      
      const nw = data[0];
      setWorkers(prev => [...prev, {
        id: nw.id,
        name: nw.name,
        role: nw.role,
        weekly_salary: nw.weekly_salary,
        attendance: [true, true, true, true, true, true],
        extraHours: '0',
        discount: '0',
        reason: ''
      }]);
      setIsModalVisible(false);
      setNewName(''); setNewRole(''); setNewSalary('');
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Abrir modal de Horas Extra
  const openExtrasModal = (worker: WorkerState) => {
    setSelectedWorkerId(worker.id);
    setTempExtras(worker.extraHours);
    setIsExtrasModalOpen(true);
  };

  // Guardar Horas Extra en el estado
  const saveExtrasChanges = () => {
    setWorkers(prev => prev.map(w => w.id === selectedWorkerId ? { ...w, extraHours: tempExtras || '0' } : w));
    setIsExtrasModalOpen(false);
    setSelectedWorkerId(null);
  };

  // Abrir modal unificado de Descuento + Motivo
  const openDiscountModal = (worker: WorkerState) => {
    setSelectedWorkerId(worker.id);
    setTempDiscount(worker.discount);
    setTempReason(worker.reason);
    setIsDiscountModalOpen(true);
  };

  // Guardar Descuento + Motivo en conjunto
  const saveDiscountChanges = () => {
    setWorkers(prev => prev.map(w => w.id === selectedWorkerId ? { ...w, discount: tempDiscount || '0', reason: tempReason } : w));
    setIsDiscountModalOpen(false);
    setSelectedWorkerId(null);
  };

  const calculateFinalTotal = (w: WorkerState) => {
    const daily = w.weekly_salary / 6;
    const daysPresent = w.attendance.filter(Boolean).length;
    const extraH = Number(w.extraHours || 0);
    const disc = Number(w.discount || 0);
    const hourlyRate = (daily / 8) * 2; 
    
    return (daily * daysPresent) + (extraH * hourlyRate) - disc;
  };

  const handleSavePayroll = async (isSilent = false) => {
    if (!isSilent) setIsSaving(true);
    try {
      const today = new Date();
      const weekStart = today.toISOString().split('T')[0];

      const recordsToSave = workers.map(w => {
        const daysAbsent = 6 - w.attendance.filter(Boolean).length;
        return { 
          worker_id: w.id, 
          project_id: activeProject?.id,
          week_start: weekStart, 
          days_absent: daysAbsent, 
          deduction_amount: Number(w.discount || 0), 
          deduction_reason: w.reason, 
          final_salary: calculateFinalTotal(w) 
        };
      }).filter(r => !r.worker_id.startsWith('temp_'));

      if (isOffline) {
        await AsyncStorage.setItem(`@nomina_cache_${activeProject?.id}`, JSON.stringify(recordsToSave));
        return;
      }
      await supabase.from('payroll_records').upsert(recordsToSave, { onConflict: 'worker_id,week_start' });
    } catch (e) {
      console.log(e);
    } finally {
      if (!isSilent) setIsSaving(false);
    }
  };

  const handleGeneratePDF = async () => {
    if (workers.length === 0) return;
    try {
      const weekLabel = new Date().toLocaleDateString('es-MX');
      const htmlContent = generarPlantillaNomina(workers, weekLabel);
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
    } catch (error: any) { Alert.alert("Error PDF", error.message); }
  };

 const handleExportarExcel = async () => {
    if (workers.length === 0) { 
      Alert.alert("Sin datos", "No hay trabajadores en la lista."); 
      return; 
    }
    try {
      // 📊 Encabezados limpios para formato CSV (compatible con Excel)
      const encabezados = ["Trabajador", "Puesto", "Sueldo Base Semanal ($)", "Dias Asistidos", "Horas Extra (Hrs)", "Descuento Aplicado ($)", "Motivo/Nota", "Total a Pagar ($)\n"];
      
      const filas = workers.map(w => {
        const asistencias = w.attendance.filter(Boolean).length;
        const total = calculateFinalTotal(w);
        // Quitamos las comas de las notas para evitar que se rompan las columnas en Excel
        const notaLimpia = w.reason ? w.reason.replace(/,/g, ' ') : ''; 
        
        return `"${w.name}","${w.role}",${w.weekly_salary},${asistencias},${w.extraHours},${w.discount},"${notaLimpia}",${total.toFixed(2)}`;
      }).join("\n");

      // El caracter \uFEFF obliga a Excel a reconocer los acentos correctamente (UTF-8 BOM)
      const contenidoCSV = "\uFEFF" + encabezados.join(",") + filas;
      const nombreArchivo = `Raya_${activeProject?.name?.replace(/\s+/g, '_') || 'Obra'}.csv`;
      
      // 🛠️ Casteo directo de TypeScript en la asignación para burlar el error de compilación
      const fsModulo = FileSystem as any;
      const fileUri = `${fsModulo.documentDirectory}${nombreArchivo}`;
      
      await fsModulo.writeAsStringAsync(fileUri, contenidoCSV, { encoding: 'utf8' });
      
      // Abre el menú nativo para compartir (WhatsApp, Correo, Drive, etc.)
      await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Exportar Nómina' });

    } catch (error: any) {
      Alert.alert("Error Excel", "No se pudo generar la hoja de cálculo: " + error.message);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={() => router.back()}>
            <Feather name="chevron-left" size={28} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerSubtitle}>GESTIÓN DE PERSONAL</Text>
          <TouchableOpacity onPress={fetchWorkers}>
            <Feather name="refresh-cw" size={20} color="#FFF" />
          </TouchableOpacity>
        </View>
        <Text style={styles.headerTitle}>{activeProject?.name || "Obra"}</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{flex: 1}}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Pase de Lista</Text>
            <View style={styles.exportButtonsContainer}>
              <TouchableOpacity style={[styles.exportBtn, {backgroundColor: '#DC2626'}]} onPress={handleGeneratePDF}>
                <Feather name="file-text" size={14} color="#FFF" />
                <Text style={styles.exportBtnText}>PDF</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.exportBtn, {backgroundColor: '#10B981', marginLeft: 8}]} onPress={handleExportarExcel}>
                <Feather name="grid" size={14} color="#FFF" />
                <Text style={styles.exportBtnText}>Excel</Text>
              </TouchableOpacity>
            </View>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color="#2563EB" style={{marginTop: 50}} />
          ) : (
            workers.map((worker) => (
              <View key={worker.id} style={styles.workerCard}>
                <View style={styles.cardHeader}>
                  <View style={{flex: 1}}>
                    <Text style={styles.workerName}>{worker.name}</Text>
                    <Text style={styles.workerRole}>{worker.role} • <Text style={{color: '#64748B', fontWeight: 'normal'}}>S. Día: ${(worker.weekly_salary / 6).toFixed(0)}</Text></Text>
                  </View>
                  <View style={{alignItems: 'flex-end'}}>
                    <Text style={styles.salaryLabel}>Base Semanal</Text>
                    <Text style={styles.salaryValue}>${worker.weekly_salary}</Text>
                  </View>
                </View>

                {/* Asistencia Horizontal */}
                <View style={styles.attendanceRow}>
                  {DAYS.map((day, idx) => (
                    <TouchableOpacity 
                      key={day + idx} 
                      style={styles.dayBox}
                      onPress={() => toggleAttendance(worker.id, idx)}
                    >
                      <Text style={styles.dayText}>{day}</Text>
                      <Feather 
                        name={worker.attendance[idx] ? "check-circle" : "circle"} 
                        size={22} 
                        color={worker.attendance[idx] ? "#2563EB" : "#CBD5E1"} 
                      />
                    </TouchableOpacity>
                  ))}
                </View>

                {/* 🛠️ NUEVA FILA DE BOTONES DE ACCIÓN COMPACTOS */}
                <View style={styles.actionsContainerRow}>
                  {/* Botón 1: Horas Extra */}
                  <TouchableOpacity style={styles.actionCardBtn} onPress={() => openExtrasModal(worker)}>
                    <View style={styles.actionBtnIconBox}>
                      <Feather name="clock" size={16} color="#2563EB" />
                    </View>
                    <View style={{flex: 1, marginLeft: 8}}>
                      <Text style={styles.actionBtnLabel}>Horas Extra</Text>
                      <Text style={styles.actionBtnValue}>{Number(worker.extraHours) > 0 ? `${worker.extraHours} Hrs` : 'Ninguna'}</Text>
                    </View>
                  </TouchableOpacity>

                  {/* Botón 2: Descuento + Motivo en Conjunto */}
                  <TouchableOpacity style={[styles.actionCardBtn, {marginLeft: 10}]} onPress={() => openDiscountModal(worker)}>
                    <View style={[styles.actionBtnIconBox, {backgroundColor: '#FEF2F2'}]}>
                      <Feather name="alert-circle" size={16} color="#EF4444" />
                    </View>
                    <View style={{flex: 1, marginLeft: 8}}>
                      <Text style={[styles.actionBtnLabel, {color: '#EF4444'}]}>Descuento / Nota</Text>
                      <Text style={styles.actionBtnValue} numberOfLines={1}>
                        {Number(worker.discount) > 0 ? `-$${worker.discount}` : worker.reason ? 'Nota activa' : 'Sin cambios'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>

                {/* Fila de Sumatoria Total de la Tarjeta */}
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>A PAGAR:</Text>
                  <Text style={styles.totalValue}>${calculateFinalTotal(worker).toLocaleString('es-MX', {minimumFractionDigits: 2})}</Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.fabContainer}>
        <TouchableOpacity style={styles.fabPrimary} onPress={() => setIsModalVisible(true)}>
          <Feather name="plus" size={30} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* 🕒 SUB-MODAL 1: COBRAR HORAS EXTRA */}
      <Modal visible={isExtrasModalOpen} transparent={true} animationType="fade" onRequestClose={() => setIsExtrasModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsExtrasModalOpen(false)} />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>🕒 Asignar Horas Extra</Text>
            <Text style={styles.subModalLabel}>Ingresa la cantidad total de horas acumuladas en la semana:</Text>
            <TextInput 
              style={styles.modalInput} 
              keyboardType="numeric" 
              value={tempExtras} 
              onChangeText={(v) => setTempExtras(v.replace(/[^0-9.]/g, ''))}
              placeholder="Ej. 4"
              autoFocus
            />
            <TouchableOpacity style={styles.saveBtn} onPress={saveExtrasChanges}>
              <Text style={styles.saveBtnText}>Aplicar Horas</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 💸 SUB-MODAL 2: DESCUENTO + MOTIVO EN CONJUNTO */}
      <Modal visible={isDiscountModalOpen} transparent={true} animationType="fade" onRequestClose={() => setIsDiscountModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsDiscountModalOpen(false)} />
          <View style={styles.modalContent}>
            <Text style={[styles.modalTitle, {color: '#EF4444'}]}>💸 Deducción y Observación</Text>
            
            <Text style={styles.subModalLabel}>Monto del Descuento ($):</Text>
            <TextInput 
              style={styles.modalInput} 
              keyboardType="numeric" 
              value={tempDiscount} 
              onChangeText={(v) => setTempDiscount(v.replace(/[^0-9.]/g, ''))} // 👈 Filtro numérico estricto contra dobles signos
              placeholder="Ej. 150"
            />

            <Text style={styles.subModalLabel}>Motivo o Nota justificante:</Text>
            <TextInput 
              style={[styles.modalInput, {height: 50, textAlignVertical: 'top'}]} 
              value={tempReason} 
              onChangeText={setTempReason} 
              placeholder="Ej. Retardo el día miércoles / Faltante de equipo"
              multiline
            />

            <TouchableOpacity style={[styles.saveBtn, {backgroundColor: '#EF4444'}]} onPress={saveDiscountChanges}>
              <Text style={styles.saveBtnText}>Aplicar Descuento y Nota</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL: TRABAJADOR NUEVO */}
      <Modal visible={isModalVisible} animationType="slide" transparent={true} onRequestClose={() => setIsModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsModalVisible(false)} />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Nuevo Trabajador</Text>
            <TextInput style={styles.modalInput} placeholder="Nombre completo" value={newName} onChangeText={setNewName} />
            <TextInput style={styles.modalInput} placeholder="Puesto (Maestro, Ayudante...)" value={newRole} onChangeText={setNewRole} />
            <TextInput style={styles.modalInput} placeholder="Sueldo Semanal $" keyboardType="numeric" value={newSalary} onChangeText={setNewSalary} />
            <TouchableOpacity style={styles.saveBtn} onPress={handleAddWorker} disabled={isSaving}>
              {isSaving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Registrar en Obra</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  header: { backgroundColor: '#2563EB', paddingTop: 60, paddingBottom: 25, paddingHorizontal: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerSubtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 'bold', letterSpacing: 1 },
  headerTitle: { color: '#FFF', fontSize: 22, fontWeight: 'bold', marginTop: 8 },
  body: { padding: 15, paddingBottom: 150 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#334155' },
  exportButtonsContainer: { flexDirection: 'row' },
  exportBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8 },
  exportBtnText: { color: '#FFF', fontSize: 12, fontWeight: 'bold', marginLeft: 4 },

  workerCard: { backgroundColor: '#FFF', borderRadius: 24, padding: 16, marginBottom: 15, elevation: 3, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  workerName: { fontSize: 16, fontWeight: 'bold', color: '#1E293B' },
  workerRole: { fontSize: 12, color: '#64748B', marginTop: 2, fontWeight: '600' },
  salaryLabel: { fontSize: 9, color: '#2563EB', fontWeight: 'bold', textTransform: 'uppercase' },
  salaryValue: { fontSize: 16, fontWeight: 'bold', color: '#1E293B' },

  attendanceRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#F8FAFC', padding: 10, borderRadius: 16, marginBottom: 12 },
  dayBox: { alignItems: 'center' },
  dayText: { fontSize: 11, fontWeight: 'bold', color: '#64748B', marginBottom: 4 },

  // Estilos de la Fila de Botones de Acción
  actionsContainerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  actionCardBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', padding: 8, borderRadius: 12 },
  actionBtnIconBox: { backgroundColor: '#EFF6FF', padding: 6, borderRadius: 8 },
  actionBtnLabel: { fontSize: 10, fontWeight: 'bold', color: '#475569' },
  actionBtnValue: { fontSize: 12, fontWeight: 'bold', color: '#0F172A', marginTop: 1 },

  subModalLabel: { fontSize: 12, fontWeight: '700', color: '#475569', marginTop: 10, marginBottom: 5 },

  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, alignItems: 'center', paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  totalLabel: { fontSize: 12, fontWeight: 'bold', color: '#64748B' },
  totalValue: { fontSize: 20, fontWeight: 'bold', color: '#059669' },

  fabContainer: { position: 'absolute', bottom: 30, right: 25 },
  fabPrimary: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center', elevation: 5 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFF', borderRadius: 24, padding: 22 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1E293B', marginBottom: 15 },
  modalInput: { backgroundColor: '#F1F5F9', borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0', color: '#0F172A' },
  saveBtn: { backgroundColor: '#2563EB', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  saveBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 }
});