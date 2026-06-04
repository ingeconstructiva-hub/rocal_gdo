import { Feather } from '@expo/vector-icons';
import * as Print from 'expo-print';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { generarPlantillaInventario } from '../utils/pdfInventario';

interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  week_label: string;
  requested_by: string;
  in_charge: string;
}

interface WorkerSimple {
  id: string;
  name: string;
}

export default function InventarioScreen() {
  const router = useRouter();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [workers, setWorkers] = useState<WorkerSimple[]>([]);
  const [loading, setLoading] = useState(true);

  // Estados del Modal
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [requestedBy, setRequestedBy] = useState('');
  const [inCharge, setInCharge] = useState('');
  const [weekLabelModal, setWeekLabelModal] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const getWeekRange = () => {
    const today = new Date();
    const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay(); 
    const start = new Date(today);
    start.setDate(today.getDate() - dayOfWeek + 1); 
    const end = new Date(start);
    end.setDate(start.getDate() + 4); 
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${start.getDate()} ${months[start.getMonth()]} - ${end.getDate()} ${months[end.getMonth()]} ${start.getFullYear()}`;
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data: invData, error: invError } = await supabase
        .from('inventory')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (invError) throw invError;
      if (invData) setItems(invData);

      const { data: workData, error: workError } = await supabase
        .from('workers')
        .select('id, name')
        .eq('is_active', true);
        
      if (workError) throw workError;
      if (workData) setWorkers(workData);

    } catch (error) {
      console.log("Error cargando datos:", error);
    } finally {
      setLoading(false);
    }
  };

  const totalInvertido = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

  const groupedItems = items.reduce((acc, item) => {
    const week = item.week_label || 'Semana sin definir';
    if (!acc[week]) acc[week] = [];
    acc[week].push(item);
    return acc;
  }, {} as Record<string, InventoryItem[]>);

  const openAddModal = () => {
    setEditingId(null);
    setName('');
    setUnit('');
    setQuantity('');
    setPrice('');
    setRequestedBy('');
    setInCharge('');
    setWeekLabelModal(getWeekRange());
    setIsModalVisible(true);
  };

  const openEditModal = (item: InventoryItem) => {
    setEditingId(item.id);
    setName(item.name);
    setUnit(item.unit);
    setQuantity(item.quantity.toString());
    setPrice(item.unit_price.toString());
    setRequestedBy(item.requested_by || '');
    setInCharge(item.in_charge || '');
    setWeekLabelModal(item.week_label || getWeekRange());
    setIsModalVisible(true);
  };

  const confirmDelete = (id: string, itemName: string) => {
    Alert.alert(
      "Eliminar Registro",
      `¿Estás seguro de que deseas quitar "${itemName}" del reporte?`,
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Sí, eliminar", 
          style: "destructive", 
          onPress: async () => {
            try {
              const { error } = await supabase.from('inventory').update({ is_active: false }).eq('id', id);
              if (error) throw error;
              setItems(prev => prev.filter(i => i.id !== id));
            } catch (error: any) {
              Alert.alert("Error al eliminar", error.message);
            }
          } 
        }
      ]
    );
  };

  const handleSaveItem = async () => {
    if (!name.trim() || !unit.trim() || !quantity.trim() || !price.trim() || !weekLabelModal.trim()) {
      Alert.alert("Campos incompletos", "Por favor llena los datos básicos (Semana, Concepto, Cantidad y P.U.).");
      return;
    }

    setIsSaving(true);
    const itemData = {
      name,
      unit,
      quantity: Number(quantity),
      unit_price: Number(price),
      week_label: weekLabelModal.toUpperCase(),
      requested_by: requestedBy,
      in_charge: inCharge
    };

    try {
      if (editingId) {
        const { error } = await supabase.from('inventory').update(itemData).eq('id', editingId);
        if (error) throw error;
        setItems(prev => prev.map(i => i.id === editingId ? { ...i, ...itemData } : i));
      } else {
        const { data, error } = await supabase.from('inventory').insert([itemData]).select();
        if (error) throw error;
        if (data && data.length > 0) {
          setItems(prev => [data[0], ...prev]);
        }
      }
      setIsModalVisible(false);
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportPDF = async () => {
    if (items.length === 0) {
      Alert.alert("Sin datos", "No hay registros de inventario para exportar.");
      return;
    }

    setIsExporting(true);
    try {
      const htmlContent = generarPlantillaInventario(items);
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri, {
        UTI: '.pdf',
        mimeType: 'application/pdf',
        dialogTitle: 'Exportar Inventario'
      });
    } catch (error: any) {
      console.error("Error al exportar inventario:", error);
      Alert.alert("Error", "Ocurrió un problema al generar el documento.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Feather name="chevron-left" size={28} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Gastos y Materiales</Text>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Total Registros</Text>
            <Text style={styles.summaryValue}>{items.length}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Gasto Acumulado</Text>
            <Text style={[styles.summaryValue, { color: '#059669' }]} adjustsFontSizeToFit numberOfLines={1}>
              ${totalInvertido.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* CONTENEDOR RESPONSIVO */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle} adjustsFontSizeToFit numberOfLines={1}>Reporte Semanal</Text>
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
              <Feather name="plus" size={14} color="#FFF" />
              <Text style={styles.addButtonText} adjustsFontSizeToFit numberOfLines={1}>Agregar Gasto</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.addButton, styles.pdfButton]} onPress={handleExportPDF} disabled={isExporting}>
              {isExporting ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Feather name="file-text" size={14} color="#FFF" />
                  <Text style={styles.addButtonText} adjustsFontSizeToFit numberOfLines={1}>PDF</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
          {loading ? (
            <Text style={styles.emptyText}>Cargando datos...</Text>
          ) : Object.keys(groupedItems).length === 0 ? (
            <Text style={styles.emptyText}>No hay gastos registrados aún.</Text>
          ) : (
            Object.entries(groupedItems).map(([week, weekItems]) => {
              const weekSubtotal = weekItems.reduce((sum, i) => sum + (i.quantity * i.unit_price), 0);
              
              return (
                <View key={week} style={styles.weekBlock}>
                  <View style={styles.weekHeader}>
                    <Text style={styles.weekTitle}>{week}</Text>
                    <Text style={styles.weekSubtotal}>Subtotal: ${weekSubtotal.toFixed(2)}</Text>
                  </View>

                  <View style={styles.tableHeader}>
                    <Text style={[styles.thText, { flex: 2.5 }]}>Concepto / Asignación</Text>
                    <Text style={[styles.thText, { flex: 1.5, textAlign: 'center' }]}>Cant/U.</Text>
                    <Text style={[styles.thText, { flex: 1.5, textAlign: 'center' }]}>P.U.</Text>
                    <Text style={[styles.thText, { flex: 2, textAlign: 'right' }]}>Importe</Text>
                  </View>

                  {weekItems.map((item) => (
                    <View key={item.id} style={styles.tableRowContainer}>
                      <View style={styles.tableRow}>
                        
                        <View style={{ flex: 2.5, justifyContent: 'center', paddingRight: 5 }}>
                          <Text style={styles.tdName} numberOfLines={2}>{item.name}</Text>
                          
                          {item.in_charge ? (
                            <View style={styles.badgeRow}>
                              <Feather name="user-check" size={10} color="#2563EB" />
                              <Text style={[styles.tdRole, { color: '#2563EB' }]} numberOfLines={1}> {item.in_charge}</Text>
                            </View>
                          ) : null}
                          
                          {item.requested_by ? (
                            <View style={styles.badgeRow}>
                              <Feather name="message-square" size={10} color="#D97706" />
                              <Text style={[styles.tdRole, { color: '#D97706' }]} numberOfLines={1}> Solicita: {item.requested_by}</Text>
                            </View>
                          ) : null}

                          <View style={styles.actionButtons}>
                            <TouchableOpacity onPress={() => openEditModal(item)} style={styles.editIcon}>
                              <Feather name="edit-2" size={10} color="#2563EB" />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => confirmDelete(item.id, item.name)} style={styles.deleteIcon}>
                              <Feather name="trash-2" size={10} color="#DC2626" />
                            </TouchableOpacity>
                          </View>
                        </View>

                        <View style={{ flex: 1.5, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={styles.tdValue}>{item.quantity}</Text>
                          <Text style={styles.tdUnit}>{item.unit}</Text>
                        </View>

                        <View style={{ flex: 1.5, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={styles.tdValue} adjustsFontSizeToFit numberOfLines={1}>${item.unit_price}</Text>
                        </View>

                        <View style={{ flex: 2, alignItems: 'flex-end', justifyContent: 'center' }}>
                          <Text style={styles.tdTotal} adjustsFontSizeToFit numberOfLines={1}>
                            ${(item.quantity * item.unit_price).toFixed(2)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              );
            })
          )}
        </ScrollView>
      </View>

      <Modal visible={isModalVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editingId ? 'Editar Registro' : 'Nuevo Registro'}</Text>
                <TouchableOpacity onPress={() => setIsModalVisible(false)}>
                  <Feather name="x" size={24} color="#6B7280" />
                </TouchableOpacity>
              </View>

              <Text style={styles.modalLabel}>Semana de Registro</Text>
              <TextInput 
                style={[styles.modalInput, { backgroundColor: '#EFF6FF', fontWeight: 'bold' }]} 
                value={weekLabelModal} 
                onChangeText={setWeekLabelModal} 
              />

              <Text style={styles.modalLabel}>Encargado / Recibe (Opcional)</Text>
              <TextInput 
                style={styles.modalInput} 
                placeholder="Nombre del responsable..." 
                placeholderTextColor="#9CA3AF"
                value={inCharge} 
                onChangeText={setInCharge} 
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipContainer}>
                {workers.map(w => (
                  <TouchableOpacity 
                    key={`incharge-${w.id}`} 
                    style={[styles.chip, inCharge === w.name && styles.chipSelected]}
                    onPress={() => setInCharge(w.name)}
                  >
                    <Text style={[styles.chipText, inCharge === w.name && styles.chipTextSelected]}>{w.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.modalLabel}>Solicitado por (Opcional)</Text>
              <TextInput 
                style={styles.modalInput} 
                placeholder="Quién pide el material..." 
                placeholderTextColor="#9CA3AF"
                value={requestedBy} 
                onChangeText={setRequestedBy} 
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipContainer}>
                {workers.map(w => (
                  <TouchableOpacity 
                    key={`req-${w.id}`} 
                    style={[styles.chip, requestedBy === w.name && styles.chipSelected]}
                    onPress={() => setRequestedBy(w.name)}
                  >
                    <Text style={[styles.chipText, requestedBy === w.name && styles.chipTextSelected]}>{w.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.modalLabel}>Concepto / Actividad</Text>
              <TextInput 
                style={styles.modalInput} 
                placeholder="Ej. Cemento Cruz Azul 50kg" 
                placeholderTextColor="#9CA3AF"
                value={name} 
                onChangeText={setName} 
              />

              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.modalLabel}>Unidad</Text>
                  <TextInput 
                    style={styles.modalInput} 
                    placeholder="Ej. Bulto" 
                    placeholderTextColor="#9CA3AF"
                    value={unit} 
                    onChangeText={setUnit} 
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalLabel}>Vol. / Cant.</Text>
                  <TextInput 
                    style={styles.modalInput} 
                    placeholder="Ej. 10" 
                    placeholderTextColor="#9CA3AF"
                    keyboardType="numeric" 
                    value={quantity} 
                    onChangeText={setQuantity} 
                  />
                </View>
              </View>

              <Text style={styles.modalLabel}>Precio Unitario (P.U.) $</Text>
              <TextInput 
                style={styles.modalInput} 
                placeholder="Ej. 250" 
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric" 
                value={price} 
                onChangeText={setPrice} 
              />

              <TouchableOpacity style={styles.modalButton} onPress={handleSaveItem} disabled={isSaving}>
                <Text style={styles.modalButtonText}>{isSaving ? 'Guardando...' : 'Guardar'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
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
  
  body: { padding: 15, flex: 1 },
  
  summaryCard: { flexDirection: 'row', backgroundColor: '#1E293B', borderRadius: 16, padding: 15, marginBottom: 20, elevation: 3 },
  summaryBox: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, backgroundColor: '#475569', marginHorizontal: 10 },
  summaryLabel: { color: '#94A3B8', fontSize: 11, marginBottom: 5, textTransform: 'uppercase' },
  summaryValue: { color: '#FFF', fontSize: 22, fontWeight: 'bold' },

  // ESTILOS RESPONSIVOS APLICADOS AQUÍ
  sectionHeaderRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 15,
    flexWrap: 'wrap', // Permite que los elementos bajen de línea si no caben
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#374151', flex: 1, marginRight: 8, flexShrink: 1 },
  actionsRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    flexWrap: 'wrap' // Permite que los botones se acomoden si la pantalla es muy delgada
  },
  addButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#059669', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, marginRight: 8 },
  addButtonText: { color: '#FFF', fontSize: 12, fontWeight: 'bold', marginLeft: 6 },
  pdfButton: { backgroundColor: '#DC2626' },

  weekBlock: { marginBottom: 25 },
  weekHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#E0E7FF', padding: 10, borderTopLeftRadius: 10, borderTopRightRadius: 10, borderBottomWidth: 2, borderBottomColor: '#4F46E5' },
  weekTitle: { fontSize: 12, fontWeight: 'bold', color: '#1E3A8A', textTransform: 'uppercase', flexShrink: 1 },
  weekSubtotal: { fontSize: 13, fontWeight: 'bold', color: '#059669', marginLeft: 10 },

  tableHeader: { flexDirection: 'row', backgroundColor: '#F3F4F6', paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderColor: '#D1D5DB' },
  thText: { fontSize: 10, fontWeight: 'bold', color: '#4B5563', textTransform: 'uppercase' },
  
  tableRowContainer: { backgroundColor: '#FFF', borderBottomWidth: 1, borderColor: '#E5E7EB', borderLeftWidth: 1, borderRightWidth: 1, paddingHorizontal: 10, paddingVertical: 12 },
  tableRow: { flexDirection: 'row', alignItems: 'center' },
  
  tdName: { fontSize: 12, fontWeight: 'bold', color: '#111827', marginBottom: 4 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  tdRole: { fontSize: 9, fontStyle: 'italic', fontWeight: '600' },
  
  actionButtons: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  editIcon: { padding: 6, backgroundColor: '#EFF6FF', borderRadius: 6, marginRight: 8 },
  deleteIcon: { padding: 6, backgroundColor: '#FEE2E2', borderRadius: 6 },
  
  tdValue: { fontSize: 12, color: '#374151', fontWeight: '600' },
  tdUnit: { fontSize: 9, color: '#6B7280', textTransform: 'uppercase', marginTop: 2 },
  tdTotal: { fontSize: 14, color: '#059669', fontWeight: 'bold' },

  emptyText: { textAlign: 'center', color: '#6B7280', marginTop: 30, fontStyle: 'italic' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', padding: 20 },
  modalContent: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, marginVertical: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
  modalLabel: { fontSize: 12, fontWeight: '600', color: '#4B5563', marginTop: 12, marginBottom: 6 },
  modalInput: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, padding: 12, fontSize: 14, color: '#111827' },
  
  chipContainer: { flexDirection: 'row', marginTop: 8, marginBottom: 4 },
  chip: { backgroundColor: '#F3F4F6', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginRight: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  chipSelected: { backgroundColor: '#2563EB', borderColor: '#1D4ED8' },
  chipText: { fontSize: 11, color: '#4B5563', fontWeight: '500' },
  chipTextSelected: { color: '#FFF', fontWeight: 'bold' },

  modalButton: { backgroundColor: '#2563EB', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 25 },
  modalButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 }
});