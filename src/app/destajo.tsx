'use client';

import { Feather } from '@expo/vector-icons';
import Almacen from '../lib/almacen';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useRefrescar } from '../lib/refrescar';
import { Aviso } from '../lib/aviso';
import { useProject } from '../context/ProjectContext';
import { useUser } from '../context/UserContext';
import { supabase } from '../lib/supabase';
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
  
  const { activeProject, isOffline, lastSync } = useProject();
  const { profile } = useUser(); 

  // Permiso para exportaciones y acciones financieras (admin u oficina)
  const isFinancialRole = profile?.role === 'admin' || profile?.role === 'oficina';

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [workers, setWorkers] = useState<WorkerSimple[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedWeeks, setExpandedWeeks] = useState<Record<string, boolean>>({});

  // Estados del Formulario Modal
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

  /**
   * 📌 NOTA: onRefresh
   * Ejecuta la recarga manual de datos al deslizar la pantalla hacia abajo (Pull-to-Refresh).
   */
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData(); 
    setRefreshing(false);
  }, [activeProject, isOffline]);

  /**
   * 📌 NOTA: getWeekRange
   * Calcula de forma dinámica el rango semanal laboral (Lunes a Viernes) 
   * en base a la fecha actual para asignar la etiqueta de semana por defecto.
   */
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

  /**
   * 📌 NOTA: useFocusEffect
   * Recarga automáticamente los registros cada vez que la pantalla pasa al primer plano en la app.
   */
  useFocusEffect(
    useCallback(() => {
      if (activeProject?.id) {
        fetchData();
      }
    }, [activeProject]) 
  );

  /**
   * 📌 NOTA: useEffect (Sincronización de estado de red)
   * Dispara la consulta al detectar cambios en la conectividad (isOffline) o sincronización.
   */
  useEffect(() => {
    if (activeProject?.id) {
      setTimeout(() => {
        fetchData();
      }, 500); 
    }
  }, [isOffline, lastSync, activeProject?.id]);

  /**
   * 📌 NOTA: fetchData
   * Obtiene los destajos de la tabla 'inventory' y unifica la lista de responsables 
   * (residentes desde 'profiles' y obreros desde 'workers'). Maneja persistencia en caché local (AsyncStorage).
   */
  useRefrescar(() => fetchData());

  const fetchData = async () => {
    setLoading(true);
    const projectId = activeProject?.id;
    if (!projectId) return;

    const storageKeyItems = `@inventario_cache_${projectId}`;
    const storageKeyWorkers = `@workers_simple_cache_${projectId}`;

    if (isOffline) {
      try {
        const cachedItems = await Almacen.getItem(storageKeyItems);
        const cachedWorkers = await Almacen.getItem(storageKeyWorkers);
        
        if (cachedItems) setItems(JSON.parse(cachedItems));
        if (cachedWorkers) setWorkers(JSON.parse(cachedWorkers));
      } catch (error) {
        console.log("Error leyendo caché:", error);
      } finally {
        setLoading(false);
      }
    } else {
      try {
        // 1. Cargar registros de destajos activos de la obra
        const { data: invData, error: invError } = await supabase
          .from('inventory')
          .select('*')
          .eq('is_active', true)
          .eq('project_id', projectId)
          .order('created_at', { ascending: false });

        if (invError) throw invError;
        if (invData) {
          setItems(invData);
          await Almacen.setItem(storageKeyItems, JSON.stringify(invData));
        }

        // 2. Consulta combinada en paralelo: Trabajadores de la obra + Residentes
        const [workersResponse, profilesResponse] = await Promise.all([
          supabase.from('workers').select('id, name_worker').eq('is_active', true).eq('project_id', projectId),
          supabase.from('profiles').select('id, full_name, role').or('role.eq.residente')
        ]);
          
        if (workersResponse.error) throw workersResponse.error;
        if (profilesResponse.error) throw profilesResponse.error;

        const listaCombinada: WorkerSimple[] = [];

        if (profilesResponse.data) {
          profilesResponse.data.forEach(p => {
            listaCombinada.push({
              id: p.id,
              name: p.full_name || 'Usuario sin nombre'
            });
          });
        }

        if (workersResponse.data) {
          workersResponse.data.forEach(w => {
            listaCombinada.push({
              id: w.id,
              name: w.name_worker
            });
          });
        }

        // Limpiar nombres duplicados
        const listaLimpia = listaCombinada.filter((item, index, self) =>
          index === self.findIndex((t) => t.name.trim().toLowerCase() === item.name.trim().toLowerCase())
        );

        setWorkers(listaLimpia);
        await Almacen.setItem(storageKeyWorkers, JSON.stringify(listaLimpia));

      } catch (error: any) {
        if (error.message !== 'Network request failed' && error.message !== 'Failed to fetch') {
          console.log("Error cargando datos:", error);
        }
      } finally {
        setLoading(false);
      }
    }
  };

  // Filtrado reactivo por texto de búsqueda
  const filteredItems = items.filter(item => {
    const normalizeText = (text: string) => 
      text?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "") || "";

    const term = normalizeText(searchQuery);
    
    const nameStr = normalizeText(item.name);
    const week = normalizeText(item.week_label || "");
    const inChargeStr = normalizeText(item.in_charge || "");
    const requestedByStr = normalizeText(item.requested_by || "");

    return (
      nameStr.includes(term) ||
      week.includes(term) ||
      inChargeStr.includes(term) ||
      requestedByStr.includes(term)
    );
  });

  const totalInvertido = filteredItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

  // Agrupador de destajos por etiqueta de semana
  const groupedItems = filteredItems.reduce((acc, item) => {
    const week = item.week_label || 'Semana sin definir';
    if (!acc[week]) acc[week] = [];
    acc[week].push(item);
    return acc;
  }, {} as Record<string, InventoryItem[]>);

  // Listado único para sugerencias rápidas de conceptos
  const uniqueMaterials = items.filter((item, index, self) =>
    index === self.findIndex((t) => (
      t.name.toLowerCase().trim() === item.name.toLowerCase().trim()
    ))
  );

  /**
   * 📌 NOTA: toggleWeek
   * Alterna la visibilidad (abrir/cerrar) del bloque de tabla de una semana específica.
   */
  const toggleWeek = (week: string) => {
    setExpandedWeeks(prev => ({
      ...prev,
      [week]: !prev[week]
    }));
  };

  /**
   * 📌 NOTA: openAddModal
   * Inicializa los campos en blanco y abre el modal para registrar un nuevo concepto.
   */
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

  /**
   * 📌 NOTA: openEditModal
   * Carga los datos de un destajo existente en el modal para su modificación.
   */
  const openEditModal = (item: InventoryItem) => {
    if (isOffline) {
      Aviso.alert("Modo Lectura Activo", "No puedes editar registros antiguos sin conexión a internet.");
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

  /**
   * 📌 NOTA: confirmDelete
   * Solicita confirmación y ejecuta el borrado físico permanente (.delete()) en Supabase,
   * garantizando que el registro desaparezca al instante en web y móvil.
   */
  const confirmDelete = (id: string, itemName: string) => {
    if (isOffline) {
      Aviso.alert("Modo Lectura Activo", "No puedes eliminar registros sin conexión a internet.");
      return;
    }

    Aviso.alert(
      "Eliminar Registro",
      `¿Estás seguro de que deseas eliminar permanentemente "${itemName}" del reporte?`,
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Sí, eliminar", 
          style: "destructive", 
          onPress: async () => {
            try {
              // 🟢 Borrado físico permanente sincronizado con la Web
              const { error } = await supabase
                .from('inventory')
                .delete()
                .eq('id', id);

              if (error) throw error;
              
              setItems(prev => prev.filter(i => i.id !== id));
            } catch (error: any) {
              Aviso.alert("Error al eliminar", error.message);
            }
          } 
        }
      ]
    );
  };

  /**
   * 📌 NOTA: handleSaveItem
   * Valida y guarda un nuevo registro o actualiza uno existente en 'inventory'.
   * Si está sin conexión, lo almacena en la bandeja de salida offline local.
   */
  const handleSaveItem = async () => {
    if (!name.trim() || !unit.trim() || !quantity.trim() || !price.trim() || !weekLabelModal.trim()) {
      Aviso.alert("Campos incompletos", "Por favor llena los datos básicos (Semana, Concepto, Cantidad y Mano de Obra).");
      return;
    }

    const projectId = activeProject?.id;
    if (!projectId) {
      Aviso.alert("Error", "No hay una obra seleccionada.");
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
      project_id: projectId,
      is_active: true
    };

    if (isOffline) {
      try {
        const offlineItem = {
          ...itemData,
          id: `temp_${Date.now()}`,
          created_at: new Date().toISOString()
        };

        const itemConUUID = {
          ...itemData,
          local_uuid: Crypto.randomUUID() 
        };

        const existing = await Almacen.getItem('@bandeja_salida_inventario');
        const outbox = existing ? JSON.parse(existing) : [];
        outbox.push(itemConUUID); 
        await Almacen.setItem('@bandeja_salida_inventario', JSON.stringify(outbox));

        setItems(prev => [offlineItem as InventoryItem, ...prev]);
        setIsModalVisible(false);
        Aviso.alert("Guardado Offline", "El registro se guardó localmente y se sincronizará al recuperar conexión.");
      } catch (error) {
        Aviso.alert("Error", "Hubo un problema guardando el registro offline.");
      } finally {
        setIsSaving(false);
      }
      return;
    }

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
      Aviso.alert("Error", error.message);
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * 📌 NOTA: ejecutarGeneracionPDF
   * Genera el documento PDF de destajos a partir de la plantilla HTML y abre el diálogo nativo para compartir.
   */
  const ejecutarGeneracionPDF = async () => {
    setIsExporting(true);
    try {
      const htmlContent = generarPlantillaInventario(filteredItems);
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri, {
        UTI: '.pdf',
        mimeType: 'application/pdf',
        dialogTitle: 'Exportar Inventario'
      });
    } catch (error: any) {
      console.error("Error al exportar inventario:", error);
      Aviso.alert("Error", "Ocurrió un problema al generar el documento.");
    } finally {
      setIsExporting(false);
    }
  };

  /**
   * 📌 NOTA: handleExportPDF
   * Valida que existan registros visibles antes de iniciar la generación del PDF.
   */
  const handleExportPDF = async () => {
    if (filteredItems.length === 0) {
      Aviso.alert("Sin datos", "No hay registros en esta vista para exportar.");
      return;
    }
    ejecutarGeneracionPDF();
  };

  /**
   * 📌 NOTA: handleExportarExcel
   * Crea un archivo CSV estructurado con codificación UTF-8 BOM para descarga y apertura en Excel.
   */
  const handleExportarExcel = async () => {
    if (filteredItems.length === 0) {
      Aviso.alert("Sin datos", "No hay registros en esta vista para exportar.");
      return;
    }

    try {
      const encabezados = ["Semana", "Concepto/Actividad", "Unidad", "Cantidad", "P.U./M.O ($)", "Importe Total ($)", "Encargado/Recibe", "Solicitado por\n"];
      
      const filas = filteredItems.map(item => {
        const conceptoLimpio = item.name.replace(/,/g, ' ');
        const encargadoLimpio = (item.in_charge || '').replace(/,/g, ' ');
        const solicitadoLimpio = (item.requested_by || '').replace(/,/g, ' ');
        const importe = item.quantity * item.unit_price;
        
        return `"${item.week_label || 'Sin definir'}","${conceptoLimpio}","${item.unit}",${item.quantity},${item.unit_price},${importe.toFixed(2)},"${encargadoLimpio}","${solicitadoLimpio}"`;
      }).join("\n");

      const contenidoCSV = "\uFEFF" + encabezados.join(",") + filas;
      const nombreArchivo = `Destajos_Inventario_${activeProject?.name?.replace(/\s+/g, '_') || 'Obra'}.csv`;
      
      const fileUri = `${FileSystem.documentDirectory}${nombreArchivo}`;
      
      await FileSystem.writeAsStringAsync(fileUri, contenidoCSV, { encoding: 'utf8' });
      await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Exportar a Excel' });

    } catch (error: any) {
      Aviso.alert("Error Excel", "No se pudo generar la hoja de cálculo: " + error.message);
    }
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
          <Text style={styles.headerTitle}>Control de Destajos</Text>
        </View>
      </View>

      <View style={styles.body}>
        
        {isOffline ? (
          <View style={{ backgroundColor: '#FEF3C7', padding: 10, borderRadius: 8, marginBottom: 15, flexDirection: 'row', alignItems: 'center' }}>
            <Feather name="wifi-off" size={16} color="#D97706" style={{ marginRight: 8 }} />
            <Text style={{ color: '#D97706', fontSize: 12, flex: 1 }}>Modo Lectura. Puedes agregar gastos nuevos, pero no editar ni eliminar los antiguos.</Text>
          </View>
        ) : null}

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
          {searchQuery.length > 0 ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearchBtn}>
              <Feather name="x-circle" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle} adjustsFontSizeToFit numberOfLines={1}>
            {searchQuery ? 'Resultados de Búsqueda' : 'Resumen por Semanas'}
          </Text>
          <View style={styles.actionsRow}>
            <TouchableOpacity style={[styles.addButton, isOffline ? {backgroundColor: '#D97706'} : null]} onPress={openAddModal}>
              <Feather name="plus" size={14} color="#FFF" />
              <Text style={styles.addButtonText} adjustsFontSizeToFit numberOfLines={1}>Concepto</Text>
            </TouchableOpacity>
            
            {isFinancialRole ? (
              <View style={{flexDirection: 'row', gap: 8}}>
                <TouchableOpacity style={[styles.addButton, styles.pdfButton]} onPress={handleExportPDF} disabled={isExporting}>
                  {isExporting ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <View style={{flexDirection: 'row', alignItems: 'center'}}>
                      <Feather name="file-text" size={14} color="#FFF" />
                      <Text style={styles.addButtonText} adjustsFontSizeToFit numberOfLines={1}>PDF</Text>
                    </View>
                  )}
                </TouchableOpacity>

                <TouchableOpacity style={[styles.addButton, styles.excelButton]} onPress={handleExportarExcel}>
                  <Feather name="grid" size={14} color="#FFF" />
                  <Text style={styles.addButtonText} adjustsFontSizeToFit numberOfLines={1}>Excel</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </View>

        <ScrollView 
          showsVerticalScrollIndicator={false} 
          contentContainerStyle={{ paddingBottom: 100 }} 
          keyboardShouldPersistTaps="handled" 
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh} 
              colors={['#2563EB']} 
              tintColor="#2563EB"
            />
          }
        >
          {loading ? (
            <Text style={styles.emptyText}>Cargando datos...</Text>
          ) : Object.keys(groupedItems).length === 0 ? (
            <Text style={styles.emptyText}>No se encontraron registros en esta obra.</Text>
          ) : (
            Object.entries(groupedItems).map(([week, weekItems]) => {
              const weekSubtotal = weekItems.reduce((sum, i) => sum + (i.quantity * i.unit_price), 0);
              const isExpanded = expandedWeeks[week] || false;
              
              return (
                <View key={week} style={styles.weekBlock}>
                  <TouchableOpacity 
                    style={[styles.weekHeader, isExpanded ? styles.weekHeaderExpanded : null]} 
                    onPress={() => toggleWeek(week)}
                    activeOpacity={0.8}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                      <Feather name={isExpanded ? "chevron-down" : "chevron-right"} size={20} color="#1E3A8A" style={{ marginRight: 8 }} />
                      <Text style={styles.weekTitle} numberOfLines={1}>{week}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.weekSubtotal}>${weekSubtotal.toFixed(2)}</Text>
                      <Text style={styles.weekItemCount}>{weekItems.length} registros</Text>
                    </View>
                  </TouchableOpacity>

                  {isExpanded ? (
                    <View style={styles.tableContainer}>
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
                                <TouchableOpacity onPress={() => openEditModal(item)} style={[styles.editIcon, isOffline ? {opacity: 0.5} : null]}>
                                  <Feather name="edit-2" size={10} color="#2563EB" />
                                </TouchableOpacity>
                                
                                {isFinancialRole ? (
                                  <TouchableOpacity onPress={() => confirmDelete(item.id, item.name)} style={[styles.deleteIcon, isOffline ? {opacity: 0.5} : null]}>
                                    <Feather name="trash-2" size={10} color="#DC2626" />
                                  </TouchableOpacity>
                                ) : null}
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
                  ) : null}
                </View>
              );
            })
          )}
        </ScrollView>
      </View>

      {/* ✏️ FORMULARIO TIPO BOTTOM SHEET */}
      <Modal visible={isModalVisible} animationType="slide" transparent={true} onRequestClose={() => setIsModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsModalVisible(false)} />
          
          <View style={[styles.modalContent, { maxHeight: '90%', paddingBottom: Platform.OS === 'ios' ? 40 : 25 }]}>
            
            <View style={{ alignItems: 'center', marginBottom: 10 }}>
              <View style={{ width: 45, height: 6, backgroundColor: '#E2E8F0', borderRadius: 10 }} />
            </View>

            <View style={[styles.modalHeader, { borderBottomWidth: 0, paddingBottom: 10 }]}>
              <Text style={styles.modalTitle}>{editingId ? 'Editar Registro' : 'Nuevo Registro'}</Text>
              <TouchableOpacity onPress={() => setIsModalVisible(false)}>
                <Feather name="x" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {isOffline ? (
                <Text style={{color: '#D97706', fontSize: 12, marginBottom: 10, fontStyle: 'italic'}}>
                  * Guardando en modo local
                </Text>
              ) : null}

              <Text style={styles.modalLabel}>Semana de Registro</Text>
              <TextInput 
                style={[styles.modalInput, { backgroundColor: '#EFF6FF', fontWeight: 'bold' }]} 
                value={weekLabelModal} 
                onChangeText={setWeekLabelModal} 
              />

              <Text style={styles.modalLabel}>Concepto / Actividad</Text>
              <View style={{ zIndex: 1 }}>
                <TextInput 
                  style={[styles.modalInput, showSuggestions && name.length > 0 ? styles.modalInputActive : null]} 
                  placeholder="Concepto" 
                  placeholderTextColor="#9CA3AF"
                  value={name} 
                  onChangeText={(val) => {
                    setName(val);
                    setShowSuggestions(true);
                  }} 
                />
                
                {showSuggestions && name.length > 1 ? (
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
                ) : null}
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.modalLabel}>Unidad</Text>
                  <TextInput 
                    style={styles.modalInput} 
                    placeholder="Unidad" 
                    placeholderTextColor="#9CA3AF"
                    value={unit} 
                    onChangeText={setUnit} 
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalLabel}>P.U / Mano de Obra $</Text>
                  <TextInput 
                    style={styles.modalInput} 
                    placeholder="Precio" 
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
                placeholder="Cantidad" 
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric" 
                value={quantity} 
                onChangeText={setQuantity} 
              />

              <Text style={styles.modalLabel}>Encargado / Recibe (Opcional)</Text>
              <TextInput 
                style={styles.modalInput} 
                placeholder="Nombre" 
                placeholderTextColor="#9CA3AF"
                value={inCharge} 
                onChangeText={setInCharge} 
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipContainer} keyboardShouldPersistTaps="handled">
                {workers.map(w => (
                  <TouchableOpacity 
                    key={`incharge-${w.id}`} 
                    style={[styles.chip, inCharge === w.name ? styles.chipSelected : null]}
                    onPress={() => setInCharge(w.name)}
                  >
                    <Text style={[styles.chipText, inCharge === w.name ? styles.chipTextSelected : null]}>{w.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.modalLabel}>Solicitado por (Opcional)</Text>
              <TextInput 
                style={styles.modalInput} 
                placeholder="Nombre" 
                placeholderTextColor="#9CA3AF"
                value={requestedBy} 
                onChangeText={setRequestedBy} 
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipContainer} keyboardShouldPersistTaps="handled">
                {workers.map(w => (
                  <TouchableOpacity 
                    key={`req-${w.id}`} 
                    style={[styles.chip, requestedBy === w.name ? styles.chipSelected : null]}
                    onPress={() => setRequestedBy(w.name)}
                  >
                    <Text style={[styles.chipText, requestedBy === w.name ? styles.chipTextSelected : null]}>{w.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity style={[styles.modalButton, isOffline ? {backgroundColor: '#D97706'} : null]} onPress={handleSaveItem} disabled={isSaving}>
                <Text style={styles.modalButtonText}>{isSaving ? 'Guardando...' : (isOffline ? 'Guardar Offline' : 'Guardar')}</Text>
              </TouchableOpacity>
              <View style={{height: 40}}/>
            </ScrollView>
          </View>
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
  excelButton: { backgroundColor: '#10B981' },
  weekBlock: { marginBottom: 15 },
  weekHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#E0E7FF', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#C7D2FE' },
  weekHeaderExpanded: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottomWidth: 0 },
  weekTitle: { fontSize: 14, fontWeight: 'bold', color: '#1E3A8A', textTransform: 'uppercase', flexShrink: 1 },
  weekSubtotal: { fontSize: 16, fontWeight: 'bold', color: '#059669', textAlign: 'right' },
  weekItemCount: { fontSize: 11, color: '#6366F1', fontWeight: '600', textAlign: 'right', marginTop: 2 },
  tableContainer: { borderWidth: 1, borderColor: '#C7D2FE', borderTopWidth: 0, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, overflow: 'hidden' },
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
  modalLabel: { fontSize: 12, fontWeight: '600', color: '#4B5563', marginTop: 12, marginBottom: 6 },
  modalInput: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, padding: 12, fontSize: 14, color: '#111827' },
  modalInputActive: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderColor: '#2563EB' },
  suggestionsContainer: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#2563EB', borderTopWidth: 0, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, maxHeight: 150 },
  suggestionItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
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