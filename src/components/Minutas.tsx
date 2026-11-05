/* Minutas de indicaciones de obra.
 *
 * Vive dentro de Bitacora porque es el mismo cuaderno, pero no es lo mismo:
 * la nota de bitacora cuenta lo que paso, la minuta pide que algo pase. Por
 * eso lleva a quien va dirigida, para cuando, y si ya se atendio.
 *
 * Los campos son los minimos que sirven en obra. Cuando definan cuales quieren
 * de verdad, agregar uno es una columna en minutas y un campo aqui.
 */

import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useProject } from '../context/ProjectContext';
import { useUser } from '../context/UserContext';
import { Aviso } from '../lib/aviso';
import { mensajeDeError } from '../lib/errores';
import { exportarDocumento } from '../lib/exportar';
import { eliminarRegistro, esDeHoy } from '../lib/permisos';
import { subirArchivo } from '../lib/subidas';
import { EMPRESAS } from '../lib/membretes';
import { supabase } from '../lib/supabase';
import { firmarVarias } from '../lib/urlsFirmadas';
import { minutaAHtml } from '../utils/minutaHtml';
import { crearPdfMinuta } from '../utils/pdfMinutaArchivo';
import { SelectorFecha } from './SelectorFecha';
import { SinDatos } from './SinDatos';
import { SkeletonLista } from './Skeleton';

type Minuta = {
  id: string;
  asunto: string;
  indicacion: string;
  dirigida_a: string | null;
  plazo: string | null;
  estado: string;
  created_at: string;
  evidencias?: string | null;
};

const fechaCorta = (iso?: string | null) => {
  if (!iso) return null;
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return null;
  return new Date(a, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
};

const EMPRESAS_MINUTA = [
  { clave: 'rocal' as const, etiqueta: 'ROCAL', color: '#1E3A8A' },
  { clave: 'jd' as const, etiqueta: 'JD', color: '#15803D' },
];

export function Minutas() {
  const { activeProject } = useProject();
  const { profile } = useUser();

  const esResidente = profile?.role === 'residente';
  const puedeBorrar = (m: Minuta) => !esResidente || esDeHoy(m.created_at);

  const [generando, setGenerando] = useState<string | null>(null);
  // Cual minuta espera que se elija empresa. null = el selector esta cerrado.
  const [eligiendoEmpresa, setEligiendoEmpresa] = useState<Minuta | null>(null);

  /* El número de minuta sale del orden en que se levantaron dentro de la obra.
   * No hay columna para él, así que se cuenta desde la más vieja: la lista
   * viene de la más nueva a la más vieja, de ahí la resta. */
  const numeroDeMinuta = (m: Minuta) => {
    const posicion = minutas.findIndex((x) => x.id === m.id);
    const consecutivo = posicion === -1 ? minutas.length : minutas.length - posicion;
    return String(consecutivo).padStart(3, '0');
  };

  const generarMinuta = async (m: Minuta, clave: 'rocal' | 'jd') => {
    setEligiendoEmpresa(null);
    setGenerando(`${m.id}-${clave}`);
    try {
      const datos = {
        asunto: m.asunto,
        indicacion: m.indicacion,
        dirigidaA: m.dirigida_a,
        plazo: m.plazo,
        creada: m.created_at,
        numero: numeroDeMinuta(m),
        proyecto: activeProject?.name || 'Obra sin nombre',
        ubicacion: activeProject?.location || null,
        evidencias: fotosDe(m),
      };

      await exportarDocumento(
        minutaAHtml(datos, clave),
        `Minuta_${numeroDeMinuta(m)}_${clave.toUpperCase()}.pdf`,
        () => crearPdfMinuta(datos, clave)
      );
    } catch (e: any) {
      Aviso.alert('No se pudo generar', mensajeDeError(e, 'generar la minuta'));
    } finally {
      setGenerando(null);
    }
  };

  /* Las fotos viven como lista JSON en una sola columna, igual que en
   * bitácora. Si el texto quedó corrupto se devuelve vacío: una minuta sin
   * evidencia se puede leer, una pantalla caída no. */
  const fotosDe = (m: Minuta): string[] => {
    if (!m.evidencias) return [];
    try {
      const lista = JSON.parse(m.evidencias);
      return Array.isArray(lista) ? lista.filter(Boolean) : [];
    } catch {
      return [];
    }
  };

  const [minutas, setMinutas] = useState<Minuta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [modal, setModal] = useState(false);

  const [asunto, setAsunto] = useState('');
  const [indicacion, setIndicacion] = useState('');
  const [dirigidaA, setDirigidaA] = useState('');
  const [plazo, setPlazo] = useState<Date | null>(null);
  // Fotos elegidas que todavía no se suben. Se suben al guardar.
  const [evidencias, setEvidencias] = useState<string[]>([]);
  const [subiendoFoto, setSubiendoFoto] = useState(false);

  const cargar = useCallback(async () => {
    const pid = activeProject?.id;
    // Sin obra activa no hay nada que pedir, pero hay que apagar el esqueleto:
    // si no, la pantalla se queda cargando para siempre.
    if (!pid) {
      setCargando(false);
      return;
    }

    setCargando(true);
    try {
      const { data, error } = await supabase
        .from('minutas')
        .select('*')
        .eq('project_id', pid)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      /* Las direcciones guardadas son privadas: hay que firmarlas para poder
       * verlas y para que jsPDF pueda bajarlas al armar el PDF. */
      const conFotos = await Promise.all(
        (data || []).map(async (m: any) => {
          const fotos = fotosDe(m);
          if (fotos.length === 0) return m;
          return { ...m, evidencias: JSON.stringify(await firmarVarias(fotos)) };
        })
      );

      setMinutas(conFotos);
    } catch (e: any) {
      console.log('Error cargando minutas:', e);
    } finally {
      setCargando(false);
    }
  }, [activeProject]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const agregarFoto = async (deLaCamara: boolean) => {
    try {
      const permiso = deLaCamara
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      // En navegador esta llamada no concede nada y devolver aquí dejaría sin
      // adjuntar a quien usa la PWA.
      if (Platform.OS !== 'web' && permiso.status !== 'granted') {
        Aviso.alert('Permiso', deLaCamara ? 'Necesitamos la cámara.' : 'Necesitamos tus fotos.');
        return;
      }

      const resultado = deLaCamara
        ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });

      if (!resultado.canceled) {
        setEvidencias((previas) => [...previas, resultado.assets[0].uri]);
      }
    } catch {
      Aviso.alert('No se pudo abrir', 'Intenta con la otra opción.');
    }
  };

  const limpiar = () => {
    setAsunto('');
    setIndicacion('');
    setDirigidaA('');
    setPlazo(null);
    setEvidencias([]);
  };

  const guardar = async () => {
    if (!asunto.trim() || !indicacion.trim()) {
      Aviso.alert('Faltan datos', 'El asunto y la indicación son obligatorios.');
      return;
    }

    const pid = activeProject?.id;
    if (!pid) {
      Aviso.alert('Sin obra seleccionada', 'Entra a Proyectos y elige tu obra antes de capturar.');
      return;
    }

    setGuardando(true);
    try {
      /* Las fotos se suben antes de insertar. Si una falla, se detiene todo y
       * no se guarda la minuta: una minuta que dice tener evidencia y no la
       * tiene es peor que no haberla capturado. */
      let urls: string[] = [];
      if (evidencias.length > 0) {
        setSubiendoFoto(true);
        urls = [];
        for (const uri of evidencias) {
          urls.push(await subirArchivo(uri, 'evidencias_minutas', { prefijo: 'minuta' }));
        }
        setSubiendoFoto(false);
      }

      // Supabase devuelve { error } en vez de lanzarlo: sin revisarlo, un
      // rechazo cerraria el formulario como si se hubiera guardado.
      const { error } = await supabase.from('minutas').insert([
        {
          project_id: pid,
          asunto: asunto.trim(),
          indicacion: indicacion.trim(),
          dirigida_a: dirigidaA.trim() || null,
          plazo: plazo ? plazo.toISOString().slice(0, 10) : null,
          estado: 'pendiente',
          evidencias: urls.length > 0 ? JSON.stringify(urls) : null,
          created_by: profile?.id || null,
          is_active: true,
        },
      ]);
      if (error) throw error;

      setModal(false);
      limpiar();
      cargar();
    } catch (e: any) {
      Aviso.alert('Error', mensajeDeError(e, 'guardar la minuta'));
    } finally {
      setGuardando(false);
    }
  };

  const cambiarEstado = async (m: Minuta) => {
    const nuevo = m.estado === 'atendida' ? 'pendiente' : 'atendida';
    setMinutas((prev) => prev.map((x) => (x.id === m.id ? { ...x, estado: nuevo } : x)));

    const { error } = await supabase.from('minutas').update({ estado: nuevo }).eq('id', m.id);
    if (error) {
      // Se regresa a como estaba: mentir sobre el estado de una indicacion es
      // peor que no poder cambiarlo.
      setMinutas((prev) => prev.map((x) => (x.id === m.id ? { ...x, estado: m.estado } : x)));
      Aviso.alert('Error', mensajeDeError(error, 'cambiar el estado de la minuta'));
    }
  };

  const borrar = (m: Minuta) => {
    Aviso.alert(
      'Eliminar minuta',
      esResidente
        ? '¿Quitar esta indicación? Un administrador puede recuperarla.'
        : '¿Borrar definitivamente esta indicación?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: async () => {
            const { error } = await eliminarRegistro('minutas', m.id, esResidente);
            if (error) {
              Aviso.alert('Error', mensajeDeError(error, 'eliminar la minuta'));
              return;
            }
            cargar();
          },
        },
      ]
    );
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Arriba y con su nombre: el circulo flotante tapaba contenido y no
          decia que hacia. */}
      <TouchableOpacity style={estilos.botonAgregar} onPress={() => setModal(true)}>
        <Feather name="plus-circle" size={18} color="#FFF" />
        <Text style={estilos.botonAgregarTexto}>Agregar indicación</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 10, paddingBottom: 40 }}>
        {cargando ? (
          <SkeletonLista filas={4} />
        ) : minutas.length === 0 ? (
          <SinDatos onReintentar={cargar} />
        ) : (
          minutas.map((m) => {
            const atendida = m.estado === 'atendida';
            return (
              <View key={m.id} style={[estilos.tarjeta, atendida && estilos.tarjetaAtendida]}>
                <View style={estilos.encabezado}>
                  <Text style={estilos.asunto} numberOfLines={2}>{m.asunto}</Text>

                  <View style={[estilos.sello, atendida ? estilos.selloAtendida : estilos.selloPendiente]}>
                    <Text style={[estilos.selloTexto, atendida ? { color: '#047857' } : { color: '#B45309' }]}>
                      {atendida ? 'Atendida' : 'Pendiente'}
                    </Text>
                  </View>
                </View>

                <Text style={estilos.indicacion}>{m.indicacion}</Text>

                {/* Una minuta se levanta para ROCAL o para JD segun de quien
                    sea el contrato, y hasta ahora habia que pasarla a mano a
                    la hoja membretada que tocara. */}
                <View style={estilos.filaEmpresas}>
                  <TouchableOpacity
                    style={estilos.botonMinuta}
                    onPress={() => setEligiendoEmpresa(m)}
                    disabled={generando !== null}
                  >
                    {generando?.startsWith(m.id) ? (
                      <ActivityIndicator size="small" color="#2563EB" />
                    ) : (
                      <>
                        <Feather name="file-text" size={13} color="#2563EB" />
                        <Text style={estilos.botonMinutaTexto}>Generar minuta</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                <View style={estilos.metaFila}>
                  {m.dirigida_a ? (
                    <View style={estilos.meta}>
                      <Feather name="user" size={12} color="#64748B" />
                      <Text style={estilos.metaTexto}>{m.dirigida_a}</Text>
                    </View>
                  ) : null}

                  {m.plazo ? (
                    <View style={estilos.meta}>
                      <Feather name="calendar" size={12} color="#64748B" />
                      <Text style={estilos.metaTexto}>Para el {fechaCorta(m.plazo)}</Text>
                    </View>
                  ) : null}
                </View>

                <View style={estilos.acciones}>
                  <TouchableOpacity style={estilos.accion} onPress={() => cambiarEstado(m)}>
                    <Feather name={atendida ? 'rotate-ccw' : 'check'} size={14} color="#2563EB" />
                    <Text style={estilos.accionTexto}>
                      {atendida ? 'Marcar pendiente' : 'Marcar atendida'}
                    </Text>
                  </TouchableOpacity>

                  {puedeBorrar(m) && (
                    <TouchableOpacity style={estilos.accion} onPress={() => borrar(m)}>
                      <Feather name="trash-2" size={14} color="#EF4444" />
                      <Text style={[estilos.accionTexto, { color: '#EF4444' }]}>Eliminar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal visible={modal} animationType="slide" transparent onRequestClose={() => setModal(false)}>
        <View style={estilos.fondo}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setModal(false)} />
          <View style={estilos.hoja}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={estilos.titulo}>Nueva indicación</Text>

              <Text style={estilos.etiqueta}>Asunto *</Text>
              <TextInput
                style={estilos.campo}
                placeholder="Ej. Corregir nivel de firme"
                value={asunto}
                onChangeText={setAsunto}
              />

              <Text style={estilos.etiqueta}>Indicación *</Text>
              <TextInput
                style={[estilos.campo, { height: 110, textAlignVertical: 'top' }]}
                placeholder="Qué se pide, dónde y con qué criterio"
                value={indicacion}
                onChangeText={setIndicacion}
                multiline
              />

              <Text style={estilos.etiqueta}>Dirigida a</Text>
              <TextInput
                style={estilos.campo}
                placeholder="Ej. Contratista de albañilería"
                value={dirigidaA}
                onChangeText={setDirigidaA}
              />

              <Text style={estilos.etiqueta}>Fecha compromiso</Text>
              <SelectorFecha valor={plazo} alCambiar={setPlazo} textoVacio="Sin fecha" />

              {/* La evidencia es lo que vuelve a la minuta un documento que
                  prueba algo. Sin foto, es la palabra de alguien contra la de
                  otro cuando se revisa semanas después. */}
              <Text style={estilos.etiqueta}>Evidencia (fotos)</Text>
              <View style={estilos.filaFotos}>
                <TouchableOpacity style={estilos.botonFoto} onPress={() => agregarFoto(true)}>
                  <Feather name="camera" size={16} color="#2563EB" />
                  <Text style={estilos.botonFotoTexto}>Cámara</Text>
                </TouchableOpacity>
                <TouchableOpacity style={estilos.botonFoto} onPress={() => agregarFoto(false)}>
                  <Feather name="image" size={16} color="#2563EB" />
                  <Text style={estilos.botonFotoTexto}>Galería</Text>
                </TouchableOpacity>
              </View>

              {evidencias.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                  {evidencias.map((uri, i) => (
                    <View key={uri + i} style={estilos.miniatura}>
                      <Image source={{ uri }} style={estilos.miniaturaFoto} resizeMode="cover" />
                      <TouchableOpacity
                        style={estilos.quitarFoto}
                        onPress={() => setEvidencias((p) => p.filter((_, n) => n !== i))}
                      >
                        <Feather name="x" size={12} color="#FFF" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              ) : null}

              <TouchableOpacity style={estilos.guardar} onPress={guardar} disabled={guardando}>
                {guardando ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator color="#FFF" />
                    {subiendoFoto ? <Text style={estilos.guardarTexto}>Subiendo fotos…</Text> : null}
                  </View>
                ) : (
                  <Text style={estilos.guardarTexto}>Guardar indicación</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* La empresa se elige al generar, no antes: la misma obra puede llevar
          minutas de ROCAL y de JD segun de quien sea el contrato. */}
      <Modal visible={!!eligiendoEmpresa} transparent animationType="fade" onRequestClose={() => setEligiendoEmpresa(null)}>
        <Pressable style={estilos.fondoSelector} onPress={() => setEligiendoEmpresa(null)}>
          <Pressable style={estilos.selector}>
            <Text style={estilos.selectorTitulo}>¿En hoja de qué empresa?</Text>

            {EMPRESAS_MINUTA.map((e) => (
              <TouchableOpacity
                key={e.clave}
                style={[estilos.opcionEmpresa, { borderColor: e.color }]}
                onPress={() => eligiendoEmpresa && generarMinuta(eligiendoEmpresa, e.clave)}
              >
                <Image
                  source={{ uri: EMPRESAS[e.clave].logo }}
                  style={estilos.logoEmpresa}
                  resizeMode="contain"
                  accessibilityLabel={`Hoja membretada de ${e.etiqueta}`}
                />
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={estilos.cancelarSelector} onPress={() => setEligiendoEmpresa(null)}>
              <Text style={estilos.cancelarSelectorTexto}>Cancelar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const estilos = StyleSheet.create({
  filaFotos: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  botonFoto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#2563EB',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  botonFotoTexto: { color: '#2563EB', fontWeight: '700', fontSize: 12 },
  miniatura: { width: 76, height: 76, marginRight: 8, borderRadius: 8, overflow: 'hidden' },
  miniaturaFoto: { width: '100%', height: '100%' },
  quitarFoto: {
    position: 'absolute',
    top: 3,
    right: 3,
    backgroundColor: '#DC2626',
    borderRadius: 10,
    padding: 3,
  },
  filaEmpresas: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  botonMinuta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#2563EB',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    minWidth: 140,
    justifyContent: 'center',
  },
  botonMinutaTexto: { color: '#2563EB', fontWeight: '700', fontSize: 12 },
  fondoSelector: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', padding: 28 },
  selector: { backgroundColor: '#FFF', borderRadius: 14, padding: 18, gap: 10 },
  selectorTitulo: { fontSize: 15, fontWeight: '800', color: '#0F172A', marginBottom: 4, textAlign: 'center' },
  opcionEmpresa: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  logoEmpresa: { width: '100%', height: 56 },
  cancelarSelector: { paddingVertical: 8, alignItems: 'center' },
  cancelarSelectorTexto: { color: '#64748B', fontSize: 13, fontWeight: '600' },
  tarjeta: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tarjetaAtendida: { backgroundColor: '#F8FAFC', borderColor: '#D1FAE5' },
  encabezado: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  asunto: { flex: 1, fontSize: 15, fontWeight: 'bold', color: '#0F172A' },
  sello: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  selloPendiente: { backgroundColor: '#FEF3C7' },
  selloAtendida: { backgroundColor: '#D1FAE5' },
  selloTexto: { fontSize: 11, fontWeight: 'bold' },
  indicacion: { marginTop: 8, fontSize: 14, color: '#334155', lineHeight: 20 },
  metaFila: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaTexto: { fontSize: 12, color: '#64748B' },
  acciones: {
    flexDirection: 'row',
    gap: 18,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  accion: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  accionTexto: { fontSize: 12, color: '#2563EB', fontWeight: 'bold' },
  botonAgregar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    marginHorizontal: 16,
    marginTop: 14,
    paddingVertical: 13,
    borderRadius: 12,
    gap: 8,
  },
  botonAgregarTexto: { color: '#FFF', fontSize: 14, fontWeight: 'bold' },
  fondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 20 },
  hoja: { backgroundColor: '#FFF', borderRadius: 24, padding: 22, maxHeight: '88%' },
  titulo: { fontSize: 18, fontWeight: 'bold', color: '#1E293B', marginBottom: 16 },
  etiqueta: { fontSize: 13, color: '#475569', fontWeight: '600', marginBottom: 6, marginTop: 10 },
  campo: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#0F172A',
  },
  guardar: {
    backgroundColor: '#2563EB',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 22,
  },
  guardarTexto: { color: '#FFF', fontWeight: 'bold', fontSize: 15 },
});
