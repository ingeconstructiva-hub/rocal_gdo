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
  estado?: string;
  /** Fotos de lo acordado, ya con direccion firmada. */
  evidencias?: string[];
};

export async function crearPdfMinuta(
  _datos: DatosDeMinuta,
  _clave: Empresa['clave']
): Promise<Blob> {
  throw new Error('Solo se usa en navegador');
}

export async function crearPdfReporteMinutas(
  _minutas: DatosDeMinuta[],
  _clave: Empresa['clave'],
  _proyecto: string
): Promise<Blob> {
  throw new Error('Solo se usa en navegador');
}
