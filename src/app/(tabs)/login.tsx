import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase'; // Asegúrate de que esta ruta apunte a tu archivo de conexión

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Campos incompletos", "Por favor ingresa tu correo y contraseña.");
      return;
    }

    setLoading(true);
    try {
      // Intentamos iniciar sesión con Supabase Auth
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error) {
        Alert.alert("Error de acceso", "Correo o contraseña incorrectos.");
        console.log(error.message);
      } else if (data.session) {
        // Si el login es exitoso, lo mandamos a la lista de proyectos
        router.replace('/proyectos'); 
      }
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.card}>
        
        {/* LOGO O TÍTULO */}
        <View style={styles.headerContainer}>
          <View style={styles.iconContainer}>
            <Feather name="hard-drive" size={32} color="#FFF" />
          </View>
          <Text style={styles.title}>ROCAL</Text>
          <Text style={styles.subtitle}>Sistema de Control de Obra</Text>
        </View>

        {/* FORMULARIO */}
        <View style={styles.formContainer}>
          <Text style={styles.label}>Correo Electrónico</Text>
          <View style={styles.inputContainer}>
            <Feather name="mail" size={18} color="#9CA3AF" style={styles.inputIcon} />
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
          <View style={styles.inputContainer}>
            <Feather name="lock" size={18} color="#9CA3AF" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Ingresa tu contraseña"
              placeholderTextColor="#9CA3AF"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
              <Feather name={showPassword ? "eye" : "eye-off"} size={18} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          {/* BOTÓN DE ACCESO */}
          <TouchableOpacity 
            style={[styles.loginButton, loading && styles.loginButtonDisabled]} 
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.loginButtonText}>Iniciar Sesión</Text>
            )}
          </TouchableOpacity>
        </View>

      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F6F8',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 25,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 35,
    marginTop: 10,
  },
  iconContainer: {
    backgroundColor: '#2563EB',
    width: 64,
    height: 64,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  formContainer: {
    width: '100%',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    marginBottom: 20,
    paddingHorizontal: 12,
    height: 52,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    height: '100%',
  },
  eyeIcon: {
    padding: 5,
  },
  loginButton: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    height: 54,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  loginButtonDisabled: {
    backgroundColor: '#93C5FD',
    elevation: 0,
    shadowOpacity: 0,
  },
  loginButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});