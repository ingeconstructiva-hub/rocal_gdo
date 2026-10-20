'use client';

import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRefrescar } from '../../lib/refrescar';
import { SkeletonLista } from '../../components/Skeleton';
import { exportarPDF } from '../../lib/exportar';
import { regresar } from '../../lib/navegar';
import { subirArchivo } from '../../lib/subidas';
import { firmarCampos } from '../../lib/urlsFirmadas';
import Almacen from '../../lib/almacen';
import { FotoSinConexion } from '../../components/FotoSinConexion';
import { Aviso } from '../../lib/aviso';
import { Firma, FirmaRef } from '../../components/Firma';

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useProject } from '../../context/ProjectContext';
import { useUser } from '../../context/UserContext';
import { supabase } from '../../lib/supabase';
import { esDeHoy, eliminarRegistro } from '../../lib/permisos';
import { generarPlantillaResponsiva } from '../../utils/pdfResponsiva';

interface HerramientaAlmacen {
  id: string;
  codigo: string; 
  nombre: string;
  marca_modelo: string;
  ubicacion: 'bodega' | 'obra'; 
  asignado_a?: string | null;   
  notes?: string | null;        
  notas?: string | null;        
  token_firma?: string | null;  
  fecha_firma?: string | null;  
  ine_url?: string | null; 
  ine_reverso_url?: string | null;
  firma_entrega_url?: string | null;
  firma_recibe_url?: string | null;
  fecha_entrega?: string | null;   
  fecha_devolucion?: string | null; 
  created_at?: string;
}

interface ItemAdicional {
  id: string;
  nombre: string;
  marca: string;
}

export default function ResguardosScreen() {
  const router = useRouter();
  const { activeProject, isOffline } = useProject();
  const { profile } = useUser();
  const signatureRef = useRef<FirmaRef>(null);
  const isAdminOrOficina = profile?.role === 'admin' || profile?.role === 'oficina';
  const esResidente = profile?.role === 'residente';
  // El residente puede quitar una herramienta que acaba de dar de alta, por si
  // repitió el código o escribió mal el nombre.
  const puedeBorrarResidente = (item: HerramientaAlmacen) =>
    esResidente && esDeHoy(item.created_at);

  const [herramientas, setHerramientas] = useState<HerramientaAlmacen[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filtroUbicacion, setFiltroUbicacion] = useState<'todos' | 'bodega' | 'obra'>('todos');

  // 📝 ESTADOS DEL FORMULARIO UNIFICADO
  const [modalVisible, setModalVisible] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [marcaModelo, setMarcaModelo] = useState('');
  const [ubicacionInicial, setUbicacionOriginal] = useState<'bodega' | 'obra'>('bodega');
  const [asignadoA, setAsignadoA] = useState('');
  const [notas, setNotas] = useState('');

  // 🔒 MODAL DE FIRMA Y CAPTURA DE INE
  const [modalFirmaVisible, setModalFirmaVisible] = useState(false);
  const [selectedItemForSign, setSelectedItemForSign] = useState<HerramientaAlmacen | null>(null);
  const [nombreResponsableSign, setNombreResponsableSign] = useState('');
  const [ineLocalUri, setIneLocalUri] = useState<string | null>(null); 
  const [ineReversoLocalUri, setIneReversoLocalUri] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [editingTool, setEditingTool] = useState<HerramientaAlmacen | null>(null);

  const [pasoFirma, setPasoFirma] = useState<'entrega' | 'recibe'>('entrega');
  const [firmaEntregaBase64, setFirmaEntregaBase64] = useState<string | null>(null);

  const [itemsAdicionales, setItemsAdicionales] = useState<ItemAdicional[]>([]);
  const [nuevoItemNombre, setNuevoItemNombre] = useState('');
  const [nuevoItemMarca, setNuevoItemMarca] = useState('');
  const [nuevoItemId, setNuevoItemId] = useState<string>('');

  const [sugerenciasFiltradas, setSugerenciasFiltradas] = useState<HerramientaAlmacen[]>([]);
  const [selectedIneUrl, setSelectedIneUrl] = useState<string | null>(null);

  const iniciarEdicion = (item: HerramientaAlmacen) => {
    setEditingTool(item);
    setCodigo(item.codigo);
    setNombre(item.nombre);
    setMarcaModelo(item.marca_modelo);
    setUbicacionOriginal(item.ubicacion);
    setAsignadoA(item.asignado_a || '');
    setNotas(item.notas || item.notes || '');
    setModalVisible(true);
  };

  /* Esta pantalla no tenía forma de quitar una herramienta mal dada de alta.
   * El residente solo la desactiva (recuperable); admin y oficina sí la borran. */
  const eliminarHerramienta = (item: HerramientaAlmacen) => {
    if (isOffline) {
      Aviso.alert("Sin conexión", "Necesitas internet para eliminar una herramienta.");
      return;
    }

    const tieneResguardo = item.ubicacion === 'obra' || !!item.firma_recibe_url;
    Aviso.alert(
      "Eliminar Herramienta",
      tieneResguardo
        ? `"${item.nombre}" tiene un resguardo firmado. Si lo eliminas se pierde esa responsiva. ¿Continuar?`
        : esResidente
          ? `¿Quitar "${item.nombre}" del almacén? Si fue un error, un administrador puede recuperarla.`
          : `¿Eliminar "${item.nombre}" permanentemente del almacén?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await eliminarRegistro('almacen_herramientas', item.id, esResidente);
              if (error) throw error;
              fetchInventarioAlmacen();
            } catch (err: any) {
              Aviso.alert("Error al eliminar", err.message);
            }
          }
        }
      ]
    );
  };

  const iniciarAltaNueva = () => {
    setEditingTool(null);
    setCodigo(''); setNombre(''); setMarcaModelo(''); setUbicacionOriginal('bodega'); setAsignadoA(''); setNotas('');
    setModalVisible(true);
  };

  const abrirModalFirma = (item: HerramientaAlmacen) => {
    setSelectedItemForSign(item);
    setIneLocalUri(null); setIneReversoLocalUri(null); 
    setFirmaEntregaBase64(null);
    setItemsAdicionales([]); 
    setNuevoItemNombre('');
    setNuevoItemMarca('');
    setNuevoItemId('');
    setSugerenciasFiltradas([]);
    setPasoFirma('entrega');
    setModalFirmaVisible(true);
  };

  useEffect(() => {
    if (activeProject?.id) fetchInventarioAlmacen();
  }, [activeProject]);

  useRefrescar(() => fetchInventarioAlmacen());

  const fetchInventarioAlmacen = async () => {
    setLoading(true);
    const pid = activeProject?.id;
    if (!pid) {
      setLoading(false);
      return;
    }

    const llaveCache = `@almacen_cache_${pid}`;

    // Sin internet: se muestra la última copia guardada. Esta pantalla se usa
    // parado en el almacén, que es justo donde suele no haber señal.
    if (isOffline) {
      try {
        const guardado = await Almacen.getItem(llaveCache);
        if (guardado) setHerramientas(JSON.parse(guardado));
      } catch (error) {
        console.log('Error leyendo el almacén guardado:', error);
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const { data, error } = await supabase
        .from('almacen_herramientas')
        .select('*')
        .eq('project_id', pid)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        // Las direcciones guardadas se firman al cargar: así el bucket puede ser
        // privado sin que las pantallas ni los PDFs tengan que cambiar.
        const conUrls = await firmarCampos(data, ['ine_url', 'ine_reverso_url', 'firma_entrega_url', 'firma_recibe_url']);
        setHerramientas(conUrls);
        await Almacen.setItem(llaveCache, JSON.stringify(conUrls));
      }
    } catch (error) {
      console.log("Error loading warehouse inventory:", error);
      // Si falló la red, al menos mostramos lo último que se guardó.
      const guardado = await Almacen.getItem(llaveCache);
      if (guardado) setHerramientas(JSON.parse(guardado));
    } finally {
      setLoading(false);
    }
  };

  const handlePickIneImage = async (lado: 'frente' | 'reverso' = 'frente') => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Aviso.alert("Permiso Requerido", "Necesitamos acceso a la cámara para capturar la INE.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.6,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      if (lado === 'reverso') setIneReversoLocalUri(result.assets[0].uri);
      else setIneLocalUri(result.assets[0].uri);
    }
  };

  const handleManejarBusquedaItem = (texto: string) => {
    setNuevoItemNombre(texto);
    if (!texto.trim()) {
      setSugerenciasFiltradas([]);
      return;
    }

    const filtrado = herramientas.filter(h => 
      h.ubicacion === 'bodega' &&
      h.id !== selectedItemForSign?.id &&
      (h.nombre.toLowerCase().includes(texto.toLowerCase()) || h.codigo.toLowerCase().includes(texto.toLowerCase()))
    );
    setSugerenciasFiltradas(filtrado);
  };

  const handleSeleccionarSugerencia = (item: HerramientaAlmacen) => {
    setNuevoItemNombre(item.nombre);
    setNuevoItemMarca(item.marca_modelo);
    setNuevoItemId(item.id); 
    setSugerenciasFiltradas([]); 
  };

  const handleAgregarItemLista = () => {
    if (!nuevoItemNombre.trim()) {
      Aviso.alert("Campo vacío", "Escribe o selecciona el nombre del artículo adicional.");
      return;
    }
    const idFinal = nuevoItemId || `manual_${Date.now()}`;
    setItemsAdicionales(prev => [...prev, { 
      id: idFinal,
      nombre: nuevoItemNombre.trim(), 
      marca: nuevoItemMarca.trim() || 'Genérico' 
    }]);
    setNuevoItemNombre('');
    setNuevoItemMarca('');
    setNuevoItemId('');
    setSugerenciasFiltradas([]);
  };

  const handleRemoverItemLista = (index: number) => {
    setItemsAdicionales(prev => prev.filter((_, i) => i !== index));
  };

  const ejecutarExportacionPDF = async (item: HerramientaAlmacen) => {
    try {
      let detalleEquiposUnificado = `- 1 Unidad de ${item.nombre} \n- Marca/Modelo: ${item.marca_modelo} \n- Notas: ${item.notas || 'ÓPTIMAS CONDICIONES'}`;
      
      if (itemsAdicionales.length > 0) {
        itemsAdicionales.forEach((it) => {
          detalleEquiposUnificado += `\n\n- 1 Unidad de ${it.nombre} \n- Marca/Modelo: ${it.marca}`;
        });
      }

      const valePayload = {
        id: item.id,
        n_responsiva: item.codigo,
        n_convenio: 'CV-' + item.id.slice(-4).toUpperCase(),
        fecha_prestamo: new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase(),
        nombre_entrega: profile?.full_name?.toUpperCase() || 'INGENIERO RESIDENTE DE OBRA',
        nombre_recibe: item.asignado_a?.toUpperCase() || 'RESPONSABLE NO ASIGNADO',
        obra_nombre: activeProject?.name || 'PROYECTO DE CONSTRUCCIÓN',
        equipos_detalle: detalleEquiposUnificado, 
        token_firma: item.token_firma, 
        fecha_firma: item.fecha_firma,
        firma_entrega_url: item.firma_entrega_url || null,
        firma_recibe_url: item.firma_recibe_url || null,
        ine_url: item.ine_url || null,
        ine_reverso_url: item.ine_reverso_url || null
      };

      const htmlContent = generarPlantillaResponsiva(valePayload);
      await exportarPDF(htmlContent, `Responsiva_${item.codigo}.pdf`);
    } catch (error: any) {
      Aviso.alert("Error", "No se pudo generar el PDF: " + error.message);
    }
  };

  const formDataFromBase64 = (base64String: string, filename: string) => {
    const cleanBase64 = base64String.replace(/^data:image\/\w+;base64,/, "");
    const formData = new FormData();
    formData.append('file', {
      uri: `data:image/png;base64,${cleanBase64}`,
      name: filename,
      type: 'image/png'
    } as any);
    return formData;
  };

  const handleOK = async (signature: string) => {
    if (!nombreResponsableSign.trim()) {
      Aviso.alert("Nombre Requerido", "Por favor ingresa el nombre de quien recibe.");
      return;
    }
    if (!ineLocalUri || !ineReversoLocalUri) {
      Aviso.alert("INE Requerida", "Captura los dos lados de la INE: frente y reverso.");
      return;
    }
    if (!selectedItemForSign) return;

    if (pasoFirma === 'entrega') {
      setFirmaEntregaBase64(signature);
      if (signatureRef.current) {
        signatureRef.current.clearSignature(); 
      }
      setPasoFirma('recibe');
      return;
    }

    if (!firmaEntregaBase64) return;
    setIsUploading(true);
    const timestampId = Date.now();

    try {
      // Las tres subidas van por subirArchivo: antes usaban FormData con la ruta
      // del archivo, que solo funciona en celular. En navegador no subían nada y
      // además el error se ignoraba, así que la responsiva salía con las firmas
      // y la INE rotas.
      const urlEntrega = await subirArchivo(firmaEntregaBase64, 'identificaciones', {
        carpeta: 'firmas',
        prefijo: `firma_entrega_${selectedItemForSign.id}`,
        extension: 'png',
        contentType: 'image/png',
      });

      const urlRecibe = await subirArchivo(signature, 'identificaciones', {
        carpeta: 'firmas',
        prefijo: `firma_recibe_${selectedItemForSign.id}`,
        extension: 'png',
        contentType: 'image/png',
      });

      const finalIneUrl = await subirArchivo(ineLocalUri, 'identificaciones', {
        carpeta: 'ines',
        prefijo: `ine_frente_${selectedItemForSign.id}`,
      });

      const finalIneReversoUrl = await subirArchivo(ineReversoLocalUri, 'identificaciones', {
        carpeta: 'ines',
        prefijo: `ine_reverso_${selectedItemForSign.id}`,
      });

      const tokenGenerado = `TS-${timestampId}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const timestampActual = new Date().toLocaleString('es-MX');

      const idsAdicionalesValidos = itemsAdicionales
        .filter(it => !it.id.startsWith('manual_'))
        .map(it => it.id);
      
      const todosLosIdsAActualizar = [selectedItemForSign.id, ...idsAdicionalesValidos];

      const payloadActualizado = {
        ubicacion: 'obra' as const,
        asignado_a: nombreResponsableSign.trim().toUpperCase(),
        token_firma: tokenGenerado,
        fecha_firma: timestampActual,
        ine_url: finalIneUrl,
        ine_reverso_url: finalIneReversoUrl,
        firma_entrega_url: urlEntrega,
        firma_recibe_url: urlRecibe,
        fecha_entrega: timestampActual, 
        fecha_devolucion: null           
      };

      const { error: dbErr } = await supabase
        .from('almacen_herramientas')
        .update(payloadActualizado)
        .in('id', todosLosIdsAActualizar);

      if (dbErr) throw dbErr;

      const itemActualizado: HerramientaAlmacen = { 
        ...selectedItemForSign, 
        ...payloadActualizado 
      };

      setHerramientas(prev => prev.map(h => {
        if (todosLosIdsAActualizar.includes(h.id)) {
          return { ...h, ...payloadActualizado };
        }
        return h;
      }));

      setModalFirmaVisible(false);
      setNombreResponsableSign('');
      setIneLocalUri(null); setIneReversoLocalUri(null);
      setFirmaEntregaBase64(null);
      setItemsAdicionales([]);
      setSugerenciasFiltradas([]);
      setPasoFirma('entrega');
      setSelectedItemForSign(null);

      Aviso.alert("🔒 Resguardo Múltiple Activado", "Todas las herramientas seleccionadas pasaron a Obra y se vincularon al mismo expediente.", [
        { text: "Generar PDF Responsiva", onPress: () => ejecutarExportacionPDF(itemActualizado) }
      ]);
    } catch (err: any) {
      Aviso.alert("Error", err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleGuardarHerramienta = async () => {
    if (!nombre.trim() || !codigo.trim()) {
      Aviso.alert("Campos Incompletos", "El código y el nombre son obligatorios.");
      return;
    }
    const payload = {
      project_id: activeProject?.id,
      codigo: codigo.trim().toUpperCase(),
      nombre: nombre.trim(),
      marca_modelo: marcaModelo.trim() || 'Genérico',
      ubicacion: ubicacionInicial,
      asignado_a: ubicacionInicial === 'obra' ? asignadoA.trim() : null,
      notas: notas.trim() || null
    };
    try {
      if (editingTool) {
        await supabase.from('almacen_herramientas').update(payload).eq('id', editingTool.id);
      } else {
        await supabase.from('almacen_herramientas').insert([payload]);
      }
      fetchInventarioAlmacen();
      setModalVisible(false);
      setEditingTool(null);
      setCodigo(''); setNombre(''); setMarcaModelo(''); setAsignadoA(''); setNotas('');
    } catch (err: any) {
      Aviso.alert("Error", err.message);
    }
  };

  const ejecutarDevolucionABodega = (item: HerramientaAlmacen) => {
    Aviso.alert(
      "📦 Regreso Físico a Bodega",
      `¿Confirmas que el equipo "${item.nombre}" ha sido devuelto al almacén central?`,
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Confirmar Devolución", 
          onPress: async () => {
            const timestampActual = new Date().toLocaleString('es-MX');
            try {
              const { error } = await supabase
                .from('almacen_herramientas')
                .update({ 
                  ubicacion: 'bodega', 
                  asignado_a: null, 
                  token_firma: null, 
                  fecha_firma: null, 
                  ine_url: null, 
                  firma_entrega_url: null, 
                  firma_recibe_url: null,
                  fecha_devolucion: timestampActual 
                })
                .eq('id', item.id);

              if (error) throw error;
              setHerramientas(prev => prev.map(h => h.id === item.id ? { 
                ...h, 
                ubicacion: 'bodega', 
                asignado_a: null, 
                token_firma: null, 
                fecha_firma: null, 
                ine_url: null, 
                firma_entrega_url: null, 
                firma_recibe_url: null,
                fecha_devolucion: timestampActual 
              } : h));
              Aviso.alert("Éxito", "El equipo ha sido reingresado a la bodega.");
            } catch (err: any) {
              Aviso.alert("Error", err.message);
            }
          } 
        }
      ]
    );
  };

  const filteredHerramientas = herramientas.filter((h: HerramientaAlmacen) => {
    const cumpleBusqueda = h.nombre?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          h.codigo?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          h.marca_modelo?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (h.asignado_a && h.asignado_a.toLowerCase().includes(searchQuery.toLowerCase()));
    return cumpleBusqueda && (filtroUbicacion === 'todos' ? true : h.ubicacion === filtroUbicacion);
  });

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={() => regresar()}><Feather name="chevron-left" size={28} color="#FFF" /></TouchableOpacity>
          <Text style={styles.headerSubtitle}>CONTROL DE INVENTARIO</Text>
          <View style={{ width: 28 }} />
        </View>
        <Text style={styles.headerTitle}>Almacén de Herramientas</Text>
      </View>

      {/* METRICAS */}
      <View style={styles.metricsRowContainer}>
        <TouchableOpacity style={[styles.metricBoxCompact, filtroUbicacion === 'todos' ? styles.metricBoxActiveTodos : styles.metricBoxInactive]} onPress={() => setFiltroUbicacion('todos')}>
          <Text style={[styles.metricNumberCompact, filtroUbicacion === 'todos' ? { color: '#FFF' } : { color: '#475569' }]}>{herramientas.length}</Text>
          <Text style={[styles.metricLabelCompact, filtroUbicacion === 'todos' ? { color: '#FFF' } : { color: '#475569' }]}>📋 Todos</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.metricBox, styles.metricBoxBodegaStyle, filtroUbicacion === 'bodega' && styles.metricBoxActiveBodega]} onPress={() => setFiltroUbicacion('bodega')}>
          <Text style={styles.metricNumber}>{herramientas.filter(h => h.ubicacion === 'bodega').length}</Text>
          <Text style={styles.metricLabel}>📦 En Bodega</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.metricBox, styles.metricBoxObraStyle, filtroUbicacion === 'obra' && styles.metricBoxActiveObra]} onPress={() => setFiltroUbicacion('obra')}>
          <Text style={[styles.metricNumber, { color: '#EA580C' }]}>{herramientas.filter(h => h.ubicacion === 'obra').length}</Text>
          <Text style={[styles.metricLabel, { color: '#C2410C' }]}>🏗️ En Obra</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Feather name="search" size={16} color="#64748B" />
        <TextInput style={styles.searchInput} placeholder="Buscar herramienta..." value={searchQuery} onChangeText={setSearchQuery} placeholderTextColor="#94A3B8" />
      </View>

      {/* El residente tambien da de alta herramienta: es quien la recibe en
          obra. La politica de almacen_herramientas siempre se lo permitio;
          era la interfaz la que no le dibujaba el boton. */}
      <TouchableOpacity style={styles.staticAddBtn} onPress={iniciarAltaNueva}>
        <Feather name="plus-circle" size={16} color="#FFF" />
        <Text style={styles.staticAddBtnText}>Agregar Herramienta al Almacén</Text>
      </TouchableOpacity>

      {/* CARDS */}
      <FlatList
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        data={loading ? [] : filteredHerramientas}
        keyExtractor={(item: HerramientaAlmacen) => item.id}
        /* Cada herramienta trae hasta cuatro imagenes (INE, reverso y firmas),
         * asi que armarlas todas de golpe era lo mas pesado de la app. */
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        ListEmptyComponent={loading ? <SkeletonLista filas={5} /> : null}
        renderItem={({ item }: { item: HerramientaAlmacen }) => (
          <View style={styles.toolCard}>
            <View style={styles.metaLabelRow}>
              <Text style={styles.codeText}>{item.codigo}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => iniciarEdicion(item)} style={styles.editCardBtn}><Text style={styles.editCardBtnText}>Editar</Text></TouchableOpacity>
                {(isAdminOrOficina || puedeBorrarResidente(item)) && (
                  <TouchableOpacity onPress={() => eliminarHerramienta(item)} style={styles.editCardBtn}>
                    <Feather name="trash-2" size={12} color="#EF4444" />
                  </TouchableOpacity>
                )}
                <View style={[styles.locationBadge, item.ubicacion === 'obra' ? styles.badgeObra : styles.badgeBodega]}>
                  <Text style={[styles.locationBadgeText, item.ubicacion === 'obra' ? styles.textObra : styles.textBodega]}>{item.ubicacion === 'obra' ? '🏗️ En Obra' : '📦 En Bodega'}</Text>
                </View>
              </View>
            </View>

            <Text style={styles.toolName}>{item.nombre}</Text>
            <Text style={styles.toolBrand}>{item.marca_modelo}</Text>

            <View style={styles.dateHistoryBox}>
              {item.fecha_entrega && <Text style={styles.dateHistoryText}>📅 Entrega: <Text style={{fontWeight: '600'}}>{item.fecha_entrega}</Text></Text>}
              {item.fecha_devolucion && <Text style={styles.dateHistoryText}>↩ Devuelto: <Text style={{fontWeight: '600'}}>{item.fecha_devolucion}</Text></Text>}
            </View>

            {item.ubicacion === 'bodega' ? (
              <TouchableOpacity style={[styles.pdfActionBtn, { backgroundColor: '#2563EB' }]} onPress={() => abrirModalFirma(item)}>
                <Feather name="edit-3" size={13} color="#FFF" />
                <Text style={styles.pdfActionBtnText}>Asignar y Firmar Entrega</Text>
              </TouchableOpacity>
            ) : (
              <>
                <View style={styles.responsibleBox}>
                  <Feather name="user" size={11} color="#EA580C" />
                  <Text style={styles.responsibleText}>Resguardo: <Text style={{fontWeight: '700'}}>{item.asignado_a}</Text></Text>
                </View>

                {item.ine_url && (
                  <TouchableOpacity style={styles.viewIneBadgeBtn} onPress={() => setSelectedIneUrl(item.ine_url || null)}>
                    <Feather name="eye" size={11} color="#2563EB" />
                    <Text style={styles.viewIneBadgeText}>Ver INE Oficial del Movimiento</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.pdfActionBtn} onPress={() => ejecutarExportacionPDF(item)}>
                  <Feather name="file-text" size={13} color="#FFF" />
                  <Text style={styles.pdfActionBtnText}>Reimprimir Responsiva PDF</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.returnActionBtn} onPress={() => ejecutarDevolucionABodega(item)}>
                  <Feather name="package" size={13} color="#EF4444" />
                  <Text style={styles.returnActionBtnText}>Registrar Devolución a Bodega</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      />

      {/* 🔒 MODAL DE FIRMA MULTI-MATERIAL CON AUTOCOMPLETADO (100% ESTÁTICO) */}
      <Modal visible={modalFirmaVisible} animationType="slide" transparent={false}>
        <View style={styles.signatureModalFullscreen}>
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
            style={{ flex: 1 }}
          >
            <View style={{ flex: 1, padding: 20, justifyContent: 'space-between' }}>
              
              {/* 📋 CONTENEDOR SUPERIOR DINÁMICO */}
              <View style={{ flex: 1, justifyContent: 'flex-start' }}>
                <Text style={styles.signatureModalTitle}>
                  {pasoFirma === 'entrega'
                    ? '✍️ PASO 1: Datos del resguardo y TU firma'
                    : '✍️ PASO 2: Firma del trabajador que RECIBE'}
                </Text>
                <Text style={styles.signatureModalSubtitle}>
                  {pasoFirma === 'entrega'
                    ? 'Anota a quién le entregas el equipo y firma tú, como responsable de la entrega.'
                    : `Pásale el teléfono a ${nombreResponsableSign || 'el trabajador'} para que firme de conformidad.`}
                </Text>
                
                {/* 🟢 PASO 1: Campos de Texto e Inventario Adicional */}
                {pasoFirma === 'entrega' && (
                  <View style={{ marginTop: 8 }}>
                    <Text style={styles.label}>Nombre del trabajador que RECIBE el equipo</Text>
                    {/* 🟢 SE AGREGÓ placeholderTextColor EXCLUSIVO MODO OSCURO */}
                    <TextInput 
                      style={styles.input} 
                      placeholder="Ej. C. Ing. Alejandro Pérez Acocal" 
                      placeholderTextColor="#64748B"
                      value={nombreResponsableSign} 
                      onChangeText={setNombreResponsableSign} 
                    />

                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 8, alignItems: 'center' }}>
                      <TouchableOpacity style={[styles.ineCapturePlaceholder, { flex: 1, height: 55, marginVertical: 0 }]} onPress={() => handlePickIneImage('frente')}>
                        {ineLocalUri ? (
                          <Text style={{ color: '#16A34A', fontSize: 11, fontWeight: 'bold' }}>✓ INE frente</Text>
                        ) : (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Feather name="camera" size={14} color="#2563EB" />
                            <Text style={{ color: '#2563EB', fontSize: 11, fontWeight: 'bold' }}>INE frente</Text>
                          </View>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity style={[styles.ineCapturePlaceholder, { flex: 1, height: 55, marginVertical: 0 }]} onPress={() => handlePickIneImage('reverso')}>
                        {ineReversoLocalUri ? (
                          <Text style={{ color: '#16A34A', fontSize: 11, fontWeight: 'bold' }}>✓ INE reverso</Text>
                        ) : (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Feather name="camera" size={14} color="#2563EB" />
                            <Text style={{ color: '#2563EB', fontSize: 11, fontWeight: 'bold' }}>INE reverso</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    </View>

                    {/* PANEL MULTI-MATERIAL COMPACTADO */}
                    <View style={[styles.multiItemBox, { marginTop: 10, padding: 8 }]}>
                      <View style={styles.multiItemRow}>
                        {/* 🟢 SE AGREGÓ placeholderTextColor EXCLUSIVO MODO OSCURO */}
                        <TextInput 
                          style={[styles.input, { flex: 2, marginBottom: 0, height: 36, fontSize: 12 } ]} 
                          placeholder="Herramienta extra..." 
                          placeholderTextColor="#64748B"
                          value={nuevoItemNombre} 
                          onChangeText={handleManejarBusquedaItem} 
                        />
                        {/* 🟢 SE AGREGÓ placeholderTextColor EXCLUSIVO MODO OSCURO */}
                        <TextInput 
                          style={[styles.input, { flex: 1, marginBottom: 0, height: 36, fontSize: 12 } ]} 
                          placeholder="Marca" 
                          placeholderTextColor="#64748B"
                          value={nuevoItemMarca} 
                          onChangeText={setNuevoItemMarca} 
                        />
                        <TouchableOpacity style={[styles.addInlineBtn, { padding: 8, height: 36 }]} onPress={handleAgregarItemLista}>
                          <Feather name="plus" size={14} color="#FFF" />
                        </TouchableOpacity>
                      </View>

                      {/* SUGERENCIAS FLOTANTES */}
                      {sugerenciasFiltradas.length > 0 && (
                        <View style={[styles.sugerenciasContainer, { maxHeight: 90 }]}>
                          {sugerenciasFiltradas.map((sug) => (
                            <TouchableOpacity key={sug.id} style={[styles.sugerenciaItem, { padding: 6 }]} onPress={() => handleSeleccionarSugerencia(sug)}>
                              <Text style={styles.sugerenciasTexto} numberOfLines={1}>
                                <Text style={{fontWeight: '700', color: '#2563EB'}}>[{sug.codigo}]</Text> {sug.nombre}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}

                      {/* LISTA DE ITEMS AGREGADOS */}
                      <View style={{ maxHeight: 50, overflow: 'hidden', marginTop: 4 }}>
                        {itemsAdicionales.map((it, index) => (
                          <View key={index} style={[styles.itemBadgeRow, { paddingVertical: 3, marginTop: 3 }]}>
                            <Text style={[styles.itemBadgeText, { fontSize: 10 }]} numberOfLines={1}>• {it.nombre} ({it.marca})</Text>
                            <TouchableOpacity onPress={() => handleRemoverItemLista(index)}>
                              <Feather name="minus-circle" size={12} color="#EF4444" />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    </View>
                  </View>
                )}

                {/* 🟢 PASO 2: Banner limpio para el trabajador */}
                {pasoFirma === 'recibe' && (
                  <View style={{ backgroundColor: '#F0FDF4', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#BBF7D0', marginTop: 15 }}>
                    <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#16A34A' }}>✓ Información de Entrega Validada</Text>
                    <Text style={{ fontSize: 12, color: '#334155', marginTop: 4 }}>Asignado a: <Text style={{ fontWeight: '700' }}>{nombreResponsableSign}</Text></Text>
                    {itemsAdicionales.length > 0 && (
                      <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>Equipos extras vinculados: {itemsAdicionales.length}</Text>
                    )}
                  </View>
                )}
              </View>

              {/* 🖋️ CONTENEDOR INFERIOR COMPLETAMENTE INMÓVIL */}
              <View style={{ width: '100%', marginTop: 5, paddingBottom: Platform.OS === 'ios' ? 20 : 0 }}>
                <View style={[styles.canvasContainer, { height: pasoFirma === 'entrega' ? 160 : 260 }]}>
                  <Text style={styles.canvasLabel}>
                    {pasoFirma === 'entrega'
                      ? 'Tu firma — quien ENTREGA (residente)'
                      : `Firma de ${nombreResponsableSign || 'el trabajador'} — quien RECIBE`}
                  </Text>
                  <Firma
                    ref={signatureRef}
                    onOK={handleOK}
                    descriptionText={pasoFirma === 'entrega' ? 'Firma de quien entrega' : 'Firma de quien recibe'}
                    webStyle={`.m-signature-pad--footer { display: none; } body,html { width: 100%; height: 100%; }`}
                    autoClear={false}
                  />
                </View>

                {isUploading ? <ActivityIndicator size="large" color="#16A34A" style={{ marginVertical: 10 }} /> : (
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 5 }}>
                    <TouchableOpacity style={styles.cancelSignBtn} onPress={() => { signatureRef.current?.clearSignature(); setSugerenciasFiltradas([]); }}><Text style={{ color: '#475569', fontWeight: 'bold' }}>Borrar</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.confirmSignBtn} onPress={() => signatureRef.current?.readSignature()}>
                      <Text style={{ color: '#FFF', fontWeight: 'bold' }}>
                        {pasoFirma === 'entrega' ? 'Siguiente Paso' : 'Sellar Resguardo'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
                
                <TouchableOpacity onPress={() => {
                  setModalFirmaVisible(false);
                  setPasoFirma('entrega');
                  setFirmaEntregaBase64(null);
                  setItemsAdicionales([]);
                }}><Text style={{ color: '#EF4444', textAlign: 'center', marginTop: 10, fontWeight: 'bold' }}>Cancelar Operación</Text></TouchableOpacity>
              </View>

            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* MODAL VISOR INE */}
      <Modal visible={!!selectedIneUrl} animationType="fade" transparent={true} onRequestClose={() => setSelectedIneUrl(null)}>
        <View style={styles.ineModalOverlay}>
          <View style={styles.ineViewerBox}>
            <View style={styles.ineViewerHeader}>
              <Text style={styles.ineViewerTitle}>🪪 Expediente Digital: INE</Text>
              <TouchableOpacity onPress={() => setSelectedIneUrl(null)}><Feather name="x-circle" size={22} color="#EF4444" /></TouchableOpacity>
            </View>
            {selectedIneUrl ? (
              isOffline ? <FotoSinConexion alto={220} /> : <Image source={{ uri: selectedIneUrl }} style={styles.ineFullImage} />
            ) : null}
            <TouchableOpacity style={styles.closeIneBtn} onPress={() => setSelectedIneUrl(null)}><Text style={{color: '#FFF', fontWeight: 'bold'}}>Cerrar Visor</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL ALTA/EDICIÓN */}
      <Modal visible={modalVisible} animationType="slide" transparent={true} onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setModalVisible(false)} />
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Código</Text>
              <TextInput style={styles.input} value={codigo} onChangeText={setCodigo} autoCapitalize="characters" />
              <Text style={styles.label}>Nombre</Text>
              <TextInput style={styles.input} value={nombre} onChangeText={setNombre} />
              <Text style={styles.label}>Marca/Modelo</Text>
              <TextInput style={styles.input} value={marcaModelo} onChangeText={setMarcaModelo} />
              <Text style={styles.label}>Observaciones</Text>
              <TextInput style={styles.input} value={notas} onChangeText={setNotas} />
              <TouchableOpacity style={styles.saveBtn} onPress={handleGuardarHerramienta}><Text style={styles.saveBtnText}>Guardar</Text></TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { backgroundColor: '#2563EB', paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerSubtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 'bold' },
  headerTitle: { color: '#FFF', fontSize: 22, fontWeight: 'bold', marginTop: 8 },
  metricsRowContainer: { flexDirection: 'row', gap: 10, paddingHorizontal: 15, marginTop: 15 },
  metricBox: { flex: 1.2, padding: 10, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  metricNumber: { fontSize: 18, fontWeight: '900', color: '#0369A1' },
  metricLabel: { fontSize: 10, fontWeight: '700', marginTop: 2 },
  metricBoxCompact: { flex: 0.8, padding: 10, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  metricNumberCompact: { fontSize: 18, fontWeight: '900' },
  metricLabelCompact: { fontSize: 10, fontWeight: '700', marginTop: 2 },
  metricBoxActiveTodos: { backgroundColor: '#2563EB', borderColor: '#1D4ED8' },
  metricBoxInactive: { backgroundColor: '#FFF', borderColor: '#E2E8F0' },
  metricBoxActiveBodega: { backgroundColor: '#E0F2FE', borderWidth: 2, borderColor: '#0284C7' },
  metricBoxActiveObra: { backgroundColor: '#FFEDD5', borderWidth: 2, borderColor: '#EA580C' },
  metricBoxBodegaStyle: { backgroundColor: '#E0F2FE', borderColor: '#BAE6FD' },
  metricBoxObraStyle: { backgroundColor: '#FFEDD5', borderColor: '#FED7AA' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', marginHorizontal: 15, marginTop: 15, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 13, color: '#1E293B' },
  staticAddBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#2563EB', marginHorizontal: 15, marginTop: 12, paddingVertical: 12, borderRadius: 12, gap: 8 },
  staticAddBtnText: { color: '#FFF', fontSize: 13, fontWeight: 'bold' },
  body: { padding: 15, paddingBottom: 120 },
  toolCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  metaLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  codeText: { fontSize: 11, fontWeight: '800', color: '#2563EB', backgroundColor: '#EFF6FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  editCardBtn: { backgroundColor: '#EFF6FF', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: '#BFDBFE' },
  editCardBtnText: { color: '#2563EB', fontSize: 11, fontWeight: '700' },
  toolName: { fontSize: 15, fontWeight: 'bold', color: '#0F172A' },
  toolBrand: { fontSize: 12, color: '#64748B', marginTop: 1 },
  locationBadge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 10 },
  badgeBodega: { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#DCFCE7' },
  badgeObra: { backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FFEDD5' },
  locationBadgeText: { fontSize: 10, fontWeight: 'bold' },
  textBodega: { color: '#16A34A' },
  textObra: { color: '#C2410C' },
  responsibleBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF7ED', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginTop: 6, gap: 4, alignSelf: 'flex-start' },
  responsibleText: { fontSize: 11, color: '#C2410C' },
  pdfActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1E293B', paddingVertical: 8, borderRadius: 10, marginTop: 10, gap: 6 },
  pdfActionBtnText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  
  dateHistoryBox: { marginTop: 6, gap: 2 },
  dateHistoryText: { fontSize: 10, color: '#64748B' },
  returnActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FEF2F2', paddingVertical: 8, borderRadius: 10, marginTop: 6, gap: 6, borderWidth: 1, borderColor: '#FCA5A5' },
  returnActionBtnText: { color: '#EF4444', fontSize: 11, fontWeight: 'bold' },

  viewIneBadgeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EFF6FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginTop: 6, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#BFDBFE' },
  viewIneBadgeText: { fontSize: 11, color: '#2563EB', fontWeight: '600' },
  ineModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  ineViewerBox: { backgroundColor: '#FFF', borderRadius: 20, padding: 15, width: '100%', maxWidth: 450, alignItems: 'center' },
  ineViewerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 12, borderBottomWidth: 1, borderColor: '#E2E8F0', paddingBottom: 8 },
  ineViewerTitle: { fontSize: 15, fontWeight: 'bold', color: '#0F172A' },
  ineFullImage: { width: '100%', height: 260, borderRadius: 12, resizeMode: 'contain', backgroundColor: '#F1F5F9' },
  closeIneBtn: { backgroundColor: '#1E293B', width: '100%', padding: 12, borderRadius: 10, alignItems: 'center', marginTop: 15 },

  // 🟢 CORREGIDO EN MODO CLARO: Contenedor gris tenue para herramientas extras
  multiItemBox: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', padding: 12, borderRadius: 14, marginVertical: 10, zIndex: 10 },
  multiItemTitle: { fontSize: 12, fontWeight: 'bold', color: '#1E3A8A', marginBottom: 6 },
  multiItemRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  addInlineBtn: { backgroundColor: '#2563EB', padding: 10, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  
  // 🟢 CORREGIDO EN MODO CLARO: Filas de herramientas ya agregadas al vale
  itemBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, marginTop: 6, borderWidth: 1, borderColor: '#E2E8F0', justifyContent: 'space-between' },
  itemBadgeText: { fontSize: 11, color: '#334155', fontWeight: '600', flex: 1 },

  // 🟢 CORREGIDO EN MODO CLARO: Caja flotante de sugerencias al escribir
  sugerenciasContainer: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, marginTop: 4, maxHeight: 155, overflow: 'hidden' },
  sugerenciaItem: { flexDirection: 'row', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', gap: 8 },
  sugerenciasTexto: { fontSize: 12, color: '#334155', flex: 1 },

  // 🟢 CORREGIDO EN MODO CLARO: Fondo general del Modal vuelve a blanco nítido
  signatureModalFullscreen: { flex: 1, backgroundColor: '#FFF', paddingTop: Platform.OS === 'ios' ? 40 : 10 },
  signatureModalTitle: { fontSize: 16, fontWeight: 'bold', color: '#0F172A', textAlign: 'center', marginTop: 10 },
  signatureModalSubtitle: { fontSize: 11, color: '#64748B', textAlign: 'center', marginVertical: 6 },
  
  ineCapturePlaceholder: { height: 120, backgroundColor: '#EFF6FF', borderRadius: 12, borderWidth: 1, borderColor: '#BFDBFE', borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', marginVertical: 8 },
  ineCaptureText: { color: '#2563EB', fontSize: 11, fontWeight: 'bold', marginTop: 6 },
  canvasContainer: { width: '100%', height: 250, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12, overflow: 'hidden', marginVertical: 10, backgroundColor: '#FFF' },
  
  cancelSignBtn: { 
    flex: 1, 
    backgroundColor: '#E2E8F0', 
    padding: 12, 
    borderRadius: 8, 
    alignItems: 'center' 
  },
  confirmSignBtn: { flex: 2, backgroundColor: '#16A34A', padding: 12, borderRadius: 8, alignItems: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '90%' },
  
  // 🟢 CORREGIDO EN MODO CLARO: Labels y campos vuelven a sus grises oscuros de alto contraste original
  label: { fontSize: 11, fontWeight: '700', color: '#475569', marginTop: 12, marginBottom: 4 },
  input: { backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 10, fontSize: 14, color: '#1E293B' },
  saveBtn: { backgroundColor: '#2563EB', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: '#FFF', fontWeight: 'bold' },
  canvasLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#475569',
    backgroundColor: '#F1F5F9',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 8,
    paddingHorizontal: 10,
    textAlign: 'center'
  }
});