export const generarPlantillaInventario = (items: any[]) => {
  
  // 1. Agrupamos los elementos por Semana
  const groupedItems = items.reduce((acc: Record<string, any[]>, item: any) => {
    const week = item.week_label || 'Semana sin definir';
    if (!acc[week]) acc[week] = [];
    acc[week].push(item);
    return acc;
  }, {});

  let rowsHtml = '';
  let granTotal = 0;

  // 2. Generamos las filas de la tabla agrupadas
  Object.entries(groupedItems).forEach(([week, weekItems]: [string, any[]]) => {
    let weekSubtotal = 0;

    // Encabezado oscuro para separar las semanas
    rowsHtml += `
      <tr>
        <td colspan="6" style="background-color: #E0E7FF; color: #1E3A8A; font-weight: bold; font-size: 11px; padding: 8px 12px; border-bottom: 2px solid #4F46E5;">
          ${week}
        </td>
      </tr>
    `;

    // Filas de materiales de esa semana
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
          <td class="text-right">$${item.unit_price.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
          <td class="text-right text-bold text-green">$${importe.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
          <td class="signature-cell"><div class="signature-line"></div></td>
        </tr>
      `;
    });

    // Subtotal de la semana
    rowsHtml += `
      <tr>
        <td colspan="4" class="text-right" style="padding-top: 12px; padding-bottom: 25px; color: #475569;"><strong>Subtotal ${week}:</strong></td>
        <td class="text-right text-bold text-green" style="padding-top: 12px; padding-bottom: 25px; font-size: 12px;">$${weekSubtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
        <td></td>
      </tr>
    `;
  });

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

          /* TABLA DE MATERIALES */
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th { background-color: #1E293B; color: #FFF; font-size: 10px; padding: 10px; text-align: left; text-transform: uppercase; }
          th.text-center { text-align: center; }
          th.text-right { text-align: right; }
          
          td { border-bottom: 1px solid #E5E7EB; padding: 10px 8px; font-size: 11px; vertical-align: middle; }
          .bg-gray { background-color: #F8FAFC; }
          
          .role-text { font-size: 9px; color: #64748B; font-style: italic; }
          .text-center { text-align: center !important; }
          .text-right { text-align: right !important; }
          .text-green { color: #059669; }
          .text-bold { font-weight: bold; }
          
          /* LÍNEA PARA FIRMAS */
          .signature-cell { vertical-align: middle; text-align: center; }
          .signature-line { border-bottom: 1px solid #94A3B8; width: 60px; margin: 0 auto; }

          /* RESUMEN TOTAL FINANCIERO */
          .totals-box { 
            margin-top: 20px; 
            border: 2px solid #1E293B; 
            border-radius: 8px; 
            padding: 15px; 
            width: 300px; 
            float: right; 
            background-color: #F8FAFC; 
            page-break-inside: avoid; 
          }
          .totals-row { display: flex; justify-content: space-between; font-size: 14px; align-items: center; }
          .totals-final { font-weight: 800; font-size: 18px; color: #059669; }
          
          .clearfix { clear: both; }
        </style>
      </head>
      <body>

        <div class="header-container">
            <div>
                <div class="company-title">ROCAL</div>
                <div class="report-title">Control de Destajos y Materiales</div>
            </div>
            <div class="project-info">
                <div>Fecha de Emisión: <strong>${fechaFormat}</strong></div>
                <div>Responsable: Ing. Juancarlos Escobar</div>
                <div>Registros en el periodo: ${items.length}</div>
            </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Concepto / Asignación</th>
              <th class="text-center">Cant.</th>
              <th class="text-center">Unid.</th>
              <th class="text-right">P.U.</th>
              <th class="text-right">Importe</th>
              <th class="text-center">Firma / Vo.Bo.</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="totals-box">
          <div class="totals-row">
            <span style="color: #475569; font-weight: bold;">Gran Total Acumulado:</span>
            <span class="totals-final">$${granTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
        
        <div class="clearfix"></div>

      </body>
    </html>
  `;
};