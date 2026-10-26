'use client';

import { Feather } from '@expo/vector-icons';
import Almacen from '../lib/almacen';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { exportarPDF, exportarTexto } from '../lib/exportar';
import { regresar } from '../lib/navegar';
import { Aviso } from '../lib/aviso';

import SummaryCard from '../components/SummaryCard';
import { SinDatos } from '../components/SinDatos';
import { useProject } from '../context/ProjectContext';
import { useUser } from '../context/UserContext';
import { supabase } from '../lib/supabase';
import { mensajeDeError } from '../lib/errores';
import { esDeHoy, eliminarRegistro } from '../lib/permisos';
import { SelectorHora } from '../components/SelectorHora';
import { generarPlantillaMaquinaria } from '../utils/pdfMaquinaria';

interface GastoMaquinaria {
  id: string;
  equipo: string;
  concepto: string;
  monto: number;
  categoria: string;
  tipo_renta?: string | null;
  costo_tarifa?: number | null;
  asistencia_dias?: number | null;
  hora_entrada?: string | null;
  hora_salida?: string | null;
  proveedor?: string | null;
  fecha: string;
}

interface MaquinaAgrupada {
  equipo: string;
  proveedor: string;
  modalidad: string;
  tarifaHora: number;
  totalHoras: number;
  costoGenerado: number;
  totalAnticipos: number;
  saldoPendiente: number;
  fechaAlta: string; 
}

// 🟢 JORNADA ESTÁNDAR DE TRABAJO EN OBRA (8 HORAS)
const JORNADA_HORAS = 8;

export default function GastosMaquinariaScreen() {
  const router = useRouter();
  const { activeProject, isOffline } = useProject();
  const { profile } = useUser();
  const isAdminOrOficina = profile?.role === 'admin' || profile?.role === 'oficina';
  const esResidente = profile?.role === 'residente';
  /* El residente puede corregir o quitar un registro que acaba de capturar
   * (horas o monto mal teclados). Se mide con 'created_at', no con 'fecha',
   * porque la fecha del movimiento la escribe el usuario y podría ser de otro
   * día. Editar y borrar comparten la misma ventana: si puede deshacerlo,
   * puede arreglarlo, y corregir es menos brusco que borrar y recapturar. */
  const puedeCorregirResidente = (reg: any) =>
    esResidente && esDeHoy(reg?.created_at || reg?.fecha);

  const [gastos, setGastos] = useState<GastoMaquinaria[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  // Estados para modales y navegación interna
  const [modalDetalleMaquina, setModalDetalleMaquina] = useState(false);
  const [detalleTab, setDetalleTab] = useState<'uso' | 'anticipo'>('uso');
  const [selectedMaquina, setSelectedMaquina] = useState<MaquinaAgrupada | null>(null);

  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);

  const [modalNuevaMaquina, setModalNuevaMaquina] = useState(false);
  const [modalHoras, setModalHoras] = useState(false);
  const [modalAnticipo, setModalAnticipo] = useState(false);

  // Estados para configuración de equipo
  const [editingMachineConfigId, setEditingMachineConfigId] = useState<string | null>(null);
  const [originalMachineName, setOriginalMachineName] = useState('');
  const [equipo, setEquipo] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [modalidad, setModalidad] = useState<'hora' | 'dia' | 'semana' | 'mes'>('semana');
  const [tarifaHora, setTarifaHora] = useState('');
  
  // Estados para registro operativo
  const [horasOperacion, setHorasOperacion] = useState('');
  const [montoAnticipo, setMontoAnticipo] = useState('');
  const [concepto, setConcepto] = useState('');

  // Estados para control de horario
  const [horaEntrada, setHoraEntrada] = useState('');
  const [horaSalida, setHoraSalida] = useState('');
  const [timeEntradaDate, setTimeEntradaDate] = useState(new Date());
  const [timeSalidaDate, setTimeSalidaDate] = useState(new Date());

  /**
   * 📌 NOTA: useEffect (Carga inicial de obra)
   * Dispara la consulta del historial de maquinaria cuando cambia la obra activa o el estado de red.
   */
  useEffect(() => {
    /* Se llama siempre, incluso sin obra activa: la propia funcion
     * apaga el esqueleto y la pantalla dice que falta elegir obra.
     * Con el candado aqui, ese apagado nunca llegaba a correr y la
     * pantalla se quedaba cargando para siempre. */
    fetchGastos();
  }, [activeProject, isOffline]);

  /**
   * 📌 NOTA: fetchGastos
   * Consulta a Supabase todos los registros asociados a 'gastos_maquinaria' para la obra activa
   * y los almacena en caché local (AsyncStorage) para permitir acceso fuera de línea.
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
    try {
      if (isOffline) {
        const cached = await Almacen.getItem(`@gastos_maquinaria_log_${pid}`);
        if (cached) setGastos(JSON.parse(cached));
      } else {
        const { data, error } = await supabase
          .from('gastos_maquinaria')
          .select('*')
          .eq('project_id', pid)
          .eq('is_active', true)
          .order('fecha', { ascending: true }); 
        if (error) throw error;
        if (data) {
          setGastos(data);
          await Almacen.setItem(`@gastos_maquinaria_log_${pid}`, JSON.stringify(data));
        }
      }
    } catch (error) { 
      console.log(error); 
    } finally { 
      setLoading(false); 
    }
  };

  /**
   * 📌 NOTA: maquinasMap
   * Agrupa los registros por máquina (equipo) para consolidar sus horas acumuladas, 
   * el costo total generado, los anticipos pagados y el saldo pendiente.
   */
  const maquinasMap = useMemo(() => {
    const map: Record<string, MaquinaAgrupada> = {};
    gastos.forEach(g => {
      if (!map[g.equipo]) {
        map[g.equipo] = { 
          equipo: g.equipo, 
          proveedor: g.proveedor || 'S/P', 
          modalidad: g.tipo_renta || 'semana', 
          tarifaHora: Number(g.costo_tarifa) || 0, 
          totalHoras: 0, 
          costoGenerado: 0, 
          totalAnticipos: 0, 
          saldoPendiente: 0, 
          fechaAlta: g.fecha 
        };
      }
      if (g.categoria === 'config') {
        if (g.costo_tarifa !== null && g.costo_tarifa !== undefined) map[g.equipo].tarifaHora = Number(g.costo_tarifa);
        if (g.tipo_renta) map[g.equipo].modalidad = g.tipo_renta;
        if (g.proveedor) map[g.equipo].proveedor = g.proveedor;
        map[g.equipo].fechaAlta = g.fecha;
      }
      else if (g.categoria === 'uso') {
        map[g.equipo].totalHoras += Number(g.asistencia_dias) || 0;
        map[g.equipo].costoGenerado += Number(g.monto) || 0; 
      }
      else if (g.categoria === 'anticipo') {
        map[g.equipo].totalAnticipos += Number(g.monto) || 0; 
      }
      map[g.equipo].saldoPendiente = map[g.equipo].costoGenerado - map[g.equipo].totalAnticipos;
    });
    return Object.values(map);
  }, [gastos]);

  /**
   * 📌 NOTA: estimacionGastoPeriodo
   * Calcula en tiempo real el costo proyectado (por día, semana o mes) 
   * tomando como base una jornada estándar de 8 horas de operación.
   */
  const estimacionGastoPeriodo = useMemo(() => {
    const tarifa = Number(tarifaHora) || 0;
    if (tarifa <= 0) return 0;

    const costoDia = tarifa * JORNADA_HORAS;

    // Por hora el corte es la tarifa misma: se factura una hora de operacion,
    // sin suponer la jornada de 8 horas que usan los demas cortes.
    if (modalidad === 'hora') return tarifa;
    if (modalidad === 'dia') return costoDia;
    if (modalidad === 'semana') return costoDia * 6; // 6 días laborables por semana
    if (modalidad === 'mes') return costoDia * 30;   // Mes de 30 días
    return 0;
  }, [tarifaHora, modalidad]);

  // Filtros reactivos para el modal de detalle
  const historialUsoActivo = useMemo(() => {
    if(!selectedMaquina) return [];
    return gastos.filter(g => g.equipo === selectedMaquina.equipo && g.categoria === 'uso').sort((a,b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }, [gastos, selectedMaquina]);

  const historialAbonosActivo = useMemo(() => {
    if(!selectedMaquina) return [];
    return gastos.filter(g => g.equipo === selectedMaquina.equipo && g.categoria === 'anticipo').sort((a,b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }, [gastos, selectedMaquina]);

  // Totales globales para tarjetas de balance
  const globalGenerado = maquinasMap.reduce((sum, m) => sum + m.costoGenerado, 0);
  const globalPagado = maquinasMap.reduce((sum, m) => sum + m.totalAnticipos, 0);
  const globalDeuda = globalGenerado - globalPagado;

  /**
   * 📌 NOTA: iniciarEdicionMaquina
   * Carga los datos de configuración del equipo (tarifa, proveedor, modalidad) en el formulario modal.
   */
  const iniciarEdicionMaquina = (maquina: MaquinaAgrupada) => {
    const configRecord = gastos.find(g => g.equipo === maquina.equipo && g.categoria === 'config');
    setEditingMachineConfigId(configRecord?.id || null);
    setOriginalMachineName(maquina.equipo);
    
    setEquipo(maquina.equipo);
    setProveedor(maquina.proveedor !== 'S/P' ? maquina.proveedor : '');
    setModalidad(maquina.modalidad as any);
    setTarifaHora(maquina.tarifaHora.toString());
    
    setModalNuevaMaquina(true);
  };

  /**
   * 📌 NOTA: limpiarFormularioMaquina
   * Restablece los estados del modal de configuración de equipo.
   */
  const limpiarFormularioMaquina = () => {
    setModalNuevaMaquina(false);
    setEquipo(''); setProveedor(''); setTarifaHora('');
    setEditingMachineConfigId(null); setOriginalMachineName('');
  };

  /**
   * 📌 NOTA: handleGuardarConfig
   * Guarda o actualiza los parámetros base de una máquina (tarifa por hora, proveedor, modalidad de renta).
   * Si cambia el nombre del equipo, renombra en cascada todos los registros previos asociados.
   */
  const handleGuardarConfig = async () => {
    if (!activeProject?.id) { Aviso.alert('Sin obra seleccionada', 'Entra a Proyectos y elige tu obra antes de capturar.'); return; }
    if (!equipo.trim() || !tarifaHora.trim()) { Aviso.alert("Campos Vacíos", "El nombre y tarifa son obligatorios."); return; }
    if (isOffline) { Aviso.alert("Modo Offline", "Conéctate a internet para editar la configuración de la máquina."); return; }
    
    setIsSaving(true);
    
    try {
      if (originalMachineName) { 
        const nuevoNombre = equipo.trim();

        if (nuevoNombre !== originalMachineName) {
          const { error: errUpdateNombre } = await supabase.from('gastos_maquinaria')
            .update({ equipo: nuevoNombre })
            .eq('equipo', originalMachineName)
            .eq('project_id', activeProject?.id);
            
          if (errUpdateNombre) throw errUpdateNombre;
        }

        const configRecord = gastos.find(g => g.equipo === originalMachineName && g.categoria === 'config');

        if (configRecord || editingMachineConfigId) {
          const targetId = editingMachineConfigId || configRecord?.id;
          const { error: errUpdateConfig } = await supabase.from('gastos_maquinaria')
            .update({
              proveedor: proveedor.trim() || null,
              tipo_renta: modalidad,
              costo_tarifa: Number(tarifaHora)
            })
            .eq('id', targetId);
            
          if (errUpdateConfig) throw errUpdateConfig;
        } else {
          const nuevoRegistro = {
            project_id: activeProject?.id,
            equipo: nuevoNombre,
            concepto: 'Configuración Inicial', 
            proveedor: proveedor.trim() || null,
            categoria: 'config',
            tipo_renta: modalidad,
            costo_tarifa: Number(tarifaHora),
            monto: 0,
            is_active: true,
            fecha: new Date().toISOString()
          };
          const { error: errInsertConfig } = await supabase.from('gastos_maquinaria').insert([nuevoRegistro]);
          if (errInsertConfig) throw errInsertConfig;
        }

        Aviso.alert("¡Actualizado!", "Los datos del equipo han sido modificados.");
      } else {
        const nuevoRegistro = {
          project_id: activeProject?.id,
          equipo: equipo.trim(),
          concepto: 'Alta de equipo', 
          proveedor: proveedor.trim() || null,
          categoria: 'config', 
          tipo_renta: modalidad,
          costo_tarifa: Number(tarifaHora),
          monto: 0, 
          is_active: true,
          fecha: new Date().toISOString()
        };
        const { error } = await supabase.from('gastos_maquinaria').insert([nuevoRegistro]);
        if (error) throw error;
      }
      
      limpiarFormularioMaquina(); 
      fetchGastos(); 
    } catch (e: any) { 
      Aviso.alert("Error", e.message); 
    } finally { 
      setIsSaving(false); 
    }
  };

  /**
   * 📌 NOTA: recalcularHoraSalida
   * Calcula automáticamente la hora de salida sumando las horas de operación a la hora de entrada.
   */
  const recalcularHoraSalida = (horasStr: string, entradaDate: Date) => {
    setHorasOperacion(horasStr);
    const hrs = parseFloat(horasStr);
    if (isNaN(hrs) || hrs <= 0) return;

    const nuevaSalida = new Date(entradaDate);
    const horasEnteras = Math.floor(hrs);
    const minutos = (hrs - horasEnteras) * 60;
    
    nuevaSalida.setHours(nuevaSalida.getHours() + horasEnteras);
    nuevaSalida.setMinutes(nuevaSalida.getMinutes() + minutos);
    
    setTimeSalidaDate(nuevaSalida);
    setHoraSalida(nuevaSalida.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}));
  };

  /**
   * 📌 NOTA: handleEntradaChange
   * Actualiza el valor de la hora de entrada y dispara el recálculo automático de la salida.
   */
  const handleEntradaChange = (date: Date) => {
    setTimeEntradaDate(date);
    setHoraEntrada(date.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}));
    if (horasOperacion) recalcularHoraSalida(horasOperacion, date);
  };

  /**
   * 📌 NOTA: handleGuardarUso
   * Inserta o edita un reporte de uso de horas (bitácora) calculando el costo del día (horas * tarifa).
   */
  const handleGuardarUso = async () => {
    if (!selectedMaquina || !horasOperacion.trim()) { Aviso.alert("Faltan Horas", "Ingresa las horas de trabajo."); return; }
    setIsSaving(true);
    
    const horas = Number(horasOperacion);
    const tarifa = Number(selectedMaquina.tarifaHora) || 0;
    const costoDia = horas * tarifa; 
    const conceptoFinal = concepto.trim() || `Jornada del día (${horas} hrs)`;

    const datosPayload = {
      project_id: activeProject?.id,
      equipo: selectedMaquina.equipo,
      proveedor: selectedMaquina.proveedor,
      categoria: 'uso',
      tipo_renta: selectedMaquina.modalidad,
      costo_tarifa: tarifa,
      asistencia_dias: horas, 
      hora_entrada: horaEntrada || null,
      hora_salida: horaSalida || null,
      concepto: conceptoFinal,
      monto: Number(costoDia), 
      is_active: true,
      fecha: editingRecordId ? (gastos.find(g=>g.id===editingRecordId)?.fecha || new Date().toISOString()) : new Date().toISOString()
    };

    try {
      // Supabase no lanza excepcion: devuelve { error }. Sin revisarlo, un
      // rechazo pasaba de largo y la app anunciaba "Bitacora guardada" con la
      // bitacora vacia, que es justo lo que se reportaba como "no se ve nada".
      const { error } = editingRecordId
        ? await supabase.from('gastos_maquinaria').update(datosPayload).eq('id', editingRecordId)
        : await supabase.from('gastos_maquinaria').insert([datosPayload]);
      if (error) throw error;
      setModalHoras(false); limpiarFormsSecundarios(); fetchGastos();
      Aviso.alert("¡Éxito!", editingRecordId ? "Bitácora actualizada." : "Bitácora guardada.");
    } catch (e: any) { 
      Aviso.alert("Error", mensajeDeError(e, 'guardar la bitácora')); 
    } finally { 
      setIsSaving(false); 
    }
  };

  /**
   * 📌 NOTA: handleGuardarAnticipo
   * Registra un pago o abono financiero al proveedor del equipo en 'gastos_maquinaria'.
   */
  const handleGuardarAnticipo = async () => {
    if (!selectedMaquina || !montoAnticipo.trim()) { Aviso.alert("Campos Vacíos", "Ingresa el monto."); return; }
    setIsSaving(true);
    const datosPayload = {
      project_id: activeProject?.id,
      equipo: selectedMaquina.equipo,
      proveedor: selectedMaquina.proveedor,
      categoria: 'anticipo',
      concepto: concepto.trim() || `Anticipo a cuenta de renta`,
      monto: Number(montoAnticipo),
      is_active: true,
      fecha: editingRecordId ? (gastos.find(g=>g.id===editingRecordId)?.fecha || new Date().toISOString()) : new Date().toISOString()
    };

    try {
      const { error } = editingRecordId
        ? await supabase.from('gastos_maquinaria').update(datosPayload).eq('id', editingRecordId)
        : await supabase.from('gastos_maquinaria').insert([datosPayload]);
      if (error) throw error;
      setModalAnticipo(false); limpiarFormsSecundarios(); fetchGastos();
      Aviso.alert("¡Éxito!", "Pago registrado.");
    } catch (e: any) { 
      Aviso.alert("Error", mensajeDeError(e, 'registrar el pago')); 
    } finally { 
      setIsSaving(false); 
    }
  };

  /**
   * 📌 NOTA: iniciarEdicionRegistro
   * Carga los datos de una línea específica (uso o anticipo) para su modificación.
   */
  const iniciarEdicionRegistro = (record: GastoMaquinaria) => {
    setModalDetalleMaquina(false);

    setTimeout(() => {
      setEditingRecordId(record.id);
      setConcepto(record.concepto || '');

      if (record.categoria === 'uso') {
        setHorasOperacion(record.asistencia_dias?.toString() || '');
        setHoraEntrada(record.hora_entrada || '');
        setHoraSalida(record.hora_salida || '');
        if (record.hora_entrada) {
          const [h, m] = record.hora_entrada.split(/[: ]/);
          const isPM = record.hora_entrada.toLowerCase().includes('p');
          const date = new Date();
          let hr = parseInt(h);
          if(isPM && hr !== 12) hr += 12;
          if(!isPM && hr === 12) hr = 0;
          date.setHours(hr, parseInt(m), 0);
          setTimeEntradaDate(date);
        }
        setModalHoras(true);
      } else if (record.categoria === 'anticipo') {
        setMontoAnticipo(record.monto.toString());
        setModalAnticipo(true);
      }
    }, 350); 
  };

  /**
   * 📌 NOTA: handleEliminarRegistro
   * Admin y oficina borran de verdad, para no dejar registros huérfanos. El
   * residente solo desactiva (is_active = false), asi que su error se puede
   * recuperar desde la pantalla de Recuperar.
   */
  const handleEliminarRegistro = (id: string) => {
    Aviso.alert(
      "Eliminar Registro",
      esResidente
        ? "¿Quitar este registro? Dejará de contar en los totales. Si fue un error, un administrador puede recuperarlo."
        : "¿Deseas borrar permanentemente este movimiento del sistema?",
      [
      { text: "Cancelar", style: "cancel" },
      { 
        text: "Borrar", 
        style: "destructive", 
        onPress: async () => {
          try {
            // El residente solo lo desactiva, para poder recuperarlo si se
            // equivocó. Admin y oficina sí borran definitivamente.
            const { error } = await eliminarRegistro('gastos_maquinaria', id, esResidente);

            if (error) throw error;
            
            fetchGastos();
          } catch (e: any) { 
            Aviso.alert("Error al eliminar", e.message); 
          }
        }
      }
    ]);
  };

  /**
   * 📌 NOTA: limpiarFormsSecundarios
   * Restablece los campos de los modales de captura de horas y anticipos.
   */
  const limpiarFormsSecundarios = () => {
    setHorasOperacion(''); setMontoAnticipo(''); setConcepto('');
    setHoraEntrada(''); setHoraSalida(''); setEditingRecordId(null);
  };

  /**
   * 📌 NOTA: handleExportarExcel
   * Construye un archivo CSV con las bitácoras diarias y pagos de maquinaria y lo comparte.
   */
  const handleExportarExcel = async () => {
    if (gastos.length === 0) return;
    try {
      const encabezados = ["Fecha", "Tipo", "Equipo", "Proveedor", "Corte por", "Tarifa x Hora ($)", "Horas Hoy", "Concepto/Detalle", "Costo Diario Generado ($)", "Anticipo Pagado ($)\n"];
      const filas = gastos.map(g => {
        if (g.categoria === 'config') return null; 
        const fecha = new Date(g.fecha).toLocaleDateString('es-MX');
        const eqLimpio = g.equipo.replace(/,/g, ' ');
        const provLimpio = g.proveedor ? g.proveedor.replace(/,/g, ' ') : '';
        const conceptoLimpio = g.concepto ? g.concepto.replace(/,/g, ' ') : '';
        const hrs = g.asistencia_dias || '';
        const tarifaF = g.costo_tarifa || '';
        const mod = g.tipo_renta ? g.tipo_renta.toUpperCase() : '';
        const cargo = g.categoria === 'uso' ? g.monto : 0;
        const abono = g.categoria === 'anticipo' ? g.monto : 0;
        const etiqueta = g.categoria === 'uso' ? 'BITÁCORA DIARIA' : 'PAGO/ANTICIPO';
        return `${fecha},"${etiqueta}","${eqLimpio}","${provLimpio}","${mod}",${tarifaF},${hrs},"${conceptoLimpio}",${cargo},${abono}`;
      }).filter(Boolean).join("\n");
      const contenidoCSV = "\uFEFF" + encabezados.join(",") + filas;
      const nombreArchivo = `Maquinaria_${activeProject?.name?.replace(/\s+/g, '_') || 'Obra'}.csv`;
      await exportarTexto(contenidoCSV, nombreArchivo);
    } catch (error: any) { 
      Aviso.alert("Error Excel", error.message); 
    }
  };

  /**
   * 📌 NOTA: handleExportPDF
   * Genera el reporte ejecutivo de maquinaria en PDF a partir de la plantilla HTML y lo comparte.
   */
  const handleExportPDF = async () => {
    if (gastos.length === 0) return;
    setIsExportingPDF(true);
    try {
      const htmlContent = generarPlantillaMaquinaria(activeProject?.name || 'Obra', globalGenerado, globalPagado, globalDeuda, gastos);
      await exportarPDF(htmlContent, 'Gastos_Maquinaria.pdf');
    } catch (error: any) { 
      Aviso.alert("Error PDF", error.message); 
    } finally { 
      setIsExportingPDF(false); 
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerInner}>
          <View style={styles.headerTopRow}>
            <TouchableOpacity onPress={() => regresar('/(tabs)/gastos')} style={styles.backButton}>
              <Feather name="chevron-left" size={32} color="#FFF" />
            </TouchableOpacity>
          </View>
          <Text style={styles.headerTitle}>Directorio de Maquinaria</Text>
          <View style={styles.projectBadge}>
            <Feather name="map-pin" size={12} color="rgba(255,255,255,0.7)" />
            <Text style={styles.projectName}>{activeProject?.name || "Obra"}</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={{ marginBottom: 15 }}>
          <SummaryCard 
            labelLeft="Abonado a Proveedores" 
            valueLeft={globalPagado} 
            labelRight="Costo Generado" 
            valueRight={globalGenerado} 
            colorRight="#10B981" 
          />
          <View style={[styles.saldoPill, { backgroundColor: globalDeuda > 0 ? '#FEF2F2' : '#F0FDF4', borderColor: globalDeuda > 0 ? '#FECACA' : '#BBF7D0' }]}>
            <Text style={[styles.saldoText, { color: globalDeuda > 0 ? '#DC2626' : '#15803D' }]}>
              {globalDeuda > 0 ? '⚠️ Saldo pendiente de pago: ' : '✅ Obra al corriente o saldo a favor: '}
              ${Math.abs(globalDeuda).toLocaleString('es-MX', {minimumFractionDigits: 2})}
            </Text>
          </View>
        </View>

        {isAdminOrOficina && maquinasMap.length > 0 && (
          <View style={styles.exportContainer}>
            <TouchableOpacity style={[styles.bigExportBtn, { backgroundColor: '#10B981', flex: 1, marginRight: 10 }]} onPress={handleExportarExcel}>
              <Feather name="grid" size={20} color="#FFF" />
              <Text style={styles.bigExportText}>Excel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.bigExportBtn, { backgroundColor: '#DC2626', flex: 1 }]} onPress={handleExportPDF} disabled={isExportingPDF}>
              {isExportingPDF ? <ActivityIndicator color="#FFF" /> : <><Feather name="file-text" size={20} color="#FFF" /><Text style={styles.bigExportText}>PDF</Text></>}
            </TouchableOpacity>
          </View>
        )}

        {loading && maquinasMap.length === 0 ? ( 
          <SkeletonLista filas={5} />
        ) : (
          maquinasMap.length === 0 ? (
            <SinDatos mensaje="No hay datos para mostrar." onReintentar={fetchGastos} />
          ) : (
            maquinasMap.map((maquina, index) => (
              <TouchableOpacity 
                key={index} 
                style={styles.machineCard}
                activeOpacity={0.8}
                onPress={() => {
                  setSelectedMaquina(maquina);
                  setDetalleTab('uso');
                  setModalDetalleMaquina(true);
                }}
              >
                <View style={styles.machineCardHeader}>
                  <View style={{flex: 1}}>
                    <Text style={styles.machineTitle}>🚜 {maquina.equipo}</Text>
                    <Text style={styles.machineProvider}>Prov: {maquina.proveedor}</Text>
                    <Text style={styles.machineDateLabel}>Alta: {new Date(maquina.fechaAlta).toLocaleDateString('es-MX')}</Text>
                  </View>
                  <View style={styles.machineBadgeBox}>
                    <Text style={styles.machineBadgeText}>Corte x {maquina.modalidad}</Text>
                    <Text style={styles.machineRate}>${maquina.tarifaHora}/hr</Text>
                  </View>
                </View>

                <View style={styles.machineStatsRow}>
                  <View style={styles.statCol}>
                    <Text style={styles.statLabel}>Uso Acumulado</Text>
                    <Text style={styles.statValue}>{maquina.totalHoras} hrs</Text>
                  </View>
                  <View style={[styles.statCol, { borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#E2E8F0' }]}>
                    <Text style={styles.statLabel}>Costo Generado</Text>
                    <Text style={styles.statValue}>${maquina.costoGenerado.toLocaleString('es-MX')}</Text>
                  </View>
                  <View style={styles.statCol}>
                    <Text style={styles.statLabel}>Saldo Adeudado</Text>
                    <Text style={[styles.statValue, { color: maquina.saldoPendiente > 0 ? '#EF4444' : '#10B981' }]}>
                      ${Math.abs(maquina.saldoPendiente).toLocaleString('es-MX')}
                    </Text>
                  </View>
                </View>
                <View style={styles.openDetailBox}>
                  <Text style={styles.openDetailText}>Toca para ver historial o reportar</Text>
                  <Feather name="chevron-right" size={16} color="#94A3B8" />
                </View>
              </TouchableOpacity>
            ))
          )
        )}
      </ScrollView>

      {/* El residente tambien da de alta maquinaria: es quien la recibe en
          obra. Abonar pagos y editar tarifas siguen siendo de admin. */}
      <TouchableOpacity style={styles.fab} onPress={() => { limpiarFormularioMaquina(); setModalNuevaMaquina(true); }}>
        <Feather name="plus" size={30} color="#FFF" />
      </TouchableOpacity>

      {/* MODAL: DETALLES DE LA MÁQUINA */}
      <Modal visible={modalDetalleMaquina} animationType="slide" transparent={true} onRequestClose={() => setModalDetalleMaquina(false)}>
        <View style={styles.modalOverlayFull}>
          <View style={styles.modalWrapperFull}>
            
            <View style={styles.modalHeaderFull}>
              <View style={{flex:1, paddingRight: 10}}>
                <Text style={styles.modalTitleFull} numberOfLines={1}>{selectedMaquina?.equipo}</Text>
                <Text style={{color:'#64748B', fontSize: 13}}>Proveedor: {selectedMaquina?.proveedor}</Text>
              </View>
              
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {/* Editar la maquina queda igual para todos los roles: el residente
                    es quien la recibe en obra y quien detecta que el nombre, el
                    proveedor o la tarifa quedaron mal capturados. */}
                {selectedMaquina && (
                  <TouchableOpacity 
                    onPress={() => {
                      setModalDetalleMaquina(false);
                      setTimeout(() => { iniciarEdicionMaquina(selectedMaquina); }, 350);
                    }} 
                    style={styles.editConfigBtnCircle}
                  >
                    <Feather name="edit-2" size={20} color="#2563EB" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setModalDetalleMaquina(false)} style={styles.closeBtnCircle}>
                  <Feather name="x" size={24} color="#64748B" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.tabContainerFull}>
              <TouchableOpacity style={[styles.tabBtnFull, detalleTab === 'uso' && styles.tabActiveFull]} onPress={() => setDetalleTab('uso')}>
                <Text style={[styles.tabTextFull, detalleTab === 'uso' && styles.tabTextActiveFull]}>⏱️ Historial de Uso</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.tabBtnFull, detalleTab === 'anticipo' && styles.tabActiveFull]} onPress={() => setDetalleTab('anticipo')}>
                <Text style={[styles.tabTextFull, detalleTab === 'anticipo' && styles.tabTextActiveFull]}>💸 Historial de Pagos</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{padding: 20}} showsVerticalScrollIndicator={false}>
              {detalleTab === 'uso' && (
                historialUsoActivo.length === 0 ? <Text style={styles.emptyText}>No hay horas registradas aún.</Text> :
                historialUsoActivo.map(reg => (
                  <View key={reg.id} style={styles.historyCard}>
                    <View style={[styles.historyIconBox, { backgroundColor: '#EFF6FF' }]}><Feather name="clock" size={20} color="#2563EB" /></View>
                    <View style={styles.historyInfo}>
                      <Text style={styles.historyConcept} numberOfLines={1}>{reg.concepto}</Text>
                      <Text style={styles.historyDate}>{new Date(reg.fecha).toLocaleDateString('es-MX')} • {reg.hora_entrada} a {reg.hora_salida}</Text>
                    </View>
                    <View style={styles.historyAmountBox}>
                      <Text style={styles.historyHrs}>{reg.asistencia_dias} hrs</Text>
                      <Text style={styles.historyAmountCargo}>${Number(reg.monto).toLocaleString('es-MX')}</Text>
                    </View>
                    {isAdminOrOficina ? (
                      <View style={{marginLeft: 10, alignItems: 'center', justifyContent: 'center', gap: 10}}>
                        <TouchableOpacity onPress={() => iniciarEdicionRegistro(reg)}><Feather name="edit-2" size={18} color="#94A3B8" /></TouchableOpacity>
                        <TouchableOpacity onPress={() => handleEliminarRegistro(reg.id)}><Feather name="trash-2" size={18} color="#EF4444" /></TouchableOpacity>
                      </View>
                    ) : puedeCorregirResidente(reg) ? (
                      <View style={{marginLeft: 10, alignItems: 'center', justifyContent: 'center', gap: 10}}>
                        <TouchableOpacity onPress={() => iniciarEdicionRegistro(reg)}><Feather name="edit-2" size={18} color="#94A3B8" /></TouchableOpacity>
                        <TouchableOpacity onPress={() => handleEliminarRegistro(reg.id)}><Feather name="trash-2" size={18} color="#EF4444" /></TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                ))
              )}

              {detalleTab === 'anticipo' && (
                historialAbonosActivo.length === 0 ? <Text style={styles.emptyText}>No hay pagos registrados aún.</Text> :
                historialAbonosActivo.map(reg => (
                  <View key={reg.id} style={styles.historyCard}>
                    <View style={[styles.historyIconBox, { backgroundColor: '#ECFDF5' }]}><Feather name="dollar-sign" size={20} color="#10B981" /></View>
                    <View style={styles.historyInfo}>
                      <Text style={styles.historyConcept} numberOfLines={1}>{reg.concepto}</Text>
                      <Text style={styles.historyDate}>{new Date(reg.fecha).toLocaleDateString('es-MX')}</Text>
                    </View>
                    <View style={styles.historyAmountBox}>
                      <Text style={styles.historyAmountAbono}>+${Number(reg.monto).toLocaleString('es-MX')}</Text>
                    </View>
                    {isAdminOrOficina ? (
                      <View style={{marginLeft: 10, alignItems: 'center', justifyContent: 'center', gap: 10}}>
                        <TouchableOpacity onPress={() => iniciarEdicionRegistro(reg)}><Feather name="edit-2" size={18} color="#94A3B8" /></TouchableOpacity>
                        <TouchableOpacity onPress={() => handleEliminarRegistro(reg.id)}><Feather name="trash-2" size={18} color="#EF4444" /></TouchableOpacity>
                      </View>
                    ) : puedeCorregirResidente(reg) ? (
                      <View style={{marginLeft: 10, alignItems: 'center', justifyContent: 'center', gap: 10}}>
                        <TouchableOpacity onPress={() => iniciarEdicionRegistro(reg)}><Feather name="edit-2" size={18} color="#94A3B8" /></TouchableOpacity>
                        <TouchableOpacity onPress={() => handleEliminarRegistro(reg.id)}><Feather name="trash-2" size={18} color="#EF4444" /></TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                ))
              )}
            </ScrollView>

            <View style={styles.footerActionsFull}>
              <TouchableOpacity style={[styles.footerBtnFull, { backgroundColor: '#2563EB' }]} onPress={() => { setModalDetalleMaquina(false); setTimeout(() => { limpiarFormsSecundarios(); setModalHoras(true); }, 350); }}>
                <Feather name="clock" size={18} color="#FFF" />
                <Text style={[styles.footerBtnTextFull, { color: '#FFF' }]}>Reportar Horas</Text>
              </TouchableOpacity>
              {isAdminOrOficina && (
                <TouchableOpacity style={[styles.footerBtnFull, { backgroundColor: '#10B981' }]} onPress={() => { setModalDetalleMaquina(false); setTimeout(() => { limpiarFormsSecundarios(); setModalAnticipo(true); }, 350); }}>
                  <Feather name="dollar-sign" size={18} color="#FFF" />
                  <Text style={[styles.footerBtnTextFull, { color: '#FFF' }]}>Abonar Pago</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* 1️⃣ MODAL: NUEVA / EDITAR MÁQUINA CONFIG */}
      <Modal visible={modalNuevaMaquina} animationType="slide" transparent={true} onRequestClose={limpiarFormularioMaquina}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          
          <Pressable style={StyleSheet.absoluteFill} onPress={limpiarFormularioMaquina} />
          
          <View style={[styles.modalWrapper, { maxHeight: '90%', paddingBottom: Platform.OS === 'ios' ? 40 : 25 }]}>
            
            <View style={{ alignItems: 'center', marginTop: 10, marginBottom: 5 }}>
              <View style={{ width: 45, height: 6, backgroundColor: '#E2E8F0', borderRadius: 10 }} />
            </View>

            <View style={[styles.modalHeader, { borderBottomWidth: 0, paddingBottom: 10 }]}>
              <Text style={styles.modalTitle}>{editingMachineConfigId ? 'Editar Equipo' : 'Alta de Nuevo Equipo'}</Text>
            </View>
            
            <ScrollView 
              style={styles.modalScrollInside} 
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              onScrollEndDrag={(e) => {
                if (e.nativeEvent.contentOffset.y < -50) limpiarFormularioMaquina();
              }}
            >
              <Text style={styles.modalLabel}>Nombre del Equipo</Text>
              <TextInput style={styles.modalInput} placeholder="Ej. Retroexcavadora CAT 320" value={equipo} onChangeText={setEquipo} />
              
              <Text style={styles.modalLabel}>Proveedor</Text>
              <TextInput style={styles.modalInput} placeholder="Ej. Arrendadora del Centro" value={proveedor} onChangeText={setProveedor} />
              
              <Text style={styles.modalLabel}>Corte de Facturación / Modalidad</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsContainer}>
                <TouchableOpacity style={[styles.pillBtn, modalidad === 'hora' ? styles.pillActiveAzul : null]} onPress={() => setModalidad('hora')}><Text style={[styles.pillText, modalidad === 'hora' ? styles.pillTextActive : null]}>Por Hora</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.pillBtn, modalidad === 'dia' ? styles.pillActiveAzul : null]} onPress={() => setModalidad('dia')}><Text style={[styles.pillText, modalidad === 'dia' ? styles.pillTextActive : null]}>Por Día</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.pillBtn, modalidad === 'semana' ? styles.pillActiveAzul : null]} onPress={() => setModalidad('semana')}><Text style={[styles.pillText, modalidad === 'semana' ? styles.pillTextActive : null]}>Por Semana</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.pillBtn, modalidad === 'mes' ? styles.pillActiveAzul : null]} onPress={() => setModalidad('mes')}><Text style={[styles.pillText, modalidad === 'mes' ? styles.pillTextActive : null]}>Por Mes</Text></TouchableOpacity>
              </ScrollView>
              
              <Text style={styles.modalLabel}>Tarifa por HORA ($)</Text>
              <TextInput style={styles.modalInput} placeholder="Ej. 1200" keyboardType="numeric" value={tarifaHora} onChangeText={(v) => setTarifaHora(v.replace(/[^0-9.]/g, ''))} />
              
              {/* 🟢 GASTO ESTIMADO DINÁMICO */}
              {Number(tarifaHora) > 0 && (
                <View style={styles.calcBox}>
                  <Text style={styles.calcLabel}>
                    💰 Costo estimado por <Text style={{ color: '#2563EB', fontWeight: 'bold' }}>{modalidad === 'hora' ? 'Hora' : modalidad === 'dia' ? 'Día (8 hrs)' : modalidad === 'semana' ? 'Semana (6 días)' : 'Mes (30 días)'}</Text>:
                  </Text>
                  <Text style={{ fontSize: 22, fontWeight: '900', color: '#10B981', marginTop: 4 }}>
                    ${estimacionGastoPeriodo.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </Text>
                  <Text style={{ fontSize: 10, color: '#94A3B8', marginTop: 2, fontStyle: 'italic' }}>
                    {modalidad === 'hora'
                      ? 'Es la tarifa de una hora de operación.'
                      : `Calculado con base en una jornada fija de ${JORNADA_HORAS} horas de operación diaria.`}
                  </Text>
                </View>
              )}
              
              <View style={{height: 20}} />
            </ScrollView>
            
            <View style={[styles.modalFooter, { paddingBottom: 0 }]}>
              <TouchableOpacity style={styles.cancelBtn} onPress={limpiarFormularioMaquina}><Text style={styles.cancelBtnText}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleGuardarConfig} disabled={isSaving}>
                {isSaving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>{editingMachineConfigId ? 'Guardar Cambios' : 'Guardar Equipo'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 2️⃣ MODAL: REPORTAR HORAS HOY / EDICIÓN */}
      <Modal visible={modalHoras} animationType="slide" transparent={true} onRequestClose={() => { setModalHoras(false); limpiarFormsSecundarios(); }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { setModalHoras(false); limpiarFormsSecundarios(); }} />
          
          <View style={[styles.modalWrapper, { maxHeight: '90%', paddingBottom: Platform.OS === 'ios' ? 40 : 25 }]}>
            
            <View style={{ alignItems: 'center', marginTop: 10, marginBottom: 5 }}>
              <View style={{ width: 45, height: 6, backgroundColor: '#E2E8F0', borderRadius: 10 }} />
            </View>

            <View style={[styles.modalHeader, { borderBottomWidth: 0, paddingBottom: 10 }]}>
              <Text style={styles.modalTitle}>{editingRecordId ? 'Editar Horas' : 'Reportar Bitácora'}</Text>
            </View>
            
            <ScrollView 
              style={styles.modalScrollInside} 
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              onScrollEndDrag={(e) => {
                if (e.nativeEvent.contentOffset.y < -50) { setModalHoras(false); limpiarFormsSecundarios(); }
              }}
            >
              <View style={styles.calcBox}>
                <Text style={styles.calcLabel}>Tarifa Registrada: <Text style={{color: '#1E293B'}}>${selectedMaquina?.tarifaHora}/hora</Text></Text>
                {horasOperacion ? (
                  <Text style={[styles.calcLabel, {marginTop: 6, color: '#2563EB'}]}>
                    Costo a Guardar: <Text style={{fontWeight: '900'}}>${(Number(horasOperacion) * (selectedMaquina?.tarifaHora || 0)).toLocaleString('es-MX')}</Text>
                  </Text>
                ) : null}
              </View>
              
              <Text style={styles.modalLabel}>Horas Efectivas de Trabajo</Text>
              <TextInput 
                  style={[styles.modalInput, { fontSize: 20, fontWeight: 'bold', color: '#2563EB', textAlign: 'center' }]} 
                  placeholder="0" 
                  keyboardType="numeric" 
                  value={horasOperacion} 
                  onChangeText={(v) => {
                      const cleanValue = v.replace(/[^0-9.]/g, '');
                      setHorasOperacion(cleanValue);
                      recalcularHoraSalida(cleanValue, timeEntradaDate);
                  }} 
                  autoFocus 
              />
              
              <View style={styles.rowGrid}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalLabel}>Entrada (Opc.)</Text>
                  <SelectorHora
                    valor={horaEntrada ? timeEntradaDate : null}
                    alCambiar={handleEntradaChange}
                    textoVacio="Inicio"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalLabel}>Salida (Auto)</Text>
                  <SelectorHora
                    valor={horaSalida ? timeSalidaDate : null}
                    alCambiar={(d) => { setTimeSalidaDate(d); setHoraSalida(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })); }}
                    textoVacio="Fin"
                  />
                </View>
              </View>
              <Text style={styles.modalLabel}>Nota / Reporte de Falla (Opcional)</Text>
              <TextInput style={[styles.modalInput, {height: 60, textAlignVertical: 'top'}]} placeholder="Ej. Lluvia por la tarde" multiline value={concepto} onChangeText={setConcepto} />
              
              <View style={{height: 20}} />
            </ScrollView>
            
            <View style={[styles.modalFooter, { paddingBottom: 0 }]}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setModalHoras(false); limpiarFormsSecundarios(); }}><Text style={styles.cancelBtnText}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleGuardarUso} disabled={isSaving}>
                {isSaving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>{editingRecordId ? 'Actualizar' : 'Guardar'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 3️⃣ MODAL: ABONAR ANTICIPO / EDICIÓN */}
      <Modal visible={modalAnticipo} animationType="slide" transparent={true} onRequestClose={() => { setModalAnticipo(false); limpiarFormsSecundarios(); }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { setModalAnticipo(false); limpiarFormsSecundarios(); }} />
          
          <View style={[styles.modalWrapper, { maxHeight: '90%', paddingBottom: Platform.OS === 'ios' ? 40 : 25 }]}>
            
            <View style={{ alignItems: 'center', marginTop: 10, marginBottom: 5 }}>
              <View style={{ width: 45, height: 6, backgroundColor: '#E2E8F0', borderRadius: 10 }} />
            </View>

            <View style={[styles.modalHeader, { borderBottomWidth: 0, paddingBottom: 10 }]}>
              <Text style={[styles.modalTitle, {color: '#059669'}]}>{editingRecordId ? 'Editar Pago' : 'Pago a Proveedor'}</Text>
            </View>
            
            <ScrollView 
              style={styles.modalScrollInside} 
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              onScrollEndDrag={(e) => {
                if (e.nativeEvent.contentOffset.y < -50) { setModalAnticipo(false); limpiarFormsSecundarios(); }
              }}
            >
              <Text style={styles.modalLabel}>Monto del Pago o Anticipo ($)</Text>
              <TextInput style={[styles.modalInput, {fontSize: 24, fontWeight: 'bold', color: '#10B981', textAlign: 'center'}]} placeholder="0.00" keyboardType="numeric" value={montoAnticipo} onChangeText={(v) => setMontoAnticipo(v.replace(/[^0-9.]/g, ''))} autoFocus />
              <Text style={styles.modalLabel}>Concepto (Opcional)</Text>
              <TextInput style={[styles.modalInput, {height: 60, textAlignVertical: 'top'}]} placeholder="Ej. Pago semana 3" multiline value={concepto} onChangeText={setConcepto} />
              
              <View style={{height: 20}} />
            </ScrollView>
            
            <View style={[styles.modalFooter, { paddingBottom: 0 }]}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setModalAnticipo(false); limpiarFormsSecundarios(); }}><Text style={styles.cancelBtnText}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, {backgroundColor: '#10B981'}]} onPress={handleGuardarAnticipo} disabled={isSaving}>
                {isSaving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>{editingRecordId ? 'Actualizar Pago' : 'Registrar Pago'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  header: { backgroundColor: '#2563EB', paddingTop: 60, paddingBottom: 30, paddingHorizontal: 25, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, boxShadow: '0px 5px 12px rgba(15, 23, 42, 0.16)', elevation: 5 },
  headerInner: { width: '100%', maxWidth: 800, alignSelf: 'center' },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { padding: 5, marginLeft: -10 },
  headerTitle: { color: '#FFF', fontSize: 28, fontWeight: 'bold', marginTop: 15 },
  projectBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginTop: 8 },
  projectName: { color: '#FFF', fontSize: 12, fontWeight: '600', marginLeft: 5 },
  body: { padding: 20, paddingBottom: 120, width: '100%', maxWidth: 800, alignSelf: 'center' },
  saldoPill: { marginTop: 3, marginHorizontal: 16, padding: 10, borderRadius: 12, borderWidth: 1, alignItems: 'center', alignSelf: 'stretch', maxWidth: 350 },
  saldoText: { fontWeight: '900', fontSize: 13, textAlign: 'center' },
  exportContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, marginTop: 5 },
  bigExportBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 14, boxShadow: '0px 0px 4px rgba(0, 0, 0, 0.1)',    elevation: 2 },
  bigExportText: { color: '#FFF', fontSize: 13, fontWeight: 'bold', marginLeft: 8 },
  emptyText: { textAlign: 'center', color: '#94A3B8', marginTop: 60, fontStyle: 'italic' },
  machineCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 16, marginBottom: 15, borderWidth: 1, borderColor: '#E2E8F0', boxShadow: '0px 3px 8px rgba(15, 23, 42, 0.12)', elevation: 3 },
  machineCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 },
  machineTitle: { fontSize: 17, fontWeight: '900', color: '#1E293B', marginBottom: 2 },
  machineProvider: { fontSize: 12, color: '#64748B', fontWeight: '500' },
  machineDateLabel: { fontSize: 10, color: '#94A3B8', marginTop: 2, fontStyle: 'italic' },
  machineBadgeBox: { backgroundColor: '#F8FAFC', padding: 6, borderRadius: 8, alignItems: 'flex-end' },
  machineBadgeText: { fontSize: 9, color: '#64748B', fontWeight: 'bold', textTransform: 'uppercase' },
  machineRate: { fontSize: 14, fontWeight: '900', color: '#2563EB', marginTop: 2 },
  machineStatsRow: { flexDirection: 'row', backgroundColor: '#F8FAFC', borderRadius: 12, paddingVertical: 10, marginBottom: 15 },
  statCol: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statLabel: { fontSize: 10, color: '#94A3B8', fontWeight: 'bold', marginBottom: 2 },
  statValue: { fontSize: 14, fontWeight: '900', color: '#0F172A' },
  openDetailBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  openDetailText: { fontSize: 12, fontWeight: 'bold', color: '#64748B', marginRight: 5 },
  fab: { position: 'absolute', bottom: 35, right: '50%', transform: [{translateX: 32.5}], width: 65, height: 65, borderRadius: 32.5, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center', elevation: 8, boxShadow: '0px 0px 0px rgba(37, 99, 235, 0.4)',  },
  modalOverlayFull: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalWrapperFull: { backgroundColor: '#F1F5F9', borderTopLeftRadius: 25, borderTopRightRadius: 25, width: '100%', height: '90%' },
  modalHeaderFull: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: '#FFF', borderTopLeftRadius: 25, borderTopRightRadius: 25 },
  modalTitleFull: { fontSize: 22, fontWeight: 'bold', color: '#0F172A' },
  closeBtnCircle: { backgroundColor: '#F1F5F9', padding: 8, borderRadius: 20 },
  editConfigBtnCircle: { backgroundColor: '#EFF6FF', padding: 8, borderRadius: 20 },
  tabContainerFull: { flexDirection: 'row', backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  tabBtnFull: { flex: 1, paddingVertical: 15, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabActiveFull: { borderBottomColor: '#2563EB' },
  tabTextFull: { fontSize: 13, fontWeight: 'bold', color: '#64748B' },
  tabTextActiveFull: { color: '#2563EB' },
  footerActionsFull: { flexDirection: 'row', padding: 20, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E2E8F0', gap: 15, paddingBottom: Platform.OS === 'ios' ? 40 : 20 },
  footerBtnFull: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 14, borderRadius: 12 },
  footerBtnTextFull: { fontSize: 14, fontWeight: 'bold', marginLeft: 8 },
  historyCard: { backgroundColor: '#FFF', padding: 16, borderRadius: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0', boxShadow: '0px 0px 5px rgba(0, 0, 0, 0.03)',    elevation: 1 },
  historyIconBox: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  historyInfo: { flex: 1, paddingRight: 10 },
  historyConcept: { fontSize: 14, fontWeight: 'bold', color: '#1E293B' },
  historyDate: { fontSize: 11, color: '#64748B', marginTop: 4 },
  historyAmountBox: { alignItems: 'flex-end' },
  historyHrs: { fontSize: 11, fontWeight: 'bold', color: '#2563EB', marginBottom: 2 },
  historyAmountCargo: { fontSize: 15, fontWeight: 'bold', color: '#DC2626' },
  historyAmountAbono: { fontSize: 15, fontWeight: 'bold', color: '#10B981' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalWrapper: { backgroundColor: '#FFF', borderTopLeftRadius: 25, borderTopRightRadius: 25, width: '100%', maxWidth: 600, alignSelf: 'center', maxHeight: '85%' },
  modalHeader: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#0F172A' },
  modalScrollInside: { padding: 20 },
  modalFooter: { flexDirection: 'row', padding: 20, borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#F8FAFC', gap: 15, paddingBottom: Platform.OS === 'ios' ? 35 : 20 },
  pillsContainer: { flexDirection: 'row', marginBottom: 15 },
  pillBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#F1F5F9', marginRight: 8, borderWidth: 1, borderColor: '#E2E8F0', height: 35, justifyContent: 'center' },
  pillActiveAzul: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  pillText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  pillTextActive: { color: '#FFF' },
  rowGrid: { flexDirection: 'row', gap: 12, marginTop: 10, marginBottom: 5 },
  calcBox: { backgroundColor: '#F8FAFC', padding: 12, borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
  calcLabel: { fontSize: 12, color: '#64748B', fontWeight: 'bold' },
  modalLabel: { fontSize: 12, fontWeight: '700', color: '#475569', marginTop: 10, marginBottom: 6 },
  modalInput: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 12, fontSize: 14, color: '#0F172A', minHeight: 46, justifyContent: 'center' },
  saveBtn: { flex: 2, backgroundColor: '#2563EB', padding: 15, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 15 },
  cancelBtn: { flex: 1, backgroundColor: '#FFF', padding: 15, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#CBD5E1' },
  cancelBtnText: { color: '#475569', fontSize: 15, fontWeight: '700' }
});