'use client';

import { Feather } from '@expo/vector-icons';
import Almacen from '../lib/almacen';
import { decode } from 'base64-arraybuffer';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { guardarArchivoLocal, leerComoBase64 } from '../lib/archivos';
import { Aviso } from '../lib/aviso';
import { useProject } from '../context/ProjectContext';
import { supabase } from '../lib/supabase';

export function LogForm() {
  const { activeProject, isOffline } = useProject();

  const defaultCategories = ['Estructura', 'Concreto', 'Eléctrico', 'Seguridad', 'Acabados', 'General'];
  
  const [note, setNote] = useState('');
  const [category, setCategory] = useState('Estructura');
  const [sector, setSector] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [customCategory, setCustomCategory] = useState('');
  const [categoriesList, setCategoriesList] = useState(defaultCategories);
  const [isSavingInProgress, setIsSavingInProgress] = useState(false);

  const router = useRouter();
  const [imageUris, setImageUris] = useState<string[]>([]);
  const isFormValid = note.trim().length > 0;

  // 📸 FUNCIÓN PARA CAPTURAR NUEVA IMAGEN CON LA CÁMARA
  const takePhotoWithCamera = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Aviso.alert('Permiso requerido', 'Se requiere permiso para acceder a la cámara.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({ 
        allowsEditing: false, // 🟢 CORREGIDO: Foto completa de campo en cámara sin recorte
        quality: 0.6 
      });
      
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setImageUris(prev => [...prev, result.assets[0].uri]);
      }
    } catch (error) {
      Aviso.alert("Error", "No se pudo abrir la cámara.");
    }
  };

  // 🖼️ FUNCIÓN PARA SELECCIONAR IMAGEN EXISTENTE DESDE LA GALERÍA
  const pickImageFromGallery = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Aviso.alert('Permiso requerido', 'Se requiere permiso para acceder a la galería.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false, // 🟢 CORREGIDO: Foto panorámica de galería sin chocar en Android
        quality: 0.6
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setImageUris(prev => [...prev, result.assets[0].uri]);
      }
    } catch (error) {
      Aviso.alert("Error", "No se pudo abrir la galería de imágenes.");
    }
  };

  // 🟢 COMPORTAMIENTO MULTIMEDIA: SE DESPLIEGA MENÚ SELECCIONABLE HÍBRIDO
  const handleMediaMenuTrigger = () => {
    Aviso.alert(
      "Adjuntar Evidencia",
      "Selecciona el origen de la fotografía para la bitácora:",
      [
        { text: "📸 Tomar Foto (Cámara)", onPress: takePhotoWithCamera },
        { text: "🖼️ Elegir de la Galería", onPress: pickImageFromGallery },
        { text: "Cancelar", style: "cancel" }
      ]
    );
  };

  const removeImage = (indexToRemove: number) => {
    setImageUris(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  const handleAddCustomCategory = () => {
    const newCat = customCategory.trim();
    if (newCat !== '') {
      if (!categoriesList.includes(newCat)) setCategoriesList([...categoriesList, newCat]);
      setCategory(newCat);
    }
    setIsCustom(false);
    setCustomCategory('');
  };

  const handleDeleteCategory = (catToDelete: string) => {
    setCategoriesList(prev => prev.filter(c => c !== catToDelete));
    if (category === catToDelete) setCategory('Estructura');
  };

  const handleSave = async () => {
    const projectId = activeProject?.id;

    if (!isFormValid) return;

    if (!projectId) {
      Aviso.alert('Error', 'No se detectó ninguna obra activa.');
      return;
    }

    setIsSavingInProgress(true);

    // 🔴 SI NO HAY INTERNET: MODO BANDEJA DE SALIDA (GUARDA LOCAL)
    if (isOffline) {
      try {
        // Las fotos se guardan aparte, como archivos. Antes se metían como
        // texto base64 dentro del propio registro, y así terminaban guardadas
        // dentro de la columna photo_url de la base de datos en vez de subirse
        // al almacén de archivos.
        const fotosLocales: string[] = [];
        for (const imageUri of imageUris) {
          fotosLocales.push(await guardarArchivoLocal(imageUri));
        }

        const offlineLog = {
          project_id: projectId,
          description: note,
          category,
          sector,
          photo_url: null,
          fotos_locales: fotosLocales,
          created_at: new Date().toISOString(),
          local_uuid: Crypto.randomUUID()
        };

        const existing = await Almacen.getItem('@bandeja_salida_logs');
        const outbox = existing ? JSON.parse(existing) : [];
        outbox.push(offlineLog);
        await Almacen.setItem('@bandeja_salida_logs', JSON.stringify(outbox));

        Aviso.alert("📴 Guardado Offline", "Tu reporte se guardó en el celular. Se subirá automáticamente cuando vuelva el internet.");
        router.replace('/(tabs)/bitacora');
      } catch (error) {
        Aviso.alert("Error", "Error guardando offline");
      } finally {
        setIsSavingInProgress(false);
      }
      return; 
    }

    // 🟢 SI SÍ HAY INTERNET: MODO NORMAL EN LA NUBE
    let finalImageUrls: string[] = [];
    if (imageUris.length > 0) {
      try {
        for (const imageUri of imageUris) {
          // leerComoBase64 funciona igual en celular y en navegador.
          const base64 = await leerComoBase64(imageUri);
          const arrayBuffer = decode(base64);
          const fileName = `foto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
          
          const { error: uploadError } = await supabase.storage.from('foto_bitacora').upload(fileName, arrayBuffer, { contentType: 'image/jpeg' });
          if (uploadError) throw uploadError;
          
          const { data } = supabase.storage.from('foto_bitacora').getPublicUrl(fileName);
          finalImageUrls.push(data.publicUrl);
        }
      } catch (error: any) {
        setIsSavingInProgress(false);
        return Aviso.alert('Error Storage', `Error al subir imagen: ${error.message}`);
      }
    }

    const photoPayload = finalImageUrls.length === 0 ? null : JSON.stringify(finalImageUrls);

    try {
      const { error } = await supabase.from('logs').insert([{ 
        project_id: projectId, 
        description: note, 
        category, 
        sector, 
        photo_url: photoPayload 
      }]);
      
      if (error) throw error;
      
      Aviso.alert('¡Éxito!', 'Guardado con éxito en la nube'); 
      router.replace('/(tabs)/bitacora'); 
    } catch (error: any) {
      Aviso.alert('Error Database', `Error al guardar: ${error.message}`);
    } finally {
      setIsSavingInProgress(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }} keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}>
      <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <Stack.Screen options={{ headerShown: false }} />
        
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Feather name="chevron-left" size={28} color="#FFF" />
          </TouchableOpacity>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerSubtitle}>{activeProject?.name?.toUpperCase() || 'BITÁCORA DE OBRA'}</Text>
            <Text style={styles.headerTitle}>Nueva Entrada</Text>
          </View>
        </View>

        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 150 }} keyboardShouldPersistTaps="handled">
          
          {isOffline && (
            <View style={styles.offlineBanner}>
              <Feather name="wifi-off" size={20} color="#D97706" style={{ marginRight: 10 }} />
              <Text style={{ color: '#D97706', fontSize: 13, flex: 1, fontWeight: '600' }}>
                Estás trabajando sin conexión. Las fotos y notas se guardarán en tu celular por ahora.
              </Text>
            </View>
          )}

          <View style={styles.previewContainer}>
            {/* 🟢 LLAMADA AL MENÚ DE SELECCIÓN DE IMÁGENES */}
            <TouchableOpacity style={[styles.scanButton, isOffline && { backgroundColor: '#D97706' }]} onPress={handleMediaMenuTrigger}>
              <Feather name="plus-circle" size={32} color="#FFF" />
              <View style={styles.scanButtonTextContainer}>
                <Text style={styles.scanButtonTitle}>Agregar Evidencia</Text>
                <Text style={styles.scanButtonSub}>Toma fotos de campo o carga desde la galería</Text>
              </View>
            </TouchableOpacity>

            {imageUris.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Fotos adjuntadas ({imageUris.length})</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 15 }}>
                  {imageUris.map((uri, index) => (
                    <View key={`${uri}-${index}`} style={styles.thumbnailContainer}>
                      <Image source={{ uri }} style={styles.thumbnailImage} />
                      <TouchableOpacity style={styles.removeBtn} onPress={() => removeImage(index)}>
                        <Feather name="x" size={16} color="#FFF" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              </>
            )}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nota de campo *</Text>
            <TextInput style={styles.textArea} placeholder="Describe el avance..." multiline value={note} onChangeText={setNote} returnKeyType="done" placeholderTextColor="#6B7280" blurOnSubmit={true} onSubmitEditing={() => Keyboard.dismiss()} />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Concepto *</Text>
            <View style={styles.categoryContainer}>
              {categoriesList.map((cat) => {
                const isDefault = defaultCategories.includes(cat);
                return (
                  <TouchableOpacity key={cat} style={[styles.categoryBadge, category === cat && styles.categoryBadgeActive]} onPress={() => setCategory(cat)}>
                    <Text style={[styles.categoryText, category === cat && styles.categoryTextActive]}>{cat}</Text>
                    {!isDefault && (
                      <TouchableOpacity onPress={() => handleDeleteCategory(cat)} style={styles.deleteCategoryBtn}>
                        <Feather name="x" size={14} color={category === cat ? "#2563EB" : "#EF4444"} />
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                );
              })}
              
              {!isCustom ? (
                <TouchableOpacity style={styles.categoryBadge} onPress={() => setIsCustom(true)}>
                  <Feather name="plus" size={14} color="#6B7280" />
                  <Text style={styles.categoryText}> Otra</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.customCategoryContainer}>
                  <TextInput style={styles.customInput} placeholder="Nueva..." value={customCategory} onChangeText={setCustomCategory} onSubmitEditing={handleAddCustomCategory} autoFocus />
                  <TouchableOpacity onPress={handleAddCustomCategory} style={styles.addCustomBtn}>
                    <Feather name="check" size={16} color="#FFF" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Sector / Ubicación</Text>
            <View style={styles.locationInputContainer}>
              <Feather name="map-pin" size={18} color="#6B7280" style={{ marginRight: 10 }} />
              <TextInput style={styles.locationInput} placeholder="Ej. Nivel 2..." value={sector} onChangeText={setSector} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
            </View>
          </View>

          <TouchableOpacity style={[styles.saveButton, (!isFormValid || isSavingInProgress) && styles.saveButtonDisabled, isOffline && isFormValid && { backgroundColor: '#D97706' }]} onPress={handleSave} disabled={!isFormValid || isSavingInProgress}>
            {isSavingInProgress ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Text style={[styles.saveButtonText, !isFormValid && styles.saveButtonTextDisabled]}>
                {isOffline ? 'Guardar Reporte Offline' : 'Guardar en bitácora'}
              </Text>
            )}
          </TouchableOpacity>

        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: '#2563EB', paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center' },
  backButton: { marginRight: 15, padding: 5 },
  headerTextContainer: { flexDirection: 'column' },
  headerSubtitle: { color: 'rgba(255, 255, 255, 0.7)', fontSize: 12, fontWeight: '600', letterSpacing: 1 },
  headerTitle: { color: '#FFF', fontSize: 22, fontWeight: 'bold' },
  container: { flex: 1, padding: 20 },
  previewContainer: { backgroundColor: '#FFF', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 30 },
  scanButton: { backgroundColor: '#059669', borderRadius: 16, padding: 24, flexDirection: 'row', alignItems: 'center', elevation: 4, boxShadow: '0px 2px 0px rgba(0, 0, 0, 0.1)',    marginBottom: 20 },
  scanButtonTextContainer: { marginLeft: 15, flex: 1 },
  scanButtonTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  scanButtonSub: { color: '#D1FAE5', fontSize: 13, marginTop: 4 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 15 },
  thumbnailContainer: { marginRight: 15, position: 'relative', alignItems: 'center' },
  thumbnailImage: { width: 100, height: 140, borderRadius: 10, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  removeBtn: { position: 'absolute', top: -8, right: -8, backgroundColor: '#DC2626', borderRadius: 12, padding: 4 },
  inputGroup: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#F3F4F6' },
  label: { fontSize: 14, color: '#6B7280', marginBottom: 10, fontWeight: "bold" },
  textArea: { height: 100, textAlignVertical: 'top', fontSize: 16 },
  categoryContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryBadge: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  categoryBadgeActive: { backgroundColor: '#EFF6FF', borderColor: '#2563EB' },
  categoryText: { color: '#6B7280', fontSize: 14, fontWeight: '500' },
  categoryTextActive: { color: '#2563EB', fontWeight: 'bold' },
  deleteCategoryBtn: { marginLeft: 6, padding: 2 },
  customCategoryContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 20, paddingLeft: 12, paddingRight: 4, paddingVertical: 4, borderWidth: 1, borderColor: '#2563EB' },
  customInput: { flex: 1, minWidth: 80, fontSize: 14, color: '#111827' },
  addCustomBtn: { backgroundColor: '#2563EB', padding: 6, borderRadius: 15, marginLeft: 8 },
  locationInputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 12, paddingHorizontal: 15 },
  locationInput: { flex: 1, paddingVertical: 12, color: '#111827', fontSize: 16 },
  saveButton: { backgroundColor: '#2563EB', alignItems: 'center', padding: 16, borderRadius: 12, marginBottom: 20 },
  saveButtonDisabled: { backgroundColor: '#E5E7EB' },
  saveButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  saveButtonTextDisabled: { color: '#9CA3AF' },
  offlineBanner: { backgroundColor: '#FEF3C7', padding: 12, borderRadius: 12, marginBottom: 20, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#F59E0B' }
});