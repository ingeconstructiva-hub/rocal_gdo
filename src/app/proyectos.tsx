import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useProject } from '../context/ProjectContext';
import { useUser } from '../context/UserContext'; // 🧠 Importamos el motor de roles
import { supabase } from '../lib/supabase';

export default function ProyectosScreen() {
  const router = useRouter();
  const { setActiveProject, isOffline } = useProject(); 
  const { profile, isLoadingUser } = useUser(); // 🧠 Extraemos el perfil

  const [proyectos, setProyectos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // ESTADOS PARA CREAR OBRA
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectLocation, setNewProjectLocation] = useState('');
  const [clientName, setClientName] = useState('');
  const [contractNumber, setContractNumber] = useState('');

  const [startDate, setStartDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateSelected, setDateSelected] = useState(false);

  const [endDate, setEndDate] = useState(new Date());
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [endDateSelected, setEndDateSelected] = useState(false);

  const [isGettingLocation, setIsGettingLocation] = useState(false); 

  // ESTADOS PARA UNIRSE A OBRA
  const [isJoinModalVisible, setIsJoinModalVisible] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    cargarProyectos();
  }, [isOffline]);

  const cargarProyectos = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.replace('/login');
        return;
      }
      setUserId(session.user.id);
      
      const storageKey = `@proyectos_cache_${session.user.id}`;

      if (isOffline) {
        const cachedData = await AsyncStorage.getItem(storageKey);
        if (cachedData) {
          setProyectos(JSON.parse(cachedData));
        } else {
          setProyectos([]);
        }
      } else {
        const { data, error } = await supabase
          .from('user_projects')
          .select(`
            role,
            projects (id, name, location, start_date, end_date)
          `)
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;

        if (data) {
          const proyectosFormateados = data.map((item: any) => ({
            ...item.projects,
            userRole: item.role
          }));
          setProyectos(proyectosFormateados);
          await AsyncStorage.setItem(storageKey, JSON.stringify(proyectosFormateados));
        }
      }
    } catch (error: any) {
      if (error.message !== 'Network request failed' && error.message !== 'Failed to fetch') {
        Alert.alert("Error", error.message);
      }
    } finally {
      setLoading(false);
    }
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
        Alert.alert('Permiso denegado', 'No hay problema, puedes escribir la ubicación a mano.');
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
        Alert.alert('Dirección no encontrada', 'Estamos en una zona sin registro.');
      }
    } catch (error) {
      Alert.alert('Error de GPS', 'No pudimos obtener tu ubicación actual.');
    } finally {
      setIsGettingLocation(false);
    }
  };

  const handleCrearObra = async () => {
    if (isOffline) {
      Alert.alert("Modo Offline", "Necesitas conexión a internet para crear un proyecto nuevo.");
      return;
    }

    if (!newProjectName.trim() || !newProjectLocation.trim()) {
      Alert.alert("Campos incompletos", "Por favor ingresa el nombre y la ubicación de la obra.");
      return;
    }

    if (!userId) return;

    setIsSaving(true);
    try {
      const formattedStartDate = dateSelected ? startDate.toISOString().split('T')[0] : null;
      const formattedEndDate = endDateSelected ? endDate.toISOString().split('T')[0] : null;

      const { data: newProject, error: projectError } = await supabase
        .from('projects')
        .insert([{ 
          name: newProjectName, 
          location: newProjectLocation,
          start_date: formattedStartDate,
          end_date: formattedEndDate,
          client_name: clientName.trim() || null,
          contract_number: contractNumber.trim() || null
        }])
        .select()
        .single();

      if (projectError) throw projectError;

      // Al creador le asignamos rol de Administrador automáticamente en esa obra
      const { error: assignmentError } = await supabase
        .from('user_projects')
        .insert([{ user_id: userId, project_id: newProject.id, role: 'Administrador' }]);

      if (assignmentError) throw assignmentError;

      // Limpiar Formulario
      setNewProjectName('');
      setNewProjectLocation('');
      setClientName('');
      setContractNumber('');
      setDateSelected(false);
      setStartDate(new Date());
      setEndDateSelected(false);
      setEndDate(new Date());
      
      setIsModalVisible(false);
      cargarProyectos(); 
      Alert.alert("¡Éxito!", "La obra se ha creado correctamente.");

    } catch (error: any) {
      Alert.alert("Error al crear obra", error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUnirseObra = async (codeToUse: string) => {
    if (isOffline) {
      Alert.alert("Modo Offline", "Necesitas conexión a internet para unirte a un proyecto.");
      return;
    }

    const finalCode = codeToUse.trim().toUpperCase();
    if (!finalCode) {
      Alert.alert("Código vacío", "Por favor ingresa un código válido.");
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
        Alert.alert("Código inválido", "No se encontró ninguna obra con este código. Verifica que esté bien escrito.");
        setIsJoining(false);
        return;
      }

      // 🧠 Asignación de rol por defecto al unirse (Será el de su Perfil de Supabase)
      let roleToAssign = 'Residente de Obra';
      if (profile?.role === 'oficina') roleToAssign = 'Personal de Oficina';
      else if (profile?.role === 'admin') roleToAssign = 'Administrador';

      const { error: joinErr } = await supabase
        .from('user_projects')
        .insert([{
          user_id: userId,
          project_id: proj.id,
          role: roleToAssign 
        }]);

      if (joinErr) {
        if (joinErr.code === '23505') { 
           Alert.alert("Aviso", "Ya eres parte de esta obra.");
        } else {
           throw joinErr;
        }
      } else {
        Alert.alert("¡Éxito!", `Te has unido a la obra: ${proj.name}`);
        setInviteCode('');
        setIsJoinModalVisible(false);
        setIsScanning(false);
        cargarProyectos(); 
      }

    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setIsJoining(false);
    }
  };

  const startScanning = async () => {
    if (!permission?.granted) {
      const response = await requestPermission();
      if (!response.granted) {
        Alert.alert("Permiso denegado", "Necesitamos acceso a la cámara para escanear el QR.");
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
        <View style={styles.headerTopRow}>
        </View>
        <View style={styles.headerBottomRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Mis Obras</Text>
            {/* Pintamos el nombre real directo del contexto global */}
            <Text style={styles.headerSmall}>{profile?.name || 'Cargando...'}</Text>
          </View>
          <TouchableOpacity onPress={cerrarSesion} style={styles.logoutBtn}>
            <Feather name="log-out" size={20} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 50 }} />
        ) : proyectos.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Feather name="folder-minus" size={48} color="#9CA3AF" />
            <Text style={styles.emptyText}>No tienes obras asignadas aún.</Text>
            <Text style={styles.emptySubText}>
              {profile?.role === 'admin' 
                ? 'Toca el botón "+" para crear tu primera obra.' 
                : 'Pídele al administrador el código QR para unirte a una obra.'}
            </Text>
          </View>
        ) : (
          proyectos.map((proyecto) => (
            <TouchableOpacity key={proyecto.id} style={styles.projectCard} onPress={() => seleccionarProyecto(proyecto.id, proyecto.name, proyecto.userRole)}>
              <View style={styles.projectHeader}>
                <View style={styles.iconBox}>
                  <Feather name="briefcase" size={24} color="#2563EB" />
                </View>
                <View style={styles.projectInfo}>
                  <Text style={styles.projectName}>{proyecto.name}</Text>
                  <Text style={styles.projectLocation}>
                    <Feather name="map-pin" size={12} /> {proyecto.location}
                  </Text>
                </View>
              </View>
              <View style={styles.projectFooter}>
                <View style={styles.roleBadge}>
                  <Text style={styles.roleText}>{proyecto.userRole}</Text>
                </View>
                <Feather name="chevron-right" size={20} color="#9CA3AF" />
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* BOTONES FLOTANTES - BLINDADOS POR ROLES */}
      <View style={styles.fabContainer}>
        <TouchableOpacity 
          style={[styles.fab, { backgroundColor: isOffline ? '#9CA3AF' : '#059669', marginBottom: profile?.role === 'admin' ? 15 : 0 }]} 
          onPress={() => isOffline ? Alert.alert("Modo Offline", "Conéctate a internet para unirte a una obra.") : setIsJoinModalVisible(true)}
        >
          <Feather name="camera" size={24} color="#FFF" />
        </TouchableOpacity>
        
        {/* 🔒 Este botón solo lo verá el Administrador */}
        {profile?.role === 'admin' && (
          <TouchableOpacity 
            style={[styles.fab, { backgroundColor: isOffline ? '#9CA3AF' : '#2563EB' }]} 
            onPress={() => isOffline ? Alert.alert("Modo Offline", "Conéctate a internet para crear obras.") : setIsModalVisible(true)}
          >
            <Feather name="plus" size={28} color="#FFF" />
          </TouchableOpacity>
        )}
      </View>

      {/* MODAL 1: CREAR OBRA */}
      <Modal visible={isModalVisible} animationType="fade" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={{flexGrow: 1, justifyContent: 'flex-end'}}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Nueva Obra</Text>
                <TouchableOpacity onPress={() => setIsModalVisible(false)}>
                  <Feather name="x" size={24} color="#6B7280" />
                </TouchableOpacity>
              </View>

              <Text style={styles.modalLabel}>Nombre del Proyecto</Text>
              <TextInput style={styles.modalInput} placeholder="Ej. Torre Mayor" placeholderTextColor="#9CA3AF" value={newProjectName} onChangeText={setNewProjectName} />

              <Text style={styles.modalLabel}>Cliente</Text>
              <TextInput style={styles.modalInput} placeholder="Ej. Constructora Sur S.A." placeholderTextColor="#9CA3AF" value={clientName} onChangeText={setClientName} />

              <Text style={styles.modalLabel}>Número de Contrato</Text>
              <TextInput style={styles.modalInput} placeholder="Ej. CTR-2026-001" placeholderTextColor="#9CA3AF" value={contractNumber} onChangeText={setContractNumber} />

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

              <TouchableOpacity style={styles.modalButton} onPress={handleCrearObra} disabled={isSaving}>
                {isSaving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.modalButtonText}>Crear Obra</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL 2: UNIRSE A OBRA */}
      <Modal visible={isJoinModalVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Unirse a una Obra</Text>
              <TouchableOpacity onPress={() => { setIsJoinModalVisible(false); setIsScanning(false); }}>
                <Feather name="x" size={24} color="#6B7280" />
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
              <>
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
              </>
            )}
          </View>
        </KeyboardAvoidingView>
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
  logoutBtn: { padding: 10, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12 },
  
  body: { padding: 20, paddingBottom: 150 },
  emptyContainer: { alignItems: 'center', marginTop: 60, paddingHorizontal: 20 },
  emptyText: { color: '#6B7280', fontSize: 18, fontWeight: 'bold', marginTop: 15, textAlign: 'center' },
  emptySubText: { color: '#9CA3AF', fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20 },
  
  projectCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 20, marginBottom: 15, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
  projectHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  iconBox: { width: 50, height: 50, backgroundColor: '#EFF6FF', borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  projectInfo: { flex: 1 },
  projectName: { fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 4 },
  projectLocation: { fontSize: 13, color: '#6B7280' },
  
  projectFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 15 },
  roleBadge: { backgroundColor: '#F0FDF4', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#BBF7D0' },
  roleText: { color: '#166534', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase' },

  fabContainer: { position: 'absolute', bottom: 30, right: 25, alignItems: 'center' },
  fab: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
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
  scannerText: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginTop: 20, textShadowColor: '#000', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 5 },
  cancelScanBtn: { backgroundColor: '#DC2626', paddingVertical: 12, paddingHorizontal: 25, borderRadius: 30 },
  cancelScanText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 }
});