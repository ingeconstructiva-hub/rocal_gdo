/* El membrete de la empresa, para los documentos que se dibujan en HTML.
 *
 * Es lo mismo que ya llevaba la minuta: el logo y los datos arriba, la franja
 * de contacto abajo. Vive aparte porque ahora lo usan todos los reportes —
 * nómina, caja chica, destajos, gastos, maquinaria, bitácora y la responsiva —
 * y tenerlo dibujado siete veces habría significado siete formatos distintos
 * el día que cambie un teléfono.
 *
 * La empresa se elige al generar el documento, no se guarda con los datos: la
 * misma obra factura por ROCAL o por JD según de quién sea el contrato.
 */

import { EMPRESAS, type Empresa } from './membretes';

export type ClaveEmpresa = Empresa['clave'];

const escapar = (valor: unknown) =>
  String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/* El pie se pega abajo de la hoja, no abajo del contenido.
 *
 * Con `position: fixed` dentro de una hoja impresa, el motor lo repite en
 * cada página y siempre al ras del margen. Sin eso, un reporte corto dejaba
 * el pie a media hoja y uno largo lo empujaba a una página en blanco.
 */
export const membreteCss = (clave?: ClaveEmpresa | null): string => {
  if (!clave) return '';
  const empresa = EMPRESAS[clave];
  const alto = empresa.pie.length * 11 + 14;

  return `
    .membrete { display: flex; align-items: flex-start; justify-content: space-between;
                gap: 16px; border-bottom: 3px solid #2563eb; padding-bottom: 8px; margin-bottom: 14px; }
    .membrete img { width: ${empresa.anchoLogo * 3.5}px; }
    .membrete-datos { text-align: right; }
    .membrete-empresa { font-weight: bold; font-size: 12px; color: #0f172a; }
    .membrete-dato { font-size: 9px; color: #334155; }
    .membrete-pie { position: fixed; left: 0; right: 0; bottom: 0;
                    border-top: 2px solid #2563eb; padding-top: 5px;
                    text-align: center; font-size: 8px; color: #64748b; line-height: 1.35; }
    /* El hueco que deja libre el pie fijo, para que la tabla no se le encime. */
    body { padding-bottom: ${alto}px; }
  `;
};

export const membreteArriba = (clave?: ClaveEmpresa | null): string => {
  if (!clave) return '';
  const empresa = EMPRESAS[clave];

  const datos = empresa.encabezado
    .map((renglon, i) =>
      i === 0
        ? `<div class="membrete-empresa">${escapar(renglon)}</div>`
        : `<div class="membrete-dato">${escapar(renglon)}</div>`
    )
    .join('');

  return `
    <div class="membrete">
      <img src="${empresa.logo}" alt="" />
      <div class="membrete-datos">${datos}</div>
    </div>`;
};

export const membreteAbajo = (clave?: ClaveEmpresa | null): string => {
  if (!clave) return '';
  const empresa = EMPRESAS[clave];
  return `<div class="membrete-pie">${empresa.pie
    .map((renglon) => `<div>${escapar(renglon)}</div>`)
    .join('')}</div>`;
};
