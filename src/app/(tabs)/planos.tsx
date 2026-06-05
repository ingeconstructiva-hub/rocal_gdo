import { Feather } from '@expo/vector-icons';
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print'; // <-- Nueva librería para PDF
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';
// 1. IMPORTAMOS LA MEMORIA GLOBAL DE PROYECTOS
import { useProject } from '../../context/ProjectContext';

export default function DocumentosScreen() {
  const router = useRouter();
  
  // 2. EXTRAEMOS LA OBRA ACTIVA
  const { activeProject } = useProject();
  
  const [scannedImages, setScannedImages] = useState<string[]>([]);
  const [docTitle, setDocTitle] = useState('');
  const [docCategory, setDocCategory] = useState('Plano'); 
  const [isUploading, setIsUploading] = useState(false);
  const [documentosList, setDocumentosList] = useState<any[]>([]);

  const categories = ['Plano', 'Permiso', 'Factura', 'Contrato', 'Otro'];

  // 3. RECARGAMOS CADA VEZ QUE LA OBRA CAMBIA
  useFocusEffect(
    useCallback(() => {
      if (activeProject?.id) {
        loadDocumentos();
      }
    }, [activeProject])
  );

  const loadDocumentos = async () => {
    const { data, error } = await supabase
      .from('planos') 
      .select('*')
      .eq('project_id', activeProject?.id) // <-- FILTRO: SOLO DOCUMENTOS DE ESTA OBRA
      .order('created_at', { ascending: false });
      
    if (data) setDocumentosList(data);
    if (error) console.log("Error cargando documentos:", error.message);
  };

  const handleScanDocument = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'Se requiere acceso a la cámara.');
        return;
      }

      let result = await ImagePicker.launchCameraAsync({
        allowsEditing: true, 
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setScannedImages(prev => [...prev, result.assets[0].uri]);
      }
    } catch (error) {
      console.error("Error al abrir cámara:", error);
      Alert.alert("Error", "No se pudo abrir la cámara.");
    }
  };

  const removeImage = (indexToRemove: number) => {
    setScannedImages(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  const handleSaveToDatabase = async () => {
    if (scannedImages.length === 0) return;
    if (!docTitle.trim()) {
      Alert.alert("Falta título", "Por favor ingresa un nombre para identificar este documento.");
      return;
    }
    
    if (!activeProject?.id) {
      Alert.alert("Error", "No se detectó una obra activa.");
      return;
    }

    setIsUploading(true);
    try {
      // 1. GENERAR EL PDF CON TODAS LAS FOTOS
      let htmlImages = '';
      for (const imgUri of scannedImages) {
        const base64Img = await FileSystem.readAsStringAsync(imgUri, { encoding: 'base64' });
        htmlImages += `
          <div class="page">
            <img src="data:image/jpeg;base64,${base64Img}" />
          </div>`;
      }

      const htmlContent = `
        <html>
          <head>
            <style>
              @page { margin: 0px; }
              body { margin: 0; padding: 0; background-color: #f0f0f0; }
              .page { width: 100vw; height: 100vh; page-break-after: always; display: flex; justify-content: center; align-items: center; background-color: white; }
              img { max-width: 100%; max-height: 100%; object-fit: contain; }
            </style>
          </head>
          <body>
            ${htmlImages}
          </body>
        </html>
      `;

      // Creamos el archivo PDF temporal
      const { uri: pdfUri } = await Print.printToFileAsync({ html: htmlContent });

      // 2. SUBIR EL PDF A SUPABASE
      const base64Pdf = await FileSystem.readAsStringAsync(pdfUri, { encoding: 'base64' });
      const arrayBuffer = decode(base64Pdf);
      const fileName = `doc_${Date.now()}.pdf`; 

      const { error: uploadError } = await supabase.storage
        .from('planos_obras') 
        .upload(fileName, arrayBuffer, { contentType: 'application/pdf' }); 

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('planos_obras')
        .getPublicUrl(fileName);
      const finalImageUrl = publicUrlData.publicUrl;

      // 3. GUARDAR EN LA BASE DE DATOS (AHORA VINCULADO AL PROJECTO)
      const { error: dbError } = await supabase.from('planos').insert([
        { 
          title: docTitle, 
          category: docCategory, 
          version: 'v1.0', 
          file_url: finalImageUrl,
          project_id: activeProject.id // <-- VINCULO SÚPER IMPORTANTE
        }
      ]);

      if (dbError) throw dbError;

      Alert.alert("¡Éxito!", "Documento de múltiples páginas generado y guardado.");
      setScannedImages([]);
      setDocTitle('');
      setDocCategory('Plano'); 
      loadDocumentos(); 

    } catch (error: any) {
      console.error("Error al subir:", error);
      Alert.alert("Error", error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleViewDocument = async (url: string) => {
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert("Error", "No se pudo abrir el enlace.");
    }
  };

  const handleDeleteDocument = (id: number, fileUrl: string) => {
    Alert.alert(
      "Eliminar Documento",
      "¿Estás seguro de que quieres eliminar este archivo?",
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Eliminar", 
          style: "destructive", 
          onPress: async () => {
            try {
              const { error: dbError } = await supabase.from('planos').delete().eq('id', id);
              if (dbError) throw dbError;

              if (fileUrl) {
                const fileName = fileUrl.split('/').pop(); 
                if (fileName) {
                  await supabase.storage.from('planos_obras').remove([fileName]);
                }
              }
              loadDocumentos(); 
            } catch (error: any) {
              Alert.alert("Error", error.message);
            }
          } 
        }
      ]
    );
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Plano': return 'map';
      case 'Permiso': return 'shield';
      case 'Factura': return 'dollar-sign';
      case 'Contrato': return 'edit-3';
      default: return 'file-text';
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="chevron-left" size={28} color="#FFF" />
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerSubtitle}>{activeProject?.name?.toUpperCase() || 'MÓDULO DE CONTROL'}</Text>
          <Text style={styles.headerTitle}>Documentación</Text>
        </View>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        
        {scannedImages.length === 0 ? (
          <TouchableOpacity style={styles.scanButton} onPress={handleScanDocument}>
            <Feather name="camera" size={32} color="#FFF" />
            <View style={styles.scanButtonTextContainer}>
              <Text style={styles.scanButtonTitle}>Digitalizar Documento</Text>
              <Text style={styles.scanButtonSub}>Usa la cámara para crear un PDF</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.previewContainer}>
            <Text style={styles.sectionTitle}>Páginas del Documento ({scannedImages.length})</Text>
            
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 15 }}>
              {scannedImages.map((uri, index) => (
                <View key={index} style={styles.thumbnailContainer}>
                  <Image source={{ uri }} style={styles.thumbnailImage} resizeMode="cover" />
                  <TouchableOpacity style={styles.removeBtn} onPress={() => removeImage(index)}>
                    <Feather name="x" size={16} color="#FFF" />
                  </TouchableOpacity>
                  <Text style={styles.pageNumber}>Pág {index + 1}</Text>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity style={styles.addPageBtn} onPress={handleScanDocument} disabled={isUploading}>
              <Feather name="plus-circle" size={20} color="#2563EB" />
              <Text style={styles.addPageBtnText}>Agregar otra página</Text>
            </TouchableOpacity>
            
            <Text style={styles.label}>Nombre del Documento *</Text>
            <TextInput 
              style={styles.input} 
              placeholder="Ej. Contrato de Obra..." 
              value={docTitle} 
              onChangeText={setDocTitle} 
              placeholderTextColor="#6B7280" 
            />

            <Text style={styles.label}>Categoría</Text>
            <View style={styles.categoryContainer}>
              {categories.map((cat) => (
                <TouchableOpacity 
                  key={cat} 
                  style={[styles.categoryBadge, docCategory === cat && styles.categoryBadgeActive]}
                  onPress={() => setDocCategory(cat)}
                >
                  <Text style={[styles.categoryText, docCategory === cat && styles.categoryTextActive]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity 
              style={[styles.saveButton, isUploading && styles.saveButtonDisabled]} 
              onPress={handleSaveToDatabase}
              disabled={isUploading}
            >
              {isUploading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Feather name="upload-cloud" size={20} color="#FFF" />
                  <Text style={styles.saveButtonText}>Generar PDF y Guardar</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelButton} onPress={() => setScannedImages([])} disabled={isUploading}>
              <Text style={styles.cancelButtonText}>Descartar Todo</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.listContainer}>
          <Text style={styles.sectionTitle}>Archivos del Proyecto</Text>
          
          {documentosList.length === 0 ? (
            <View style={styles.emptyState}>
              <Feather name="folder" size={40} color="#CBD5E1" />
              <Text style={styles.emptyStateText}>Aún no hay documentos guardados</Text>
            </View>
          ) : (
            documentosList.map((doc, index) => (
              <View key={index} style={styles.planoCard}>
                <View style={styles.planoIconContainer}>
                  <Feather name={getCategoryIcon(doc.category) as any} size={24} color="#2563EB" />
                </View>
                <View style={styles.planoInfo}>
                  <Text style={styles.planoTitle}>{doc.title}</Text>
                  <Text style={styles.planoSub}>{doc.category || 'General'} • PDF</Text>
                </View>
                
                <View style={styles.actionButtonsContainer}>
                  <TouchableOpacity style={styles.iconButton} onPress={() => handleViewDocument(doc.file_url)}>
                    <Feather name="file-text" size={20} color="#2563EB" />
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.iconButton, { marginLeft: 10 }]} onPress={() => handleDeleteDocument(doc.id, doc.file_url)}>
                    <Feather name="trash-2" size={20} color="#DC2626" />
                  </TouchableOpacity>
                </View>

              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { backgroundColor: '#2563EB', paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center' },
  backButton: { marginRight: 15, padding: 5 },
  headerTextContainer: { flexDirection: 'column' },
  headerSubtitle: { color: 'rgba(255, 255, 255, 0.7)', fontSize: 12, fontWeight: '600', letterSpacing: 1 },
  headerTitle: { color: '#FFF', fontSize: 22, fontWeight: 'bold' },
  body: { padding: 20 },
  scanButton: { backgroundColor: '#059669', borderRadius: 16, padding: 24, flexDirection: 'row', alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, marginBottom: 30 },
  scanButtonTextContainer: { marginLeft: 15, flex: 1 },
  scanButtonTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  scanButtonSub: { color: '#D1FAE5', fontSize: 13, marginTop: 4 },
  previewContainer: { backgroundColor: '#FFF', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 30 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 15 },
  
  thumbnailContainer: { marginRight: 15, position: 'relative', alignItems: 'center' },
  thumbnailImage: { width: 100, height: 140, borderRadius: 10, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  removeBtn: { position: 'absolute', top: -8, right: -8, backgroundColor: '#DC2626', borderRadius: 12, padding: 4 },
  pageNumber: { marginTop: 6, fontSize: 12, color: '#6B7280', fontWeight: 'bold' },
  
  addPageBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: '#EFF6FF', padding: 12, borderRadius: 10, marginBottom: 20, borderWidth: 1, borderColor: '#BFDBFE', borderStyle: 'dashed' },
  addPageBtnText: { color: '#2563EB', fontWeight: 'bold', marginLeft: 8 },

  label: { fontSize: 14, color: '#4B5563', fontWeight: 'bold', marginBottom: 8 },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 12, fontSize: 16, marginBottom: 20},
  categoryContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 25 },
  categoryBadge: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  categoryBadgeActive: { backgroundColor: '#EFF6FF', borderColor: '#2563EB' },
  categoryText: { color: '#6B7280', fontSize: 14, fontWeight: '500' },
  categoryTextActive: { color: '#2563EB', fontWeight: 'bold' },
  saveButton: { backgroundColor: '#2563EB', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 16, borderRadius: 12, marginBottom: 10 },
  saveButtonDisabled: { backgroundColor: '#9CA3AF' },
  saveButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 16, marginLeft: 10 },
  cancelButton: { padding: 15, alignItems: 'center' },
  cancelButtonText: { color: '#DC2626', fontWeight: 'bold', fontSize: 15 },
  listContainer: { flex: 1, marginTop: 10 },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, backgroundColor: '#FFF', borderRadius: 16, borderStyle: 'dashed', borderWidth: 2, borderColor: '#E5E7EB' },
  emptyStateText: { marginTop: 10, color: '#9CA3AF', fontSize: 14 },
  planoCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 15, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#F3F4F6' },
  planoIconContainer: { backgroundColor: '#EFF6FF', padding: 12, borderRadius: 12, marginRight: 15 },
  planoInfo: { flex: 1 },
  planoTitle: { fontSize: 16, fontWeight: 'bold', color: '#1F2937', marginBottom: 4 },
  planoSub: { fontSize: 13, color: '#6B7280' },
  actionButtonsContainer: { flexDirection: 'row', alignItems: 'center' },
  iconButton: { padding: 8, backgroundColor: '#F3F4F6', borderRadius: 8 }
});