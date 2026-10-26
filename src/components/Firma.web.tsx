/* Recuadro de firma (versión navegador).
 *
 * Dibuja sobre un <canvas> del navegador, con el dedo o con el mouse.
 * Expone la misma forma que react-native-signature-canvas para que la pantalla
 * de resguardos no cambie: onOK, clearSignature() y readSignature().
 *
 * Entrega la firma como PNG en base64, igual que la versión de celular, así
 * que el resto del flujo (subir a Supabase, meterla en el PDF) sigue igual.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export type FirmaRef = {
  clearSignature: () => void;
  readSignature: () => void;
};

type Props = {
  onOK: (firma: string) => void;
  descriptionText?: string;
  webStyle?: string;
  autoClear?: boolean;
  trimWhitespace?: boolean;
};

/* Recorta el lienzo a lo que de verdad se dibujo.
 *
 * El canvas ocupa todo el ancho del modal, pero una firma usa una fraccion de
 * ese espacio. Al exportarlo completo se guardaba una imagen casi vacia, y el
 * PDF la encajaba en 65px de alto: el trazo quedaba diminuto aunque la persona
 * hubiera firmado grande. Recortando al rectangulo del trazo, la firma llena
 * el espacio que le toca.
 *
 * El lienzo es transparente salvo el trazo (el blanco lo pone el View de
 * atras), asi que basta mirar el canal alfa.
 */
const recortar = (lienzo: HTMLCanvasElement): string => {
  const ctx = lienzo.getContext('2d');
  if (!ctx) return lienzo.toDataURL('image/png');

  const { width, height } = lienzo;
  let datos: ImageData;
  try {
    datos = ctx.getImageData(0, 0, width, height);
  } catch {
    // Lienzo "manchado" por seguridad del navegador: mejor sin recortar.
    return lienzo.toDataURL('image/png');
  }

  let x1 = width, y1 = height, x2 = -1, y2 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (datos.data[(y * width + x) * 4 + 3] > 10) {
        if (x < x1) x1 = x;
        if (x > x2) x2 = x;
        if (y < y1) y1 = y;
        if (y > y2) y2 = y;
      }
    }
  }

  if (x2 < 0) return lienzo.toDataURL('image/png');

  // Un respiro alrededor para que el trazo no quede pegado al borde.
  const margen = Math.round(Math.max(width, height) * 0.03);
  x1 = Math.max(0, x1 - margen);
  y1 = Math.max(0, y1 - margen);
  x2 = Math.min(width - 1, x2 + margen);
  y2 = Math.min(height - 1, y2 + margen);

  const recorte = document.createElement('canvas');
  recorte.width = x2 - x1 + 1;
  recorte.height = y2 - y1 + 1;
  recorte
    .getContext('2d')
    ?.drawImage(lienzo, x1, y1, recorte.width, recorte.height, 0, 0, recorte.width, recorte.height);

  return recorte.toDataURL('image/png');
};

export const Firma = forwardRef<FirmaRef, Props>(({ onOK, descriptionText }, ref) => {

  const lienzoRef = useRef<HTMLCanvasElement | null>(null);
  const contenedorRef = useRef<any>(null);
  const dibujando = useRef(false);
  const hayTrazo = useRef(false);

  // El canvas se dibuja al tamaño real de pantalla del dispositivo: si no, la
  // firma se ve borrosa en celulares de pantalla densa.
  useEffect(() => {
    const lienzo = lienzoRef.current;
    const contenedor = contenedorRef.current;
    if (!lienzo || !contenedor) return;

    const ajustar = () => {
      // Medimos el propio canvas (que por CSS ya ocupa todo el contenedor):
      // medir el contenedor antes de que tenga tamaño dejaba el canvas en 0 de ancho.
      const caja = lienzo.getBoundingClientRect();
      if (caja.width === 0 || caja.height === 0) return;

      const densidad = window.devicePixelRatio || 1;
      const ancho = Math.round(caja.width * densidad);
      const alto = Math.round(caja.height * densidad);

      // Cambiar el tamaño del canvas BORRA lo dibujado. Si la medida es la misma
      // no tocamos nada: así abrir el teclado o girar el teléfono no borra una
      // firma a medio hacer.
      if (lienzo.width === ancho && lienzo.height === alto) return;

      lienzo.width = ancho;
      lienzo.height = alto;

      const ctx = lienzo.getContext('2d');
      if (!ctx) return;
      ctx.scale(densidad, densidad);
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#111827';
    };

    ajustar();
    window.addEventListener('resize', ajustar);

    // El tamaño real llega después del primer dibujado: lo volvemos a medir
    // cuando el contenedor cambie de tamaño.
    const observador = new ResizeObserver(ajustar);
    observador.observe(contenedor);

    return () => {
      window.removeEventListener('resize', ajustar);
      observador.disconnect();
    };
  }, []);

  const posicion = (evento: PointerEvent) => {
    const caja = lienzoRef.current!.getBoundingClientRect();
    return { x: evento.clientX - caja.left, y: evento.clientY - caja.top };
  };

  useEffect(() => {
    const lienzo = lienzoRef.current;
    if (!lienzo) return;
    const ctx = lienzo.getContext('2d');
    if (!ctx) return;

    const empezar = (e: PointerEvent) => {
      dibujando.current = true;
      hayTrazo.current = true;
      // Algunos navegadores rechazan capturar el puntero: no es motivo para
      // que deje de funcionar la firma.
      try {
        lienzo.setPointerCapture(e.pointerId);
      } catch {}
      const { x, y } = posicion(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
    };

    const mover = (e: PointerEvent) => {
      if (!dibujando.current) return;
      e.preventDefault(); // Evita que la página se arrastre mientras se firma
      const { x, y } = posicion(e);
      ctx.lineTo(x, y);
      ctx.stroke();
    };

    const terminar = () => {
      dibujando.current = false;
    };

    lienzo.addEventListener('pointerdown', empezar);
    lienzo.addEventListener('pointermove', mover);
    lienzo.addEventListener('pointerup', terminar);
    lienzo.addEventListener('pointerleave', terminar);

    return () => {
      lienzo.removeEventListener('pointerdown', empezar);
      lienzo.removeEventListener('pointermove', mover);
      lienzo.removeEventListener('pointerup', terminar);
      lienzo.removeEventListener('pointerleave', terminar);
    };
  }, []);

  const limpiar = () => {
    const lienzo = lienzoRef.current;
    const ctx = lienzo?.getContext('2d');
    if (!lienzo || !ctx) return;
    ctx.clearRect(0, 0, lienzo.width, lienzo.height);
    hayTrazo.current = false;
  };

  useImperativeHandle(ref, () => ({
    clearSignature: limpiar,
    readSignature: () => {
      // Si está vacío no avisamos: la pantalla ya valida que haya firma.
      if (!hayTrazo.current || !lienzoRef.current) return;
      onOK(recortar(lienzoRef.current));
    },
  }));

  return (
    <View style={estilos.contenedor} ref={contenedorRef}>
      <canvas
        ref={lienzoRef}
        style={{ width: '100%', height: '100%', touchAction: 'none', display: 'block', cursor: 'crosshair' }}
      />
      <View style={estilos.pie} pointerEvents="none">
        <View style={estilos.linea} />
        <Text style={estilos.texto}>{descriptionText || 'Firma aquí'}</Text>
      </View>
    </View>
  );
});

Firma.displayName = 'Firma';

const estilos = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  pie: { position: 'absolute', left: 16, right: 16, bottom: 10 },
  linea: { height: 1, backgroundColor: '#CBD5E1', marginBottom: 6 },
  texto: { fontSize: 11, color: '#94A3B8', textAlign: 'center' },
});
