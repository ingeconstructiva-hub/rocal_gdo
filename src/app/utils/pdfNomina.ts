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
        <td class="text-center">$${worker.weekly_salary.toFixed(2)}</td>
        <td class="text-center text-red text-bold">
          ${daysAbsent > 0 ? daysAbsent : '-'}
        </td>
        <td class="text-center text-red">
          ${totalDeductions > 0 ? '-$' + totalDeductions.toFixed(2) : '-'}
          ${reasonText}
        </td>
        <td class="text-right text-bold text-green">$${finalSalary.toFixed(2)}</td>
        <td class="signature-cell"><div class="signature-line"></div></td>
      </tr>
    `;
  }).join('');

  // 3. Estructura HTML del Documento con el CSS corregido
  return `
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          @page { margin: 0; size: letter; } 
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; margin: 0; padding: 0; color: #111827; background-color: #FFF; }

          /* 🔴 HEADER CORREGIDO: Toma el ancho completo de la hoja sin deformarse */
          .header { position: fixed; top: 0; left: 0; right: 0; z-index: 9999; }
          .header img { width: 100%; height: auto; display: block; }

          /* FOOTER */
          .footer { position: fixed; bottom: 0; left: 0; right: 0; height: 60px; background-color: #FFF; border-top: 3px solid #00AEEF; text-align: center; padding: 15px 40px 0 40px; z-index: 9999; }
          .footer p { margin: 3px 0; font-size: 10px; color: #4B5563; }
          .footer strong { color: #111827; }

          /* CONTENIDO PRINCIPAL */
          /* Se ajustó el padding-top para que el texto empiece justo debajo del nuevo tamaño del banner */
          .content { padding-top: 140px; padding-bottom: 100px; padding-left: 40px; padding-right: 40px; }
          
          .report-info { text-align: left; padding-bottom: 10px; border-bottom: 2px solid #E5E7EB; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
          .report-info-left h2 { margin: 0; color: #1E3A8A; font-size: 20px; text-transform: uppercase; font-weight: 800; }
          .report-info-left p { margin: 4px 0; font-size: 13px; color: #4B5563; }
          .report-info-right { text-align: right; }
          .report-info-right p { margin: 4px 0; font-size: 13px; color: #4B5563; }

          /* TABLA DE NÓMINA */
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th { background-color: #1E293B; color: #FFF; font-size: 11px; padding: 10px; text-align: center; text-transform: uppercase; }
          td { border-bottom: 1px solid #E5E7EB; padding: 12px 10px; font-size: 12px; vertical-align: middle; }
          .bg-gray { background-color: #F9FAFB; }
          
          .role-text { font-size: 10px; color: #6B7280; }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .text-red { color: #DC2626; }
          .text-green { color: #059669; }
          .text-bold { font-weight: bold; }
          
          /* LÍNEA PARA FIRMAR */
          .signature-cell { vertical-align: middle; padding-top: 20px; }
          .signature-line { border-bottom: 1px solid #4B5563; width: 120px; margin: 0 auto; }

          /* RESUMEN TOTAL FINANCIERO */
          .totals-box { margin-top: 30px; border: 2px solid #1E293B; border-radius: 8px; padding: 15px; width: 250px; float: right; background-color: #F8FAFC; page-break-inside: avoid; }
          .totals-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; }
          .totals-final { border-top: 1px solid #CBD5E1; padding-top: 8px; font-weight: bold; font-size: 16px; color: #059669; }
        </style>
      </head>
      <body>

        <div class="header">
          <img src="https://ckvuwlcjlyzmxprwjyup.supabase.co/storage/v1/object/public/assets/Captura%20de%20pantalla%202026-06-01%20125231.png" />
        </div>

        <div class="footer">
          <p><strong>Dirección:</strong> Calle 5 de Mayo No. 197, San Nicolás, San Pablo del Monte, Tlaxcala C.P. 90930.</p>
          <p><strong>Teléfonos:</strong> Oficina (222) 589 62 20 | Celulares 2228257268 / 2211936804</p>
          <p><strong>Digital:</strong> Correo: ccrocal@gmail.com | FB: Consultoría y Construcciones ROCAL</p>
        </div>

        <div class="content">
          <div class="report-info">
            <div class="report-info-left">
              <h2>Reporte de Raya Semanal</h2>
              <p><strong>Semana:</strong> ${weekLabel}</p>
            </div>
            <div class="report-info-right">
              <p><strong>Responsable:</strong> Ing. Juancarlos Escobar</p>
              <p><strong>Plantilla:</strong> ${workers.length} Trabajadores activos</p>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="text-align: left;">Trabajador / Puesto</th>
                <th>Sueldo Base</th>
                <th>Faltas</th>
                <th>Descuentos</th>
                <th style="text-align: right;">Total a Pagar</th>
                <th>Firma de Recibido</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div class="totals-box">
            <div class="totals-row">
              <span>Nómina Base:</span>
              <span>$${totalBase.toFixed(2)}</span>
            </div>
            <div class="totals-row">
              <span>Descuentos Totales:</span>
              <span class="text-red">-$${(totalBase - totalFinal).toFixed(2)}</span>
            </div>
            <div class="totals-row totals-final">
              <span>Gran Total:</span>
              <span>$${totalFinal.toFixed(2)}</span>
            </div>
          </div>
          
          <div style="clear: both;"></div>

        </div>
      </body>
    </html>
  `;
};