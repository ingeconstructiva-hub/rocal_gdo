/* Escribe la fecha del despliegue en el código, para poder saber desde la app
 * qué versión trae cada dispositivo. Lo corre Vercel antes de compilar. */
const fs = require('fs');

const ahora = new Date();
const sello = ahora.toISOString().slice(0, 16).replace('T', ' ');

fs.writeFileSync(
  'src/lib/version.ts',
  `// Generado automáticamente al compilar. No editar a mano.\nexport const VERSION_APP = '${sello}';\n`
);

console.log('Versión sellada:', sello);
