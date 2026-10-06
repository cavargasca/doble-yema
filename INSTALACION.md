# Instalación paso a paso (≈ 30 minutos)

Todo se hace con la cuenta de Google del negocio (dobleyemasas@gmail.com) y la cuenta de GitHub cavargasca. No se instala nada de pago.

## 1. Crear la base de datos (Google Sheets)
1. Entra a https://sheets.google.com con **dobleyemasas@gmail.com** y crea una hoja en blanco llamada **Doble Yema - Datos**.
2. Menú **Extensiones → Apps Script**.
3. Borra el contenido de `Código.gs` y pega **todo** el contenido de `backend/Code.gs`.
4. A la izquierda, ⚙️ **Configuración del proyecto** → marca *Mostrar el archivo de manifiesto appsscript.json*. Vuelve al editor, abre `appsscript.json` y pega el contenido de `backend/appsscript.json`.
5. Guarda (💾). Recarga la hoja de cálculo: aparecerá el menú **Doble Yema**.

## 2. Preparar hojas y PIN
1. Menú **Doble Yema → Preparar hojas** (la primera vez Google pide permisos: Avanzado → Ir a proyecto → Permitir).
2. **Doble Yema → PIN gerente** y **PIN operario**: escribe un PIN de 4 a 8 dígitos para cada uno. **No los compartas por chat ni correo.**
3. **Doble Yema → Activar respaldo semanal**.
4. En la hoja `Config` puedes ajustar saldos iniciales (efectivo, Nequi, Daviplata, banco), alimento y cubetas vacías iniciales.

## 3. Publicar el servidor
1. En Apps Script: **Implementar → Nueva implementación → Aplicación web**.
2. *Ejecutar como:* **Yo**. *Quién tiene acceso:* **Cualquier persona**.
3. Implementar y **copiar la URL** que termina en `/exec`.
4. Abre `docs/js/config.js` y pega la URL en `API_URL`.

> Cada vez que cambies `Code.gs` debes crear una **nueva versión** de la implementación (Implementar → Administrar implementaciones → ✏️ → Versión nueva). La URL se mantiene.

## 4. Subir la app a GitHub
En la carpeta del proyecto (PowerShell o Git Bash):
```
git init
git add .
git commit -m "Doble Yema fase 1"
git branch -M main
git remote add origin https://github.com/cavargasca/doble-yema.git
git push -u origin main
```
En GitHub: **Settings → Pages → Source: Deploy from a branch → Branch `main`, carpeta `/docs`** → Save. (La app está en la carpeta `docs/` justamente porque GitHub Pages solo permite la raíz o `/docs`.) En 1-2 minutos quedará en `https://cavargasca.github.io/doble-yema/`.

> La carpeta está en OneDrive: la sincronización puede molestar con la carpeta `.git`. Si ves conflictos, pausa OneDrive mientras haces `git` o mueve el repositorio fuera de OneDrive.

## 5. Instalar en el iPhone
1. Abre la dirección de GitHub Pages en **Safari**.
2. Botón compartir → **Añadir a pantalla de inicio**.
3. Entra con el usuario y PIN. La primera vez necesita internet; después funciona sin señal y envía los registros al volver la conexión (indicador arriba a la derecha).

## 6. Primeros datos
1. **Clientes** → crea tus clientes (condición de pago: contado, semanal o mensual).
2. **Más → Lista general de precios**: define el precio de cada categoría. Precios propios de un cliente: desde su ficha → *Precios*.
3. Revisa los 15 lotes (hoja `Lotes`) y ajusta aves iniciales si hace falta.

## Cambiar un PIN o dar de baja un teléfono
Menú **Doble Yema → PIN …** en la hoja. Cambiar el PIN cierra las sesiones anteriores de ese usuario.
