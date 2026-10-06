// Prueba de punta a punta: navegador real + backend simulado. Uso: node tests/e2e.mjs
// Requiere Playwright instalado (npm i -D playwright) y un Chromium disponible.
import { chromium } from 'playwright';
import { crearSandbox } from './gas-sandbox.js';
import { iniciar } from './serve.js';

const API = 'https://fake.test/exec';
const s = crearSandbox();
s.ejecutar('setup()');
{ const cfg = s.hojas.get('Config'); const f = cfg.data.find((r) => r && r[0] === 'firma_entrega'); if (f) f[1] = 'Carlos Vargas'; } s.ejecutar("guardarPin_('gerente','1234')"); s.ejecutar("guardarPin_('operario','5678')");
const token = s.llamar({ action: 'login', usuario: 'gerente', pin: '1234' }).token;
const sembrar = (entity, record) => { const r = s.llamar({ action: 'sync', token, records: [{ entity, record }] }); if (!r.ok || r.results[0].status !== 'ok') throw new Error('semilla ' + entity + ' ' + JSON.stringify(r)); };
const ahora = Date.now();
sembrar('Clientes', { id: 'cl-1', nombre: 'Tienda La Esquina', telefono: '3001234567', condicion_pago: 'semanal', estado: 'activo', ts: ahora });
for (const [cat, p] of [['A', 15000], ['AA', 17000]]) sembrar('Precios', { id: 'pc-' + cat, cliente_id: '', categoria: cat, desde_cantidad: 0, precio: p, vigente_desde: '2026-01-01', ts: ahora });
const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
sembrar('Empaque', { id: 'em-0', fecha: hoy, b: 0, a: 20, aa: 10, aaa: 0, jumbo: 0, sueltos_bodega: 0, rotos_bodega: 0, descarte: 0, ts: ahora });

const srv = await iniciar(8099);
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: 'block' });
const errores = [];
await ctx.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: `export const API_URL='${API}'; export const VERSION_APP='test';` }));
await ctx.route(API, (r) => {
  const cuerpo = r.request().postData();
  const resp = s.llamar(JSON.parse(cuerpo));
  r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(resp) });
});
const page = await ctx.newPage();
page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_INTERNET_DISCONNECTED')) errores.push('console: ' + m.text()); });
const paso = (t) => console.log('•', t);
const ok = async (txt) => { await page.getByRole('button', { name: txt }).first().click(); };

async function entrar(usuario, pin) {
  await page.goto('http://localhost:8099/');
  await page.getByRole('radio', { name: usuario === 'gerente' ? 'Gerente' : 'Operario' }).click();
  await page.locator('.pin-input').fill(pin);
  await ok('Entrar');
}

// ---- gerente ----
await entrar('gerente', '1234');
await page.getByText('Nueva venta').first().waitFor();
paso('gerente entra y ve el inicio');
await page.getByText('Nueva venta').first().click();
await page.locator('select.input').first().selectOption('cl-1');
const pasos = page.locator('.linea-categoria');
// categoría A (índice 1): +1 dos veces
await pasos.nth(1).locator('.step-btn').nth(1).click();
await pasos.nth(1).locator('.step-btn').nth(1).click();
await page.getByText('Total $30.000').waitFor();
paso('precio automático 2 × $15.000 = $30.000');
await page.getByText('Pagó todo').click();
await ok('Guardar venta');
await page.locator('.modal').getByText('Total $30.000').waitFor();
await page.getByRole('button', { name: 'Sí, guardar' }).click();
await page.getByText('RECIBO DE CAJA').first().waitFor();
await page.getByText('Son: Treinta mil pesos').waitFor();
await page.getByText('Carlos Vargas').waitFor();
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT + '/recibo.png', fullPage: true });
{ // al imprimir, el documento no debe ocupar la hoja completa (eso generaba una hoja en blanco al final)
  await page.waitForTimeout(2500); // espera a que desaparezca el aviso "Venta guardada"
  await page.setViewportSize({ width: 794, height: 1123 }); await page.emulateMedia({ media: 'print' });
  const alto = await page.evaluate(() => Math.round(document.body.getBoundingClientRect().height));
  await page.emulateMedia({ media: 'screen' }); await page.setViewportSize({ width: 390, height: 844 });
  if (alto >= 1123) throw new Error('en impresión el documento ocupa toda la hoja (' + alto + ' px)');
  const pdf = await page.pdf({ format: 'A4', margin: { top: '1cm', bottom: '1cm', left: '1cm', right: '1cm' } });
  const n = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  if (n !== 1) throw new Error('el recibo imprime ' + n + ' hojas');
}
paso('venta guardada y recibo de caja visible (imprime en 1 hoja)');
// ---- cobro / cliente ----
await page.goto('http://localhost:8099/#/clientes/cl-1');
await page.getByText('Al día').first().waitFor({ timeout: 3000 }).catch(() => {});
await page.getByText('Último pago').first().waitFor();
paso('detalle de cliente');
// ---- pago con recibo de caja ----
await page.goto('http://localhost:8099/#/cobro/cl-1');
await page.locator('.dinero input').first().fill('5000');
await page.getByRole('button', { name: 'Guardar pago' }).click();
await page.getByRole('button', { name: 'Sí, guardar' }).click();
await page.getByText('Son: Cinco mil pesos').waitFor();
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT + '/recibo-pago.png', fullPage: true });
paso('pago genera recibo de caja');
// ---- gasto ----
await page.goto('http://localhost:8099/#/gasto');
await page.getByRole('radio', { name: 'Alimento' }).click();
await page.locator('.dinero input').first().fill('2400000');
await ok('Guardar gasto');
await page.getByRole('button', { name: 'Sí, guardar' }).click();
await page.getByText('Hola').first().waitFor();
paso('gasto de alimento guardado');
// ---- resumen ----
await page.goto('http://localhost:8099/#/resumen');
await page.getByText('Dinero por medio de pago').waitFor();
await page.getByText('Inversión en gallinas').waitFor();
paso('resumen carga');
// ---- proveedores con tipo ----
await page.goto('http://localhost:8099/#/proveedores/nuevo');
await page.getByPlaceholder('Ej: Purina').fill('Purina');
await page.locator('select').selectOption({ label: 'Alimento (concentrado)' });
await page.getByRole('button', { name: 'Guardar' }).click();
await page.getByText('Alimento (concentrado)').first().waitFor();
paso('proveedor con tipo guardado');
// ---- venta de gallinas de descarte ----
await page.goto('http://localhost:8099/#/gallinas');
await page.locator('select').selectOption({ index: 1 });
await page.getByRole('button', { name: 'Guardar' }).click();
await page.getByRole('button', { name: 'Sí, guardar' }).click();
await page.getByText('Hola').first().waitFor();
await page.waitForFunction(() => document.querySelector('.estado-sync')?.textContent.includes('Al día'), null, { timeout: 15000 });
if (s.hojas.get('VentasAves').getLastRow() !== 2 || s.hojas.get('SalidasAves').getLastRow() !== 2 || s.hojas.get('Proveedores').getLastRow() !== 2) throw new Error('gallinas/proveedor no llegaron al servidor');
paso('venta de gallinas y proveedor llegan al servidor');
// ---- gallinas nuevas en un lote: cierra la tanda vieja y abre otra ----
await page.goto('http://localhost:8099/#/cambio-gallinas');
await page.getByText('Lote 1', { exact: true }).first().click();
await page.locator('input[type=date]').fill(new Date(Date.now() + 86400000 - 5 * 3600000).toISOString().slice(0, 10));
await page.getByRole('button', { name: 'Guardar gallinas nuevas' }).click();
await page.getByRole('button', { name: 'Sí, guardar' }).click();
await page.getByText('Historial de gallinas').first().waitFor();
await page.getByText('Cerrada').first().waitFor();
await page.waitForFunction(() => document.querySelector('.estado-sync')?.textContent.includes('Al día'), null, { timeout: 15000 });
if (s.hojas.get('Tandas').getLastRow() !== 3) throw new Error('tandas en el servidor: ' + s.hojas.get('Tandas').getLastRow());
paso('gallinas nuevas: tanda vieja cerrada y nueva creada');
await page.goto('http://localhost:8099/#/precios/general');
await page.getByText('Lista general de precios').first().waitFor();
await page.goto('http://localhost:8099/#/precios-ajuste');
await page.getByText('Ajuste de precios').first().waitFor();
await page.goto('http://localhost:8099/#/clientes');
await page.getByText('Tienda La Esquina').waitFor();
paso('clientes y precios cargan');
await page.waitForTimeout(1500);
const v = s.hojas.get('Ventas'); const g = s.hojas.get('Gastos'); const c = s.hojas.get('Cobros');
if (v.getLastRow() !== 2 || c.getLastRow() !== 3 || g.getLastRow() !== 3) throw new Error(`filas servidor: ventas ${v.getLastRow()} cobros ${c.getLastRow()} gastos ${g.getLastRow()}`);
paso('el servidor recibió venta, cobro y gasto');

// ---- operario sin conexión ----
await ctx.clearCookies();
await page.evaluate(() => indexedDB.deleteDatabase('doble-yema'));
await entrar('operario', '5678');
await page.getByText('Producción del galpón').waitFor();
await page.getByText('Producción del galpón').click();
await page.getByText('Lote 1', { exact: true }).click();
await ctx.setOffline(true);
const st = page.locator('.stepper');
await st.nth(0).locator('.step-valor').fill('30');
await st.nth(3).locator('.step-btn').nth(1).click();
await ok('Guardar');
await page.getByRole('button', { name: 'Sí, guardar' }).click();
await page.getByText('✓ 30 huevos').waitFor();
paso('operario registra sin señal; queda guardado en el teléfono');
if (s.hojas.get('Produccion').getLastRow() !== 1) throw new Error('el servidor no debería tener nada aún');
await ctx.setOffline(false);
await page.evaluate(() => window.dispatchEvent(new Event('online')));
await page.waitForFunction(() => document.querySelector('.estado-sync')?.textContent.includes('Al día'), null, { timeout: 15000 });
if (s.hojas.get('Produccion').getLastRow() !== 2) throw new Error('el registro no llegó al servidor');
paso('al volver la señal, se sincroniza solo');
// el operario no puede entrar a pantallas de gerencia
await page.goto('http://localhost:8099/#/venta');
await page.getByText('solo para gerencia').waitFor();
paso('operario bloqueado en pantallas de gerencia');

// cerrar sesión desde el botón 🚪 del encabezado
await page.goto('http://localhost:8099/#/');
await page.getByRole('button', { name: 'Cerrar sesión' }).first().click();
await page.getByRole('button', { name: 'Sí, continuar' }).click();
await page.getByRole('radio', { name: 'Gerente' }).waitFor();
paso('cerrar sesión lleva a la pantalla de entrada');

await browser.close(); srv.close();
if (errores.length) { console.log('\nERRORES EN CONSOLA:\n' + errores.join('\n')); process.exit(1); }
console.log('\nE2E OK');
