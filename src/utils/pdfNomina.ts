import { calcularTotalFinal, descuentoTotal, diasFaltados, montoHorasExtra } from '../lib/nomina';

export const generarPlantillaNomina = (workers: any[], weekLabel: string) => {

  // Las cuentas salen de lib/nomina, las mismas que muestra la pantalla. Antes
  // esta plantilla tenia su propia version y no cuadraba con la app.
  const totalBase = workers.reduce((sum, w) => sum + Number(w.weekly_salary), 0);
  const totalExtra = workers.reduce((sum, w) => sum + montoHorasExtra(w), 0);
  const totalDescuentos = workers.reduce((sum, w) => sum + descuentoTotal(w), 0);
  const totalFinal = workers.reduce((sum, w) => sum + calcularTotalFinal(w), 0);

  // 2. Generamos las filas de la tabla
  const rowsHtml = workers.map((worker, index) => {
    const daysAbsent = diasFaltados(worker);
    const totalDeductions = descuentoTotal(worker);
    const extraAmount = montoHorasExtra(worker);
    const finalSalary = calcularTotalFinal(worker);

    const reasonText = worker.reason 
      ? `<br><span style="font-size: 9px; color: #DC2626;">(${worker.reason})</span>` 
      : '';

    // Las horas extra suben el total, asi que se anotan aqui: si no, la fila
    // parece no cuadrar (base menos descuentos no da el total a pagar).
    const extraText = extraAmount > 0
      ? `<br><span style="font-size: 9px; color: #047857;">+$${extraAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} por ${worker.extraHours} hrs extra</span>`
      : '';

    return `
      <tr class="${index % 2 === 0 ? 'bg-gray' : ''}">
        <td>
          <strong>${worker.name_worker}</strong><br>
          <span class="role-text">${worker.role}</span>
        </td>
        <td class="text-center">$${Number(worker.weekly_salary).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="text-center text-red text-bold">
          ${daysAbsent > 0 ? daysAbsent : '-'}
        </td>
        <td class="text-center text-red">
          ${totalDeductions > 0 ? '-$' + totalDeductions.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
          ${reasonText}
          ${extraText}
        </td>
        <td class="text-right text-bold text-green">$${finalSalary.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="signature-cell"><div class="signature-line"></div></td>
      </tr>
    `;
  }).join('');

  const fechaFormat = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

  // 3. Estructura HTML del Documento
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          * { box-sizing: border-box; }
          @page { margin: 0; size: letter; } 
          body { 
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
            margin: 0; 
            padding: 40px; /* MARGEN PERFECTO PARA TODA LA HOJA */
            color: #111827; 
            background-color: #FFF; 
          }

          /* ENCABEZADO CORPORATIVO DE TEXTO */
          .header-container { 
            border-bottom: 3px solid #00AEEF; 
            padding-bottom: 15px; 
            margin-bottom: 25px; 
            display: flex; 
            justify-content: space-between; 
            align-items: flex-end; 
          }
          .company-title { font-size: 24px; font-weight: bold; margin: 0; letter-spacing: -0.5px; }
          .report-title { font-size: 14px; color: #00AEEF; font-weight: 800; text-transform: uppercase; margin-top: 5px; letter-spacing: 0.5px; }
          .project-info { text-align: right; color: #475569; line-height: 1.5; font-size: 11px;}
          .project-name { font-size: 14px; font-weight: bold; color: #0f172a; }

          /* TABLA DE NÓMINA */
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th { background-color: #1E293B; color: #FFF; font-size: 10px; padding: 10px; text-align: left; text-transform: uppercase; }
          th.text-center { text-align: center; }
          th.text-right { text-align: right; }
          
          td { border-bottom: 1px solid #E5E7EB; padding: 12px 10px; font-size: 12px; vertical-align: middle; }
          .bg-gray { background-color: #F8FAFC; }
          
          .role-text { font-size: 10px; color: #64748B; font-style: italic; }
          .text-center { text-align: center !important; }
          .text-right { text-align: right !important; }
          .text-red { color: #DC2626; }
          .text-green { color: #059669; }
          .text-bold { font-weight: bold; }
          
          /* LÍNEA PARA FIRMAS */
          .signature-cell { vertical-align: middle; text-align: center; }
          .signature-line { border-bottom: 1px solid #94A3B8; width: 80px; margin: 0 auto; }

          /* RESUMEN TOTAL FINANCIERO */
          .totals-box { 
            margin-top: 25px; 
            border: 2px solid #1E293B; 
            border-radius: 8px; 
            padding: 15px; 
            width: 320px; 
            float: right; 
            background-color: #F8FAFC; 
            page-break-inside: avoid; 
          }
          .totals-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 13px; color: #475569; font-weight: bold; }
          .totals-final { border-top: 1px solid #CBD5E1; padding-top: 12px; margin-top: 5px; font-weight: 800; font-size: 18px; color: #059669; }
          
          .clearfix { clear: both; }
        </style>
      </head>
      <body>

        <div class="header-container">
            <div>
                <div class="company-title">ROCAL</div>
                <div class="report-title">Reporte de Raya Semanal</div>
            </div>
            <div class="project-info">
                <div>Semana: <strong>${weekLabel}</strong></div>
                <div>Fecha de Emisión: <strong>${fechaFormat}</strong></div>
                <div>Plantilla: ${workers.length} Trabajadores</div>
            </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 35%;">Trabajador / Puesto</th>
              <th class="text-center" style="width: 15%;">Sueldo Base</th>
              <th class="text-center" style="width: 10%;">Faltas</th>
              <th class="text-center" style="width: 15%;">Descuentos</th>
              <th class="text-right" style="width: 15%;">Total a Pagar</th>
              <th class="text-center" style="width: 10%;">Firma de Recibido</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="totals-box">
          <div class="totals-row">
            <span>Nómina Base Teórica:</span>
            <span>$${totalBase.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div class="totals-row">
            <span>Descuentos Totales Aplicados:</span>
            <span class="text-red">-$${totalDescuentos.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div class="totals-row">
            <span>Horas Extra:</span>
            <span style="color:#047857;">+$${totalExtra.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div class="totals-row totals-final">
            <span style="color:#0F172A;">Total a Pagar (Real):</span>
            <span>$${totalFinal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>
        
        <div class="clearfix"></div>

      </body>
    </html>
  `;
};
/* Hoja de raya por semanas ya cerradas.
 *
 * Reimprime lo que quedo guardado en payroll_records, no lo recalcula: si a un
 * trabajador le subieron el sueldo en noviembre, la raya de octubre tiene que
 * seguir diciendo lo que se le pago en octubre. Por eso se usan final_salary y
 * deduction_amount tal como se registraron.
 */
export const generarPlantillaHistorial = (semanas: any[], obra: string) => {
  const dinero = (n: number) =>
    Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const granTotal = semanas.reduce((s, w) => s + Number(w.total || 0), 0);

  const bloques = semanas
    .map((semana) => {
      const filas = semana.registros
        .map((r: any, i: number) => {
          const t = r.workers || {};
          const nota = r.reason
            ? `<br><span style="font-size:9px;color:#DC2626;">(${r.reason})</span>`
            : '';
          return `
            <tr class="${i % 2 === 0 ? 'bg-gray' : ''}">
              <td><strong>${t.name_worker || 'Trabajador dado de baja'}</strong><br><span class="role">${t.role || ''}</span></td>
              <td class="c">$${dinero(t.weekly_salary)}</td>
              <td class="c red b">${Number(r.days_absent) > 0 ? r.days_absent : '-'}</td>
              <td class="c red">${Number(r.deduction_amount) > 0 ? '-$' + dinero(r.deduction_amount) : '-'}${nota}</td>
              <td class="r b green">$${dinero(r.final_salary)}</td>
              <td class="firma"><div class="linea"></div></td>
            </tr>`;
        })
        .join('');

      return `
        <div class="semana">
          <div class="semana-titulo">
            <span>Semana del ${semana.etiqueta}</span>
            <span class="semana-total">$${dinero(semana.total)}</span>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width:35%">Trabajador / Puesto</th>
                <th class="c" style="width:15%">Sueldo Base</th>
                <th class="c" style="width:8%">Faltas</th>
                <th class="c" style="width:15%">Descuentos</th>
                <th class="r" style="width:15%">Total a Pagar</th>
                <th class="c" style="width:12%">Firma</th>
              </tr>
            </thead>
            <tbody>${filas}</tbody>
          </table>
        </div>`;
    })
    .join('');

  const resumen =
    semanas.length > 1
      ? `<div class="gran-total"><span>Total acumulado de ${semanas.length} semanas:</span><span>$${dinero(granTotal)}</span></div>`
      : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  @page { margin: 0; size: letter; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; margin:0; padding:34px; color:#111827; }
  .cabecera { border-bottom:3px solid #00AEEF; padding-bottom:12px; margin-bottom:18px; }
  .cabecera h1 { margin:0; font-size:19px; }
  .cabecera p { margin:3px 0 0; font-size:11px; color:#64748B; }
  .semana { margin-bottom:22px; page-break-inside:avoid; }
  .semana-titulo { display:flex; justify-content:space-between; align-items:baseline;
    background:#0F172A; color:#FFF; padding:7px 10px; font-size:12px; font-weight:bold; }
  .semana-total { color:#34D399; }
  table { width:100%; border-collapse:collapse; font-size:10px; }
  th { background:#E2E8F0; padding:6px; text-align:left; font-size:9px; text-transform:uppercase; color:#334155; }
  td { padding:6px; border-bottom:1px solid #E2E8F0; vertical-align:top; }
  .bg-gray { background:#F8FAFC; }
  .c { text-align:center; } .r { text-align:right; } .b { font-weight:bold; }
  .red { color:#DC2626; } .green { color:#047857; }
  .role { font-size:9px; color:#64748B; }
  .firma { padding-top:14px; }
  .linea { border-bottom:1px solid #94A3B8; height:1px; }
  .gran-total { display:flex; justify-content:space-between; margin-top:10px; padding:11px 10px;
    background:#0F172A; color:#FFF; font-size:13px; font-weight:bold; }
</style></head>
<body>
  <div class="cabecera">
    <h1>Acumulado de Nómina</h1>
    <p>${obra} &nbsp;·&nbsp; ${semanas.length} ${semanas.length === 1 ? 'semana' : 'semanas'} &nbsp;·&nbsp; Emitido el ${new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
  </div>
  ${bloques}
  ${resumen}
</body></html>`;
};
