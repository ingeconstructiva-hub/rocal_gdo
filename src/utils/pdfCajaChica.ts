export const generarPlantillaCajaChica = (
  projectName: string,
  saldoDisponible: number,
  totalIngresos: number,
  totalEgresos: number,
  movimientos: any[]
) => {
  const fecha = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  const formatMXN = (val: number) => val.toLocaleString('es-MX', { minimumFractionDigits: 2 });

  let filas = '';
  movimientos.forEach(mov => {
    const esIngreso = mov.tipo === 'ingreso';
    
    let desgloseArticulos = '';
    if (!esIngreso && mov.detalles_json && Array.isArray(mov.detalles_json)) {
      desgloseArticulos = '<ul class="item-breakdown">';
      mov.detalles_json.forEach((art: any) => {
        const subtotal = Number(art.cantidad) * Number(art.precioUnitario);
        desgloseArticulos += `<li>• ${art.cantidad}x ${art.concepto} — $${formatMXN(Number(art.precioUnitario))} c/u = <strong>$${formatMXN(subtotal)}</strong></li>`;
      });
      desgloseArticulos += '</ul>';
    }

    filas += `
      <tr>
        <td style="white-space: nowrap;">${new Date(mov.fecha).toLocaleDateString('es-MX')}</td>
        <td>
            <div class="concepto-title">${esIngreso ? mov.concepto : 'Compra / Salida de Efectivo'}</div>
            <div class="concepto-meta">${esIngreso ? `Ref: ${mov.tipo_deposito}` : `Nota: ${mov.numero_nota || 'S/N'} • ${mov.unidad || 'General'}`}</div>
            ${desgloseArticulos}
            ${(!esIngreso && mov.concepto && !mov.detalles_json) ? `<div class="concepto-meta" style="margin-top:6px;">${mov.concepto}</div>` : ''}
        </td>
        <td class="text-center">
            <span class="badge ${esIngreso ? 'badge-ingreso' : 'badge-egreso'}">${esIngreso ? 'Ingreso' : 'Egreso'}</span>
        </td>
        <td>${mov.encargado}</td>
        <td class="text-right monto-col" style="color: ${esIngreso ? '#059669' : '#dc2626'};">
            ${esIngreso ? '+' : '-'}$${formatMXN(mov.monto)}
        </td>
      </tr>
    `;
  });

  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            *, *::before, *::after {
                box-sizing: border-box;
            }
            @page {
                size: A4;
                margin: 15mm; /* Margen nativo reducido */
            }
            body { 
                font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
                color: #1e293b; 
                margin: 0; 
                padding: 25px 30px; /* 🟢 Orillas reducidas para aprovechar el ancho */
                font-size: 10.5pt; /* Letra base ligeramente más grande */
                line-height: 1.6; /* 🟢 Más espacio entre renglones */
                background-color: #ffffff; 
            }
            .header-container { 
                border-bottom: 3px solid #2563eb; 
                padding-bottom: 20px; 
                margin-bottom: 35px; 
                display: flex; 
                justify-content: space-between; 
                align-items: flex-end; 
            }
            .company-title { font-size: 26pt; font-weight: 900; margin: 0; letter-spacing: -0.5px; color: #0f172a; }
            .report-title { font-size: 14pt; color: #2563eb; font-weight: 800; text-transform: uppercase; margin-top: 6px; letter-spacing: 0.5px; }
            .project-info { text-align: right; color: #475569; font-size: 11pt; line-height: 1.5; }
            .project-name { font-size: 14pt; font-weight: bold; color: #0f172a; margin: 4px 0; }
            
            .metrics-table { width: 100%; border-collapse: separate; border-spacing: 20px 0; margin-bottom: 40px; margin-left: -10px; margin-right: -10px; }
            .metric-card { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 20px; text-align: center; width: 33.33%; }
            .total-card { background-color: #0f172a; border-color: #0f172a; }
            .metric-label { font-size: 9pt; font-weight: 800; text-transform: uppercase; color: #64748b; margin-bottom: 8px; letter-spacing: 0.5px; }
            .total-card .metric-label { color: #94a3b8; }
            .metric-value { font-size: 17pt; font-weight: bold; color: #0f172a; }
            .total-card .metric-value { color: #ffffff; font-size: 19pt; }

            h2 { font-size: 14pt; font-weight: bold; color: #0f172a; border-left: 5px solid #2563eb; padding-left: 12px; margin-bottom: 20px; page-break-after: avoid; }
            
            .data-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
            .data-table th { background-color: #f1f5f9; color: #334155; font-size: 10.5pt; font-weight: 800; text-transform: uppercase; text-align: left; padding: 14px 16px; border-bottom: 2px solid #cbd5e1; }
            /* 🟢 Celdas con más relleno (padding) para que no se vea apretado */
            .data-table td { padding: 16px; border-bottom: 1px solid #e2e8f0; font-size: 11pt; color: #334155; vertical-align: top; }
            .data-table tr:nth-child(even) { background-color: #f8fafc; }
            
            .text-right { text-align: right !important; }
            .text-center { text-align: center !important; }
            
            .concepto-title { font-weight: bold; color: #0f172a; font-size: 11.5pt; margin-bottom: 4px; }
            .concepto-meta { color: #64748b; font-size: 10pt; }
            
            .badge { display: inline-block; padding: 5px 10px; font-size: 8.5pt; font-weight: bold; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
            .badge-ingreso { background-color: #d1fae5; color: #065f46; }
            .badge-egreso { background-color: #fee2e2; color: #991b1b; }
            
            .item-breakdown { margin-top: 10px; padding-left: 0; list-style: none; font-size: 10pt; color: #475569; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; }
            .item-breakdown li { margin-bottom: 6px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 6px; }
            .item-breakdown li:last-child { margin-bottom: 0; border-bottom: none; padding-bottom: 0; }
            
            .monto-col { font-weight: 800; font-size: 12pt; white-space: nowrap; }
            
            .row-summary { background-color: #f1f5f9 !important; font-weight: bold; }
            .row-summary td { border-top: 2px solid #cbd5e1; border-bottom: 2px solid #cbd5e1; color: #0f172a; font-size: 12pt; padding: 18px 16px; }
        </style>
    </head>
    <body>
        <div class="header-container">
            <div>
                <div class="company-title">ROCAL</div>
                <div class="report-title">Libro Mayor de Caja Chica</div>
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
                    <div class="metric-label">Saldo Disponible</div>
                    <div class="metric-value">$${formatMXN(saldoDisponible)}</div>
                </td>
                <td class="metric-card">
                    <div class="metric-label">Total Invertido</div>
                    <div class="metric-value" style="color: #059669;">$${formatMXN(totalIngresos)}</div>
                </td>
                <td class="metric-card">
                    <div class="metric-label">Total Gastado</div>
                    <div class="metric-value" style="color: #dc2626;">$${formatMXN(totalEgresos)}</div>
                </td>
            </tr>
        </table>

        <h2>Historial de Movimientos Analítico</h2>
        <table class="data-table">
            <thead>
              <tr>
                <th style="width: 13%;">Fecha</th>
                <th style="width: 44%;">Concepto / Detalle de Artículos</th>
                <th style="width: 12%; text-align: center;">Tipo</th>
                <th style="width: 15%;">Responsable</th>
                <th style="width: 16%; text-align: right;">Importe</th>
              </tr>
            </thead>
            <tbody>
              ${filas}
              <tr class="row-summary">
                <td colspan="4" style="text-align: right;">Balance Consolidado Resumen:</td>
                <td class="text-right" style="color: #2563eb;">$${formatMXN(saldoDisponible)}</td>
              </tr>
            </tbody>
        </table>
    </body>
    </html>
  `;
};