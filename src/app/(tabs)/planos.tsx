import { Feather } from '@expo/vector-icons';
import Almacen from '../../lib/almacen';
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Linking, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRefrescar } from '../../lib/refrescar';
import { SkeletonLista } from '../../components/Skeleton';
import { SinDatos } from '../../components/SinDatos';
import { SelectorCategoria } from '../../components/SelectorCategoria';
import { regresar } from '../../lib/navegar';
import { firmarCampos } from '../../lib/urlsFirmadas';
import { crearPdfDesdeImagenes, guardarPdfParaDespues } from '../../lib/pdfDesdeImagenes';
import { subirArchivo } from '../../lib/subidas';
import { Aviso } from '../../lib/aviso';
import { useProject } from '../../context/ProjectContext';
import { useUser } from '../../context/UserContext';
import { esDeHoy } from '../../lib/permisos';
import { partirUrlDeAlmacen } from '../../lib/urlsFirmadas';
import { supabase } from '../../lib/supabase';
import { mensajeDeError } from '../../lib/errores';

export default function DocumentosScreen() {
  const router = useRouter();
  const { activeProject, isOffline, lastSync } = useProject();
  const { profile } = useUser();
  
  const [scannedImages, setScannedImages] = useState<string[]>([]);
  // Un PDF que el usuario ya tenía hecho (no se arma a partir de fotos).
  const [archivoPdf, setArchivoPdf] = useState<{ uri: string; nombre: string } | null>(null);
  const [docTitle, setDocTitle] = useState('');
  
  // 🟢 ESTADOS PARA CATEGORÍAS
  const [docCategory, setDocCategory] = useState('Plano'); 
  const [customCategory, setCustomCategory] = useState('');

  const [isUploading, setIsUploading] = useState(false);
  /* Armar el PDF y subirlo tardan, y cada uno tarda por su cuenta. Sin decir
   * en cual va, un rato largo sin respuesta se lee como que la app se trabo,
   * y la gente vuelve a tocar el boton. */
  const [paso, setPaso] = useState('');
  const [documentosList, setDocumentosList] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [activeFilter, setActiveFilter] = useState('Todos');
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);

  // 🟢 LISTA FIJA DE CATEGORÍAS (Sin categorías dinámicas que rompan el diseño)
  /* Expediente inicial y final son los paquetes que pide el municipio al
   * abrir y al cerrar la obra. Van como categorias de fabrica y no como
   * categorias propias de cada obra, porque los piden en todas. */
  const defaultCategories = ['Plano', 'Permiso', 'Expediente Inicial', 'Expediente Final', 'Factura', 'Contratos', 'Seguros', 'Otro'];
  const filterCategories = ['Todos', ...defaultCategories];

  const isAdmin = profile?.role === 'admin';
  // El residente puede quitar un documento que acaba de subir (mal escaneado o
  // repetido). Después de 24 horas ya es parte del expediente de la obra.
  const puedeBorrarResidente = (doc: any) =>
    profile?.role === 'residente' && esDeHoy(doc?.created_at);

  useFocusEffect(
    useCallback(() => {
      /* Se llama siempre, incluso sin obra activa: la propia funcion
       * apaga el esqueleto y la pantalla dice que falta elegir obra.
       * Con el candado aqui, ese apagado nunca llegaba a correr y la
       * pantalla se quedaba cargando para siempre. */
      loadDocumentos();
    }, [activeProject])
  );

  useEffect(() => {
    if (activeProject?.id) {
      setTimeout(() => {
        loadDocumentos();
      }, 500);
    }
  }, [isOffline, lastSync, activeProject?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDocumentos();
    setRefreshing(false);
  }, [activeProject, isOffline]);

  useRefrescar(() => loadDocumentos());

  const loadDocumentos = async () => {
    const projectId = activeProject?.id;
    if (!projectId) {
      setCargando(false);
      return;
    }
    setCargando(true);

    const storageKeyDocs = `@planos_cache_${projectId}`;

    let uiPending: any[] = [];
    try {
      const pendingData = await Almacen.getItem('@bandeja_salida_planos');
      if (pendingData) {
        const pendingDocs = JSON.parse(pendingData);
        const projectPending = pendingDocs.filter((d: any) => d.project_id === projectId);
        uiPending = projectPending.map((d: any, index: number) => ({
          id: `temp_doc_${Date.now()}_${index}`,
          title: d.title,
          category: d.category,
          file_url: d.local_file_uri,
          is_pending: true 
        }));
      }
    } catch (e) { console.log("Error leyendo planos pendientes:", e); }

    if (isOffline) {
      try {
        const cachedDocs = await Almacen.getItem(storageKeyDocs);
        const parsedDocs = cachedDocs ? JSON.parse(cachedDocs) : [];
        setDocumentosList([...uiPending, ...parsedDocs]);
      } catch (error) {
        console.log("Error leyendo caché de documentos:", error);
      }
    } else {
      try {
        const { data, error } = await supabase
          .from('planos') 
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false });
          
        if (error) throw error;
        
        if (data) {
          await Almacen.setItem(storageKeyDocs, JSON.stringify(data));
          setDocumentosList([...uiPending, ...(await firmarCampos(data, ['file_url']))]);
        }
      } catch (error: any) {
        if (error.message !== 'Network request failed' && error.message !== 'Failed to fetch') {
          console.log("Error cargando documentos:", error.message);
        } else {
          const cachedDocs = await Almacen.getItem(storageKeyDocs);
          if (cachedDocs) setDocumentosList([...uiPending, ...JSON.parse(cachedDocs)]);
        }
      }
    }

    setCargando(false);
  };

  /* Elegir imágenes que ya están en el teléfono, en lugar de tomarlas ahora.
   * Se pueden seleccionar varias de un jalón: cada una será una página. */
  const handleElegirDeGaleria = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Aviso.alert('Permiso denegado', 'Se requiere acceso a tus fotos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.length) {
        setArchivoPdf(null);
        setScannedImages((prev) => [...prev, ...result.assets.map((a: any) => a.uri)]);
      }
    } catch (error) {
      Aviso.alert('Error', 'No se pudo abrir la galería.');
    }
  };

  /* Subir un PDF que ya existe, sin pasar por fotos. Usa el selector propio del
   * navegador, así no hace falta ninguna librería extra. */
  const handleElegirPdf = () => {
    const entrada = document.createElement('input');
    entrada.type = 'file';
    entrada.accept = 'application/pdf';
    entrada.onchange = () => {
      const archivo = entrada.files && entrada.files[0];
      if (!archivo) return;
      // Un PDF ya armado reemplaza a las paginas escaneadas.
      setScannedImages([]);
      setArchivoPdf({ uri: URL.createObjectURL(archivo), nombre: archivo.name });
      if (!docTitle) setDocTitle(archivo.name.replace(/\.pdf$/i, ''));
    };
    entrada.click();
  };

  const handleScanDocument = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Aviso.alert('Permiso denegado', 'Se requiere acceso a la cámara.');
        return;
      }

      let result = await ImagePicker.launchCameraAsync({
        allowsEditing: false, // 🟢 Toma la foto completa sin recortar
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setScannedImages(prev => [...prev, result.assets[0].uri]);
      }
    } catch (error) {
      Aviso.alert("Error", "No se pudo abrir la cámara.");
    }
  };

  const removeImage = (indexToRemove: number) => {
    setScannedImages(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  const handleSaveToDatabase = async () => {
    // Salir en silencio deja a la persona picandole al boton sin entender.
    if (scannedImages.length === 0 && !archivoPdf) {
      Aviso.alert('Falta el documento', 'Escanea, elige una foto o selecciona un PDF antes de guardar.');
      return;
    }
    if (!docTitle.trim()) {
      Aviso.alert("Falta título", "Por favor ingresa un nombre para identificar este documento.");
      return;
    }
    
    // Si eligió 'Otro', usa lo que escribió. Si está vacío, le pone 'General'
    // El desplegable ya entrega la categoria final: crear una nueva la deja
    // seleccionada, asi que 'Otro' dejo de ser un caso aparte.
    const finalCategory = docCategory;

    const projectId = activeProject?.id;
    if (!projectId) return;

    setIsUploading(true);
    try {
      // Si el usuario subió un PDF, se usa tal cual. Si no, se arma con las fotos.
      setPaso(archivoPdf ? 'Preparando el archivo…' : 'Armando el PDF…');
      const pdf = archivoPdf ? archivoPdf.uri : await crearPdfDesdeImagenes(scannedImages);

      if (isOffline) {
        const permanentPdfUri = await guardarPdfParaDespues(pdf);

        const localDocData = {
          title: docTitle.trim(),
          category: finalCategory,
          version: 'v1.0',
          local_file_uri: permanentPdfUri,
          project_id: projectId
        };

        const existingOutbox = await Almacen.getItem('@bandeja_salida_planos');
        const outbox = existingOutbox ? JSON.parse(existingOutbox) : [];
        outbox.push(localDocData);
        await Almacen.setItem('@bandeja_salida_planos', JSON.stringify(outbox));

        Aviso.alert("Guardado Offline", "El documento PDF se guardó localmente. Se subirá automáticamente al recuperar internet.");
        setScannedImages([]);
        setArchivoPdf(null);
        setDocTitle('');
        setDocCategory('Plano');
        setCustomCategory('');
        await loadDocumentos();
        setIsUploading(false);
        return;
      }

      setPaso('Subiendo…');
      const urlPdf = await subirArchivo(pdf, 'planos_obras', {
        prefijo: 'doc',
        extension: 'pdf',
        contentType: 'application/pdf',
      });

      const { error: dbError } = await supabase.from('planos').insert([
        { title: docTitle.trim(), category: finalCategory, version: 'v1.0', file_url: urlPdf, project_id: projectId }
      ]);

      if (dbError) throw dbError;

      Aviso.alert("¡Éxito!", "Documento generado y guardado en la nube.");
      setScannedImages([]);
      setArchivoPdf(null);
      setDocTitle('');
      setDocCategory('Plano'); 
      setCustomCategory('');
      loadDocumentos(); 

    } catch (error: any) {
      Aviso.alert("Error", mensajeDeError(error, 'guardar el documento'));
    } finally {
      setIsUploading(false);
      setPaso('');
    }
  };

  const handleViewDocument = async (url: string) => {
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch (error) {
      Aviso.alert("Error", "No se pudo abrir el documento.");
    }
  };

  const handleDeleteDocument = (id: any, fileUrl: string) => {
    if (typeof id === 'string' && id.startsWith('temp_')) {
      Aviso.alert("Modo Offline", "No puedes eliminar documentos en espera de sincronización hasta volver a estar online.");
      return;
    }
    if (isOffline) {
      Aviso.alert("Sin Conexión", "No puedes eliminar documentos mientras estés offline.");
      return;
    }

    Aviso.alert(
      "Eliminar Documento",
      "¿Estás seguro de que quieres eliminar este archivo permanentemente?",
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
                // La direccion ya viene firmada, asi que trae un '?token=...'
                // pegado al final. Hay que partirla bien o se intenta borrar
                // un archivo que no existe.
                const partes = partirUrlDeAlmacen(fileUrl);
                if (partes) {
                  const { error: archivoError } = await supabase.storage
                    .from(partes.bucket)
                    .remove([partes.ruta]);

                  // El documento ya se quito de la lista, que es lo que el
                  // usuario pidio. Si el PDF se queda en el almacen es un
                  // pendiente de limpieza, no algo que deba detenerlo.
                  if (archivoError) console.log('El PDF quedo en el almacen:', archivoError.message);
                }
              }
              loadDocumentos(); 
            } catch (error: any) {
              Aviso.alert("Error", mensajeDeError(error, 'eliminar el documento'));
            }
          } 
        }
      ]
    );
  };

  const getCategoryIcon = (category: string) => {
    const defaultCats = ['Plano', 'Permiso', 'Expediente Inicial', 'Expediente Final', 'Factura', 'Contratos', 'Seguros'];
    // Si no está en las por defecto, es un "Otro" y le ponemos icono genérico
    if (!defaultCats.includes(category)) return 'file'; 
    
    switch (category) {
      case 'Plano': return 'map';
      case 'Permiso': return 'shield';
      case 'Expediente Inicial': return 'folder-plus';
      case 'Expediente Final': return 'folder-minus';
      case 'Factura': return 'dollar-sign';
      case 'Contratos': return 'edit-3';
      case 'Seguros': return 'umbrella';
      default: return 'file-text';
    }
  };

  // 🟢 LÓGICA DE FILTRADO (Asigna todo lo "raro" a la pestaña 'Otro')
  const documentosFiltrados = activeFilter === 'Todos' 
    ? documentosList 
    : activeFilter === 'Otro'
      ? documentosList.filter(doc => {
          const cat = doc.category || 'Plano';
          return cat === 'Otro' || !['Plano', 'Permiso', 'Factura', 'Contratos', 'Seguros'].includes(cat);
        })
      : documentosList.filter(doc => (doc.category || 'Plano') === activeFilter);

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ headerShown: false }} />
      
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={() => regresar()} style={styles.backButton}>
            <Feather name="chevron-left" size={28} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerSubtitle}>GESTIÓN DE OBRA</Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={styles.headerBottomRow}>
          <Text style={styles.headerTitle}>Documentación</Text>
          <Text style={styles.headerSmall}>{activeProject?.name?.toUpperCase() || 'MÓDULO DE CONTROL'}</Text>
        </View>
      </View>

      <ScrollView 
        style={styles.body} 
        contentContainerStyle={{ paddingBottom: 40 }} 
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} tintColor="#2563EB" />
        }
      >
        {isOffline && (
          <View style={{ backgroundColor: '#FEF3C7', padding: 10, borderRadius: 8, marginBottom: 15, flexDirection: 'row', alignItems: 'center' }}>
            <Feather name="wifi-off" size={16} color="#D97706" style={{ marginRight: 8 }} />
            <Text style={{ color: '#D97706', fontSize: 12, flex: 1 }}>Modo Offline Activo. Tus documentos se guardarán en tu celular y se subirán solos al tener red.</Text>
          </View>
        )}

        {archivoPdf ? (
          <View style={estilosOrigen.pdfElegido}>
            <Feather name="file-text" size={26} color="#DC2626" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={estilosOrigen.pdfNombre} numberOfLines={1}>{archivoPdf.nombre}</Text>
              <Text style={estilosOrigen.pdfNota}>Se subirá tal cual, sin convertir</Text>
            </View>
            <TouchableOpacity onPress={() => setArchivoPdf(null)} style={{ padding: 6 }}>
              <Feather name="x" size={18} color="#64748B" />
            </TouchableOpacity>
          </View>
        ) : scannedImages.length === 0 ? (
          <View>
            <TouchableOpacity style={styles.scanButton} onPress={handleScanDocument}>
              <Feather name="camera" size={32} color="#FFF" />
              <View style={styles.scanButtonTextContainer}>
                <Text style={styles.scanButtonTitle}>Digitalizar Documento</Text>
                <Text style={styles.scanButtonSub}>Usa la cámara para crear un PDF</Text>
              </View>
            </TouchableOpacity>

            <View style={estilosOrigen.otrasOpciones}>
              <TouchableOpacity style={estilosOrigen.opcion} onPress={handleElegirDeGaleria}>
                <Feather name="image" size={18} color="#2563EB" />
                <Text style={estilosOrigen.opcionTexto}>Desde la galería</Text>
              </TouchableOpacity>

              {Platform.OS === 'web' && (
                <TouchableOpacity style={estilosOrigen.opcion} onPress={handleElegirPdf}>
                  <Feather name="file-text" size={18} color="#2563EB" />
                  <Text style={estilosOrigen.opcionTexto}>Subir un PDF</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
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

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={[styles.addPageBtn, { flex: 1 }]} onPress={handleScanDocument} disabled={isUploading}>
                <Feather name="camera" size={18} color="#2563EB" />
                <Text style={styles.addPageBtnText}>Con la cámara</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.addPageBtn, { flex: 1 }]} onPress={handleElegirDeGaleria} disabled={isUploading}>
                <Feather name="image" size={18} color="#2563EB" />
                <Text style={styles.addPageBtnText}>De la galería</Text>
              </TouchableOpacity>
            </View>
            
          </View>
        )}

        {(archivoPdf || scannedImages.length > 0) && (
          <View>
              <Text style={styles.label}>Nombre del Documento *</Text>
              <TextInput style={styles.input} placeholder="Ej. Contrato de Obra..." value={docTitle} onChangeText={setDocTitle} placeholderTextColor="#6B7280" />

              <Text style={styles.label}>Categoría</Text>
              <View style={{ marginBottom: 20 }}>
                <SelectorCategoria
                  valor={docCategory}
                  alCambiar={setDocCategory}
                  modulo="planos"
                  categoriasBase={defaultCategories}
                  projectId={activeProject?.id}
                  sinConexion={isOffline}
                />
              </View>

              <TouchableOpacity style={styles.saveButton} onPress={handleSaveToDatabase} disabled={isUploading}>
                {isUploading ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <ActivityIndicator color="#FFF" />
                  {paso ? <Text style={styles.saveButtonText}>{paso}</Text> : null}
                </View>
              ) : (
                  <>
                    <Feather name="upload-cloud" size={20} color="#FFF" />
                    <Text style={styles.saveButtonText}>{isOffline
                      ? 'Guardar en el celular'
                      : archivoPdf
                        ? 'Subir el PDF'
                        : 'Generar PDF y Subir'}</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.cancelButton} onPress={() => { setScannedImages([]); setArchivoPdf(null); }} disabled={isUploading}>
                <Text style={styles.cancelButtonText}>Descartar Todo</Text>
              </TouchableOpacity>
          </View>
        )}

        <View style={styles.listContainer}>
          
          <View style={styles.listHeaderRow}>
            <Text style={styles.sectionTitle}>Archivos del Proyecto</Text>
            
            <View style={{ zIndex: 10 }}>
              <TouchableOpacity 
                style={styles.filterDropdownBtn} 
                onPress={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
              >
                <Feather name="filter" size={14} color="#4B5563" />
                <Text style={styles.filterDropdownText}>{activeFilter}</Text>
                <Feather name={isFilterDropdownOpen ? "chevron-up" : "chevron-down"} size={16} color="#6B7280" />
              </TouchableOpacity>

              {/* 🟢 MENÚ CON SCROLL PARA QUE NO SE DESBORDE */}
              {isFilterDropdownOpen && (
                <View style={styles.filterDropdownMenu}>
                  <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
                    {filterCategories.map(cat => (
                      <TouchableOpacity 
                        key={`filter-${cat}`}
                        style={[styles.filterDropdownItem, activeFilter === cat && styles.filterDropdownItemActive]}
                        onPress={() => {
                          setActiveFilter(cat);
                          setIsFilterDropdownOpen(false);
                        }}
                      >
                        <Text style={[styles.filterDropdownItemText, activeFilter === cat && styles.filterDropdownItemTextActive]} numberOfLines={1}>
                          {cat}
                        </Text>
                        {activeFilter === cat && <Feather name="check" size={14} color="#2563EB" />}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          </View>
          
          {cargando && documentosFiltrados.length === 0 ? (
            <SkeletonLista filas={4} />
          ) : documentosFiltrados.length === 0 ? (
            <SinDatos
              mensaje={activeFilter === 'Todos' ? 'No hay datos para mostrar.' : `No hay archivos tipo ${activeFilter}.`}
              onReintentar={loadDocumentos}
            />
          ) : (
            documentosFiltrados.map((doc, index) => (
              <View key={index} style={styles.planoCard}>
                <View style={styles.planoIconContainer}>
                  <Feather name={getCategoryIcon(doc.category || 'Plano') as any} size={24} color="#2563EB" />
                </View>
                <View style={styles.planoInfo}>
                  <Text style={styles.planoTitle}>{doc.title}</Text>
                  <Text style={[styles.planoSub, doc.is_pending && {color: '#D97706', fontWeight: 'bold'}]}>
                    {doc.is_pending ? '⏳ Pendiente de subir' : `${doc.category || 'General'} • PDF`}
                  </Text>
                </View>
                
                <View style={styles.actionButtonsContainer}>
                  <TouchableOpacity style={styles.iconButton} onPress={() => handleViewDocument(doc.file_url)}>
                    <Feather name="file-text" size={20} color="#2563EB" />
                  </TouchableOpacity>

                  {(isAdmin || puedeBorrarResidente(doc)) && (
                    <TouchableOpacity style={[styles.iconButton, { marginLeft: 10 }]} onPress={() => handleDeleteDocument(doc.id, doc.file_url)}>
                      <Feather name="trash-2" size={20} color="#DC2626" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { backgroundColor: '#2563EB', paddingTop: 60, paddingBottom: 25, paddingHorizontal: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  backButton: { padding: 4, marginLeft: -4 },
  headerSubtitle: { color: 'rgba(255, 255, 255, 0.8)', fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  headerBottomRow: { flexDirection: 'column', alignItems: 'flex-start' },
  headerTitle: { color: '#FFF', fontSize: 22, fontWeight: 'bold' },
  headerSmall: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 4 },
  body: { padding: 20 },
  scanButton: { backgroundColor: '#059669', borderRadius: 16, padding: 24, flexDirection: 'row', alignItems: 'center', elevation: 4, boxShadow: '0px 2px 0px rgba(0, 0, 0, 0.1)',    marginBottom: 30 },
  scanButtonTextContainer: { marginLeft: 15, flex: 1 },
  scanButtonTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  scanButtonSub: { color: '#D1FAE5', fontSize: 13, marginTop: 4 },
  previewContainer: { backgroundColor: '#FFF', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 30 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 10 },
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
  
  listContainer: { flex: 1, marginTop: 10, zIndex: 1 },
  
  listHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, zIndex: 10 },
  filterDropdownBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderWidth: 1, borderColor: '#D1D5DB', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, gap: 6, maxWidth: 160 },
  filterDropdownText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  // 🟢 AÑADIDO: overflow hidden y eliminamos el maxHeight de aquí para pasarlo al ScrollView
  filterDropdownMenu: { position: 'absolute', top: '100%', right: 0, marginTop: 4, backgroundColor: '#FFF', borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', width: 150, boxShadow: '0px 4px 6px rgba(0, 0, 0, 0.1)',     elevation: 5, overflow: 'hidden' },
  filterDropdownItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 15, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  filterDropdownItemActive: { backgroundColor: '#EFF6FF' },
  filterDropdownItemText: { fontSize: 14, color: '#4B5563', flex: 1, marginRight: 5 },
  filterDropdownItemTextActive: { color: '#2563EB', fontWeight: 'bold' },

  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, backgroundColor: '#FFF', borderRadius: 16, borderStyle: 'dashed', borderWidth: 2, borderColor: '#E5E7EB', marginTop: 10 },
  emptyStateText: { marginTop: 10, color: '#9CA3AF', fontSize: 14 },
  planoCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 15, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#F3F4F6', zIndex: 0 },
  planoIconContainer: { backgroundColor: '#EFF6FF', padding: 12, borderRadius: 12, marginRight: 15 },
  planoInfo: { flex: 1 },
  planoTitle: { fontSize: 16, fontWeight: 'bold', color: '#1F2937', marginBottom: 4 },
  planoSub: { fontSize: 13, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  actionButtonsContainer: { flexDirection: 'row', alignItems: 'center' },
  iconButton: { padding: 8, backgroundColor: '#F3F4F6', borderRadius: 8 }
});

const estilosOrigen = StyleSheet.create({
  otrasOpciones: { flexDirection: 'row', gap: 10, marginTop: 10 },
  opcion: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderStyle: 'dashed',
    backgroundColor: '#EFF6FF',
  },
  opcionTexto: { color: '#2563EB', fontWeight: '700', fontSize: 13 },
  pdfElegido: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 16,
  },
  pdfNombre: { fontSize: 14, fontWeight: '700', color: '#1E293B' },
  pdfNota: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
});
