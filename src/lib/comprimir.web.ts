/* Compresión de fotos (versión navegador).
 *
 * Las fotos salían de 1.78 MB cada una. Eso pesa en tres lados: tarda en subir
 * con datos móviles, tarda en verse, y llena rápido el espacio que el navegador
 * nos da para guardarlas sin internet.
 *
 * Se reducen a un lado máximo de 1600 píxeles y calidad 0.7. Para un ticket,
 * una credencial o una foto de avance, eso se sigue leyendo perfecto y suele
 * quedar entre 150 y 400 KB.
 */

const LADO_MAXIMO = 1600;
const CALIDAD = 0.7;
const MINIMO_PARA_COMPRIMIR = 400 * 1024; // Debajo de esto no vale la pena

function cargarImagen(url: string): Promise<HTMLImageElement> {
  return new Promise((resolver, rechazar) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolver(img);
    img.onerror = () => rechazar(new Error('No se pudo leer la imagen'));
    img.src = url;
  });
}

export async function comprimirImagen(uri: string): Promise<string> {
  try {
    const blob = await fetch(uri).then((r) => r.blob());

    // Si ya es chica, o no es imagen, se deja como está.
    if (blob.size < MINIMO_PARA_COMPRIMIR || !blob.type.startsWith('image/')) return uri;

    const url = URL.createObjectURL(blob);
    const img = await cargarImagen(url);
    URL.revokeObjectURL(url);

    const escala = Math.min(1, LADO_MAXIMO / Math.max(img.naturalWidth, img.naturalHeight));
    const ancho = Math.round(img.naturalWidth * escala);
    const alto = Math.round(img.naturalHeight * escala);

    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;

    const ctx = lienzo.getContext('2d');
    if (!ctx) return uri;
    ctx.drawImage(img, 0, 0, ancho, alto);

    return lienzo.toDataURL('image/jpeg', CALIDAD);
  } catch {
    // Si algo falla, se sube la original: mejor pesada que perdida.
    return uri;
  }
}
