/* La minuta como archivo (versión nativa).
 *
 * Metro toma la versión .web.ts al compilar para navegador. En celular el
 * camino es el HTML con expo-print, que ya abre el menú de compartir.
 */
import type { Empresa } from '../lib/membretes';

export type DatosDeMinuta = {
  asunto: string;
  indicacion: string;
  dirigidaA?: string | null;
  plazo?: string | null;
  creada: string;
  numero: string;
  proyecto: string;
  ubicacion?: string | null;
};

export async function crearPdfMinuta(
  _datos: DatosDeMinuta,
  _clave: Empresa['clave']
): Promise<Blob> {
  throw new Error('Solo se usa en navegador');
}
