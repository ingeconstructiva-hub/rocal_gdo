/* Avisos de la app (versión navegador).
 *
 * react-native-web trae el Alert vacío (`static alert() {}`), así que aquí
 * dibujamos nuestro propio cuadro con los mismos colores de la app.
 *
 * Se usa igual que el Alert de siempre:
 *   Aviso.alert('Título', 'Mensaje');
 *   Aviso.alert('¿Borrar?', 'No se puede deshacer', [
 *     { text: 'Cancelar', style: 'cancel' },
 *     { text: 'Borrar', style: 'destructive', onPress: borrar },
 *   ]);
 */

import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export type BotonAviso = {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

type AvisoPendiente = { titulo: string; mensaje?: string; botones?: BotonAviso[] };

// El contenedor se registra aquí al montarse. Mientras no exista, los avisos
// esperan en la fila en lugar de perderse.
let entregar: ((aviso: AvisoPendiente) => void) | null = null;
const fila: AvisoPendiente[] = [];

export const Aviso = {
  alert(titulo: string, mensaje?: string, botones?: BotonAviso[]) {
    const aviso = { titulo, mensaje, botones };
    if (entregar) entregar(aviso);
    else fila.push(aviso);
  },
};

export function ContenedorDeAvisos() {
  const [actual, setActual] = useState<AvisoPendiente | null>(null);

  useEffect(() => {
    entregar = (aviso) => setActual(aviso);
    if (fila.length > 0) setActual(fila.shift()!);

    return () => {
      entregar = null;
    };
  }, []);

  if (!actual) return null;

  const botones: BotonAviso[] = actual.botones?.length ? actual.botones : [{ text: 'Entendido' }];

  const cerrar = (boton: BotonAviso) => {
    setActual(fila.length > 0 ? fila.shift()! : null);
    boton.onPress?.();
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => cerrar(botones[0])}>
      <View style={estilos.fondo}>
        <View style={estilos.cuadro}>
          <Text style={estilos.titulo}>{actual.titulo}</Text>
          {actual.mensaje ? <Text style={estilos.mensaje}>{actual.mensaje}</Text> : null}

          {/* Con tres botones (o etiquetas largas como "Tomar Foto (Cámara)")
              la fila no cabe en un celular y el primero se sale de la pantalla.
              A partir de tres, se acomodan uno debajo de otro. */}
          <View style={[estilos.botones, botones.length > 2 && estilos.botonesEnColumna]}>
            {botones.map((boton, i) => (
              <Pressable
                key={`${boton.text}-${i}`}
                onPress={() => cerrar(boton)}
                style={({ pressed }) => [
                  estilos.boton,
                  botones.length > 2 && estilos.botonAncho,
                  boton.style === 'cancel' && estilos.botonCancelar,
                  boton.style === 'destructive' && estilos.botonPeligro,
                  pressed && estilos.botonPresionado,
                ]}
              >
                <Text
                  style={[
                    estilos.textoBoton,
                    boton.style === 'cancel' && estilos.textoCancelar,
                  ]}
                >
                  {boton.text}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  fondo: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  cuadro: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    boxShadow: '0px 8px 20px rgba(0, 0, 0, 0.18)', 
    
    
    
    elevation: 8,
  },
  titulo: { fontSize: 17, fontWeight: '700', color: '#111827' },
  mensaje: { fontSize: 14, color: '#4B5563', marginTop: 8, lineHeight: 20 },
  botones: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 20, flexWrap: 'wrap' },
  botonesEnColumna: { flexDirection: 'column', alignItems: 'stretch' },
  botonAncho: { width: '100%' },
  boton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: '#1A56DB' },
  botonCancelar: { backgroundColor: '#F1F5F9' },
  botonPeligro: { backgroundColor: '#EF4444' },
  botonPresionado: { opacity: 0.8 },
  textoBoton: { color: '#FFFFFF', fontWeight: '700', fontSize: 14, textAlign: 'center' },
  textoCancelar: { color: '#334155' },
});
