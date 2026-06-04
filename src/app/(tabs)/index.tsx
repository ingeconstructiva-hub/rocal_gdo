import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NotificationItem } from '../../components/NotificationItem';
import { Colors } from '../../constants/theme';
import { supabase } from '../../lib/supabase';

export default function DashboardScreen() {
  const [project, setProject] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  
  const [userProfile, setUserProfile] = useState({
    name: "Cargando usuario...",
    role: "Residente de Obra"
  });
  
  const getFormattedDate = () => {
    const date = new Date();
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

    const dayName = days[date.getDay()];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();

    return `${dayName} ${day} de ${month}, ${year}`;
  };

  const today = getFormattedDate();
  const router = useRouter();
  
  const getCategoryStyles = (category: string) => {
    switch (category) {
      case 'Estructura':
        return { icon: "layers", color: "#4F46E5", bg: "#E0E7FF" }; 
      case 'Concreto':
        return { icon: "box", color: "#059669", bg: "#D1FAE5" };   
      case 'Eléctrico':
        return { icon: "zap", color: "#D97706", bg: "#FEF3C7" };   
      case 'Seguridad':
        return { icon: "shield", color: "#DC2626", bg: "#FEE2E2" }; 
      case 'Acabados':
        return { icon: "brush", color: "#8B5CF6", bg: "#EDE9FE" };  
      default:
        return { icon: "book-open", color: "#2563EB", bg: "#E0F2FE" }; 
    }
  };

  useFocusEffect(
    useCallback(() => {
      async function loadData() {
        try {
          // 1. Carga del proyecto
          const { data: projectData, error: projectError } = await supabase
            .from('projects')
            .select('id, name, location, start_date, end_date')
            .limit(1);
          
          if (projectError) {
            console.error("❌ Error de conexión proyecto:", projectError);
            setProject({ 
              error: `Error: ${projectError.message}`,
              code: projectError.code 
            });
          } else if (projectData && projectData.length > 0) {
            setProject(projectData[0]);
          } else {
            setProject(null);
          }

          // 2. Carga del perfil del usuario
          setUserProfile({
            name: "Ing. Juancarlos Escobar",
            role: "Residente de Obra / Desarrollador"
          });

          // 3. CARGA DE NOTIFICACIONES (Sin contadores exactos para ahorrar recursos)
          const { data: logsData } = await supabase
            .from('logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(4);

          const { data: planosData } = await supabase
            .from('planos')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(4);
            
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);

          const formatNotificationTime = (createdAt: string) => {
            const dateObj = new Date(createdAt);
            const dateOnly = new Date(dateObj);
            dateOnly.setHours(0, 0, 0, 0);

            const hours = String(dateObj.getHours()).padStart(2, '0');
            const minutes = String(dateObj.getMinutes()).padStart(2, '0');
            const day = String(dateObj.getDate()).padStart(2, '0');
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const year = dateObj.getFullYear();

            if (dateOnly.getTime() === today.getTime()) {
              return `Hoy ${hours}:${minutes}`;
            }

            if (dateOnly.getTime() === yesterday.getTime()) {
              return `Ayer ${hours}:${minutes}`;
            }

            return `${day}/${month}/${year} ${hours}:${minutes}`;
          };

          const mappedLogs = (logsData || []).map((log: any) => {
            const styles = getCategoryStyles(log.category);
            const dateObj = new Date(log.created_at);

            return {
              icon: styles.icon,
              title: `${log.category}: ${log.description}`,
              time: formatNotificationTime(log.created_at),
              iconColor: styles.color,
              bgColor: styles.bg,
              sector: log.sector,
              timestamp: dateObj.getTime()
            };
          });

          const mappedPlanos = (planosData || []).map((plano: any) => {
            const dateObj = new Date(plano.created_at);

            return {
              icon: "folder-plus",
              title: `Nuevo documento: ${plano.title}`,
              time: formatNotificationTime(plano.created_at),
              iconColor: "#059669",
              bgColor: "#D1FAE5",
              sector: plano.category || "Documentación",
              timestamp: dateObj.getTime()
            };
          });

          const twoDaysAgo = new Date(today);
          twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

          const combinedNotifications = [...mappedLogs, ...mappedPlanos]
            .filter(notification => notification.timestamp >= twoDaysAgo.getTime())
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 3);

          setNotifications(combinedNotifications);

        } catch (err) {
          console.error("❌ Error general en loadData:", err);
        }
      }
      
      loadData();
    }, []) 
  );

  // Módulos limpios, sin propiedad 'count'
  const modules = [
    { name: "Bitácora", icon: "book-open", route: "/bitacora" }, 
    { name: "Lista", icon: "users", route: "/lista" },
    { name: "Inventario", icon: "box", route: "/inventario" },
    { name: "Documentación", icon: "layers", route: "/planos" }, 
    { name: "Proveedores", icon: "truck", route: "/proveedores" }
  ];

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Cabecera Principal */}
      <View style={styles.header}>
        <Text style={styles.date}>{today}</Text>
        <Text style={styles.userName}>{userProfile.name}</Text>
        <Text style={styles.role}>{userProfile.role}</Text>
        
        <View style={styles.projectCard}>
          {project?.error ? (
            <>
              <Text style={[styles.projectTitle, { color: '#DC2626' }]}>⚠️ Error en Supabase</Text>
              <Text style={[styles.projectSub, { color: '#DC2626', fontSize: 11 }]}>
                {project.error}
              </Text>
              <Text style={[styles.projectSub, { color: '#666', fontSize: 10, marginTop: 4 }]}>
                Código: {project.code}
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.projectTitle}>{project?.name || "Cargando proyecto..."}</Text>
              <Text style={styles.projectSub}>{project?.location || "Cargando ubicación..."}</Text>
              
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
            </>
          )}
        </View>
      </View>

      <View style={styles.body}>
        <Text style={styles.sectionTitle}>Notificaciones Recientes</Text>
        <View style={{ marginBottom: 20 }}>
          {notifications.length > 0 ? (
            notifications.map((n, i) => (
              <NotificationItem key={i} {...n} />
            ))
          ) : (
            <Text style={styles.emptyText}>No hay notificaciones recientes en las últimas 48 horas.</Text>
          )}
        </View>

        <Text style={styles.sectionTitle}>Módulos de Control</Text>
        <View style={styles.grid}>
          {modules.map((m, i) => (
            <TouchableOpacity 
              key={i} 
              style={styles.card}
              onPress={() => {
                if (m.route) router.push(m.route as any);
              }}
            >
              <Feather name={m.icon as any} size={28} color={Colors.primary} />
              <Text style={styles.cardText}>{m.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
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
  projectSub: { fontSize: 12, color: Colors.textSub },
  body: { padding: 24 },
  emptyText: { color: Colors.textSub, fontSize: 13, marginBottom: 15 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: Colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 },
  card: { width: '47%', backgroundColor: '#FFF', padding: 20, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: '#EEE' },
  cardText: { marginTop: 10, fontWeight: '600', color: Colors.text },
  datesContainer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15, borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 10 },
  dateBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F9FA', padding: 6, borderRadius: 8 },
  dateText: { fontSize: 11, fontWeight: '600', color: '#666', marginLeft: 5 },
});