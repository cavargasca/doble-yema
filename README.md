# Doble Yema · control del galpón

Aplicación gratuita (PWA) para registrar producción, bodega, ventas, cobros y gastos de un galpón de ponedoras, con modo sin conexión.

- **Frontend:** `docs/` (HTML + JavaScript sin compilar), publicado con GitHub Pages.
- **Backend:** `backend/Code.gs` (Google Apps Script) usando una hoja de Google Sheets como base de datos y Drive para las fotos de facturas.
- **Usuarios:** `operario` (producción, bodega, sanidad; sin precios ni dinero) y `gerente` (todo).

> Los datos **nunca** se guardan en este repositorio: viven en la hoja de Google del negocio. El repositorio solo tiene el código.

> Los comprobantes que genera la app se llaman "Recibo de caja" y son de control interno; **no son factura de venta**.

## Instalación
Sigue `INSTALACION.md`.

## Pruebas
```
npm test          # lógica de negocio y backend simulado (30 pruebas)
node tests/serve.js   # sirve docs/ en http://localhost:8080
node tests/e2e.mjs    # prueba completa en navegador (requiere: npm i -D playwright)
```

## Estructura
```
backend/   Code.gs, appsscript.json
docs/       index.html, css/, js/ (calc, store, api, datos, ui, app, pantallas/), sw.js, manifest, icons/
tests/     pruebas automáticas
INSTALACION.md  guía de instalación
```
