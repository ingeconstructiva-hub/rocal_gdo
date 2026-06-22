import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { NotificationItem } from '../../components/NotificationItem';
import { Colors } from '../../constants/theme';
import { useProject } from '../../context/ProjectContext';
import { useUser } from '../../context/UserContext';
import { supabase } from '../../lib/supabase';

export default function DashboardScreen() {
  const router = useRouter();
  const { activeProject, isOffline } = useProject(); 
  const { profile } = useUser();

  const [hasPendingItems, setHasPendingItems] = useState(false);
  const [project, setProject] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  
  const [isInviteModalVisible, setIsInviteModalVisible] = useState(false);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);

  // 🟢 ESTADO PARA EL MODAL DEL PERFIL
  const [isProfileModalVisible, setIsProfileModalVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const checkOutbox = async () => {
        const logs = await AsyncStorage.getItem('@bandeja_salida_logs');
        const inv = await AsyncStorage.getItem('@bandeja_salida_caja');
        setHasPendingItems(!!logs || !!inv);
      };
      checkOutbox();  
    }, [])
  );

  const getAccessibleModules = () => {
    const allModules = [
      { name: "Asistencia", icon: "users", route: "/lista", roles: ['admin', 'residente'] },
      { name: "Bitácora", icon: "book-open", route: "/bitacora", roles: ['admin', 'residente'] },
      { name: "Documentos", icon: "layers", route: "/planos", roles: ['admin', 'residente', 'oficina'] },
      { name: "Gastos", icon: "dollar-sign", route: "/gastos", roles: ['admin', 'residente', 'oficina'] }
    ];
    return allModules.filter(m => m.roles.includes(profile?.role || 'residente'));
  };

  const modules = getAccessibleModules();
  
  useFocusEffect(
    useCallback(() => {
      async function loadData() {
        if (!activeProject?.id) return;
        const storageKey = `@dashboard_cache_${activeProject.id}`;

        if (isOffline) {
          try {
            const cachedData = await AsyncStorage.getItem(storageKey);
            if (cachedData) {
              const parsed = JSON.parse(cachedData);
              setProject(parsed.project);
              setNotifications(parsed.notifications);
            }
          } catch (e) { console.error("Error leyendo caché", e); }
          return; 
        }

        try {
          const { data: projectData } = await supabase
            .from('projects')
            .select('id, name, location, start_date, end_date, invite_code, client_name, contract_number') 
            .eq('id', activeProject.id)
            .single();
          
          if (projectData) setProject(projectData);

          const limit = 4; 
          const [ { data: logsData }, { data: cajaData } ] = await Promise.all([
            supabase.from('logs').select('category, description, created_at').eq('project_id', activeProject.id).order('created_at', { ascending: false }).limit(limit),
            supabase.from('caja_chica').select('concepto, monto, fecha').eq('project_id', activeProject.id).order('fecha', { ascending: false }).limit(limit)
          ]);

          const getCategoryStyles = (category: string) => {
            switch (category) {
              case 'Estructura': return { icon: "layers", color: "#4F46E5", bg: "#E0E7FF" }; 
              case 'Concreto': return { icon: "box", color: "#059669", bg: "#D1FAE5" };   
              case 'Eléctrico': return { icon: "zap", color: "#D97706", bg: "#FEF3C7" };   
              default: return { icon: "book-open", color: "#2563EB", bg: "#E0F2FE" }; 
            }
          };

          const mappedLogs = (logsData || []).map((log: any) => ({ icon: getCategoryStyles(log.category).icon, title: `[Bitácora] ${log.description}`, time: new Date(log.created_at).toLocaleDateString('es-MX'), iconColor: getCategoryStyles(log.category).color, bgColor: getCategoryStyles(log.category).bg, timestamp: new Date(log.created_at).getTime() }));
          const mappedCaja = (cajaData || []).map((gasto: any) => ({ icon: "shopping-cart", title: `[Gasto] ${gasto.concepto} ($${gasto.monto})`, time: new Date(gasto.fecha).toLocaleDateString('es-MX'), iconColor: "#DB2777", bgColor: "#FCE7F3", timestamp: new Date(gasto.fecha).getTime() }));

          const combinedNotifications = [...mappedLogs, ...mappedCaja].sort((a, b) => b.timestamp - a.timestamp).slice(0, 4); 

          setNotifications(combinedNotifications);
          await AsyncStorage.setItem(storageKey, JSON.stringify({ project: projectData, notifications: combinedNotifications }));

        } catch (err: any) {
          if (err.message !== 'Network request failed' && err.message !== 'Failed to fetch') console.error(err);
        }
      }
      loadData();
    }, [activeProject, isOffline]) 
  );

  const handleOpenInviteModal = async () => {
    if (isOffline) { Alert.alert("Modo Offline", "Necesitas internet para generar invitaciones."); return; }
    if (profile?.role !== 'admin' && profile?.role !== 'residente') {
      Alert.alert("Acceso Restringido", "Solo administradores y residentes pueden invitar personal.");
      return;
    }

    setIsInviteModalVisible(true);
    if (project?.invite_code) return;

    setIsGeneratingCode(true);
    try {
      const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const { error } = await supabase.from('projects').update({ invite_code: newCode }).eq('id', activeProject?.id);
      if (error) throw error;
      setProject({ ...project, invite_code: newCode });
    } catch (error: any) { Alert.alert("Error", "No se pudo generar el código."); } 
    finally { setIsGeneratingCode(false); }
  };

  const handleShareCode = async () => {
    if (!project?.invite_code) return;
    try {
      await Share.share({ message: `🏗️ ¡Únete a mi equipo en "${project.name}"!\n\nTu código de acceso es: *${project.invite_code}*\n\nAbre la aplicación, ve a "Mis Obras", toca "Unirse a Obra" y usa este código.`});
    } catch (error: any) {}
  };

  const today = new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <View style={{ flex: 1 }}>
      {hasPendingItems && !isOffline && (
        <View style={styles.syncBanner}>
          <Feather name="refresh-cw" size={14} color="#FFF" />
          <Text style={styles.syncText}>Sincronizando cambios pendientes...</Text>
        </View>
      )}

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15 }}>
            <TouchableOpacity onPress={() => router.replace('/proyectos')} style={{ marginRight: 15 }}>
              <Feather name="arrow-left" size={28} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.date}>{today.charAt(0).toUpperCase() + today.slice(1)}</Text>
          </View>
          
          {/* 🟢 NUEVA SECCIÓN DE PERFIL EN EL HEADER */}
          <TouchableOpacity 
            style={styles.profileRow} 
            activeOpacity={0.8}
            onPress={() => setIsProfileModalVisible(true)}
          >
            <View style={styles.avatarContainer}>
              {profile?.foto_ine_url ? (
                <Image source={{ uri: profile.foto_ine_url }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Feather name="user" size={24} color="#FFF" />
                </View>
              )}
            </View>
            <View style={{ flex: 1, marginLeft: 15 }}>
              <Text style={styles.userName} numberOfLines={1}>
                {profile?.full_name || profile?.name || "Cargando..."}
              </Text>
              <Text style={styles.role}>
                {profile?.role?.toUpperCase() || profile?.displayRole || "Cargando permisos..."}
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
          
          {/* TARJETA DEL PROYECTO */}
          <View style={styles.projectCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.projectTitle}>{project?.name || "Cargando proyecto..."}</Text>
                <Text style={styles.projectSub}><Feather name="map-pin" size={12} color={Colors.textSub} /> {project?.location || "Ubicación..."}</Text>

                {project?.client_name && (
                  <Text style={[styles.projectSub, { marginTop: 4 }]}><Feather name="user" size={12} color="#475569" /> Cliente: <Text style={{fontWeight: '600', color: '#1E293B'}}>{project.client_name}</Text></Text>
                )}
                {project?.contract_number && (
                  <Text style={styles.projectSub}><Feather name="file-text" size={12} color="#475569" /> Contrato: <Text style={{fontWeight: '600', color: '#1E293B'}}>{project.contract_number}</Text></Text>
                )}
              </View>
              
              <TouchableOpacity onPress={handleOpenInviteModal} style={[styles.inviteButton, (profile?.role === 'oficina' || isOffline) && { opacity: 0.5 }]}>
                <Feather name="user-plus" size={16} color="#2563EB" />
                <Text style={styles.inviteButtonText}>Invitar</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.datesContainer}>
              <View style={styles.dateBadge}><Feather name="calendar" size={12} color={Colors.primary} /><Text style={styles.dateText}>Inicio: {project?.start_date || "--/--/--"}</Text></View>
              <View style={styles.dateBadge}><Feather name="flag" size={12} color="#DC2626" /><Text style={[styles.dateText, { color: '#DC2626' }]}>Entrega: {project?.end_date || "--/--/--"}</Text></View>
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <Text style={styles.sectionTitle}>Notificaciones Recientes</Text>
          <View style={{ marginBottom: 20 }}>
            {notifications.length > 0 ? notifications.map((n, i) => <NotificationItem key={i} {...n} />) : <Text style={styles.emptyText}>No hay notificaciones recientes.</Text>}
          </View>

          <Text style={styles.sectionTitle}>Módulos Operativos</Text>
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
                <Text style={styles.shareButtonText}>Enviar por WhatsApp</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* 🟢 MODAL DE PERFIL DIGITAL */}
      <Modal visible={isProfileModalVisible} animationType="slide" transparent={true}>
        <View style={styles.profileModalOverlay}>
          <View style={styles.profileModalContent}>
            <View style={styles.profileModalHeader}>
              <Text style={styles.profileModalTitle}>Mi Perfil Digital</Text>
              <TouchableOpacity onPress={() => setIsProfileModalVisible(false)} style={{ padding: 5 }}>
                <Feather name="x" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 20 }} showsVerticalScrollIndicator={false}>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Especialidad / Cargo</Text>
                <Text style={styles.detailValue}>{profile?.carrera_especialidad || 'No definida'}</Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Teléfono</Text>
                <Text style={styles.detailValue}>{profile?.telefono || 'No registrado'}</Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Dirección</Text>
                <Text style={styles.detailValue}>{profile?.direccion || 'No registrada'}</Text>
              </View>
              
              <Text style={[styles.detailLabel, { marginTop: 20 }]}>Identificación Oficial</Text>
              {profile?.foto_ine_url ? (
                <Image source={{ uri: profile.foto_ine_url }} style={styles.ineImage} />
              ) : (
                <View style={styles.noIneBox}>
                  <Feather name="image" size={24} color="#94A3B8" />
                  <Text style={{ color: '#94A3B8', marginTop: 10, fontWeight: '600' }}>INE no disponible para visualización</Text>
                </View>
              )}
            </ScrollView>
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
  
  // 🟢 ESTILOS DE LA NUEVA FILA DE PERFIL EN EL HEADER
  profileRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 25 },
  avatarContainer: {
    width: 56, height: 56, borderRadius: 28, 
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center', 
    borderWidth: 2, borderColor: '#FFF', overflow: 'hidden'
  },
  avatar: { width: '100%', height: '100%' },
  avatarPlaceholder: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  userName: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  role: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 2, fontWeight: '500' },
  
  projectCard: { backgroundColor: '#FFF', padding: 20, borderRadius: 20, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1 },
  projectTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.text, marginBottom: 4 },
  projectSub: { fontSize: 12, color: Colors.textSub, marginTop: 2 },
  inviteButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: '#BFDBFE' },
  inviteButtonText: { color: '#2563EB', fontSize: 12, fontWeight: 'bold', marginLeft: 6 },
  datesContainer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15, borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 15 },
  dateBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 6, borderRadius: 8 },
  dateText: { fontSize: 11, fontWeight: '600', color: '#64748B', marginLeft: 5 },
  body: { padding: 24 },
  emptyText: { color: Colors.textSub, fontSize: 13, marginBottom: 15 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: Colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', gap: 12 },
  card: { width: '48%', backgroundColor: '#FFF', padding: 20, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9', elevation: 1 },
  cardText: { marginTop: 10, fontWeight: '600', color: Colors.text, fontSize: 13, textAlign: 'center' },
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
  syncBanner: { position: 'absolute', bottom: 20, left: 20, right: 20, backgroundColor: '#059669', padding: 12, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', elevation: 5, zIndex: 100 },
  syncText: { color: '#FFF', fontWeight: 'bold', marginLeft: 8 },

  // 🟢 ESTILOS DEL MODAL DE PERFIL
  profileModalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.7)', justifyContent: 'flex-end' },
  profileModalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 25, borderTopRightRadius: 25, height: '85%' },
  profileModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  profileModalTitle: { fontSize: 18, fontWeight: 'bold', color: '#0F172A' },
  detailItem: { marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#F8FAFC', paddingBottom: 10 },
  detailLabel: { fontSize: 11, fontWeight: 'bold', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 4 },
  detailValue: { fontSize: 15, color: '#1E293B', fontWeight: '600' },
  ineImage: { width: '100%', height: 220, borderRadius: 12, marginTop: 10, resizeMode: 'cover', backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  noIneBox: { height: 120, backgroundColor: '#F8FAFC', borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: '#E2E8F0', borderStyle: 'dashed' },
});