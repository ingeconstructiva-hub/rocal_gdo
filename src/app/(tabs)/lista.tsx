import { Feather } from '@expo/vector-icons';
import * as Print from 'expo-print';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Dimensions, Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { supabase } from '../../lib/supabase';
import { generarPlantillaNomina } from '../utils/pdfNomina';
// 1. IMPORTAMOS EL CEREBRO DE PROYECTOS
import { useProject } from '../../context/ProjectContext';

interface WorkerState {
  id: string;
  name: string;
  role: string;
  weekly_salary: number;
  attendance: boolean[]; 
  extraDeduction: number; 
  reason: string;         
  tempDeduction: string;  
  tempReason: string;     
}

const DAYS_OF_WEEK = ['L', 'M', 'M', 'J', 'V'];
const screenWidth = Dimensions.get('window').width;

export default function ListaScreen() {
  const router = useRouter();
  
  // 2. EXTRAEMOS LA OBRA ACTIVA
  const { activeProject } = useProject();

  const [workers, setWorkers] = useState<WorkerState[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<any[]>([{ value: 0, label: 'Sin datos' }]);

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingWorkerId, setEditingWorkerId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newSalary, setNewSalary] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const getWeekRange = () => {
    const today = new Date();
    const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay(); 
    const start = new Date(today);
    start.setDate(today.getDate() - dayOfWeek + 1); 
    const end = new Date(start);
    end.setDate(start.getDate() + 4); 
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${start.getDate()} ${months[start.getMonth()]} - ${end.getDate()} ${months[end.getMonth()]}`;
  };

  const weekLabel = getWeekRange();

  // 3. RECARGAMOS CADA QUE ENTRAMOS A LA PANTALLA Y HAY OBRA ACTIVA
  useFocusEffect(
    useCallback(() => {
      if (activeProject?.id) {
        fetchWorkers();
      }
    }, [activeProject])
  );

  useEffect(() => {
    if (loading || workers.length === 0) return;
    const autoSaveTimer = setTimeout(() => {
      handleSavePayroll(true); 
    }, 2000);
    return () => clearTimeout(autoSaveTimer);
  }, [workers]); 

  const fetchWorkers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('workers')
        .select('*')
        .eq('is_active', true)
        .eq('project_id', activeProject?.id) // <-- FILTRO SÓLO ESTA OBRA
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        const initialUIState = data.map(w => ({
          id: w.id,
          name: w.name,
          role: w.role,
          weekly_salary: w.weekly_salary,
          attendance: [true, true, true, true, true], 
          extraDeduction: 0,
          reason: '',
          tempDeduction: '', 
          tempReason: ''     
        }));
        setWorkers(initialUIState);
        
        // Cargar gráfica sólo con estos trabajadores
        const workerIds = initialUIState.map(w => w.id);
        fetchPayrollHistory(workerIds);
      } else {
        setWorkers([]);
        setChartData([{ value: 0, label: 'Vacío' }]);
      }
    } catch (error) {
      console.log("Error cargando trabajadores:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPayrollHistory = async (workerIds: string[]) => {
    try {
      const { data, error } = await supabase
        .from('payroll_records')
        .select('week_start, final_salary')
        .in('worker_id', workerIds) // <-- FILTRO PARA GRÁFICA
        .order('week_start', { ascending: true }); 

      if (error) throw error;

      if (data && data.length > 0) {
        const groupedData: Record<string, number> = {};
        data.forEach(record => {
          if (!groupedData[record.week_start]) {
            groupedData[record.week_start] = 0;
          }
          groupedData[record.week_start] += Number(record.final_salary);
        });

        const newChartData = Object.keys(groupedData).map(dateStr => {
          const dateObj = new Date(dateStr);
          dateObj.setDate(dateObj.getDate() + 1); 
          const day = dateObj.getDate();
          const month = dateObj.getMonth() + 1;
          return { value: groupedData[dateStr], label: `${day}/${month}` };
        });

        const recentChartData = newChartData.slice(-5);
        setChartData(recentChartData);
      } else {
        setChartData([{ value: 0, label: 'Vacío' }]);
      }
    } catch (error) {
      console.log("Error cargando historial de gráfica:", error);
    }
  };

  const toggleAttendance = (workerId: string, dayIndex: number) => {
    setWorkers(prev => prev.map(w => {
      if (w.id === workerId) {
        const currentAttendance = w.attendance || [true, true, true, true, true];
        const newAttendance = [...currentAttendance];
        newAttendance[dayIndex] = !newAttendance[dayIndex];
        return { ...w, attendance: newAttendance };
      }
      return w;
    }));
  };

  const updateWorkerField = (id: string, field: keyof WorkerState, value: string) => {
    setWorkers(prev => prev.map(w => w.id === id ? { ...w, [field]: value } : w));
  };

  const applyDeduction = (id: string) => {
    Keyboard.dismiss(); 
    setWorkers(prev => prev.map(w => {
      if (w.id === id) {
        const amountToAdd = Number(w.tempDeduction || 0);
        const reasonToAdd = w.tempReason.trim();
        
        if (amountToAdd > 0 || reasonToAdd) {
          let newReason = w.reason;
          if (reasonToAdd) {
            newReason = w.reason ? `${w.reason}, ${reasonToAdd}` : reasonToAdd;
          }
          return {
            ...w,
            extraDeduction: w.extraDeduction + amountToAdd, 
            reason: newReason,                              
            tempDeduction: '',                              
            tempReason: ''                                  
          };
        }
      }
      return w;
    }));
  };

  const clearDeductions = (id: string) => {
    setWorkers(prev => prev.map(w => w.id === id ? { ...w, extraDeduction: 0, reason: '' } : w));
  };

  const calculateFinalSalary = (w: WorkerState) => {
    const dailySalary = w.weekly_salary / 5;
    const attendanceArray = w.attendance || [true, true, true, true, true]; 
    const daysPresent = attendanceArray.filter(Boolean).length; 
    const extraDeduction = w.extraDeduction || 0; 
    return Math.max(0, (dailySalary * daysPresent) - extraDeduction);
  };

  const totalBase = workers.reduce((sum, w) => sum + Number(w.weekly_salary), 0);
  const totalToPay = workers.reduce((sum, w) => sum + calculateFinalSalary(w), 0);

  const openAddModal = () => {
    setEditingWorkerId(null);
    setNewName('');
    setNewRole('');
    setNewSalary('');
    setIsModalVisible(true);
  };

  const openEditModal = (worker: WorkerState) => {
    setEditingWorkerId(worker.id);
    setNewName(worker.name);
    setNewRole(worker.role);
    setNewSalary(worker.weekly_salary.toString());
    setIsModalVisible(true);
  };

  const confirmDeleteWorker = (id: string, name: string) => {
    Alert.alert(
      "Eliminar Trabajador",
      `¿Estás seguro de que deseas quitar a ${name} de la obra?`,
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Sí, eliminar", 
          style: "destructive", 
          onPress: async () => {
            try {
              const { error } = await supabase.from('workers').update({ is_active: false }).eq('id', id);
              if (error) throw error;
              setWorkers(prev => prev.filter(w => w.id !== id));
              Alert.alert("✅ Eliminado", "El trabajador ya no aparecerá en tu lista.");
            } catch (error: any) {
              Alert.alert("❌ Error", error.message);
            }
          } 
        }
      ]
    );
  };

  const handleSaveWorker = async () => {
    if (!newName.trim() || !newRole.trim() || !newSalary.trim()) {
      Alert.alert("Campos incompletos", "Llena todos los datos del trabajador.");
      return;
    }

    setIsSaving(true);
    try {
      if (editingWorkerId) {
        const { error } = await supabase.from('workers').update({ name: newName, role: newRole, weekly_salary: Number(newSalary) }).eq('id', editingWorkerId);
        if (error) throw error;
        setWorkers(prev => prev.map(w => w.id === editingWorkerId ? { ...w, name: newName, role: newRole, weekly_salary: Number(newSalary) } : w));
        Alert.alert("Éxito", "Trabajador actualizado.");
      } else {
        const { data, error } = await supabase.from('workers').insert([{ 
          name: newName, 
          role: newRole, 
          weekly_salary: Number(newSalary),
          project_id: activeProject?.id // <-- VINCULAMOS AL GUARDAR
        }]).select();
        if (error) throw error;
        if (data && data.length > 0) {
          const newWorker: WorkerState = { id: data[0].id, name: data[0].name, role: data[0].role, weekly_salary: data[0].weekly_salary, attendance: [true, true, true, true, true], extraDeduction: 0, reason: '', tempDeduction: '', tempReason: '' };
          setWorkers(prev => [newWorker, ...prev]);
          Alert.alert("Éxito", "Trabajador agregado a esta obra.");
        }
      }
      setIsModalVisible(false);
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePayroll = async (isSilent = false) => {
    if (workers.length === 0) return;

    if (!isSilent) setIsSaving(true);
    try {
      const today = new Date();
      const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
      const firstDay = today.getDate() - dayOfWeek + 1;
      const weekStart = new Date(today.setDate(firstDay)).toISOString().split('T')[0];

      const recordsToSave = workers.map(w => {
        const attendanceArray = w.attendance || [true, true, true, true, true];
        const daysAbsent = 5 - attendanceArray.filter(Boolean).length;
        
        return {
          worker_id: w.id,
          week_start: weekStart,
          days_absent: daysAbsent,
          deduction_amount: w.extraDeduction, 
          deduction_reason: w.reason,         
          final_salary: calculateFinalSalary(w)
        };
      });

      const { error } = await supabase.from('payroll_records').upsert(recordsToSave, { onConflict: 'worker_id,week_start' });
      if (error) throw error;

      if (!isSilent) {
        Alert.alert("✅ Éxito", `Nómina guardada correctamente.`);
        // Recargar gráfica
        fetchPayrollHistory(workers.map(w => w.id));
      }

    } catch (error: any) {
      if (!isSilent) Alert.alert("❌ Error", error.message);
    } finally {
      if (!isSilent) setIsSaving(false);
    }
  };

  const handleGeneratePDF = async () => {
    if (workers.length === 0) {
      Alert.alert("Sin datos", "No hay trabajadores activos.");
      return;
    }
    try {
      const htmlContent = generarPlantillaNomina(workers, weekLabel);
      const { uri } = await Print.printToFileAsync({ html: htmlContent, base64: false });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Compartir Nómina Semanal', UTI: 'com.adobe.pdf' });
    } catch (error: any) {
      Alert.alert("Error", "No se pudo generar el reporte PDF: " + error.message);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Feather name="chevron-left" size={28} color="#FFF" />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Control de Asistencia</Text>
            <Text style={styles.headerSubtitle}>{activeProject?.name || "Cargando obra..."}</Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <ScrollView 
          style={styles.body} 
          showsVerticalScrollIndicator={false} 
          contentContainerStyle={{ paddingBottom: 150 }} 
          keyboardShouldPersistTaps="handled" 
        >
          
          <View style={styles.chartCard}>
            <Text style={styles.sectionTitle}>Gasto de Nómina Semanal ($)</Text>
            <View style={{ alignItems: 'center', marginTop: 10, width: '100%' }}>
              <Text style={{ alignSelf: 'flex-start', fontSize: 10, color: '#6B7280', fontWeight: 'bold', marginBottom: 5 }}>
                Y: Gasto ($)
              </Text>
              <LineChart
                data={chartData}
                width={screenWidth - 120} 
                height={140}
                thickness={3}
                color="#2563EB"
                dataPointsColor="#059669"
                hideRules
                noOfSections={4} 
                yAxisLabelWidth={45} 
                yAxisTextStyle={{ color: '#6B7280', fontSize: 10 }}
                xAxisLabelTextStyle={{ color: '#6B7280', fontSize: 10 }}
                yAxisLabelPrefix="$" 
                textColor="#059669"
                textFontSize={10}
                textShiftY={-12}
                textShiftX={-15}
              />
              <Text style={{ fontSize: 10, color: '#6B7280', fontWeight: 'bold', marginTop: 5 }}>
                X: Semanas (Inicio de raya)
              </Text>
            </View>
          </View>

          <View style={styles.summaryCard}>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>Nómina Base</Text>
              <Text style={styles.summaryValue} adjustsFontSizeToFit numberOfLines={1}>${totalBase.toFixed(2)}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>Proyección Final</Text>
              <Text style={[styles.summaryValue, { color: '#059669' }]} adjustsFontSizeToFit numberOfLines={1}>${totalToPay.toFixed(2)}</Text>
            </View>
          </View>

          <View style={styles.sectionHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Asistencia Semanal</Text>
              <Text style={styles.weekLabelText}>Semana: {weekLabel}</Text>
            </View>
            
            {/* EL BOTÓN DE PDF SE QUEDA AQUÍ ARRIBA PORQUE ES "EXPORTACIÓN" */}
            <View style={styles.actionButtonsContainer}>
              <TouchableOpacity style={styles.pdfButton} onPress={handleGeneratePDF}>
                <Feather name="file-text" size={14} color="#FFF" />
                <Text style={styles.saveButtonText}>PDF</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.tableHeader}>
            <Text style={[styles.thText, { flex: 2.5 }]} adjustsFontSizeToFit numberOfLines={1}>Trabajador</Text>
            <Text style={[styles.thText, { flex: 3, textAlign: 'center' }]} adjustsFontSizeToFit numberOfLines={1}>Semana</Text>
            <Text style={[styles.thText, { flex: 1.5, textAlign: 'center' }]} adjustsFontSizeToFit numberOfLines={1}>S.x Día</Text>
            <Text style={[styles.thText, { flex: 2, textAlign: 'right' }]} adjustsFontSizeToFit numberOfLines={1}>S.Semanal</Text>
          </View>

          {loading ? (
            <Text style={styles.loadingText}>Cargando equipo...</Text>
          ) : workers.length === 0 ? (
            <Text style={styles.emptyText}>No hay trabajadores activos.</Text>
          ) : (
            workers.map((worker) => {
              const finalSalary = calculateFinalSalary(worker);
              const dailySalary = worker.weekly_salary / 5;
              const attendanceArray = worker.attendance || [true, true, true, true, true];
              
              return (
                <View key={worker.id} style={styles.tableRowContainer}>
                  <View style={styles.tableRow}>
                    <View style={{ flex: 2.5, justifyContent: 'center' }}>
                      <View style={styles.nameRow}>
                        <Text style={styles.tdName} numberOfLines={1}>{worker.name}</Text>
                      </View>
                      <View style={styles.workerActions}>
                        <Text style={styles.tdRole} numberOfLines={1}>{worker.role}</Text>
                        <TouchableOpacity onPress={() => openEditModal(worker)} style={styles.editIcon}>
                          <Feather name="edit-2" size={10} color="#2563EB" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => confirmDeleteWorker(worker.id, worker.name)} style={styles.deleteIcon}>
                          <Feather name="trash-2" size={10} color="#DC2626" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={{ flex: 3, flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center' }}>
                      {attendanceArray.map((isPresent, index) => (
                        <TouchableOpacity 
                          key={index} 
                          onPress={() => toggleAttendance(worker.id, index)}
                          style={styles.dayCheckbox}
                        >
                          <Text style={styles.dayLabel}>{DAYS_OF_WEEK[index]}</Text>
                          <Feather name={isPresent ? "check-square" : "square"} size={16} color={isPresent ? "#059669" : "#9CA3AF"} />
                        </TouchableOpacity>
                      ))}
                    </View>

                    <View style={{ flex: 1.5, justifyContent: 'center', alignItems: 'center' }}>
                      <Text style={styles.tdDaily} adjustsFontSizeToFit numberOfLines={1}>${dailySalary.toFixed(0)}</Text>
                    </View>

                    <View style={{ flex: 2, justifyContent: 'center', alignItems: 'flex-end' }}>
                      <Text style={styles.tdTotal} adjustsFontSizeToFit numberOfLines={1}>${finalSalary.toFixed(0)}</Text>
                    </View>
                  </View>

                  <View style={styles.extraRow}>
                    <TextInput 
                      style={[styles.extraInput, { flex: 1 }]} 
                      placeholder="Agregar Motivo..." 
                      placeholderTextColor="#9CA3AF" 
                      returnKeyType="done" 
                      value={worker.tempReason} 
                      onChangeText={(val) => updateWorkerField(worker.id, 'tempReason', val)}
                      onSubmitEditing={() => applyDeduction(worker.id)}
                    />
                    <TextInput 
                      style={[styles.extraInput, { width: 65, marginLeft: 8 }]} 
                      placeholder="Multa $" 
                      placeholderTextColor="#9CA3AF" 
                      keyboardType="numeric" 
                      returnKeyType="done" 
                      value={worker.tempDeduction} 
                      onChangeText={(val) => updateWorkerField(worker.id, 'tempDeduction', val)}
                      onSubmitEditing={() => applyDeduction(worker.id)}
                    />
                    
                    <TouchableOpacity 
                      style={styles.applyDeductionBtn} 
                      onPress={() => applyDeduction(worker.id)}
                    >
                      <Feather name="check" size={14} color="#FFF" />
                    </TouchableOpacity>
                  </View>

                  {(worker.extraDeduction > 0 || worker.reason !== '') && (
                    <View style={styles.accumulatedRow}>
                      <Text style={styles.accumulatedText}>
                        Multa aplicada: -${worker.extraDeduction} {worker.reason ? `(${worker.reason})` : ''}
                      </Text>
                      <TouchableOpacity onPress={() => clearDeductions(worker.id)} style={styles.undoBtn}>
                        <Feather name="x-circle" size={12} color="#DC2626" />
                        <Text style={styles.undoText}>Deshacer</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 4. LOS DOS BOTONES FLOTANTES (FABs) APILADOS */}
      <View style={styles.fabContainer}>
        {/* Botón Guardar Nómina (Verde) */}
        <TouchableOpacity 
          style={[styles.fab, { backgroundColor: '#059669', marginBottom: 15 }]} 
          onPress={() => handleSavePayroll(false)}
        >
          {isSaving ? <Feather name="loader" size={24} color="#FFF" /> : <Feather name="save" size={24} color="#FFF" />}
        </TouchableOpacity>
        
        {/* Botón Agregar Trabajador (Azul) */}
        <TouchableOpacity 
          style={[styles.fab, { backgroundColor: '#2563EB' }]} 
          onPress={openAddModal}
        >
          <Feather name="plus" size={28} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* MODAL */}
      <Modal visible={isModalVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingWorkerId ? 'Editar Trabajador' : 'Nuevo Trabajador'}</Text>
              <TouchableOpacity onPress={() => setIsModalVisible(false)}>
                <Feather name="x" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>Nombre completo</Text>
            <TextInput style={styles.modalInput} placeholder="Ej. Juan Pérez" value={newName} onChangeText={setNewName} returnKeyType="done" placeholderTextColor="#6B7280"/>

            <Text style={styles.modalLabel}>Puesto</Text>
            <TextInput style={styles.modalInput} placeholder="Ej. Oficial Carpintero" value={newRole} onChangeText={setNewRole} returnKeyType="done" placeholderTextColor="#6B7280"/>

            <Text style={styles.modalLabel}>Sueldo Base Semanal ($)</Text>
            <TextInput style={styles.modalInput} placeholder="Ej. 2500" keyboardType="numeric" value={newSalary} onChangeText={setNewSalary} returnKeyType="done" placeholderTextColor="#6B7280"/>

            <TouchableOpacity style={styles.modalButton} onPress={handleSaveWorker} disabled={isSaving}>
              <Text style={styles.modalButtonText}>{isSaving ? 'Guardando...' : (editingWorkerId ? 'Actualizar' : 'Agregar')}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F8' },
  header: { backgroundColor: '#2563EB', paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center' },
  backButton: { padding: 4, marginLeft: -4 },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginLeft: 15 },
  headerSubtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginLeft: 15, marginTop: 2 },
  
  body: { padding: 15 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#374151', marginBottom: 2 },
  weekLabelText: { fontSize: 12, color: '#6B7280', fontWeight: '500' },
  
  chartCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 15, marginBottom: 15, elevation: 2 },
  
  summaryCard: { flexDirection: 'row', backgroundColor: '#1E293B', borderRadius: 16, padding: 15, marginBottom: 20 },
  summaryBox: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, backgroundColor: '#475569', marginHorizontal: 10 },
  summaryLabel: { color: '#94A3B8', fontSize: 11, marginBottom: 5 },
  summaryValue: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },

  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  actionButtonsContainer: { flexDirection: 'row', alignItems: 'center' },
  saveButtonText: { color: '#FFF', fontSize: 12, fontWeight: 'bold', marginLeft: 4 },
  pdfButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#DC2626', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10 },
  
  loadingText: { textAlign: 'center', color: '#6B7280', marginTop: 20 },
  emptyText: { textAlign: 'center', color: '#6B7280', marginTop: 20, fontStyle: 'italic' },

  tableHeader: { flexDirection: 'row', backgroundColor: '#E5E7EB', paddingVertical: 10, paddingHorizontal: 5, borderTopLeftRadius: 10, borderTopRightRadius: 10, borderBottomWidth: 1, borderColor: '#D1D5DB' },
  thText: { fontSize: 10, fontWeight: 'bold', color: '#4B5563', textTransform: 'uppercase' },
  
  tableRowContainer: { backgroundColor: '#FFF', borderBottomWidth: 1, borderColor: '#E5E7EB', borderLeftWidth: 1, borderRightWidth: 1, paddingHorizontal: 5, paddingVertical: 10 },
  tableRow: { flexDirection: 'row', alignItems: 'center' },
  
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  tdName: { fontSize: 12, fontWeight: 'bold', color: '#111827' },
  
  workerActions: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  tdRole: { fontSize: 9, color: '#6B7280', flex: 1 },
  editIcon: { padding: 4, marginLeft: 2, backgroundColor: '#EFF6FF', borderRadius: 6 },
  deleteIcon: { padding: 4, marginLeft: 4, backgroundColor: '#FEE2E2', borderRadius: 6 },
  
  dayCheckbox: { alignItems: 'center', marginHorizontal: 1 },
  dayLabel: { fontSize: 8, color: '#6B7280', marginBottom: 2, fontWeight: 'bold' },
  
  tdDaily: { fontSize: 11, color: '#4B5563', fontWeight: '500' },
  tdTotal: { fontSize: 12, color: '#059669', fontWeight: 'bold' },

  extraRow: { flexDirection: 'row', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  extraInput: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6, fontSize: 11, color: '#111827' },

  applyDeductionBtn: { backgroundColor: '#059669', borderRadius: 6, paddingHorizontal: 8, marginLeft: 8, justifyContent: 'center', alignItems: 'center' },
  
  accumulatedRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingHorizontal: 5, backgroundColor: '#FEF2F2', paddingVertical: 4, borderRadius: 4 },
  accumulatedText: { fontSize: 10, color: '#DC2626', flex: 1, fontStyle: 'italic', fontWeight: '500' },
  undoBtn: { flexDirection: 'row', alignItems: 'center', marginLeft: 8, backgroundColor: '#FEE2E2', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 4 },
  undoText: { color: '#DC2626', fontSize: 9, fontWeight: 'bold', marginLeft: 3 },

  // ESTILOS DE LOS BOTONES FLOTANTES
  fabContainer: { position: 'absolute', bottom: 30, right: 25, alignItems: 'center' },
  fab: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFF', borderRadius: 16, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  modalTitle: { fontSize: 18, fontWeight: 'bold' },
  modalLabel: { fontSize: 12, fontWeight: '600', color: '#4B5563', marginTop: 10, marginBottom: 5 },
  modalInput: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, padding: 10, fontSize: 14 },
  modalButton: { backgroundColor: '#2563EB', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 20 },
  modalButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 }
});