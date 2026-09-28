/* Vista previa de documentos (versión navegador).
 *
 * Muestra el reporte DENTRO de la app, en una ventana que se puede cerrar.
 * Antes se abría en otra pestaña del navegador y el usuario quedaba atrapado
 * ahí: sin botón de regreso y sin forma de volver a la app.
 *
 * Desde aquí se puede imprimir o guardar como PDF, que en navegador es la forma
 * de generar el archivo.
 */

import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

type Documento = { html: string; nombre: string };

let entregar: ((doc: Documento) => void) | null = null;
const fila: Documento[] = [];

/** La llama exportar.web.ts cuando hay que mostrar un reporte. */
export function mostrarVistaPrevia(html: string, nombreArchivo: string) {
  const doc = { html, nombre: nombreArchivo };
  if (entregar) entregar(doc);
  else fila.push(doc);
}

export function VistaPreviaPDF() {
  const [documento, setDocumento] = useState<Documento | null>(null);
  const marcoRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    entregar = (doc) => setDocumento(doc);
    if (fila.length > 0) setDocumento(fila.shift()!);
    return () => {
      entregar = null;
    };
  }, []);

  if (!documento) return null;

  const imprimir = () => {
    const ventana = marcoRef.current?.contentWindow;
    if (!ventana) return;
    ventana.focus();
    ventana.print();
  };

  return (
    <Modal visible transparent={false} animationType="slide" onRequestClose={() => setDocumento(null)}>
      <View style={estilos.contenedor}>
        <View style={estilos.barra}>
          <Pressable onPress={() => setDocumento(null)} style={estilos.botonCerrar} accessibilityLabel="Cerrar vista previa">
            <Text style={estilos.textoCerrar}>✕  Cerrar</Text>
          </Pressable>

          <Text style={estilos.titulo} numberOfLines={1}>
            {documento.nombre.replace(/\.pdf$/i, '')}
          </Text>

          <Pressable onPress={imprimir} style={estilos.botonImprimir}>
            <Text style={estilos.textoImprimir}>Guardar PDF</Text>
          </Pressable>
        </View>

        <iframe
          ref={marcoRef}
          srcDoc={documento.html}
          title={documento.nombre}
          style={{ flex: 1, width: '100%', border: 'none', backgroundColor: '#FFFFFF' }}
        />

        <View style={estilos.pie}>
          <Text style={estilos.ayuda}>
            Para guardarlo, toca "Guardar PDF" y elige Guardar como PDF en el menú de impresión.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: '#F4F6FA' },
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#20398E',
  },
  titulo: { flex: 1, color: '#FFFFFF', fontWeight: '700', fontSize: 14, textAlign: 'center' },
  botonCerrar: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.15)' },
  textoCerrar: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  botonImprimir: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#FFFFFF' },
  textoImprimir: { color: '#20398E', fontWeight: '700', fontSize: 13 },
  pie: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  ayuda: { fontSize: 11, color: '#64748B', textAlign: 'center' },
});
