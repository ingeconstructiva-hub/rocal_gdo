# Cómo repartir una actualización del APK

## La regla para quien lo instala

**No desinstalen la versión anterior.** Instalen el APK nuevo encima.

Antes de instalar, abran la app **con internet** y revisen que el contador de
pendientes esté en **0**.

Eso es lo único que protege lo que se capturó sin señal. Lo que se registra
sin internet no está en el servidor todavía: espera en la bandeja de salida,
que vive en el almacenamiento privado de la app (`src/lib/bandeja.ts`). Si se
desinstala, Android borra esos datos y lo pendiente se pierde en silencio: el
contador vuelve a leer 0 y nadie se entera de que faltaba algo.

Desinstalar también vacía la caché local. La app no pierde lo que ya subió
—vuelve del servidor en la primera carga buena— pero mientras no haya señal la
pantalla se ve vacía, y eso es lo que en noviembre de 2026 se reportó como
"se borró la información".

## El requisito técnico, del lado de quien compila

Para que el APK se pueda instalar encima, tiene que ir firmado con **la misma
llave** que el que ya traen en el teléfono: `android/app/debug.keystore`
(SHA-1 `5e8f16062ea3cd2c4a0d547876baa6f38cabf625`).

Si la firma cambia, Android rechaza la instalación con un error de firma y la
única salida es desinstalar, con la pérdida que eso implica. Por eso:

- Compilar en local con `./gradlew assembleRelease`, que usa ese keystore.
- **No** usar un build de EAS para una actualización: EAS firma con su propia
  llave y el resultado no se puede instalar encima.
- `debug.keystore` está en `.gitignore` y no se puede volver a generar igual.
  Es lo único que permite actualizar: respaldarlo fuera de la máquina.

Subir también `versionCode` en `android/app/build.gradle`. Gradle **no** lee
`app.json`: si el número no sube ahí, Android considera que es la misma
versión y no instala nada.
