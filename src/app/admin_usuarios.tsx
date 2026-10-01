import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SkeletonLista } from '../components/Skeleton';
import { subirArchivo } from '../lib/subidas';
import { regresar } from '../lib/navegar';
import { useRefrescar } from '../lib/refrescar';
import { firmarCampos } from '../lib/urlsFirmadas';
import { Aviso } from '../lib/aviso';
import { supabase } from '../lib/supabase';

export interface UserProfile {
  id: string;
  full_name?: string;
  role?: string;
  carrera_especialidad?: string | null;
  edad?: number | null;
  direccion?: string | null;
  telefono?: string | null;
  foto_ine_url?: string | null;
  foto_perfil_url?: string | null;
}

export default function AdminUsuariosScreen() {
  const router = useRouter(); 
  
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [proyectosActivos, setProyectosActivos] = useState<any[]>([]); 
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // 🎛️ ESTADOS PARA EL MODAL DE DETALLES
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [modalDetalle, setModalDetalle] = useState(false);

  // Campos del Formulario
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
  const [selectedProject, setSelectedProject] = useState<string | null>(null); 

  // 🎛️ ESTADOS PARA MENÚS DESPLEGABLES
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);

  const roleOptions = [
    { value: 'residente', label: 'Residente de Obra', icon: 'briefcase' },
    { value: 'oficina', label: 'Control de Oficina', icon: 'monitor' },
    { value: 'admin', label: 'Administrador', icon: 'shield' },
  ];

  useEffect(() => {
    cargarUsuarios();
    cargarProyectosActivos(); 
  }, []);

  useRefrescar(() => cargarUsuarios());

  const cargarUsuarios = async () => {
    setLoading(true);
    const { data } = await supabase.from('profiles').select('*').order('full_name', { ascending: true });
    // Las fotos de INE y de perfil viven en un bucket privado: hay que firmarlas
    // al cargar, o salen en blanco.
    if (data) setUsuarios(await firmarCampos(data, ['foto_ine_url', 'foto_perfil_url']));
    setLoading(false);
  };

  const cargarProyectosActivos = async () => {
    const { data } = await supabase.from('projects').select('id, name').order('created_at', { ascending: false });
    if (data) setProyectosActivos(data);
  };

  const seleccionarImagen = (tipo: 'perfil' | 'ine') => {
    Aviso.alert(
      "Subir Imagen",
      "Elige desde dónde quieres subir la foto",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Tomar Foto", onPress: () => abrirCamara(tipo) },
        { text: "Elegir de Galería", onPress: () => abrirGaleria(tipo) }
      ]
    );
  };

  const abrirCamara = async (tipo: 'perfil' | 'ine') => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Aviso.alert("Permiso Denegado", "Necesitamos acceso a la cámara."); return; }
    
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.5 });
    if (!result.canceled) {
      if (tipo === 'perfil') setFotoPerfil(result.assets[0].uri);
      else setFotoIne(result.assets[0].uri);
    }
  };

  const abrirGaleria = async (tipo: 'perfil' | 'ine') => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Aviso.alert("Permiso Denegado", "Necesitamos acceso a la galería."); return; }
    
    const result = await ImagePicker.launchImageLibraryAsync({ 
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, 
      quality: 0.5 
    });
    if (!result.canceled) {
      if (tipo === 'perfil') setFotoPerfil(result.assets[0].uri);
      else setFotoIne(result.assets[0].uri);
    }
  };

  const handleCrearUsuario = async () => {
    if (!fullName.trim() || !email.trim() || !password.trim()) {
      Aviso.alert("Campos incompletos", "Nombre, correo y contraseña son obligatorios.");
      return;
    }
    setIsSaving(true);

    try {
      let fotoIneUrl = null;
      let fotoPerfilUrl = null;

      if (fotoIne) {
        fotoIneUrl = await subirArchivo(fotoIne, 'identificaciones', { carpeta: 'ines', prefijo: 'ine' });
      }

      if (fotoPerfil) {
        fotoPerfilUrl = await subirArchivo(fotoPerfil, 'identificaciones', { carpeta: 'perfiles', prefijo: 'perfil' });
      }

      const { data: newUserId, error: rpcError } = await supabase.rpc('crear_usuario_desde_admin', {
        p_email: email.trim().toLowerCase(),
        p_password: password,
        p_full_name: fullName.trim(),
        p_role: role,
        p_carrera: carrera.trim(),
        p_edad: edad ? parseInt(edad) : null,
        p_direccion: direccion.trim(),
        p_telefono: telefono.trim(),
        p_foto_ine: fotoIneUrl,
        p_foto_perfil: fotoPerfilUrl
      });

      if (rpcError) throw rpcError;

      let codigoInvitacion = "------";
      let nombreObra = "";

      if (selectedProject && newUserId) {
        let roleToAssign = 'residente';
        if (role === 'oficina') roleToAssign = 'oficina';
        else if (role === 'admin') roleToAssign = 'admin';

        const { error: assignError } = await supabase.from('project_members').insert({
          user_id: newUserId,
          project_id: selectedProject,
          role: roleToAssign
        });

        if (assignError) console.log("Error asignando obra:", assignError);

        const { data: dataObra } = await supabase.from('projects').select('name, invite_code').eq('id', selectedProject).single();
        if (dataObra) {
          nombreObra = dataObra.name;
          codigoInvitacion = dataObra.invite_code || "------";
        }
      }

      Aviso.alert(
        "¡Usuario Creado!",
        `El perfil de ${fullName} se registró correctamente.${selectedProject ? ` Asignado a: ${nombreObra}.` : ''}`,
        [
          { text: "Listo", onPress: () => { limpiarFormulario(); cargarUsuarios(); } },
          { text: "Enviar por WhatsApp 💬", onPress: () => enviarCredencialesWhatsApp(nombreObra, codigoInvitacion) }
        ]
      );

    } catch (e: any) {
      Aviso.alert("Error", e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const enviarCredencialesWhatsApp = async (obraName: string, codigoObra: string) => {
    let rolDisplay = "Residente de Obra";
    if (role === 'oficina') rolDisplay = "Personal de Oficina";
    else if (role === 'admin') rolDisplay = "Administrador";

    const mensaje = `🏗️ *CONSTRUCTORA ROCAL S.A.* 🏗️\n\n` +
      `Hola *${fullName}*, se ha generado tu cuenta de acceso para la plataforma de gestión de obra:\n\n` +
      `📧 *Usuario:* ${email.trim().toLowerCase()}\n` +
      `🔑 *Contraseña Temporal:* ${password}\n` +
      `💼 *Rol Asignado:* ${rolDisplay}\n\n` +
      (selectedProject 
        ? `📍 Tu cuenta ya fue vinculada directamente al proyecto: *${obraName}*.\n` +
          `Código de respaldo de la obra: *${codigoObra}*`
        : `⚠️ Actualmente no tienes una obra asignada. Usa el código de letras o QR en campo para ingresar.`);

    limpiarFormulario();
    cargarUsuarios();

    try {
      if (telefono.trim().length === 10) {
        const url = `whatsapp://send?phone=+52${telefono.trim()}&text=${encodeURIComponent(mensaje)}`;
        const supported = await Linking.canOpenURL(url);
        if (supported) { await Linking.openURL(url); return; }
      }
      await Share.share({ message: mensaje });
    } catch (error) {
      console.log("Error al compartir:", error);
    }
  };

  const limpiarFormulario = () => {
    setFullName(''); setEmail(''); setPassword(''); setCarrera('');
    setEdad(''); setDireccion(''); setTelefono(''); setFotoIne(null); setFotoPerfil(null); setRole('residente');
    setSelectedProject(null);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => regresar('/(tabs)')} style={styles.backButton}>
          <Feather name="chevron-left" size={32} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Control de Personal</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionTitle}>Alta de Nuevo Personal</Text>
        
        <View style={styles.formBox}>
          <Text style={styles.label}>Nombre Completo *</Text>
          <TextInput style={styles.input} placeholder="Ej. Juan Pérez López" placeholderTextColor="#94A3B8" value={fullName} onChangeText={setFullName} />
          
          <Text style={styles.label}>Correo Electrónico *</Text>
          <TextInput style={styles.input} placeholder="correo@empresa.com" placeholderTextColor="#94A3B8" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
          
          <Text style={styles.label}>Contraseña Temporal *</Text>
          <TextInput style={styles.input} placeholder="********" placeholderTextColor="#94A3B8" secureTextEntry value={password} onChangeText={setPassword} />
          
          <Text style={styles.label}>Foto de Perfil</Text>
          <TouchableOpacity style={[styles.cameraBtn, { marginBottom: 15 }]} onPress={() => seleccionarImagen('perfil')}>
            <Feather name={fotoPerfil ? "check-circle" : "image"} size={16} color="#2563EB" />
            <Text style={styles.cameraBtnText}>{fotoPerfil ? 'Foto Perfil Lista (Cambiar)' : 'Subir Foto de Perfil'}</Text>
          </TouchableOpacity>
          
          <Text style={styles.label}>Rol en la Empresa</Text>
          <View style={{ zIndex: 20, marginBottom: 10 }}>
            <TouchableOpacity
              style={[styles.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 }]}
              onPress={() => { setIsRoleDropdownOpen(!isRoleDropdownOpen); setIsProjectDropdownOpen(false); }}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Feather name={roleOptions.find(r => r.value === role)?.icon as any} size={18} color="#2563EB" style={{ marginRight: 10 }} />
                <Text style={{ color: '#0F172A', fontSize: 14, fontWeight: '500' }}>{roleOptions.find(r => r.value === role)?.label}</Text>
              </View>
              <Feather name={isRoleDropdownOpen ? "chevron-up" : "chevron-down"} size={20} color="#64748B" />
            </TouchableOpacity>

            {isRoleDropdownOpen && (
              <View style={styles.dropdownMenu}>
                {roleOptions.map((option, index) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.dropdownItem, role === option.value && styles.dropdownItemActive, index === roleOptions.length - 1 && { borderBottomWidth: 0 }]}
                    onPress={() => { setRole(option.value as any); setIsRoleDropdownOpen(false); }}
                  >
                    <View style={styles.dropdownIconWrapper}><Feather name={option.icon as any} size={18} color={role === option.value ? "#2563EB" : "#64748B"} /></View>
                    <Text style={[styles.dropdownItemText, role === option.value && { color: '#2563EB', fontWeight: 'bold' }]}>{option.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <Text style={styles.label}>Asignar a Obra (Opcional)</Text>
          <View style={{ zIndex: 10, marginBottom: 10 }}>
            <TouchableOpacity
              style={[styles.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 }]}
              onPress={() => { setIsProjectDropdownOpen(!isProjectDropdownOpen); setIsRoleDropdownOpen(false); }}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <Feather name="map-pin" size={18} color="#059669" style={{ marginRight: 10 }} />
                <Text style={{ color: selectedProject ? '#0F172A' : '#94A3B8', fontSize: 14, fontWeight: '500', flex: 1 }} numberOfLines={1}>
                  {selectedProject ? proyectosActivos.find(p => p.id === selectedProject)?.name : 'Seleccionar obra activa...'}
                </Text>
              </View>
              <Feather name={isProjectDropdownOpen ? "chevron-up" : "chevron-down"} size={20} color="#64748B" />
            </TouchableOpacity>

            {isProjectDropdownOpen && (
              <View style={styles.dropdownMenu}>
                <TouchableOpacity
                  style={[styles.dropdownItem, !selectedProject && styles.dropdownItemActive]}
                  onPress={() => { setSelectedProject(null); setIsProjectDropdownOpen(false); }}
                >
                  <View style={styles.dropdownIconWrapper}><Feather name="slash" size={18} color={!selectedProject ? "#2563EB" : "#64748B"} /></View>
                  <Text style={[styles.dropdownItemText, !selectedProject && { color: '#2563EB', fontWeight: 'bold' }]}>Dejar sin asignar (Por ahora)</Text>
                </TouchableOpacity>
                
                {proyectosActivos.map((proj) => (
                  <TouchableOpacity
                    key={proj.id}
                    style={[styles.dropdownItem, selectedProject === proj.id && styles.dropdownItemActive]}
                    onPress={() => { setSelectedProject(proj.id); setIsProjectDropdownOpen(false); }}
                  >
                    <View style={styles.dropdownIconWrapper}><Feather name="briefcase" size={18} color={selectedProject === proj.id ? "#2563EB" : "#64748B"} /></View>
                    <Text style={[styles.dropdownItemText, selectedProject === proj.id && { color: '#2563EB', fontWeight: 'bold' }]}>{proj.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View style={{flexDirection: 'row', gap: 10, marginTop: 5}}>
            <View style={{flex: 2}}>
              <Text style={styles.label}>Especialidad</Text>
              <TextInput style={styles.input} placeholder="Ej. Civil" placeholderTextColor="#94A3B8" value={carrera} onChangeText={setCarrera} />
            </View>
            <View style={{flex: 1}}>
              <Text style={styles.label}>Edad</Text>
              <TextInput style={styles.input} placeholder="Ej. 30" placeholderTextColor="#94A3B8" keyboardType="numeric" value={edad} onChangeText={setEdad} />
            </View>
          </View>

          <Text style={styles.label}>Número de Teléfono</Text>
          <TextInput style={styles.input} placeholder="10 dígitos" placeholderTextColor="#94A3B8" keyboardType="phone-pad" maxLength={10} value={telefono} onChangeText={setTelefono} />
          
          <Text style={styles.label}>Dirección Particular</Text>
          <TextInput style={styles.input} placeholder="Ej. Calle Reforma 123" placeholderTextColor="#94A3B8" value={direccion} onChangeText={setDireccion} />
          
          <Text style={styles.label}>Documento de Identidad (INE)</Text>
          <TouchableOpacity style={styles.cameraBtn} onPress={() => seleccionarImagen('ine')}>
            <Feather name={fotoIne ? "check-circle" : "file-text"} size={16} color="#2563EB" />
            <Text style={styles.cameraBtnText}>{fotoIne ? 'INE Lista (Cambiar)' : 'Subir INE Oficial'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.saveBtn} onPress={handleCrearUsuario} disabled={isSaving}>
            {isSaving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Registrar en el Sistema</Text>}
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionTitle, {marginTop: 25}]}>Expedientes Activos ({usuarios.length})</Text>
        {loading ? <SkeletonLista filas={5} /> : (
          usuarios.map(u => (
            <TouchableOpacity key={u.id} style={styles.userCard} activeOpacity={0.7} onPress={() => { setSelectedUser(u); setModalDetalle(true); }}>
              <View style={{flex: 1}}>
                <Text style={styles.cardName}>{u.full_name}</Text>
                <Text style={styles.cardMeta}>{u.carrera_especialidad || 'General'} • {u.telefono || 'Sin Tel'}</Text>
              </View>
              <View style={styles.roleBadge}><Text style={styles.roleBadgeText}>{u.role}</Text></View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* MODAL DE DETALLES DEL USUARIO */}
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
                      <Image source={{ uri: selectedUser.foto_perfil_url }} style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: '#E2E8F0' }} />
                    ) : (
                      <View style={styles.avatarCircle}><Feather name="user" size={40} color="#2563EB" /></View>
                    )}
                    <Text style={styles.profileName}>{selectedUser.full_name}</Text>
                    <View style={[styles.roleBadge, { marginTop: 8 }]}><Text style={styles.roleBadgeText}>{selectedUser.role}</Text></View>
                  </View>

                  <View style={styles.detailBox}>
                    <View style={styles.detailRow}><Text style={styles.detailLabel}>Especialidad / Cargo</Text><Text style={styles.detailValue}>{selectedUser.carrera_especialidad || 'No especificado'}</Text></View>
                    <View style={styles.detailRow}><Text style={styles.detailLabel}>Edad</Text><Text style={styles.detailValue}>{selectedUser.edad ? `${selectedUser.edad} años` : 'No especificada'}</Text></View>
                    <View style={styles.detailRow}><Text style={styles.detailLabel}>Teléfono de Contacto</Text><Text style={styles.detailValue}>{selectedUser.telefono || 'No registrado'}</Text></View>
                    <View style={[styles.detailRow, { borderBottomWidth: 0 }]}><Text style={styles.detailLabel}>Dirección</Text><Text style={styles.detailValue}>{selectedUser.direccion || 'No registrada'}</Text></View>
                  </View>

                  {selectedUser.foto_ine_url ? (
                    <View style={styles.ineContainer}>
                      <Text style={styles.detailLabel}>Identificación Oficial (INE)</Text>
                      <Image source={{ uri: selectedUser.foto_ine_url }} style={styles.ineImage} />
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 15, backgroundColor: '#F1F5F9' },
  backButton: { padding: 5, marginLeft: -8 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#0F172A' },
  scrollBody: { paddingHorizontal: 20, paddingBottom: 60 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#0F172A', marginBottom: 15, textTransform: 'uppercase', letterSpacing: 0.5 },
  formBox: { backgroundColor: '#FFF', padding: 18, borderRadius: 20, borderWidth: 1, borderColor: '#E2E8F0' },
  input: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, padding: 12, fontSize: 14, color: '#0F172A', marginBottom: 10 },
  label: { fontSize: 11, fontWeight: 'bold', color: '#64748B', textTransform: 'uppercase', marginBottom: 6, marginTop: 5 },
  cameraBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 12, borderWidth: 1, borderColor: '#BFDBFE', borderStyle: 'dashed', borderRadius: 10, backgroundColor: '#EFF6FF', marginTop: 5 },
  cameraBtnText: { color: '#2563EB', fontSize: 13, fontWeight: 'bold', marginLeft: 8 },
  saveBtn: { backgroundColor: '#1E293B', padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 15 },
  dropdownMenu: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, marginTop: 6, overflow: 'hidden', position: 'absolute', top: 50, left: 0, right: 0, zIndex: 999, elevation: 4, boxShadow: '0px 4px 6px rgba(0, 0, 0, 0.1)',    },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  dropdownItemActive: { backgroundColor: '#EFF6FF' },
  dropdownIconWrapper: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  dropdownItemText: { marginLeft: 12, fontSize: 14, color: '#334155', fontWeight: '500' },
  userCard: { backgroundColor: '#FFF', padding: 16, borderRadius: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0', boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.03)',     elevation: 1 },
  cardName: { fontSize: 15, fontWeight: 'bold', color: '#1E293B' },
  cardMeta: { fontSize: 13, color: '#64748B', marginTop: 4 },
  roleBadge: { backgroundColor: '#E0F2FE', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  roleBadgeText: { fontSize: 11, fontWeight: '900', color: '#0369A1', textTransform: 'uppercase', letterSpacing: 0.5 },
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