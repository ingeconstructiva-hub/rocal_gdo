export const generarPlantillaBitacora = (logs: any[]) => {
  const rowsHtml = logs.map(log => `
    <div class="log-entry">
      <div class="log-header">
        <span class="log-date">${new Date(log.created_at).toLocaleDateString()} - ${new Date(log.created_at).toLocaleTimeString()}</span>
        <span class="log-author">Autor: Ing. Juancarlos Escobar</span>
      </div>
      <p class="log-desc">${log.description}</p>
      
      <div class="log-tags">
        <span class="tag tag-primary">${log.category}</span>
        ${log.sector ? `<span class="tag tag-secondary">Sector: ${log.sector}</span>` : ''}
      </div>

      ${(() => {
        if (!log.photo_url) return '';
        
        if (typeof log.photo_url === 'string' && log.photo_url.startsWith('[')) {
          try {
            const urls = JSON.parse(log.photo_url);
            const imagesHtml = urls.map((url: string) => `
              <img src="${url}" class="log-image-item" alt="Evidencia fotográfica" onerror="this.style.display='none'" />
            `).join('');
            return `<div class="log-images-grid">${imagesHtml}</div>`;
          } catch(e) { return ''; }
        }
        
        return `
          <div class="log-images-grid">
            <img src="${log.photo_url}" class="log-image-item" alt="Evidencia fotográfica" onerror="this.style.display='none'" />
          </div>
        `;
      })()}
    </div>
  `).join('');

  return `
    <html>
      <head>
        <style>
          /* 1. CONFIGURACIÓN BÁSICA DEL DOCUMENTO */
          @page { size: A4; margin: 25px 25px 25px 25px; }
          html, body {
            width: 100%;
            height: 100%;
          }
          body { 
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
            margin: 0; 
            padding: 0; 
            color: #111827; 
            background-color: #FFF; 
          }

          /* 2. CONTENIDO PRINCIPAL SIN HEADER NI FOOTER */
          /* 3. CONTENIDO PRINCIPAL */
          .content { 
            margin: 0; 
            padding: 18px 24px 18px 24px; 
            box-sizing: border-box;
          }

          .report-info { text-align: left; padding-bottom: 10px; border-bottom: 2px solid #E5E7EB; margin-bottom: 15px; }
          .report-info h2 { margin: 0; color: #1E3A8A; font-size: 18px; text-transform: uppercase; font-weight: 800; }
          .report-info p { margin: 3px 0; font-size: 12px; color: #4B5563; }

          /* 5. DISEÑO COMPACTO DE BITÁCORAS */
          .log-entry { 
            border: 1px solid #E5E7EB; 
            border-radius: 6px; 
            padding: 12px; 
            margin-bottom: 12px; 
            background-color: #F9FAFB; 
            page-break-inside: avoid;
            break-inside: avoid;
          }
          
          .log-header { border-bottom: 1px dashed #D1D5DB; padding-bottom: 6px; margin-bottom: 8px; display: flex; justify-content: space-between; }
          .log-date { font-weight: bold; color: #374151; font-size: 11px; } 
          .log-author { color: #6B7280; font-size: 11px; font-style: italic; }
          .log-desc { font-size: 13px; margin: 0 0 10px 0; line-height: 1.4; color: #111827; } 
          
          .log-tags { margin-bottom: 10px; }
          .tag { padding: 3px 8px; border-radius: 8px; font-size: 10px; font-weight: bold; display: inline-block; }
          .tag-primary { background-color: #DBEAFE; color: #1D4ED8; }
          .tag-secondary { background-color: #E5E7EB; color: #374151; margin-left: 6px; }
          
          .log-images-grid { 
            display: grid; 
            grid-template-columns: repeat(2, minmax(0, 1fr)); 
            gap: 10px;       
            margin-top: 10px; 
            background-color: #FFF; 
            padding: 8px; 
            border: 1px solid #E5E7EB; 
            border-radius: 8px; 
          }
          .log-image-item { 
            width: 100%; 
            height: auto; 
            max-height: 220px; 
            border-radius: 8px; 
            object-fit: cover; 
            border: 1px solid #E5E7EB;
            box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
            filter: saturate(1.05) contrast(1.05);
          }
        </style>
      </head>
      <body>

        <!-- BLOQUE CONTENIDO CENTRAL -->
        <div class="content">
          <div class="report-info">
            <h2>Bitácora Oficial</h2>
            <p><strong>Fecha Emisión:</strong> ${new Date().toLocaleDateString()}</p>
            <p><strong>Total Registros:</strong> ${logs.length}</p>
          </div>

          <!-- Entradas generadas de la base de datos -->
          <div>
            ${rowsHtml}
          </div>
        </div>

      </body>
    </html>
  `;
};