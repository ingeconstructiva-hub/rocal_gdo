/* La minuta como archivo (versión nativa).
 *
 * Metro toma la versión .web.ts al compilar para navegador. En celular el
 * camino es el HTML con expo-print, que ya abre el menú de compartir.
 */
import type { Empresa } from '../lib/membretes';

/* Quien firma la minuta. El cargo va impreso debajo de la raya para que
 * quien reciba la hoja sepa quien le dio la indicacion y quien lo
 * atestigua; el nombre se escribe antes de imprimir cuando ya se sabe, y si
 * se deja vacio la raya queda limpia para escribirlo a mano. */
export type FirmaDeMinuta = { cargo: string; nombre?: string | null };

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
  /** Los tres espacios de firma, en el orden en que salen impresos. */
  firmas?: FirmaDeMinuta[];
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
