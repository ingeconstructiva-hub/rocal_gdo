export const generarPlantillaInventario = (items: any[]) => {
  
  // 1. Agrupamos los elementos por Semana (Agregamos los tipos ': Record<string, any[]>' e ': any')
  const groupedItems = items.reduce((acc: Record<string, any[]>, item: any) => {
    const week = item.week_label || 'Semana sin definir';
    if (!acc[week]) acc[week] = [];
    acc[week].push(item);
    return acc;
  }, {});

  let rowsHtml = '';
  let granTotal = 0;

  // 2. Generamos las filas de la tabla agrupadas (Agregamos tipos al arreglo entry)
  Object.entries(groupedItems).forEach(([week, weekItems]: [string, any[]]) => {
    let weekSubtotal = 0;

    // Encabezado oscuro para separar las semanas
    rowsHtml += `
      <tr>
        <td colspan="6" style="background-color: #E0E7FF; color: #1E3A8A; font-weight: bold; font-size: 11px; padding: 6px 10px; border-bottom: 2px solid #4F46E5;">
          ${week}
        </td>
      </tr>
    `;

    // Filas de materiales de esa semana (Agregamos ': any' y ': number')
    weekItems.forEach((item: any, index: number) => {
      const importe = item.quantity * item.unit_price;
      weekSubtotal += importe;
      granTotal += importe;

      const asignacion = [];
      if (item.in_charge) asignacion.push(`Recibe: ${item.in_charge}`);
      if (item.requested_by) asignacion.push(`Solicita: ${item.requested_by}`);
      const asignacionText = asignacion.length > 0 
        ? `<br><span class="role-text">${asignacion.join(' | ')}</span>` 
        : '';

      rowsHtml += `
        <tr class="${index % 2 === 0 ? 'bg-gray' : ''}">
          <td>
            <strong>${item.name}</strong>
            ${asignacionText}
          </td>
          <td class="text-center">${item.quantity}</td>
          <td class="text-center">${item.unit}</td>
          <td class="text-center">$${item.unit_price.toFixed(2)}</td>
          <td class="text-right text-bold text-green">$${importe.toFixed(2)}</td>
          <td class="signature-cell"><div class="signature-line"></div></td>
        </tr>
      `;
    });

    // Subtotal de la semana
    rowsHtml += `
      <tr>
        <td colspan="4" class="text-right" style="padding-top: 10px; padding-bottom: 20px;"><strong>Subtotal ${week}:</strong></td>
        <td class="text-right text-bold" style="color: #059669; padding-top: 10px; padding-bottom: 20px;">$${weekSubtotal.toFixed(2)}</td>
        <td></td>
      </tr>
    `;
  });

  // 3. Estructura HTML del Documento
  return `
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          @page { margin: 0; size: letter; } 
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; margin: 0; padding: 0; color: #111827; background-color: #FFF; }

          /* HEADER Y FOOTER FIJOS */
          .header { position: fixed; top: 0; left: 0; right: 0; z-index: 9999; }
          .header img { width: 100%; height: auto; display: block; }

          .footer { position: fixed; bottom: 0; left: 0; right: 0; height: 60px; background-color: #FFF; border-top: 3px solid #00AEEF; text-align: center; padding: 15px 40px 0 40px; z-index: 9999; }
          .footer p { margin: 3px 0; font-size: 10px; color: #4B5563; }
          .footer strong { color: #111827; }

          /* CONTENIDO PRINCIPAL */
          .content { padding-top: 140px; padding-bottom: 100px; padding-left: 40px; padding-right: 40px; }
          
          .report-info { text-align: left; padding-bottom: 10px; border-bottom: 2px solid #E5E7EB; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
          .report-info-left h2 { margin: 0; color: #1E3A8A; font-size: 20px; text-transform: uppercase; font-weight: 800; }
          .report-info-left p { margin: 4px 0; font-size: 13px; color: #4B5563; }
          .report-info-right { text-align: right; }
          .report-info-right p { margin: 4px 0; font-size: 13px; color: #4B5563; }

          /* TABLA DE MATERIALES */
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th { background-color: #1E293B; color: #FFF; font-size: 11px; padding: 10px; text-align: center; text-transform: uppercase; }
          td { border-bottom: 1px solid #E5E7EB; padding: 10px; font-size: 11px; vertical-align: middle; }
          .bg-gray { background-color: #F9FAFB; }
          
          .role-text { font-size: 9px; color: #6B7280; }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .text-green { color: #059669; }
          .text-bold { font-weight: bold; }
          
          /* LÍNEA PARA FIRMAS */
          .signature-cell { vertical-align: middle; padding-top: 15px; }
          .signature-line { border-bottom: 1px solid #4B5563; width: 80px; margin: 0 auto; }

          /* RESUMEN TOTAL FINANCIERO */
          .totals-box { margin-top: 20px; border: 2px solid #1E293B; border-radius: 8px; padding: 15px; width: 250px; float: right; background-color: #F8FAFC; page-break-inside: avoid; }
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
              <h2>Reporte de Gastos y Destajos</h2>
              <p><strong>Generado el:</strong> ${new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>
            <div class="report-info-right">
              <p><strong>Responsable:</strong> Ing. Juancarlos Escobar</p>
              <p><strong>Total de registros:</strong> ${items.length}</p>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="text-align: left;">Concepto / Asignación</th>
                <th>Cant.</th>
                <th>Unidad</th>
                <th>P.U.</th>
                <th style="text-align: right;">Importe</th>
                <th>Firma / Vo.Bo.</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div class="totals-box">
            <div class="totals-row totals-final">
              <span>Gran Total Invertido:</span>
              <span>$${granTotal.toFixed(2)}</span>
            </div>
          </div>
          
          <div style="clear: both;"></div>

        </div>
      </body>
    </html>
  `;
};