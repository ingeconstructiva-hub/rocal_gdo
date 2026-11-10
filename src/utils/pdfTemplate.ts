import * as FileSystem from 'expo-file-system/legacy';

// Le pasamos "isOffline" para evitar que el celular busque internet
const urlToBase64 = async (url: string, isOffline: boolean) => {
  if (url.startsWith('data:image')) return url; // Si ya es base64, lo deja pasar
  
  if (isOffline) {
    // 🛑 Si no hay internet, devolvemos vacío para no congelar la app
    return ''; 
  }

  try {
    const tempPath = FileSystem.cacheDirectory + `temp_${Date.now()}.jpg`;
    const { uri } = await FileSystem.downloadAsync(url, tempPath);
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
    return `data:image/jpeg;base64,${base64}`;
  } catch (e) {
    return ''; // Si falla, mejor no poner nada para que no rompa el PDF
  }
};

import { membreteAbajo, membreteArriba, membreteCss, type ClaveEmpresa } from '../lib/membreteHtml';

export const generarPlantillaBitacora = async (logs: any[], isOffline: boolean = false, projectName: string = 'Obra sin nombre', empresa?: ClaveEmpresa | null) => {
  let rowsHtml = '';

  for (const log of logs) {
    let photosHtml = '';

    if (log.photo_url) {
      try {
        if (typeof log.photo_url === 'string' && log.photo_url.startsWith('[')) {
          const urls = JSON.parse(log.photo_url);
          let imagesGrid = '';
          for (const url of urls) {
            // AVISAMOS A LA FUNCIÓN SI ESTAMOS OFFLINE
            const b64 = await urlToBase64(url, isOffline);
            if (b64) {
              imagesGrid += `<div class="image-wrapper"><img src="${b64}" class="log-image-item" alt="Evidencia" /></div>`;
            }
          }
          if (imagesGrid) {
            photosHtml = `<div class="log-images-grid">${imagesGrid}</div>`;
          }
        } else {
          const b64 = await urlToBase64(log.photo_url, isOffline);
          if (b64) {
            photosHtml = `<div class="log-images-grid"><div class="image-wrapper"><img src="${b64}" class="log-image-item" alt="Evidencia" /></div></div>`;
          }
        }
      } catch (e) {
        photosHtml = '';
      }
    }

    const fechaFormat = new Date(log.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const horaFormat = new Date(log.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

    rowsHtml += `
      <div class="log-entry">
        <div class="log-header">
          <span class="log-date">${fechaFormat} - ${horaFormat}</span>
          <span class="log-author">Reporta: Ing. Residente</span>
        </div>
        
        <div class="log-tags">
          <span class="tag tag-primary">${log.category}</span>
          ${log.sector ? `<span class="tag tag-secondary">Ubicación: ${log.sector}</span>` : ''}
        </div>

        <p class="log-desc">${log.description}</p>
        
        ${photosHtml}
      </div>
    `;
  }

  const fechaImpresion = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

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
            padding: 40px; /* MARGEN CORPORATIVO */
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
          ${membreteCss(empresa)}

          /* TARJETAS DE BITÁCORA */
          .log-entry { 
            border: 1px solid #E5E7EB; 
            border-radius: 8px; 
            padding: 16px; 
            margin-bottom: 15px; 
            background-color: #F8FAFC; 
            page-break-inside: avoid; /* Evita que una tarjeta se corte a la mitad en el PDF */
          }
          .log-header { 
            border-bottom: 1px solid #E2E8F0; 
            padding-bottom: 8px; 
            margin-bottom: 12px; 
            display: flex; 
            justify-content: space-between; 
            align-items: center;
          }
          .log-date { font-weight: 800; color: #0F172A; font-size: 12px; } 
          .log-author { color: #64748B; font-size: 11px; font-style: italic; }
          
          .log-tags { margin-bottom: 12px; }
          .tag { padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: bold; display: inline-block; text-transform: uppercase; }
          .tag-primary { background-color: #DBEAFE; color: #1D4ED8; }
          .tag-secondary { background-color: #E2E8F0; color: #334155; margin-left: 6px; }
          
          .log-desc { font-size: 12px; margin: 0 0 15px 0; line-height: 1.5; color: #1E293B; } 
          
          /* CONTENEDOR DE IMÁGENES REPARADO */
          .log-images-grid { 
            display: flex; /* Flexbox evita los errores de grid en el motor del PDF */
            gap: 10px; 
            margin-top: 10px; 
            background-color: #FFF; 
            padding: 10px; 
            border: 1px solid #E2E8F0; 
            border-radius: 8px; 
          }
          .image-wrapper {
             flex: 1;
             text-align: center;
          }
          .log-image-item { 
            width: 100%; 
            max-width: 300px;
            height: auto; 
            max-height: 250px; 
            border-radius: 6px; 
            object-fit: contain; /* Contain evita que la foto se estire feo */
            border: 1px solid #E2E8F0; 
          }
        </style>
      </head>
      <body>

        ${membreteArriba(empresa)}

        <div class="header-container">
            <div>
                ${empresa ? '' : '<div class="company-title">ROCAL</div>'}
                <div class="report-title">Bitácora de Obra y Avances</div>
            </div>
            <div class="project-info">
                <div>Proyecto / Obra:</div>
                <div class="project-name">${projectName}</div>
                <div>Fecha de Impresión: <strong>${fechaImpresion}</strong></div>
                <div>Total de Registros: ${logs.length}</div>
            </div>
        </div>

        <div>
          ${rowsHtml}
        </div>

        ${membreteAbajo(empresa)}

      </body>
    </html>
  `;
};