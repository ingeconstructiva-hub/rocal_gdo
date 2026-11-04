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
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { compartirODescargar, sePuedeCompartir } from '../lib/exportar.web';
import { crearPdfReporte } from '../lib/pdfReporte.web';
import type { Reporte } from '../lib/reporte';

/* El reporte viaja junto al HTML para poder armar el archivo al compartir.
 * Sin el, lo unico que hay es el dialogo de impresion, que en iOS es un menu
 * de impresora del que hay que adivinar como salir con un PDF. */
type Documento = { html: string; nombre: string; reporte?: Reporte };

let entregar: ((doc: Documento) => void) | null = null;
const fila: Documento[] = [];

/** La llama exportar.web.ts cuando hay que mostrar un reporte. */
export function mostrarVistaPrevia(html: string, nombreArchivo: string, reporte?: Reporte) {
  const doc = { html, nombre: nombreArchivo, reporte };
  if (entregar) entregar(doc);
  else fila.push(doc);
}

export function VistaPreviaPDF() {
  const [documento, setDocumento] = useState<Documento | null>(null);
  const [compartiendo, setCompartiendo] = useState(false);
  const marcoRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    entregar = (doc) => setDocumento(doc);
    if (fila.length > 0) setDocumento(fila.shift()!);
    return () => {
      entregar = null;
    };
  }, []);

  if (!documento) return null;

  /* El boton cambia de nombre, no se esconde.
   *
   * En celular el sistema abre el menu de compartir; en una computadora con
   * Chrome no existe ese menu, asi que descarga el archivo. Esconderlo en
   * escritorio dejaba sin salida: ahi el unico camino era el dialogo de
   * impresion, que es justo lo que estorbaba. */
  const hayReporte = !!documento?.reporte;
  const etiquetaAccion = sePuedeCompartir() ? 'Compartir' : 'Descargar PDF';

  const compartir = async () => {
    if (!documento?.reporte) return;
    setCompartiendo(true);
    try {
      const blob = crearPdfReporte(documento.reporte);
      await compartirODescargar(blob, documento.nombre, 'application/pdf');
    } finally {
      setCompartiendo(false);
    }
  };

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

          {hayReporte ? (
            <Pressable onPress={compartir} disabled={compartiendo} style={estilos.botonCompartir}>
              {compartiendo ? (
                <ActivityIndicator size="small" color="#04342C" />
              ) : (
                <Text style={estilos.textoCompartir}>{etiquetaAccion}</Text>
              )}
            </Pressable>
          ) : null}

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
            {hayReporte
              ? `Toca "${etiquetaAccion}" para quedarte con el archivo, o "Guardar PDF" para imprimirlo.`
              : 'Para guardarlo, toca "Guardar PDF" y elige Guardar como PDF en el menú de impresión.'}
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
  botonCompartir: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#2ECC71', minWidth: 86, alignItems: 'center' },
  textoCompartir: { color: '#04342C', fontWeight: '700', fontSize: 13 },
  botonImprimir: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#FFFFFF' },
  textoImprimir: { color: '#20398E', fontWeight: '700', fontSize: 13 },
  pie: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  ayuda: { fontSize: 11, color: '#64748B', textAlign: 'center' },
});
