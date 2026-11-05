import { EMPRESAS, type Empresa } from '../lib/membretes';
import type { DatosDeMinuta } from './pdfMinutaArchivo';

/* La minuta dibujada como HTML.
 *
 * Es lo que se ve en la vista previa y lo que imprime el celular con
 * expo-print. El PDF del navegador lo arma jsPDF aparte, pero los dos salen
 * de los mismos datos y del mismo membrete, así que dicen lo mismo.
 */

const escapar = (valor: unknown) =>
  String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/* "2026-11-07" se lee como medianoche UTC, y al mostrarla en México se
 * corre al día anterior: un plazo del 7 salía impreso como 6. Una fecha sin
 * hora se arma a mano para que sea el día que dice, en el reloj de aquí. */
const comoLocal = (iso: string): Date => {
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!soloFecha) return new Date(iso);
  return new Date(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3]));
};

const fecha = (iso?: string | null) => {
  if (!iso) return '—';
  const d = comoLocal(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
};

const hora = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
};

export const minutaAHtml = (datos: DatosDeMinuta, clave: Empresa['clave']): string => {
  const empresa = EMPRESAS[clave];

  const encabezado = empresa.encabezado
    .map((r, i) =>
      i === 0
        ? `<div class="empresa">${escapar(r)}</div>`
        : `<div class="dato">${escapar(r)}</div>`
    )
    .join('');

  const pie = empresa.pie.map((r) => `<div>${escapar(r)}</div>`).join('');

  const campo = (etiqueta: string, valor: unknown) =>
    `<div class="campo"><span class="etiqueta">${etiqueta}</span> ${escapar(valor || '—')}</div>`;

  const extras = [
    datos.dirigidaA ? campo('DIRIGIDA A:', datos.dirigidaA) : '',
    datos.plazo ? campo('PLAZO:', fecha(datos.plazo)) : '',
  ].join('');

  return `
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"><style>
      @page { size: A4 portrait; margin: 14mm; }
      body { font-family: 'Helvetica', sans-serif; color: #1e293b; font-size: 11px; }
      .membrete { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; border-bottom: 3px solid #2563eb; padding-bottom: 8px; }
      .membrete img { width: ${empresa.anchoLogo * 3.5}px; }
      .datos-empresa { text-align: right; }
      .empresa { font-weight: bold; font-size: 12px; }
      .dato { font-size: 9px; color: #334155; }
      h1 { text-align: center; font-size: 17px; letter-spacing: 1px; margin: 22px 0 16px; }
      .rejilla { display: flex; flex-wrap: wrap; }
      .campo { width: 50%; margin-bottom: 7px; font-size: 11px; }
      .etiqueta { font-weight: bold; }
      .seccion { font-weight: bold; font-size: 12px; margin: 14px 0 6px; }
      .temas { text-align: justify; white-space: pre-wrap; line-height: 1.5; }
      .croquis { border: 1px solid #cbd5e1; border-radius: 4px; height: 240px; margin-top: 4px; }
      .firmas { display: flex; justify-content: space-around; margin-top: 34px; }
      .firma { width: 40%; text-align: center; border-top: 1px solid #475569; padding-top: 4px; font-size: 9px; font-weight: bold; }
      .pie { margin-top: 26px; border-top: 2px solid #2563eb; padding-top: 6px; text-align: center; font-size: 8px; color: #64748b; }
      .separador { border: none; border-top: 1px solid #e2e8f0; margin: 10px 0; }
    </style></head>
    <body>
      <div class="membrete">
        <img src="${empresa.logo}" alt="" />
        <div class="datos-empresa">${encabezado}</div>
      </div>

      <h1>MINUTA DE TRABAJO</h1>

      <div class="rejilla">
        ${campo('ASUNTO:', datos.asunto)}
        ${campo('NO. DE MINUTA:', datos.numero)}
        ${campo('PROYECTO:', datos.proyecto)}
        ${campo('FECHA:', fecha(datos.creada))}
        ${campo('UBICACIÓN:', datos.ubicacion)}
        ${campo('HORA:', hora(datos.creada))}
        ${extras}
      </div>

      <hr class="separador" />

      <div class="seccion">TEMAS TRATADOS:</div>
      <div class="temas">${escapar(datos.indicacion)}</div>

      <div class="seccion">CROQUIS:</div>
      <div class="croquis"></div>

      <div class="firmas">
        <div class="firma">ELABORÓ</div>
        <div class="firma">DE ENTERADO</div>
      </div>

      <div class="pie">${pie}</div>
    </body></html>
  `;
};
