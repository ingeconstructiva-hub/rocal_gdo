'use client';

import { Feather } from '@expo/vector-icons';
// 🟢 IMPORTAMOS FONTAWESOME5 PARA EL ICONO DE LA BODEGA
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import { Tabs } from 'expo-router';
import { Colors } from '../../constants/theme';
import { useUser } from '../../context/UserContext';

export default function TabLayout() {
  const { profile } = useUser();

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
      
      {/* 1. 🟢 OCULTAMOS EL INICIO DE LAS PESTAÑAS ABAJO */}
      <Tabs.Screen 
        name="index" 
        options={{ 
          href: null, // Evita que aparezca la pestaña física abajo
        }} 
      />

      {/* 2. 🟢 NUEVO: RESGUARDOS / ALMACÉN (REEMPLAZANDO POSICIÓN) */}
      <Tabs.Screen 
        name="resguardos" 
        options={{ 
          title: 'Almacén',
          tabBarIcon: ({ color }) => <FontAwesome5 name="warehouse" size={20} color={color} />
        }} 
      />

      {/* 3. BITÁCORA */}
      <Tabs.Screen 
        name="bitacora" 
        options={{ 
          title: 'Bitácora',
          href: showBitacora ? '/bitacora' : null,
          tabBarIcon: ({ color }) => <Feather name="book-open" size={24} color={color} />
        }} 
      />

      {/* 4. LISTA (ASISTENCIA) */}
      <Tabs.Screen 
        name="lista" 
        options={{ 
          title: 'Asistencia',
          href: showLista ? '/lista' : null,
          tabBarIcon: ({ color }) => <Feather name="users" size={24} color={color} />
        }} 
      />

      {/* 5. PLANOS (DOCUMENTOS) */}
      <Tabs.Screen 
        name="planos" 
        options={{ 
          title: 'Documentos',
          tabBarIcon: ({ color }) => <Feather name="map" size={24} color={color} />
        }} 
      />

      {/* 6. GASTOS */}
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