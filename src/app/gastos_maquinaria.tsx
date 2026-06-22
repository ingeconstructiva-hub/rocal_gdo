import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import SummaryCard from '../components/SummaryCard';
import { useProject } from '../context/ProjectContext';
import { useUser } from '../context/UserContext';
import { supabase } from '../lib/supabase';
import { generarPlantillaMaquinaria } from './utils/pdfMaquinaria';

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

export default function GastosMaquinariaScreen() {
  const router = useRouter();
  const { activeProject, isOffline } = useProject();
  const { profile } = useUser();
  const isAdminOrOficina = profile?.role === 'admin' || profile?.role === 'oficina';

  const [gastos, setGastos] = useState<GastoMaquinaria[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  // 🎛️ ESTADOS DEL MODAL DE DETALLE (HISTORIAL)
  const [modalDetalleMaquina, setModalDetalleMaquina] = useState(false);
  const [detalleTab, setDetalleTab] = useState<'uso' | 'anticipo'>('uso');
  const [selectedMaquina, setSelectedMaquina] = useState<MaquinaAgrupada | null>(null);

  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);

  // 🎛️ ESTADOS PARA FORMULARIOS
  const [modalNuevaMaquina, setModalNuevaMaquina] = useState(false);
  const [modalHoras, setModalHoras] = useState(false);
  const [modalAnticipo, setModalAnticipo] = useState(false);

  // 📝 VARIABLES DE FORMULARIO - MAQUINA (CONFIG)
  const [editingMachineConfigId, setEditingMachineConfigId] = useState<string | null>(null);
  const [originalMachineName, setOriginalMachineName] = useState('');
  const [equipo, setEquipo] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [modalidad, setModalidad] = useState<'dia' | 'semana' | 'mes'>('semana');
  const [tarifaHora, setTarifaHora] = useState('');
  
  // 📝 VARIABLES DE FORMULARIO - USO / PAGOS
  const [horasOperacion, setHorasOperacion] = useState('');
  const [montoAnticipo, setMontoAnticipo] = useState('');
  const [concepto, setConcepto] = useState('');

  const [horaEntrada, setHoraEntrada] = useState('');
  const [horaSalida, setHoraSalida] = useState('');
  const [timeEntradaDate, setTimeEntradaDate] = useState(new Date());
  const [timeSalidaDate, setTimeSalidaDate] = useState(new Date());
  const [showPickerEntrada, setShowPickerEntrada] = useState(false);
  const [showPickerSalida, setShowPickerSalida] = useState(false);

  useEffect(() => {
    if (activeProject?.id) fetchGastos();
  }, [activeProject, isOffline]);

  const fetchGastos = async () => {
    setLoading(true);
    const pid = activeProject?.id;
    if (!pid) return;
    try {
      if (isOffline) {
        const cached = await AsyncStorage.getItem(`@gastos_maquinaria_log_${pid}`);
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
          await AsyncStorage.setItem(`@gastos_maquinaria_log_${pid}`, JSON.stringify(data));
        }
      }
    } catch (error) { console.log(error); } finally { setLoading(false); }
  };

  const maquinasMap = useMemo(() => {
    const map: Record<string, MaquinaAgrupada> = {};
    gastos.forEach(g => {
      if (!map[g.equipo]) {
        map[g.equipo] = { 
          equipo: g.equipo, 
          proveedor: g.proveedor || 'S/P', 
          modalidad: g.tipo_renta || 'semana', 
          tarifaHora: Number(g.costo_tarifa) || 0, // 🟢 Forzado a Number
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
        map[g.equipo].costoGenerado += Number(g.monto) || 0; // 🟢 Forzado a Number para sumar matemáticamente
      }
      else if (g.categoria === 'anticipo') {
        map[g.equipo].totalAnticipos += Number(g.monto) || 0; // 🟢 Forzado a Number
      }
      map[g.equipo].saldoPendiente = map[g.equipo].costoGenerado - map[g.equipo].totalAnticipos;
    });
    return Object.values(map);
  }, [gastos]);

  const historialUsoActivo = useMemo(() => {
    if(!selectedMaquina) return [];
    return gastos.filter(g => g.equipo === selectedMaquina.equipo && g.categoria === 'uso').sort((a,b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }, [gastos, selectedMaquina]);

  const historialAbonosActivo = useMemo(() => {
    if(!selectedMaquina) return [];
    return gastos.filter(g => g.equipo === selectedMaquina.equipo && g.categoria === 'anticipo').sort((a,b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }, [gastos, selectedMaquina]);

  const globalGenerado = maquinasMap.reduce((sum, m) => sum + m.costoGenerado, 0);
  const globalPagado = maquinasMap.reduce((sum, m) => sum + m.totalAnticipos, 0);
  const globalDeuda = globalGenerado - globalPagado;

  // 1️⃣ ALTA Y EDICIÓN DE MÁQUINA (CONFIG)
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

  const limpiarFormularioMaquina = () => {
    setModalNuevaMaquina(false);
    setEquipo(''); setProveedor(''); setTarifaHora('');
    setEditingMachineConfigId(null); setOriginalMachineName('');
  };

// 1️⃣ ALTA Y EDICIÓN DE MÁQUINA (CONFIG)
  const handleGuardarConfig = async () => {
    if (!equipo.trim() || !tarifaHora.trim()) { Alert.alert("Campos Vacíos", "El nombre y tarifa son obligatorios."); return; }
    if (isOffline) { Alert.alert("Modo Offline", "Conéctate a internet para editar la configuración de la máquina."); return; }
    
    setIsSaving(true);
    
    try {
      if (originalMachineName) { 
        // 🟢 EDITANDO MÁQUINA EXISTENTE
        const nuevoNombre = equipo.trim();

        // Paso A: Si cambió el nombre, actualizamos TODO el historial de uso y pagos en cascada
        if (nuevoNombre !== originalMachineName) {
          const { error: errUpdateNombre } = await supabase.from('gastos_maquinaria')
            .update({ equipo: nuevoNombre })
            .eq('equipo', originalMachineName)
            .eq('project_id', activeProject?.id);
            
          if (errUpdateNombre) throw errUpdateNombre;
        }

        // Paso B: Intentamos actualizar los datos (Proveedor, Tarifa, Modalidad)
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
          // Si era una máquina vieja que nunca tuvo un registro "config", se lo creamos
          const nuevoRegistro = {
            project_id: activeProject?.id,
            equipo: nuevoNombre,
            concepto: 'Configuración Inicial', // 🟢 CORRECCIÓN: Agregado para cumplir la regla Not-Null
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

        Alert.alert("¡Actualizado!", "Los datos del equipo han sido modificados.");
      } else {
        // ➕ ALTA DE NUEVA MÁQUINA
        const nuevoRegistro = {
          project_id: activeProject?.id,
          equipo: equipo.trim(),
          concepto: 'Alta de equipo', // 🟢 CORRECCIÓN: Agregado para cumplir la regla Not-Null
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
      fetchGastos(); // Recargamos para ver los cambios instantáneamente
    } catch (e: any) { 
      Alert.alert("Error", e.message); 
    } finally { 
      setIsSaving(false); 
    }
  };

  // 🧮 CÁLCULO DE HORA DE SALIDA AUTOMÁTICO
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

  const handleEntradaChange = (date: Date) => {
    setTimeEntradaDate(date);
    setHoraEntrada(date.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}));
    if (horasOperacion) recalcularHoraSalida(horasOperacion, date);
  };

  // 2️⃣ REGISTRAR / EDITAR HORAS
  const handleGuardarUso = async () => {
    if (!selectedMaquina || !horasOperacion.trim()) { Alert.alert("Faltan Horas", "Ingresa las horas de trabajo."); return; }
    setIsSaving(true);
    
    const horas = Number(horasOperacion);
    const tarifa = Number(selectedMaquina.tarifaHora) || 0;
    const costoDia = horas * tarifa; // 🟢 Aseguramos que la matemática sea correcta
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
      monto: Number(costoDia), // 🟢 Guardamos como número puro
      is_active: true,
      fecha: editingRecordId ? (gastos.find(g=>g.id===editingRecordId)?.fecha || new Date().toISOString()) : new Date().toISOString()
    };

    try {
      if (editingRecordId) {
        await supabase.from('gastos_maquinaria').update(datosPayload).eq('id', editingRecordId);
      } else {
        await supabase.from('gastos_maquinaria').insert([datosPayload]);
      }
      setModalHoras(false); limpiarFormsSecundarios(); fetchGastos();
      Alert.alert("¡Éxito!", editingRecordId ? "Bitácora actualizada." : "Bitácora guardada.");
    } catch (e: any) { Alert.alert("Error", e.message); } finally { setIsSaving(false); }
  };

  // 3️⃣ REGISTRAR / EDITAR ANTICIPO
  const handleGuardarAnticipo = async () => {
    if (!selectedMaquina || !montoAnticipo.trim()) { Alert.alert("Campos Vacíos", "Ingresa el monto."); return; }
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
      if (editingRecordId) {
        await supabase.from('gastos_maquinaria').update(datosPayload).eq('id', editingRecordId);
      } else {
        await supabase.from('gastos_maquinaria').insert([datosPayload]);
      }
      setModalAnticipo(false); limpiarFormsSecundarios(); fetchGastos();
      Alert.alert("¡Éxito!", "Pago registrado.");
    } catch (e: any) { Alert.alert("Error", e.message); } finally { setIsSaving(false); }
  };

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

  const handleEliminarRegistro = (id: string) => {
    Alert.alert("Eliminar", "¿Borrar permanentemente?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Borrar", style: "destructive", onPress: async () => {
          try {
            await supabase.from('gastos_maquinaria').update({ is_active: false }).eq('id', id);
            fetchGastos();
          } catch (e: any) { Alert.alert("Error", e.message); }
      }}
    ]);
  };

  const limpiarFormsSecundarios = () => {
    setHorasOperacion(''); setMontoAnticipo(''); setConcepto('');
    setHoraEntrada(''); setHoraSalida(''); setEditingRecordId(null);
  };

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
      const fileUri = `${FileSystem.documentDirectory}${nombreArchivo}`;
      await FileSystem.writeAsStringAsync(fileUri, contenidoCSV, { encoding: 'utf8' });
      await Sharing.shareAsync(fileUri, { mimeType: 'text/csv' });
    } catch (error: any) { Alert.alert("Error Excel", error.message); }
  };

  const handleExportPDF = async () => {
    if (gastos.length === 0) return;
    setIsExportingPDF(true);
    try {
        const htmlContent = generarPlantillaMaquinaria(activeProject?.name || 'Obra', globalGenerado, globalPagado, globalDeuda, gastos);
        const { uri } = await Print.printToFileAsync({ html: htmlContent });
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
    } catch (error: any) { Alert.alert("Error PDF", error.message); } finally { setIsExportingPDF(false); }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerInner}>
          <View style={styles.headerTopRow}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}><Feather name="chevron-left" size={32} color="#FFF" /></TouchableOpacity>
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
          <SummaryCard labelLeft="Abonado a Proveedores" valueLeft={globalPagado} labelRight="Costo Generado" valueRight={globalGenerado} colorRight="#10B981" />
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

        {loading ? ( <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 50 }} /> ) : (
          maquinasMap.length === 0 ? (
            <Text style={styles.emptyText}>Da de alta tu primera máquina tocando el botón "+".</Text>
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

      {isAdminOrOficina && (
        <TouchableOpacity style={styles.fab} onPress={() => { limpiarFormularioMaquina(); setModalNuevaMaquina(true); }}>
          <Feather name="plus" size={30} color="#FFF" />
        </TouchableOpacity>
      )}

      {/* 🟢 MODAL: DETALLES DE LA MÁQUINA (HISTORIAL Y BOTONES DE ACCIÓN) */}
      <Modal visible={modalDetalleMaquina} animationType="slide" transparent={true} onRequestClose={() => setModalDetalleMaquina(false)}>
        <View style={styles.modalOverlayFull}>
          <View style={styles.modalWrapperFull}>
            
            {/* 🟢 HEADER DEL MODAL CON BOTÓN DE EDITAR */}
            <View style={styles.modalHeaderFull}>
              <View style={{flex:1, paddingRight: 10}}>
                <Text style={styles.modalTitleFull} numberOfLines={1}>{selectedMaquina?.equipo}</Text>
                <Text style={{color:'#64748B', fontSize: 13}}>Proveedor: {selectedMaquina?.proveedor}</Text>
              </View>
              
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {isAdminOrOficina && selectedMaquina && (
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
                    {isAdminOrOficina && (
                      <View style={{marginLeft: 10, alignItems: 'center', justifyContent: 'center', gap: 10}}>
                        <TouchableOpacity onPress={() => iniciarEdicionRegistro(reg)}><Feather name="edit-2" size={18} color="#94A3B8" /></TouchableOpacity>
                        <TouchableOpacity onPress={() => handleEliminarRegistro(reg.id)}><Feather name="trash-2" size={18} color="#EF4444" /></TouchableOpacity>
                      </View>
                    )}
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
                    {isAdminOrOficina && (
                      <View style={{marginLeft: 10, alignItems: 'center', justifyContent: 'center', gap: 10}}>
                        <TouchableOpacity onPress={() => iniciarEdicionRegistro(reg)}><Feather name="edit-2" size={18} color="#94A3B8" /></TouchableOpacity>
                        <TouchableOpacity onPress={() => handleEliminarRegistro(reg.id)}><Feather name="trash-2" size={18} color="#EF4444" /></TouchableOpacity>
                      </View>
                    )}
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
      <Modal visible={modalNuevaMaquina} animationType="fade" transparent={true} onRequestClose={limpiarFormularioMaquina}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <Pressable style={{ flex: 1 }} onPress={limpiarFormularioMaquina} />
          <View style={styles.modalWrapper}>
            <View style={styles.modalHeader}><Text style={styles.modalTitle}>{editingMachineConfigId ? 'Editar Equipo' : 'Alta de Nuevo Equipo'}</Text></View>
            <ScrollView style={styles.modalScrollInside} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalLabel}>Nombre del Equipo</Text>
              <TextInput style={styles.modalInput} placeholder="Ej. Retroexcavadora CAT 320" value={equipo} onChangeText={setEquipo} />
              <Text style={styles.modalLabel}>Proveedor</Text>
              <TextInput style={styles.modalInput} placeholder="Ej. Arrendadora del Centro" value={proveedor} onChangeText={setProveedor} />
              <Text style={styles.modalLabel}>Corte de Facturación / Modalidad</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsContainer}>
                <TouchableOpacity style={[styles.pillBtn, modalidad === 'dia' && styles.pillActiveAzul]} onPress={() => setModalidad('dia')}><Text style={[styles.pillText, modalidad === 'dia' && styles.pillTextActive]}>Por Día</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.pillBtn, modalidad === 'semana' && styles.pillActiveAzul]} onPress={() => setModalidad('semana')}><Text style={[styles.pillText, modalidad === 'semana' && styles.pillTextActive]}>Por Semana</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.pillBtn, modalidad === 'mes' && styles.pillActiveAzul]} onPress={() => setModalidad('mes')}><Text style={[styles.pillText, modalidad === 'mes' && styles.pillTextActive]}>Por Mes</Text></TouchableOpacity>
              </ScrollView>
              <Text style={styles.modalLabel}>Tarifa por HORA ($)</Text>
              <TextInput style={styles.modalInput} placeholder="Ej. 1200" keyboardType="numeric" value={tarifaHora} onChangeText={(v) => setTarifaHora(v.replace(/[^0-9.]/g, ''))} />
            </ScrollView>
            <View style={styles.modalFooter}>
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
          <Pressable style={{ flex: 1 }} onPress={() => { setModalHoras(false); limpiarFormsSecundarios(); }} />
          <View style={styles.modalWrapper}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingRecordId ? 'Editar Horas' : 'Reportar Bitácora'}</Text>
            </View>
            <ScrollView style={styles.modalScrollInside} keyboardShouldPersistTaps="handled">
              
              {/* 🟢 PREVISUALIZADOR DEL COSTO */}
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
                  {Platform.OS === 'ios' ? (
                    <View style={[styles.modalInput, { padding: 4, justifyContent: 'center' }]}>
                      <DateTimePicker value={timeEntradaDate} mode="time" display="default" style={{height: 30}} onChange={(e, d) => { if(d) handleEntradaChange(d); }} />
                    </View>
                  ) : (
                    <>
                      <TouchableOpacity style={styles.timeBtn} onPress={() => setShowPickerEntrada(true)}>
                        <Feather name="clock" size={14} color={horaEntrada ? '#2563EB' : '#94A3B8'} />
                        <Text style={[styles.timeBtnText, horaEntrada && {color: '#0F172A'}]}>{horaEntrada || 'Inicio'}</Text>
                      </TouchableOpacity>
                      {showPickerEntrada && <DateTimePicker value={timeEntradaDate} mode="time" display="default" onChange={(e, d) => { setShowPickerEntrada(false); if(d) handleEntradaChange(d); }} />}
                    </>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalLabel}>Salida (Auto)</Text>
                  {Platform.OS === 'ios' ? (
                    <View style={[styles.modalInput, { padding: 4, justifyContent: 'center' }]}>
                      <DateTimePicker value={timeSalidaDate} mode="time" display="default" style={{height: 30}} onChange={(e, d) => { if(d) { setTimeSalidaDate(d); setHoraSalida(d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})); } }} />
                    </View>
                  ) : (
                    <>
                      <TouchableOpacity style={styles.timeBtn} onPress={() => setShowPickerSalida(true)}>
                        <Feather name="clock" size={14} color={horaSalida ? '#2563EB' : '#94A3B8'} />
                        <Text style={[styles.timeBtnText, horaSalida && {color: '#0F172A'}]}>{horaSalida || 'Fin'}</Text>
                      </TouchableOpacity>
                      {showPickerSalida && <DateTimePicker value={timeSalidaDate} mode="time" display="default" onChange={(e, d) => { setShowPickerSalida(false); if(d) { setTimeSalidaDate(d); setHoraSalida(d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})); } }} />}
                    </>
                  )}
                </View>
              </View>
              <Text style={styles.modalLabel}>Nota / Reporte de Falla (Opcional)</Text>
              <TextInput style={[styles.modalInput, {height: 60, textAlignVertical: 'top'}]} placeholder="Ej. Lluvia por la tarde" multiline value={concepto} onChangeText={setConcepto} />
            </ScrollView>
            <View style={styles.modalFooter}>
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
          <Pressable style={{ flex: 1 }} onPress={() => { setModalAnticipo(false); limpiarFormsSecundarios(); }} />
          <View style={styles.modalWrapper}>
            <View style={styles.modalHeader}><Text style={[styles.modalTitle, {color: '#059669'}]}>{editingRecordId ? 'Editar Pago' : 'Pago a Proveedor'}</Text></View>
            <ScrollView style={styles.modalScrollInside} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalLabel}>Monto del Pago o Anticipo ($)</Text>
              <TextInput style={[styles.modalInput, {fontSize: 24, fontWeight: 'bold', color: '#10B981', textAlign: 'center'}]} placeholder="0.00" keyboardType="numeric" value={montoAnticipo} onChangeText={(v) => setMontoAnticipo(v.replace(/[^0-9.]/g, ''))} autoFocus />
              <Text style={styles.modalLabel}>Concepto (Opcional)</Text>
              <TextInput style={[styles.modalInput, {height: 60, textAlignVertical: 'top'}]} placeholder="Ej. Pago semana 3" multiline value={concepto} onChangeText={setConcepto} />
            </ScrollView>
            <View style={styles.modalFooter}>
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
  header: { backgroundColor: '#2563EB', paddingTop: 60, paddingBottom: 30, paddingHorizontal: 25, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, elevation: 5 },
  headerInner: { width: '100%', maxWidth: 800, alignSelf: 'center' },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { padding: 5, marginLeft: -10 },
  headerTitle: { color: '#FFF', fontSize: 28, fontWeight: 'bold', marginTop: 15 },
  projectBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginTop: 8 },
  projectName: { color: '#FFF', fontSize: 12, fontWeight: '600', marginLeft: 5 },
  
  body: { padding: 20, paddingBottom: 120, width: '100%', maxWidth: 800, alignSelf: 'center' },
  
  saldoPill: { marginTop: 3, marginHorizontal: 16, padding: 10, borderRadius: 12, borderWidth: 1, alignItems: 'center', width: 350, alignSelf: 'center' },
  saldoText: { fontWeight: '900', fontSize: 13, textAlign: 'center' },

  exportContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, marginTop: 5 },
  bigExportBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 14, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  bigExportText: { color: '#FFF', fontSize: 13, fontWeight: 'bold', marginLeft: 8 },

  emptyText: { textAlign: 'center', color: '#94A3B8', marginTop: 60, fontStyle: 'italic' },
  
  // 🚜 TARJETA MAESTRA
  machineCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 16, marginBottom: 15, borderWidth: 1, borderColor: '#E2E8F0', elevation: 3 },
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

  fab: { position: 'absolute', bottom: 35, right: '50%', transform: [{translateX: 32.5}], width: 65, height: 65, borderRadius: 32.5, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#2563EB', shadowOpacity: 0.4 },
  
  // 🟢 ESTILOS DEL MODAL FULL DE HISTORIAL
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

  // 📝 TARJETAS DE HISTORIAL (HORAS / ABONOS)
  historyCard: { backgroundColor: '#FFF', padding: 16, borderRadius: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 5, elevation: 1 },
  historyIconBox: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  historyInfo: { flex: 1, paddingRight: 10 },
  historyConcept: { fontSize: 14, fontWeight: 'bold', color: '#1E293B' },
  historyDate: { fontSize: 11, color: '#64748B', marginTop: 4 },
  historyAmountBox: { alignItems: 'flex-end' },
  historyHrs: { fontSize: 11, fontWeight: 'bold', color: '#2563EB', marginBottom: 2 },
  historyAmountCargo: { fontSize: 15, fontWeight: 'bold', color: '#DC2626' },
  historyAmountAbono: { fontSize: 15, fontWeight: 'bold', color: '#10B981' },
  
  // Modales Forms
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
  timeBtn: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  timeBtnText: { color: '#94A3B8', fontSize: 13, fontWeight: '600' },
  saveBtn: { flex: 2, backgroundColor: '#2563EB', padding: 15, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 15 },
  cancelBtn: { flex: 1, backgroundColor: '#FFF', padding: 15, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#CBD5E1' },
  cancelBtnText: { color: '#475569', fontSize: 15, fontWeight: '700' }
});