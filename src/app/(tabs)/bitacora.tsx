'use client';

import { Feather } from '@expo/vector-icons';
import Almacen from '../../lib/almacen';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRefrescar } from '../../lib/refrescar';
import { Aviso } from '../../lib/aviso';
import { useProject } from '../../context/ProjectContext';
import { useUser } from '../../context/UserContext';
import { supabase } from '../../lib/supabase';
import { generarPlantillaBitacora } from '../../utils/pdfTemplate';

export default function BitacoraScreen() {
  const router = useRouter();
  const { activeProject, isOffline } = useProject();
  const { profile } = useUser(); 

  const [logs, setLogs] = useState<any[]>([]);
  const [categoryStats, setCategoryStats] = useState<any[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // --- GESTIÓN DE DETALLE INTERACTIVO ---
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // --- GESTIÓN DE EDICIÓN DE BITÁCORA ---
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editLogId, setEditLogId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('General');
  const [editSector, setEditSector] = useState('');
  
  // 🟢 AHORA MANEJA UN ARREGLO DE ENLACES MULTIMEDIA
  const [editPhotosUrls, setEditPhotosUrls] = useState<string[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const isAdmin = profile?.role === 'admin';

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Estructura': return '#4F46E5'; 
      case 'Concreto': return '#059669';   
      case 'Eléctrico': return '#D97706';  
      case 'Seguridad': return '#DC2626';  
      case 'Acabados': return '#8B5CF6';   
      default: return '#2563EB';           
    }
  };

  const parsePhotos = (photoStr: any): string[] => {
    if (!photoStr) return [];
    try {
      if (typeof photoStr === 'string' && photoStr.startsWith('[')) {
        return JSON.parse(photoStr);
      }
      return [photoStr];
    } catch (e) {
      return [];
    }
  };

  const processData = (data: any[]) => {
    setLogs(data);
    const counts: Record<string, number> = {};
    data.forEach(log => {
      const cat = log.category || 'General';
      counts[cat] = (counts[cat] || 0) + 1;
    });

    const sortedStats = Object.keys(counts).map(key => ({
      label: key,
      count: counts[key],
      color: getCategoryColor(key)
    })).sort((a, b) => b.count - a.count);

    setCategoryStats(sortedStats);
  };

  useFocusEffect(
    useCallback(() => {
      if (activeProject?.id) {
        fetchLogs();
      }
    }, [activeProject, isOffline])
  );

  useRefrescar(() => fetchLogs());

  const fetchLogs = async () => {
    if (!activeProject?.id) return;
    const storageKey = `@bitacora_cache_${activeProject.id}`;

    const getOutboxLogs = async () => {
      try {
        const outboxData = await Almacen.getItem('@bandeja_salida_logs');
        if (outboxData) {
          const parsed = JSON.parse(outboxData);
          return parsed
            .filter((log: any) => log.project_id === activeProject.id)
            .map((log: any) => ({ ...log, isPending: true }));
        }
      } catch (e) { console.log(e); }
      return [];
    };

    if (isOffline) {
      try {
        const cachedData = await Almacen.getItem(storageKey);
        let finalLogs = cachedData ? JSON.parse(cachedData) : [];

        const pendingLogs = await getOutboxLogs();
        finalLogs = [...pendingLogs, ...finalLogs];
        
        finalLogs.sort((a: any , b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        processData(finalLogs);
      } catch (error) {
        console.error("Error leyendo caché:", error);
      }
    } else {
      try {
        const { data, error } = await supabase
          .from('logs')
          .select('*')
          .eq('project_id', activeProject.id) 
          .order('created_at', { ascending: false });

        if (error) throw error;
        
        if (data) {
          const pendingLogs = await getOutboxLogs();
          let finalLogs = [...pendingLogs, ...data];
          finalLogs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          
          processData(finalLogs);
          await Almacen.setItem(storageKey, JSON.stringify(data)); 
        }
      } catch (error: any) {
        if (error.message !== 'Network request failed' && error.message !== 'Failed to fetch') {
          console.error("Error al cargar bitácora:", error);
        }
      }
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth();
    
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.getDate() === yesterday.getDate() && date.getMonth() === yesterday.getMonth();

    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const time = `${hours}:${minutes}`;

    if (isToday) return `Hoy ${time}`;
    if (isYesterday) return `Ayer ${time}`;
    
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}/${month} ${time}`;
  };

  const openLogDetail = (log: any) => {
    setSelectedLog(log);
    setIsDetailModalOpen(true);
  };

  const openEditLogModal = () => {
    if (!selectedLog) return;
    setEditLogId(selectedLog.id);
    setEditDescription(selectedLog.description);
    setEditCategory(selectedLog.category || 'General');
    setEditSector(selectedLog.sector || '');
    
    // Almacenamos el array completo de fotos existentes
    setEditPhotosUrls(parsePhotos(selectedLog.photo_url));
    
    setIsDetailModalOpen(false);
    setIsEditModalOpen(true);
  };

  const pickImageFromGallery = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Aviso.alert("Permiso requerido", "Necesitamos acceso a tu galería para subir evidencias.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.6,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      uploadImageToSupabase(result.assets[0].uri);
    }
  };

  const takePhotoWithCamera = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      Aviso.alert("Permiso requerido", "Necesitamos acceso a la cámara para tomar evidencia.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.6,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      uploadImageToSupabase(result.assets[0].uri);
    }
  };

  const uploadImageToSupabase = async (fileUri: string) => {
    if (isOffline) {
      Aviso.alert("Modo Offline", "Las fotos nuevas solo pueden cargarse con conexión a internet estable.");
      return;
    }
    setIsUploadingPhoto(true);
    try {
      const response = await fetch(fileUri);
      const blob = await response.blob();
      const fileExt = fileUri.split('.').pop() || 'jpg';
      const fileName = `log_edit_${Date.now()}.${fileExt}`;
      const filePath = `evidencias_bitacora/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('imagenes_logs')
        .upload(filePath, blob, { contentType: `image/${fileExt}` });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('imagenes_logs').getPublicUrl(filePath);
      
      // 🟢 SE AGREGA AL ARREGLO EN LUGAR DE REEMPLAZARLO COMPLETAMENTE
      setEditPhotosUrls(prev => [...prev, publicUrlData.publicUrl]);

    } catch (e: any) {
      Aviso.alert("Error de subida", e.message);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const removePhotoFromEditList = (indexToRemove: number) => {
    setEditPhotosUrls(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleUpdateLog = async () => {
    if (!editLogId || !editDescription) return;
    setIsSaving(true);
    try {
      // Guardamos la estructura del Payload como un JSON stringificado limpio
      const photoPayload = editPhotosUrls.length > 0 ? JSON.stringify(editPhotosUrls) : null;

      const { error } = await supabase
        .from('logs')
        .update({
          description: editDescription,
          category: editCategory,
          sector: editSector,
          photo_url: photoPayload
        })
        .eq('id', editLogId);

      if (error) throw error;

      setLogs(prev => prev.map(l => l.id === editLogId ? { ...l, description: editDescription, category: editCategory, sector: editSector, photo_url: photoPayload } : l));
      setIsEditModalOpen(false);
      setEditLogId(null);
      setSelectedLog(null);
      Aviso.alert("¡Éxito!", "La entrada y toda su evidencia fotográfica han sido corregidas.");
    } catch (e: any) {
      Aviso.alert("Error al actualizar", e.message);
    } fill_salary: {
      setIsSaving(false);
    }
  };

  const handleDeleteLog = () => {
    if (!selectedLog) return;
    Aviso.alert(
      "Eliminar Entrada",
      "¿Estás completamente seguro de borrar este reporte de la bitácora de obra permanentemente?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase.from('logs').delete().eq('id', selectedLog.id);
              if (error) throw error;

              setLogs(prev => prev.filter(l => l.id !== selectedLog.id));
              setIsDetailModalOpen(false);
              setSelectedLog(null);
              Aviso.alert("Eliminado", "La nota se removió de la base de datos.");
            } catch (e: any) {
              Aviso.alert("Error al eliminar", e.message);
            }
          }
        }
      ]
    );
  };

  const ejecutarGeneracionPDF = async () => {
    setIsExporting(true);
    try {
      const htmlContent = await generarPlantillaBitacora(logs, isOffline);
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri, { 
        UTI: '.pdf', 
        mimeType: 'application/pdf',
        dialogTitle: 'Exportar Bitácora de Obra'
      });
    } catch (error) {
      console.error("Error al exportar:", error);
      Aviso.alert("Error", "Ocurrió un problema al generar el documento.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPDF = async () => {
    if (logs.length === 0) {
      Aviso.alert("Sin datos", "No hay entradas en la bitácora para exportar.");
      return;
    }
    if (isOffline) {
      Aviso.alert(
        "Modo Lectura Activo",
        "El PDF se generará con tus textos y notas de campo sin imágenes.\n\n¿Deseas generarlo?",
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Sí, generar PDF", onPress: ejecutarGeneracionPDF }
        ]
      );
    } else {
      ejecutarGeneracionPDF();
    }
  };

  const handleAddNewLog = () => {
    router.push('/new-log');
  };

  const maxCount = categoryStats.length > 0 ? categoryStats[0].count : 1;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Feather name="chevron-left" size={28} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerSubtitle}>GESTIÓN DE OBRA</Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={styles.headerBottomRow}>
          <Text style={styles.headerTitle}>Bitácora de Obra</Text>
        </View>
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        
        <View style={styles.chartCard}>
          <Text style={styles.sectionTitle}>ACTIVIDAD POR CONCEPTO</Text>
          {categoryStats.length === 0 ? (
            <Text style={styles.emptyStateText}>Registra tu primera nota para ver la actividad.</Text>
          ) : (
            categoryStats.map((item, index) => {
              const widthPercentage = Math.max((item.count / maxCount) * 100, 5);
              return (
                <View key={index} style={styles.chartRow}>
                  <View style={styles.chartTextRow}>
                    <Text style={styles.chartLabel}>{item.label}</Text>
                    <Text style={[styles.chartValue, { color: item.color }]}>{item.count} {item.count === 1 ? 'nota' : 'notas'}</Text>
                  </View>
                  <View style={styles.chartBarBackground}>
                    <View style={[styles.chartBarFill, { width: `${widthPercentage}%`, backgroundColor: item.color }]} />
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>HISTORIAL DE ENTRADAS</Text>
          {isAdmin && (
            <TouchableOpacity style={styles.pdfButton} onPress={handleExportPDF} disabled={isExporting}>
              {isExporting ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <><Feather name="file-text" size={14} color="#FFF" /><Text style={styles.saveButtonText}>Exportar PDF</Text></>
              )}
            </TouchableOpacity>
          )}
        </View>

        {logs.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No hay entradas en la bitácora aún.</Text>
          </View>
        ) : (
          logs.map((log) => {
            const fotos = parsePhotos(log.photo_url);
            return (
              <TouchableOpacity key={log.id || Math.random().toString()} onPress={() => openLogDetail(log)} activeOpacity={0.8} style={[styles.entryCard, log.isPending && styles.entryCardPending]}>
                <View style={styles.entryHeader}>
                  <Text style={styles.entryTitle} numberOfLines={2}>{log.description}</Text>
                  <View style={styles.photoBadge}>
                    <Feather name="camera" size={14} color="#6B7280" />
                    <Text style={styles.photoCount}>{fotos.length}</Text>
                  </View>
                </View>

                <View style={styles.entryMetaRow}>
                  <Feather name="user" size={14} color="#6B7280" />
                  <Text style={styles.entryMetaText}>Ingeniero</Text>
                  <Text style={styles.entryMetaDot}>•</Text>
                  
                  {log.isPending ? (
                    <Text style={{ color: '#D97706', fontWeight: 'bold', fontSize: 13 }}>Pendiente de subir</Text>
                  ) : (
                    <Text style={styles.entryMetaText}>{formatTime(log.created_at)}</Text>
                  )}
                </View>

                <View style={styles.tagsRow}>
                  <View style={styles.primaryTag}><Text style={styles.primaryTagText}>{log.category || 'General'}</Text></View>
                  {log.sector && <View style={styles.secondaryTag}><Text style={styles.secondaryTagText}>{log.sector}</Text></View>}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* 🖼️ MODAL DE DETALLE CON SOPORTE DE CARRUSEL MULTI-FOTO */}
      <Modal visible={isDetailModalOpen} animationType="slide" transparent={true} onRequestClose={() => setIsDetailModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsDetailModalOpen(false)} />
          <View style={styles.detailModalContent}>
            <View style={styles.detailModalHeader}>
              <Text style={styles.detailCategory}>{selectedLog?.category || 'General'}</Text>
              <TouchableOpacity onPress={() => setIsDetailModalOpen(false)} style={styles.closeDetailBtn}>
                <Feather name="x" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
              {selectedLog && parsePhotos(selectedLog.photo_url).length > 0 ? (
                <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={true} style={{ maxHeight: 210, marginBottom: 15 }}>
                  {parsePhotos(selectedLog.photo_url).map((url, index) => (
                    <Image key={index} source={{ uri: url }} style={styles.detailImageCarouselItem} resizeMode="cover" />
                  ))}
                </ScrollView>
              ) : (
                <View style={styles.noImagePlaceholder}>
                  <Feather name="image" size={32} color="#9CA3AF" />
                  <Text style={styles.noImageText}>Sin evidencia fotográfica adjunta</Text>
                </View>
              )}

              <View style={styles.detailMetaBlock}>
                <View style={styles.metaLabelRow}>
                  <Feather name="map-pin" size={14} color="#4B5563" />
                  <Text style={styles.detailMetaLabel}>Ubicación / Sector:</Text>
                </View>
                <Text style={styles.detailMetaValue}>{selectedLog?.sector || 'No especificado'}</Text>
                
                <View style={[styles.metaLabelRow, { marginTop: 12 }]}>
                  <Feather name="calendar" size={14} color="#4B5563" />
                  <Text style={styles.detailMetaLabel}>Fecha de registro:</Text>
                </View>
                <Text style={styles.detailMetaValue}>{selectedLog?.created_at ? new Date(selectedLog.created_at).toLocaleString('es-MX') : 'Reciente'}</Text>
              </View>

              <Text style={styles.detailSubTitle}>DESCRIPCIÓN DE ACTIVIDADES</Text>
              <Text style={styles.detailDescriptionText}>{selectedLog?.description}</Text>

              {isAdmin && !selectedLog?.isPending && (
                <View style={styles.detailActionsRow}>
                  <TouchableOpacity onPress={openEditLogModal} style={[styles.detailActionBtn, styles.editBtn]}>
                    <Feather name="edit-2" size={16} color="#FFF" />
                    <Text style={styles.detailActionBtnText}>Editar Reporte</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleDeleteLog} style={[styles.detailActionBtn, styles.deleteBtn]}>
                    <Feather name="trash-2" size={16} color="#FFF" />
                    <Text style={styles.detailActionBtnText}>Eliminar</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ✏️ MODAL ADMINISTRATIVO CON LÓGICA MULTI-FOTO CARGADA */}
      <Modal visible={isEditModalOpen} animationType="slide" transparent={true} onRequestClose={() => setIsEditModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsEditModalOpen(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
            <View style={styles.modalContent}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.modalTitle}>✏️ Editar Reporte de Bitácora</Text>
                
                <Text style={styles.subModalLabel}>Evidencia Fotográfica ({editPhotosUrls.length}):</Text>
                
                {/* 🟢 LISTADO HORIZONTAL DE FOTOS CARGADAS CON ELIMINACIÓN INDIVIDUAL */}
                {editPhotosUrls.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginBottom: 12 }}>
                    {editPhotosUrls.map((url, index) => (
                      <View key={index} style={styles.thumbnailContainerRow}>
                        <Image source={{ uri: url }} style={styles.editThumbnailItem} />
                        <TouchableOpacity onPress={() => removePhotoFromEditList(index)} style={styles.removeThumbnailBadgeBtn}>
                          <Feather name="x" size={10} color="#FFF" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                )}

                {isUploadingPhoto ? (
                  <View style={styles.noImagePlaceholder}>
                    <ActivityIndicator size="small" color="#2563EB" />
                    <Text style={[styles.noImageText, { color: '#2563EB' }]}>Subiendo archivo a Supabase...</Text>
                  </View>
                ) : (
                  <View style={styles.photoPickerRowContainer}>
                    <TouchableOpacity onPress={takePhotoWithCamera} style={styles.mediaPickerTriggerBtn}>
                      <Feather name="camera" size={18} color="#2563EB" />
                      <Text style={styles.mediaPickerTriggerText}>Cámara</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={pickImageFromGallery} style={[styles.mediaPickerTriggerBtn, { marginLeft: 12 }]}>
                      <Feather name="image" size={18} color="#2563EB" />
                      <Text style={styles.mediaPickerTriggerText}>Galería</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <Text style={styles.subModalLabel}>Concepto o Categoría:</Text>
                <TextInput style={styles.modalInput} placeholderTextColor="#94A3B8" value={editCategory} onChangeText={setEditCategory} />
                
                <Text style={styles.subModalLabel}>Sector o Ubicación:</Text>
                <TextInput style={styles.modalInput} placeholderTextColor="#94A3B8" value={editSector} onChangeText={setEditSector} />
                
                <Text style={styles.subModalLabel}>Descripción de la Actividad:</Text>
                <TextInput style={[styles.modalInput, styles.textAreaInput]} placeholderTextColor="#94A3B8" value={editDescription} onChangeText={setEditDescription} multiline />

                <TouchableOpacity style={styles.saveBtn} onPress={handleUpdateLog} disabled={isSaving || isUploadingPhoto}>
                  {isSaving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Guardar Cambios en Bitácora</Text>}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <TouchableOpacity style={styles.fab} onPress={handleAddNewLog}>
        <Feather name="plus" size={28} color="#FFF" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F8' },
  header: { backgroundColor: '#2563EB', paddingTop: 60, paddingBottom: 25, paddingHorizontal: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 },
  backButton: { padding: 4, marginLeft: -4 },
  headerSubtitle: { color: 'rgba(255, 255, 255, 0.8)', fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  headerBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: '#FFF', fontSize: 26, fontWeight: 'bold' },
  body: { padding: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#6B7280', letterSpacing: 0.5 },
  chartCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 20, marginBottom: 25, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3 },
  chartRow: { marginBottom: 16 },
  chartTextRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  chartLabel: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
  chartValue: { fontSize: 14, fontWeight: 'bold' },
  chartBarBackground: { height: 8, backgroundColor: '#E5E7EB', borderRadius: 4, overflow: 'hidden' },
  chartBarFill: { height: '100%', borderRadius: 4 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 5, marginBottom: 15 },
  pdfButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#DC2626', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10 },
  saveButtonText: { color: '#FFF', fontSize: 12, fontWeight: 'bold', marginLeft: 4 },
  entryCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 18, marginBottom: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  entryCardPending: { borderWidth: 1, borderColor: '#FCD34D', backgroundColor: '#FFFBEB' },
  entryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  entryTitle: { flex: 1, fontSize: 16, fontWeight: 'bold', color: '#111827', marginRight: 10, lineHeight: 22 },
  photoBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  photoCount: { marginLeft: 4, fontSize: 12, fontWeight: 'bold', color: '#6B7280' },
  entryMetaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  entryMetaText: { fontSize: 13, color: '#6B7280', marginLeft: 4, fontWeight: '500' },
  entryMetaDot: { fontSize: 12, color: '#9CA3AF', marginHorizontal: 8 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primaryTag: { backgroundColor: '#EFF6FF', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16 },
  primaryTagText: { color: '#2563EB', fontSize: 12, fontWeight: '700' },
  secondaryTag: { backgroundColor: '#F3F4F6', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16 },
  secondaryTagText: { color: '#4B5563', fontSize: 12, fontWeight: '600' },
  emptyState: { padding: 20, alignItems: 'center' },
  emptyStateText: { color: '#9CA3AF', fontStyle: 'italic', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFF', borderRadius: 24, padding: 22 },
  modalInput: { backgroundColor: '#F1F5F9', borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0', color: '#1E293B' },
  saveBtn: { backgroundColor: '#2563EB', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  saveBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  subModalLabel: { fontSize: 12, fontWeight: '700', color: '#475569', marginTop: 8, marginBottom: 5 },
  textAreaInput: { height: 90, textAlignVertical: 'top' },
  fab: { position: 'absolute', bottom: 30, right: 25, backgroundColor: '#2563EB', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: '#2563EB', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1E293B', marginBottom: 15 },
  
  detailModalContent: { backgroundColor: '#FFF', borderRadius: 24, padding: 22, maxHeight: '85%' },
  detailModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  detailCategory: { fontSize: 14, fontWeight: '900', color: '#2563EB', textTransform: 'uppercase', letterSpacing: 0.5 },
  closeDetailBtn: { padding: 4, backgroundColor: '#F1F5F9', borderRadius: 50 },
  noImagePlaceholder: { width: '100%', height: 160, backgroundColor: '#F1F5F9', borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 15, borderStyle: 'dashed', borderWidth: 1, borderColor: '#CBD5E1' },
  noImageText: { fontSize: 12, color: '#64748B', fontWeight: '600', marginTop: 6 },
  detailMetaBlock: { backgroundColor: '#F8FAFC', borderRadius: 16, padding: 12, marginBottom: 15, borderWidth: 1, borderColor: '#E2E8F0' },
  metaLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  detailMetaLabel: { fontSize: 12, fontWeight: 'bold', color: '#475569', marginLeft: 6 },
  detailMetaValue: { fontSize: 14, fontWeight: '600', color: '#0F172A', marginLeft: 20 },
  detailSubTitle: { fontSize: 11, fontWeight: '900', color: '#94A3B8', marginBottom: 6, letterSpacing: 0.5 },
  detailDescriptionText: { fontSize: 15, color: '#334155', lineHeight: 22, fontWeight: '500', marginBottom: 20 },
  detailActionsRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  detailActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 12, gap: 6 },
  editBtn: { backgroundColor: '#475569' },
  deleteBtn: { backgroundColor: '#EF4444' },
  detailActionBtnText: { color: '#FFF', fontSize: 13, fontWeight: 'bold' },

  photoPickerRowContainer: { flexDirection: 'row', marginBottom: 12 },
  mediaPickerTriggerBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFF6FF', padding: 12, borderRadius: 14, borderStyle: 'solid', borderWidth: 1, borderColor: '#BFDBFE', gap: 8 },
  mediaPickerTriggerText: { color: '#2563EB', fontSize: 13, fontWeight: '700' },

  // --- NUEVOS ESTILOS OPTIMIZADOS PARA EL MULTI-FOTO ---
  detailImageCarouselItem: { width: 330, height: 200, borderRadius: 16, marginRight: 10 },
  thumbnailContainerRow: { position: 'relative', marginRight: 10, marginVertical: 4 },
  editThumbnailItem: { width: 70, height: 70, borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1' },
  removeThumbnailBadgeBtn: { position: 'absolute', top: -4, right: -4, backgroundColor: '#EF4444', width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center' }
});