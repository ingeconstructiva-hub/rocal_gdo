import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Colors } from '../../constants/theme';
import { useUser } from '../../context/UserContext'; // 🧠 Importamos el motor de roles

export default function TabLayout() {
  const { profile } = useUser(); // 🧠 Obtenemos el perfil activo

  // 🔒 Validadores de Permisos para la Barra Inferior
  const showBitacora = profile?.role === 'admin' || profile?.role === 'residente';
  const showLista = profile?.role === 'admin' || profile?.role === 'residente';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textSub,
        tabBarStyle: {
          backgroundColor: Colors.navBg,
          borderTopColor: Colors.border,
          paddingBottom: 6,
          height: 60,
        },
        headerShown: false,
      }}>
      
      {/* 1. INICIO (Dashboard) - Visible para todos */}
      <Tabs.Screen 
        name="index" 
        options={{ 
          title: 'Inicio',
          tabBarIcon: ({ color }) => <Feather name="home" size={24} color={color} />
        }} 
      />
      
      {/* 2. BITÁCORA - 🔒 Oculto para Personal de Oficina */}
      <Tabs.Screen 
        name="bitacora" 
        options={{ 
          title: 'Bitácora',
          href: showBitacora ? '/bitacora' : null, // Magia: Si es false, la pestaña desaparece
          tabBarIcon: ({ color }) => <Feather name="book-open" size={24} color={color} />
        }} 
      />

      {/* 3. LISTA (Asistencia) - 🔒 Oculto para Personal de Oficina */}
      <Tabs.Screen 
        name="lista" 
        options={{ 
          title: 'Asistencia',
          href: showLista ? '/lista' : null, // Magia: Si es false, la pestaña desaparece
          tabBarIcon: ({ color }) => <Feather name="users" size={24} color={color} />
        }} 
      />

      {/* 4. PLANOS (Documentos) - Visible para todos */}
      <Tabs.Screen 
        name="planos" 
        options={{ 
          title: 'Documentos',
          tabBarIcon: ({ color }) => <Feather name="map" size={24} color={color} />
        }} 
      />

      {/* 5. GASTOS (Menú Central Financiero) - Visible para todos (Se filtra por dentro) */}
      <Tabs.Screen 
        name="gastos" 
        options={{ 
          title: 'Gastos',
          tabBarIcon: ({ color }) => <Feather name="dollar-sign" size={24} color={color} />
        }} 
      />
    </Tabs>
  );
}