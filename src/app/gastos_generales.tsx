'use client';

import { Feather } from '@expo/vector-icons';
import Almacen from '../lib/almacen';
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useRefrescar } from '../lib/refrescar';
import { SkeletonLista } from '../components/Skeleton';
import { subirArchivo } from '../lib/subidas';
import { exportarPDF, exportarTexto } from '../lib/exportar';
import { regresar } from '../lib/navegar';
import { firmarCampos } from '../lib/urlsFirmadas';
import { FotoSinConexion } from '../components/FotoSinConexion';
import { Aviso } from '../lib/aviso';

import SummaryCard from '../components/SummaryCard';
import { useProject } from '../context/ProjectContext';
import { useUser } from '../context/UserContext';
import { supabase } from '../lib/supabase';
import { generarPlantillaGastos } from '../utils/pdfGastosGen';

interface GastoEstructural {
  id: string;
  concepto: string;
  monto: number;
  categoria: 'material' | 'administrativo' | 'burocrata' | 'asesoria';
  cantidad?: number | null;
  unidad?: string | null;
  proveedor?: string | null;
  estado_pago: 'pagado' | 'credito' | 'abono_parcial'; 
  monto_pagado?: number | null; 
  numero_cotizacion?: string | null; 
  foto_url?: string | null; 
  fecha: string;
}

export default function GastosGeneralesScreen() {
  const router = useRouter();
  const { activeProject, isOffline } = useProject();
  const { profile } = useUser(); 
  
  const [gastos, setGastos] = useState<GastoEstructural[]>([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = profile?.role === 'admin';

  // Estados de filtrado por rubro y estado de liquidación
  const [filtroCategoria, setFiltroCategoria] = useState<'todos' | 'material' | 'administrativo' | 'burocrata' | 'asesoria'>('todos');
  const [filtroPago, setFiltroPago] = useState<'todos' | 'pagado' | 'credito' | 'abono_parcial'>('todos'); 

  // Menús desplegables de filtrado
  const [showCatDropdown, setShowCatDropdown] = useState(false);
  const [showPagoDropdown, setShowPagoDropdown] = useState(false);

  // Estados de selección y edición
  const [gastoSeleccionado, setGastoSeleccionado] = useState<GastoEstructural | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Estados del Formulario Modal
  const [isFormModalVisible, setIsFormModalVisible] = useState(false);
  const [concepto, setConcepto] = useState('');
  const [categoriaForm, setCategoriaForm] = useState<'material' | 'administrativo' | 'burocrata' | 'asesoria'>('material');
  const [estadoPagoForm, setEstadoPagoForm] = useState<'pagado' | 'credito' | 'abono_parcial'>('pagado'); 
  
  const [cantidad, setCantidad] = useState('');
  const [precioUnitario, setPrecioUnitario] = useState('');
  const [unidad, setUnidad] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [numeroCotizacion, setNumeroCotizacion] = useState(''); 
  const [montoAbonadoForm, setMontoAbonadoForm] = useState(''); 
  
  const [fotoComprobante, setFotoComprobante] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  // Cálculo automático del importe total (cantidad * precio unitario)
  const montoTotalCalculado = useMemo(() => {
    return Number(cantidad) * Number(precioUnitario) || 0;
  }, [cantidad, precioUnitario]);

  // Cálculo automático del saldo restante según el abono o crédito
  const saldoRestanteCalculado = useMemo(() => {
    if (estadoPagoForm === 'pagado') return 0;
    if (estadoPagoForm === 'credito') return montoTotalCalculado;
    return Math.max(0, montoTotalCalculado - (Number(montoAbonadoForm) || 0));
  }, [estadoPagoForm, montoTotalCalculado, montoAbonadoForm]);

  /**
   * 📌 NOTA: useEffect (Carga inicial de gastos)
   * Dispara la consulta al cambiar de obra o detectar cambios en el estado de red.
   */
  useEffect(() => {
    if (activeProject?.id) {
      fetchGastos();
    }
  }, [activeProject, isOffline]);

  /**
   * 📌 NOTA: fetchGastos
   * Consulta la tabla 'gastos_generales' filtrando por la obra activa ('project_id')
   * y guarda el resultado en AsyncStorage para disponibilidad offline.
   */
  useRefrescar(() => fetchGastos());

  const fetchGastos = async () => {
    setLoading(true);
    const pid = activeProject?.id;
    // Sin obra activa no hay nada que pedir, pero el esqueleto ya estaba
    // encendido: si se sale sin apagarlo, la pantalla se queda cargando
    // para siempre.
    if (!pid) {
      setLoading(false);
      return;
    }

    const storageKey = `@gastos_generales_log_${pid}`;

    if (isOffline) {
      try {
        const cached = await Almacen.getItem(storageKey);
        if (cached) setGastos(JSON.parse(cached));
      } catch (e) {
        console.log("Error leyendo caché:", e);
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const { data, error } = await supabase
        .from('gastos_generales')
        .select('*')
        .eq('project_id', pid)
        .eq('is_active', true)
        .order('fecha', { ascending: false });

      if (error) throw error;
      if (data) {
        setGastos(await firmarCampos(data, ['foto_url']));
        await Almacen.setItem(storageKey, JSON.stringify(data));
      }
    } catch (error) {
      console.log("Error cargando gastos:", error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 📌 NOTA: iniciarEdicion
   * Carga los datos de un gasto existente en los campos del modal para permitir su modificación.
   */
  const iniciarEdicion = (gasto: GastoEstructural) => {
    setGastoSeleccionado(null);
    setConcepto(gasto.concepto);
    setCategoriaForm(gasto.categoria);
    setEstadoPagoForm(gasto.estado_pago || 'pagado');
    setNumeroCotizacion(gasto.numero_cotizacion || '');
    setFotoComprobante(gasto.foto_url || null);
    setMontoAbonadoForm(gasto.monto_pagado ? gasto.monto_pagado.toString() : ''); 
    
    const cantVal = gasto.cantidad || 1;
    setCantidad(cantVal.toString());
    setPrecioUnitario((gasto.monto / cantVal).toString());
    
    setUnidad(gasto.unidad || '');
    setProveedor(gasto.proveedor || '');
    
    setIsEditing(true);
    setIsFormModalVisible(true);
  };

  /**
   * 📌 NOTA: seleccionarFotoComprobante
   * Abre un selector para tomar una fotografía con la cámara o elegir una imagen de la galería.
   */
  const seleccionarFotoComprobante = () => {
    Aviso.alert("Comprobante de Pago", "¿De dónde quieres subir la imagen?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Tomar Foto", onPress: async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') { Aviso.alert("Permiso Denegado"); return; }
        const result = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 0.7 });
        if (!result.canceled) setFotoComprobante(result.assets[0].uri);
      }},
      { text: "Galería", onPress: async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { Aviso.alert("Permiso Denegado"); return; }
        const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: false, quality: 0.7 });
        if (!result.canceled) setFotoComprobante(result.assets[0].uri);
      }}
    ]);
  };

  /**
   * 📌 NOTA: handleGuardarGasto
   * Valida la información, sube el comprobante al bucket 'comprobantes' de Supabase Storage
   * e inserta o actualiza el registro en la tabla 'gastos_generales'.
   */
  const handleGuardarGasto = async () => {
    if (!concepto.trim() || !cantidad.trim() || !precioUnitario.trim()) {
      Aviso.alert("Campos incompletos", "Por favor ingresa la descripción, cantidad y precio unitario.");
      return;
    }

    if (estadoPagoForm === 'abono_parcial' && (!montoAbonadoForm.trim() || Number(montoAbonadoForm) <= 0)) {
      Aviso.alert("Monto de abono inválido", "Por favor ingresa la cantidad que se está abonando.");
      return;
    }

    if (estadoPagoForm === 'abono_parcial' && Number(montoAbonadoForm) >= montoTotalCalculado) {
      Aviso.alert("Monto excedido", "El abono no puede ser igual o mayor al importe total. Si ya se cubrió todo, marca el estado como 'Liquidado'.");
      return;
    }

    const pid = activeProject?.id;
    if (!pid) return;

    if (isOffline) {
      Aviso.alert("Modo Offline", "Conéctate a internet para registrar gastos.");
      return;
    }

    setIsSaving(true);
    
    try {
      let finalFotoUrl = fotoComprobante;

      // Subida de imagen codificada en base64 al Storage
      if (fotoComprobante && !fotoComprobante.startsWith('http')) {
        finalFotoUrl = await subirArchivo(fotoComprobante, 'comprobantes', { prefijo: 'comprobante' });
      }

      let finalMontoPagado = 0;
      if (estadoPagoForm === 'pagado') finalMontoPagado = montoTotalCalculado;
      else if (estadoPagoForm === 'abono_parcial') finalMontoPagado = Number(montoAbonadoForm);

      const datosGasto = {
        project_id: pid,
        concepto: concepto.trim(),
        monto: montoTotalCalculado, 
        categoria: categoriaForm,
        estado_pago: estadoPagoForm,
        monto_pagado: finalMontoPagado, 
        numero_cotizacion: numeroCotizacion.trim() ? numeroCotizacion.trim() : null,
        cantidad: Number(cantidad),
        precio_unitario: Number(precioUnitario),
        unidad: unidad.trim() ? unidad.trim() : null,
        proveedor: proveedor.trim() ? proveedor.trim() : null,
        foto_url: finalFotoUrl || null,
        is_active: true,
        fecha: isEditing && gastoSeleccionado ? gastoSeleccionado.fecha : new Date().toISOString()
      };

      if (isEditing && gastoSeleccionado) {
        const { error } = await supabase.from('gastos_generales').update(datosGasto).eq('id', gastoSeleccionado.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('gastos_generales').insert([datosGasto]);
        if (error) throw error;
      }

      setIsFormModalVisible(false);
      limpiarFormulario();
      fetchGastos();
      Aviso.alert("¡Éxito!", isEditing ? "Gasto actualizado correctamente." : "Gasto registrado correctamente.");
    } catch (error: any) {
      Aviso.alert("Error", error.message);
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * 📌 NOTA: handleRegistrarAbonoDesdeDetalle
   * Permite ingresar un abono parcial a una deuda directamente desde la vista de detalle.
   */
  const handleRegistrarAbonoDesdeDetalle = (gasto: GastoEstructural) => {
    const saldoPendiente = gasto.monto - (gasto.monto_pagado || 0);

    Alert.prompt(
      "Registrar Abono",
      `Saldo pendiente: $${saldoPendiente.toLocaleString('es-MX', { minimumFractionDigits: 2 })}\n\n¿Cuánto vas a abonar a este gasto?:`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Aplicar Pago",
          onPress: async (montoIngresado: string | undefined) => {
            const abono = Number(montoIngresado?.replace(/[^0-9.]/g, ''));
            
            if (!abono || abono <= 0) {
              Aviso.alert("Error", "Monto inválido.");
              return;
            }
            if (abono > saldoPendiente) {
              Aviso.alert("Monto Excedido", "El abono no puede ser mayor al saldo pendiente.");
              return;
            }

            const nuevoMontoPagado = (gasto.monto_pagado || 0) + abono;
            const nuevoEstado = nuevoMontoPagado === gasto.monto ? 'pagado' : 'abono_parcial';

            try {
              setLoading(true);
              const { error } = await supabase
                .from('gastos_generales')
                .update({
                  monto_pagado: nuevoMontoPagado,
                  estado_pago: nuevoEstado
                })
                .eq('id', gasto.id);

              if (error) throw error;

              setGastos(prev => prev.map(g => g.id === gasto.id ? { ...g, monto_pagado: nuevoMontoPagado, estado_pago: nuevoEstado } : g));
              setGastoSeleccionado(null); 
              Aviso.alert("¡Éxito!", `Se abonaron $${abono.toLocaleString('es-MX')} a la cuenta.`);
              fetchGastos(); 
            } catch (err: any) {
              Aviso.alert("Error", err.message);
            } finally {
              setLoading(false);
            }
          }
        }
      ],
      "plain-text",
      ""
    );
  };

  /**
   * 📌 NOTA: limpiarFormulario
   * Restablece los campos del formulario de registro y edición a sus valores iniciales.
   */
  const limpiarFormulario = () => {
    setConcepto('');
    setCantidad('');
    setPrecioUnitario('');
    setUnidad('');
    setProveedor('');
    setNumeroCotizacion('');
    setFotoComprobante(null);
    setEstadoPagoForm('pagado');
    setMontoAbonadoForm(''); 
    setIsEditing(false);
    setGastoSeleccionado(null);
  };

  /**
   * 📌 NOTA: handleEliminarGasto
   * Ejecuta un borrado físico permanente (.delete()) en Supabase para evitar registros residuales
   * y mantener consistencia con las métricas del panel web.
   */
  const handleEliminarGasto = async (id: string, nombre: string) => {
    if (isOffline) {
      Aviso.alert("Modo Lectura", "Requiere conexión para eliminar registros.");
      return;
    }

    Aviso.alert("Eliminar gasto", `¿Deseas eliminar permanentemente "${nombre}" de la base de datos?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          try {
            // 🟢 Borrado definitivo sincronizado
            const { error } = await supabase
              .from('gastos_generales')
              .delete()
              .eq('id', id);

            if (error) throw error;
            
            setGastos(prev => prev.filter(g => g.id !== id));
            setGastoSeleccionado(null);
          } catch (e: any) {
            Aviso.alert("Error", e.message);
          }
        }
      }
    ]);
  };

  /**
   * 📌 NOTA: handleExportarExcel
   * Construye un archivo CSV estructurado con los gastos filtrados y lo abre mediante el gestor nativo de compartir.
   */
  const handleExportarExcel = async () => {
    if (gastosFiltrados.length === 0) { Aviso.alert("Sin datos", "No hay registros en esta vista."); return; }
    try {
      const encabezados = ["Fecha", "Categoria", "Cotizacion", "Concepto", "Cantidad", "Unidad", "Proveedor/Origen", "Estado de Pago", "Abonado ($)", "Monto Total ($)\n"];
      const filas = gastosFiltrados.map(g => {
        const fecha = new Date(g.fecha).toLocaleDateString('es-MX');
        const conceptoLimpio = g.concepto.replace(/,/g, ' ');
        const provLimpio = g.proveedor ? g.proveedor.replace(/,/g, ' ') : '';
        const estado = g.estado_pago === 'credito' ? 'DEUDA' : g.estado_pago === 'abono_parcial' ? 'ABONO PARCIAL' : 'PAGADO';
        const cotizacion = g.numero_cotizacion || 'S/C';
        return `${fecha},"${g.categoria.toUpperCase()}","${cotizacion}","${conceptoLimpio}",${g.cantidad || ''},"${g.unidad || ''}","${provLimpio}","${estado}",${g.monto_pagado || 0},${g.monto}`;
      }).join("\n");

      const contenidoCSV = "\uFEFF" + encabezados.join(",") + filas;
      const nombreArchivo = `Gastos_Filtrados_${activeProject?.name?.replace(/\s+/g, '_') || 'Obra'}.csv`;

      const fsModulo = FileSystem as any;
      await exportarTexto(contenidoCSV, nombreArchivo);
    } catch (error: any) { Aviso.alert("Error Excel", error.message); }
  };

  /**
   * 📌 NOTA: handleExportarPDF
   * Genera el reporte impreso en formato PDF a partir de la plantilla HTML y lo comparte.
   */
  const handleExportarPDF = async () => {
    if (gastosFiltrados.length === 0) { Aviso.alert("Sin datos", "No hay registros."); return; }
    
    setIsExportingPDF(true);
    try {
      const htmlContent = generarPlantillaGastos(
        activeProject?.name || 'Obra Sin Nombre',
        totalGastado,
        totalDeuda,
        filtroCategoria,
        gastosFiltrados
      );
      
      await exportarPDF(htmlContent, 'Gastos_Generales.pdf');
    } catch (error: any) { 
      Aviso.alert("Error PDF", error.message); 
    } finally { 
      setIsExportingPDF(false); 
    }
  };

  /**
   * 📌 NOTA: renderBadge
   * Retorna una etiqueta visual coloreada según el rubro de gasto.
   */
  const renderBadge = (cat: string) => {
    switch (cat) {
      case 'material': return <Text style={[styles.badge, { backgroundColor: '#FEF3C7', color: '#D97706' }]}>📦 Material</Text>;
      case 'administrativo': return <Text style={[styles.badge, { backgroundColor: '#E0F2FE', color: '#0284C7' }]}>📄 Admin</Text>;
      case 'burocrata': return <Text style={[styles.badge, { backgroundColor: '#FEE2E2', color: '#DC2626' }]}>🛡️ Burócrata</Text>;
      case 'asesoria': return <Text style={[styles.badge, { backgroundColor: '#EDE9FE', color: '#7C3AED' }]}>👥 Asesoría</Text>;
      default: return null;
    }
  };

  /**
   * 📌 NOTA: getProveedorLabel
   * Adapta dinámicamente la etiqueta del formulario de acuerdo a la categoría seleccionada.
   */
  const getProveedorLabel = () => {
    if (categoriaForm === 'burocrata') return 'Dependencia / Institución';
    if (categoriaForm === 'asesoria') return 'Consultor / Especialista';
    if (categoriaForm === 'administrativo') return 'Comercio / Establecimiento';
    return 'Proveedor de Materiales';
  };

  // Filtrado reactivo de gastos en memoria
  const gastosFiltrados = useMemo(() => {
    return gastos.filter(g => {
      const cumpleCategoria = filtroCategoria === 'todos' || g.categoria === filtroCategoria;
      const cumplePago = filtroPago === 'todos' || g.estado_pago === filtroPago;
      return cumpleCategoria && cumplePago;
    });
  }, [gastos, filtroCategoria, filtroPago]);

  const totalGastado = gastosFiltrados.reduce((sum, g) => sum + g.monto, 0);
  const totalDeuda = gastosFiltrados.reduce((sum, g) => sum + (g.monto - (g.monto_pagado || 0)), 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={() => regresar('/(tabs)/gastos')} style={styles.backButton}>
            <Feather name="chevron-left" size={32} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerSubtitle}>REGISTRO ESTRUCTURAL</Text>
          <View style={{ width: 32 }} />
        </View>
        <Text style={styles.headerTitle}>Bitácora de Gastos</Text>
        <View style={styles.projectBadge}>
          <Feather name="map-pin" size={12} color="rgba(255,255,255,0.7)" />
          <Text style={styles.projectName}>{activeProject?.name || "Obra"}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        
        <View style={{ marginBottom: 15 }}>
          <SummaryCard 
            labelLeft={`Gastado en Vista`} 
            valueLeft={totalGastado} 
            labelRight="Por Pagar / Restante" 
            valueRight={totalDeuda} 
            colorRight="#DC2626" 
          />
        </View>

        {isAdmin ? (
          <View style={styles.exportContainer}>
            <TouchableOpacity style={[styles.bigExportBtn, { backgroundColor: '#DC2626' }]} onPress={handleExportarPDF} disabled={isExportingPDF}>
              {isExportingPDF ? <ActivityIndicator color="#FFF" /> : (
                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                  <Feather name="file-text" size={20} color="#FFF" />
                  <Text style={styles.bigExportText}>Generar PDF</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={[styles.bigExportBtn, { backgroundColor: '#10B981' }]} onPress={handleExportarExcel}>
              <Feather name="grid" size={20} color="#FFF" />
              <Text style={styles.bigExportText}>Generar Excel</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Historial de Movimientos</Text>
            <View style={styles.countBadge}>
                <Text style={styles.countText}>{gastosFiltrados.length} registros</Text>
            </View>
        </View>

        {/* 🟢 FILTROS DESPLEGABLES */}
        <View style={styles.webFiltersRow}>
          
          {/* DESPLEGABLE 1: CATEGORÍAS */}
          <View style={{ flex: 1, position: 'relative' }}>
            <Text style={styles.filterLabelMini}>Filtrar por Rubro</Text>
            <TouchableOpacity 
              style={styles.filterDropdownTrigger}
              onPress={() => {
                setShowCatDropdown(!showCatDropdown);
                setShowPagoDropdown(false);
              }}
            >
              <Text style={styles.filterDropdownTriggerText} numberOfLines={1}>
                {filtroCategoria === 'todos' ? '🎛️ TODOS LOS RUBROS' : `📦 ${filtroCategoria.toUpperCase()}`}
              </Text>
              <Feather name={showCatDropdown ? "chevron-up" : "chevron-down"} size={16} color="#64748B" />
            </TouchableOpacity>

            {showCatDropdown && (
              <View style={styles.filterAbsoluteMenu}>
                {['todos', 'material', 'administrativo', 'burocrata', 'asesoria'].map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.filterMenuOption, filtroCategoria === cat && styles.filterMenuOptionSelected]}
                    onPress={() => {
                      setFiltroCategoria(cat as any);
                      setShowCatDropdown(false);
                    }}
                  >
                    <Text style={[styles.filterMenuOptionText, filtroCategoria === cat && styles.filterMenuOptionTextSelected]}>
                      {cat.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* DESPLEGABLE 2: ESTADO DE PAGO */}
          <View style={{ flex: 1, position: 'relative' }}>
            <Text style={styles.filterLabelMini}>Filtrar por Estado</Text>
            <TouchableOpacity 
              style={styles.filterDropdownTrigger}
              onPress={() => {
                setShowPagoDropdown(!showPagoDropdown);
                setShowCatDropdown(false);
              }}
            >
              <Text style={styles.filterDropdownTriggerText} numberOfLines={1}>
                {filtroPago === 'todos' ? '🎛️ TODOS LOS ESTADOS' : filtroPago === 'pagado' ? '🟢 LIQUIDADOS' : filtroPago === 'abono_parcial' ? '🟡 ABONOS' : '🔴 POR PAGAR'}
              </Text>
              <Feather name={showPagoDropdown ? "chevron-up" : "chevron-down"} size={16} color="#64748B" />
            </TouchableOpacity>

            {showPagoDropdown && (
              <View style={styles.filterAbsoluteMenu}>
                {[
                  { id: 'todos', name: 'TODOS' },
                  { id: 'pagado', name: '🟢 LIQUIDADOS' },
                  { id: 'abono_parcial', name: '🟡 ABONOS' },
                  { id: 'credito', name: '🔴 POR PAGAR' }
                ].map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.filterMenuOption, filtroPago === item.id && styles.filterMenuOptionSelected]}
                    onPress={() => {
                      setFiltroPago(item.id as any);
                      setShowPagoDropdown(false);
                    }}
                  >
                    <Text style={[styles.filterMenuOptionText, filtroPago === item.id && styles.filterMenuOptionTextSelected]}>
                      {item.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

        </View>

        {loading ? (
          <SkeletonLista filas={5} />
        ) : gastosFiltrados.length === 0 ? (
          <Text style={styles.emptyText}>No hay gastos registrados con los filtros seleccionados.</Text>
        ) : (
          gastosFiltrados.map((g) => (
            <TouchableOpacity 
              key={g.id} 
              style={[
                styles.gastoCard, 
                g.estado_pago === 'credito' ? { borderLeftWidth: 4, borderLeftColor: '#EF4444' } : null,
                g.estado_pago === 'abono_parcial' ? { borderLeftWidth: 4, borderLeftColor: '#F59E0B' } : null
              ]}
              activeOpacity={0.7}
              onPress={() => setGastoSeleccionado(g)}
            >
              <View style={styles.cardStatusIconContainer}>
                <Feather 
                  name={g.estado_pago === 'pagado' ? "check-circle" : g.estado_pago === 'abono_parcial' ? "pie-chart" : "clock"} 
                  size={22} 
                  color={g.estado_pago === 'pagado' ? "#10B981" : g.estado_pago === 'abono_parcial' ? "#F59E0B" : "#EF4444"} 
                />
              </View>

              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.gastoConcepto} numberOfLines={2}>{g.concepto}</Text>
                
                <View style={{marginTop: 4, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6}}>
                  {g.numero_cotizacion ? (
                    <Text style={styles.cotizacionCardBadge}>📄 Cot: {g.numero_cotizacion}</Text>
                  ) : null}
                  {g.foto_url ? (
                    <Feather name="paperclip" size={12} color="#64748B" />
                  ) : null}
                  {g.proveedor ? (
                    <Text style={styles.gastoDetalleTexto}>🏢 {g.proveedor}</Text>
                  ) : null}
                  {g.estado_pago === 'abono_parcial' ? (
                    <Text style={{fontSize: 10, color: '#D97706', fontWeight: 'bold'}}>
                      Abonado: ${g.monto_pagado?.toLocaleString('es-MX')}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.metaRow}>
                  {renderBadge(g.categoria)}
                  <Text style={styles.gastoFecha}>
                    • {new Date(g.fecha).toLocaleDateString('es-MX')}
                  </Text>
                </View>
              </View>
              
              <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                <Text style={[
                  styles.gastoMonto, 
                  g.estado_pago === 'credito' ? {color: '#DC2626'} : null, 
                  g.estado_pago === 'abono_parcial' ? {color: '#D97706'} : null
                ]}>
                  ${g.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </Text>
                {g.estado_pago === 'abono_parcial' ? (
                  <Text style={{fontSize: 11, color: '#DC2626', fontWeight: 'bold'}}>
                    Restan: ${(g.monto - (g.monto_pagado || 0)).toLocaleString('es-MX')}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => setIsFormModalVisible(true)}>
        <Feather name="plus" size={30} color="#FFF" />
      </TouchableOpacity>

      {/* 🔍 MODAL DETALLE DE GASTO */}
      <Modal visible={!!gastoSeleccionado} animationType="fade" transparent={true} onRequestClose={() => setGastoSeleccionado(null)}>
        <View style={styles.modalOverlayDetail}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setGastoSeleccionado(null)} />
          <View style={styles.detailModalContent}>
            {gastoSeleccionado ? (
              <View>
                <View style={styles.detailHeader}>
                  <View style={styles.detailTitleBox}>
                    <Text style={styles.detailTitleCat}>{gastoSeleccionado.categoria.toUpperCase()}</Text>
                    <Text style={styles.detailTitleMain} numberOfLines={2}>{gastoSeleccionado.concepto}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setGastoSeleccionado(null)} style={styles.detailCloseBtn}>
                    <Feather name="x" size={24} color="#64748B" />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false}>
                  
                  {gastoSeleccionado.foto_url ? (
                    <View style={styles.detailFotoContainer}>
                      {isOffline ? <FotoSinConexion alto={180} /> : <Image source={{ uri: gastoSeleccionado.foto_url }} style={styles.detailFoto} resizeMode="cover" />}
                    </View>
                  ) : null}

                  <Text style={[
                    styles.detailAmount, 
                    gastoSeleccionado.estado_pago === 'credito' ? {color: '#DC2626'} : null, 
                    gastoSeleccionado.estado_pago === 'abono_parcial' ? {color: '#D97706'} : null,
                    gastoSeleccionado.foto_url ? {marginTop: 15} : null
                  ]}>
                    ${gastoSeleccionado.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </Text>
                  
                  <View style={styles.detailDataBox}>
                    <View style={styles.detailRowGrid}>
                      <View style={{flex: 1}}>
                        <Text style={styles.detailLabel}>Estado de Pago</Text>
                        <Text style={[styles.detailValue, {
                          color: gastoSeleccionado.estado_pago === 'credito' ? '#DC2626' : gastoSeleccionado.estado_pago === 'abono_parcial' ? '#D97706' : '#10B981'
                        }]}>
                          {gastoSeleccionado.estado_pago === 'credito' ? 'DEUDA TOTAL' : gastoSeleccionado.estado_pago === 'abono_parcial' ? 'ABONADO / PARCIAL' : 'LIQUIDADO'}
                        </Text>
                      </View>
                      <View style={{flex: 1}}>
                        <Text style={styles.detailLabel}>No. Cotización</Text>
                        <Text style={[styles.detailValue, {color: '#2563EB'}]}>{gastoSeleccionado.numero_cotizacion || 'Sin Cotización'}</Text>
                      </View>
                    </View>

                    {gastoSeleccionado.estado_pago === 'abono_parcial' ? (
                      <View style={styles.detailRowGrid}>
                        <View style={{flex: 1}}>
                          <Text style={styles.detailLabel}>Monto Cubierto</Text>
                          <Text style={[styles.detailValue, {color: '#10B981'}]}>${gastoSeleccionado.monto_pagado?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</Text>
                        </View>
                        <View style={{flex: 1}}>
                          <Text style={styles.detailLabel}>Saldo Pendiente</Text>
                          <Text style={[styles.detailValue, {color: '#DC2626'}]}>${(gastoSeleccionado.monto - (gastoSeleccionado.monto_pagado || 0)).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</Text>
                        </View>
                      </View>
                    ) : null}

                    <View style={styles.detailRowGrid}>
                      <View style={{flex: 1}}>
                        <Text style={styles.detailLabel}>Proveedor / Emisor</Text>
                        <Text style={styles.detailValue}>{gastoSeleccionado.proveedor || 'No especificado'}</Text>
                      </View>
                      <View style={{flex: 1}}>
                        <Text style={styles.detailLabel}>Fecha de Registro</Text>
                        <Text style={styles.detailValue}>{new Date(gastoSeleccionado.fecha).toLocaleDateString('es-MX')}</Text>
                      </View>
                    </View>

                    {gastoSeleccionado.cantidad ? (
                      <View style={styles.detailRowGrid}>
                        <View style={{flex: 1}}>
                          <Text style={styles.detailLabel}>Cantidad</Text>
                          <Text style={styles.detailValue}>{gastoSeleccionado.cantidad} {gastoSeleccionado.unidad || 'U.'}</Text>
                        </View>
                        <View style={{flex: 1}}>
                          <Text style={styles.detailLabel}>P. Unitario</Text>
                          <Text style={styles.detailValue}>${(gastoSeleccionado.monto / gastoSeleccionado.cantidad).toFixed(2)}</Text>
                        </View>
                      </View>
                    ) : null}
                  </View>

                  {isAdmin ? (
                    <View style={{ marginTop: 25, gap: 12 }}>
                      {gastoSeleccionado.estado_pago !== 'pagado' ? (
                        <TouchableOpacity 
                          style={[styles.editActionBtn, { backgroundColor: '#F59E0B', width: '100%' }]} 
                          onPress={() => handleRegistrarAbonoDesdeDetalle(gastoSeleccionado)}
                        >
                          <Feather name="plus-circle" size={16} color="#FFF" />
                          <Text style={styles.editActionBtnText}>Abonar a Deuda</Text>
                        </TouchableOpacity>
                      ) : null}

                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <TouchableOpacity style={styles.editActionBtn} onPress={() => iniciarEdicion(gastoSeleccionado)}>
                          <Feather name="edit-2" size={16} color="#FFF" />
                          <Text style={styles.editActionBtnText}>Editar Registro</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity style={styles.deleteActionBtn} onPress={() => handleEliminarGasto(gastoSeleccionado.id, gastoSeleccionado.concepto)}>
                          <Feather name="trash-2" size={16} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : null}
                </ScrollView>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* ✏️ MODAL FORMULARIO DE ALTA / EDICIÓN */}
      <Modal visible={isFormModalVisible} animationType="slide" transparent={true} onRequestClose={() => { setIsFormModalVisible(false); limpiarFormulario(); }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { setIsFormModalVisible(false); limpiarFormulario(); }} />
          
          <View style={[styles.modalContent, { maxHeight: '90%', paddingBottom: Platform.OS === 'ios' ? 40 : 25 }]}>
            
            <View style={{ alignItems: 'center', marginBottom: 15 }}>
              <View style={{ width: 45, height: 6, backgroundColor: '#E2E8F0', borderRadius: 10 }} />
            </View>

            <View style={styles.modalHeaderTitleRow}>
              <Text style={styles.modalTitle}>{isEditing ? 'Editar Gasto' : 'Registrar Gasto'}</Text>
              <TouchableOpacity onPress={() => { setIsFormModalVisible(false); limpiarFormulario(); }}>
                <Feather name="x" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView 
              showsVerticalScrollIndicator={false} 
              keyboardShouldPersistTaps="handled"
              onScrollEndDrag={(e) => {
                if (e.nativeEvent.contentOffset.y < -50) {
                  setIsFormModalVisible(false);
                  limpiarFormulario();
                }
              }}
            >
              <Text style={styles.modalLabel}>Clasificación del Rubro</Text>
              <View style={styles.categorySelectorContainer}>
                <TouchableOpacity style={[styles.catBtn, categoriaForm === 'material' ? styles.catActiveMaterial : null]} onPress={() => setCategoriaForm('material')}>
                  <Text style={[styles.catText, categoriaForm === 'material' ? styles.catTextActive : null]}>📦 Material</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.catBtn, categoriaForm === 'administrativo' ? styles.catActiveAdmin : null]} onPress={() => setCategoriaForm('administrativo')}>
                  <Text style={[styles.catText, categoriaForm === 'administrativo' ? styles.catTextActive : null]}>📄 Admin</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.catBtn, categoriaForm === 'burocrata' ? styles.catActiveBuro : null]} onPress={() => setCategoriaForm('burocrata')}>
                  <Text style={[styles.catText, categoriaForm === 'burocrata' ? styles.catTextActive : null]}>🛡️ Burócrata</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.catBtn, categoriaForm === 'asesoria' ? styles.catActiveAsesoria : null]} onPress={() => setCategoriaForm('asesoria')}>
                  <Text style={[styles.catText, categoriaForm === 'asesoria' ? styles.catTextActive : null]}>👥 Asesoría</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.modalLabel}>Comprobante / Ticket / Factura (Opcional)</Text>
              <TouchableOpacity 
                onPress={seleccionarFotoComprobante}
                style={{ height: 100, backgroundColor: '#F8FAFC', borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 5, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', borderStyle: 'dashed' }}
              >
                {fotoComprobante ? (
                  <View style={{ width: '100%', height: '100%' }}>
                    <Image source={{ uri: fotoComprobante }} style={{ width: '100%', height: '100%' }} />
                    <View style={{ position: 'absolute', backgroundColor: 'rgba(0,0,0,0.6)', bottom: 0, width: '100%', padding: 5, alignItems: 'center' }}>
                      <Text style={{ color: '#FFF', fontSize: 11, fontWeight: 'bold' }}>Cambiar Foto</Text>
                    </View>
                  </View>
                ) : (
                  <View style={{ alignItems: 'center' }}>
                    <Feather name="camera" size={28} color="#94A3B8" />
                    <Text style={{ color: '#64748B', marginTop: 8, fontSize: 12 }}>Añadir foto del comprobante</Text>
                  </View>
                )}
              </TouchableOpacity>

              <Text style={styles.modalLabel}>Estado de Pago</Text>
              <View style={{flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 10, padding: 4, marginBottom: 10}}>
                <TouchableOpacity style={[styles.pagoBtn, estadoPagoForm === 'pagado' ? {backgroundColor: '#10B981'} : null]} onPress={() => setEstadoPagoForm('pagado')}>
                  <Text style={[styles.pagoBtnText, estadoPagoForm === 'pagado' ? {color: '#FFF'} : null]}>Liquidado</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.pagoBtn, estadoPagoForm === 'abono_parcial' ? {backgroundColor: '#F59E0B'} : null]} onPress={() => setEstadoPagoForm('abono_parcial')}>
                  <Text style={[styles.pagoBtnText, estadoPagoForm === 'abono_parcial' ? {color: '#FFF'} : null]}>Abono</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.pagoBtn, estadoPagoForm === 'credito' ? {backgroundColor: '#EF4444'} : null]} onPress={() => setEstadoPagoForm('credito')}>
                  <Text style={[styles.pagoBtnText, estadoPagoForm === 'credito' ? {color: '#FFF'} : null]}>Por Pagar</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.rowInputs}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.modalLabel}>Unidad de Medida</Text>
                  <TextInput style={styles.modalInput} placeholder="Ej. Pzas / Ton" placeholderTextColor="#94A3B8" value={unidad} onChangeText={setUnidad} />
                </View>

                <View style={{ flex: 1 }}>
                  {estadoPagoForm === 'abono_parcial' ? (
                    <View>
                      <Text style={[styles.modalLabel, {color: '#D97706'}]}>¿Cuánto se abona? ($)</Text>
                      <TextInput 
                        style={[styles.modalInput, {borderColor: '#F59E0B', fontWeight: 'bold'}]} 
                        placeholder="0.00" 
                        keyboardType="numeric" 
                        value={montoAbonadoForm} 
                        onChangeText={(v) => setMontoAbonadoForm(v.replace(/[^0-9.]/g, ''))} 
                      />
                    </View>
                  ) : (
                    <View style={{ opacity: 0.4 }}>
                      <Text style={styles.modalLabel}>Monto Abonado</Text>
                      <TextInput style={styles.modalInput} editable={false} placeholder="N/A" placeholderTextColor="#94A3B8" />
                    </View>
                  )}
                </View>
              </View>

              <Text style={styles.textConceptoLabel}>Concepto o Descripción</Text>
              <TextInput style={styles.modalInput} placeholder="Ej. Varilla de 3/8, Licencia estatal..." placeholderTextColor="#94A3B8" value={concepto} onChangeText={setConcepto} />

              <View style={styles.rowInputs}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.modalLabel}>Cantidad</Text>
                  <TextInput style={styles.modalInput} placeholder="Ej. 1" keyboardType="numeric" value={cantidad} onChangeText={(v) => setCantidad(v.replace(/[^0-9.]/g, ''))} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalLabel}>Precio Unitario ($)</Text>
                  <TextInput style={[styles.modalInput, {fontWeight: 'bold'}]} placeholder="0.00" keyboardType="numeric" value={precioUnitario} onChangeText={(v) => setPrecioUnitario(v.replace(/[^0-9.]/g, ''))} />
                </View>
              </View>

              <View style={styles.totalCalculadoBox}>
                <View>
                  <Text style={{ fontSize: 12, color: '#64748B', fontWeight: '600' }}>Importe Total:</Text>
                  <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1E293B' }}>
                    ${montoTotalCalculado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </Text>
                </View>
                {estadoPagoForm === 'abono_parcial' ? (
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 12, color: '#DC2626', fontWeight: '600' }}>Resta Deuda:</Text>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#DC2626' }}>
                      ${saldoRestanteCalculado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </Text>
                  </View>
                ) : null}
              </View>

              <Text style={styles.modalLabel}>Número de Cotización (Opcional)</Text>
              <TextInput style={styles.modalInput} placeholder="Ej. COT-OBRA-023" placeholderTextColor="#94A3B8" autoCapitalize="characters" value={numeroCotizacion} onChangeText={setNumeroCotizacion} />

              <Text style={styles.modalLabel}>{getProveedorLabel()}</Text>
              <TextInput style={styles.modalInput} placeholder="Nombre o Razón social..." placeholderTextColor="#94A3B8" value={proveedor} onChangeText={setProveedor} />

              <TouchableOpacity style={styles.saveBtn} onPress={handleGuardarGasto} disabled={isSaving}>
                {isSaving ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.saveBtnText}>{isEditing ? 'Guardar Cambios' : 'Registrar en Bitácora'}</Text>
                )}
              </TouchableOpacity>
              
              <View style={{height: 40}} /> 
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  header: { backgroundColor: '#2563EB', paddingTop: 60, paddingBottom: 25, paddingHorizontal: 25, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, elevation: 5, boxShadow: '0px 0px 10px rgba(0, 0, 0, 0.2)',   },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { padding: 5, marginLeft: -10 },
  headerSubtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: 'bold', letterSpacing: 1.5 },
  headerTitle: { color: '#FFF', fontSize: 28, fontWeight: 'bold', marginTop: 15 },
  projectBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginTop: 8 },
  projectName: { color: '#FFF', fontSize: 12, fontWeight: '600', marginLeft: 5 },
  
  body: { padding: 20, paddingBottom: 120 },
  exportContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, gap: 12 },
  bigExportBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, elevation: 2, boxShadow: '0px 0px 4px rgba(0, 0, 0, 0.1)',   },
  bigExportText: { color: '#FFF', fontSize: 13, fontWeight: 'bold', marginLeft: 8 },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', color: '#334155', textTransform: 'uppercase' },
  countBadge: { backgroundColor: '#E2E8F0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  countText: { fontSize: 11, color: '#64748B', fontWeight: 'bold' },
  
  webFiltersRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 15,
    zIndex: 50,
  },
  filterLabelMini: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    marginBottom: 4,
    marginLeft: 4,
  },
  filterDropdownTrigger: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  filterDropdownTriggerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  filterAbsoluteMenu: {
    position: 'absolute',
    top: 62, 
    left: 0,
    right: 0,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    elevation: 5,
    boxShadow: '0px 0px 8px rgba(0, 0, 0, 0.08)', 
    
    
    overflow: 'hidden',
    zIndex: 100,
  },
  filterMenuOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  filterMenuOptionSelected: {
    backgroundColor: '#EFF6FF',
  },
  filterMenuOptionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  filterMenuOptionTextSelected: {
    color: '#2563EB',
    fontWeight: '700',
  },

  emptyText: { textAlign: 'center', color: '#94A3B8', marginTop: 60, fontStyle: 'italic' },
  
  gastoCard: { backgroundColor: '#FFF', padding: 16, borderRadius: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, elevation: 2, boxShadow: '0px 0px 6px rgba(0, 0, 0, 0.05)',   },
  cardStatusIconContainer: { marginRight: 14, justifyContent: 'center', alignItems: 'center' },
  gastoConcepto: { fontSize: 15, fontWeight: 'bold', color: '#1E293B' },
  gastoDetalleTexto: { fontSize: 11, color: '#475569', fontWeight: '600' },
  cotizacionCardBadge: { fontSize: 10, color: '#2563EB', backgroundColor: '#EFF6FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, fontWeight: '700', borderWidth: 1, borderColor: '#BFDBFE' },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  badge: { fontSize: 9, fontWeight: 'bold', paddingVertical: 3, paddingHorizontal: 6, borderRadius: 6, overflow: 'hidden' },
  gastoFecha: { fontSize: 11, color: '#94A3B8', marginLeft: 8 },
  gastoMonto: { fontSize: 18, fontWeight: 'bold', color: '#0F172A' },

  fab: { position: 'absolute', bottom: 35, right: 25, width: 65, height: 65, borderRadius: 32.5, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center', elevation: 8, boxShadow: '0px 0px 10px rgba(37, 99, 235, 0.4)',   },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, paddingBottom: 45 },
  modalHeaderTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#0F172A' },
  
  modalLabel: { fontSize: 12, fontWeight: '700', color: '#475569', marginTop: 15, marginBottom: 6 },
  textConceptoLabel: { fontSize: 12, fontWeight: '700', color: '#475569', marginTop: 15, marginBottom: 6 },
  
  modalInput: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 12, fontSize: 14, color: '#0F172A' },
  rowInputs: { flexDirection: 'row', justifyContent: 'space-between' },
  
  categorySelectorContainer: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#F1F5F9', borderRadius: 15, padding: 6, gap: 6 },
  catBtn: { flex: 1, minWidth: '45%', paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  catText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  catTextActive: { color: '#FFF' },
  
  catActiveMaterial: { backgroundColor: '#D97706' },
  catActiveAdmin: { backgroundColor: '#0284C7' },
  catActiveBuro: { backgroundColor: '#DC2626' },
  catActiveAsesoria: { backgroundColor: '#7C3AED' },
  
  pagoBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8 },
  pagoBtnText: { fontSize: 12, fontWeight: 'bold', color: '#64748B' },

  saveBtn: { backgroundColor: '#1E293B', padding: 16, borderRadius: 15, alignItems: 'center', marginTop: 30 },
  saveBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  
  totalCalculadoBox: { backgroundColor: '#F8FAFC', padding: 14, borderRadius: 12, marginTop: 12, borderWidth: 1, borderColor: '#E2E8F0', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  modalOverlayDetail: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.7)', justifyContent: 'center', padding: 20 },
  detailModalContent: { backgroundColor: '#FFF', borderRadius: 24, padding: 24, boxShadow: '0px 10px 20px rgba(0, 0, 0, 0.25)',     elevation: 10, maxHeight: '90%' },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 },
  detailTitleBox: { flex: 1, paddingRight: 15 },
  detailTitleCat: { fontSize: 11, fontWeight: 'bold', color: '#2563EB', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  detailTitleMain: { fontSize: 18, fontWeight: 'bold', color: '#1E293B' },
  detailCloseBtn: { padding: 6, backgroundColor: '#F1F5F9', borderRadius: 10 },
  detailAmount: { fontSize: 32, fontWeight: '900', color: '#0F172A', marginBottom: 10 },
  
  detailFotoContainer: { width: '100%', height: 180, borderRadius: 16, overflow: 'hidden', marginBottom: 15, backgroundColor: '#E2E8F0', borderWidth: 1, borderColor: '#CBD5E1' },
  detailFoto: { width: '100%', height: '100%' },

  detailDataBox: { backgroundColor: '#F8FAFC', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E2E8F0', gap: 16 },
  detailRowGrid: { flexDirection: 'row', gap: 16 },
  detailLabel: { fontSize: 10, fontWeight: 'bold', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 4 },
  detailValue: { fontSize: 14, fontWeight: '600', color: '#1E293B' },
  
  editActionBtn: { flex: 1, backgroundColor: '#1E293B', padding: 14, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  editActionBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 13, marginLeft: 8 },
  deleteActionBtn: { backgroundColor: '#FEF2F2', padding: 14, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#FECACA' }
});