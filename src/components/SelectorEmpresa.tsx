/* ¿En hoja de qué empresa?
 *
 * La misma obra factura por ROCAL o por JD según de quién sea el contrato, así
 * que la empresa no se guarda con los datos: se pregunta al generar el
 * documento. Antes solo lo preguntaban las minutas y los demás reportes salían
 * en una hoja sin membrete, que en obra no sirve para entregar.
 *
 * Se usa como una pregunta, no como una pantalla:
 *
 *     const empresa = await pedirEmpresa();
 *     if (!empresa) return;            // cerró el cuadro
 *
 * El cuadro vive una sola vez, colgado en el layout, igual que la vista previa.
 */

import { Image, Modal, Pressable, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { EMPRESAS } from '../lib/membretes';
import type { ClaveEmpresa } from '../lib/membreteHtml';
import { useEffect, useState } from 'react';

const OPCIONES = [
  { clave: 'rocal' as const, etiqueta: 'ROCAL', color: '#1E3A8A' },
  { clave: 'jd' as const, etiqueta: 'JD', color: '#15803D' },
];

type Responder = (clave: ClaveEmpresa | null) => void;

let abrir: ((responder: Responder) => void) | null = null;

/* Devuelve la empresa elegida, o null si cerraron el cuadro.
 *
 * Si el cuadro todavía no está montado —solo pasa si alguien exporta en el
 * primer parpadeo de la app— se responde null en vez de dejar la promesa
 * colgada: un botón que no hace nada se vuelve a picar, uno que se queda
 * girando para siempre parece que se trabó la app.
 */
export function pedirEmpresa(): Promise<ClaveEmpresa | null> {
  return new Promise((resolver) => {
    if (!abrir) {
      resolver(null);
      return;
    }
    abrir(resolver);
  });
}

export function SelectorEmpresa() {
  const [responder, setResponder] = useState<Responder | null>(null);

  useEffect(() => {
    // La función se guarda envuelta: setState con una función la ejecutaría.
    abrir = (r) => setResponder(() => r);
    return () => {
      abrir = null;
    };
  }, []);

  const contestar = (clave: ClaveEmpresa | null) => {
    responder?.(clave);
    setResponder(null);
  };

  return (
    <Modal visible={!!responder} transparent animationType="fade" onRequestClose={() => contestar(null)}>
      <Pressable style={estilos.fondo} onPress={() => contestar(null)}>
        <Pressable style={estilos.cuadro}>
          <Text style={estilos.titulo}>¿En hoja de qué empresa?</Text>

          {OPCIONES.map((e) => (
            <TouchableOpacity
              key={e.clave}
              style={[estilos.opcion, { borderColor: e.color }]}
              onPress={() => contestar(e.clave)}
            >
              <Image source={{ uri: EMPRESAS[e.clave].logo }} style={estilos.logo} resizeMode="contain" />
              <Text style={[estilos.opcionTexto, { color: e.color }]}>{e.etiqueta}</Text>
            </TouchableOpacity>
          ))}

          {/* Cerrar aquí no genera nada: el documento se entrega en hoja de
              alguna de las dos, no hay una tercera opción. */}
          <TouchableOpacity style={estilos.sinMembrete} onPress={() => contestar(null)}>
            <Text style={estilos.sinMembreteTexto}>Cancelar</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', padding: 28 },
  cuadro: { backgroundColor: '#FFF', borderRadius: 14, padding: 18, gap: 10 },
  titulo: { fontSize: 15, fontWeight: '800', color: '#0F172A', marginBottom: 4, textAlign: 'center' },
  opcion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 12,
  },
  logo: { width: 74, height: 30 },
  opcionTexto: { fontWeight: '800', fontSize: 14 },
  sinMembrete: { paddingVertical: 8, alignItems: 'center' },
  sinMembreteTexto: { color: '#64748B', fontSize: 13, fontWeight: '600' },
});
