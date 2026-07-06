'use client';

import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import { useNavigation, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import SummaryCard from '../../components/SummaryCard';
import { useProject } from '../../context/ProjectContext';
import { useUser } from '../../context/UserContext';
import { supabase } from '../../lib/supabase';
import { generarPlantillaNomina } from '../utils/pdfNomina';

interface WorkerState {
  id: string;
  name_worker: string;
  role: string;
  weekly_salary: number;
  attendance: boolean[]; // L, M, M, J, V, S
  extraHours: string;
  discount: string;
  reason: string;
  categoria: string;
}

const DAYS = ['L', 'M', 'M', 'J', 'V', 'S'];

export default function ListaScreen() {
  const router = useRouter();
  const navigation = useNavigation(); 
  const { activeProject, isOffline } = useProject();
  const { profile } = useUser();

  const isFinancialRole = profile?.role === 'admin' || profile?.role === 'oficina';
  const isAdmin = profile?.role === 'admin';

  const [allWorkers, setAllWorkers] = useState<WorkerState[]>([]); 
  const [activeCategory, setActiveCategory] = useState<'obrero' | 'tecnico'>('obrero'); 
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const displayedWorkers = allWorkers.filter(w => w.categoria === activeCategory);

  const nominaBase = displayedWorkers.reduce((sum, w) => sum + (Number(w.weekly_salary) || 0), 0);
  const proyeccionFinal = displayedWorkers.reduce((sum, w) => sum + calculateFinalTotal(w), 0);

  // --- MODALS ---
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newSalary, setNewSalary] = useState('');

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editWorkerId, setEditWorkerId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editSalary, setEditSalary] = useState('');

  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [isExtrasModalOpen, setIsExtrasModalOpen] = useState(false);
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);

  const [tempExtras, setTempExtras] = useState('0');
  const [tempDiscount, setTempDiscount] = useState('0');
  const [tempReason, setTempReason] = useState('');

  useEffect(() => {
    if (activeProject?.id) {
      fetchWorkers();
    }
  }, [activeProject]);

  useEffect(() => {
    navigation.setOptions({
      gestureEnabled: !hasChanges
    });

    const BloquearSalidaNativa = navigation.addListener('beforeRemove', (e) => {
      if (!hasChanges) return;
      e.preventDefault();

      Alert.alert(
        "Cambios pendientes",
        "Tienes modificaciones en la nómina o asistencias sin sincronizar. Es obligatorio presionar 'Guardar y Enviar a Oficina' antes de salir.",
        [
          { text: "Permanecer aquí", style: "default" },
          { 
            text: "Salir sin guardar", 
            style: "destructive", 
            onPress: () => navigation.dispatch(e.data.action) 
          }
        ]
      );
    });

    return () => BloquearSalidaNativa();
  }, [navigation, hasChanges]);

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
        .order('name_worker', { ascending: true });

      if (error) throw error;

      const initialUI = data.map(w => ({
        id: w.id,
        name_worker: w.name_worker,
        role: w.role,
        weekly_salary: w.weekly_salary || 0,
        attendance: [true, true, true, true, true, true],
        extraHours: '0',
        discount: '0',
        reason: '',
        categoria: w.categoria || 'obrero'
      }));

      setAllWorkers(initialUI);
      setHasChanges(false); 
    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
    }
  };

  const toggleAttendance = (workerId: string, dayIdx: number) => {
    setHasChanges(true); 
    setAllWorkers(prev => prev.map(w => {
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
        name_worker: newName,
        role: newRole,
        weekly_salary: Number(newSalary),
        project_id: activeProject?.id,
        categoria: activeCategory,
        is_active: true
      }]).select();

      if (error) throw error;
      
      const nw = data[0];
      setHasChanges(true); 
      setAllWorkers(prev => [...prev, {
        id: nw.id,
        name_worker: nw.name_worker,
        role: nw.role,
        weekly_salary: nw.weekly_salary,
        attendance: [true, true, true, true, true, true],
        extraHours: '0',
        discount: '0',
        reason: '',
        categoria: nw.categoria
      }]);
      setIsModalVisible(false);
      setNewName(''); setNewRole(''); setNewSalary('');
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const openEditWorkerModal = (worker: WorkerState) => {
    setEditWorkerId(worker.id);
    setEditName(worker.name_worker);
    setEditRole(worker.role);
    setEditSalary(String(worker.weekly_salary));
    setIsEditModalOpen(true);
  };

  const handleUpdateWorker = async () => {
    if (!editWorkerId || !editName || !editSalary) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('workers')
        .update({
          name_worker: editName,
          role: editRole,
          weekly_salary: Number(editSalary)
        })
        .eq('id', editWorkerId);

      if (error) throw error;

      setHasChanges(true); 
      setAllWorkers(prev => prev.map(w => w.id === editWorkerId ? { ...w, name_worker: editName, role: editRole, weekly_salary: Number(editSalary) } : w));
      setIsEditModalOpen(false);
      setEditWorkerId(null);
    } catch (e: any) {
      Alert.alert("Error al editar", e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteWorker = (worker: WorkerState) => {
    Alert.alert(
      "Eliminar Trabajador",
      `¿Estás seguro de que deseas dar de baja a ${worker.name_worker}? No aparecerá más en las listas activas de asistencia.`,
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Dar de Baja", 
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('workers')
                .update({ is_active: false })
                .eq('id', worker.id);

              if (error) throw error;

              setHasChanges(true); 
              setAllWorkers(prev => prev.filter(w => w.id !== worker.id));
              Alert.alert("¡Éxito!", "Trabajador dado de baja correctamente.");
            } catch (e: any) {
              Alert.alert("Error", e.message);
            }
          }
        }
      ]
    );
  };

  const openExtrasModal = (worker: WorkerState) => {
    setSelectedWorkerId(worker.id);
    setTempExtras(worker.extraHours);
    setIsExtrasModalOpen(true);
  };

  const saveExtrasChanges = () => {
    setHasChanges(true); 
    setAllWorkers(prev => prev.map(w => w.id === selectedWorkerId ? { ...w, extraHours: tempExtras || '0' } : w));
    setIsExtrasModalOpen(false);
    setSelectedWorkerId(null);
  };

  const openDiscountModal = (worker: WorkerState) => {
    setSelectedWorkerId(worker.id);
    setTempDiscount(worker.discount);
    setTempReason(worker.reason);
    setIsDiscountModalOpen(true);
  };

  const saveDiscountChanges = () => {
    setHasChanges(true); 
    setAllWorkers(prev => prev.map(w => w.id === selectedWorkerId ? { ...w, discount: tempDiscount || '0', reason: tempReason } : w));
    setIsDiscountModalOpen(false);
    setSelectedWorkerId(null);
  };

  // 🟢 CALCULADORA CON PROPORCIÓN AJUSTADA PARA SÁBADO DE 5 HORAS
  function calculateFinalTotal(w: WorkerState) {
    const totalHoursInWeek = 45; // 5 días de 8h (40h) + 1 día de 5h (5h)
    const hourlyRate = w.weekly_salary / totalHoursInWeek; // Valor base por hora trabajada

    let hoursEarned = 0;

    // Calcular lunes a viernes (8 horas por día asistido)
    for (let i = 0; i < 5; i++) {
      if (w.attendance[i]) {
        hoursEarned += 8;
      }
    }

    // Calcular sábado (5 horas si asistió)
    if (w.attendance[5]) {
      hoursEarned += 5;
    }

    const extraH = Number(w.extraHours || 0);
    const disc = Number(w.discount || 0);

    // Las horas extra se calculan al doble de la tarifa ordinaria integrada
    const extraHourlyRate = hourlyRate * 2; 

    return (hoursEarned * hourlyRate) + (extraH * extraHourlyRate) - disc;
  }

  const handleSavePayroll = async (isSilent = false) => {
    if (!isSilent) setIsSaving(true);
    try {
      const today = new Date();
      const weekStart = today.toISOString().split('T')[0];

      const recordsToSave = allWorkers.map(w => {
        const daysAbsent = 6 - w.attendance.filter(Boolean).length;
        return { 
          worker_id: w.id, 
          project_id: activeProject?.id,
          residente_id: profile?.id,
          week_start: weekStart, 
          days_absent: daysAbsent, 
          deduction_amount: Number(w.discount || 0), 
          final_salary: calculateFinalTotal(w),
          attendance: JSON.stringify(w.attendance), 
          reason: w.reason,
          is_active: true
        };
      }).filter(r => !r.worker_id.startsWith('temp_'));

      if (isOffline) {
        await AsyncStorage.setItem(`@nomina_cache_${activeProject?.id}`, JSON.stringify(recordsToSave));
        if (!isSilent) Alert.alert("Guardado Local", "Estás sin conexión. Se sincronizará al tener internet.");
        setHasChanges(false); 
        return;
      }
      
      const { error } = await supabase.from('payroll_records').upsert(recordsToSave, { onConflict: 'worker_id,week_start' });
      if (error) throw error;

      setHasChanges(false); 
      if (!isSilent) {
        Alert.alert("¡Éxito!", "La lista de asistencia y nómina ha sido enviada a la oficina de forma segura.");
      }
    } catch (e: any) {
      console.log(e);
      if (!isSilent) Alert.alert("Error de sincronización", e.message);
    } finally {
      if (!isSilent) setIsSaving(false);
    }
  };

  const handleGeneratePDF = async () => {
    if (displayedWorkers.length === 0) return;
    try {
      const weekLabel = new Date().toLocaleDateString('es-MX');
      const htmlContent = generarPlantillaNomina(displayedWorkers, weekLabel);
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
    } catch (error: any) { Alert.alert("Error PDF", error.message); }
  };

  const handleExportarExcel = async () => {
    if (displayedWorkers.length === 0) { 
      Alert.alert("Sin datos", "No hay trabajadores en la lista activa."); 
      return; 
    }
    try {
      const encabezados = ["Trabajador", "Puesto", "Sueldo Base Semanal ($)", "Dias Asistidos", "Horas Extra (Hrs)", "Descuento Aplicado ($)", "Motivo/Nota", "Total a Pagar ($)\n"];
      
      const filas = displayedWorkers.map(w => {
        const asistencias = w.attendance.filter(Boolean).length;
        const total = calculateFinalTotal(w);
        const notaLimpia = w.reason ? w.reason.replace(/,/g, ' ') : ''; 
        return `"${w.name_worker}","${w.role}",${w.weekly_salary},${asistencias},${w.extraHours},${w.discount},"${notaLimpia}",${total.toFixed(2)}`;
      }).join("\n");

      const contenidoCSV = "\uFEFF" + encabezados.join(",") + filas;
      const nombreArchivo = `Raya_${activeCategory}_${activeProject?.name_worker?.replace(/\s+/g, '_') || 'Obra'}.csv`;
      
      const fileUri = `${FileSystem.documentDirectory}${nombreArchivo}`;
      await FileSystem.writeAsStringAsync(fileUri, contenidoCSV, { encoding: 'utf8' });
      await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Exportar Nómina' });
    } catch (error: any) {
      Alert.alert("Error Excel", "No se pudo generar la hoja de cálculo: " + error.message);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={() => router.back()}><Feather name="chevron-left" size={28} color="#FFF" /></TouchableOpacity>
          <Text style={styles.headerSubtitle}>ASISTENCIA Y NÓMINA</Text>
          <TouchableOpacity onPress={fetchWorkers}><Feather name="refresh-cw" size={20} color="#FFF" /></TouchableOpacity>
        </View>
        <Text style={styles.headerTitle}>{activeProject?.name_worker || "Obra"}</Text>
      </View>

      {hasChanges && (
        <View style={styles.warningBannerContainer}>
          <Feather name="alert-triangle" size={16} color="#7F1D1D" />
          <Text style={styles.warningBannerText}>Modificaciones pendientes. Presiona el botón verde de guardar arriba.</Text>
        </View>
      )}

      <View style={styles.tabContainer}>
        <TouchableOpacity style={[styles.tabBtn, activeCategory === 'obrero' && styles.tabBtnActive]} onPress={() => setActiveCategory('obrero')}>
          <Text style={[styles.tabText, activeCategory === 'obrero' && styles.tabTextActive]}>Mano de Obra</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, activeCategory === 'tecnico' && styles.tabBtnActive]} onPress={() => setActiveCategory('tecnico')}>
          <Text style={[styles.tabText, activeCategory === 'tecnico' && styles.tabTextActive]}>Personal Técnico</Text>
        </TouchableOpacity>
      </View>

      {!loading && allWorkers.length > 0 && (
        <View style={styles.topSyncBtnContainer}>
          <TouchableOpacity style={[styles.syncBtn, hasChanges && styles.syncBtnHighlighted]} onPress={() => handleSavePayroll(false)} disabled={isSaving}>
            {isSaving ? <ActivityIndicator color="#FFF" size="small" /> : (
              <>
                <Feather name="upload-cloud" size={18} color="#FFF" />
                <Text style={styles.syncBtnText}>Guardar y Enviar a Oficina</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{flex: 1}}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <SummaryCard labelLeft="Nómina Base" valueLeft={nominaBase} labelRight="Proyección Final" valueRight={proyeccionFinal} colorRight="#10B981" />

          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Lista de {activeCategory === 'obrero' ? 'Obreros' : 'Técnicos'}</Text>
            {isFinancialRole && (
              <View style={styles.exportButtonsContainer}>
                <TouchableOpacity style={[styles.exportBtn, {backgroundColor: '#DC2626'}]} onPress={handleGeneratePDF}><Feather name="file-text" size={14} color="#FFF" /><Text style={styles.exportBtnText}>PDF</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.exportBtn, {backgroundColor: '#10B981', marginLeft: 8}]} onPress={handleExportarExcel}><Feather name="grid" size={14} color="#FFF" /><Text style={styles.exportBtnText}>Excel</Text></TouchableOpacity>
              </View>
            )}
          </View>

          {loading ? <ActivityIndicator size="large" color="#2563EB" style={{marginTop: 50}} /> : displayedWorkers.length === 0 ? (
            <Text style={{textAlign: 'center', color: '#64748B', marginTop: 40}}>No hay {activeCategory === 'obrero' ? 'obreros' : 'técnicos'} registrados.</Text>
          ) : displayedWorkers.map((worker) => (
            <View key={worker.id} style={styles.workerCard}>
              <View style={styles.cardHeader}>
                <View style={{flex: 1}}>
                  <Text style={styles.workerName}>{worker.name_worker}</Text>
                  <Text style={styles.workerRole}>{worker.role}{isFinancialRole && <Text style={{color: '#64748B', fontWeight: 'normal'}}> • S. Hora: ${(worker.weekly_salary / 45).toFixed(1)}</Text>}</Text>
                </View>
                {isAdmin ? (
                  <View style={styles.adminActionIconsRow}>
                    <TouchableOpacity onPress={() => openEditWorkerModal(worker)} style={styles.inlineActionBtn}><Feather name="edit-2" size={13} color="#475569" /></TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteWorker(worker)} style={[styles.inlineActionBtn, {marginLeft: 8}]}><Feather name="trash-2" size={13} color="#EF4444" /></TouchableOpacity>
                  </View>
                ) : isFinancialRole && (
                  <View style={{alignItems: 'flex-end'}}><Text style={styles.salaryLabel}>Semanal</Text><Text style={styles.salaryValue}>${worker.weekly_salary}</Text></View>
                )}
              </View>

              <View style={styles.attendanceRow}>
                {DAYS.map((day, idx) => (
                  <TouchableOpacity key={day + idx} style={styles.dayBox} onPress={() => toggleAttendance(worker.id, idx)}>
                    <Text style={styles.dayText}>{day}</Text>
                    <Feather name={worker.attendance[idx] ? "check-circle" : "circle"} size={18} color={worker.attendance[idx] ? "#2563EB" : "#CBD5E1"} />
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.actionsContainerRow}>
                <TouchableOpacity style={styles.actionCardBtn} onPress={() => openExtrasModal(worker)}>
                  <Feather name="clock" size={13} color="#2563EB" />
                  <View style={{flex: 1, marginLeft: 5}}><Text style={styles.actionBtnLabel}>Hrs Extra: <Text style={styles.actionBtnValue}>{Number(worker.extraHours) > 0 ? `${worker.extraHours} H` : '0'}</Text></Text></View>
                </TouchableOpacity>
                {isFinancialRole ? (
                  <TouchableOpacity style={[styles.actionCardBtn, {marginLeft: 6}]} onPress={() => openDiscountModal(worker)}>
                    <Feather name="alert-circle" size={13} color="#EF4444" />
                    <View style={{flex: 1, marginLeft: 5}}><Text style={[styles.actionBtnLabel, {color: '#EF4444'}]}>Deducción: <Text style={styles.actionBtnValue}>{Number(worker.discount) > 0 ? `-$${worker.discount}` : worker.reason ? 'Nota' : '$0'}</Text></Text></View>
                  </TouchableOpacity>
                ) : <View style={[styles.actionCardBtn, {marginLeft: 6, borderColor: 'transparent', backgroundColor: 'transparent'}]} />}
              </View>

              {isFinancialRole && (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>TOTAL A PAGAR:</Text>
                  <Text style={styles.totalValue}>${calculateFinalTotal(worker).toLocaleString('es-MX', {minimumFractionDigits: 2})}</Text>
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      </KeyboardAvoidingView>

      {isFinancialRole && (
        <View style={styles.fabContainer}>
          <TouchableOpacity style={styles.fabPrimary} onPress={() => setIsModalVisible(true)}><Feather name="plus" size={30} color="#FFF" /></TouchableOpacity>
        </View>
      )}

      {/* MODAL ALTA */}
      <Modal visible={isModalVisible} animationType="slide" transparent={true} onRequestClose={() => setIsModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsModalVisible(false)} />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Nuevo {activeCategory === 'obrero' ? 'Trabajador' : 'Técnico'}</Text>
            <TextInput style={styles.modalInput} placeholderTextColor="#94A3B8" placeholder="Nombre completo" value={newName} onChangeText={setNewName} />
            <TextInput style={styles.modalInput} placeholderTextColor="#94A3B8" placeholder="Puesto" value={newRole} onChangeText={setNewRole} />
            <TextInput style={styles.modalInput} placeholderTextColor="#94A3B8" placeholder="Sueldo Semanal $" keyboardType="numeric" value={newSalary} onChangeText={setNewSalary} />
            <TouchableOpacity style={styles.saveBtn} onPress={handleAddWorker} disabled={isSaving}>{isSaving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Registrar en Obra</Text>}</TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL EDICIÓN */}
      <Modal visible={isEditModalOpen} animationType="slide" transparent={true} onRequestClose={() => setIsEditModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsEditModalOpen(false)} />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>✏️ Editar Datos del Trabajador</Text>
            <Text style={styles.subModalLabel}>Nombre del Obrero/Técnico:</Text>
            <TextInput style={styles.modalInput} value={editName} onChangeText={setEditName} />
            <Text style={styles.subModalLabel}>Puesto u Oficio:</Text>
            <TextInput style={styles.modalInput} value={editRole} onChangeText={setEditRole} />
            <Text style={styles.subModalLabel}>Sueldo Base Semanal ($):</Text>
            <TextInput style={styles.modalInput} keyboardType="numeric" value={editSalary} onChangeText={(v) => setEditSalary(v.replace(/[^0-9]/g, ''))} />
            <TouchableOpacity style={styles.saveBtn} onPress={handleUpdateWorker} disabled={isSaving}>{isSaving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Guardar Cambios</Text>}</TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL EXTRAS */}
      <Modal visible={isExtrasModalOpen} transparent={true} animationType="fade" onRequestClose={() => setIsExtrasModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsExtrasModalOpen(false)} />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>🕒 Asignar Horas Extra</Text>
            <Text style={styles.subModalLabel}>Ingresa la cantidad total de horas acumuladas en la semana:</Text>
            <TextInput style={styles.modalInput} keyboardType="numeric" value={tempExtras} onChangeText={(v) => setTempExtras(v.replace(/[^0-9.]/g, ''))} placeholder="Ej. 4" autoFocus />
            <TouchableOpacity style={styles.saveBtn} onPress={saveExtrasChanges}><Text style={styles.saveBtnText}>Aplicar Horas</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL DESCUENTOS */}
      <Modal visible={isDiscountModalOpen} transparent={true} animationType="fade" onRequestClose={() => setIsDiscountModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsDiscountModalOpen(false)} />
          <View style={styles.modalContent}>
            <Text style={[styles.modalTitle, {color: '#EF4444'}]}>💸 Deducción y Observación</Text>
            <Text style={styles.subModalLabel}>Monto del Descuento ($):</Text>
            <TextInput style={styles.modalInput} keyboardType="numeric" value={tempDiscount} onChangeText={(v) => setTempDiscount(v.replace(/[^0-9.]/g, ''))} placeholder="Ej. 150" />
            <Text style={styles.subModalLabel}>Motivo o Nota justificante:</Text>
            <TextInput style={[styles.modalInput, {height: 50, textAlignVertical: 'top'}]} value={tempReason} onChangeText={setTempReason} placeholder="Ej. Retardo" multiline />
            <TouchableOpacity style={[styles.saveBtn, {backgroundColor: '#EF4444'}]} onPress={saveDiscountChanges}><Text style={styles.saveBtnText}>Aplicar Descuento</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  header: { backgroundColor: '#2563EB', paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerSubtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 'bold', letterSpacing: 1 },
  headerTitle: { color: '#FFF', fontSize: 22, fontWeight: 'bold', marginTop: 8 },
  warningBannerContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEE2E2', paddingVertical: 8, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: '#FCA5A5', gap: 8 },
  warningBannerText: { color: '#991B1B', fontSize: 12, fontWeight: '700', flex: 1 },
  tabContainer: { flexDirection: 'row', backgroundColor: '#E2E8F0', borderRadius: 12, padding: 4, marginTop: 12, marginHorizontal: 15 },
  tabBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  tabBtnActive: { backgroundColor: '#FFF', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  tabText: { fontSize: 13, fontWeight: 'bold', color: '#64748B' },
  tabTextActive: { color: '#2563EB' },
  topSyncBtnContainer: { paddingHorizontal: 15, paddingTop: 10, backgroundColor: '#F1F5F9' },
  syncBtn: { backgroundColor: '#1E293B', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 12, elevation: 2 },
  syncBtnHighlighted: { backgroundColor: '#059669' },
  syncBtnText: { color: '#FFF', fontSize: 13, fontWeight: 'bold', marginLeft: 6 },
  body: { padding: 12, paddingBottom: 150 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', color: '#334155' },
  exportButtonsContainer: { flexDirection: 'row' },
  exportBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 6 },
  exportBtnText: { color: '#FFF', fontSize: 11, fontWeight: 'bold', marginLeft: 4 },
  workerCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 12, marginBottom: 10, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' },
  workerName: { fontSize: 15, fontWeight: 'bold', color: '#1E293B' },
  workerRole: { fontSize: 11, color: '#64748B', marginTop: 1, fontWeight: '600' },
  salaryLabel: { fontSize: 8, color: '#2563EB', fontWeight: 'bold', textTransform: 'uppercase' },
  salaryValue: { fontSize: 14, fontWeight: 'bold', color: '#1E293B' },
  adminActionIconsRow: { flexDirection: 'row', alignItems: 'center' },
  inlineActionBtn: { padding: 6, backgroundColor: '#F1F5F9', borderRadius: 8 },
  attendanceRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#F8FAFC', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 12, marginBottom: 8 },
  dayBox: { alignItems: 'center', paddingHorizontal: 2 },
  dayText: { fontSize: 10, fontWeight: 'bold', color: '#64748B', marginBottom: 2 },
  actionsContainerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  actionCardBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', paddingVertical: 6, paddingHorizontal: 8, borderRadius: 10, gap: 4 },
  actionBtnLabel: { fontSize: 11, fontWeight: '600', color: '#475569' },
  actionBtnValue: { fontSize: 11, fontWeight: 'bold', color: '#0F172A' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, alignItems: 'center', paddingTop: 6, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  totalLabel: { fontSize: 11, fontWeight: '700', color: '#64748B' },
  totalValue: { fontSize: 16, fontWeight: 'bold', color: '#059669' },
  fabContainer: { position: 'absolute', bottom: 25, right: 20 },
  fabPrimary: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center', elevation: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFF', borderRadius: 24, padding: 22 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1E293B', marginBottom: 15 },
  modalInput: { backgroundColor: '#F1F5F9', borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0', color: '#1E293B' },
  saveBtn: { backgroundColor: '#2563EB', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  saveBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  subModalLabel: { fontSize: 12, fontWeight: '700', color: '#475569', marginTop: 10, marginBottom: 5 },
});