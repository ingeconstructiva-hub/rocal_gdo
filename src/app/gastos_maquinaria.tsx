import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { useProject } from '../context/ProjectContext';
import { supabase } from '../lib/supabase';

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

export default function GastosMaquinariaScreen() {
  const router = useRouter();
  const { activeProject, isOffline } = useProject();
  
  const [gastos, setGastos] = useState<GastoMaquinaria[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  const [modalidad, setModalidad] = useState<'hora' | 'dia' | 'semana' | 'mes' | 'bitacora' | 'flete'>('hora');

  const [equipo, setEquipo] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [concepto, setConcepto] = useState('');
  
  const [cantidad, setCantidad] = useState('1'); 
  const [tarifa, setTarifa] = useState('');
  const [horasOperacion, setHorasOperacion] = useState('');
  const [montoTotal, setMontoTotal] = useState('');
  
  const [horaEntrada, setHoraEntrada] = useState('');
  const [horaSalida, setHoraSalida] = useState('');
  const [timeEntradaDate, setTimeEntradaDate] = useState(new Date());
  const [timeSalidaDate, setTimeSalidaDate] = useState(new Date());
  const [showPickerEntrada, setShowPickerEntrada] = useState(false);
  const [showPickerSalida, setShowPickerSalida] = useState(false);

  useEffect(() => {
    if (activeProject?.id) {
      fetchGastos();
    }
  }, [activeProject, isOffline]);

  const fetchGastos = async () => {
    setLoading(true);
    const pid = activeProject?.id;
    if (!pid) return;

    const storageKey = `@gastos_maquinaria_log_${pid}`;

    if (isOffline) {
      try {
        const cached = await AsyncStorage.getItem(storageKey);
        if (cached) setGastos(JSON.parse(cached));
      } catch (e) { console.log(e); } finally { setLoading(false); }
      return;
    }

    try {
      const { data, error } = await supabase
        .from('gastos_maquinaria')
        .select('*')
        .eq('project_id', pid)
        .eq('is_active', true)
        .order('fecha', { ascending: false });

      if (error) throw error;
      if (data) {
        setGastos(data);
        await AsyncStorage.setItem(storageKey, JSON.stringify(data));
      }
    } catch (error) {
      console.log(error);
    } finally {
      setLoading(false);
    }
  };

  const calcularTotal = (mod: string, cant: string, tar: string, horas: string) => {
    const q = parseFloat(cant) || 0;
    const t = parseFloat(tar) || 0;
    const h = parseFloat(horas) || 0;

    if (mod === 'hora') {
      if (h > 0 && t > 0) setMontoTotal((h * t).toString());
      else setMontoTotal('');
    } else if (mod === 'bitacora') {
      setMontoTotal('0');
    } else {
      if (q > 0 && t > 0) setMontoTotal((q * t).toString());
      else setMontoTotal('');
    }
  };

  const handleCambioModalidad = (mod: 'hora' | 'dia' | 'semana' | 'mes' | 'bitacora' | 'flete') => {
    setModalidad(mod);
    calcularTotal(mod, cantidad, tarifa, horasOperacion);
  };

  const handleHorasChange = (val: string) => {
    const clean = val.replace(/[^0-9.]/g, '');
    setHorasOperacion(clean);
    calcularTotal(modalidad, cantidad, tarifa, clean);
  };

  const handleCantidadChange = (val: string) => {
    const clean = val.replace(/[^0-9.]/g, '');
    setCantidad(clean);
    calcularTotal(modalidad, clean, tarifa, horasOperacion);
  };

  const handleTarifaChange = (val: string) => {
    const clean = val.replace(/[^0-9.]/g, '');
    setTarifa(clean);
    calcularTotal(modalidad, cantidad, clean, horasOperacion);
  };

  const handleGuardarGasto = async () => {
    if (!equipo.trim()) {
      Alert.alert("Falta el Equipo", "Por favor ingresa el nombre de la máquina.");
      return;
    }

    if (modalidad === 'bitacora' && !horasOperacion.trim()) {
      Alert.alert("Faltan Horas", "Si es registro de bitácora, debes anotar cuántas horas trabajó.");
      return;
    }

    if (modalidad !== 'bitacora' && (!montoTotal || parseFloat(montoTotal) <= 0)) {
      Alert.alert("Monto Inválido", "Falta definir la Tarifa y Horas/Cantidad para generar un total.");
      return;
    }

    const pid = activeProject?.id;
    if (!pid) return;

    setIsSaving(true);
    
    let conceptoFinal = concepto.trim();
    if (!conceptoFinal) {
      if (modalidad === 'hora') conceptoFinal = `Renta (${horasOperacion} hrs a $${tarifa}/hr)`;
      else if (modalidad === 'bitacora') conceptoFinal = 'Registro Diario de Bitácora';
      else conceptoFinal = `Renta por ${modalidad.toUpperCase()}`;
    }

    const nuevoRegistro = {
      project_id: pid,
      equipo: equipo.trim(),
      proveedor: proveedor.trim() ? proveedor.trim() : null,
      categoria: modalidad === 'bitacora' ? 'horas' : 'pago', 
      tipo_renta: modalidad,
      costo_tarifa: Number(tarifa) || null,
      asistencia_dias: Number(horasOperacion) || null,
      hora_entrada: horaEntrada ? horaEntrada : null,
      hora_salida: horaSalida ? horaSalida : null,
      concepto: conceptoFinal,
      monto: modalidad === 'bitacora' ? 0 : Number(montoTotal),
      is_active: true,
      fecha: new Date().toISOString()
    };

    try {
      if (isOffline) {
        Alert.alert("Modo Offline", "Conéctate a internet para guardar.");
        setIsSaving(false);
        return;
      }

      const { error } = await supabase.from('gastos_maquinaria').insert([nuevoRegistro]);
      if (error) throw error;

      setIsModalVisible(false);
      limpiarFormulario();
      fetchGastos();
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const limpiarFormulario = () => {
    setEquipo('');
    setProveedor('');
    setConcepto('');
    setCantidad('1');
    setTarifa('');
    setMontoTotal('');
    setHorasOperacion('');
    setHoraEntrada('');
    setHoraSalida('');
    setModalidad('hora');
  };

  const handleEliminarGasto = async (id: string, nombre: string) => {
    if (isOffline) {
      Alert.alert("Modo Lectura", "Requiere conexión para eliminar."); return;
    }
    Alert.alert("Eliminar registro", `¿Quitar "${nombre}" del historial?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: async () => {
          try {
            const { error } = await supabase.from('gastos_maquinaria').update({ is_active: false }).eq('id', id);
            if (error) throw error;
            setGastos(prev => prev.filter(g => g.id !== id));
          } catch (e: any) { Alert.alert("Error", e.message); }
        }
      }
    ]);
  };

  const handleExportarExcel = async () => {
    if (gastos.length === 0) { Alert.alert("Sin datos", "No hay registros."); return; }
    try {
      const encabezados = ["Fecha", "Equipo", "Proveedor", "Modalidad", "Tarifa", "Horas Diarias", "Hora Entrada", "Hora Salida", "Concepto/Detalle", "Monto Total ($)\n"];
      const filas = gastos.map(g => {
        const fecha = new Date(g.fecha).toLocaleDateString('es-MX');
        const eqLimpio = g.equipo.replace(/,/g, ' ');
        const provLimpio = g.proveedor ? g.proveedor.replace(/,/g, ' ') : '';
        const conceptoLimpio = g.concepto.replace(/,/g, ' ');
        const hrsOp = g.asistencia_dias || '';
        const tarifaF = g.costo_tarifa || '';
        const mod = g.tipo_renta ? g.tipo_renta.toUpperCase() : '';
        
        return `${fecha},"${eqLimpio}","${provLimpio}","${mod}",${tarifaF},${hrsOp},"${g.hora_entrada || ''}","${g.hora_salida || ''}","${conceptoLimpio}",${g.monto}`;
      }).join("\n");

      const contenidoCSV = "\uFEFF" + encabezados.join(",") + filas;
      const nombreArchivo = `Maquinaria_${activeProject?.name?.replace(/\s+/g, '_') || 'Obra'}.csv`;

      const fsModulo = FileSystem as any;
      const fileUri = `${fsModulo.documentDirectory}${nombreArchivo}`;
      await fsModulo.writeAsStringAsync(fileUri, contenidoCSV, { encoding: 'utf8' });
      await Sharing.shareAsync(fileUri, { mimeType: 'text/csv' });
    } catch (error: any) { Alert.alert("Error Excel", error.message); }
  };

  const handleExportarPDF = async () => {
    if (gastos.length === 0) { Alert.alert("Sin datos", "No hay registros."); return; }
    setIsExportingPDF(true);
    try {
      const totalPagado = gastos.reduce((sum, g) => sum + g.monto, 0);
      const totalHoras = gastos.reduce((sum, g) => sum + (g.asistencia_dias || 0), 0);
      
      const htmlContent = `
        <html>
          <head>
            <style>
              body { font-family: 'Helvetica', sans-serif; padding: 25px; color: #1E293B; }
              h1 { color: #2563EB; font-size: 22px; margin-bottom: 5px; }
              p { margin: 0 0 20px 0; color: #64748B; font-size: 13px; }
              table { width: 100%; border-collapse: collapse; }
              th, td { border: 1px solid #E2E8F0; padding: 10px; text-align: left; font-size: 12px; }
              th { background-color: #F8FAFC; color: #334155; text-transform: uppercase; font-size: 10px; }
              .monto { text-align: right; font-weight: bold; color: #0F172A; }
              .total-row { background-color: #EFF6FF; font-weight: bold; color: #1D4ED8; }
            </style>
          </head>
          <body>
            <h1>Control de Maquinaria y Equipo</h1>
            <p>Obra: ${activeProject?.name || 'Obra Sin Nombre'} | Fecha: ${new Date().toLocaleDateString('es-MX')}</p>
            <table>
              <tr>
                <th>Fecha</th>
                <th>Equipo / Proveedor</th>
                <th>Movimiento / Concepto</th>
                <th style="text-align: center;">Horas</th>
                <th style="text-align: right;">Importe</th>
              </tr>
              ${gastos.map(g => `
                <tr>
                  <td>${new Date(g.fecha).toLocaleDateString('es-MX')}</td>
                  <td><strong>${g.equipo}</strong><br><small>${g.proveedor || '--'}</small></td>
                  <td>${g.concepto}</td>
                  <td style="text-align: center;">${g.asistencia_dias ? `${g.asistencia_dias} hrs` : '--'}</td>
                  <td class="monto">${g.monto > 0 ? `$${g.monto.toLocaleString('es-MX', {minimumFractionDigits:2})}` : '--'}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td colspan="3" style="text-align: right; padding: 12px;">TOTALES ACUMULADOS</td>
                <td style="text-align: center; padding: 12px;">${totalHoras} hrs</td>
                <td style="text-align: right; padding: 12px;">$${totalPagado.toLocaleString('es-MX', {minimumFractionDigits:2})}</td>
              </tr>
            </table>
          </body>
        </html>
      `;
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
    } catch (error: any) { Alert.alert("Error PDF", error.message); } finally { setIsExportingPDF(false); }
  };

  const totalInversion = gastos.reduce((sum, g) => sum + g.monto, 0);
  const totalHorasGenerales = gastos.reduce((sum, g) => sum + (g.asistencia_dias || 0), 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerInner}>
          <View style={styles.headerTopRow}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Feather name="chevron-left" size={32} color="#FFF" />
            </TouchableOpacity>
            
            <View style={{ width: 32 }} />
          </View>
          <Text style={styles.headerTitle}>Maquinaria</Text>
          <View style={styles.projectBadge}>
            <Feather name="map-pin" size={12} color="rgba(255,255,255,0.7)" />
            <Text style={styles.projectName}>{activeProject?.name || "Obra"}</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        
        <View style={styles.summaryContainer}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Costos Generados</Text>
            <Text style={[styles.summaryValue, {color: '#10B981'}]} adjustsFontSizeToFit numberOfLines={1}>${totalInversion.toLocaleString('es-MX')}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Bitácora de Uso</Text>
            <Text style={[styles.summaryValue, {color: '#2563EB'}]} adjustsFontSizeToFit numberOfLines={1}>{totalHorasGenerales} hrs</Text>
          </View>
        </View>

        <View style={styles.exportContainer}>
          <TouchableOpacity style={[styles.bigExportBtn, { backgroundColor: '#DC2626' }]} onPress={handleExportarPDF} disabled={isExportingPDF}>
            {isExportingPDF ? <ActivityIndicator color="#FFF" /> : (
              <>
                <Feather name="file-text" size={20} color="#FFF" />
                <Text style={styles.bigExportText}>Generar PDF</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.bigExportBtn, { backgroundColor: '#10B981' }]} onPress={handleExportarExcel}>
            <Feather name="grid" size={20} color="#FFF" />
            <Text style={styles.bigExportText}>Generar Excel</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Historial de Movimientos</Text>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 50 }} />
        ) : gastos.length === 0 ? (
          <Text style={styles.emptyText}>No hay registros de maquinaria todavía.</Text>
        ) : (
          gastos.map((g) => (
            <View key={g.id} style={styles.gastoCard}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.gastoEquipo}>🏗️ {g.equipo}</Text>
                
                {g.asistencia_dias ? (
                  <View style={styles.horasBox}>
                    <Text style={styles.horasMainText}>⏱ {g.asistencia_dias} Horas de Operación</Text>
                    {g.hora_entrada && g.hora_salida ? (
                      <Text style={styles.gastoDetalleTexto}>De {g.hora_entrada} a {g.hora_salida}</Text>
                    ) : null}
                  </View>
                ) : null}

                <Text style={[styles.gastoConcepto, {marginTop: g.asistencia_dias ? 8 : 0}]} numberOfLines={2}>{g.concepto}</Text>
                
                {g.proveedor ? (
                  <Text style={styles.gastoDetalleTexto}>🏢 Prov: {g.proveedor}</Text>
                ) : null}

                <View style={styles.metaRow}>
                  <Text style={styles.gastoFecha}>• {new Date(g.fecha).toLocaleDateString('es-MX')}</Text>
                </View>
              </View>
              
              <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                {g.monto > 0 ? (
                  <Text style={styles.gastoMonto}>${g.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</Text>
                ) : (
                  <Text style={[styles.gastoMonto, {color: '#64748B', fontSize: 14}]}>Bitácora</Text>
                )}
                
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleEliminarGasto(g.id, g.equipo)}>
                  <Feather name="trash-2" size={16} color="#FCA5A5" />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => setIsModalVisible(true)}>
        <Feather name="plus" size={30} color="#FFF" />
      </TouchableOpacity>

      {/* 📝 NUEVO DISEÑO: MODAL CON SCROLL INTERNO Y BOTONES FIJOS (Sticky Footer) */}
      <Modal visible={isModalVisible} animationType="slide" transparent={true} onRequestClose={() => { setIsModalVisible(false); limpiarFormulario(); }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          
          <Pressable style={{ flex: 1 }} onPress={() => { setIsModalVisible(false); limpiarFormulario(); }} />
          
          <View style={styles.modalWrapper}>
            {/* Cabecera Fija */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Calculadora de Maquinaria</Text>
            </View>

            {/* Contenido Deslizable */}
            <ScrollView style={styles.modalScrollInside} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              
              <Text style={[styles.modalLabel, {marginTop: 0}]}>Trato / Modalidad</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsContainer}>
                <TouchableOpacity style={[styles.pillBtn, modalidad === 'hora' && styles.pillActiveAzul]} onPress={() => handleCambioModalidad('hora')}><Text style={[styles.pillText, modalidad === 'hora' && styles.pillTextActive]}>Por Hora</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.pillBtn, modalidad === 'dia' && styles.pillActiveRojo]} onPress={() => handleCambioModalidad('dia')}><Text style={[styles.pillText, modalidad === 'dia' && styles.pillTextActive]}>Por Día</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.pillBtn, modalidad === 'semana' && styles.pillActiveRojo]} onPress={() => handleCambioModalidad('semana')}><Text style={[styles.pillText, modalidad === 'semana' && styles.pillTextActive]}>Por Sem</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.pillBtn, modalidad === 'mes' && styles.pillActiveRojo]} onPress={() => handleCambioModalidad('mes')}><Text style={[styles.pillText, modalidad === 'mes' && styles.pillTextActive]}>Por Mes</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.pillBtn, modalidad === 'bitacora' && styles.pillActiveVerde]} onPress={() => handleCambioModalidad('bitacora')}><Text style={[styles.pillText, modalidad === 'bitacora' && styles.pillTextActive]}>Solo Bitácora</Text></TouchableOpacity>
              </ScrollView>

              <Text style={styles.modalLabel}>Máquina / Equipo</Text>
              <TextInput style={styles.modalInput} placeholder="Ej. Retro 320" placeholderTextColor="#94A3B8" value={equipo} onChangeText={setEquipo} />

              <Text style={styles.modalLabel}>Proveedor</Text>
              <TextInput style={styles.modalInput} placeholder="Ej. Rafa Galán" placeholderTextColor="#94A3B8" value={proveedor} onChangeText={setProveedor} />

              <View style={styles.dynamicContainer}>
                
                {modalidad !== 'bitacora' && (
                  <>
                    <View style={styles.rowGrid}>
                      {modalidad !== 'hora' && (
                        <View style={{ flex: 1 }}>
                          <Text style={styles.modalLabel}>Cantidad</Text>
                          <TextInput style={styles.modalInput} placeholder="Ej. 1" keyboardType="numeric" value={cantidad} onChangeText={handleCantidadChange} />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.modalLabel}>Tarifa ($)</Text>
                        <TextInput style={styles.modalInput} placeholder="Ej. 1062" keyboardType="numeric" value={tarifa} onChangeText={handleTarifaChange} />
                      </View>
                    </View>
                      <Text style={[styles.modalLabel, {marginTop: 15}]}>Horas Trabajadas Hoy</Text>
                    <TextInput style={[styles.modalInput, { borderColor: '#2563EB', borderWidth: 1 }]} placeholder="Ej. 8" keyboardType="numeric" value={horasOperacion} onChangeText={handleHorasChange} />

                    <Text style={styles.modalLabel}>Total Calculado ($)</Text>
                    <TextInput 
                      style={[styles.modalInput, styles.totalInput]} 
                      placeholder="$0.00" 
                      value={montoTotal ? `$${parseFloat(montoTotal).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : ''} 
                      editable={false} 
                    />
                  </>
                )}

                {(modalidad === 'hora' || modalidad === 'bitacora' || modalidad === 'dia' || modalidad === 'semana' || modalidad === 'mes') && (
                  <>
                    
                    
                    <View style={styles.rowGrid}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.modalLabel}>Inicio (Opc.)</Text>
                        {Platform.OS === 'ios' ? (
                          <View style={[styles.modalInput, { padding: 4, justifyContent: 'center' }]}>
                            <DateTimePicker value={timeEntradaDate} mode="time" display="default" style={{height: 30}} onChange={(e, d) => { if(d) { setTimeEntradaDate(d); setHoraEntrada(d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})); } }} />
                          </View>
                        ) : (
                          <>
                            <TouchableOpacity style={styles.timeBtn} onPress={() => setShowPickerEntrada(true)}>
                              <Feather name="clock" size={14} color={horaEntrada ? '#2563EB' : '#94A3B8'} />
                              <Text style={[styles.timeBtnText, horaEntrada && {color: '#0F172A'}]}>{horaEntrada || 'Inicio'}</Text>
                            </TouchableOpacity>
                            {showPickerEntrada && <DateTimePicker value={timeEntradaDate} mode="time" display="default" onChange={(e, d) => { setShowPickerEntrada(false); if(d) { setTimeEntradaDate(d); setHoraEntrada(d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})); } }} />}
                          </>
                        )}
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={styles.modalLabel}>Fin (Opc.)</Text>
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
                  </>
                )}
              </View>

              <Text style={styles.modalLabel}>Detalles Adicionales</Text>
              <TextInput style={[styles.modalInput, {marginBottom: 20}]} placeholder="Ej. Flete, Anticipo de mes..." placeholderTextColor="#94A3B8" value={concepto} onChangeText={setConcepto} />

            </ScrollView>

            {/* 🛠️ Pie Fijo (Sticky Footer) */}
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setIsModalVisible(false); limpiarFormulario(); }}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.saveBtn} onPress={handleGuardarGasto} disabled={isSaving}>
                {isSaving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Guardar</Text>}
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
  headerSubtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: 'bold', letterSpacing: 1.5 },
  headerTitle: { color: '#FFF', fontSize: 28, fontWeight: 'bold', marginTop: 15 },
  projectBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginTop: 8 },
  projectName: { color: '#FFF', fontSize: 12, fontWeight: '600', marginLeft: 5 },
  
  body: { padding: 20, paddingBottom: 120, width: '100%', maxWidth: 800, alignSelf: 'center' },
  
  summaryContainer: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  summaryCard: { flex: 1, backgroundColor: '#FFF', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', elevation: 1 },
  summaryLabel: { fontSize: 11, color: '#64748B', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 6 },
  summaryValue: { fontSize: 20, fontWeight: '900' },

  exportContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 25, gap: 12 },
  bigExportBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 14, elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4 },
  bigExportText: { color: '#FFF', fontSize: 14, fontWeight: 'bold', marginLeft: 8 },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', color: '#334155', textTransform: 'uppercase' },
  
  emptyText: { textAlign: 'center', color: '#94A3B8', marginTop: 60, fontStyle: 'italic' },
  
  gastoCard: { backgroundColor: '#FFF', padding: 18, borderRadius: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, elevation: 2 },
  gastoEquipo: { fontSize: 16, fontWeight: '800', color: '#1E293B', marginBottom: 6 },
  gastoConcepto: { fontSize: 13, color: '#475569' },
  
  horasBox: { backgroundColor: '#EFF6FF', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#BFDBFE', alignSelf: 'flex-start' },
  horasMainText: { fontSize: 13, fontWeight: 'bold', color: '#1D4ED8' },
  gastoDetalleTexto: { fontSize: 11, color: '#64748B', marginTop: 2, fontWeight: '600' },
  
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  gastoFecha: { fontSize: 11, color: '#94A3B8', fontWeight: '500' },
  gastoMonto: { fontSize: 18, fontWeight: 'bold', color: '#0F172A' },
  deleteBtn: { marginTop: 10, padding: 6, backgroundColor: '#FEF2F2', borderRadius: 8 },

  fab: { position: 'absolute', bottom: 35, right: '50%', transform: [{translateX: 32.5}], width: 65, height: 65, borderRadius: 32.5, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#2563EB', shadowOpacity: 0.4 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  
  // 🛠️ NUEVO DISEÑO DEL MODAL
  modalWrapper: { backgroundColor: '#FFF', borderTopLeftRadius: 25, borderTopRightRadius: 25, width: '100%', maxWidth: 600, alignSelf: 'center', maxHeight: '85%' },
  modalHeader: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#0F172A' },
  modalScrollInside: { padding: 20 },
  modalFooter: { flexDirection: 'row', padding: 20, borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#F8FAFC', gap: 15, paddingBottom: Platform.OS === 'ios' ? 35 : 20 },
  
  pillsContainer: { flexDirection: 'row', marginBottom: 15 },
  pillBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#F1F5F9', marginRight: 8, borderWidth: 1, borderColor: '#E2E8F0', height: 35, justifyContent: 'center' },
  pillActiveAzul: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  pillActiveRojo: { backgroundColor: '#EF4444', borderColor: '#EF4444' },
  pillActiveVerde: { backgroundColor: '#10B981', borderColor: '#10B981' },
  pillText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  pillTextActive: { color: '#FFF' },
  
  rowGrid: { flexDirection: 'row', gap: 12, marginTop: 10, marginBottom: 5 },
  dynamicContainer: { backgroundColor: '#F8FAFC', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', marginTop: 10, marginBottom: 10 },
  
  modalLabel: { fontSize: 12, fontWeight: '700', color: '#475569', marginTop: 10, marginBottom: 6 },
  modalInput: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 12, fontSize: 14, color: '#0F172A', minHeight: 46, justifyContent: 'center' },
  
  timeBtn: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  timeBtnText: { color: '#94A3B8', fontSize: 13, fontWeight: '600' },
  totalInput: { borderColor: '#10B981', borderWidth: 2, backgroundColor: '#ECFDF5', fontWeight: 'bold', color: '#047857', fontSize: 18, textAlign: 'center' },
  
  saveBtn: { flex: 2, backgroundColor: '#1E293B', padding: 15, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 15 },
  cancelBtn: { flex: 1, backgroundColor: '#FFF', padding: 15, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#CBD5E1' },
  cancelBtnText: { color: '#475569', fontSize: 15, fontWeight: '700' }
});