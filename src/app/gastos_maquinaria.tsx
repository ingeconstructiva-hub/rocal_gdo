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
import { limitarNumero, revisarNumeros } from '../lib/limites';
import { mensajeDeError } from '../lib/errores';
import { esDeHoy, eliminarRegistro, puedeExportar } from '../lib/permisos';
import { CORTES, Corte, corteDe, enHorasYMinutos, TIPOS_DE_VIAJE } from '../lib/maquinaria';
import { SelectorHora } from '../components/SelectorHora';
import { generarPlantillaMaquinaria } from '../utils/pdfMaquinaria';

interface GastoMaquinaria {
  id: string;
  equipo: string;
  concepto: string;
  pagado_por?: string | null;
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
  // Quien saco el dinero del pago. Va en el reporte que se coteja con el
  // proveedor: sin esto, un abono no se puede rastrear a nadie.
  const [pagadoPor, setPagadoPor] = useState('');

  // Estados para configuración de equipo
  const [editingMachineConfigId, setEditingMachineConfigId] = useState<string | null>(null);
  const [originalMachineName, setOriginalMachineName] = useState('');
  const [equipo, setEquipo] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [modalidad, setModalidad] = useState<Corte>('semana');
  // De que fue el viaje. Solo se usa cuando el corte es por viaje.
  const [tipoViaje, setTipoViaje] = useState<string>('Pipa');
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
    } catch (error: any) {
      /* Antes esto solo hacia console.log. Al fallar la consulta la
       * pantalla se quedaba sin maquinas, y como los botones de Excel y PDF
       * solo salen cuando hay al menos una, desaparecian sin explicacion:
       * se veia igual que una obra sin equipos dados de alta. */
      Aviso.alert('No se pudo cargar la maquinaria', mensajeDeError(error, 'traer los registros de maquinaria'));
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

  /* El corte que se esta configurando, y el de la maquina abierta.
   *
   * Ya no hay nada que estimar: la tarifa es el costo de una unidad del
   * corte. Antes se multiplicaba por una jornada de 8 horas y semanas de 6
   * dias para inventar el costo de los demas cortes, y ese numero supuesto
   * terminaba discutiendose con el proveedor.
   */
  const corteEnEdicion = corteDe(modalidad);
  const corteDeLaMaquina = corteDe(selectedMaquina?.modalidad);

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

  /* Horas, entrada y salida: con dos cualesquiera sale la tercera.
   *
   * El calculo arranca de la hora que la persona haya escrito. Antes, al
   * teclear las horas sin haber puesto ninguna, se tomaba la hora ACTUAL
   * como entrada y de ahi salia una salida inventada: capturar a las 6 de
   * la tarde una jornada de 8 horas dejaba escrito que el equipo habia
   * entrado a las 6 p.m. Lo que se escribe manda, y lo que no se escribio
   * se queda vacio.
   *
   * Nada de esto aplica fuera del corte por hora: con el corte por viaje lo
   * capturado son viajes, y pisarlo con una resta de relojes seria inventar
   * un numero.
   */
  const comoTexto = (fecha: Date) =>
    fecha.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  /* Horas entre dos momentos del dia, con dos decimales.
   *
   * Una salida anterior a la entrada se lee como turno que cruzo la
   * medianoche: es la unica lectura que da un numero positivo. */
  const horasEntre = (entradaDate: Date, salidaDate: Date) => {
    let minutos = (salidaDate.getTime() - entradaDate.getTime()) / 60000;
    if (minutos < 0) minutos += 24 * 60;
    return Math.round((minutos / 60) * 100) / 100;
  };

  /** De las horas tecleadas sale la hora de salida. */
  const recalcularHoraSalida = (horasStr: string, entradaDate: Date) => {
    setHorasOperacion(horasStr);
    const hrs = parseFloat(horasStr);
    if (isNaN(hrs) || hrs <= 0) return;

    const nuevaSalida = new Date(entradaDate);
    nuevaSalida.setMinutes(nuevaSalida.getMinutes() + Math.round(hrs * 60));

    setTimeSalidaDate(nuevaSalida);
    setHoraSalida(comoTexto(nuevaSalida));
  };

  /** De las horas tecleadas y la salida sale la hora de entrada. */
  const recalcularHoraEntrada = (horasStr: string, salidaDate: Date) => {
    setHorasOperacion(horasStr);
    const hrs = parseFloat(horasStr);
    if (isNaN(hrs) || hrs <= 0) return;

    const nuevaEntrada = new Date(salidaDate);
    nuevaEntrada.setMinutes(nuevaEntrada.getMinutes() - Math.round(hrs * 60));

    setTimeEntradaDate(nuevaEntrada);
    setHoraEntrada(comoTexto(nuevaEntrada));
  };

  /* Lo que pasa al teclear las horas, segun lo que ya este escrito.
   *
   * Sin ninguna hora puesta no se toca ningun reloj: se guardan las horas y
   * ya. Inventar una entrada a partir del momento de la captura es peor que
   * dejarlo en blanco, porque queda en la bitacora como si alguien la
   * hubiera anotado. */
  const cambiarHoras = (horasStr: string) => {
    setHorasOperacion(horasStr);
    if (corteDeLaMaquina.valor !== 'hora') return;

    if (horaEntrada) recalcularHoraSalida(horasStr, timeEntradaDate);
    else if (horaSalida) recalcularHoraEntrada(horasStr, timeSalidaDate);
  };

  /** De la hora de salida salen las horas trabajadas. */
  const recalcularHoras = (salidaDate: Date, entradaDate: Date) => {
    setTimeSalidaDate(salidaDate);
    setHoraSalida(comoTexto(salidaDate));

    if (corteDeLaMaquina.valor !== 'hora') return;

    // Con entrada puesta salen las horas; sin ella, pero con horas ya
    // tecleadas, sale la entrada. Sin ninguna de las dos no hay que calcular.
    if (horaEntrada) setHorasOperacion(String(horasEntre(entradaDate, salidaDate)));
    else if (horasOperacion) recalcularHoraEntrada(horasOperacion, salidaDate);
  };

  /* Al mover la entrada manda lo que ya estaba puesto: si habia salida se
   * recalculan las horas, y si no, pero habia horas, se recalcula la salida. */
  const handleEntradaChange = (date: Date) => {
    setTimeEntradaDate(date);
    setHoraEntrada(comoTexto(date));

    if (corteDeLaMaquina.valor !== 'hora') return;
    if (horaSalida) setHorasOperacion(String(horasEntre(date, timeSalidaDate)));
    else if (horasOperacion) recalcularHoraSalida(horasOperacion, date);
  };

  /**
   * 📌 NOTA: handleGuardarUso
   * Inserta o edita un reporte de uso de horas (bitácora) calculando el costo del día (horas * tarifa).
   */
  const handleGuardarUso = async () => {
    const corte = corteDe(selectedMaquina?.modalidad);
    const enPlural = corte.unidades.toLowerCase();

    if (!selectedMaquina || !horasOperacion.trim()) {
      Aviso.alert(`Faltan ${enPlural}`, `Anota cuántas ${enPlural} se van a facturar.`);
      return;
    }

    /* Un viaje marcado "Otro" sin explicacion queda indistinguible de
     * cualquier otro en la bitacora, que es justo lo que el tipo de viaje
     * vino a resolver. Se pide antes de guardar, no despues. */
    if (corte.valor === 'viaje' && tipoViaje === 'Otro' && !concepto.trim()) {
      Aviso.alert('Falta decir de qué fue', 'Con "Otro" hay que anotar de qué fue el viaje; si no, en la bitácora no se distingue de los demás.');
      return;
    }

    setIsSaving(true);

    const cantidad = Number(horasOperacion);
    const tarifa = Number(selectedMaquina.tarifaHora) || 0;
    const costoDia = cantidad * tarifa;

    const problema = revisarNumeros([{ etiqueta: 'El costo', valor: costoDia }]);
    if (problema) { Aviso.alert('Cantidad demasiado grande', problema); setIsSaving(false); return; }

    /* En un viaje, de que fue va al frente del concepto: es lo primero que se
     * busca al revisar la bitacora. La nota, si la hay, va despues. */
    const nota = concepto.trim();
    const conceptoFinal =
      corte.valor === 'viaje'
        ? [`Viaje de ${tipoViaje}`, nota].filter(Boolean).join(' - ')
        : nota || `${cantidad} ${corte.corta}`;

    const datosPayload = {
      project_id: activeProject?.id,
      equipo: selectedMaquina.equipo,
      proveedor: selectedMaquina.proveedor,
      categoria: 'uso',
      tipo_renta: selectedMaquina.modalidad,
      costo_tarifa: tarifa,
      asistencia_dias: cantidad,
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
      pagado_por: pagadoPor.trim() || null,
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
      setPagadoPor(record.pagado_por || '');

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
    setTipoViaje('Pipa');
    setPagadoPor('');
  };

  /**
   * 📌 NOTA: handleExportarExcel
   * Construye un archivo CSV con las bitácoras diarias y pagos de maquinaria y lo comparte.
   */
  const handleExportarExcel = async () => {
    if (gastos.length === 0) return;
    try {
      const encabezados = ["Fecha", "Tipo", "Equipo", "Proveedor", "Corte por", "Tarifa por Unidad ($)", "Unidades Facturadas", "Concepto/Detalle", "Costo Generado ($)", "Anticipo Pagado ($)", "Quién paga\n"];
      const filas = gastos.map(g => {
        if (g.categoria === 'config') return null; 
        const fecha = new Date(g.fecha).toLocaleDateString('es-MX');
        const eqLimpio = g.equipo.replace(/,/g, ' ');
        const provLimpio = g.proveedor ? g.proveedor.replace(/,/g, ' ') : '';
        const conceptoLimpio = g.concepto ? g.concepto.replace(/,/g, ' ') : '';
        const pagaLimpio = g.pagado_por ? g.pagado_por.replace(/,/g, ' ') : '';
        const hrs = g.asistencia_dias || '';
        const tarifaF = g.costo_tarifa || '';
        const mod = g.tipo_renta ? g.tipo_renta.toUpperCase() : '';
        const cargo = g.categoria === 'uso' ? g.monto : 0;
        const abono = g.categoria === 'anticipo' ? g.monto : 0;
        const etiqueta = g.categoria === 'uso' ? 'BITÁCORA DIARIA' : 'PAGO/ANTICIPO';
        return `${fecha},"${etiqueta}","${eqLimpio}","${provLimpio}","${mod}",${tarifaF},${hrs},"${conceptoLimpio}",${cargo},${abono},"${pagaLimpio}"`;
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

        {puedeExportar() && maquinasMap.length > 0 && (
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
                    <Text style={styles.machineBadgeText}>Corte {corteDe(maquina.modalidad).etiqueta.toLowerCase()}</Text>
                    <Text style={styles.machineRate}>${maquina.tarifaHora} / {corteDe(maquina.modalidad).unidad}</Text>
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
                      {/* En la bitacora decia "hrs" pasara lo que pasara, asi que
                          dos viajes se leian como dos horas. Cada renglon se lee
                          en la unidad de su corte, y las horas con sus minutos. */}
                      <Text style={styles.historyHrs}>
                        {corteDe(reg.tipo_renta).valor === 'hora'
                          ? enHorasYMinutos(Number(reg.asistencia_dias))
                          : `${reg.asistencia_dias} ${corteDe(reg.tipo_renta).corta}`}
                      </Text>
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
                {CORTES.map((c) => (
                  <TouchableOpacity
                    key={c.valor}
                    style={[styles.pillBtn, modalidad === c.valor ? styles.pillActiveAzul : null]}
                    onPress={() => setModalidad(c.valor)}
                  >
                    <Text style={[styles.pillText, modalidad === c.valor ? styles.pillTextActive : null]}>{c.etiqueta}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              
              <Text style={styles.modalLabel}>Tarifa por {corteEnEdicion.unidad.toUpperCase()} ($)</Text>
              <TextInput style={styles.modalInput} placeholder="Ej. 1200" keyboardType="numeric" value={tarifaHora} onChangeText={(v) => setTarifaHora(limitarNumero(v))} />
              
              {Number(tarifaHora) > 0 && (
                <View style={styles.calcBox}>
                  <Text style={styles.calcLabel}>
                    Se va a cobrar <Text style={{ color: '#2563EB', fontWeight: 'bold' }}>${Number(tarifaHora).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</Text> por cada <Text style={{ color: '#2563EB', fontWeight: 'bold' }}>{corteEnEdicion.unidad}</Text>.
                  </Text>
                  <Text style={{ fontSize: 10, color: '#94A3B8', marginTop: 4, fontStyle: 'italic' }}>
                    Al capturar el uso se anotan los {corteEnEdicion.unidades.toLowerCase()} y el costo sale de multiplicar.
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
                <Text style={styles.calcLabel}>Tarifa Registrada: <Text style={{color: '#1E293B'}}>${selectedMaquina?.tarifaHora} por {corteDeLaMaquina.unidad}</Text></Text>
                {horasOperacion ? (
                  <Text style={[styles.calcLabel, {marginTop: 6, color: '#2563EB'}]}>
                    Costo a Guardar: <Text style={{fontWeight: '900'}}>${(Number(horasOperacion) * (selectedMaquina?.tarifaHora || 0)).toLocaleString('es-MX')}</Text>
                  </Text>
                ) : null}
              </View>
              
              <Text style={styles.modalLabel}>{corteDeLaMaquina.unidades} a Facturar</Text>
              <TextInput 
                  style={[styles.modalInput, { fontSize: 20, fontWeight: 'bold', color: '#2563EB', textAlign: 'center' }]} 
                  placeholder="0" 
                  keyboardType="numeric" 
                  value={horasOperacion} 
                  onChangeText={(v) => cambiarHoras(limitarNumero(v))} 
                  autoFocus 
              />

              {/* Con un numero puesto se lee en horas y minutos, que es lo que
                  el residente puede confirmar de un vistazo: "4.97" no se
                  parece a nada, "4 h 58 min" si. Sin numero todavia, se
                  explica el doble sentido, que si no nadie lo descubre. */}
              {corteDeLaMaquina.valor === 'hora' && (
                <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: -6, marginBottom: 10, fontStyle: 'italic' }}>
                  {enHorasYMinutos(Number(horasOperacion))
                    ? `Son ${enHorasYMinutos(Number(horasOperacion))} de operación.`
                    : 'Pon las horas y sale la salida, o pon la salida y salen las horas.'}
                </Text>
              )}
              
              <View style={styles.rowGrid}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalLabel}>Entrada</Text>
                  <SelectorHora
                    valor={horaEntrada ? timeEntradaDate : null}
                    alCambiar={handleEntradaChange}
                    textoVacio="Inicio"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalLabel}>Salida</Text>
                  <SelectorHora
                    valor={horaSalida ? timeSalidaDate : null}
                    alCambiar={(d) => recalcularHoras(d, timeEntradaDate)}
                    textoVacio="Fin"
                  />
                </View>
              </View>
              {corteDeLaMaquina.valor === 'viaje' && (
                <>
                  <Text style={styles.modalLabel}>¿De qué fue el viaje?</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsContainer}>
                    {TIPOS_DE_VIAJE.map((tipo) => (
                      <TouchableOpacity
                        key={tipo}
                        style={[styles.pillBtn, tipoViaje === tipo ? styles.pillActiveAzul : null]}
                        onPress={() => setTipoViaje(tipo)}
                      >
                        <Text style={[styles.pillText, tipoViaje === tipo ? styles.pillTextActive : null]}>{tipo}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}

              <Text style={styles.modalLabel}>
                {corteDeLaMaquina.valor === 'viaje'
                  ? (tipoViaje === 'Otro' ? '¿De qué fue? (obligatorio)' : 'Nota del viaje (Opcional)')
                  : 'Nota / Reporte de Falla (Opcional)'}
              </Text>
              <TextInput
                style={[styles.modalInput, {height: 60, textAlignVertical: 'top'}]}
                placeholder={corteDeLaMaquina.valor === 'viaje' ? 'Ej. Pipa de 10 mil litros a la cisterna' : 'Ej. Lluvia por la tarde'}
                multiline
                value={concepto}
                onChangeText={setConcepto}
              />
              
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
              <TextInput style={[styles.modalInput, {fontSize: 24, fontWeight: 'bold', color: '#10B981', textAlign: 'center'}]} placeholder="0.00" keyboardType="numeric" value={montoAnticipo} onChangeText={(v) => setMontoAnticipo(limitarNumero(v))} autoFocus />
              <Text style={styles.modalLabel}>¿Quién paga?</Text>
              <TextInput style={styles.modalInput} placeholder="Ej. Caja chica de obra, Oficina, Arq. Juan" value={pagadoPor} onChangeText={setPagadoPor} />

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