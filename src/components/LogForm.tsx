import { Feather } from '@expo/vector-icons';
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { supabase } from '../lib/supabase';

export function LogForm() {
  const defaultCategories = ['Estructura', 'Concreto', 'Eléctrico', 'Seguridad', 'Acabados', 'General'];
  
  const [note, setNote] = useState('');
  const [category, setCategory] = useState('Estructura');
  const [sector, setSector] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [customCategory, setCustomCategory] = useState('');
  const [categoriesList, setCategoriesList] = useState(defaultCategories);

  const router = useRouter();
  const [imageUris, setImageUris] = useState<string[]>([]);

  // Variable que verifica si la nota tiene texto (para habilitar el botón)
  const isFormValid = note.trim().length > 0;

  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        alert('Se requiere permiso para acceder a la cámara.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setImageUris(prev => [...prev, result.assets[0].uri]);
      }
    } catch (error) {
      console.error("Error al abrir cámara:", error);
      alert("No se pudo abrir la cámara.");
    }
  };

  const removeImage = (indexToRemove: number) => {
    setImageUris(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  const handleAddCustomCategory = () => {
    const newCat = customCategory.trim();
    if (newCat !== '') {
      if (!categoriesList.includes(newCat)) {
        setCategoriesList([...categoriesList, newCat]);
      }
      setCategory(newCat);
    }
    setIsCustom(false);
    setCustomCategory('');
  };

  const handleDeleteCategory = (catToDelete: string) => {
    setCategoriesList(prev => prev.filter(c => c !== catToDelete));
    if (category === catToDelete) {
      setCategory('Estructura');
    }
  };

  const handleSave = async () => {
    if (!isFormValid) return;

    let finalImageUrls: string[] = [];
    
    if (imageUris.length > 0) {
      try {
        for (const imageUri of imageUris) {
          // ✅ NUEVO MÉTODO A PRUEBA DE FALLOS ✅
          // 1. Leemos la imagen como código base64
          const base64 = await FileSystem.readAsStringAsync(imageUri, { 
            encoding: 'base64' 
          });
          
          // 2. Lo convertimos al formato binario que Supabase entiende
          const arrayBuffer = decode(base64);
          
          const fileName = `foto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
          
          // 3. Subimos indicando explícitamente que es una imagen JPEG
          const { error: uploadError } = await supabase.storage
            .from('foto_bitacora')
            .upload(fileName, arrayBuffer, { contentType: 'image/jpeg' });
            
          if (uploadError) throw uploadError;
          
          const { data } = supabase.storage.from('foto_bitacora').getPublicUrl(fileName);
          finalImageUrls.push(data.publicUrl);
        }
      } catch (error: any) {
        console.error("Error detallado al subir:", error);
        return alert(`Error al subir imagen: ${error.message}`);
      }
    }

    const photoPayload = finalImageUrls.length === 0
      ? null
      : finalImageUrls.length === 1
        ? finalImageUrls[0]
        : JSON.stringify(finalImageUrls);

    const { error } = await supabase.from('logs').insert([{ 
      description: note, 
      category, 
      sector, 
      photo_url: photoPayload 
    }]);
    
    if (error) alert(`Error al guardar: ${error.message}`);
    else { alert('Guardado con éxito'); router.replace('/(tabs)'); }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={{ flex: 1 }}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <Stack.Screen options={{ headerShown: false }} />
        
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Feather name="chevron-left" size={28} color="#FFF" />
          </TouchableOpacity>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerSubtitle}>BITÁCORA DE OBRA</Text>
            <Text style={styles.headerTitle}>Nueva Entrada</Text>
          </View>
        </View>

        <ScrollView 
          style={styles.container} 
          contentContainerStyle={{ paddingBottom: 150 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.previewContainer}>
            <TouchableOpacity style={styles.scanButton} onPress={handlePickImage}>
              <Feather name="camera" size={32} color="#FFF" />
              <View style={styles.scanButtonTextContainer}>
                <Text style={styles.scanButtonTitle}>Agregar fotos</Text>
                <Text style={styles.scanButtonSub}>Toma varias imágenes para el registro</Text>
              </View>
            </TouchableOpacity>

            {imageUris.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Fotos ({imageUris.length})</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 15 }}>
                  {imageUris.map((uri, index) => (
                    <View key={`${uri}-${index}`} style={styles.thumbnailContainer}>
                      <Image source={{ uri }} style={styles.thumbnailImage} />
                      <TouchableOpacity
                        style={styles.removeBtn}
                        onPress={() => removeImage(index)}
                      >
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
            <TextInput 
              style={styles.textArea} 
              placeholder="Describe el avance..." 
              multiline 
              value={note} 
              onChangeText={setNote}
              returnKeyType="done"
              placeholderTextColor="#6B7280"
              blurOnSubmit={true}
              onSubmitEditing={() => Keyboard.dismiss()} // <-- ESTO CIERRA EL TECLADO AL DARLE A "LISTO"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Categoría</Text>
            <View style={styles.categoryContainer}>
              {categoriesList.map((cat) => {
                const isDefault = defaultCategories.includes(cat);
                return (
                  <TouchableOpacity 
                    key={cat} 
                    style={[styles.categoryBadge, category === cat && styles.categoryBadgeActive]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text style={[styles.categoryText, category === cat && styles.categoryTextActive]}>{cat}</Text>
                    
                    {!isDefault && (
                      <TouchableOpacity 
                        onPress={() => handleDeleteCategory(cat)} 
                        style={styles.deleteCategoryBtn}
                      >
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
                  <TextInput
                    style={styles.customInput}
                    placeholder="Nueva..."
                    value={customCategory}
                    onChangeText={setCustomCategory}
                    onSubmitEditing={handleAddCustomCategory}
                    autoFocus
                  />
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
              <TextInput 
                style={styles.locationInput} 
                placeholder="Ej. Nivel 2..." 
                value={sector} 
                onChangeText={setSector} 
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()} // <-- TAMBIÉN AQUÍ
              />
            </View>
          </View>

          {/* BOTÓN INTELIGENTE: Cambia de estilo y estado si no hay texto */}
          <TouchableOpacity 
            style={[styles.saveButton, !isFormValid && styles.saveButtonDisabled]} 
            onPress={handleSave}
            disabled={!isFormValid}
          >
            <Text style={[styles.saveButtonText, !isFormValid && styles.saveButtonTextDisabled]}>
              Guardar en bitácora
            </Text>
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
  scanButton: { backgroundColor: '#059669', borderRadius: 16, padding: 24, flexDirection: 'row', alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, marginBottom: 20 },
  scanButtonTextContainer: { marginLeft: 15, flex: 1 },
  scanButtonTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  scanButtonSub: { color: '#D1FAE5', fontSize: 13, marginTop: 4 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 15 },
  thumbnailContainer: { marginRight: 15, position: 'relative', alignItems: 'center' },
  thumbnailImage: { width: 100, height: 140, borderRadius: 10, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  removeBtn: { position: 'absolute', top: -8, right: -8, backgroundColor: '#DC2626', borderRadius: 12, padding: 4 },
  inputGroup: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#F3F4F6' },
  label: { fontSize: 14, color: '#9CA3AF', marginBottom: 10, fontWeight: "bold" },
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
  
  // ESTILOS DEL BOTÓN INTELIGENTE
  saveButton: { backgroundColor: '#2563EB', alignItems: 'center', padding: 16, borderRadius: 12, marginBottom: 20 },
  saveButtonDisabled: { backgroundColor: '#E5E7EB' }, // Color gris cuando está bloqueado
  saveButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  saveButtonTextDisabled: { color: '#9CA3AF' }, // Texto gris más oscuro cuando está bloqueado
  
  photoText: { marginTop: 10, fontWeight: 'bold', color: '#111827' }
});