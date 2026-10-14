'use client';

/* Papelera: recupera lo que un residente quitó por error.
 *
 * El borrado de los residentes no destruye nada: marca el registro como
 * inactivo, y el aviso les promete que "un administrador puede recuperarlo".
 * Esa puerta no existía, así que lo quitado quedaba en un limbo que solo se
 * veía entrando a la base de datos. Esta pantalla es esa puerta.
 *
 * Solo para administradores, que es lo que dice la promesa.
 */

import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SkeletonLista } from '../components/Skeleton';
import { useProject } from '../context/ProjectContext';
import { useUser } from '../context/UserContext';
import { Aviso } from '../lib/aviso';
import { mensajeDeError } from '../lib/errores';
import { regresar } from '../lib/navegar';
import { useRefrescar } from '../lib/refrescar';
import { supabase } from '../lib/supabase';

/* Cada tabla guarda sus cosas con nombres distintos, así que aquí se dice cómo
 * sacar de cada una lo único que esta pantalla necesita: un título, un detalle
 * y una fecha para ordenar. */
type Origen = {
  tabla: string;
  etiqueta: string;
  icono: keyof typeof Feather.glyphMap;
  color: string;
  titulo: (r: any) => string;
  detalle: (r: any) => string;
  cuando: (r: any) => string | null;
};

const dinero = (valor: any) =>
  `$${Number(valor || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

const ORIGENES: Origen[] = [
  {
    tabla: 'caja_chica',
    etiqueta: 'Gasto de caja chica',
    icono: 'shopping-cart',
    color: '#EC4899',
    titulo: (r) => r.concepto || 'Gasto sin concepto',
    detalle: (r) => `${dinero(r.monto)} · ${r.encargado || 'Sin encargado'}`,
    cuando: (r) => r.fecha,
  },
  {
    tabla: 'ingresos_obra',
    etiqueta: 'Inversión',
    icono: 'trending-up',
    color: '#10B981',
    titulo: (r) => r.concepto || 'Inversión',
    detalle: (r) => dinero(r.monto),
    cuando: (r) => r.fecha,
  },
  {
    tabla: 'inventory',
    etiqueta: 'Destajo',
    icono: 'package',
    color: '#F59E0B',
    titulo: (r) => r.name || 'Destajo',
    detalle: (r) => `${r.quantity ?? 0} ${r.unit || ''} · ${dinero(r.unit_price)}`,
    cuando: (r) => r.created_at,
  },
  {
    tabla: 'gastos_maquinaria',
    etiqueta: 'Maquinaria',
    icono: 'truck',
    color: '#4750F6',
    titulo: (r) => r.concepto || 'Registro de maquinaria',
    detalle: (r) => dinero(r.monto),
    cuando: (r) => r.fecha,
  },
  {
    tabla: 'almacen_herramientas',
    etiqueta: 'Herramienta',
    icono: 'tool',
    color: '#64748B',
    titulo: (r) => r.nombre || 'Herramienta',
    detalle: (r) => `${r.codigo || 'S/C'} · ${r.marca_modelo || 'Genérico'}`,
    cuando: (r) => r.created_at,
  },
];

type Eliminado = {
  id: string;
  origen: Origen;
  titulo: string;
  detalle: string;
  cuando: string | null;
};

export default function RecuperarScreen() {
  const { activeProject, isOffline } = useProject();
  const { profile } = useUser();

  const [eliminados, setEliminados] = useState<Eliminado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [restaurando, setRestaurando] = useState<string | null>(null);

  const esAdmin = profile?.role === 'admin';

  const cargar = useCallback(async () => {
    const pid = activeProject?.id;
    if (!pid || !esAdmin) {
      setCargando(false);
      return;
    }

    setCargando(true);
    try {
      // Las cinco tablas se consultan a la vez: son pocas y así la pantalla no
      // tarda cinco viajes seguidos.
      const respuestas = await Promise.all(
        ORIGENES.map((origen) =>
          supabase.from(origen.tabla).select('*').eq('project_id', pid).eq('is_active', false)
        )
      );

      const juntos: Eliminado[] = [];
      respuestas.forEach((respuesta, i) => {
        const origen = ORIGENES[i];
        // Si una tabla falla, las demás igual se muestran: vale más una lista
        // incompleta que una pantalla en blanco.
        if (respuesta.error) {
          console.log(`No se pudo leer ${origen.tabla}:`, respuesta.error.message);
          return;
        }
        (respuesta.data || []).forEach((r: any) => {
          juntos.push({
            id: r.id,
            origen,
            titulo: origen.titulo(r),
            detalle: origen.detalle(r),
            cuando: origen.cuando(r),
          });
        });
      });

      juntos.sort((a, b) => new Date(b.cuando || 0).getTime() - new Date(a.cuando || 0).getTime());
      setEliminados(juntos);
    } catch (e: any) {
      Aviso.alert('Error', mensajeDeError(e, 'leer lo eliminado'));
    } finally {
      setCargando(false);
    }
  }, [activeProject?.id, esAdmin]);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));
  useRefrescar(() => cargar());

  const restaurar = (item: Eliminado) => {
    if (isOffline) {
      Aviso.alert('Sin conexión', 'Necesitas internet para restaurar un registro.');
      return;
    }

    Aviso.alert(
      'Restaurar registro',
      `"${item.titulo}" volverá a aparecer y a contar en los totales. ¿Continuar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Restaurar',
          onPress: async () => {
            setRestaurando(item.id);
            try {
              const { error } = await supabase
                .from(item.origen.tabla)
                .update({ is_active: true })
                .eq('id', item.id);
              if (error) throw error;

              setEliminados((previos) => previos.filter((e) => e.id !== item.id));
              Aviso.alert('Restaurado', 'El registro volvió a su lugar.');
            } catch (e: any) {
              Aviso.alert('No se pudo restaurar', mensajeDeError(e, 'restaurar el registro'));
            } finally {
              setRestaurando(null);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={() => regresar()} style={styles.backButton}>
            <Feather name="chevron-left" size={28} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerSubtitle}>PAPELERA</Text>
          <View style={{ width: 28 }} />
        </View>

        <View>
          <Text style={styles.headerTitle}>Registros eliminados</Text>
          {activeProject?.name && <Text style={styles.headerSmall}>📍 {activeProject.name}</Text>}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {!esAdmin ? (
          <View style={styles.vacio}>
            <Feather name="lock" size={40} color="#CBD5E1" />
            <Text style={styles.vacioTitulo}>Solo para administradores</Text>
            <Text style={styles.vacioTexto}>
              Pídele a un administrador que recupere lo que se borró por error.
            </Text>
          </View>
        ) : cargando ? (
          <SkeletonLista filas={4} />
        ) : eliminados.length === 0 ? (
          <View style={styles.vacio}>
            <Feather name="check-circle" size={40} color="#CBD5E1" />
            <Text style={styles.vacioTitulo}>No hay nada eliminado</Text>
            <Text style={styles.vacioTexto}>
              Aquí aparece lo que se quita por error, para poder devolverlo a su lugar.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.intro}>
              {eliminados.length === 1
                ? '1 registro quitado de esta obra. Sigue guardado y puede volver.'
                : `${eliminados.length} registros quitados de esta obra. Siguen guardados y pueden volver.`}
            </Text>

            {eliminados.map((item) => (
              <View key={`${item.origen.tabla}_${item.id}`} style={styles.tarjeta}>
                <View style={[styles.iconoCaja, { backgroundColor: item.origen.color }]}>
                  <Feather name={item.origen.icono} size={18} color="#FFF" />
                </View>

                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.etiqueta}>{item.origen.etiqueta}</Text>
                  <Text style={styles.titulo} numberOfLines={2}>{item.titulo}</Text>
                  <Text style={styles.detalle} numberOfLines={1}>{item.detalle}</Text>
                  {item.cuando && (
                    <Text style={styles.fecha}>
                      {new Date(item.cuando).toLocaleDateString('es-MX')}
                    </Text>
                  )}
                </View>

                <TouchableOpacity
                  style={styles.botonRestaurar}
                  onPress={() => restaurar(item)}
                  disabled={restaurando === item.id}
                >
                  {restaurando === item.id ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Feather name="rotate-ccw" size={16} color="#FFF" />
                  )}
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}
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
  headerTitle: { color: '#FFF', fontSize: 22, fontWeight: '800' },
  headerSmall: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 4 },

  body: { padding: 20, paddingBottom: 60 },
  intro: { fontSize: 12, color: '#64748B', marginBottom: 14, lineHeight: 17 },

  tarjeta: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 14, padding: 14, marginBottom: 10 },
  iconoCaja: { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  etiqueta: { fontSize: 10, color: '#94A3B8', fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  titulo: { fontSize: 14, fontWeight: '700', color: '#1E293B', marginTop: 2 },
  detalle: { fontSize: 12, color: '#64748B', marginTop: 2 },
  fecha: { fontSize: 11, color: '#94A3B8', marginTop: 3 },
  botonRestaurar: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center' },

  vacio: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 20 },
  vacioTitulo: { fontSize: 16, fontWeight: '700', color: '#475569', marginTop: 14 },
  vacioTexto: { fontSize: 13, color: '#94A3B8', textAlign: 'center', marginTop: 6, lineHeight: 19 },
});
