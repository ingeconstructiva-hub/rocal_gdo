export const generarPlantillaNomina = (workers: any[], weekLabel: string) => {
  
  // 1. Lógica matemática
  const calculateFinalSalary = (w: any) => {
    const dailySalary = w.weekly_salary / 5;
    const attendanceArray = w.attendance || [true, true, true, true, true];
    const daysPresent = attendanceArray.filter(Boolean).length;
    const extraDeduction = Number(w.extraDeduction || 0);
    return Math.max(0, (dailySalary * daysPresent) - extraDeduction);
  };

  const totalBase = workers.reduce((sum, w) => sum + Number(w.weekly_salary), 0);
  const totalFinal = workers.reduce((sum, w) => sum + calculateFinalSalary(w), 0);

  // 2. Generamos las filas de la tabla
  const rowsHtml = workers.map((worker, index) => {
    const dailySalary = worker.weekly_salary / 5;
    const attendanceArray = worker.attendance || [true, true, true, true, true];
    
    const daysPresent = attendanceArray.filter(Boolean).length;
    const daysAbsent = 5 - daysPresent;
    
    const absenceDeduction = daysAbsent * dailySalary;
    const extraDeduction = Number(worker.extraDeduction || 0);
    const totalDeductions = absenceDeduction + extraDeduction;
    
    const finalSalary = calculateFinalSalary(worker);

    const reasonText = worker.reason 
      ? `<br><span style="font-size: 9px; color: #DC2626;">(${worker.reason})</span>` 
      : '';

    return `
      <tr class="${index % 2 === 0 ? 'bg-gray' : ''}">
        <td>
          <strong>${worker.name}</strong><br>
          <span class="role-text">${worker.role}</span>
        </td>
        <td class="text-center">$${worker.weekly_salary.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
        <td class="text-center text-red text-bold">
          ${daysAbsent > 0 ? daysAbsent : '-'}
        </td>
        <td class="text-center text-red">
          ${totalDeductions > 0 ? '-$' + totalDeductions.toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '-'}
          ${reasonText}
        </td>
        <td class="text-right text-bold text-green">$${finalSalary.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
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
            <span>$${totalBase.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
          </div>
          <div class="totals-row">
            <span>Descuentos Totales Aplicados:</span>
            <span class="text-red">-$${(totalBase - totalFinal).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
          </div>
          <div class="totals-row totals-final">
            <span style="color:#0F172A;">Total a Pagar (Real):</span>
            <span>$${totalFinal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
        
        <div class="clearfix"></div>

      </body>
    </html>
  `;
};