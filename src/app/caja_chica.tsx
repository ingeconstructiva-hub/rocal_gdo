'use client';

import { Feather } from '@expo/vector-icons';
import Almacen from '../lib/almacen';
import { guardarEnBandeja } from '../lib/bandeja';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
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
import { SkeletonLista } from '../components/Skeleton';
import { guardarArchivoLocal } from '../lib/archivos';
import { subirArchivo } from '../lib/subidas';
import { exportarPDF, exportarTexto } from '../lib/exportar';
import { regresar } from '../lib/navegar';
import { firmarCampos } from '../lib/urlsFirmadas';
import { FotoSinConexion } from '../components/FotoSinConexion';
import { Aviso } from '../lib/aviso';
import { useProject } from '../context/ProjectContext';
import { useUser } from '../context/UserContext';
import { supabase } from '../lib/supabase';
import { esDeHoy, eliminarRegistro } from '../lib/permisos';
import { generarPlantillaCajaChica } from '../utils/pdfCajaChica';

interface ArticuloGasto {
  id: string;
  concepto: string;
  cantidad: string;
  unidad: string;
  precioUnitario: string;
}

interface MovimientoFinanciero {
  id: string;
  tipo: 'ingreso' | 'egreso';
  concepto: string;
  encargado: string;
  unidad?: string;
  monto: number;
  precio_unitario?: number;
  cantidad?: number;
  tipo_deposito: string;
  numero_nota?: string;
  foto_ticket: string | null;
  fecha: string;
  created_at?: string;
  detalles_json?: any; 
}

export default function CajaChicaScreen() {
  const router = useRouter();
  const { activeProject, isOffline } = useProject();
  const { profile } = useUser(); 

  const [movimientos, setMovimientos] = useState<MovimientoFinanciero[]>([]);
  const [filtroActivo, setFiltroActivo] = useState<'todos' | 'ingreso' | 'egreso'>('todos');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [isFormModalVisible, setIsFormModalVisible] = useState(false);
  const [movimientoSeleccionado, setMovimientoSeleccionado] = useState<MovimientoFinanciero | null>(null);
  const [trabajadores, setTrabajadores] = useState<any[]>([]);

  const [isEditing, setIsEditing] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);

  const [tipoMovimientoForm, setTipoMovimientoForm] = useState<'ingreso' | 'egreso'>('egreso');
  const [isSaving, setIsSaving] = useState(false);

  const [articulos, setArticulos] = useState<ArticuloGasto[]>([
    { id: Date.now().toString(), concepto: '', cantidad: '1', unidad: '', precioUnitario: '' }
  ]);

  const [numeroNota, setNumeroNota] = useState('');
  const [encargado, setEncargado] = useState('');
  const [frenteUnidad, setFrenteUnidad] = useState('');
  const [tipoDeposito, setTipoDeposito] = useState<'efectivo' | 'transferencia'>('efectivo');
  const [justificacionGeneral, setJustificacionGeneral] = useState(''); 
  const [fotoTicket, setFotoTicket] = useState<string | null>(null);
  const [importeInvertido, setImporteInvertido] = useState(''); 
  const [searchQuery, setSearchQuery] = useState('');

  const isAdminOrOficina = profile?.role === 'admin' || profile?.role === 'oficina';
  const esResidente = profile?.role === 'residente';
  /* El residente puede quitar un movimiento que acaba de capturar: un monto o
   * un concepto mal teclado. Se mide con la fecha de captura ('created_at'),
   * no con 'fecha', porque esa última la puede escribir el usuario. */
  const puedeBorrarResidente = (mov: MovimientoFinanciero) =>
    esResidente && esDeHoy(mov.created_at || mov.fecha);
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  // Cálculos reactivos de balance global de caja
  const totalIngresos = movimientos.filter(m => m.tipo === 'ingreso').reduce((sum, m) => sum + m.monto, 0);
  const totalEgresos = movimientos.filter(m => m.tipo === 'egreso').reduce((sum, m) => sum + m.monto, 0);
  const saldoDisponible = totalIngresos - totalEgresos;

  // Filtrado reactivo por tipo de movimiento (todos/ingreso/egreso) y texto de búsqueda
  const movimientosFiltrados = useMemo(() => {
    let filtrados = movimientos;
    if (filtroActivo !== 'todos') {
      filtrados = filtrados.filter(m => m.tipo === filtroActivo);
    }
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      filtrados = filtrados.filter(m => {
        const matchEncargado = m.encargado?.toLowerCase().includes(query);
        const matchNota = m.numero_nota?.toLowerCase().includes(query);
        return matchEncargado || matchNota;
      });
    }
    return filtrados;
  }, [movimientos, filtroActivo, searchQuery]);

  /**
   * 📌 NOTA: handleExportarPDF
   * Genera el estado financiero de caja chica en formato PDF y abre el diálogo nativo para compartirlo.
   */
  const handleExportarPDF = async () => {
    if (movimientos.length === 0) {
      Aviso.alert("Sin datos", "No hay movimientos registrados para exportar.");
      return;
    }
    setIsExportingPDF(true);
    try {
      const htmlContent = generarPlantillaCajaChica(
        activeProject?.name || 'Obra Sin Nombre',
        saldoDisponible,
        totalIngresos,
        totalEgresos,
        movimientosFiltrados
      );
      
      await exportarPDF(htmlContent, 'Caja_Chica.pdf');
    } catch (error: any) {
      Aviso.alert("Error PDF", error.message);
    } finally {
      setIsExportingPDF(false);
    }
  };

  /**
   * 📌 NOTA: useEffect (Carga inicial de obra)
   * Dispara la consulta del libro mayor y la lista de personal al cambiar de obra o estado offline.
   */
  useEffect(() => {
    if (activeProject?.id) {
      loadLibroMayor();
      loadTrabajadores(); 
    }
  }, [activeProject, isOffline]);

  /**
   * 📌 NOTA: onRefresh
   * Ejecuta la recarga manual de ingresos, egresos y personal mediante Pull-to-Refresh.
   */
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadLibroMayor();
    await loadTrabajadores();
    setRefreshing(false);
  }, [activeProject, isOffline]);

  /**
   * 📌 NOTA: loadTrabajadores
   * Carga el catálogo de trabajadores activos de la obra para autocompletar responsables.
   */
  const loadTrabajadores = async () => {
    const pid = activeProject?.id;
    if (!pid) return;
    try {
      const storageKey = `@lista_workers_${pid}`;
      const cached = await Almacen.getItem(storageKey);
      if (cached) setTrabajadores(JSON.parse(cached));

      if (!isOffline) {
        const { data, error } = await supabase.from('workers').select('id, name_worker, role').eq('project_id', pid).eq('is_active', true).order('name_worker', { ascending: true });
        if (data && !error) { setTrabajadores(data); await Almacen.setItem(storageKey, JSON.stringify(data)); }
      }
    } catch (e) { console.log(e); }
  };

  /**
   * 📌 NOTA: loadLibroMayor
   * Consulta las tablas 'caja_chica' (egresos) e 'ingresos_obra' (ingresos),
   * unifica ambos historiales cronológicamente y gestiona la caché local.
   */
  useRefrescar(() => loadLibroMayor());

  const loadLibroMayor = async () => {
    setLoading(true);
    const pid = activeProject?.id;
    if (!pid) return;

    try {
      let listaEgresos: any[] = [];
      let listaIngresos: any[] = [];

      if (isOffline) {
        const cachedCaja = await Almacen.getItem(`@caja_chica_cache_${pid}`);
        const cachedIngresos = await Almacen.getItem(`@ingresos_cache_${pid}`);
        listaEgresos = cachedCaja ? JSON.parse(cachedCaja) : [];
        listaIngresos = cachedIngresos ? JSON.parse(cachedIngresos) : [];
      } else {
        const { data: egresos } = await supabase.from('caja_chica').select('*').eq('project_id', pid).eq('is_active', true);
        const { data: ingresos } = await supabase.from('ingresos_obra').select('*').eq('project_id', pid).eq('is_active', true);
        listaEgresos = egresos || [];
        listaIngresos = ingresos || [];
        await Almacen.setItem(`@caja_chica_cache_${pid}`, JSON.stringify(listaEgresos));
        await Almacen.setItem(`@ingresos_cache_${pid}`, JSON.stringify(listaIngresos));
      }

      const egresosFormateados: MovimientoFinanciero[] = listaEgresos.map(e => ({
        id: e.id,
        tipo: 'egreso',
        concepto: e.concepto,
        encargado: e.encargado,
        unidad: e.unidad,
        monto: Number(e.monto),
        precio_unitario: Number(e.precio_unitario || 0),
        cantidad: Number(e.cantidad || 1),
        tipo_deposito: e.tipo_deposito,
        numero_nota: e.numero_nota,
        foto_ticket: e.foto_ticket,
        fecha: e.fecha,
        created_at: e.created_at,
        detalles_json: e.detalles_json
      }));

      const ingresosFormateados: MovimientoFinanciero[] = listaIngresos.map(i => ({
        id: i.id,
        tipo: 'ingreso',
        concepto: i.concepto,
        encargado: i.solicitante || 'Administración',
        monto: Number(i.monto),
        tipo_deposito: i.referencia || 'Depósito',
        foto_ticket: null,
        fecha: i.fecha,
        created_at: i.created_at
      }));

      const historialUnificado = [...ingresosFormateados, ...egresosFormateados].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
      setMovimientos(await firmarCampos(historialUnificado, ['foto_ticket']));
    } catch (e) { console.log(e); } finally { setLoading(false); }
  };

  /**
   * 📌 NOTA: seleccionarFoto
   * Abre la cámara del dispositivo para capturar la evidencia física del ticket de compra.
   */
  const seleccionarFoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Aviso.alert("Permiso", "Necesitamos acceso a la cámara."); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.6 });
    if (!result.canceled) setFotoTicket(result.assets[0].uri);
  };

  /**
   * 📌 NOTA: agregarArticulo
   * Inserta un nuevo renglón de insumo dentro del desglose del ticket actual.
   */
  const agregarArticulo = () => {
    setArticulos([...articulos, { id: Date.now().toString(), concepto: '', cantidad: '1', unidad: '', precioUnitario: '' }]);
  };

  /**
   * 📌 NOTA: eliminarArticulo
   * Quita un artículo específico de la lista del formulario.
   */
  const eliminarArticulo = (id: string) => {
    if (articulos.length === 1) return;
    setArticulos(articulos.filter(art => art.id !== id));
  };

  /**
   * 📌 NOTA: actualizarArticulo
   * Actualiza en tiempo real el valor de un campo específico (concepto, cantidad, precio) de un insumo.
   */
  const actualizarArticulo = (id: string, campo: keyof ArticuloGasto, valor: string) => {
    setArticulos(articulos.map(art => art.id === id ? { ...art, [campo]: valor } : art));
  };

  // Cálculo de la suma total del ticket
  const gastoCalculado = articulos.reduce((total, art) => {
    const cant = Number(art.cantidad) || 0;
    const precio = Number(art.precioUnitario) || 0;
    return total + (cant * precio);
  }, 0);

  /**
   * 📌 NOTA: iniciarEdicion
   * Prepara los estados del formulario con la información del movimiento seleccionado para su edición.
   */
  const iniciarEdicion = (mov: MovimientoFinanciero) => {
    Keyboard.dismiss();
    setMovimientoSeleccionado(null);
    setIsEditing(true);
    setEditingRecordId(mov.id);
    setTipoMovimientoForm(mov.tipo);
    setEncargado(mov.encargado);
    setTipoDeposito(mov.tipo_deposito as 'efectivo' | 'transferencia');
    setFotoTicket(mov.foto_ticket);

    if (mov.tipo === 'ingreso') {
      setImporteInvertido(mov.monto.toString());
    } else {
      setNumeroNota(mov.numero_nota || '');
      setFrenteUnidad(mov.unidad || '');
      setJustificacionGeneral(mov.concepto.includes('Nota:') ? mov.concepto.split('Nota:')[1].trim() : '');
      
      if (mov.detalles_json && Array.isArray(mov.detalles_json)) {
        setArticulos(mov.detalles_json);
      } else {
        setArticulos([{
          id: Date.now().toString(),
          concepto: mov.concepto,
          cantidad: mov.cantidad?.toString() || '1',
          unidad: mov.unidad || '',
          precioUnitario: mov.precio_unitario?.toString() || ''
        }]);
      }
    }
    setIsFormModalVisible(true);
  };

  /**
   * 📌 NOTA: handleGuardarOLlamarActualizar
   * Enrutador para guardar un movimiento nuevo o actualizar uno existente según el estado 'isEditing'.
   */
  const handleGuardarOLlamarActualizar = () => {
    Keyboard.dismiss();
    if (isEditing) handleActualizarMovimiento();
    else handleCrearNuevoMovimiento();
  };

  /**
   * 📌 NOTA: procesarDatosEgreso
   * Valida y formatea el payload de un egreso de caja con su desglose en JSON y monto acumulado.
   */
  const procesarDatosEgreso = () => {
    const articulosValidos = articulos.filter(a => a.concepto.trim() !== '' && Number(a.precioUnitario) > 0);
    if (articulosValidos.length === 0) throw new Error("Debes registrar al menos un artículo válido con precio.");
    
    const conceptoResumido = articulosValidos.map(a => `${a.cantidad}x ${a.concepto}`).join(', ');
    const conceptoFinal = justificacionGeneral.trim() ? `${conceptoResumido} (Nota: ${justificacionGeneral.trim()})` : conceptoResumido;

    return {
      numero_nota: numeroNota.trim() || 'S/N',
      encargado: encargado.trim(),
      monto: gastoCalculado,
      unidad: frenteUnidad.trim() || 'General',
      tipo_deposito: tipoDeposito,
      concepto: conceptoFinal,
      justificacion: justificacionGeneral.trim(),
      detalles_json: articulosValidos,
      cantidad: articulosValidos.reduce((acc, a) => acc + (Number(a.cantidad) || 1), 0),
      precio_unitario: gastoCalculado,
      is_active: true
    };
  };

  /**
   * 📌 NOTA: handleCrearNuevoMovimiento
   * Inserta un nuevo ingreso en 'ingresos_obra' o un nuevo egreso en 'caja_chica',
   * subiendo la foto del ticket al bucket de almacenamiento si existe.
   */
  const handleCrearNuevoMovimiento = async () => {
    const pid = activeProject?.id;
    if (!pid) return;

    setIsSaving(true);
    try {
      if (tipoMovimientoForm === 'ingreso') {
        if (!importeInvertido.trim() || !encargado.trim()) throw new Error("El importe y el solicitante son obligatorios.");
        const nuevoIngreso = {
          project_id: pid,
          monto: Number(importeInvertido),
          concepto: `Fondeo a: ${encargado.trim()}`,
          referencia: tipoDeposito,
          is_active: true,
          fecha: new Date().toISOString()
        };

        if (isOffline) {
          // Sin internet va a la bandeja de salida, NO se pierde.
          await guardarEnBandeja('@bandeja_salida_ingresos', { ...nuevoIngreso, local_uuid: Crypto.randomUUID() });
        } else {
          await supabase.from('ingresos_obra').insert([nuevoIngreso]);
        }
      } else {
        if (!encargado.trim()) throw new Error("El nombre del encargado es obligatorio.");

        const baseEgreso = procesarDatosEgreso();
        let fotoUrl = null;

        if (fotoTicket && !isOffline) {
          // Bucket 'tickets_caja_chica'. Antes decía 'tickets', que no existe en
          // Supabase, y como el error se ignoraba, el gasto se guardaba sin foto
          // sin avisarle a nadie.
          fotoUrl = await subirArchivo(fotoTicket, 'tickets_caja_chica', { prefijo: 'ticket' });
        }

        const nuevoGasto = { ...baseEgreso, project_id: pid, foto_ticket: fotoUrl, fecha: new Date().toISOString() };

        if (isOffline) {
          // Sin internet va a la bandeja de salida. La foto se queda apuntada
          // como archivo local y se sube junto con el gasto al volver la señal.
          // Guardamos los bytes de la foto, no su dirección temporal: en el
          // navegador esa dirección deja de servir al recargar la página.
          const fotoGuardada = fotoTicket ? await guardarArchivoLocal(fotoTicket) : null;

          await guardarEnBandeja('@bandeja_salida_caja', {
            ...nuevoGasto,
            foto_local_uri: fotoGuardada,
            local_uuid: Crypto.randomUUID(),
          });
        } else {
          await supabase.from('caja_chica').insert([nuevoGasto]);
        }
      }
      Aviso.alert(
        isOffline ? "Guardado sin conexión" : "¡Éxito!",
        isOffline
          ? "El movimiento quedó guardado en este dispositivo y se subirá solo cuando vuelva el internet."
          : "Movimiento financiero registrado."
      );
      cerrarModalYLimpiar();
      loadLibroMayor();
    } catch (e: any) { Aviso.alert("Atención", e.message); } finally { setIsSaving(false); }
  };

  /**
   * 📌 NOTA: handleActualizarMovimiento
   * Actualiza en Supabase los datos de un registro de ingreso o egreso previamente guardado.
   */
  const handleActualizarMovimiento = async () => {
    const pid = activeProject?.id;
    if (!pid || !editingRecordId) return;

    setIsSaving(true);
    try {
      if (tipoMovimientoForm === 'ingreso') {
        if (!importeInvertido.trim() || !encargado.trim()) throw new Error("Importe y solicitante son obligatorios.");
        if (!isOffline) {
          await supabase.from('ingresos_obra').update({ 
            monto: Number(importeInvertido), 
            solicitante: encargado.trim(), 
            referencia: tipoDeposito, 
            concepto: `Fondeo a: ${encargado.trim()}` 
          }).eq('id', editingRecordId);
        }
      } else {
        if (!encargado.trim()) throw new Error("El encargado es obligatorio.");
        const baseEgreso = procesarDatosEgreso();
        if (!isOffline) await supabase.from('caja_chica').update(baseEgreso).eq('id', editingRecordId);
      }

      Aviso.alert("¡Éxito!", "Registro actualizado en el Libro Mayor.");
      cerrarModalYLimpiar();
      loadLibroMayor();
    } catch (e: any) { Aviso.alert("Atención", e.message); } finally { setIsSaving(false); }
  };

  /**
   * 📌 NOTA: handleEliminarMovimiento
   * Ejecuta un borrado físico permanente (.delete()) en Supabase para ingresos o egresos,
   * manteniendo sincronizados y limpios los balances en el móvil y la plataforma web.
   */
  const handleEliminarMovimiento = async (id: string, tipo: 'ingreso' | 'egreso') => {
    if (isOffline) { Aviso.alert("Offline", "Necesitas internet para eliminar registros."); return; }
    Aviso.alert(
      "Eliminar Registro",
      esResidente
        ? "¿Quitar este movimiento? Dejará de contar en el balance. Si fue un error, un administrador puede recuperarlo."
        : "¿Deseas borrar permanentemente este movimiento del sistema?",
      [
      { text: "Cancelar", style: "cancel" },
      { 
        text: "Sí, eliminar", 
        style: "destructive", 
        onPress: async () => {
          try {
            const tabla = tipo === 'ingreso' ? 'ingresos_obra' : 'caja_chica';
            // El residente solo lo desactiva, así un borrado por equivocación se
            // puede recuperar. Admin y oficina sí borran definitivamente.
            const { error } = await eliminarRegistro(tabla, id, esResidente);
            if (error) throw error;
            
            setMovimientos(prev => prev.filter(m => m.id !== id));
            setMovimientoSeleccionado(null);
          } catch (e: any) { 
            Aviso.alert("Error al eliminar", e.message); 
          }
        }
      }
    ]);
  };

  /**
   * 📌 NOTA: cerrarModalYLimpiar
   * Cierra el formulario modal y restablece todos los campos a su estado inicial.
   */
  const cerrarModalYLimpiar = () => {
    setIsFormModalVisible(false); setIsEditing(false); setEditingRecordId(null);
    setNumeroNota(''); setEncargado(''); setFrenteUnidad(''); setJustificacionGeneral('');
    setFotoTicket(null); setImporteInvertido(''); setTipoMovimientoForm('egreso');
    setArticulos([{ id: Date.now().toString(), concepto: '', cantidad: '1', unidad: '', precioUnitario: '' }]);
  };

  /**
   * 📌 NOTA: toggleFiltro
   * Alterna el filtro visual de la lista entre todos, solo ingresos o solo egresos.
   */
  const toggleFiltro = (nuevoFiltro: 'ingreso' | 'egreso') => {
    setFiltroActivo(filtroActivo === nuevoFiltro ? 'todos' : nuevoFiltro);
  };

  /**
   * 📌 NOTA: handleExportarExcel
   * Construye un archivo CSV con la relación de caja chica y lo comparte a través de expo-sharing.
   */
  const handleExportarExcel = async () => {
    if (movimientos.length === 0) { Aviso.alert("Sin datos", "No hay movimientos registrados para exportar."); return; }
    try {
      const encabezados = ["Fecha", "Tipo", "No. Nota", "Concepto/Justificacion", "Responsable", "Unidad/Frente", "Metodo Pago", "Cantidad", "P.U. ($)", "Monto Total ($)\n"];
      const filas = movimientosFiltrados.map(g => {
        const fechaFormateada = new Date(g.fecha).toLocaleDateString('es-MX');
        const conceptoLimpio = g.concepto.replace(/,/g, ' ');
        const encargadoLimpio = g.encargado.replace(/,/g, ' ');
        const unidadLimpia = (g.unidad || '').replace(/,/g, ' ');
        return `${fechaFormateada},"${g.tipo}","${g.numero_nota || 'S/N'}","${conceptoLimpio}","${encargadoLimpio}","${unidadLimpia}","${g.tipo_deposito}",${g.cantidad || 1},${g.precio_unitario || g.monto},${g.monto}`;
      }).join("\n");

      const contenidoCSV = "\uFEFF" + encabezados.join(",") + filas;
      const nombreArchivo = `Caja_Chica_${activeProject?.name?.replace(/\s+/g, '_') || 'Obra'}.csv`;
      const fsModulo = FileSystem as any;
      await exportarTexto(contenidoCSV, nombreArchivo);
    } catch (error: any) { Aviso.alert("Error", error.message); }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={() => { Keyboard.dismiss(); regresar('/(tabs)/gastos'); }} style={styles.backButton}>
            <Feather name="chevron-left" size={28} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerSubtitle}>LIBRO MAYOR DE CAJA</Text>
        </View>
        <TouchableOpacity style={styles.summaryCardTouchable} activeOpacity={0.9} onPress={() => setFiltroActivo('todos')}>
          <Text style={styles.headerTitle}>Saldo Neto Disponible</Text>
          <Text style={styles.totalAmount}>${saldoDisponible.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</Text>
        </TouchableOpacity>
        <View style={styles.contrastContainer}>
          <TouchableOpacity style={[styles.contrastBox, filtroActivo === 'ingreso' ? styles.contrastBoxActive : null]} onPress={() => toggleFiltro('ingreso')}>
            <Text style={styles.contrastLabel}>📥 TOTAL INVERTIDO</Text>
            <Text style={[styles.contrastValueIngreso, filtroActivo === 'ingreso' ? { color: '#34D399' } : null]}>+${totalIngresos.toLocaleString('es-MX', { maximumFractionDigits: 0 })}</Text>
          </TouchableOpacity>
          <View style={styles.contrastDivider} />
          <TouchableOpacity style={[styles.contrastBox, filtroActivo === 'egreso' ? styles.contrastBoxActive : null]} onPress={() => toggleFiltro('egreso')}>
            <Text style={styles.contrastLabel}>📤 TOTAL GASTADO</Text>
            <Text style={[styles.contrastValueEgreso, filtroActivo === 'egreso' ? { color: '#F87171' } : null]}>-${totalEgresos.toLocaleString('es-MX', { maximumFractionDigits: 0 })}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} tintColor="#2563EB" />}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>{filtroActivo === 'todos' ? 'Historial de Movimientos' : filtroActivo === 'ingreso' ? 'Solo Inversiones' : 'Solo Gastos'}</Text>
          
          {isAdminOrOficina ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={handleExportarPDF} disabled={isExportingPDF} style={[styles.excelBtnHeader, { backgroundColor: '#DC2626' }]}>
                {isExportingPDF ? <ActivityIndicator size="small" color="#FFF" /> : (
                  <View style={{flexDirection: 'row', alignItems: 'center'}}>
                    <Feather name="file-text" size={14} color="#FFF" />
                    <Text style={styles.excelBtnText}>PDF</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={handleExportarExcel} style={styles.excelBtnHeader}>
                <Feather name="grid" size={14} color="#FFF" />
                <Text style={styles.excelBtnText}>Excel</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        {/* 🔍 BARRA DE BÚSQUEDA */}
        <View style={styles.searchContainer}>
          <Feather name="search" size={18} color="#94A3B8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por responsable o No. de nota..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
          {searchQuery.length > 0 ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Feather name="x-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          ) : null}
        </View> 

        {loading ? (
          <SkeletonLista filas={5} />
        ) : movimientosFiltrados.length === 0 ? (
          <Text style={styles.emptyText}>No hay registros.</Text>
        ) : (
          movimientosFiltrados.map((mov) => (
            <TouchableOpacity key={mov.id} style={styles.gastoCard} activeOpacity={0.7} onPress={() => setMovimientoSeleccionado(mov)}>
              <View style={styles.gastoMainRow}>
                <Feather name={mov.tipo === 'ingreso' ? "arrow-down-left" : "arrow-up-right"} size={24} color={mov.tipo === 'ingreso' ? "#10B981" : "#EF4444"} style={{ marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.gastoJustificacion} numberOfLines={2}>{mov.concepto}</Text>
                  <Text style={styles.gastoMeta}>{mov.encargado} • {new Date(mov.fecha).toLocaleDateString('es-MX')}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                  <Text style={[styles.gastoMonto, { color: mov.tipo === 'ingreso' ? '#10B981' : '#DC2626' }]}>
                    {mov.tipo === 'ingreso' ? '+' : '-'}${mov.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </Text>
                  {mov.foto_ticket ? <Feather name="paperclip" size={14} color="#94A3B8" style={{ marginTop: 4 }} /> : null}
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => setIsFormModalVisible(true)}>
        <Feather name="plus" size={28} color="#FFF" />
      </TouchableOpacity>

      {/* 🔍 MODAL DETALLES TIPO BOTTOM SHEET */}
      <Modal visible={!!movimientoSeleccionado} animationType="slide" transparent={true} onRequestClose={() => setMovimientoSeleccionado(null)}>
        <View style={styles.modalOverlayDetail}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMovimientoSeleccionado(null)} />
          <View style={styles.detailModalContent}>
            
            <View style={{ alignItems: 'center', marginBottom: 15 }}>
              <View style={{ width: 45, height: 6, backgroundColor: '#E2E8F0', borderRadius: 10 }} />
            </View>

            {movimientoSeleccionado ? (
              <View style={{ flex: 1 }}>
                <View style={styles.detailHeader}>
                  <View style={[styles.detailIconBox, { backgroundColor: movimientoSeleccionado.tipo === 'ingreso' ? '#D1FAE5' : '#FEE2E2' }]}>
                    <Feather name={movimientoSeleccionado.tipo === 'ingreso' ? "arrow-down-left" : "arrow-up-right"} size={28} color={movimientoSeleccionado.tipo === 'ingreso' ? "#10B981" : "#EF4444"} />
                  </View>
                  <TouchableOpacity onPress={() => setMovimientoSeleccionado(null)} style={styles.detailCloseBtn}>
                    <Feather name="x" size={24} color="#64748B" />
                  </TouchableOpacity>
                </View>

                <ScrollView 
                  showsVerticalScrollIndicator={false}
                  onScrollEndDrag={(e) => {
                    if (e.nativeEvent.contentOffset.y < -50) setMovimientoSeleccionado(null);
                  }}
                >
                  <Text style={styles.detailTitle}>{movimientoSeleccionado.tipo === 'ingreso' ? 'Inversión' : 'Ticket / Gasto'}</Text>
                  <Text style={[styles.detailAmount, { color: movimientoSeleccionado.tipo === 'ingreso' ? '#10B981' : '#DC2626' }]}>
                    {movimientoSeleccionado.tipo === 'ingreso' ? '+' : '-'}${movimientoSeleccionado.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </Text>

                  <View style={styles.detailDataBox}>
                    <View style={styles.detailRowGrid}>
                      <View style={{flex: 1}}><Text style={styles.detailLabel}>Responsable</Text><Text style={styles.detailValue}>{movimientoSeleccionado.encargado}</Text></View>
                      <View style={{flex: 1}}><Text style={styles.detailLabel}>Fecha</Text><Text style={styles.detailValue}>{new Date(movimientoSeleccionado.fecha).toLocaleDateString('es-MX')}</Text></View>
                    </View>

                    {movimientoSeleccionado.tipo === 'egreso' ? (
                      <View style={{ marginTop: 15, borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 15 }}>
                        <Text style={styles.detailLabel}>Detalle de Artículos</Text>
                        
                        {movimientoSeleccionado.detalles_json && Array.isArray(movimientoSeleccionado.detalles_json) ? (
                          movimientoSeleccionado.detalles_json.map((art: any, i: number) => (
                            <View key={i} style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6}}>
                              <Text style={{fontSize: 13, color: '#475569', flex: 1}}>{art.cantidad}x {art.concepto}</Text>
                              <Text style={{fontSize: 13, fontWeight: 'bold', color: '#1E293B'}}>${(Number(art.cantidad) * Number(art.precioUnitario)).toLocaleString('es-MX')}</Text>
                            </View>
                          ))
                        ) : (
                          <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                            <Text style={{fontSize: 13, color: '#475569'}}>{movimientoSeleccionado.cantidad}x {movimientoSeleccionado.concepto}</Text>
                            <Text style={{fontSize: 13, fontWeight: 'bold', color: '#1E293B'}}>${movimientoSeleccionado.monto.toLocaleString('es-MX')}</Text>
                          </View>
                        )}
                      </View>
                    ) : null}
                  </View>

                  {movimientoSeleccionado.foto_ticket ? (
                    <View style={{ marginTop: 20 }}>
                      <Text style={styles.detailLabel}>Evidencia Fotográfica</Text>
                      <TouchableOpacity onPress={() => Linking.openURL(movimientoSeleccionado.foto_ticket!)}>
                        {isOffline ? <FotoSinConexion alto={180} /> : <Image source={{ uri: movimientoSeleccionado.foto_ticket }} style={styles.detailTicketImage} resizeMode="cover" />}
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  {isAdminOrOficina ? (
                    <View style={styles.detailActionsRow}>
                      <TouchableOpacity style={styles.editActionBtn} onPress={() => iniciarEdicion(movimientoSeleccionado)}>
                        <Feather name="edit-2" size={16} color="#FFF" />
                        <Text style={styles.editActionBtnText}>Editar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.deleteActionBtn} onPress={() => handleEliminarMovimiento(movimientoSeleccionado.id, movimientoSeleccionado.tipo)}>
                        <Feather name="trash-2" size={16} color="#EF4444" />
                        <Text style={styles.deleteActionBtnText}>Borrar</Text>
                      </TouchableOpacity>
                    </View>
                  ) : puedeBorrarResidente(movimientoSeleccionado) ? (
                    <View style={styles.detailActionsRow}>
                      <TouchableOpacity style={styles.deleteActionBtn} onPress={() => handleEliminarMovimiento(movimientoSeleccionado.id, movimientoSeleccionado.tipo)}>
                        <Feather name="trash-2" size={16} color="#EF4444" />
                        <Text style={styles.deleteActionBtnText}>Borrar</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                  <View style={{height: 20}} />
                </ScrollView>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* ✏️ FORMULARIO DE ALTA Y EDICIÓN TIPO BOTTOM SHEET */}
      <Modal visible={isFormModalVisible} animationType="slide" transparent={true} onRequestClose={cerrarModalYLimpiar}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          
          <Pressable style={StyleSheet.absoluteFill} onPress={cerrarModalYLimpiar} />
          
          <View style={[styles.modalContent, { maxHeight: '90%', paddingBottom: Platform.OS === 'ios' ? 40 : 25 }]}>
            
            <View style={{ alignItems: 'center', marginBottom: 10 }}>
              <View style={{ width: 45, height: 6, backgroundColor: '#E2E8F0', borderRadius: 10 }} />
            </View>

            <View style={[styles.modalHeader, { borderBottomWidth: 0, paddingBottom: 10 }]}>
              <Text style={styles.modalTitle}>{isEditing ? '✏️ Editar Registro' : '➕ Nuevo Movimiento'}</Text>
              <TouchableOpacity onPress={cerrarModalYLimpiar}><Feather name="x" size={24} color="#6B7280" /></TouchableOpacity>
            </View>

            <ScrollView 
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              onScrollEndDrag={(e) => {
                if (e.nativeEvent.contentOffset.y < -50) cerrarModalYLimpiar();
              }}
            >
              {isAdminOrOficina && !isEditing ? (
                <View style={styles.formToggleContainer}>
                  <TouchableOpacity style={[styles.formToggleBtn, tipoMovimientoForm === 'ingreso' ? styles.toggleActiveIngreso : null]} onPress={() => setTipoMovimientoForm('ingreso')}>
                    <Text style={[styles.toggleText, tipoMovimientoForm === 'ingreso' ? styles.toggleTextActive : null]}>📥 Registrar Inversión</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.formToggleBtn, tipoMovimientoForm === 'egreso' ? styles.toggleActiveEgreso : null]} onPress={() => setTipoMovimientoForm('egreso')}>
                    <Text style={[styles.toggleText, tipoMovimientoForm === 'egreso' ? styles.toggleTextActive : null]}>📤 Registrar Gasto</Text>
                  </TouchableOpacity>
                </View>
              ) : isEditing ? (
                <View style={styles.editingTypeIndicator}>
                  <Text style={[styles.editingTypeText, {color: tipoMovimientoForm === 'ingreso' ? '#10B981' : '#EF4444'}]}>
                    Editando {tipoMovimientoForm === 'ingreso' ? 'Inversión' : 'Gasto'}
                  </Text>
                </View>
              ) : (
                <View style={[styles.formToggleContainer, { backgroundColor: '#FEE2E2' }]}>
                  <View style={[styles.formToggleBtn, styles.toggleActiveEgreso]}>
                    <Text style={[styles.toggleText, styles.toggleTextActive]}>📤 Registrar Gasto</Text>
                  </View>
                </View>
              )}

              {tipoMovimientoForm === 'ingreso' ? (
                <View>
                  <Text style={styles.modalLabel}>Importe Recibido ($)</Text>
                  <TextInput style={styles.modalInput} placeholderTextColor="#94A3B8" placeholder="Ej. 5000" keyboardType="numeric" value={importeInvertido} onChangeText={setImporteInvertido} />
                  
                  <Text style={styles.modalLabel}>Solicitante / Receptor</Text>
                  <TextInput style={styles.modalInput} placeholderTextColor="#94A3B8" placeholder="Nombre..." value={encargado} onChangeText={setEncargado} />
                  
                  <Text style={styles.modalLabel}>Método</Text>
                  <View style={styles.selectorContainer}>
                    <TouchableOpacity style={[styles.selectorBtn, tipoDeposito === 'efectivo' ? styles.selectorActive : null]} onPress={() => setTipoDeposito('efectivo')}>
                      <Text style={[styles.selectorText, tipoDeposito === 'efectivo' ? styles.selectorTextActive : null]}>Efectivo</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.selectorBtn, tipoDeposito === 'transferencia' ? styles.selectorActive : null]} onPress={() => setTipoDeposito('transferencia')}>
                      <Text style={[styles.selectorText, tipoDeposito === 'transferencia' ? styles.selectorTextActive : null]}>Transferencia</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View>
                  <View style={styles.rowInputs}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text style={styles.modalLabel}>No. Nota</Text>
                      <TextInput style={styles.modalInput} placeholderTextColor="#94A3B8" placeholder="Opcional" value={numeroNota} onChangeText={setNumeroNota} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalLabel}>Responsable</Text>
                      <TextInput style={styles.modalInput} placeholderTextColor="#94A3B8" placeholder="Nombre" value={encargado} onChangeText={setEncargado} />
                    </View>
                  </View>

                  <Text style={[styles.modalLabel, {marginTop: 20}]}>Artículos Comprados</Text>
                  {articulos.map((art, index) => (
                    <View key={art.id} style={styles.articuloBox}>
                      <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                        <Text style={styles.articuloIndex}>Artículo {index + 1}</Text>
                        {articulos.length > 1 ? (
                          <TouchableOpacity onPress={() => eliminarArticulo(art.id)}><Feather name="x-circle" size={16} color="#EF4444" /></TouchableOpacity>
                        ) : null}
                      </View>

                      <TextInput style={[styles.modalInput, {marginTop: 5}]} placeholderTextColor="#94A3B8" placeholder="Concepto (Ej. Clavos 2 pulg)" value={art.concepto} onChangeText={(v) => actualizarArticulo(art.id, 'concepto', v)} />

                      <View style={styles.rowInputs}>
                        <View style={{flex: 1, marginRight: 5}}>
                          <TextInput style={styles.modalInput} placeholderTextColor="#94A3B8" placeholder="Cant" keyboardType="numeric" value={art.cantidad} onChangeText={(v) => actualizarArticulo(art.id, 'cantidad', v.replace(/[^0-9.]/g, ''))} />
                        </View>
                        <View style={{flex: 1, marginRight: 5}}>
                          <TextInput style={styles.modalInput} placeholderTextColor="#94A3B8" placeholder="Unidad" value={art.unidad} onChangeText={(v) => actualizarArticulo(art.id, 'unidad', v)} />
                        </View>
                        <View style={{flex: 1.5}}>
                          <TextInput style={styles.modalInput} placeholderTextColor="#94A3B8" placeholder="P.U ($)" keyboardType="numeric" value={art.precioUnitario} onChangeText={(v) => actualizarArticulo(art.id, 'precioUnitario', v.replace(/[^0-9.]/g, ''))} />
                        </View>
                      </View>
                    </View>
                  ))}

                  <TouchableOpacity style={styles.addArticuloBtn} onPress={agregarArticulo}>
                    <Feather name="plus" size={16} color="#2563EB" />
                    <Text style={styles.addArticuloText}>Agregar otro artículo</Text>
                  </TouchableOpacity>

                  <View style={styles.totalGastoRow}>
                    <Text style={styles.totalGastoLabel}>Suma Total del Ticket:</Text>
                    <Text style={styles.totalGastoValue}>${gastoCalculado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</Text>
                  </View>

                  <Text style={styles.modalLabel}>Nota / Justificación Adicional</Text>
                  <TextInput style={[styles.modalInput, { height: 50, textAlignVertical: 'top' }]} placeholderTextColor="#94A3B8" placeholder="Ej. Compra urgente para loza" value={justificacionGeneral} onChangeText={setJustificacionGeneral} multiline />

                  <Text style={styles.modalLabel}>Evidencia (Foto del Ticket)</Text>
                  <TouchableOpacity style={styles.cameraBtn} onPress={seleccionarFoto}>
                    {fotoTicket ? (
                      <Image source={{ uri: fotoTicket }} style={styles.previewImage} />
                    ) : (
                      <Text style={styles.cameraBtnText}>Tomar foto</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity style={styles.saveBtn} onPress={handleGuardarOLlamarActualizar} disabled={isSaving}>
                {isSaving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>{isEditing ? 'Actualizar Registro' : 'Guardar en Caja Chica'}</Text>}
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
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { backgroundColor: '#2563EB', paddingTop: 60, paddingBottom: 25, paddingHorizontal: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  backButton: { padding: 4, marginLeft: -4 },
  headerSubtitle: { color: 'rgba(255, 255, 255, 0.6)', fontSize: 11, fontWeight: '700', letterSpacing: 5, textAlign: 'center', flex: 1 },
  excelBtnHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#10B981', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8 },
  excelBtnText: { color: '#FFF', fontSize: 12, fontWeight: 'bold', marginLeft: 4 },
  summaryCardTouchable: { alignItems: 'center', marginVertical: 5 },
  headerTitle: { color: '#94A3B8', fontSize: 13, fontWeight: '500', marginTop: 5 },
  totalAmount: { color: '#FFF', fontSize: 32, fontWeight: 'bold', marginTop: 2 },
  contrastContainer: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, marginTop: 15, alignItems: 'center', overflow: 'hidden' },
  contrastBox: { flex: 1, alignItems: 'center', padding: 12 },
  contrastBoxActive: { backgroundColor: 'rgba(255,255,255,0.1)' },
  contrastDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.1)' },
  contrastLabel: { fontSize: 10, color: '#94A3B8', fontWeight: '700' },
  contrastValueIngreso: { fontSize: 16, fontWeight: 'bold', color: '#10B981', marginTop: 4 },
  contrastValueEgreso: { fontSize: 16, fontWeight: 'bold', color: '#EF4444', marginTop: 4 },
  body: { padding: 15, paddingBottom: 120 },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', color: '#334155' },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  emptyText: { textAlign: 'center', color: '#64748B', marginTop: 30, fontStyle: 'italic' },
  gastoCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0', boxShadow: '0px 2px 6px rgba(15, 23, 42, 0.1)', elevation: 2 },
  gastoMainRow: { flexDirection: 'row', alignItems: 'center' },
  gastoJustificacion: { fontSize: 13, fontWeight: 'bold', color: '#1E293B' },
  gastoMeta: { fontSize: 11, color: '#64748B', marginTop: 4 },
  gastoMonto: { fontSize: 16, fontWeight: 'bold', marginLeft: 10 },
  fab: { position: 'absolute', bottom: 30, right: 25, width: 60, height: 60, borderRadius: 30, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center', boxShadow: '0px 5px 12px rgba(15, 23, 42, 0.16)', elevation: 5 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalOverlayDetail: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', padding: 0 }, 
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  detailModalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, boxShadow: '0px -5px 20px rgba(0, 0, 0, 0.1)',     elevation: 10, maxHeight: '90%' },
  
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#0F172A' },
  formToggleContainer: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 12, padding: 4, marginBottom: 15 },
  formToggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  toggleActiveIngreso: { backgroundColor: '#10B981' },
  toggleActiveEgreso: { backgroundColor: '#EF4444' },
  toggleText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  toggleTextActive: { color: '#FFF' },
  modalLabel: { fontSize: 12, fontWeight: '700', color: '#475569', marginTop: 10, marginBottom: 4 },
  modalInput: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, padding: 10, fontSize: 14, color: '#0F172A' },
  rowInputs: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  totalGastoRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#EFF6FF', padding: 12, borderRadius: 10, marginTop: 15, borderWidth: 1, borderColor: '#BFDBFE' },
  totalGastoLabel: { fontSize: 12, color: '#1E4ED8', fontWeight: 'bold' },
  totalGastoValue: { fontSize: 14, color: '#1D4ED8', fontWeight: 'bold' },
  selectorContainer: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 10, padding: 4, marginTop: 4 },
  selectorBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  selectorActive: { backgroundColor: '#1E293B' },
  selectorText: { fontSize: 12, color: '#4B5563', fontWeight: '600' },
  selectorTextActive: { color: '#FFF' },
  cameraBtn: { height: 60, borderWidth: 1, borderColor: '#BFDBFE', borderStyle: 'dashed', backgroundColor: '#EFF6FF', borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginTop: 5 },
  cameraBtnText: { color: '#2563EB', fontSize: 12, fontWeight: '600' },
  previewImage: { width: '100%', height: '100%', borderRadius: 10 },
  saveBtn: { backgroundColor: '#1E293B', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  cancelBtn: { padding: 12, alignItems: 'center', marginTop: 8 },
  cancelBtnText: { color: '#94A3B8', fontSize: 13, fontWeight: '600' },
  editingTypeIndicator: { padding: 10, borderRadius: 10, backgroundColor: '#F1F5F9', marginBottom: 15, alignItems: 'center' },
  editingTypeText: { fontSize: 14, fontWeight: 'bold', textTransform: 'uppercase' },
  articuloBox: { backgroundColor: '#F8FAFC', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', marginTop: 8 },
  articuloIndex: { fontSize: 10, fontWeight: 'bold', color: '#94A3B8', textTransform: 'uppercase' },
  addArticuloBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 12, marginTop: 10, borderWidth: 1, borderColor: '#BFDBFE', borderStyle: 'dashed', borderRadius: 10, backgroundColor: '#EFF6FF' },
  addArticuloText: { color: '#2563EB', fontSize: 12, fontWeight: 'bold', marginLeft: 8 },
  
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  detailIconBox: { width: 56, height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  detailCloseBtn: { padding: 8, backgroundColor: '#F1F5F9', borderRadius: 12 },
  detailTitle: { fontSize: 14, fontWeight: 'bold', color: '#64748B', textTransform: 'uppercase', letterSpacing: 1 },
  detailAmount: { fontSize: 36, fontWeight: '900', marginBottom: 20 },
  detailDataBox: { backgroundColor: '#F8FAFC', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E2E8F0', gap: 16 },
  detailRow: { flexDirection: 'column' },
  detailRowGrid: { flexDirection: 'row', gap: 16 },
  detailLabel: { fontSize: 11, fontWeight: 'bold', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 4 },
  detailValue: { fontSize: 15, fontWeight: '600', color: '#1E293B' },
  detailTicketImage: { width: '100%', height: 200, borderRadius: 12, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  detailImageHint: { textAlign: 'center', fontSize: 11, color: '#94A3B8', marginTop: 8, fontStyle: 'italic' },
  detailActionsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 30, gap: 12 },
  editActionBtn: { flex: 2, backgroundColor: '#1E293B', padding: 16, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  editActionBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 14, marginLeft: 8 },
  deleteActionBtn: { flex: 1, backgroundColor: '#FEF2F2', padding: 16, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#FECACA' },
  deleteActionBtnText: { color: '#EF4444', fontWeight: 'bold', fontSize: 14, marginLeft: 8 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 12, minHeight: 46, marginBottom: 15 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: '#1E293B', height: '100%' },
});