export const generarPlantillaGastos = (
  projectName: string,
  totalGastado: number,
  totalDeuda: number,
  filtroActual: string,
  gastos: any[]
) => {
  const fechaImpresion = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  const formatMXN = (val: number) => val.toLocaleString('es-MX', { minimumFractionDigits: 2 });

  let filasHtml = '';
  gastos.forEach(g => {
    const esCredito = g.estado_pago === 'credito';
    const fecha = new Date(g.fecha).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const proveedor = g.proveedor || 'No especificado';
    const cantidadStr = g.cantidad ? `${g.cantidad} ${g.unidad || ''}` : '';

    filasHtml += `
      <tr>
        <td style="white-space: nowrap;">${fecha}</td>
        <td>
            <div class="concepto-title">${g.concepto}</div>
            <div class="concepto-meta">
              <span class="tag tag-secondary">${g.categoria}</span>
              ${proveedor !== 'No especificado' ? ` • ${proveedor}` : ''}
              ${cantidadStr ? ` • ${cantidadStr}` : ''}
            </div>
        </td>
        <td class="text-center">
            <span class="badge ${esCredito ? 'badge-credito' : 'badge-pagado'}">${esCredito ? 'CRÉDITO' : 'PAGADO'}</span>
        </td>
        <td class="text-right monto-col" style="color: ${esCredito ? '#dc2626' : '#1e293b'};">
            $${formatMXN(g.monto)}
        </td>
      </tr>
    `;
  });

  const tituloFiltro = filtroActual === 'todos' ? 'TODAS LAS CATEGORÍAS' : filtroActual.toUpperCase();

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          * { box-sizing: border-box; }
          @page { size: letter; margin: 0; }
          html, body { width: 100%; height: 100%; }
          
          body { 
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
            margin: 0; 
            padding: 40px; /* MARGEN CORPORATIVO ROCAL */
            color: #111827; 
            background-color: #FFF; 
            line-height: 1.5;
          }

          /* ENCABEZADO CORPORATIVO ROCAL */
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

          /* METRICS CARD */
          .metrics-table { width: 100%; border-collapse: separate; border-spacing: 15px 0; margin-bottom: 30px; margin-left: -7.5px; margin-right: -7.5px; }
          .metric-card { background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; text-align: center; width: 50%; }
          .metric-label { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #64748B; margin-bottom: 4px; }
          .metric-value { font-size: 18px; font-weight: bold; color: #0F172A; }
          
          /* TABLA DE DATOS */
          .data-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
          .data-table th { 
            background-color: #F1F5F9; 
            color: #334155; 
            font-size: 11px; 
            font-weight: 800; 
            text-transform: uppercase; 
            text-align: left; 
            padding: 10px 12px; 
            border-bottom: 2px solid #CBD5E1; 
          }
          .data-table td { 
            padding: 12px; 
            border-bottom: 1px solid #E2E8F0; 
            vertical-align: middle; 
          }
          .data-table tr:nth-child(even) { background-color: #F8FAFC; }

          .text-right { text-align: right !important; }
          .text-center { text-align: center !important; }

          /* ELEMENTOS INTERNOS DE LA TABLA */
          .concepto-title { font-weight: bold; color: #0F172A; font-size: 13px; margin-bottom: 4px; }
          .concepto-meta { color: #64748B; font-size: 11px; display: flex; align-items: center; gap: 6px; }
          
          .tag { padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: bold; text-transform: uppercase; }
          .tag-secondary { background-color: #E2E8F0; color: #334155; }
          
          .badge { padding: 4px 8px; font-size: 9px; font-weight: bold; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
          .badge-pagado { background-color: #DCFCE7; color: #166534; }
          .badge-credito { background-color: #FEE2E2; color: #991B1B; }
          
          .monto-col { font-weight: 800; font-size: 14px; white-space: nowrap; }

          .row-summary { background-color: #F1F5F9 !important; font-weight: bold; }
          .row-summary td { border-top: 2px solid #CBD5E1; border-bottom: 2px solid #CBD5E1; color: #0F172A; font-size: 13px; padding: 14px 12px; }
        </style>
      </head>
      <body>

        <div class="header-container">
            <div>
                <div class="company-title">ROCAL</div>
                <div class="report-title">Registro de Gastos Estructurales</div>
            </div>
            <div class="project-info">
                <div>Proyecto / Obra:</div>
                <div class="project-name">${projectName}</div>
                <div>Fecha de Impresión: <strong>${fechaImpresion}</strong></div>
                <div>Filtro: ${tituloFiltro}</div>
            </div>
        </div>

        <table class="metrics-table">
            <tr>
                <td class="metric-card">
                    <div class="metric-label">Total Generado (Filtro)</div>
                    <div class="metric-value">$${formatMXN(totalGastado)}</div>
                </td>
                <td class="metric-card" style="border-color: #FECACA; background-color: #FEF2F2;">
                    <div class="metric-label" style="color: #DC2626;">Deuda Pendiente (Filtro)</div>
                    <div class="metric-value" style="color: #DC2626;">$${formatMXN(totalDeuda)}</div>
                </td>
            </tr>
        </table>

        <table class="data-table">
            <thead>
              <tr>
                <th style="width: 15%;">Fecha</th>
                <th style="width: 50%;">Concepto y Proveedor</th>
                <th style="width: 15%; text-align: center;">Estado</th>
                <th style="width: 20%; text-align: right;">Importe</th>
              </tr>
            </thead>
            <tbody>
              ${filasHtml}
              ${gastos.length === 0 ? `<tr><td colspan="4" class="text-center" style="padding: 30px; font-style: italic; color: #94a3b8;">No hay registros para mostrar.</td></tr>` : ''}
              <tr class="row-summary">
                <td colspan="3" style="text-align: right;">Total General a la fecha:</td>
                <td class="text-right" style="color: #00AEEF;">$${formatMXN(totalGastado)}</td>
              </tr>
            </tbody>
        </table>

      </body>
    </html>
  `;
};