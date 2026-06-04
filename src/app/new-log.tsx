// src/app/new-log.tsx
import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { LogForm } from '../components/LogForm'; // Asegúrate de que la ruta sea correcta

export default function NewLogScreen() {
  return (
    <View style={styles.container}>
      {/* Esto configura el título de la barra superior */}
      <Stack.Screen options={{ title: 'Nueva Entrada', headerShadowVisible: false }} />
      
      {/* Aquí mandamos a llamar a tu formulario */}
      <LogForm />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' }
}); 