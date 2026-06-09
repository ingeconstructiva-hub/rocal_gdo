import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage'; // <-- 1. IMPORTAMOS MEMORIA
import * as Crypto from 'expo-crypto';
import * as Print from 'expo-print';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useProject } from '../context/ProjectContext';
import { supabase } from '../lib/supabase';
import { generarPlantillaInventario } from './utils/pdfInventario';

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
  
  // 2. EXTRAEMOS isOffline
  const { activeProject, isOffline, lastSync } = useProject();

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [workers, setWorkers] = useState<WorkerSimple[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');

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
  
  const [refreshing, setRefreshing] = useState(false);


  const [showSuggestions, setShowSuggestions] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData(); // Forzamos a que vuelva a descargar todo
    setRefreshing(false);
  }, [activeProject, isOffline]);

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

  useFocusEffect(
    useCallback(() => {
      if (activeProject?.id) {
        fetchData();
      }
    }, [activeProject]) // Se recarga si cambia el internet
  );

  useEffect(() => {
    if (activeProject?.id) {
      // Le damos 500 milisegundos para que Supabase termine de guardar lo del "Cerebro"
      setTimeout(() => {
        fetchData();
      }, 500); 
    }
  }, [isOffline, lastSync, activeProject?.id]);

  const fetchData = async () => {
    setLoading(true);
    const projectId = activeProject?.id;
    if (!projectId) return;

    const storageKeyItems = `@inventario_cache_${projectId}`;
    const storageKeyWorkers = `@workers_simple_cache_${projectId}`;

    if (isOffline) {
      // 🔴 MODO LECTURA OFFLINE
      try {
        const cachedItems = await AsyncStorage.getItem(storageKeyItems);
        const cachedWorkers = await AsyncStorage.getItem(storageKeyWorkers);
        
        if (cachedItems) setItems(JSON.parse(cachedItems));
        if (cachedWorkers) setWorkers(JSON.parse(cachedWorkers));
      } catch (error) {
        console.log("Error leyendo caché:", error);
      } finally {
        setLoading(false);
      }
    } else {
      // 🟢 MODO ONLINE NORMAL
      try {
        const { data: invData, error: invError } = await supabase
          .from('inventory')
          .select('*')
          .eq('is_active', true)
          .eq('project_id', projectId)
          .order('created_at', { ascending: false });

        if (invError) throw invError;
        if (invData) {
          setItems(invData);
          await AsyncStorage.setItem(storageKeyItems, JSON.stringify(invData));
        }

        const { data: workData, error: workError } = await supabase
          .from('workers')
          .select('id, name')
          .eq('is_active', true)
          .eq('project_id', projectId);
          
        if (workError) throw workError;
        if (workData) {
          setWorkers(workData);
          await AsyncStorage.setItem(storageKeyWorkers, JSON.stringify(workData));
        }

      } catch (error: any) {
        if (error.message !== 'Network request failed' && error.message !== 'Failed to fetch') {
          console.log("Error cargando datos:", error);
        }
      } finally {
        setLoading(false);
      }
    }
  };

  const filteredItems = items.filter(item => {
    const term = searchQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(term) ||
      (item.week_label && item.week_label.toLowerCase().includes(term)) ||
      (item.in_charge && item.in_charge.toLowerCase().includes(term)) ||
      (item.requested_by && item.requested_by.toLowerCase().includes(term))
    );
  });

  const totalInvertido = filteredItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

  const groupedItems = filteredItems.reduce((acc, item) => {
    const week = item.week_label || 'Semana sin definir';
    if (!acc[week]) acc[week] = [];
    acc[week].push(item);
    return acc;
  }, {} as Record<string, InventoryItem[]>);

  const uniqueMaterials = items.filter((item, index, self) =>
    index === self.findIndex((t) => (
      t.name.toLowerCase().trim() === item.name.toLowerCase().trim()
    ))
  );

  const openAddModal = () => {
    setEditingId(null);
    setName('');
    setUnit('');
    setQuantity('');
    setPrice('');
    setRequestedBy('');
    setInCharge('');
    setWeekLabelModal(getWeekRange());
    setShowSuggestions(false);
    setIsModalVisible(true);
  };

  const openEditModal = (item: InventoryItem) => {
    if (isOffline) {
      Alert.alert("Modo Lectura Activo", "No puedes editar registros antiguos sin conexión a internet.");
      return;
    }
    setEditingId(item.id);
    setName(item.name);
    setUnit(item.unit);
    setQuantity(item.quantity.toString());
    setPrice(item.unit_price.toString());
    setRequestedBy(item.requested_by || '');
    setInCharge(item.in_charge || '');
    setWeekLabelModal(item.week_label || getWeekRange());
    setShowSuggestions(false);
    setIsModalVisible(true);
  };

  const confirmDelete = (id: string, itemName: string) => {
    if (isOffline) {
      Alert.alert("Modo Lectura Activo", "No puedes eliminar registros sin conexión a internet.");
      return;
    }

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
      Alert.alert("Campos incompletos", "Por favor llena los datos básicos (Semana, Concepto, Cantidad y Mano de Obra).");
      return;
    }

    const projectId = activeProject?.id;
    if (!projectId) {
      Alert.alert("Error", "No hay una obra seleccionada.");
      return;
    }

    setIsSaving(true);
    const itemData = {
      name: name.trim(),
      unit: unit.trim(),
      quantity: Number(quantity),
      unit_price: Number(price),
      week_label: weekLabelModal.toUpperCase(),
      requested_by: requestedBy,
      in_charge: inCharge,
      project_id: projectId 
    };

    // 🔴 SI NO HAY INTERNET: MODO BANDEJA DE SALIDA
    if (isOffline) {
      try {
        const offlineItem = {
        ...itemData,
        id: `temp_${Date.now()}`,
        created_at: new Date().toISOString()
        };

        const itemConUUID = {
        ...itemData,
        local_uuid: Crypto.randomUUID() // <-- agregar esto
        };

        const existing = await AsyncStorage.getItem('@bandeja_salida_inventario');
        const outbox = existing ? JSON.parse(existing) : [];
        outbox.push(itemConUUID); // <-- usar itemConUUID en lugar de itemData
        await AsyncStorage.setItem('@bandeja_salida_inventario', JSON.stringify(outbox));

        // Reflejamos el cambio en pantalla inmediatamente para el usuario
        setItems(prev => [offlineItem as InventoryItem, ...prev]);
        setIsModalVisible(false);
        Alert.alert("Guardado Offline", "El gasto se ha registrado en tu celular y se sincronizará cuando regrese el internet.");
      } catch (error) {
        Alert.alert("Error", "Hubo un problema guardando el registro offline.");
      } finally {
        setIsSaving(false);
      }
      return;
    }

    // 🟢 SI HAY INTERNET: MODO NORMAL
    try {
      if (editingId && !editingId.startsWith('temp_')) {
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

  const ejecutarGeneracionPDF = async () => {
    setIsExporting(true);
    try {
      // Como no hay fotos complejas en el inventario, no necesitamos pasar isOffline aquí, pero lo mantenemos asíncrono
      const htmlContent = generarPlantillaInventario(filteredItems);
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

  const handleExportPDF = async () => {
    if (filteredItems.length === 0) {
      Alert.alert("Sin datos", "No hay registros en esta vista para exportar.");
      return;
    }
    // PDF se genera sin problema offline, no hace falta advertencia de fotos.
    ejecutarGeneracionPDF();
  };

  return (
    
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Feather name="chevron-left" size={28} color="#FFF" />
          </TouchableOpacity>
          
          <View style={{ width: 28 }} />
        </View>
        <View style={styles.headerBottomRow}>
          <Text style={styles.headerTitle}>Gastos y Materiales</Text>
        </View>
      </View>

      <View style={styles.body}>
        
        {/* AVISO OFFLINE OPCIONAL EN LA PANTALLA */}
        {isOffline && (
          <View style={{ backgroundColor: '#FEF3C7', padding: 10, borderRadius: 8, marginBottom: 15, flexDirection: 'row', alignItems: 'center' }}>
            <Feather name="wifi-off" size={16} color="#D97706" style={{ marginRight: 8 }} />
            <Text style={{ color: '#D97706', fontSize: 12, flex: 1 }}>Modo Lectura. Puedes agregar gastos nuevos, pero no editar ni eliminar los antiguos.</Text>
          </View>
        )}

        <View style={styles.summaryCard}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Total Registros</Text>
            <Text style={styles.summaryValue}>{filteredItems.length}</Text> 
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Gasto en Pantalla</Text>
            <Text style={[styles.summaryValue, { color: '#059669' }]} adjustsFontSizeToFit numberOfLines={1}>
              ${totalInvertido.toFixed(2)}
            </Text>
          </View>
        </View>

        <View style={styles.searchContainer}>
          <Feather name="search" size={18} color="#9CA3AF" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar concepto, semana, nombre..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearchBtn}>
              <Feather name="x-circle" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle} adjustsFontSizeToFit numberOfLines={1}>
            {searchQuery ? 'Resultados de Búsqueda' : 'Reporte Histórico'}
          </Text>
          <View style={styles.actionsRow}>
            <TouchableOpacity style={[styles.addButton, isOffline && {backgroundColor: '#D97706'}]} onPress={openAddModal}>
              <Feather name="plus" size={14} color="#FFF" />
              <Text style={styles.addButtonText} adjustsFontSizeToFit numberOfLines={1}>Concepto</Text>
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

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }} keyboardShouldPersistTaps="handled" refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh} 
              colors={['#2563EB']} // Ruedita color azul
              tintColor="#2563EB"
            />}>
          {loading ? (
            <Text style={styles.emptyText}>Cargando datos...</Text>
          ) : Object.keys(groupedItems).length === 0 ? (
            <Text style={styles.emptyText}>No se encontraron registros en esta obra.</Text>
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
                    <Text style={[styles.thText, { flex: 1.5, textAlign: 'center' }]}>P.U./ M.O</Text>
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
                            <TouchableOpacity onPress={() => openEditModal(item)} style={[styles.editIcon, isOffline && {opacity: 0.5}]}>
                              <Feather name="edit-2" size={10} color="#2563EB" />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => confirmDelete(item.id, item.name)} style={[styles.deleteIcon, isOffline && {opacity: 0.5}]}>
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
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editingId ? 'Editar Registro' : 'Nuevo Registro'}</Text>
                <TouchableOpacity onPress={() => setIsModalVisible(false)}>
                  <Feather name="x" size={24} color="#6B7280" />
                </TouchableOpacity>
              </View>

              {isOffline && (
                <Text style={{color: '#D97706', fontSize: 12, marginBottom: 10, fontStyle: 'italic'}}>
                  * Guardando en modo local
                </Text>
              )}

              <Text style={styles.modalLabel}>Semana de Registro</Text>
              <TextInput 
                style={[styles.modalInput, { backgroundColor: '#EFF6FF', fontWeight: 'bold' }]} 
                value={weekLabelModal} 
                onChangeText={setWeekLabelModal} 
              />

              <Text style={styles.modalLabel}>Concepto / Actividad</Text>
              <View style={{ zIndex: 1 }}>
                <TextInput 
                  style={[styles.modalInput, showSuggestions && name.length > 0 && styles.modalInputActive]} 
                  placeholder="Ej. Cemento Cruz Azul 50kg" 
                  placeholderTextColor="#9CA3AF"
                  value={name} 
                  onChangeText={(val) => {
                    setName(val);
                    setShowSuggestions(true);
                  }} 
                />
                
                {showSuggestions && name.length > 1 && (
                  <View style={styles.suggestionsContainer}>
                    {uniqueMaterials
                      .filter(m => m.name.toLowerCase().includes(name.toLowerCase()))
                      .slice(0, 4) 
                      .map(suggestion => (
                        <TouchableOpacity 
                          key={`sug-${suggestion.id}`} 
                          style={styles.suggestionItem}
                          onPress={() => {
                            setName(suggestion.name);
                            setUnit(suggestion.unit);
                            setPrice(suggestion.unit_price.toString());
                            setShowSuggestions(false); 
                          }}
                        >
                          <Text style={styles.suggestionText}>{suggestion.name}</Text>
                          <Text style={styles.suggestionPrice}>
                            ${suggestion.unit_price} / {suggestion.unit}
                          </Text>
                        </TouchableOpacity>
                      ))}
                  </View>
                )}
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
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
                  <Text style={styles.modalLabel}>Precio Unitario $</Text>
                  <TextInput 
                    style={styles.modalInput} 
                    placeholder="Ej. 250" 
                    placeholderTextColor="#9CA3AF"
                    keyboardType="numeric" 
                    value={price} 
                    onChangeText={setPrice} 
                  />
                </View>
              </View>

              <Text style={styles.modalLabel}>Vol. / Cant. (Para esta semana)</Text>
              <TextInput 
                style={styles.modalInput} 
                placeholder="Ej. 10" 
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric" 
                value={quantity} 
                onChangeText={setQuantity} 
              />

              <Text style={styles.modalLabel}>Encargado / Recibe (Opcional)</Text>
              <TextInput 
                style={styles.modalInput} 
                placeholder="Nombre del responsable..." 
                placeholderTextColor="#9CA3AF"
                value={inCharge} 
                onChangeText={setInCharge} 
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipContainer} keyboardShouldPersistTaps="handled">
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
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipContainer} keyboardShouldPersistTaps="handled">
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

              <TouchableOpacity style={[styles.modalButton, isOffline && {backgroundColor: '#D97706'}]} onPress={handleSaveItem} disabled={isSaving}>
                <Text style={styles.modalButtonText}>{isSaving ? 'Guardando...' : (isOffline ? 'Guardar Offline' : 'Guardar')}</Text>
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
  header: { backgroundColor: '#2563EB', paddingTop: 60, paddingBottom: 25, paddingHorizontal: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 },
  backButton: { padding: 4, marginLeft: -4 , top: 21},
  headerSubtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  headerBottomRow: { flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: '#FFF', fontSize: 26, fontWeight: 'bold', bottom: 30 },
  headerSmall: { color: 'rgba(255,255,255,0.9)', fontSize: 14, marginTop: 4 },
  
  body: { padding: 15, flex: 1 },
  
  summaryCard: { flexDirection: 'row', backgroundColor: '#1E293B', borderRadius: 16, padding: 15, marginBottom: 15, elevation: 3 },
  summaryBox: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, backgroundColor: '#475569', marginHorizontal: 10 },
  summaryLabel: { color: '#94A3B8', fontSize: 11, marginBottom: 5, textTransform: 'uppercase' },
  summaryValue: { color: '#FFF', fontSize: 22, fontWeight: 'bold' },

  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 20 },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 13, color: '#111827' },
  clearSearchBtn: { padding: 4 },

  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, flexWrap: 'wrap', gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#374151', flexShrink: 1 },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  addButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#059669', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10 },
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
  modalInputActive: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderColor: '#2563EB' },

  suggestionsContainer: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#2563EB',
    borderTopWidth: 0,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    maxHeight: 150,
  },
  suggestionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6'
  },
  suggestionText: { fontSize: 13, color: '#111827', fontWeight: '600' },
  suggestionPrice: { fontSize: 11, color: '#059669', fontWeight: 'bold' },
  
  chipContainer: { flexDirection: 'row', marginTop: 8, marginBottom: 4 },
  chip: { backgroundColor: '#F3F4F6', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginRight: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  chipSelected: { backgroundColor: '#2563EB', borderColor: '#1D4ED8' },
  chipText: { fontSize: 11, color: '#4B5563', fontWeight: '500' },
  chipTextSelected: { color: '#FFF', fontWeight: 'bold' },

  modalButton: { backgroundColor: '#2563EB', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 25 },
  modalButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 }
});