import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Aviso } from '../lib/aviso';
import { supabase } from '../lib/supabase';

export default function LoginScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Aviso.alert("Campos incompletos", "Por favor ingresa tu correo y contraseña.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error) throw error;

      router.replace('/proyectos');

    } catch (error: any) {
      Aviso.alert("Error de acceso", "Correo o contraseña incorrectos. Verifica tus datos.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === "ios" ? "padding" : "height"} 
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        
        {/* SECCIÓN DEL LOGO */}
        <View style={styles.logoContainer}>
          <Image 
            // Asegúrate de que esta ruta apunte a donde guardaste tu logo
            source={require('./assets/images/logo-rocal.png')} 
            style={styles.logo} 
            resizeMode="contain" 
          />
        </View>

        {/* TARJETA DEL FORMULARIO */}
        <View style={styles.card}>
          <View style={styles.headerTextContainer}>
            <Text style={styles.title}>Bienvenido</Text>
            <Text style={styles.subtitle}>Inicia sesión para gestionar tus obras</Text>
          </View>

          <View style={styles.formContainer}>
            
            <Text style={styles.label}>Correo Electrónico</Text>
            <View style={styles.inputBox}>
              <Feather name="mail" size={20} color="#9CA3AF" style={styles.icon} />
              <TextInput
                style={styles.input}
                placeholder="ejemplo@rocal.com"
                placeholderTextColor="#9CA3AF"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
            </View>

            <Text style={styles.label}>Contraseña</Text>
            <View style={styles.inputBox}>
              <Feather name="lock" size={20} color="#9CA3AF" style={styles.icon} />
              <TextInput
                style={styles.input}
                placeholder="Tu contraseña secreta"
                placeholderTextColor="#9CA3AF"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            </View>

            <TouchableOpacity style={styles.loginBtn} onPress={handleLogin} disabled={loading}>
              {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.loginBtnText}>Ingresar</Text>}
            </TouchableOpacity>

          </View>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#1E3A8A' // Azul corporativo para el fondo, resaltará la tarjeta blanca
  },
  scrollContainer: { 
    flexGrow: 1, 
    justifyContent: 'center', 
    padding: 20 
  },
  
  // LOGO
  logoContainer: {
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 20
  },
  logo: {
    width: '100%',
    maxWidth: 350,
    height: 220, // Ajusta esta altura dependiendo de las proporciones reales de tu logo
  },

  // TARJETA BLANCA
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 30,
    boxShadow: '0px 10px 20px rgba(0, 0, 0, 0.15)', 
    
    
    
    elevation: 10,
  },

  headerTextContainer: {
    alignItems: 'center',
    marginBottom: 30
  },
  title: { 
    color: '#111827', 
    fontSize: 28, 
    fontWeight: 'bold',
    marginBottom: 8
  },
  subtitle: { 
    color: '#6B7280', 
    fontSize: 14, 
    textAlign: 'center'
  },
  
  formContainer: { 
    width: '100%' 
  },
  label: { 
    fontSize: 13, 
    fontWeight: '700', 
    color: '#4B5563', 
    marginBottom: 8, 
    marginTop: 15 
  },
  
  inputBox: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#F9FAFB', 
    borderWidth: 1, 
    borderColor: '#E5E7EB', 
    borderRadius: 14, 
    paddingHorizontal: 15, 
    height: 55 
  },
  icon: { 
    marginRight: 10 
  },
  input: { 
    flex: 1, 
    fontSize: 15, 
    color: '#111827' 
  },

  loginBtn: { 
    backgroundColor: '#2563EB', 
    height: 55, 
    borderRadius: 14, 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginTop: 35, 
    boxShadow: '0px 6px 8px rgba(37, 99, 235, 0.3)',  
     
     
     
    elevation: 5 
  },
  loginBtnText: { 
    color: '#FFF', 
    fontSize: 16, 
    fontWeight: 'bold',
    letterSpacing: 0.5
  }
});