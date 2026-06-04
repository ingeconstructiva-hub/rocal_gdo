import { Tabs } from 'expo-router';
import { Colors } from '../../constants/theme';

export default function TabLayout() {
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
      <Tabs.Screen name="index" options={{ title: 'Inicio' }} />
      <Tabs.Screen name="bitacora" options={{ title: 'Bitácora' }} />
    </Tabs>
  );
}