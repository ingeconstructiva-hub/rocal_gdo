export function generarPlantillaResponsiva(vale: any) {
  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: 'Helvetica', 'Arial', sans-serif; color: #1e293b; padding: 30px; line-height: 1.6; }
        .header { text-align: right; font-size: 12px; margin-bottom: 40px; font-weight: bold; }
        .present { font-size: 14px; font-weight: bold; margin-top: 20px; margin-bottom: 20px; }
        .content { text-align: justify; font-size: 13px; margin-bottom: 20px; }
        .equipos-box { background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; margin: 20px 0; font-family: monospace; white-space: pre-wrap; font-size: 13px; }
        .footer-signatures { margin-top: 60px; display: flex; justify-content: space-between; page-break-inside: avoid; }
        .signature-col { width: 45%; text-align: center; font-size: 12px; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; }
        .img-firma { height: 100px; max-width: 100%; object-fit: contain; margin-bottom: 4px; }
        .anexo-ine { margin-top: 26px; padding-top: 16px; border-top: 1px dashed #94a3b8; text-align: center; page-break-inside: avoid; }
        .anexo-titulo { font-size: 11px; font-weight: bold; letter-spacing: 0.5px; color: #334155; margin: 0 0 10px 0; }
        .ine-caras { display: flex; gap: 14px; justify-content: center; align-items: flex-start; }
        .ine-cara { flex: 1; max-width: 260px; }
        .img-ine { width: 100%; max-height: 180px; object-fit: contain; border: 1px solid #cbd5e1; border-radius: 6px; }
        .ine-lado { display: block; font-size: 8px; color: #64748b; letter-spacing: 1px; margin-top: 4px; }
        .anexo-pie { font-size: 9px; color: #64748b; margin-top: 6px; }
        .signature-placeholder { height: 100px; } 
        .digital-seal { margin-top: 40px; padding: 10px; border: 1px dashed #cbd5e1; background-color: #f1f5f9; border-radius: 6px; font-size: 10px; color: #64748B; font-family: monospace; }
        .verse { text-align: center; margin-top: 50px; font-size: 11px; font-style: italic; color: #64748b; }
      </style>
    </head>
    <body>
      <div class="header">
        ${vale.fecha_prestamo}<br>
        San Pablo del Monte, Tlaxcala<br>
        ASUNTO: RESPONSIVA DE EQUIPAMIENTO<br>
        N. DE RESPONSIVA: ${vale.n_responsiva}
      </div>

      <div class="present">
        A QUIEN CORRESPONDA<br>
        PARA FINES ADMINISTRATIVOS Y LEGALES<br>
        PRESENTE:
      </div>

      <div class="content">
        En referencia al proyecto <strong>"${vale.obra_nombre}"</strong> en el que en lo sucesivo a través de la carta de acuerdos de trabajo <strong>${vale.n_convenio}</strong> se establece que el responsable de la ejecución de los trabajos será el <strong>${vale.nombre_recibe}</strong>, el cual en mutuo acuerdo con el representante de la empresa acuerdan entregar en <strong>ÓPTIMAS CONDICIONES LOS EQUIPOS</strong> para la realización de los trabajos que a continuación se describen:
      </div>

      <div class="equipos-box">${vale.equipos_detalle}</div>

      <div class="content">
        El receptor asume la <strong>RESPONSABILIDAD Y EL CUIDADO DE DICHO EQUIPO Y HERRAMIENTAS</strong> y se compromete a utilizarlo con un uso estrictamente laboral. Cualquier problema o fallo deberá ser informado de inmediato para su renovación o mantenimiento. En caso de que los equipos sean extraviados o dañados por el mal uso, estos tendrán que reponerse por el encargado, aceptando que se reciben listos para usarse y sin deterioros significativos.
      </div>

      <div class="footer-signatures">
        
        <div class="signature-col">
          ${vale.firma_entrega_url 
            ? `<img src="${vale.firma_entrega_url}" class="img-firma" />` 
            : `<div class="signature-placeholder"></div>`
          }
          <hr style="border: none; border-top: 1px solid #475569; margin-bottom: 8px; width: 100%;" />
          <p style="font-size: 12px; font-weight: bold; margin: 0;">ENTREGA</p>
          <p style="font-size: 11px; margin: 2px 0 0 0;">${vale.nombre_entrega}</p>
          <p style="font-size: 8px; color: #64748B; font-family: monospace; margin-top: 4px; font-weight: bold;">🔒 EMISOR AUTORIZADO</p>
        </div>

        <div class="signature-col">
          ${vale.firma_recibe_url 
            ? `<img src="${vale.firma_recibe_url}" class="img-firma" />` 
            : `<div class="signature-placeholder"></div>`
          }
          <hr style="border: none; border-top: 1px solid #475569; margin-bottom: 8px; width: 100%;" />
          <p style="font-size: 12px; font-weight: bold; margin: 0;">RECIBE Y ACEPTA</p>
          <p style="font-size: 11px; margin: 2px 0 0 0;">${vale.nombre_recibe}</p>
          <p style="font-size: 8px; color: #16A34A; font-family: monospace; margin-top: 4px; font-weight: bold;">🔒 FIRMA AUTÓGRAFA DIGITAL</p>
        </div>
        
      </div>

      ${vale.ine_url || vale.ine_reverso_url
        ? `<div class="anexo-ine">
             <p class="anexo-titulo">ANEXO: IDENTIFICACIÓN OFICIAL DE QUIEN RECIBE</p>
             <div class="ine-caras">
               ${vale.ine_url ? `<div class="ine-cara"><img src="${vale.ine_url}" class="img-ine" /><span class="ine-lado">FRENTE</span></div>` : ''}
               ${vale.ine_reverso_url ? `<div class="ine-cara"><img src="${vale.ine_reverso_url}" class="img-ine" /><span class="ine-lado">REVERSO</span></div>` : ''}
             </div>
             <p class="anexo-pie">Documento cotejado al momento de la entrega. ${vale.nombre_recibe}</p>
           </div>`
        : ''
      }

      <div class="digital-seal">
        <strong>🔒 SELLO DE CERTIFICACIÓN DIGITAL CRIPTOGRÁFICA MUTUA</strong><br>
        HASH DE AUDITORÍA: ${vale.token_firma || 'PENDIENTE'}<br>
        UUID DEL REGISTRO: ${vale.id}<br>
        Estado de Validación: CERTIFICADO - EXPEDIENTE CON INTERFAZ DE FIRMAS HISTÓRICAS PERMANENTES<br>
        Timestamp de Sello: ${vale.fecha_firma || 'N/A'}
      </div>

      <div class="verse">
        "Porque toda casa tiene su constructor, pero el constructor de todo es Dios." - Hebreos 3:4
      </div>
    </body>
    </html>
  `;
}