/* Vista previa de documentos (versión navegador).
 *
 * Muestra el reporte DENTRO de la app, en una ventana que se puede cerrar.
 * Antes se abría en otra pestaña del navegador y el usuario quedaba atrapado
 * ahí: sin botón de regreso y sin forma de volver a la app.
 *
 * Desde aquí se puede imprimir o guardar como PDF, que en navegador es la forma
 * de generar el archivo.
 */

import { Feather } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { compartirODescargar, sePuedeCompartir } from '../lib/exportar.web';

/* Junto al HTML viaja quien sabe armar el archivo. Sin el, lo unico que hay
 * es el dialogo de impresion, que en iOS es un menu de impresora del que hay
 * que adivinar como salir con un PDF. */
export type HacerPdf = () => Blob | Promise<Blob>;

type Documento = { html: string; nombre: string; hacerPdf?: HacerPdf };

let entregar: ((doc: Documento) => void) | null = null;
const fila: Documento[] = [];

/** La llama exportar.web.ts cuando hay que mostrar un reporte. */
export function mostrarVistaPrevia(html: string, nombreArchivo: string, hacerPdf?: HacerPdf) {
  const doc = { html, nombre: nombreArchivo, hacerPdf };
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
  const hayArchivo = !!documento?.hacerPdf;
  const etiquetaAccion = sePuedeCompartir() ? 'Compartir' : 'Descargar PDF';

  const compartir = async () => {
    if (!documento?.hacerPdf) return;
    setCompartiendo(true);
    try {
      const blob = await documento.hacerPdf();
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
          <Pressable onPress={() => setDocumento(null)} style={estilos.boton} accessibilityLabel="Cerrar vista previa">
            <Feather name="x" size={18} color="#FFFFFF" />
          </Pressable>

          <Text style={estilos.titulo} numberOfLines={1}>
            {documento.nombre.replace(/\.pdf$/i, '')}
          </Text>

          {hayArchivo ? (
            <Pressable
              onPress={compartir}
              disabled={compartiendo}
              style={estilos.botonCompartir}
              accessibilityLabel={etiquetaAccion}
            >
              {compartiendo ? (
                <ActivityIndicator size="small" color="#04342C" />
              ) : (
                <Feather name={sePuedeCompartir() ? 'share-2' : 'download'} size={18} color="#04342C" />
              )}
            </Pressable>
          ) : null}

          {/* Es la impresora, no un disquete: por aqui se manda a la
              impresora portatil y tambien se guarda como PDF, que es lo que
              el navegador ofrece en el mismo cuadro. */}
          <Pressable onPress={imprimir} style={estilos.botonImprimir} accessibilityLabel="Imprimir">
            <Feather name="printer" size={18} color="#20398E" />
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
            {hayArchivo
              ? `${etiquetaAccion} con el primer botón; la impresora manda a imprimir o a guardar como PDF.`
              : 'La impresora manda a imprimir, o a guardar como PDF desde el mismo cuadro.'}
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
  /* Cuadrados del mismo tamaño: son blancos de dedo, y uno mas chico que
   * otro se falla en obra con la mano sucia o con guante. */
  boton: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)' },
  botonCompartir: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2ECC71' },
  botonImprimir: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  pie: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  ayuda: { fontSize: 11, color: '#64748B', textAlign: 'center' },
});
