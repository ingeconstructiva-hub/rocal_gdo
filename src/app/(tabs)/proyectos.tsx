import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';

export default function ProyectosScreen() {
  const router = useRouter();
  const [proyectos, setProyectos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargarProyectos();
  }, []);

  const cargarProyectos = async () => {
    try {
      // 1. Preguntamos quién es el usuario que acaba de iniciar sesión
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.replace('/login');
        return;
      }

      // 2. Buscamos en 'user_projects' a qué obras tiene acceso y traemos los datos de la obra
      const { data, error } = await supabase
        .from('user_projects')
        .select(`
          role,
          projects (
            id,
            name,
            location,
            start_date,
            end_date
          )
        `)
        .eq('user_id', user.id);

      if (error) throw error;

      // 3. Acomodamos los datos para dibujarlos en pantalla
      if (data) {
        const proyectosFormateados = data.map((item: any) => ({
          ...item.projects,
          userRole: item.role
        }));
        setProyectos(proyectosFormateados);
      }
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  const seleccionarProyecto = (proyectoId: string, projectName: string) => {
    // 🚧 PRÓXIMO PASO: Aquí guardaremos el 'proyectoId' en la memoria global de la app
    // Por ahora, simplemente nos mandará al Dashboard principal
    router.replace('/'); 
  };

  const cerrarSesion = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greeting}>Bienvenido,</Text>
            <Text style={styles.title}>Mis Obras</Text>
          </View>
          <TouchableOpacity onPress={cerrarSesion} style={styles.logoutBtn}>
            <Feather name="log-out" size={20} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* LISTA DE PROYECTOS */}
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 50 }} />
        ) : proyectos.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Feather name="folder-minus" size={48} color="#9CA3AF" />
            <Text style={styles.emptyText}>No tienes obras asignadas aún.</Text>
          </View>
        ) : (
          proyectos.map((proyecto) => (
            <TouchableOpacity 
              key={proyecto.id} 
              style={styles.projectCard}
              onPress={() => seleccionarProyecto(proyecto.id, proyecto.name)}
            >
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F8' },
  header: { backgroundColor: '#2563EB', paddingTop: 60, paddingBottom: 30, paddingHorizontal: 25, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greeting: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '500' },
  title: { color: '#FFF', fontSize: 28, fontWeight: 'bold', marginTop: 5 },
  logoutBtn: { padding: 10, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12 },
  
  body: { padding: 20 },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: '#6B7280', fontSize: 16, marginTop: 15 },
  
  projectCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 20, marginBottom: 15, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
  projectHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  iconBox: { width: 50, height: 50, backgroundColor: '#EFF6FF', borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  projectInfo: { flex: 1 },
  projectName: { fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 4 },
  projectLocation: { fontSize: 13, color: '#6B7280' },
  
  projectFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 15 },
  roleBadge: { backgroundColor: '#F0FDF4', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#BBF7D0' },
  roleText: { color: '#166534', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase' }
});