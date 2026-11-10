import type { Reporte } from '../lib/reporte';

/* El reporte de destajos, como datos.
 *
 * Se lee por destajista, no por semana ni por renglón suelto: lo que se
 * revisa en obra es cuánto trabajo hizo cada maestro y cuánto se le debe por
 * él. Así es como lo llevaban en Excel antes de la app —un bloque por
 * persona, sus actividades debajo y su total al cierre— y es el papel que ya
 * saben leer.
 *
 * Cada bloque abre con quién encargó el trabajo, quién lo hizo y cuánto
 * suma; después van sus actividades con unidad, volumen, precio unitario e
 * importe.
 */

const pesos = (n: number) =>
  `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* El volumen se escribe como se capturó.
 *
 * Son medidas de obra: 0.3675 m³ de cepa o 7.52 m² de trazo. Redondearlas a
 * dos decimales cambiaría el importe contra el que se coteja la raya, así que
 * se deja el número tal cual y solo se le quitan los ceros de relleno.
 */
const volumen = (n: unknown) => {
  const numero = Number(n ?? 0);
  if (!Number.isFinite(numero)) return String(n ?? '');
  return String(Number(numero.toFixed(4)));
};

export const generarReporteInventario = (
  items: any[],
  projectName: string = 'Obra sin nombre',
  responsable: string = ''
): Reporte => {
  /* Se agrupa por quién hizo el trabajo. Los registros sin destajista no se
   * esconden: van juntos en su propio bloque, porque un importe sin dueño es
   * justo lo que hay que notar al revisar. */
  const porMaestro = new Map<string, any[]>();
  for (const item of items) {
    const maestro = (item.in_charge || '').trim() || 'Sin destajista';
    if (!porMaestro.has(maestro)) porMaestro.set(maestro, []);
    porMaestro.get(maestro)!.push(item);
  }

  let granTotal = 0;

  const grupos = [...porMaestro.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'es'))
    .map(([maestro, registros]) => {
      let subtotal = 0;

      const filas = registros.map((item) => {
        const importe = Number(item.quantity || 0) * Number(item.unit_price || 0);
        subtotal += importe;

        return [
          item.name || '',
          item.unit || '',
          volumen(item.quantity),
          pesos(item.unit_price),
          pesos(importe),
        ];
      });

      granTotal += subtotal;

      /* Quién encargó el trabajo sale del propio registro. Si en una misma
       * tanda lo encargaron varios, se nombran todos: el bloque es del
       * destajista, no del que encargó. */
      const encargados = [
        ...new Set(registros.map((r) => (r.requested_by || '').trim()).filter(Boolean)),
      ].join(' / ');

      const titulo = [
        encargados ? `ENCARGA: ${encargados}` : '',
        maestro.toUpperCase(),
        `DESTAJO: ${pesos(subtotal)}`,
      ]
        .filter(Boolean)
        .join('        ');

      return {
        titulo,
        filas,
        subtotal: ['', '', '', 'TOTAL:', pesos(subtotal)],
      };
    });

  /* Cuando lo que se imprime es una sola semana, se dice cuál. Si la tanda
   * trae varias, el papel es el acumulado y poner una sola fecha mentiría. */
  const semanas = [...new Set(items.map((i) => i.week_label).filter(Boolean))];
  const encabezado = [
    semanas.length === 1 ? `Semana: ${semanas[0]}` : '',
    responsable ? `Responsable: ${responsable}` : '',
    `Destajistas: ${grupos.length}`,
  ]
    .filter(Boolean)
    .join('  ·  ');

  return {
    titulo: 'CONSTRUCTORA ROCAL',
    subtitulo: `Control de destajos - ${projectName}${encabezado ? `\n${encabezado}` : ''}`,
    columnas: ['Actividades', 'Un.', 'Volumen', 'P.U.', 'Importe'],
    columnasNumericas: [2, 3, 4],
    filas: [],
    grupos,
    totales: ['', '', '', 'GRAN TOTAL:', pesos(granTotal)],
  };
};
