'use client';

import { Feather } from '@expo/vector-icons';
import Almacen from '../../lib/almacen';
import * as Crypto from 'expo-crypto';
import { BANDEJAS, guardarEnBandeja, leerBandeja, reemplazarBandeja } from '../../lib/bandeja';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import { useNavigation, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SkeletonLista } from '../../components/Skeleton';
import { SinDatos } from '../../components/SinDatos';
import { exportarPDF, exportarReporte, exportarTexto } from '../../lib/exportar';
import { pedirEmpresa } from '../../components/SelectorEmpresa';
import { regresar } from '../../lib/navegar';
import { useRefrescar } from '../../lib/refrescar';
import { Aviso } from '../../lib/aviso';
import SummaryCard from '../../components/SummaryCard';
import { useProject } from '../../context/ProjectContext';
import { useUser } from '../../context/UserContext';
import { esDeHoy, puedeExportar } from '../../lib/permisos';
import { calcularTotalFinal, diasDeSemana, etiquetaSemana, inicioDeSemana, rangoSemana } from '../../lib/nomina';
import { mensajeDeError } from '../../lib/errores';
import { supabase } from '../../lib/supabase';
import { limitarNumero } from '../../lib/limites';
import { generarReporteHistorial, generarReporteNomina } from '../../utils/pdfNomina';

interface WorkerState {
  id: string;
  name_worker: string;
  role: string;
  weekly_salary: number;
  attendance: boolean[]; // L, M, M, J, V, S
  extraHours: string;
  extraReason: string;
  discount: string;
  reason: string;
  categoria: string;
  created_at?: string;
}


/* El calculo vive en lib/nomina para que la pantalla y el PDF que se firma den
 * exactamente el mismo numero. Antes cada uno tenia su copia y no cuadraban. */
const calculateFinalTotal = (w: WorkerState) => calcularTotalFinal(w);

/* La tarjeta de cada trabajador, aislada y memorizada.
 *
 * Antes todas las tarjetas vivian dentro del render de la pantalla. Marcar un
 * dia de asistencia reconstruia el arreglo completo y React volvia a dibujar a
 * los 40 trabajadores: 240 botones de dia y 240 iconos por cada toque. En un
 * telefono de obra eso se siente como que la app se congela.
 *
 * Con memo, al marcar un dia solo se redibuja ese trabajador. Para que sirva,
 * las funciones que recibe tienen que ser las mismas entre renders: por eso
 * alla arriba van envueltas en useCallback.
 */
type PropsTarjeta = {
  worker: WorkerState;
  isAdmin: boolean;
  isFinancialRole: boolean;
  puedeCorregir: boolean;
  dias: { letra: string; dia: number; esHoy: boolean }[];
  onToggle: (workerId: string, dayIdx: number) => void;
  onEditar: (worker: WorkerState) => void;
  onBorrar: (worker: WorkerState) => void;
  onExtras: (worker: WorkerState) => void;
  onDescuento: (worker: WorkerState) => void;
};

const TarjetaTrabajador = memo(function TarjetaTrabajador({
  worker, isAdmin, isFinancialRole, puedeCorregir, dias, onToggle, onEditar, onBorrar, onExtras, onDescuento,
}: PropsTarjeta) {
  return (
    <View style={styles.workerCard}>
      <View style={styles.cardHeader}>
        <View style={{flex: 1}}>
          <Text style={styles.workerName}>{worker.name_worker}</Text>
          <Text style={styles.workerRole}>{worker.role}{isFinancialRole && <Text style={{color: '#64748B', fontWeight: 'normal'}}> • S. Hora: ${(worker.weekly_salary / 45).toFixed(1)}</Text>}</Text>
        </View>
        {isAdmin ? (
          <View style={styles.adminActionIconsRow}>
            <TouchableOpacity onPress={() => onEditar(worker)} style={styles.inlineActionBtn}><Feather name="edit-2" size={13} color="#475569" /></TouchableOpacity>
            <TouchableOpacity onPress={() => onBorrar(worker)} style={[styles.inlineActionBtn, {marginLeft: 8}]}><Feather name="trash-2" size={13} color="#EF4444" /></TouchableOpacity>
          </View>
        ) : puedeCorregir ? (
          <View style={styles.adminActionIconsRow}>
            <TouchableOpacity onPress={() => onEditar(worker)} style={styles.inlineActionBtn}><Feather name="edit-2" size={13} color="#475569" /></TouchableOpacity>
            <TouchableOpacity onPress={() => onBorrar(worker)} style={[styles.inlineActionBtn, {marginLeft: 8}]}><Feather name="trash-2" size={13} color="#EF4444" /></TouchableOpacity>
          </View>
        ) : isFinancialRole && (
          <View style={{alignItems: 'flex-end'}}><Text style={styles.salaryLabel}>Semanal</Text><Text style={styles.salaryValue}>${worker.weekly_salary}</Text></View>
        )}
      </View>

      <View style={styles.attendanceRow}>
        {dias.map((d, idx) => (
          <TouchableOpacity key={d.letra + idx} style={[styles.dayBox, d.esHoy && styles.dayBoxHoy]} onPress={() => onToggle(worker.id, idx)}>
            <Text style={[styles.dayText, d.esHoy && styles.dayTextHoy]}>{d.letra} {d.dia}</Text>
            <Feather name={worker.attendance[idx] ? "check-circle" : "circle"} size={18} color={worker.attendance[idx] ? "#2563EB" : "#CBD5E1"} />
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.actionsContainerRow}>
        <TouchableOpacity style={styles.actionCardBtn} onPress={() => onExtras(worker)}>
          <Feather name="clock" size={13} color="#2563EB" />
          <View style={{flex: 1, marginLeft: 5}}><Text style={styles.actionBtnLabel}>Hrs Extra: <Text style={styles.actionBtnValue}>{Number(worker.extraHours) > 0 ? `${worker.extraHours} H` : '0'}</Text></Text></View>
        </TouchableOpacity>
        {isFinancialRole ? (
          <TouchableOpacity style={[styles.actionCardBtn, {marginLeft: 6}]} onPress={() => onDescuento(worker)}>
            <Feather name="alert-circle" size={13} color="#EF4444" />
            <View style={{flex: 1, marginLeft: 5}}><Text style={[styles.actionBtnLabel, {color: '#EF4444'}]}>Deducción: <Text style={styles.actionBtnValue}>{Number(worker.discount) > 0 ? `-$${worker.discount}` : worker.reason ? 'Nota' : '$0'}</Text></Text></View>
          </TouchableOpacity>
        ) : <View style={[styles.actionCardBtn, {marginLeft: 6, borderColor: 'transparent', backgroundColor: 'transparent'}]} />}
      </View>

      {isFinancialRole && (
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>TOTAL A PAGAR:</Text>
          <Text style={styles.totalValue}>${calculateFinalTotal(worker).toLocaleString('es-MX', {minimumFractionDigits: 2})}</Text>
        </View>
      )}
    </View>
  );
});


export default function ListaScreen() {
  const router = useRouter();
  const navigation = useNavigation(); 
  const { activeProject, isOffline } = useProject();
  const { profile } = useUser();

  const isFinancialRole = profile?.role === 'admin' || profile?.role === 'oficina';
  const isAdmin = profile?.role === 'admin';
  // El residente puede dar de baja a un trabajador que acaba de registrar, por
  // si escribió mal el nombre o lo capturó dos veces.
  const puedeCorregirResidente = (worker: WorkerState) =>
    profile?.role === 'residente' && esDeHoy(worker.created_at);

  const [allWorkers, setAllWorkers] = useState<WorkerState[]>([]); 
  const [activeCategory, setActiveCategory] = useState<'obrero' | 'tecnico'>('obrero'); 
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const displayedWorkers = allWorkers.filter(w => w.categoria === activeCategory);

  const nominaBase = displayedWorkers.reduce((sum, w) => sum + (Number(w.weekly_salary) || 0), 0);
  const proyeccionFinal = displayedWorkers.reduce((sum, w) => sum + calculateFinalTotal(w), 0);

  // --- MODALS ---
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newSalary, setNewSalary] = useState('');

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editWorkerId, setEditWorkerId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editSalary, setEditSalary] = useState('');

  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [isExtrasModalOpen, setIsExtrasModalOpen] = useState(false);
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);

  const [tempExtras, setTempExtras] = useState('0');
  const [tempExtraReason, setTempExtraReason] = useState('');
  const [tempDiscount, setTempDiscount] = useState('0');
  const [tempReason, setTempReason] = useState('');

  // --- ACUMULADO POR SEMANA ---
  const [modalSemanas, setModalSemanas] = useState(false);
  const [semanas, setSemanas] = useState<any[]>([]);
  const [cargandoSemanas, setCargandoSemanas] = useState(false);

  /* La semana que se esta viendo. Arranca en la actual, pero se puede retroceder
   * para revisar o corregir una raya ya cerrada: el acumulado las mostraba y
   * desde la lista no habia forma de llegar a ellas. */
  const semanaEnCurso = inicioDeSemana();
  const [semanaVista, setSemanaVista] = useState(semanaEnCurso);
  const esSemanaActual = semanaVista === semanaEnCurso;

  const diasSemana = useMemo(() => diasDeSemana(semanaVista), [semanaVista]);
  const rangoSemanaActual = rangoSemana(semanaVista);

  /* Al cruzar el lunes la vista salta sola a la semana nueva, salvo que el
   * usuario se haya ido a mirar una pasada. */
  useEffect(() => {
    setSemanaVista(semanaEnCurso);
  }, [semanaEnCurso]);

  const moverSemana = (pasos: number) => {
    if (hasChanges) {
      Aviso.alert('Tienes cambios sin guardar', 'Guarda la asistencia antes de cambiar de semana.');
      return;
    }
    const [a, m, d] = semanaVista.split('-').map(Number);
    const destino = new Date(a, m - 1, d + pasos * 7);
    const siguiente = inicioDeSemana(destino);
    if (siguiente > semanaEnCurso) return; // No se adelanta al futuro.
    setSemanaVista(siguiente);
  };


  useEffect(() => {
    /* Se llama siempre, incluso sin obra activa: la propia funcion
     * apaga el esqueleto y la pantalla dice que falta elegir obra.
     * Con el candado aqui, ese apagado nunca llegaba a correr y la
     * pantalla se quedaba cargando para siempre. */
    fetchWorkers();
  }, [activeProject, semanaVista]);

  useEffect(() => {
    navigation.setOptions({
      gestureEnabled: !hasChanges
    });

    const BloquearSalidaNativa = navigation.addListener('beforeRemove', (e) => {
      if (!hasChanges) return;
      e.preventDefault();

      Aviso.alert(
        "Cambios pendientes",
        "Tienes modificaciones en la nómina o asistencias sin sincronizar. Es obligatorio presionar 'Guardar y Enviar a Oficina' antes de salir.",
        [
          { text: "Permanecer aquí", style: "default" },
          { 
            text: "Salir sin guardar", 
            style: "destructive", 
            onPress: () => navigation.dispatch(e.data.action) 
          }
        ]
      );
    });

    return () => BloquearSalidaNativa();
  }, [navigation, hasChanges]);


  useRefrescar(() => fetchWorkers(), { boton: false });

  /* La obra activa se elige en Proyectos y se guarda en el dispositivo. Si
   * falta, el project_id viaja vacio: al residente la politica lo rechaza y al
   * admin lo deja pasar por rol, guardando el registro con la obra en blanco,
   * donde la lista ya no lo encuentra. Mejor detenerlo aqui y decirlo. */
  const exigirObra = (silencioso = false) => {
    if (activeProject?.id) return true;
    if (!silencioso) {
      Aviso.alert('Sin obra seleccionada', 'Entra a Proyectos y elige tu obra antes de capturar.');
    }
    return false;
  };

  const fetchWorkers = async () => {
    setLoading(true);
    const pid = activeProject?.id;
    if (!pid) {
      setLoading(false);
      return;
    }

    const llaveCache = `@trabajadores_cache_${pid}`;

    // Sin internet se muestra la última lista guardada: si no, el residente
    // abre la pantalla vacía y no puede pasar lista.
    if (isOffline) {
      try {
        const guardado = await Almacen.getItem(llaveCache);
        if (guardado) setAllWorkers(JSON.parse(guardado));
        setHasChanges(false);
      } catch (e) {
        console.log(e);
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const { data, error } = await supabase
        .from('workers')
        .select('*')
        .eq('project_id', pid)
        .eq('is_active', true)
        .order('name_worker', { ascending: true });

      if (error) throw error;

      const initialUI = data.map(w => ({
        id: w.id,
        name_worker: w.name_worker,
        role: w.role,
        weekly_salary: w.weekly_salary || 0,
        attendance: [true, true, true, true, true, true],
        extraHours: '0',
        extraReason: '',
        discount: '0',
        reason: '',
        categoria: w.categoria || 'obrero',
        created_at: w.created_at
      }));

      /* La semana en curso ya puede traer asistencia guardada y hay que
       * cargarla. Ahora que el registro es uno por semana y no uno por dia,
       * abrir la pantalla el miercoles mostrando a todos presentes y guardar
       * borraria las faltas del lunes y el martes.
       *
       * Las horas extra no se pueden recuperar porque payroll_records no tiene
       * columna para ellas: quedan dentro de final_salary y no se vuelven a
       * capturar solas. */
      const semanaActual = semanaVista;
      const { data: registros } = await supabase
        .from('payroll_records')
        .select('*')
        .eq('project_id', pid)
        .eq('week_start', semanaActual)
        .eq('is_active', true);

      const guardadoPorTrabajador: Record<string, any> = {};
      (registros || []).forEach((r: any) => { guardadoPorTrabajador[r.worker_id] = r; });

      const conLoGuardado = initialUI.map(w => {
        const r = guardadoPorTrabajador[w.id];
        if (!r) return w;

        let asistencia = w.attendance;
        try {
          const previa = typeof r.attendance === 'string' ? JSON.parse(r.attendance) : r.attendance;
          if (Array.isArray(previa) && previa.length === 6) asistencia = previa;
        } catch {
          // Si quedo corrupta se usa la de por defecto, mejor que tronar.
        }

        return {
          ...w,
          attendance: asistencia,
          extraHours: String(r.extra_hours ?? 0),
          extraReason: r.extra_reason || '',
          discount: String(r.deduction_amount ?? 0),
          reason: r.reason || '',
        };
      });

      setAllWorkers(conLoGuardado);
      setHasChanges(false); 
      await Almacen.setItem(llaveCache, JSON.stringify(conLoGuardado));
    } catch (e) {
      console.log(e);
      // Si falló la red, mostramos la última lista guardada.
      const guardado = await Almacen.getItem(llaveCache);
      if (guardado) setAllWorkers(JSON.parse(guardado));
    } finally {
      setLoading(false);
    }
  };

  const toggleAttendance = useCallback((workerId: string, dayIdx: number) => {
    setHasChanges(true); 
    setAllWorkers(prev => prev.map(w => {
      if (w.id === workerId) {
        const newAtt = [...w.attendance];
        newAtt[dayIdx] = !newAtt[dayIdx];
        return { ...w, attendance: newAtt };
      }
      return w;
    }));
  }, []);

  const handleAddWorker = async () => {
    if (!newName || !newSalary) return;
    if (!exigirObra()) return;
    setIsSaving(true);

    // Sin internet el alta iba directo a Supabase y tronaba con "Load failed".
    // Ahora se guarda en la bandeja y el trabajador aparece de inmediato en la
    // lista, con un id temporal hasta que suba.
    if (isOffline) {
      try {
        const localUuid = Crypto.randomUUID();
        await guardarEnBandeja(BANDEJAS.trabajadores, {
          name_worker: newName,
          role: newRole,
          weekly_salary: Number(newSalary),
          project_id: activeProject?.id,
          categoria: activeCategory,
          is_active: true,
          local_uuid: localUuid,
        });

        const nuevoEnPantalla = {
          id: `temp_${localUuid}`,
          created_at: new Date().toISOString(),
          name_worker: newName,
          role: newRole,
          weekly_salary: Number(newSalary),
          attendance: [true, true, true, true, true, true],
          extraHours: '0',
          extraReason: '',
          discount: '0',
          reason: '',
          categoria: activeCategory,
        };

        const listaActualizada = [...allWorkers, nuevoEnPantalla];
        setAllWorkers(listaActualizada);
        // También a la copia local, para que siga ahí al recargar la app.
        await Almacen.setItem(`@trabajadores_cache_${activeProject?.id}`, JSON.stringify(listaActualizada));

        setIsModalVisible(false);
        setNewName(''); setNewRole(''); setNewSalary('');
        Aviso.alert(
          'Guardado sin conexión',
          'El trabajador quedó guardado en este dispositivo y se dará de alta solo cuando vuelva el internet.'
        );
      } catch (e: any) {
        Aviso.alert('Error', mensajeDeError(e, 'dar de alta al trabajador'));
      } finally {
        setIsSaving(false);
      }
      return;
    }

    try {
      const { data, error } = await supabase.from('workers').insert([{
        name_worker: newName,
        role: newRole,
        weekly_salary: Number(newSalary),
        project_id: activeProject?.id,
        categoria: activeCategory,
        is_active: true
      }]).select();

      if (error) throw error;
      
      const nw = data[0];
      setHasChanges(true); 
      setAllWorkers(prev => [...prev, {
        id: nw.id,
        name_worker: nw.name_worker,
        role: nw.role,
        weekly_salary: nw.weekly_salary,
        attendance: [true, true, true, true, true, true],
        extraHours: '0',
        extraReason: '',
        discount: '0',
        reason: '',
        categoria: nw.categoria
      }]);
      setIsModalVisible(false);
      setNewName(''); setNewRole(''); setNewSalary('');
    } catch (e: any) {
      Aviso.alert("Error", mensajeDeError(e, 'dar de alta al trabajador'));
    } finally {
      setIsSaving(false);
    }
  };

  const openEditWorkerModal = useCallback((worker: WorkerState) => {
    setEditWorkerId(worker.id);
    setEditName(worker.name_worker);
    setEditRole(worker.role);
    setEditSalary(String(worker.weekly_salary));
    setIsEditModalOpen(true);
  }, []);

  const handleUpdateWorker = async () => {
    if (!editWorkerId || !editName || !editSalary) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('workers')
        .update({
          name_worker: editName,
          role: editRole,
          weekly_salary: Number(editSalary)
        })
        .eq('id', editWorkerId);

      if (error) throw error;

      setHasChanges(true); 
      setAllWorkers(prev => prev.map(w => w.id === editWorkerId ? { ...w, name_worker: editName, role: editRole, weekly_salary: Number(editSalary) } : w));
      setIsEditModalOpen(false);
      setEditWorkerId(null);
    } catch (e: any) {
      Aviso.alert("Error al editar", mensajeDeError(e, 'editar al trabajador'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteWorker = useCallback((worker: WorkerState) => {
    if (typeof worker.id === 'string' && worker.id.startsWith('temp_')) {
      Aviso.alert("Sin conexión", "Este trabajador todavía no se ha subido. Espera a tener internet para poder darlo de baja.");
      return;
    }
    Aviso.alert(
      "Eliminar Trabajador",
      `¿Estás seguro de que deseas dar de baja a ${worker.name_worker}? No aparecerá más en las listas activas de asistencia.`,
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Dar de Baja", 
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('workers')
                .update({ is_active: false })
                .eq('id', worker.id);

              if (error) throw error;

              setHasChanges(true); 
              setAllWorkers(prev => prev.filter(w => w.id !== worker.id));
              Aviso.alert("¡Éxito!", "Trabajador dado de baja correctamente.");
            } catch (e: any) {
              Aviso.alert("Error", mensajeDeError(e, 'dar de baja al trabajador'));
            }
          }
        }
      ]
    );
  }, []);

  const openExtrasModal = useCallback((worker: WorkerState) => {
    setSelectedWorkerId(worker.id);
    setTempExtras(worker.extraHours);
    setTempExtraReason(worker.extraReason || '');
    setIsExtrasModalOpen(true);
  }, []);

  const saveExtrasChanges = () => {
    setHasChanges(true); 
    setAllWorkers(prev => prev.map(w => w.id === selectedWorkerId ? { ...w, extraHours: tempExtras || '0', extraReason: tempExtraReason } : w));
    setIsExtrasModalOpen(false);
    setSelectedWorkerId(null);
  };

  const openDiscountModal = useCallback((worker: WorkerState) => {
    setSelectedWorkerId(worker.id);
    setTempDiscount(worker.discount);
    setTempReason(worker.reason);
    setIsDiscountModalOpen(true);
  }, []);

  const saveDiscountChanges = () => {
    setHasChanges(true); 
    setAllWorkers(prev => prev.map(w => w.id === selectedWorkerId ? { ...w, discount: tempDiscount || '0', reason: tempReason } : w));
    setIsDiscountModalOpen(false);
    setSelectedWorkerId(null);
  };

  // 🟢 CALCULADORA CON PROPORCIÓN AJUSTADA PARA SÁBADO DE 5 HORAS

  const handleSavePayroll = async (isSilent = false) => {
    if (!exigirObra(isSilent)) return;
    if (!isSilent) setIsSaving(true);
    try {
      const weekStart = semanaVista;

      const recordsToSave = allWorkers.map(w => {
        const daysAbsent = 6 - w.attendance.filter(Boolean).length;
        return { 
          worker_id: w.id, 
          project_id: activeProject?.id,
          residente_id: profile?.id,
          week_start: weekStart, 
          days_absent: daysAbsent, 
          deduction_amount: Number(w.discount || 0), 
          final_salary: calculateFinalTotal(w),
          attendance: JSON.stringify(w.attendance), 
          reason: w.reason,
          extra_hours: Number(w.extraHours || 0),
          extra_reason: w.extraReason || null,
          is_active: true
        };
      }).filter(r => !r.worker_id.startsWith('temp_'));

      if (isOffline) {
        // El caché es para poder VER la nómina sin internet.
        await Almacen.setItem(`@nomina_cache_${activeProject?.id}`, JSON.stringify(recordsToSave));

        // La bandeja es para que SE SUBA al volver la señal. Son cosas distintas:
        // antes solo se guardaba el caché y la asistencia nunca llegaba a la oficina.
        // Se guarda la última versión de cada trabajador/semana, no una copia por guardado.
        const pendientes = await leerBandeja(BANDEJAS.nomina);
        const sigueVigente = (r: any) =>
          !recordsToSave.some(
            (nuevo: any) => nuevo.worker_id === r.worker_id && nuevo.week_start === r.week_start
          );
        await reemplazarBandeja(BANDEJAS.nomina, [...pendientes.filter(sigueVigente), ...recordsToSave]);

        if (!isSilent) Aviso.alert("Guardado sin conexión", "La asistencia quedó guardada y se subirá sola cuando vuelva el internet.");
        setHasChanges(false);
        return;
      }
      
      let { error } = await supabase.from('payroll_records').upsert(recordsToSave, { onConflict: 'worker_id,week_start' });

      /* Las columnas de horas extra son nuevas. Mientras no se corra
       * sql/horas_extra.sql la base las rechaza, y pasar lista es lo ultimo
       * que puede dejar de funcionar: se reintenta sin ellas y se avisa. */
      if (error && (error.code === '42703' || /extra_hours|extra_reason/.test(error.message || ''))) {
        const sinExtras = recordsToSave.map(({ extra_hours, extra_reason, ...resto }: any) => resto);
        ({ error } = await supabase.from('payroll_records').upsert(sinExtras, { onConflict: 'worker_id,week_start' }));
        if (!error && !isSilent) {
          Aviso.alert('Asistencia enviada', 'Las horas extra no se guardaron: falta correr sql/horas_extra.sql en la base.');
        }
      }

      if (error) throw error;

      setHasChanges(false); 
      if (!isSilent) {
        Aviso.alert("¡Éxito!", "La lista de asistencia y nómina ha sido enviada a la oficina de forma segura.");
      }
    } catch (e: any) {
      console.log(e);
      Aviso.alert("No se pudo enviar la asistencia", mensajeDeError(e, 'enviar la asistencia'));
    } finally {
      if (!isSilent) setIsSaving(false);
    }
  };

  /* Autoguardado.
   *
   * En obra nadie se acuerda del boton: se marca la falta, se guarda el
   * telefono en la bolsa y la lista nunca llega a la oficina. Se espera a que
   * el usuario deje de picar para no mandar un guardado por cada toque.
   *
   * Sin conexion tampoco se pierde: handleSavePayroll deja el registro en la
   * bandeja y se sube solo al volver la señal. Los errores si avisan aunque el
   * guardado sea silencioso; el exito no interrumpe a nadie. */
  useEffect(() => {
    if (!hasChanges || !activeProject?.id) return;
    const temporizador = setTimeout(() => { handleSavePayroll(true); }, 2000);
    return () => clearTimeout(temporizador);
  }, [hasChanges, allWorkers, activeProject]);


  /* El acumulado se arma desde payroll_records, que es lo que quedo guardado al
   * cerrar cada semana, y no se recalcula con los sueldos de hoy: la raya de
   * octubre tiene que seguir diciendo lo que se pago en octubre aunque despues
   * hubiera aumento. Por eso se usan final_salary y deduction_amount tal cual. */
  const cargarSemanas = async () => {
    const pid = activeProject?.id;
    if (!exigirObra()) return;
    setCargandoSemanas(true);
    try {
      const { data, error } = await supabase
        .from('payroll_records')
        .select('*, workers(name_worker, role, weekly_salary)')
        .eq('project_id', pid)
        .eq('is_active', true)
        .order('week_start', { ascending: false });
      if (error) throw error;

      const porSemana: Record<string, any> = {};
      (data || []).forEach((r: any) => {
        const llave = r.week_start;
        if (!llave) return;
        if (!porSemana[llave]) {
          porSemana[llave] = {
            semana: llave,
            etiqueta: etiquetaSemana(llave),
            registros: [],
            total: 0,
            descuentos: 0,
            faltas: 0,
          };
        }
        porSemana[llave].registros.push(r);
        porSemana[llave].total += Number(r.final_salary || 0);
        porSemana[llave].descuentos += Number(r.deduction_amount || 0);
        porSemana[llave].faltas += Number(r.days_absent || 0);
      });

      setSemanas(Object.values(porSemana));
    } catch (e: any) {
      Aviso.alert('Error', mensajeDeError(e, 'cargar el acumulado por semana'));
    } finally {
      setCargandoSemanas(false);
    }
  };

  const abrirSemanas = () => {
    setModalSemanas(true);
    cargarSemanas();
  };

  const imprimirSemanas = async (lista: any[], nombre: string) => {
    if (lista.length === 0) { Aviso.alert('Sin datos', 'Todavia no hay semanas guardadas.'); return; }
    try {
      const empresa = await pedirEmpresa();
      if (!empresa) return;

      const reporte = generarReporteHistorial(lista, activeProject?.name || 'Obra');
      await exportarReporte({ ...reporte, empresa }, nombre);
    } catch (e: any) {
      Aviso.alert('Error PDF', mensajeDeError(e, 'generar el PDF'));
    }
  };

  const handleGeneratePDF = async () => {

    if (displayedWorkers.length === 0) return;
    try {
      const empresa = await pedirEmpresa();
      if (!empresa) return;

      const weekLabel = new Date().toLocaleDateString('es-MX');
      const reporte = generarReporteNomina(displayedWorkers, weekLabel);
      await exportarReporte({ ...reporte, empresa }, 'Nomina.pdf');
    } catch (error: any) { Aviso.alert("Error PDF", error.message); }
  };

  const handleExportarExcel = async () => {
    if (displayedWorkers.length === 0) { 
      Aviso.alert("Sin datos", "No hay trabajadores en la lista activa."); 
      return; 
    }
    try {
      const encabezados = ["Trabajador", "Puesto", "Sueldo Base Semanal ($)", "Dias Asistidos", "Horas Extra (Hrs)", "Motivo Horas Extra", "Descuento Aplicado ($)", "Motivo/Nota", "Total a Pagar ($)\n"];
      
      const filas = displayedWorkers.map(w => {
        const asistencias = w.attendance.filter(Boolean).length;
        const total = calculateFinalTotal(w);
        const notaLimpia = w.reason ? w.reason.replace(/,/g, ' ') : ''; 
        const notaExtra = w.extraReason ? w.extraReason.replace(/,/g, ' ') : '';
        return `"${w.name_worker}","${w.role}",${w.weekly_salary},${asistencias},${w.extraHours},"${notaExtra}",${w.discount},"${notaLimpia}",${total.toFixed(2)}`;
      }).join("\n");

      const contenidoCSV = "\uFEFF" + encabezados.join(",") + filas;
      const nombreArchivo = `Raya_${activeCategory}_${activeProject?.name?.replace(/\s+/g, '_') || 'Obra'}.csv`;
      
      await exportarTexto(contenidoCSV, nombreArchivo);
    } catch (error: any) {
      Aviso.alert("Error Excel", "No se pudo generar la hoja de cálculo: " + error.message);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={() => regresar()}><Feather name="chevron-left" size={28} color="#FFF" /></TouchableOpacity>
          <Text style={styles.headerSubtitle}>ASISTENCIA Y NÓMINA</Text>
          <TouchableOpacity onPress={fetchWorkers}><Feather name="refresh-cw" size={20} color="#FFF" /></TouchableOpacity>
        </View>
        <Text style={styles.headerTitle}>{activeProject?.name || "Obra"}</Text>
      </View>

      {hasChanges && (
        <View style={styles.warningBannerContainer}>
          <Feather name="alert-triangle" size={16} color="#7F1D1D" />
          <Text style={styles.warningBannerText}>Modificaciones pendientes. Presiona el botón verde de guardar arriba.</Text>
        </View>
      )}

      <View style={styles.tabContainer}>
        <TouchableOpacity style={[styles.tabBtn, activeCategory === 'obrero' && styles.tabBtnActive]} onPress={() => setActiveCategory('obrero')}>
          <Text style={[styles.tabText, activeCategory === 'obrero' && styles.tabTextActive]}>Mano de Obra</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, activeCategory === 'tecnico' && styles.tabBtnActive]} onPress={() => setActiveCategory('tecnico')}>
          <Text style={[styles.tabText, activeCategory === 'tecnico' && styles.tabTextActive]}>Personal Técnico</Text>
        </TouchableOpacity>
      </View>

      {!loading && allWorkers.length > 0 && (
        <View style={styles.topSyncBtnContainer}>
          <TouchableOpacity style={[styles.syncBtn, hasChanges && styles.syncBtnHighlighted]} onPress={() => handleSavePayroll(false)} disabled={isSaving}>
            {isSaving ? <ActivityIndicator color="#FFF" size="small" /> : (
              <>
                <Feather name="upload-cloud" size={18} color="#FFF" />
                <Text style={styles.syncBtnText}>Guardar y Enviar a Oficina</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{flex: 1}}>
        <FlatList
          data={displayedWorkers}
          keyExtractor={(w) => w.id}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          // Solo se dibujan las tarjetas que caben en pantalla y unas pocas
          // alrededor; con 40 trabajadores esto evita cientos de botones vivos.
          initialNumToRender={6}
          windowSize={5}
          ListHeaderComponent={
            <>
              <SummaryCard labelLeft="Nómina Base" valueLeft={nominaBase} labelRight="Proyección Final" valueRight={proyeccionFinal} colorRight="#10B981" />

              <View style={styles.sectionHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Lista de {activeCategory === 'obrero' ? 'Obreros' : 'Técnicos'}</Text>
                </View>
                {puedeExportar() && (
                  <View style={styles.exportButtonsContainer}>
                    <TouchableOpacity style={[styles.exportBtn, {backgroundColor: '#DC2626'}]} onPress={handleGeneratePDF}><Feather name="file-text" size={14} color="#FFF" /><Text style={styles.exportBtnText}>PDF</Text></TouchableOpacity>
                    <TouchableOpacity style={[styles.exportBtn, {backgroundColor: '#10B981', marginLeft: 8}]} onPress={handleExportarExcel}><Feather name="grid" size={14} color="#FFF" /><Text style={styles.exportBtnText}>Excel</Text></TouchableOpacity>
                    <TouchableOpacity style={[styles.exportBtn, {backgroundColor: '#0F172A', marginLeft: 8}]} onPress={abrirSemanas}><Feather name="calendar" size={14} color="#FFF" /><Text style={styles.exportBtnText}>Semanas</Text></TouchableOpacity>
                  </View>
                )}
              </View>

              {/* La semana manda: quien pasa lista necesita ver de que semana es
                  antes de empezar a marcar. Mismo trato que el resumen de Destajo. */}
              <View style={[styles.barraSemana, !esSemanaActual && styles.barraSemanaPasada]}>
                <TouchableOpacity onPress={() => moverSemana(-1)} style={styles.flechaSemana} hitSlop={10}>
                  <Feather name="chevron-left" size={20} color="#1E3A8A" />
                </TouchableOpacity>

                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={styles.barraSemanaTitulo} numberOfLines={1}>{rangoSemanaActual}</Text>
                  <Text style={styles.barraSemanaDetalle}>
                    {esSemanaActual ? 'Semana en curso' : 'Semana cerrada'} · {displayedWorkers.length} {displayedWorkers.length === 1 ? 'registro' : 'registros'} · {hasChanges ? 'Guardando…' : 'Guardado'}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => moverSemana(1)}
                  style={[styles.flechaSemana, esSemanaActual && { opacity: 0.25 }]}
                  disabled={esSemanaActual}
                  hitSlop={10}
                >
                  <Feather name="chevron-right" size={20} color="#1E3A8A" />
                </TouchableOpacity>
              </View>

              {loading && displayedWorkers.length === 0 && <SkeletonLista filas={6} />}
            </>
          }
          ListEmptyComponent={
            loading ? null : (
              <SinDatos mensaje="No hay datos para mostrar." onReintentar={fetchWorkers} />
            )
          }
          renderItem={({ item: worker }) => (
            <TarjetaTrabajador
              worker={worker}
              isAdmin={isAdmin}
              isFinancialRole={isFinancialRole}
              puedeCorregir={puedeCorregirResidente(worker)}
              dias={diasSemana}
              onToggle={toggleAttendance}
              onEditar={openEditWorkerModal}
              onBorrar={handleDeleteWorker}
              onExtras={openExtrasModal}
              onDescuento={openDiscountModal}
            />
          )}
        />
      </KeyboardAvoidingView>

      {/* El alta de obreros tambien es del residente: es quien esta parado en
          la obra. El boton solo existia para admin y oficina, asi que el
          residente no tenia como dar de alta a nadie y, sin obreros, tampoco
          como pasar lista. Ese era el "no me deja agregar" que se reportaba. */}
      <View style={styles.fabContainer}>
        <TouchableOpacity style={styles.fabPrimary} onPress={() => setIsModalVisible(true)}><Feather name="plus" size={30} color="#FFF" /></TouchableOpacity>
      </View>

      {/* MODAL ACUMULADO POR SEMANA */}
      <Modal visible={modalSemanas} animationType="slide" transparent={true} onRequestClose={() => setModalSemanas(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setModalSemanas(false)} />
          <View style={styles.modalContent}>
            <View style={styles.semanasHeader}>
              <Text style={[styles.modalTitle, { marginBottom: 0 }]}>Acumulado por semana</Text>
              <TouchableOpacity onPress={() => setModalSemanas(false)}><Feather name="x" size={22} color="#64748B" /></TouchableOpacity>
            </View>

            {cargandoSemanas ? (
              <ActivityIndicator color="#2563EB" style={{ marginVertical: 30 }} />
            ) : semanas.length === 0 ? (
              <Text style={{ textAlign: 'center', color: '#64748B', marginVertical: 30 }}>
                Todavía no hay semanas guardadas. Pasa lista y guárdala para que aparezca aquí.
              </Text>
            ) : (
              <>
                <TouchableOpacity style={styles.imprimirTodasBtn} onPress={() => imprimirSemanas(semanas, 'Nomina_Acumulado.pdf')}>
                  <Feather name="printer" size={16} color="#FFF" />
                  <Text style={styles.imprimirTodasTexto}>
                    Imprimir {semanas.length === 1 ? 'la semana' : `las ${semanas.length} semanas`}
                  </Text>
                </TouchableOpacity>

                <ScrollView style={{ marginTop: 14 }}>
                  {semanas.map((s) => (
                    <View key={s.semana} style={styles.semanaFila}>
                      <View style={{ flex: 1, paddingRight: 10 }}>
                        <Text style={styles.semanaEtiqueta}>{s.etiqueta}</Text>
                        <Text style={styles.semanaDetalle}>
                          {s.registros.length} {s.registros.length === 1 ? 'trabajador' : 'trabajadores'} · {s.faltas} {s.faltas === 1 ? 'falta' : 'faltas'}
                          {s.descuentos > 0 ? ` · -$${s.descuentos.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.semanaTotal}>
                          ${s.total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Text>
                        <TouchableOpacity style={styles.semanaImprimir} onPress={() => imprimirSemanas([s], `Nomina_${s.semana}.pdf`)}>
                          <Feather name="file-text" size={12} color="#2563EB" />
                          <Text style={styles.semanaImprimirTexto}>PDF</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* MODAL ALTA */}
      <Modal visible={isModalVisible} animationType="slide" transparent={true} onRequestClose={() => setIsModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsModalVisible(false)} />
          <View style={styles.modalContent}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.modalTitle}>Nuevo {activeCategory === 'obrero' ? 'Trabajador' : 'Técnico'}</Text>
            <TextInput style={styles.modalInput} placeholderTextColor="#94A3B8" placeholder="Nombre completo" value={newName} onChangeText={setNewName} />
            <TextInput style={styles.modalInput} placeholderTextColor="#94A3B8" placeholder="Puesto" value={newRole} onChangeText={setNewRole} />
            <TextInput style={styles.modalInput} placeholderTextColor="#94A3B8" placeholder="Sueldo Semanal $" keyboardType="numeric" value={newSalary} onChangeText={setNewSalary} />
            <TouchableOpacity style={styles.saveBtn} onPress={handleAddWorker} disabled={isSaving}>{isSaving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Registrar en Obra</Text>}</TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL EDICIÓN */}
      <Modal visible={isEditModalOpen} animationType="slide" transparent={true} onRequestClose={() => setIsEditModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsEditModalOpen(false)} />
          <View style={styles.modalContent}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.modalTitle}>✏️ Editar Datos del Trabajador</Text>
            <Text style={styles.subModalLabel}>Nombre del Obrero/Técnico:</Text>
            <TextInput style={styles.modalInput} value={editName} onChangeText={setEditName} />
            <Text style={styles.subModalLabel}>Puesto u Oficio:</Text>
            <TextInput style={styles.modalInput} value={editRole} onChangeText={setEditRole} />
            <Text style={styles.subModalLabel}>Sueldo Base Semanal ($):</Text>
            <TextInput style={styles.modalInput} keyboardType="numeric" value={editSalary} onChangeText={(v) => setEditSalary(limitarNumero(v))} />
            <TouchableOpacity style={styles.saveBtn} onPress={handleUpdateWorker} disabled={isSaving}>{isSaving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Guardar Cambios</Text>}</TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL EXTRAS */}
      <Modal visible={isExtrasModalOpen} transparent={true} animationType="fade" onRequestClose={() => setIsExtrasModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsExtrasModalOpen(false)} />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>🕒 Asignar Horas Extra</Text>
            <Text style={styles.subModalLabel}>Ingresa la cantidad total de horas acumuladas en la semana:</Text>
            <TextInput style={styles.modalInput} keyboardType="numeric" value={tempExtras} onChangeText={(v) => setTempExtras(limitarNumero(v))} placeholder="Ej. 4" autoFocus />
            <Text style={styles.subModalLabel}>Motivo o Nota justificante:</Text>
            <TextInput style={[styles.modalInput, {height: 50, textAlignVertical: 'top'}]} value={tempExtraReason} onChangeText={setTempExtraReason} placeholder="Ej. Colado de losa" multiline />
            <TouchableOpacity style={styles.saveBtn} onPress={saveExtrasChanges}><Text style={styles.saveBtnText}>Aplicar Horas</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL DESCUENTOS */}
      <Modal visible={isDiscountModalOpen} transparent={true} animationType="fade" onRequestClose={() => setIsDiscountModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsDiscountModalOpen(false)} />
          <View style={styles.modalContent}>
            <Text style={[styles.modalTitle, {color: '#EF4444'}]}>💸 Deducción y Observación</Text>
            <Text style={styles.subModalLabel}>Monto del Descuento ($):</Text>
            <TextInput style={styles.modalInput} keyboardType="numeric" value={tempDiscount} onChangeText={(v) => setTempDiscount(limitarNumero(v))} placeholder="Ej. 150" />
            <Text style={styles.subModalLabel}>Motivo o Nota justificante:</Text>
            <TextInput style={[styles.modalInput, {height: 50, textAlignVertical: 'top'}]} value={tempReason} onChangeText={setTempReason} placeholder="Ej. Retardo" multiline />
            <TouchableOpacity style={[styles.saveBtn, {backgroundColor: '#EF4444'}]} onPress={saveDiscountChanges}><Text style={styles.saveBtnText}>Aplicar Descuento</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  header: { backgroundColor: '#2563EB', paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerSubtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 'bold', letterSpacing: 1 },
  headerTitle: { color: '#FFF', fontSize: 22, fontWeight: 'bold', marginTop: 8 },
  warningBannerContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEE2E2', paddingVertical: 8, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: '#FCA5A5', gap: 8 },
  warningBannerText: { color: '#991B1B', fontSize: 12, fontWeight: '700', flex: 1 },
  tabContainer: { flexDirection: 'row', backgroundColor: '#E2E8F0', borderRadius: 12, padding: 4, marginTop: 12, marginHorizontal: 15 },
  tabBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  tabBtnActive: { backgroundColor: '#FFF', boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.1)',     elevation: 2 },
  tabText: { fontSize: 13, fontWeight: 'bold', color: '#64748B' },
  tabTextActive: { color: '#2563EB' },
  topSyncBtnContainer: { paddingHorizontal: 15, paddingTop: 10, backgroundColor: '#F1F5F9' },
  syncBtn: { backgroundColor: '#1E293B', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 12, boxShadow: '0px 2px 6px rgba(15, 23, 42, 0.1)', elevation: 2 },
  syncBtnHighlighted: { backgroundColor: '#059669' },
  syncBtnText: { color: '#FFF', fontSize: 13, fontWeight: 'bold', marginLeft: 6 },
  body: { padding: 12, paddingBottom: 150 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', color: '#334155' },
  exportButtonsContainer: { flexDirection: 'row' },
  exportBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 6 },
  exportBtnText: { color: '#FFF', fontSize: 11, fontWeight: 'bold', marginLeft: 4 },
  workerCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 12, marginBottom: 10, boxShadow: '0px 2px 6px rgba(15, 23, 42, 0.1)', elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' },
  workerName: { fontSize: 15, fontWeight: 'bold', color: '#1E293B' },
  workerRole: { fontSize: 11, color: '#64748B', marginTop: 1, fontWeight: '600' },
  salaryLabel: { fontSize: 8, color: '#2563EB', fontWeight: 'bold', textTransform: 'uppercase' },
  salaryValue: { fontSize: 14, fontWeight: 'bold', color: '#1E293B' },
  adminActionIconsRow: { flexDirection: 'row', alignItems: 'center' },
  inlineActionBtn: { padding: 6, backgroundColor: '#F1F5F9', borderRadius: 8 },
  attendanceRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#F8FAFC', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 12, marginBottom: 8 },
  dayBox: { alignItems: 'center', paddingHorizontal: 2 },
  dayText: { fontSize: 10, fontWeight: 'bold', color: '#64748B', marginBottom: 2 },
  dayBoxHoy: { backgroundColor: '#DBEAFE', borderRadius: 8, paddingVertical: 2 },
  dayTextHoy: { color: '#1D4ED8' },
  barraSemana: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#E0E7FF', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#C7D2FE', marginBottom: 10 },
  barraSemanaTitulo: { fontSize: 14, fontWeight: 'bold', color: '#1E3A8A', textTransform: 'uppercase', flexShrink: 1 },
  barraSemanaDetalle: { fontSize: 11, color: '#1E3A8A', fontWeight: '600', marginTop: 2 },
  barraSemanaPasada: { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
  flechaSemana: { padding: 4 },
  actionsContainerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  actionCardBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', paddingVertical: 6, paddingHorizontal: 8, borderRadius: 10, gap: 4 },
  actionBtnLabel: { fontSize: 11, fontWeight: '600', color: '#475569' },
  actionBtnValue: { fontSize: 11, fontWeight: 'bold', color: '#0F172A' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, alignItems: 'center', paddingTop: 6, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  totalLabel: { fontSize: 11, fontWeight: '700', color: '#64748B' },
  totalValue: { fontSize: 16, fontWeight: 'bold', color: '#059669' },
  fabContainer: { position: 'absolute', bottom: 25, right: 20 },
  fabPrimary: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center', boxShadow: '0px 4px 10px rgba(15, 23, 42, 0.14)', elevation: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 20 },
  semanasHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  imprimirTodasBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#0F172A', paddingVertical: 12, borderRadius: 12 },
  imprimirTodasTexto: { color: '#FFF', fontWeight: 'bold', fontSize: 13 },
  semanaFila: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  semanaEtiqueta: { fontSize: 14, fontWeight: 'bold', color: '#1E293B' },
  semanaDetalle: { fontSize: 11, color: '#64748B', marginTop: 2 },
  semanaTotal: { fontSize: 15, fontWeight: '900', color: '#047857' },
  semanaImprimir: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  semanaImprimirTexto: { fontSize: 11, color: '#2563EB', fontWeight: 'bold' },
  modalContent: { backgroundColor: '#FFF', borderRadius: 24, padding: 22, maxHeight: '85%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1E293B', marginBottom: 15 },
  modalInput: { backgroundColor: '#F1F5F9', borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0', color: '#1E293B' },
  saveBtn: { backgroundColor: '#2563EB', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  saveBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  subModalLabel: { fontSize: 12, fontWeight: '700', color: '#475569', marginTop: 10, marginBottom: 5 },
});