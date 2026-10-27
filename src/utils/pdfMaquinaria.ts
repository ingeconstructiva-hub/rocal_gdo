export const generarPlantillaMaquinaria = (
  projectName: string,
  totalGenerado: number,
  totalPagado: number,
  saldo: number,
  registros: any[]
) => {
  const fecha = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  const formatMXN = (val: number) => val.toLocaleString('es-MX', { minimumFractionDigits: 2 });

  let filas = '';
  registros.filter(r => r.categoria !== 'config').forEach(g => {
    const esAnticipo = g.categoria === 'anticipo';
    filas += `
      <tr>
        <td>${new Date(g.fecha).toLocaleDateString('es-MX')}</td>
        <td><strong>${g.equipo}</strong><br><small style="color:#64748B">${g.proveedor || '--'}</small></td>
        <td><span style="color:${esAnticipo ? '#10B981' : '#EF4444'}; font-weight:bold; font-size:10px;">${g.categoria.toUpperCase()}</span></td>
        <td>${g.concepto}</td>
        <td style="text-align:center;">${g.asistencia_dias ? `${g.asistencia_dias} hrs` : '--'}</td>
        <td style="text-align:right;">${g.costo_tarifa ? `$${formatMXN(g.costo_tarifa)}` : '--'}</td>
        <td style="text-align:right;">${!esAnticipo ? `$${formatMXN(g.monto)}` : '--'}</td>
        <td style="text-align:right;">${esAnticipo ? `$${formatMXN(g.monto)}` : '--'}</td>
      </tr>
    `;
  });

  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body { font-family: 'Helvetica', sans-serif; padding: 30px; color: #1e293b; font-size: 11px; }
            .header-table { width: 100%; margin-bottom: 25px; border-bottom: 3px solid #2563eb; padding-bottom: 15px; }
            .title { color: #2563eb; font-size: 20px; font-weight: bold; }
            .summary-box { display: flex; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 20px; }
            .summary-col { flex: 1; padding: 10px; text-align: center; border-right: 1px solid #e2e8f0; }
            .summary-col:last-child { border-right: none; }
            .summary-label { font-size: 9px; text-transform: uppercase; color: #64748B; font-weight: 800; }
            .summary-value { font-size: 14px; font-weight: bold; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { background: #0f172a; color: #fff; padding: 8px; text-align: left; font-size: 10px; text-transform: uppercase; }
            td { border: 1px solid #e2e8f0; padding: 8px; }
            .total-row { background: #f1f5f9; font-weight: bold; }
        </style>
    </head>
    <body>
        <table class="header-table">
            <tr>
                <td><div class="title">CONSTRUCTORA ROCAL</div><div style="font-size:12px; color:#475569;">Control de Maquinaria - ${projectName}</div></td>
                <td style="text-align:right;">Fecha: ${fecha}</td>
            </tr>
        </table>
        <div class="summary-box">
            <div class="summary-col"><div class="summary-label">Costo Generado</div><div class="summary-value" style="color:#EF4444;">$${formatMXN(totalGenerado)}</div></div>
            <div class="summary-col"><div class="summary-label">Total Abonado</div><div class="summary-value" style="color:#059669;">$${formatMXN(totalPagado)}</div></div>
            <div class="summary-col"><div class="summary-label">Saldo Pendiente</div><div class="summary-value" style="color:${saldo > 0 ? '#DC2626' : '#059669'}">$${formatMXN(saldo)}</div></div>
        </div>
        <table>
            <thead><tr><th>Fecha</th><th>Equipo</th><th>Tipo</th><th>Concepto</th><th>Hrs</th><th>Tarifa x Hr</th><th>Cargo</th><th>Abono</th></tr></thead>
            <tbody>${filas}
                <tr class="total-row">
                    <td colspan="6" style="text-align:right;">TOTALES:</td>
                    <td style="text-align:right;">$${formatMXN(totalGenerado)}</td>
                    <td style="text-align:right;">$${formatMXN(totalPagado)}</td>
                </tr>
            </tbody>
        </table>
    </body>
    </html>
  `;
};