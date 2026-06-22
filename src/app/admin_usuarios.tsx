import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';

export default function AdminUsuariosScreen() {
  const router = useRouter(); 
  
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // 🎛️ ESTADOS PARA EL MODAL DE DETALLES
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [modalDetalle, setModalDetalle] = useState(false);

  // Formulario
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'residente' | 'oficina' | 'admin'>('residente');
  const [carrera, setCarrera] = useState('');
  const [edad, setEdad] = useState('');
  const [direccion, setDireccion] = useState('');
  const [telefono, setTelefono] = useState('');
  const [fotoIne, setFotoIne] = useState<string | null>(null);
  const [fotoPerfil, setFotoPerfil] = useState<string | null>(null);

  useEffect(() => {
    cargarUsuarios();
  }, []);

  const cargarUsuarios = async () => {
    setLoading(true);
    const { data } = await supabase.from('profiles').select('*').order('full_name', { ascending: true });
    if (data) setUsuarios(data);
    setLoading(false);
  };

  const tomarFotoIne = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert("Permiso Denegado", "Necesitamos acceso a la cámara."); return; }
    
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.5 });
    if (!result.canceled) setFotoIne(result.assets[0].uri);
  };
const tomarFotoPerfil = async () => {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') { Alert.alert("Permiso Denegado", "Necesitamos acceso a la cámara."); return; }
  
  const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.5 });
  if (!result.canceled) setFotoPerfil(result.assets[0].uri);
};
const handleCrearUsuario = async () => {
  if (!fullName.trim() || !email.trim() || !password.trim()) {
    Alert.alert("Campos incompletos", "Nombre, correo y contraseña son obligatorios.");
    return;
  }
  setIsSaving(true);

  try {
    let fotoIneUrl = null;
    let fotoPerfilUrl = null;

    // Subir INE
    if (fotoIne) {
      const filename = `ine_${Date.now()}.jpg`;
      const formData = new FormData();
      formData.append('file', { uri: fotoIne, name: filename, type: 'image/jpeg' } as any);
      const { error: err } = await supabase.storage.from('identificaciones').upload(`ines/${filename}`, formData as any);
      if (!err) fotoIneUrl = supabase.storage.from('identificaciones').getPublicUrl(`ines/${filename}`).data.publicUrl;
    }

    // Subir Foto de Perfil
    if (fotoPerfil) {
      const filename = `perfil_${Date.now()}.jpg`;
      const formData = new FormData();
      formData.append('file', { uri: fotoPerfil, name: filename, type: 'image/jpeg' } as any);
      const { error: err } = await supabase.storage.from('identificaciones').upload(`perfiles/${filename}`, formData as any);
      if (!err) fotoPerfilUrl = supabase.storage.from('identificaciones').getPublicUrl(`perfiles/${filename}`).data.publicUrl;
    }

    // Llamar al RPC (Asegúrate de haber actualizado el SQL con p_foto_perfil)
    const { error: rpcError } = await supabase.rpc('crear_usuario_desde_admin', {
      p_email: email.trim().toLowerCase(),
      p_password: password,
      p_full_name: fullName.trim(),
      p_role: role,
      p_carrera: carrera.trim(),
      p_edad: edad ? parseInt(edad) : null,
      p_direccion: direccion.trim(),
      p_telefono: telefono.trim(),
      p_foto_ine: fotoIneUrl,
      p_foto_perfil: fotoPerfilUrl // 🟢 Nuevo campo
    });

    if (rpcError) throw rpcError;

    Alert.alert("¡Éxito!", "Usuario creado correctamente.");
    limpiarFormulario();
    cargarUsuarios();
  } catch (e: any) {
    Alert.alert("Error", e.message);
  } finally {
    setIsSaving(false);
  }
};

  const limpiarFormulario = () => {
    setFullName(''); setEmail(''); setPassword(''); setCarrera('');
    setEdad(''); setDireccion(''); setTelefono(''); setFotoIne(null); setRole('residente');
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="chevron-left" size={32} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Control de Personal</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionTitle}>Alta de Nuevo Personal</Text>
        
        <View style={styles.formBox}>
          <TextInput style={styles.input} placeholder="Nombre Completo" value={fullName} onChangeText={setFullName} />
          <TextInput style={styles.input} placeholder="Correo Electrónico" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
          <TextInput style={styles.input} placeholder="Contraseña Temporal" secureTextEntry value={password} onChangeText={setPassword} />
          <TouchableOpacity style={[styles.cameraBtn, { marginBottom: 10 }]} onPress={tomarFotoPerfil}>
  <Feather name="user" size={16} color="#2563EB" />
  <Text style={styles.cameraBtnText}>{fotoPerfil ? '✓ Foto Perfil lista' : 'Tomar Foto de Perfil'}</Text>
</TouchableOpacity>
          <Text style={styles.label}>Rol en la Empresa</Text>
          <View style={styles.roleSelector}>
            {(['residente', 'oficina', 'admin'] as const).map(r => (
              <TouchableOpacity key={r} style={[styles.roleBtn, role === r && styles.roleBtnActive]} onPress={() => setRole(r)}>
                <Text style={[styles.roleBtnText, role === r && {color:'#FFF'}]}>{r.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{flexDirection: 'row', gap: 10, marginTop: 10}}>
            <TextInput style={[styles.input, {flex: 2}]} placeholder="Especialidad (Ej. Civil)" value={carrera} onChangeText={setCarrera} />
            <TextInput style={[styles.input, {flex: 1}]} placeholder="Edad" keyboardType="numeric" value={edad} onChangeText={setEdad} />
          </View>

          <TextInput style={styles.input} placeholder="Número de Teléfono" keyboardType="phone-pad" maxLength={10} value={telefono} onChangeText={setTelefono} />
          <TextInput style={styles.input} placeholder="Dirección Particular" value={direccion} onChangeText={setDireccion} />
          
          <TouchableOpacity style={styles.cameraBtn} onPress={tomarFotoIne}>
            <Feather name="camera" size={16} color="#2563EB" />
            <Text style={styles.cameraBtnText}>{fotoIne ? '✓ INE Capturada' : 'Fotografiar INE Oficial'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.saveBtn} onPress={handleCrearUsuario} disabled={isSaving}>
            {isSaving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Registrar en el Sistema</Text>}
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionTitle, {marginTop: 25}]}>Expedientes Activos ({usuarios.length})</Text>
        {loading ? <ActivityIndicator color="#2563EB" /> : (
          usuarios.map(u => (
            <TouchableOpacity 
              key={u.id} 
              style={styles.userCard}
              activeOpacity={0.7}
              onPress={() => {
                setSelectedUser(u);
                setModalDetalle(true);
              }}
            >
              <View style={{flex: 1}}>
                <Text style={styles.cardName}>{u.full_name}</Text>
                <Text style={styles.cardMeta}>{u.carrera_especialidad || 'General'} • {u.telefono || 'Sin Tel'}</Text>
              </View>
              <View style={styles.roleBadge}><Text style={styles.roleBadgeText}>{u.role}</Text></View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* 🟢 MODAL DE DETALLES DEL USUARIO */}
      <Modal visible={modalDetalle} animationType="slide" transparent={true} onRequestClose={() => setModalDetalle(false)}>
        <View style={styles.modalOverlayFull}>
          <View style={styles.modalWrapperFull}>
            
            <View style={styles.modalHeaderFull}>
              <Text style={styles.modalTitleFull}>Expediente del Personal</Text>
              <TouchableOpacity onPress={() => setModalDetalle(false)} style={styles.closeBtnCircle}>
                <Feather name="x" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{padding: 25}} showsVerticalScrollIndicator={false}>
              {selectedUser && (
                <>
                  <View style={{ alignItems: 'center', marginBottom: 25 }}>
                    {selectedUser.foto_perfil_url ? (
    <Image 
      source={{ uri: selectedUser.foto_perfil_url }} 
      style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: '#E2E8F0' }} 
    />
  ) : (
    <View style={styles.avatarCircle}>
      <Feather name="user" size={40} color="#2563EB" />
    </View>
  )}
                    
                    <Text style={styles.profileName}>{selectedUser.full_name}</Text>
                    <View style={[styles.roleBadge, { marginTop: 8 }]}>
                      <Text style={styles.roleBadgeText}>{selectedUser.role}</Text>
                    </View>
                  </View>

                  <View style={styles.detailBox}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Especialidad / Cargo</Text>
                      <Text style={styles.detailValue}>{selectedUser.carrera_especialidad || 'No especificado'}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Edad</Text>
                      <Text style={styles.detailValue}>{selectedUser.edad ? `${selectedUser.edad} años` : 'No especificada'}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Teléfono de Contacto</Text>
                      <Text style={styles.detailValue}>{selectedUser.telefono || 'No registrado'}</Text>
                    </View>
                    <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
                      <Text style={styles.detailLabel}>Dirección</Text>
                      <Text style={styles.detailValue}>{selectedUser.direccion || 'No registrada'}</Text>
                    </View>
                  </View>

                  {selectedUser.foto_ine_url ? (
                    <View style={styles.ineContainer}>
                      <Text style={styles.detailLabel}>Identificación Oficial (INE)</Text>
                      <Image 
                        source={{ uri: selectedUser.foto_ine_url }} 
                        style={styles.ineImage} 
                      />
                    </View>
                  ) : (
                    <View style={styles.noIneContainer}>
                      <Feather name="image" size={24} color="#94A3B8" />
                      <Text style={styles.noIneText}>Sin identificación registrada</Text>
                    </View>
                  )}
                </>
              )}
            </ScrollView>

          </View>
        </View>
      </Modal>

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60, 
    paddingBottom: 15,
    backgroundColor: '#F1F5F9',
  },
  backButton: { padding: 5, marginLeft: -8 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#0F172A' },
  scrollBody: { paddingHorizontal: 20, paddingBottom: 60 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#0F172A', marginBottom: 15, textTransform: 'uppercase', letterSpacing: 0.5 },
  formBox: { backgroundColor: '#FFF', padding: 18, borderRadius: 20, borderWidth: 1, borderColor: '#E2E8F0' },
  input: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, padding: 12, fontSize: 14, color: '#0F172A', marginBottom: 10 },
  label: { fontSize: 11, fontWeight: 'bold', color: '#64748B', textTransform: 'uppercase', marginBottom: 6, marginTop: 5 },
  roleSelector: { flexDirection: 'row', backgroundColor: '#F1F5F9', padding: 4, borderRadius: 10, gap: 4, marginBottom: 10 },
  roleBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  roleBtnActive: { backgroundColor: '#2563EB' },
  roleBtnText: { fontSize: 11, fontWeight: 'bold', color: '#64748B' },
  cameraBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 12, borderWidth: 1, borderColor: '#BFDBFE', borderStyle: 'dashed', borderRadius: 10, backgroundColor: '#EFF6FF', marginTop: 5 },
  cameraBtnText: { color: '#2563EB', fontSize: 13, fontWeight: 'bold', marginLeft: 8 },
  saveBtn: { backgroundColor: '#1E293B', padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 15 },
  
  // 🟢 ESTILOS DE LA TARJETA EN LA LISTA
  userCard: { backgroundColor: '#FFF', padding: 16, borderRadius: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  cardName: { fontSize: 15, fontWeight: 'bold', color: '#1E293B' },
  cardMeta: { fontSize: 13, color: '#64748B', marginTop: 4 },
  roleBadge: { backgroundColor: '#E0F2FE', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  roleBadgeText: { fontSize: 11, fontWeight: '900', color: '#0369A1', textTransform: 'uppercase', letterSpacing: 0.5 },

  // 🟢 ESTILOS DEL MODAL DE DETALLES
  modalOverlayFull: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.7)', justifyContent: 'flex-end' },
  modalWrapperFull: { backgroundColor: '#F8FAFC', borderTopLeftRadius: 30, borderTopRightRadius: 30, width: '100%', height: '85%' },
  modalHeaderFull: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: '#FFF', borderTopLeftRadius: 30, borderTopRightRadius: 30, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  modalTitleFull: { fontSize: 18, fontWeight: 'bold', color: '#0F172A' },
  closeBtnCircle: { backgroundColor: '#F1F5F9', padding: 8, borderRadius: 20 },
  
  avatarCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#DBEAFE', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  profileName: { fontSize: 24, fontWeight: '900', color: '#1E293B', textAlign: 'center' },
  
  detailBox: { backgroundColor: '#FFF', borderRadius: 20, paddingHorizontal: 20, borderWidth: 1, borderColor: '#E2E8F0' },
  detailRow: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  detailLabel: { fontSize: 11, fontWeight: 'bold', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  detailValue: { fontSize: 15, fontWeight: '600', color: '#334155' },

  ineContainer: { marginTop: 25, backgroundColor: '#FFF', padding: 15, borderRadius: 20, borderWidth: 1, borderColor: '#E2E8F0' },
  ineImage: { width: '100%', height: 220, borderRadius: 12, resizeMode: 'cover', marginTop: 10, backgroundColor: '#F1F5F9' },
  noIneContainer: { marginTop: 25, backgroundColor: '#F1F5F9', padding: 30, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2E8F0', borderStyle: 'dashed' },
  noIneText: { color: '#94A3B8', fontSize: 14, fontWeight: '600', marginTop: 10 }
});