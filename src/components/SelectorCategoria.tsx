/* Menu desplegable de categorias, compartido por bitacora y planos.
 *
 * Antes cada pantalla tenia su propia fila de chips: se amontonaban conforme
 * se agregaban categorias, y la logica de crear y borrar estaba duplicada en
 * las dos.
 *
 * Las categorias que inventa la obra viven en la base y son por obra, para que
 * residente y oficina vean la misma lista. Las de fabrica viven en el codigo
 * de cada pantalla: siempre estan y no se pueden borrar.
 */

import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Aviso } from '../lib/aviso';
import { mensajeDeError } from '../lib/errores';
import { supabase } from '../lib/supabase';

type Props = {
  valor: string;
  alCambiar: (categoria: string) => void;
  /** Que pantalla pide las categorias: 'bitacora' o 'planos'. */
  modulo: string;
  /** Las de fabrica, que siempre aparecen y no se borran. */
  categoriasBase: string[];
  projectId?: string | null;
  sinConexion?: boolean;
};

export function SelectorCategoria({
  valor,
  alCambiar,
  modulo,
  categoriasBase,
  projectId,
  sinConexion,
}: Props) {
  const [abierto, setAbierto] = useState(false);
  const [propias, setPropias] = useState<string[]>([]);
  const [agregando, setAgregando] = useState(false);
  const [nueva, setNueva] = useState('');

  const lista = [...categoriasBase, ...propias.filter((c) => !categoriasBase.includes(c))];

  useEffect(() => {
    if (!projectId || sinConexion) return;

    let vivo = true;
    supabase
      .from('bitacora_categorias')
      .select('nombre')
      .eq('project_id', projectId)
      .eq('modulo', modulo)
      .order('nombre')
      .then(({ data, error }) => {
        // Mientras no se corran los SQL, la tabla o la columna no existen, y la
        // pantalla tiene que seguir sirviendo con las de fabrica.
        if (!vivo || error || !data) return;
        setPropias(data.map((c: any) => c.nombre).filter(Boolean));
      });

    return () => {
      vivo = false;
    };
  }, [projectId, modulo, sinConexion]);

  const agregar = async () => {
    const nombre = nueva.trim();
    setAgregando(false);
    setNueva('');
    if (!nombre) return;

    if (!lista.includes(nombre)) setPropias((prev) => [...prev, nombre]);
    alCambiar(nombre);
    setAbierto(false);

    if (!projectId || sinConexion || categoriasBase.includes(nombre)) return;

    const { error } = await supabase
      .from('bitacora_categorias')
      .insert([{ project_id: projectId, nombre, modulo }]);

    // 23505 es que ya existia, que es justo lo que se queria. 42703 es que
    // falta correr sql/categorias_por_modulo.sql; tampoco vale la pena gritar.
    if (error && error.code !== '23505' && error.code !== '42703') {
      Aviso.alert('Aviso', mensajeDeError(error, 'guardar la categoria para la obra'));
    }
  };

  const borrar = async (nombre: string) => {
    setPropias((prev) => prev.filter((c) => c !== nombre));
    if (valor === nombre) alCambiar(categoriasBase[0]);

    if (!projectId || sinConexion) return;

    await supabase
      .from('bitacora_categorias')
      .delete()
      .eq('project_id', projectId)
      .eq('modulo', modulo)
      .eq('nombre', nombre);
  };

  return (
    <View style={{ zIndex: 20 }}>
      <TouchableOpacity
        style={estilos.caja}
        onPress={() => {
          setAbierto(!abierto);
          setAgregando(false);
        }}
        activeOpacity={0.7}
      >
        <Text style={estilos.valor} numberOfLines={1}>
          {valor || 'Elige una categoria'}
        </Text>
        <Feather name={abierto ? 'chevron-up' : 'chevron-down'} size={20} color="#64748B" />
      </TouchableOpacity>

      {abierto && (
        <View style={estilos.menu}>
          {lista.map((cat) => {
            const esBase = categoriasBase.includes(cat);
            return (
              <View key={cat} style={[estilos.renglon, valor === cat && estilos.renglonActivo]}>
                <TouchableOpacity
                  style={estilos.renglonToque}
                  onPress={() => {
                    alCambiar(cat);
                    setAbierto(false);
                  }}
                >
                  <Text style={[estilos.renglonTexto, valor === cat && estilos.renglonTextoActivo]}>
                    {cat}
                  </Text>
                </TouchableOpacity>

                {!esBase && (
                  <TouchableOpacity onPress={() => borrar(cat)} style={estilos.borrar} hitSlop={8}>
                    <Feather name="x" size={16} color="#EF4444" />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          {agregando ? (
            <View style={estilos.renglon}>
              <TextInput
                style={estilos.entrada}
                placeholder="Nombre de la categoria"
                value={nueva}
                onChangeText={setNueva}
                onSubmitEditing={agregar}
                autoFocus
              />
              <TouchableOpacity onPress={agregar} style={estilos.aceptar}>
                <Feather name="check" size={16} color="#FFF" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={estilos.renglonToque} onPress={() => setAgregando(true)}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Feather name="plus" size={16} color="#2563EB" />
                <Text style={estilos.agregarTexto}> Agregar otra</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  caja: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  valor: { fontSize: 14, color: '#0F172A', fontWeight: '500', flex: 1 },
  menu: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    marginTop: 6,
    overflow: 'hidden',
    elevation: 4,
    boxShadow: '0px 4px 6px rgba(0, 0, 0, 0.1)',
  },
  renglon: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  renglonActivo: { backgroundColor: '#EFF6FF' },
  renglonToque: { flex: 1, paddingVertical: 13, paddingHorizontal: 14 },
  renglonTexto: { fontSize: 14, color: '#334155', fontWeight: '500' },
  renglonTextoActivo: { color: '#2563EB', fontWeight: 'bold' },
  borrar: { paddingHorizontal: 14, paddingVertical: 13 },
  entrada: { flex: 1, paddingVertical: 11, paddingHorizontal: 14, fontSize: 14, color: '#0F172A' },
  aceptar: { backgroundColor: '#2563EB', margin: 8, borderRadius: 8, padding: 8 },
  agregarTexto: { fontSize: 14, color: '#2563EB', fontWeight: 'bold' },
});
