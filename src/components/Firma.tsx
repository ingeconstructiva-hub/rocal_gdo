/* Recuadro de firma (versión nativa).
 *
 * En celular seguimos usando react-native-signature-canvas de siempre.
 *
 * En navegador Metro toma `Firma.web.tsx`, porque esa librería funciona sobre
 * un WebView, y react-native-webview NO tiene versión web: en su lugar pinta un
 * texto rojo que dice "React Native WebView does not support this platform".
 * Es decir, en la PWA no se podía firmar nada.
 */

import { forwardRef } from 'react';
import SignatureScreen, { SignatureViewRef } from 'react-native-signature-canvas';

export type FirmaRef = SignatureViewRef;

type Props = {
  onOK: (firma: string) => void;
  descriptionText?: string;
  webStyle?: string;
  autoClear?: boolean;
  /* En celular lo recorta la libreria; en navegador lo hace recortar().
   * Sin esto la firma viaja rodeada de espacio vacio y en el PDF se ve
   * diminuta aunque se haya firmado grande. */
  trimWhitespace?: boolean;
};

export const Firma = forwardRef<FirmaRef, Props>((props, ref) => (
  <SignatureScreen ref={ref} {...props} />
));

Firma.displayName = 'Firma';
