'use client';

import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SkeletonTarjetas } from '../components/Skeleton';
import { useProject } from '../context/ProjectContext';
import { useUser } from '../context/UserContext';
import Almacen from '../lib/almacen';
import { useRefrescar } from '../lib/refrescar';
import { VERSION_APP } from '../lib/version';
import { Aviso } from '../lib/aviso';
import { subirArchivo } from '../lib/subidas';
import { supabase } from '../lib/supabase';
import { firmarCampos } from '../lib/urlsFirmadas';

export default function ProyectosScreen() {
  const router = useRouter();
  const { setActiveProject, isOffline } = useProject();
  const { profile, isLoadingUser } = useUser();
  const isAdmin = profile?.role === 'admin';
  const [proyectos, setProyectos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false); 
  const [userId, setUserId] = useState<string | null>(null);

  const [listaResidentes, setListaResidentes] = useState<any[]>([]);
  const [residentesAsignados, setResidentesAsignados] = useState<any[]>([]);
  const [guardandoResidente, setGuardandoResidente] = useState(false);
  const [selectedResidentId, setSelectedResidentId] = useState<string | null>(null);
  // Al crear una obra se pueden elegir varios residentes de una vez.
  const [residentesNuevos, setResidentesNuevos] = useState<string[]>([]);
  const [isResidentDropdownOpen, setIsResidentDropdownOpen] = useState(false);

  // 🟢 ESTADOS PARA CREAR / EDITAR OBRA
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectLocation, setNewProjectLocation] = useState('');
  const [clientName, setClientName] = useState('');
  const [contractNumber, setContractNumber] = useState('');
  const [fotoObra, setFotoObra] = useState<string | null>(null);

  const [startDate, setStartDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateSelected, setDateSelected] = useState(false);

  const [endDate, setEndDate] = useState(new Date());
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [endDateSelected, setEndDateSelected] = useState(false);

  const [isGettingLocation, setIsGettingLocation] = useState(false);

  // 🟢 ESTADOS PARA EL MODAL DE DETALLES
  const [isDetalleVisible, setIsDetalleVisible] = useState(false);
  const [obraAEliminar, setObraAEliminar] = useState<any>(null);
  const [textoConfirmacion, setTextoConfirmacion] = useState('');
  const [eliminando, setEliminando] = useState(false);
  const [obraSeleccionada, setObraSeleccionada] = useState<any>(null);

  // ESTADOS PARA UNIRSE A OBRA
  const [isJoinModalVisible, setIsJoinModalVisible] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    if (!isLoadingUser) {
      cargarProyectos();
    }
  }, [isOffline, isLoadingUser, isAdmin]);

  const cargarResidentesDisponibles = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'residente')
      .order('full_name', { ascending: true });

    if (data) setListaResidentes(data);
  };


  useRefrescar(() => cargarProyectos(), { boton: false });

  const cargarProyectos = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.replace('/login');
        return;
      }
      setUserId(session.user.id);

      const storageKey = `@proyectos_cache_${session.user.id}`;

      if (isOffline) {
        const cachedData = await Almacen.getItem(storageKey);
        if (cachedData) setProyectos(JSON.parse(cachedData));
        else setProyectos([]);
        return;
      }

      if (isAdmin) {
        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;

        if (data) {
          const proyectosFormateados = data.map((proj: any) => ({
            ...proj,
            userRole: 'Administrador'
          }));
          setProyectos(await firmarCampos(proyectosFormateados, ['foto_url']));
          await Almacen.setItem(storageKey, JSON.stringify(proyectosFormateados));
        }
      }
      else {
        const { data, error } = await supabase
          .from('project_members')
          .select(`
            role,
            projects (id, name, location, start_date, end_date, client_name, contract_number, status, foto_url)
          `)
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;

        if (data) {
          const proyectosFormateados = data
            .filter((item: any) => item.projects != null)
            .map((item: any) => ({
              ...item.projects,
              userRole: item.role
            }));
          // Este es el camino de los residentes. También necesita firmar las
          // direcciones: sin esto, ellos no ven la foto de la obra.
          setProyectos(await firmarCampos(proyectosFormateados, ['foto_url']));
          await Almacen.setItem(storageKey, JSON.stringify(proyectosFormateados));
        }
      }
    } catch (error: any) {
      if (error.message !== 'Network request failed' && error.message !== 'Failed to fetch') {
        Aviso.alert("Error de Conexión", error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const manejarRefreshManual = async () => {
    if (isOffline) {
      Aviso.alert("Modo Offline", "Conéctate a internet para sincronizar los cambios de la web.");
      return;
    }
    setIsRefreshing(true);
    await cargarProyectos();
    setIsRefreshing(false);
  };

  const seleccionarProyecto = (proyectoId: string, projectName: string, userRole: string) => {
    setActiveProject({ id: proyectoId, name: projectName, role: userRole });
    router.replace('/(tabs)');
  };

  const cerrarSesion = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  const obtenerUbicacionActual = async () => {
    setIsGettingLocation(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Aviso.alert('Permiso denegado', 'No hay problema, puedes escribir la ubicación a mano.');
        setIsGettingLocation(false);
        return;
      }

      let location = await Location.getCurrentPositionAsync({});
      let geocode = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude
      });

      if (geocode.length > 0) {
        const address = geocode[0];
        const formattedAddress = `${address.street || ''} ${address.streetNumber || ''}, ${address.subregion || address.city || ''}, ${address.region || ''}`.trim();
        setNewProjectLocation(formattedAddress.replace(/^,|,$/g, '').trim());
      } else {
        Aviso.alert('Dirección no encontrada', 'Estamos en una zona sin registro.');
      }
    } catch (error) {
      Aviso.alert('Error de GPS', 'No pudimos obtener tu ubicación actual.');
    } finally {
      setIsGettingLocation(false);
    }
  };

  const seleccionarFotoObra = () => {
    Aviso.alert("Foto de la Obra", "¿De dónde quieres subir la imagen?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Tomar Foto", onPress: async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') { Aviso.alert("Permiso Denegado"); return; }
        const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [16, 9], quality: 0.5 });
        if (!result.canceled) setFotoObra(result.assets[0].uri);
      }},
      { text: "Galería", onPress: async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { Aviso.alert("Permiso Denegado"); return; }
        const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [16, 9], quality: 0.5 });
        if (!result.canceled) setFotoObra(result.assets[0].uri);
      }}
    ]);
  };

  const handleSaveProject = async () => {
    if (isOffline) {
      Aviso.alert("Modo Offline", "Necesitas conexión a internet para esta acción.");
      return;
    }

    if (!newProjectName.trim() || !newProjectLocation.trim()) {
      Aviso.alert("Campos incompletos", "Por favor ingresa el nombre y la ubicación de la obra.");
      return;
    }

    if (!userId) return;

    setIsSaving(true);
    try {
      const formattedStartDate = dateSelected ? startDate.toISOString().split('T')[0] : null;
      const formattedEndDate = endDateSelected ? endDate.toISOString().split('T')[0] : null;

      let finalFotoUrl = fotoObra;

      if (fotoObra && !fotoObra.startsWith('http')) {
        try {

          finalFotoUrl = await subirArchivo(fotoObra, 'obras', { prefijo: 'obra' });
        } catch (error: any) {
          Aviso.alert("Error procesando imagen", error.message);
          finalFotoUrl = null;
        }
      }

      const projectData = {
        name: newProjectName,
        location: newProjectLocation,
        start_date: formattedStartDate,
        end_date: formattedEndDate,
        client_name: clientName.trim() || null,
        contract_number: contractNumber.trim() || null,
        foto_url: finalFotoUrl || null,
      };

      if (modalMode === 'edit' && editingProjectId) {
        const { error: updateError } = await supabase.from('projects').update(projectData).eq('id', editingProjectId);
        if (updateError) throw updateError;
        Aviso.alert("¡Éxito!", "La obra se ha actualizado correctamente.");
      } else {
        const { data: newProject, error: projectError } = await supabase.from('projects').insert([projectData]).select().single();
        if (projectError) throw projectError;

        const { error: assignmentError } = await supabase.from('project_members').insert([{ user_id: userId, project_id: newProject.id, role: 'admin' }]);
        if (assignmentError) throw assignmentError;

        if (residentesNuevos.length > 0) {
          const asignaciones = residentesNuevos.map((userId) => ({
            user_id: userId,
            project_id: newProject.id,
            role: 'residente',
          }));
          const { error: residentAssignError } = await supabase.from('project_members').insert(asignaciones);
          if (residentAssignError) console.log("Error asignando residentes:", residentAssignError);
        }

        Aviso.alert("¡Éxito!", "La obra se ha creado correctamente.");
      }

      limpiarFormulario();
      setIsModalVisible(false);
      cargarProyectos();

    } catch (error: any) {
      Aviso.alert("Error", error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const iniciarCreacion = () => {
    limpiarFormulario();
    setModalMode('create');
    cargarResidentesDisponibles(); // Al crear tampoco se cargaba: el desplegable salía vacío
    setIsModalVisible(true);
  };

  /* Residentes de una obra. Viven en project_members con rol 'residente'.
   * Se administran aquí para poder tener varios por obra: al crearla solo se
   * podía asignar uno, y no había forma de agregar más después. */
  const cargarResidentesDeObra = async (projectId: string) => {
    const { data } = await supabase
      .from('project_members')
      .select('user_id')
      .eq('project_id', projectId)
      .eq('role', 'residente');

    const ids = (data || []).map((m: any) => m.user_id);
    if (ids.length === 0) {
      setResidentesAsignados([]);
      return;
    }

    const { data: perfiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', ids);

    setResidentesAsignados(perfiles || []);
  };

  const agregarResidente = async (userId: string) => {
    if (!editingProjectId || !userId) return;
    setGuardandoResidente(true);
    try {
      const { error } = await supabase
        .from('project_members')
        .insert([{ user_id: userId, project_id: editingProjectId, role: 'residente' }]);
      if (error) throw error;

      await cargarResidentesDeObra(editingProjectId);
      setSelectedResidentId(null); setResidentesNuevos([]);
      setIsResidentDropdownOpen(false);
    } catch (e: any) {
      Aviso.alert('No se pudo agregar', e.message);
    } finally {
      setGuardandoResidente(false);
    }
  };

  const quitarResidente = (residente: any) => {
    if (!editingProjectId) return;
    Aviso.alert('Quitar residente', `¿Quitar a ${residente.full_name} de esta obra?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar', style: 'destructive', onPress: async () => {
        try {
          const { error } = await supabase
            .from('project_members')
            .delete()
            .eq('project_id', editingProjectId)
            .eq('user_id', residente.id)
            .eq('role', 'residente');
          if (error) throw error;
          await cargarResidentesDeObra(editingProjectId);
        } catch (e: any) {
          Aviso.alert('No se pudo quitar', e.message);
        }
      }},
    ]);
  };

  const iniciarEdicion = (proyecto: any) => {
    setModalMode('edit');
    setEditingProjectId(proyecto.id);
    cargarResidentesDisponibles(); // Nunca se llamaba: la lista salía vacía
    cargarResidentesDeObra(proyecto.id);
    setNewProjectName(proyecto.name || '');
    setNewProjectLocation(proyecto.location || '');
    setClientName(proyecto.client_name || '');
    setContractNumber(proyecto.contract_number || '');
    setFotoObra(proyecto.foto_url || null);

    if (proyecto.start_date) {
      setStartDate(new Date(proyecto.start_date));
      setDateSelected(true);
    } else {
      setStartDate(new Date());
      setDateSelected(false);
    }

    if (proyecto.end_date) {
      setEndDate(new Date(proyecto.end_date));
      setEndDateSelected(true);
    } else {
      setEndDate(new Date());
      setEndDateSelected(false);
    }

    setIsModalVisible(true);
  };

  const limpiarFormulario = () => {
    setNewProjectName('');
    setNewProjectLocation('');
    setClientName('');
    setContractNumber('');
    setDateSelected(false);
    setStartDate(new Date());
    setEndDateSelected(false);
    setEndDate(new Date());
    setEditingProjectId(null);
    setFotoObra(null);
  };

  const abrirDetalles = (proyecto: any) => {
    setObraSeleccionada(proyecto);
    setIsDetalleVisible(true);
  };

  /* Antes de borrar una obra guardamos su expediente.
   * Borrar arrastra en cascada bitácora, nóminas, trabajadores, planos,
   * herramientas e ingresos, y los gastos quedaban sueltos. Si nadie finalizó
   * la obra primero, no quedaba ningún rastro de que existió. */
  const guardarExpediente = async (proyecto: any) => {
    const [gastos, bitacora, caja, nomina, trabajadores, inventario, maquinaria] = await Promise.all([
      supabase.from('gastos_generales').select('*').eq('project_id', proyecto.id),
      supabase.from('logs').select('*').eq('project_id', proyecto.id),
      supabase.from('caja_chica').select('*').eq('project_id', proyecto.id),
      supabase.from('payroll_records').select('*').eq('project_id', proyecto.id),
      supabase.from('workers').select('*').eq('project_id', proyecto.id),
      supabase.from('inventory').select('*').eq('project_id', proyecto.id),
      supabase.from('gastos_maquinaria').select('*').eq('project_id', proyecto.id),
    ]);

    const { error } = await supabase.from('project_backups').insert([{
      project_id: proyecto.id,
      report_data: {
        nombre: proyecto.name,
        ubicacion: proyecto.location ?? null,
        motivo: 'eliminada',
        // El project_id de la columna se vuelve nulo al borrar la obra
        // (on delete set null), así que lo guardamos también aquí dentro.
        project_id_original: proyecto.id,
        fecha_cierre: new Date(),
        gastos: gastos.data, bitacora: bitacora.data, caja_chica: caja.data,
        nomina: nomina.data, trabajadores: trabajadores.data,
        inventario: inventario.data, maquinaria: maquinaria.data,
      }
    }]);
    if (error) throw error;
  };

  const confirmarEliminar = (proyecto: any) => {
    setTextoConfirmacion('');
    setObraAEliminar(proyecto);
  };

  /* Eliminar una obra es irreversible y se lleva nueve tablas de historial.
   * Por eso se pide escribir su nombre, como hace GitHub al borrar un repo:
   * obliga a leer QUÉ se está borrando, no solo a tocar "confirmar". */
  const nombreCoincide =
    !!obraAEliminar &&
    textoConfirmacion.trim().toUpperCase() === String(obraAEliminar.name || '').trim().toUpperCase();

  const ejecutarEliminacion = async () => {
    if (!obraAEliminar || !nombreCoincide) return;
    setEliminando(true);
    try {
      await guardarExpediente(obraAEliminar);

      const { error } = await supabase.from('projects').delete().eq('id', obraAEliminar.id);
      if (error) throw error;

      setObraAEliminar(null);
      Aviso.alert('Obra eliminada', 'Se guardó su expediente antes de borrarla.');
      cargarProyectos();
    } catch (e: any) {
      Aviso.alert('Error al eliminar', e.message);
    } finally {
      setEliminando(false);
    }
  };

  const finalizarObra = async (proyecto: any) => {
    Aviso.alert("Cerrar Obra", "¿Generar reporte de cierre y marcar obra como Finalizada?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Confirmar", onPress: async () => {
        try {
          const { data: gastos } = await supabase.from('gastos_generales').select('*').eq('project_id', proyecto.id);
          const { data: bitacora } = await supabase.from('logs').select('*').eq('project_id', proyecto.id);
          const { error: backupError } = await supabase.from('project_backups').insert([{
            project_id: proyecto.id,
            report_data: {
              gastos, bitacora,
              nombre: proyecto.name,
              motivo: 'finalizada',
              project_id_original: proyecto.id,
              fecha_cierre: new Date(),
            }
          }]);
          if (backupError) throw backupError;
          const { error: updateError } = await supabase.from('projects').update({ status: 'finalizada' }).eq('id', proyecto.id);
          if (updateError) throw updateError;
          Aviso.alert("¡Obra Finalizada!", "Reporte generado y archivado con éxito.");
          cargarProyectos();
        } catch(e:any) {
          Aviso.alert("Error", e.message);
        }
      }}
    ]);
  };

  const handleUnirseObra = async (codeToUse: string) => {
    if (isOffline) {
      Aviso.alert("Modo Offline", "Necesitas conexión a internet para unirte a un proyecto.");
      return;
    }
    const finalCode = codeToUse.trim().toUpperCase();
    if (!finalCode) {
      Aviso.alert("Código vacío", "Por favor ingresa un código válido.");
      return;
    }
    setIsJoining(true);
    try {
      const { data: proj, error: fetchErr } = await supabase
        .from('projects')
        .select('id, name')
        .eq('invite_code', finalCode)
        .single();
      if (fetchErr || !proj) {
        Aviso.alert("Código inválido", "No se encontró ninguna obra con este código. Verifica que esté bien escrito.");
        setIsJoining(false);
        return;
      }
      let roleToAssign = 'residente';
      if (profile?.role === 'oficina') roleToAssign = 'oficina';
      else if (profile?.role === 'admin') roleToAssign = 'admin';
      const { error: joinErr } = await supabase
        .from('project_members')
        .insert([{ user_id: userId, project_id: proj.id, role: roleToAssign }]);
      if (joinErr) {
        if (joinErr.code === '23505') {
          Aviso.alert("Aviso", "Ya eres parte de esta obra.");
        } else {
          throw joinErr;
        }
      } else {
        Aviso.alert("¡Éxito!", `Te has unido a la obra: ${proj.name}`);
        setInviteCode('');
        setIsJoinModalVisible(false);
        setIsScanning(false);
        cargarProyectos();
      }
    } catch (err: any) {
      Aviso.alert("Error", err.message);
    } finally {
      setIsJoining(false);
    }
  };

  const startScanning = async () => {
    if (!permission?.granted) {
      const response = await requestPermission();
      if (!response.granted) {
        Aviso.alert("Permiso denegado", "Necesitamos acceso a la cámara para escanear el QR.");
        return;
      }
    }
    setIsScanning(true);
  };

  if (isLoadingUser) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={{ marginTop: 10, color: '#6B7280' }}>Cargando perfil...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}></View>
        <View style={styles.headerBottomRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Mis Obras</Text>
            <Text style={styles.headerSmall}>{profile?.name || 'Cargando...'}</Text>
            {/* Sello de versión: permite saber de un vistazo si un dispositivo
                quedó con una versión vieja guardada en caché. */}
            <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, marginTop: 2 }}>v{VERSION_APP}</Text>
          </View>
          
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity 
              onPress={manejarRefreshManual} 
              style={styles.logoutBtn} 
              disabled={isRefreshing}
              activeOpacity={0.7}
            >
              {isRefreshing ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Feather name="refresh-cw" size={20} color="#FFF" />
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={cerrarSesion} style={styles.logoutBtn}>
              <Feather name="log-out" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {isAdmin && (
        <TouchableOpacity
          style={styles.adminUsuariosBtn}
          onPress={() => router.push('./admin_usuarios' as any)}
          activeOpacity={0.8}
        >
          <View style={styles.adminUsuariosInner}>
            <View style={styles.adminIconContainer}>
              <Feather name="users" size={20} color="#2563EB" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.adminBtnTitle}>Control de Personal</Text>
              <Text style={styles.adminBtnSubtitle}>Dar de alta residentes, oficina y ver INEs</Text>
            </View>
            <Feather name="chevron-right" size={20} color="#94A3B8" />
          </View>
        </TouchableOpacity>
      )}

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {loading && !isRefreshing ? (
          <SkeletonTarjetas cantidad={3} />
        ) : proyectos.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Feather name="folder-minus" size={48} color="#9CA3AF" />
            <Text style={styles.emptyText}>No tienes obras asignadas aún.</Text>
            <Text style={styles.emptySubText}>
              {profile?.role === 'admin'
                ? 'Toca el botón "+" para crear tu primera obra o usa el botón de refresh arriba.'
                : 'Pídele al administrador que te asigne la obra y toca el botón de refresh arriba.'}
            </Text>
          </View>
        ) : (
          proyectos.map((proyecto) => (
            <TouchableOpacity key={proyecto.id} style={styles.projectCard} onPress={() => abrirDetalles(proyecto)} activeOpacity={0.9}>
              <View style={styles.projectHeader}>
                <View style={styles.iconBox}>
                  {proyecto.foto_url ? (
                    <Image
                      source={{ uri: proyecto.foto_url }}
                      style={{ width: '100%', height: '100%', borderRadius: 15 }}
                    />
                  ) : (
                    <Feather name="briefcase" size={24} color="#2563EB" />
                  )}
                </View>

                <View style={styles.projectInfo}>
                  <Text style={styles.projectName}>
                    {proyecto.name}
                    {proyecto.status === 'finalizada' && <Text style={{color: '#059669', fontSize: 12}}> (Finalizada)</Text>}
                  </Text>
                  <Text style={styles.projectLocation}>
                    <Feather name="map-pin" size={12} /> {proyecto.location}
                  </Text>
                </View>
              </View>

              <View style={styles.projectFooter}>
                <View style={styles.roleBadge}>
                  <Text style={styles.roleText}>{proyecto.userRole}</Text>
                </View>

                <TouchableOpacity 
                  style={styles.entrarBtn} 
                  onPress={(e) => {
                    e.stopPropagation(); 
                    seleccionarProyecto(proyecto.id, proyecto.name, proyecto.userRole);
                  }}
                >
                  <Text style={styles.entrarBtnText}>Entrar</Text>
                  <Feather name="arrow-right" size={16} color="#FFF" />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <View style={styles.fabContainer}>
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: isOffline ? '#9CA3AF' : '#059669', marginBottom: profile?.role === 'admin' ? 15 : 0 }]}
          onPress={() => isOffline ? Aviso.alert("Modo Offline", "Conéctate a internet para unirte a una obra.") : setIsJoinModalVisible(true)}
        >
          <Feather name="camera" size={24} color="#FFF" />
        </TouchableOpacity>
        {profile?.role === 'admin' && (
          <TouchableOpacity
            style={[styles.fab, { backgroundColor: isOffline ? '#9CA3AF' : '#2563EB' }]}
            onPress={() => isOffline ? Aviso.alert("Modo Offline", "Conéctate a internet para crear obras.") : iniciarCreacion()}
          >
            <Feather name="plus" size={28} color="#FFF" />
          </TouchableOpacity>
        )}
      </View>

      {/* ==============================================
          🟢 MODAL 1: CREAR / EDITAR OBRA
      ================================================ */}
      <Modal visible={isModalVisible} animationType="slide" transparent={true} onRequestClose={() => setIsModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setIsModalVisible(false)} />
          <View style={[styles.modalContent, { maxHeight: '85%', paddingBottom: 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{modalMode === 'edit' ? 'Editar Obra' : 'Nueva Obra'}</Text>
              <TouchableOpacity onPress={() => setIsModalVisible(false)}>
                <Feather name="chevron-down" size={28} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              <Text style={styles.modalLabel}>Fotografía / Fachada de Obra</Text>
              <TouchableOpacity
                onPress={seleccionarFotoObra}
                style={{ height: 120, backgroundColor: '#F9FAFB', borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#E5E7EB', borderStyle: 'dashed' }}
              >
                {fotoObra ? (
                  <>
                    <Image source={{ uri: fotoObra }} style={{ width: '100%', height: '100%' }} />
                    <View style={{ position: 'absolute', backgroundColor: 'rgba(0,0,0,0.5)', bottom: 0, width: '100%', padding: 5, alignItems: 'center' }}>
                      <Text style={{ color: '#FFF', fontSize: 12, fontWeight: 'bold' }}>Cambiar Foto</Text>
                    </View>
                  </>
                ) : (
                  <>
                    <Feather name="camera" size={32} color="#9CA3AF" />
                    <Text style={{ color: '#6B7280', marginTop: 8, fontSize: 13 }}>Añadir foto (Opcional)</Text>
                  </>
                )}
              </TouchableOpacity>

              <Text style={styles.modalLabel}>Nombre del Proyecto</Text>
              <TextInput style={styles.modalInput} placeholder="Ej. Torre Mayor" placeholderTextColor="#9CA3AF" value={newProjectName} onChangeText={setNewProjectName} />

              <Text style={styles.modalLabel}>Cliente</Text>
              <TextInput style={styles.modalInput} placeholder="Ej. Constructora Sur S.A." placeholderTextColor="#9CA3AF" value={clientName} onChangeText={setClientName} />

              <Text style={styles.modalLabel}>Número de Contrato</Text>
              <TextInput style={styles.modalInput} placeholder="Ej. CTR-2026-001" placeholderTextColor="#94A3B8" value={contractNumber} onChangeText={setContractNumber} />

              {modalMode === 'edit' && (
                <View style={{ marginTop: 6, marginBottom: 10, zIndex: isResidentDropdownOpen ? 1000 : 1, elevation: isResidentDropdownOpen ? 20 : 0 }}>
                  <Text style={styles.modalLabel}>Residentes de la obra</Text>

                  {residentesAsignados.length === 0 ? (
                    <Text style={{ fontSize: 12, color: '#94A3B8', marginBottom: 8 }}>
                      Esta obra todavía no tiene residentes asignados.
                    </Text>
                  ) : (
                    residentesAsignados.map((res) => (
                      <View key={res.id} style={estilosResidentes.renglon}>
                        <Feather name="user" size={16} color="#2563EB" />
                        <Text style={estilosResidentes.nombre} numberOfLines={1}>{res.full_name}</Text>
                        <TouchableOpacity onPress={() => quitarResidente(res)} style={estilosResidentes.quitar}>
                          <Feather name="x" size={16} color="#DC2626" />
                        </TouchableOpacity>
                      </View>
                    ))
                  )}

                  {/* Solo se ofrecen los que todavía no están en la obra */}
                  {listaResidentes.filter((r) => !residentesAsignados.some((a) => a.id === r.id)).length === 0 ? (
                    <Text style={{ fontSize: 12, color: '#94A3B8' }}>
                      {listaResidentes.length === 0
                        ? 'No hay residentes dados de alta. Créalos en Control de Personal.'
                        : 'Todos los residentes ya están asignados a esta obra.'}
                    </Text>
                  ) : (
                    <View style={{ zIndex: isResidentDropdownOpen ? 1000 : 1, elevation: isResidentDropdownOpen ? 20 : 0 }}>
                      <TouchableOpacity
                        style={estilosResidentes.botonAgregar}
                        onPress={() => setIsResidentDropdownOpen(!isResidentDropdownOpen)}
                        disabled={guardandoResidente}
                      >
                        {guardandoResidente ? (
                          <ActivityIndicator size="small" color="#2563EB" />
                        ) : (
                          <>
                            <Feather name="plus-circle" size={16} color="#2563EB" />
                            <Text style={estilosResidentes.textoAgregar}>Añadir otro residente</Text>
                          </>
                        )}
                      </TouchableOpacity>

                      {isResidentDropdownOpen && (
                        <View style={styles.dropdownMenu}>
                          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                            {listaResidentes
                              .filter((r) => !residentesAsignados.some((a) => a.id === r.id))
                              .map((res) => (
                                <TouchableOpacity
                                  key={res.id}
                                  style={styles.dropdownItem}
                                  onPress={() => agregarResidente(res.id)}
                                >
                                  <Text style={{ color: '#111827', fontSize: 15 }}>{res.full_name}</Text>
                                </TouchableOpacity>
                              ))}
                          </ScrollView>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              )}

              {modalMode === 'create' && (
                <>
                  <Text style={styles.modalLabel}>Asignar residentes (puedes elegir varios)</Text>
                  <View style={{ zIndex: isResidentDropdownOpen ? 1000 : 1, elevation: isResidentDropdownOpen ? 20 : 0, marginBottom: 5 }}>
                    <TouchableOpacity
                      style={[styles.modalInput, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
                      onPress={() => setIsResidentDropdownOpen(!isResidentDropdownOpen)}
                      activeOpacity={0.7}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                        <Feather name="user" size={18} color="#2563EB" style={{ marginRight: 10 }} />
                        <Text style={{ color: residentesNuevos.length > 0 ? '#111827' : '#9CA3AF', fontSize: 15, flex: 1 }} numberOfLines={1}>
                          {residentesNuevos.length === 0
                            ? 'Seleccionar residentes de la lista...'
                            : residentesNuevos.length === 1
                              ? listaResidentes.find((r) => r.id === residentesNuevos[0])?.full_name
                              : `${residentesNuevos.length} residentes seleccionados`}
                        </Text>
                      </View>
                      <Feather name={isResidentDropdownOpen ? "chevron-up" : "chevron-down"} size={20} color="#6B7280" />
                    </TouchableOpacity>

                    {isResidentDropdownOpen && (
                      <View style={styles.dropdownMenu}>
                        <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                        <TouchableOpacity
                          style={[styles.dropdownItem, residentesNuevos.length === 0 && styles.dropdownItemActive]}
                          onPress={() => { setResidentesNuevos([]); setIsResidentDropdownOpen(false); }}
                        >
                          <View style={styles.dropdownIconWrapper}><Feather name="slash" size={16} color="#6B7280" /></View>
                          <Text style={[styles.dropdownItemText, residentesNuevos.length === 0 && { color: '#2563EB', fontWeight: 'bold' }]}>Sin asignar (Por ahora)</Text>
                        </TouchableOpacity>

                        {listaResidentes.map((res) => (
                          <TouchableOpacity
                            key={res.id}
                            style={[styles.dropdownItem, residentesNuevos.includes(res.id) && styles.dropdownItemActive]}
                            onPress={() =>
                              // No se cierra la lista: así se pueden marcar varios seguidos.
                              setResidentesNuevos((previos) =>
                                previos.includes(res.id) ? previos.filter((id) => id !== res.id) : [...previos, res.id]
                              )
                            }
                          >
                            <View style={styles.dropdownIconWrapper}>
                              <Feather name={residentesNuevos.includes(res.id) ? 'check-square' : 'square'} size={16} color="#2563EB" />
                            </View>
                            <Text style={[styles.dropdownItemText, residentesNuevos.includes(res.id) && { color: '#2563EB', fontWeight: 'bold' }]}>{res.full_name}</Text>
                          </TouchableOpacity>
                        ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>
                </>
              )}
              <Text style={styles.modalLabel}>Ubicación</Text>
              <View style={styles.locationContainer}>
                <TextInput
                  style={[styles.modalInput, { flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRightWidth: 0 }]}
                  placeholder="Ej. Av. Reforma 123 o usa GPS 👉"
                  placeholderTextColor="#9CA3AF"
                  value={newProjectLocation}
                  onChangeText={setNewProjectLocation}
                  multiline
                />
                <TouchableOpacity style={styles.gpsButton} onPress={obtenerUbicacionActual} disabled={isGettingLocation}>
                  {isGettingLocation ? <ActivityIndicator size="small" color="#FFF" /> : <Feather name="navigation" size={20} color="#FFF" />}
                </TouchableOpacity>
              </View>

              <Text style={styles.modalLabel}>Fecha de Inicio (Opcional)</Text>
              <TouchableOpacity
                style={[styles.modalInput, { flexDirection: 'row', alignItems: 'center' }]}
                onPress={() => setShowDatePicker(true)}
              >
                <Feather name="calendar" size={18} color="#9CA3AF" style={{ marginRight: 10 }} />
                <Text style={{ color: dateSelected ? '#111827' : '#9CA3AF', fontSize: 15 }}>
                  {dateSelected ? startDate.toLocaleDateString('es-MX') : "Toca para seleccionar fecha"}
                </Text>
              </TouchableOpacity>

              {showDatePicker && (
                <DateTimePicker value={startDate} mode="date" display="default" onChange={(e, d) => { setShowDatePicker(false); if(d){ setStartDate(d); setDateSelected(true); } }} />
              )}

              <Text style={styles.modalLabel}>Fecha de Entrega (Opcional)</Text>
              <TouchableOpacity
                style={[styles.modalInput, { flexDirection: 'row', alignItems: 'center' }]}
                onPress={() => setShowEndDatePicker(true)}
              >
                <Feather name="flag" size={18} color="#9CA3AF" style={{ marginRight: 10 }} />
                <Text style={{ color: endDateSelected ? '#111827' : '#9CA3AF', fontSize: 15 }}>
                  {endDateSelected ? endDate.toLocaleDateString('es-MX') : "Toca para seleccionar fecha"}
                </Text>
              </TouchableOpacity>

              {showEndDatePicker && (
                <DateTimePicker value={endDate} mode="date" display="default" onChange={(e, d) => { setShowEndDatePicker(false); if(d){ setEndDate(d); setEndDateSelected(true); } }} />
              )}

              <TouchableOpacity style={styles.modalButton} onPress={handleSaveProject} disabled={isSaving}>
                {isSaving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.modalButtonText}>{modalMode === 'edit' ? 'Guardar Cambios' : 'Crear Obra'}</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ==============================================
          🟢 MODAL 2: UNIRSE A OBRA
      ================================================ */}
      <Modal visible={isJoinModalVisible} animationType="slide" transparent={true} onRequestClose={() => { setIsJoinModalVisible(false); setIsScanning(false); }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => { setIsJoinModalVisible(false); setIsScanning(false); }} />
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Unirse a una Obra</Text>
              <TouchableOpacity onPress={() => { setIsJoinModalVisible(false); setIsScanning(false); }}>
                <Feather name="chevron-down" size={28} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {isScanning ? (
              <View style={styles.scannerContainer}>
                <CameraView
                  style={StyleSheet.absoluteFillObject}
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={({ data }) => {
                    if (!isJoining) {
                      setInviteCode(data);
                      setIsScanning(false);
                      handleUnirseObra(data);
                    }
                  }}
                />
                <View style={styles.scannerOverlay}>
                  <Text style={styles.scannerText}>Apunta al código QR</Text>
                  <TouchableOpacity style={styles.cancelScanBtn} onPress={() => setIsScanning(false)}>
                    <Text style={styles.cancelScanText}>Cancelar Escaneo</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                <Text style={styles.modalSubtitle}>Pídele al administrador el código de la obra o escanea su QR.</Text>

                <TouchableOpacity style={styles.scanHugeBtn} onPress={startScanning}>
                  <Feather name="camera" size={32} color="#059669" />
                  <Text style={styles.scanHugeBtnText}>Escanear Código QR</Text>
                </TouchableOpacity>

                <View style={styles.dividerContainer}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>o ingresa el código manual</Text>
                  <View style={styles.dividerLine} />
                </View>

                <TextInput
                  style={[styles.modalInput, styles.codeInput]}
                  placeholder="Ej. A8X2L9"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="characters"
                  maxLength={6}
                  value={inviteCode}
                  onChangeText={setInviteCode}
                />

                <TouchableOpacity style={[styles.modalButton, { backgroundColor: '#2563EB' }]} onPress={() => handleUnirseObra(inviteCode)} disabled={isJoining}>
                  {isJoining ? <ActivityIndicator color="#FFF" /> : <Text style={styles.modalButtonText}>Unirme a la obra</Text>}
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ==============================================
          🟢 MODAL 3: VER DETALLES DE LA OBRA
      ================================================ */}
      <Modal visible={isDetalleVisible} animationType="slide" transparent={true} onRequestClose={() => setIsDetalleVisible(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setIsDetalleVisible(false)} />
          <View style={[styles.modalContent, { padding: 0, overflow: 'hidden', maxHeight: '85%' }]}>
            {obraSeleccionada?.foto_url ? (
              <Image source={{ uri: obraSeleccionada.foto_url }} style={styles.detalleImagen} />
            ) : (
              <View style={styles.detalleImagenPlaceholder}>
                <Feather name="briefcase" size={48} color="#2563EB" />
              </View>
            )}

            <TouchableOpacity style={styles.detalleCloseBtn} onPress={() => setIsDetalleVisible(false)}>
              <Feather name="chevron-down" size={24} color="#FFF" />
            </TouchableOpacity>

            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.detalleTitulo}>{obraSeleccionada?.name}</Text>
              
              <View style={styles.detalleRowInfo}>
                <Feather name="map-pin" size={16} color="#6B7280" />
                <Text style={styles.detalleTextoInfo}>{obraSeleccionada?.location}</Text>
              </View>

              {obraSeleccionada?.client_name && (
                <View style={styles.detalleRowInfo}>
                  <Feather name="user" size={16} color="#6B7280" />
                  <Text style={styles.detalleTextoInfo}><Text style={{fontWeight: 'bold'}}>Cliente:</Text> {obraSeleccionada.client_name}</Text>
                </View>
              )}

              {obraSeleccionada?.contract_number && (
                <View style={styles.detalleRowInfo}>
                  <Feather name="file-text" size={16} color="#6B7280" />
                  <Text style={styles.detalleTextoInfo}><Text style={{fontWeight: 'bold'}}>Contrato:</Text> {obraSeleccionada.contract_number}</Text>
                </View>
              )}

              {obraSeleccionada?.start_date && (
                <View style={styles.detalleRowInfo}>
                  <Feather name="calendar" size={16} color="#6B7280" />
                  <Text style={styles.detalleTextoInfo}>
                    <Text style={{fontWeight: 'bold'}}>Inicio:</Text> {new Date(obraSeleccionada.start_date).toLocaleDateString('es-MX')}
                  </Text>
                </View>
              )}

              {isAdmin && (
                <View style={styles.adminOpcionesContainer}>
                  <Text style={styles.adminOpcionesTitulo}>Opciones de Administrador</Text>
                  
                  <View style={styles.adminOpcionesBotones}>
                    <TouchableOpacity 
                      style={styles.btnEditarAdmin} 
                      onPress={() => { setIsDetalleVisible(false); iniciarEdicion(obraSeleccionada); }}
                    >
                      <Feather name="edit-2" size={18} color="#2563EB" />
                      <Text style={{ color: '#2563EB', marginLeft: 8, fontWeight: 'bold' }}>Editar</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={styles.btnEliminarAdmin} 
                      onPress={() => { setIsDetalleVisible(false); confirmarEliminar(obraSeleccionada); }}
                    >
                      <Feather name="trash-2" size={18} color="#EF4444" />
                    </TouchableOpacity>
                  </View>

                  {obraSeleccionada?.status !== 'finalizada' && (
                    <TouchableOpacity 
                      style={styles.btnFinalizarAdmin}
                      onPress={() => { setIsDetalleVisible(false); finalizarObra(obraSeleccionada); }}
                    >
                      <Feather name="check-circle" size={18} color="#FFF" />
                      <Text style={{ color: '#FFF', marginLeft: 8, fontWeight: 'bold' }}>Finalizar Obra</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>


      {/* CONFIRMACIÓN DE BORRADO: hay que escribir el nombre de la obra */}
      <Modal visible={!!obraAEliminar} transparent animationType="fade" onRequestClose={() => setObraAEliminar(null)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setObraAEliminar(null)} />
          <View style={[styles.modalContent, { padding: 22, maxHeight: '85%' }]}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#B91C1C' }}>Eliminar obra</Text>

              <Text style={{ fontSize: 13, color: '#334155', marginTop: 10, lineHeight: 19 }}>
                Se borrarán la bitácora, la nómina, los trabajadores, los planos, las herramientas,
                los ingresos y los gastos de esta obra. Antes de borrar se guarda un expediente con
                toda esa información, pero la obra no se puede recuperar.
              </Text>

              <Text style={{ fontSize: 13, color: '#334155', marginTop: 14 }}>
                Para confirmar, escribe el nombre de la obra:
              </Text>
              <Text selectable style={{ fontSize: 14, fontWeight: '800', color: '#0F172A', marginTop: 4 }}>
                {obraAEliminar?.name}
              </Text>

              <TextInput
                style={[styles.modalInput, { marginTop: 10, borderColor: nombreCoincide ? '#16A34A' : '#CBD5E1' }]}
                value={textoConfirmacion}
                onChangeText={setTextoConfirmacion}
                placeholder="Escribe el nombre aquí"
                placeholderTextColor="#94A3B8"
                autoCapitalize="characters"
              />

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: '#F1F5F9', padding: 14, borderRadius: 12, alignItems: 'center' }}
                  onPress={() => setObraAEliminar(null)}
                >
                  <Text style={{ color: '#334155', fontWeight: 'bold' }}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  disabled={!nombreCoincide || eliminando}
                  onPress={ejecutarEliminacion}
                  style={{
                    flex: 1,
                    backgroundColor: nombreCoincide ? '#DC2626' : '#FCA5A5',
                    padding: 14,
                    borderRadius: 12,
                    alignItems: 'center',
                  }}
                >
                  {eliminando ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Eliminar obra</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F8' },
  header: { backgroundColor: '#2563EB', paddingTop: 60, paddingBottom: 25, paddingHorizontal: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 },
  backButton: { padding: 4, marginLeft: -4 },
  headerBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: '#FFF', fontSize: 26, fontWeight: 'bold' },
  headerSmall: { color: 'rgba(255,255,255,0.9)', fontSize: 14, marginTop: 4 },
  logoutBtn: { padding: 10, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, justifyContent: 'center', alignItems: 'center', minWidth: 42 },

  body: { padding: 20, paddingBottom: 150 },
  emptyContainer: { alignItems: 'center', marginTop: 60, paddingHorizontal: 20 },
  emptyText: { color: '#6B7280', fontSize: 18, fontWeight: 'bold', marginTop: 15, textAlign: 'center' },
  emptySubText: { color: '#9CA3AF', fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20 },

  projectCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 20, marginBottom: 15, elevation: 3, boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',    },
  projectHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  iconBox: { width: 50, height: 50, backgroundColor: '#EFF6FF', borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  projectInfo: { flex: 1 },
  projectName: { fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 4 },
  projectLocation: { fontSize: 13, color: '#6B7280' },

  projectFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 15 },
  roleBadge: { backgroundColor: '#F0FDF4', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#BBF7D0' },
  roleText: { color: '#166534', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase' },

  entrarBtn: { backgroundColor: '#2563EB', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, gap: 6 },
  entrarBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 13 },

  fabContainer: { position: 'absolute', bottom: 30, right: 25, alignItems: 'center' },
  fab: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5, boxShadow: '0px 4px 5px rgba(0, 0, 0, 0.3)',    },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, paddingTop: 15 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', marginBottom: 15 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#111827' },
  modalSubtitle: { fontSize: 14, color: '#6B7280', marginBottom: 20 },
  modalLabel: { fontSize: 13, fontWeight: '600', color: '#4B5563', marginTop: 12, marginBottom: 6 },
  modalInput: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 15, fontSize: 15, color: '#111827' },

  locationContainer: { flexDirection: 'row', alignItems: 'stretch' },
  gpsButton: { backgroundColor: '#2563EB', paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center', borderTopRightRadius: 12, borderBottomRightRadius: 12 },

  modalButton: { backgroundColor: '#059669', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 25 },
  modalButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },

  scanHugeBtn: { flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0FDF4', borderWidth: 2, borderColor: '#34D399', borderStyle: 'dashed', borderRadius: 20, paddingVertical: 30, marginBottom: 20 },
  scanHugeBtnText: { color: '#059669', fontSize: 16, fontWeight: 'bold', marginTop: 10 },
  dividerContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  dividerText: { marginHorizontal: 15, color: '#9CA3AF', fontSize: 12, fontWeight: '600' },
  codeInput: { fontSize: 22, fontWeight: 'bold', textAlign: 'center', letterSpacing: 5 },

  scannerContainer: { width: '100%', height: 350, borderRadius: 20, overflow: 'hidden', backgroundColor: '#000' },
  scannerOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between', alignItems: 'center', paddingVertical: 20, backgroundColor: 'rgba(0,0,0,0.3)' },
  // Se queda con las props viejas a propósito: React Native ya pide usar
  // "textShadow", pero sus tipos de TypeScript todavía no lo aceptan. Cambiarlo
  // obligaría a desactivar la revisión de tipos de todo este bloque de estilos.
  scannerText: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginTop: 20, textShadowColor: 'rgba(0, 0, 0, 1)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 5 },
  cancelScanBtn: { backgroundColor: '#DC2626', paddingVertical: 12, paddingHorizontal: 25, borderRadius: 30 },
  cancelScanText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  adminUsuariosBtn: { backgroundColor: '#FFF', marginHorizontal: 20, marginTop: 15, marginBottom: 5, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', padding: 14, boxShadow: '0px 4px 6px rgba(0, 0, 0, 0.04)',     elevation: 2 },
  adminUsuariosInner: { flexDirection: 'row', alignItems: 'center' },
  adminIconContainer: { backgroundColor: '#EFF6FF', padding: 10, borderRadius: 12 },
  adminBtnTitle: { fontSize: 14, fontWeight: 'bold', color: '#0F172A' },
  adminBtnSubtitle: { fontSize: 11, color: '#64748B', marginTop: 2 },
  dropdownMenu: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, marginTop: 4, position: 'absolute', top: 52, left: 0, right: 0, zIndex: 1001, elevation: 21, boxShadow: '0px 4px 6px rgba(0, 0, 0, 0.1)', maxHeight: 180, overflow: 'hidden' },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 15, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  dropdownItemActive: { backgroundColor: '#EFF6FF' },
  dropdownIconWrapper: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  dropdownItemText: { marginLeft: 10, fontSize: 14, color: '#374151' },

  detalleImagen: { width: '100%', height: 220, backgroundColor: '#E5E7EB' },
  detalleImagenPlaceholder: { width: '100%', height: 200, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center' },
  detalleCloseBtn: { position: 'absolute', top: 15, right: 15, backgroundColor: 'rgba(0,0,0,0.4)', padding: 6, borderRadius: 20, zIndex: 10 },
  detalleTitulo: { fontSize: 24, fontWeight: 'bold', color: '#111827', marginBottom: 15 },
  detalleRowInfo: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, backgroundColor: '#F9FAFB', padding: 12, borderRadius: 10 },
  detalleTextoInfo: { fontSize: 14, color: '#374151', marginLeft: 10, flex: 1, lineHeight: 20 },
  
  adminOpcionesContainer: { marginTop: 25, paddingTop: 20, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  adminOpcionesTitulo: { fontSize: 14, fontWeight: 'bold', color: '#9CA3AF', marginBottom: 15, textTransform: 'uppercase', letterSpacing: 1 },
  adminOpcionesBotones: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  btnEditarAdmin: { flex: 1, flexDirection: 'row', backgroundColor: '#EFF6FF', padding: 14, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  btnEliminarAdmin: { backgroundColor: '#FEF2F2', padding: 14, borderRadius: 12, justifyContent: 'center', alignItems: 'center', width: 55 },
  btnFinalizarAdmin: { flexDirection: 'row', backgroundColor: '#059669', padding: 16, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 5 },
});

const estilosResidentes = StyleSheet.create({
  renglon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  nombre: { flex: 1, fontSize: 14, color: '#1E293B', fontWeight: '600' },
  quitar: { padding: 4 },
  botonAgregar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderStyle: 'dashed',
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    paddingVertical: 12,
  },
  textoAgregar: { color: '#2563EB', fontWeight: '700', fontSize: 13 },
});
