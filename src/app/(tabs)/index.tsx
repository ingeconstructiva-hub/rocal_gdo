import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage'; // <-- NUEVA MEMORIA
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { NotificationItem } from '../../components/NotificationItem';
import { Colors } from '../../constants/theme';
import { useProject } from '../../context/ProjectContext';
import { supabase } from '../../lib/supabase';

export default function DashboardScreen() {
  const [hasPendingItems, setHasPendingItems] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const checkOutbox = async () => {
        const logs = await AsyncStorage.getItem('@bandeja_salida_logs');
        const inv = await AsyncStorage.getItem('@bandeja_salida_inventario');
        setHasPendingItems(!!logs || !!inv);
      };
      checkOutbox();  
    }, [])
  );
  // EXTRAEMOS isOffline PARA DETENER LAS CONSULTAS SI NO HAY RED
  const { activeProject, isOffline } = useProject(); 

  const [project, setProject] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  
  const [userProfile, setUserProfile] = useState({
    name: "Cargando usuario...",
    role: "Residente de Obra"
  });

  const [isInviteModalVisible, setIsInviteModalVisible] = useState(false);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  
  const getFormattedDate = () => {
    const date = new Date();
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${days[date.getDay()]} ${date.getDate()} de ${months[date.getMonth()]}, ${date.getFullYear()}`;
  };

  const today = getFormattedDate();
  const router = useRouter();
  
  const getCategoryStyles = (category: string) => {
    switch (category) {
      case 'Estructura': return { icon: "layers", color: "#4F46E5", bg: "#E0E7FF" }; 
      case 'Concreto': return { icon: "box", color: "#059669", bg: "#D1FAE5" };   
      case 'Eléctrico': return { icon: "zap", color: "#D97706", bg: "#FEF3C7" };   
      case 'Seguridad': return { icon: "shield", color: "#DC2626", bg: "#FEE2E2" }; 
      case 'Acabados': return { icon: "brush", color: "#8B5CF6", bg: "#EDE9FE" };  
      default: return { icon: "book-open", color: "#2563EB", bg: "#E0F2FE" }; 
    }
  };

  useFocusEffect(
    useCallback(() => {
      async function loadData() {
        if (!activeProject?.id) return;
        
        const storageKey = `@dashboard_cache_${activeProject.id}`;

        // 🔴 SI NO HAY INTERNET, LEEMOS DEL DISCO DURO Y DETENEMOS LA FUNCIÓN
        if (isOffline) {
          try {
            const cachedData = await AsyncStorage.getItem(storageKey);
            if (cachedData) {
              const parsed = JSON.parse(cachedData);
              setProject(parsed.project);
              setUserProfile(parsed.profile);
              setNotifications(parsed.notifications);
            }
          } catch (e) {
            console.error("Error leyendo caché del dashboard", e);
          }
          return; // <-- ESTO EVITA LA PANTALLA ROJA
        }

        // 🟢 SI HAY INTERNET, DESCARGAMOS FRESCO DE SUPABASE
        try {
          const { data: projectData } = await supabase
            .from('projects')
            .select('id, name, location, start_date, end_date, invite_code') 
            .eq('id', activeProject.id)
            .single();
          
          if (projectData) setProject(projectData);

          let newProfile = { name: "Ingeniero", role: "Residente de Obra" };
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            const { data: profile } = await supabase.from('profiles').select('full_name, role').eq('id', session.user.id).single();
            if (profile) {
              newProfile = { name: profile.full_name, role: profile.role === 'admin' ? 'Administrador' : 'Ingeniero de Obra' };
              setUserProfile(newProfile);
            }
          }

          const { data: logsData } = await supabase.from('logs').select('*').eq('project_id', activeProject.id).order('created_at', { ascending: false }).limit(4);
          const { data: planosData } = await supabase.from('planos').select('*').eq('project_id', activeProject.id).order('created_at', { ascending: false }).limit(4);
          
          // (Aquí irían inventarioData y listaData si las necesitas, simplifiqué para que no choque)
          
          const todayDate = new Date();
          todayDate.setHours(0, 0, 0, 0);
          const yesterday = new Date(todayDate);
          yesterday.setDate(yesterday.getDate() - 1);

          const formatNotificationTime = (createdAt: string) => {
            if (!createdAt) return '--:--';
            const dateObj = new Date(createdAt);
            const dateOnly = new Date(dateObj);
            dateOnly.setHours(0, 0, 0, 0);
            const hours = String(dateObj.getHours()).padStart(2, '0');
            const minutes = String(dateObj.getMinutes()).padStart(2, '0');
            if (dateOnly.getTime() === todayDate.getTime()) return `Hoy ${hours}:${minutes}`;
            if (dateOnly.getTime() === yesterday.getTime()) return `Ayer ${hours}:${minutes}`;
            return `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')} ${hours}:${minutes}`;
          };

          const mappedLogs = (logsData || []).map((log: any) => {
            const styles = getCategoryStyles(log.category);
            return { icon: styles.icon, title: `[Bitácora] ${log.category}: ${log.description}`, time: formatNotificationTime(log.created_at), iconColor: styles.color, bgColor: styles.bg, timestamp: new Date(log.created_at).getTime() };
          });
          const mappedPlanos = (planosData || []).map((plano: any) => {
            return { icon: "folder-plus", title: `[Documentación] Nuevo: ${plano.title}`, time: formatNotificationTime(plano.created_at), iconColor: "#059669", bgColor: "#D1FAE5", timestamp: new Date(plano.created_at).getTime() };
          });

          const combinedNotifications = [...mappedLogs, ...mappedPlanos]
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 4); 

          setNotifications(combinedNotifications);

          // GUARDAMOS LA CACHÉ SILENCIOSA
          await AsyncStorage.setItem(storageKey, JSON.stringify({
            project: projectData,
            profile: newProfile,
            notifications: combinedNotifications
          }));

        } catch (err: any) {
          if (err.message !== 'Network request failed' && err.message !== 'Failed to fetch') {
            console.error("❌ Error en loadData:", err);
          }
        }
      }
      
      loadData();
    }, [activeProject, isOffline]) 
  );

  const handleOpenInviteModal = async () => {
    if (isOffline) {
      Alert.alert("Modo Offline", "Necesitas internet para generar invitaciones.");
      return;
    }
    const projectId = activeProject?.id;
    if (!projectId) return;

    setIsInviteModalVisible(true);
    if (project?.invite_code) return;

    setIsGeneratingCode(true);
    try {
      const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const { error } = await supabase.from('projects').update({ invite_code: newCode }).eq('id', projectId);
      if (error) throw error;
      setProject({ ...project, invite_code: newCode });
    } catch (error: any) {
      Alert.alert("Error", "No se pudo generar el código.");
    } finally {
      setIsGeneratingCode(false);
    }
  };

  const handleShareCode = async () => {
    if (!project?.invite_code) return;
    try {
      await Share.share({
        message: `🏗️ ¡Únete a mi equipo en la obra "${project.name}"!\n\nTu código de acceso es: *${project.invite_code}*\n\nAbre la aplicación, ve a "Mis Obras", toca el botón de "Unirse a Obra" y usa este código.`,
      });
    } catch (error: any) {}
  };

  const modules = [
    { name: "Bitácora", icon: "book-open", route: "/bitacora" }, 
    { name: "Asistencia", icon: "users", route: "/lista" },
    { name: "Gastos", icon: "dollar-sign", route: "/gastos" },
    { name: "Documentación", icon: "layers", route: "/planos" }, 
  ];

  return (
    <View style={{ flex: 1 }}>
      {hasPendingItems && !isOffline && (
      <View style={styles.syncBanner}>
        <Feather name="refresh-cw" size={14} color="#FFF" />
        <Text style={styles.syncText}>Sincronizando cambios...</Text>
      </View>
    )}
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <TouchableOpacity onPress={() => router.replace('/proyectos')} style={{ marginRight: 15 }}>
              <Feather name="arrow-left" size={28} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.date}>{today}</Text>
          </View>
          <Text style={styles.userName}>{userProfile.name}</Text>
          <Text style={styles.role}>{userProfile.role}</Text>
          
          <View style={styles.projectCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.projectTitle}>{project?.name || "Cargando proyecto..."}</Text>
                <Text style={styles.projectSub}>{project?.location || "Cargando ubicación..."}</Text>
              </View>
              <TouchableOpacity onPress={handleOpenInviteModal} style={[styles.inviteButton, isOffline && { opacity: 0.5 }]}>
                <Feather name="user-plus" size={16} color="#2563EB" />
                <Text style={styles.inviteButtonText}>Invitar</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.datesContainer}>
              <View style={styles.dateBadge}>
                <Feather name="calendar" size={12} color={Colors.primary} />
                <Text style={styles.dateText}>Inicio: {project?.start_date || "--/--/--"}</Text>
              </View>
              <View style={styles.dateBadge}>
                <Feather name="flag" size={12} color="#DC2626" />
                <Text style={[styles.dateText, { color: '#DC2626' }]}>Entrega: {project?.end_date || "--/--/--"}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <Text style={styles.sectionTitle}>Notificaciones Recientes</Text>
          <View style={{ marginBottom: 20 }}>
            {notifications.length > 0 ? notifications.map((n, i) => <NotificationItem key={i} {...n} />) : <Text style={styles.emptyText}>No hay notificaciones recientes.</Text>}
          </View>

          <Text style={styles.sectionTitle}>Módulos de Control</Text>
          <View style={styles.grid}>
            {modules.map((m, i) => (
              <TouchableOpacity key={i} style={styles.card} onPress={() => { if (m.route) router.push(m.route as any); }}>
                <Feather name={m.icon as any} size={28} color={Colors.primary} />
                <Text style={styles.cardText}>{m.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* MODAL DE INVITACIÓN */}
      <Modal visible={isInviteModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
              <Text style={styles.modalTitle}>Invitar al Equipo</Text>
              <TouchableOpacity onPress={() => setIsInviteModalVisible(false)}><Feather name="x" size={24} color="#6B7280" /></TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>Pide a tu compañero que escanee este QR desde su app.</Text>
            <View style={styles.qrContainer}>
              {isGeneratingCode ? <ActivityIndicator size="large" color="#2563EB" /> : project?.invite_code ? <QRCode value={project.invite_code} size={200} color="#111827" backgroundColor="#FFF" /> : <Text>Error</Text>}
            </View>
            <Text style={styles.orText}>o copia el código de acceso:</Text>
            <View style={styles.codeBox}><Text style={styles.codeText}>{project?.invite_code || "------"}</Text></View>
            {project?.invite_code && (
              <TouchableOpacity style={styles.shareButton} onPress={handleShareCode}>
                <Feather name="share-2" size={18} color="#FFF" />
                <Text style={styles.shareButtonText}>Enviar por mensaje</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { backgroundColor: Colors.primary, padding: 24, paddingTop: 60, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  date: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  userName: { color: '#FFF', fontSize: 22, fontWeight: 'bold' },
  role: { color: 'rgba(255,255,255,0.9)', fontSize: 14, marginBottom: 20 },
  projectCard: { backgroundColor: '#FFF', padding: 20, borderRadius: 20, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1 },
  projectTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.text },
  projectSub: { fontSize: 12, color: Colors.textSub, marginTop: 2 },
  inviteButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: '#BFDBFE' },
  inviteButtonText: { color: '#2563EB', fontSize: 12, fontWeight: 'bold', marginLeft: 4 },
  datesContainer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15, borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 10 },
  dateBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F9FA', padding: 6, borderRadius: 8 },
  dateText: { fontSize: 11, fontWeight: '600', color: '#666', marginLeft: 5 },
  body: { padding: 24 },
  emptyText: { color: Colors.textSub, fontSize: 13, marginBottom: 15 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: Colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 },
  card: { width: '47%', backgroundColor: '#FFF', padding: 20, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: '#EEE' },
  cardText: { marginTop: 10, fontWeight: '600', color: Colors.text },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', backgroundColor: '#FFF', borderRadius: 24, padding: 25, alignItems: 'center' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#111827' },
  modalSubtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginTop: 10, marginBottom: 25, paddingHorizontal: 10 },
  qrContainer: { padding: 15, backgroundColor: '#FFF', borderRadius: 16, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, marginBottom: 20 },
  orText: { fontSize: 14, color: '#9CA3AF', marginBottom: 10 },
  codeBox: { backgroundColor: '#F3F4F6', paddingVertical: 12, paddingHorizontal: 30, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', borderStyle: 'dashed' },
  codeText: { fontSize: 24, fontWeight: '900', color: '#111827', letterSpacing: 5 },
  shareButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2563EB', paddingVertical: 14, paddingHorizontal: 25, borderRadius: 14, marginTop: 25, width: '100%', justifyContent: 'center' },
  shareButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 15, marginLeft: 10 },
  syncBanner: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: '#059669',
    padding: 12,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
  },
  syncText: {
    color: '#FFF',
    fontWeight: 'bold',
    marginLeft: 8
  }
});
