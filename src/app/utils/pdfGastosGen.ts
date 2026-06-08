export const generarPlantillaGastos = (
  projectName: string,
  resumen: { destajo: number; caja: number; otros: number },
  detallesDestajo: any[],
  detallesCaja: any[],
  detallesOtros: any[]
) => {
  const totalAcumulado = resumen.destajo + resumen.caja + resumen.otros;
  const fecha = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

  // 1. Generador de filas para Destajos
  let filasDestajo = '';
  if (detallesDestajo.length === 0) {
    filasDestajo = `<tr><td colspan="4" style="text-align:center; color:#94a3b8; padding: 15px;">Sin registros de materiales.</td></tr>`;
  } else {
    detallesDestajo.forEach(item => {
      const total = item.quantity * item.unit_price;
      filasDestajo += `
        <tr>
          <td>${item.item_name || 'Material'}</td>
          <td class="text-center">${item.quantity}</td>
          <td class="text-right">$${Number(item.unit_price).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
          <td class="text-right amount">$${total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
        </tr>`;
    });
  }

  // 2. Generador de filas para Caja Chica
  let filasCaja = '';
  if (detallesCaja.length === 0) {
    filasCaja = `<tr><td colspan="3" style="text-align:center; color:#94a3b8; padding: 15px;">Sin registros de caja chica.</td></tr>`;
  } else {
    detallesCaja.forEach(item => {
      filasCaja += `
        <tr>
          <td class="text-center">${new Date(item.fecha).toLocaleDateString('es-MX')}</td>
          <td>${item.concepto}</td>
          <td class="text-right amount">$${Number(item.monto).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
        </tr>`;
    });
  }

  // 3. Generador de filas para Generales
  let filasGenerales = '';
  if (detallesOtros.length === 0) {
    filasGenerales = `<tr><td colspan="3" style="text-align:center; color:#94a3b8; padding: 15px;">Sin registros de gastos de administración.</td></tr>`;
  } else {
    detallesOtros.forEach(item => {
      filasGenerales += `
        <tr>
          <td>${item.concepto}</td>
          <td class="text-center">${item.categoria || 'General'}</td>
          <td class="text-right amount">$${Number(item.monto).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
        </tr>`;
    });
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Reporte Consolidado de Gastos</title>
        <style>
            * {
                box-sizing: border-box;
            }
            @page {
                size: A4;
                margin: 0; /* Quitamos el margen base para controlarlo desde el body */
            }
            body { 
                font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
                color: #1e293b; 
                margin: 0; 
                padding: 40px; /* <-- ESTO CREA EL MARGEN PERFECTO EN TODOS LADOS */
                font-size: 12px; 
                background-color: #ffffff;
            }
            .header-container { 
                border-bottom: 3px solid #2563eb; 
                padding-bottom: 15px; 
                margin-bottom: 30px; 
                display: flex; 
                justify-content: space-between; 
                align-items: flex-end; 
            }
            .company-title { font-size: 24px; font-weight: bold; margin: 0; letter-spacing: -0.5px; }
            .report-title { font-size: 14px; color: #2563eb; font-weight: 800; text-transform: uppercase; margin-top: 5px; letter-spacing: 0.5px; }
            .project-info { text-align: right; color: #475569; line-height: 1.5; font-size: 11px;}
            .project-name { font-size: 14px; font-weight: bold; color: #0f172a; }
            
            .metrics-table { width: 100%; border-collapse: separate; border-spacing: 12px 0; margin-bottom: 35px; margin-left: -6px; }
            .metric-card { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px 10px; text-align: center; width: 25%; }
            .total-card { background-color: #1e293b; border-color: #1e293b; }
            
            /* Textos de las cajitas más oscuros para que se lean bien */
            .metric-label { font-size: 9px; font-weight: 800; text-transform: uppercase; color: #475569; margin-bottom: 6px; }
            .total-card .metric-label { color: #cbd5e1; }
            
            .metric-value { font-size: 14px; font-weight: bold; color: #0f172a; }
            .total-card .metric-value { color: #ffffff; font-size: 16px; }

            h2 { font-size: 14px; font-weight: bold; color: #1e293b; border-left: 4px solid #2563eb; padding-left: 10px; margin-top: 30px; margin-bottom: 15px; page-break-after: avoid; }
            
            .data-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
            .data-table th { background-color: #f1f5f9; color: #334155; font-weight: 800; font-size: 10px; text-transform: uppercase; text-align: left; padding: 10px 12px; border-bottom: 2px solid #cbd5e1; }
            .data-table td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 11px; color: #334155; vertical-align: middle; }
            .data-table tr:nth-child(even) { background-color: #f8fafc; }
            
            .text-right { text-align: right !important; }
            .text-center { text-align: center !important; }
            .amount { font-weight: bold; color: #0f172a; }
            .amount-positive { color: #059669; font-weight: bold; font-size: 12px;}
            
            .row-summary { background-color: #f8fafc !important; font-weight: bold; }
            .row-summary td { border-top: 2px solid #cbd5e1; border-bottom: 2px solid #cbd5e1; color: #0f172a; padding: 12px;}
        </style>
    </head>
    <body>

        <div class="header-container">
            <div>
                <div class="company-title">ROCAL</div>
                <div class="report-title">Estado Financiero Consolidado</div>
            </div>
            <div class="project-info">
                <div>Proyecto / Obra:</div>
                <div class="project-name">${projectName}</div>
                <div>Fecha de Emisión: ${fecha}</div>
            </div>
        </div>

        <table class="metrics-table">
            <tr>
                <td class="metric-card total-card">
                    <div class="metric-label">Total Acumulado</div>
                    <div class="metric-value">$${totalAcumulado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
                </td>
                <td class="metric-card">
                    <div class="metric-label">Destajos / Mat.</div>
                    <div class="metric-value">$${resumen.destajo.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
                </td>
                <td class="metric-card">
                    <div class="metric-label">Caja Chica</div>
                    <div class="metric-value">$${resumen.caja.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
                </td>
                <td class="metric-card">
                    <div class="metric-label">Administración</div>
                    <div class="metric-value">$${resumen.otros.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
                </td>
            </tr>
        </table>

        <h2>1. Desglose de Destajos y Materiales</h2>
        <table class="data-table">
            <thead>
              <tr>
                <th style="width: 45%;">Concepto / Material</th>
                <th style="width: 15%; text-align: center;">Cantidad</th>
                <th style="width: 20%; text-align: right;">Precio Unit.</th>
                <th style="width: 20%; text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${filasDestajo}
              <tr class="row-summary">
                <td colspan="3">Subtotal Destajos y Materiales</td>
                <td class="text-right amount-positive">$${resumen.destajo.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
              </tr>
            </tbody>
        </table>

        <h2>2. Desglose de Caja Chica (Gastos Menores)</h2>
        <table class="data-table">
            <thead>
              <tr>
                <th style="width: 20%; text-align: center;">Fecha</th>
                <th style="width: 55%;">Concepto del Gasto</th>
                <th style="width: 25%; text-align: right;">Monto</th>
              </tr>
            </thead>
            <tbody>
              ${filasCaja}
              <tr class="row-summary">
                <td colspan="2">Subtotal Caja Chica</td>
                <td class="text-right amount-positive">$${resumen.caja.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
              </tr>
            </tbody>
        </table>

        <h2>3. Gastos de Administración y Logística</h2>
        <table class="data-table">
            <thead>
              <tr>
                <th style="width: 55%;">Concepto Operativo</th>
                <th style="width: 25%; text-align: center;">Categoría</th>
                <th style="width: 20%; text-align: right;">Monto</th>
              </tr>
            </thead>
            <tbody>
              ${filasGenerales}
              <tr class="row-summary">
                <td colspan="2">Subtotal Administración y Otros</td>
                <td class="text-right amount-positive">$${resumen.otros.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
              </tr>
            </tbody>
        </table>

    </body>
    </html>
  `;
};