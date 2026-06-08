import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useProject } from '../../context/ProjectContext';

export default function GastosHubScreen() {
  const router = useRouter();
  const { activeProject } = useProject();

  const options = [
    {
      title: 'Control de Destajos',
      sub: 'Materiales, volúmenes y mano de obra',
      icon: 'package',
      color: '#F59E0B',
      path: '../destajo'
    },
    {
      title: 'Caja Chica',
      sub: 'Gastos menores del día a día',
      icon: 'dollar-sign',
      color: '#EC4899',
      path: '../caja_chica'
    },
    {
      title: 'Gastos Generales',
      sub: 'Resumen total y gastos de administración',
      icon: 'pie-chart',
      color: '#8B5CF6',
      path: '../gastos_generales'
    }
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Feather name="chevron-left" size={28} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerSubtitle}>GASTOS</Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={styles.headerBottomRow}>
          <Text style={styles.headerTitle}>Administración Financiera</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {options.map((opt, i) => (
          <TouchableOpacity key={i} style={styles.card} onPress={() => router.push(opt.path as any)}>
            <View style={[styles.iconBox, { backgroundColor: opt.color }]}>
              <Feather name={opt.icon as any} size={28} color="#FFF" />
            </View>
            <View style={styles.textBox}>
              <Text style={styles.cardTitle}>{opt.title}</Text>
              <Text style={styles.cardSub}>{opt.sub}</Text>
            </View>
            <Feather name="chevron-right" size={20} color="#CBD5E1" />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { backgroundColor: '#2563EB', paddingTop: 60, paddingBottom: 25, paddingHorizontal: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  backButton: { padding: 4, marginLeft: -4 },
  headerSubtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  headerBottomRow: { flexDirection: 'column', alignItems: 'center' },
  headerTitle: { color: '#FFF', fontSize: 22, fontWeight: 'bold'},
  headerSmall: { color: 'rgba(255,255,255,0.7)', fontSize: 14, marginTop: 5 },
  body: { padding: 20 },
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, flexDirection: 'row', alignItems: 'center', marginBottom: 15, elevation: 2 },
  iconBox: { width: 55, height: 55, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  textBox: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#1E293B' },
  cardSub: { fontSize: 13, color: '#64748B', marginTop: 3 }
});