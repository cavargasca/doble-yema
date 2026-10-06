// Arranque, rutas, inicio de sesión y barra superior.
import { h, vaciar, boton, fichas, aviso, aviso_caja, confirmar, toast, tarjeta } from './ui.js';
import * as API from './api.js';
import { cargar } from './datos.js';
import { VERSION_APP, API_URL } from './config.js';
import * as Op from './pantallas/operario.js';
import * as Ve from './pantallas/ventas.js';
import * as Ga from './pantallas/gastos.js';
import * as Cl from './pantallas/clientes.js';
import * as Re from './pantallas/resumen.js';
import * as Ta from './pantallas/tandas.js';
import { hoyISO, fmtFecha } from './calc.js';

const raiz = document.getElementById('app');
let sesion = null;
let vistaActual = { ruta: '', render: null };

const ctx = {
  ir: (hash) => { if (location.hash === hash) renderizar(); else location.hash = hash; },
  refrescar: () => renderizar(),
};

// ---------- barra superior ----------
const chip = h('button', { class: 'estado-sync', type: 'button', onclick: () => detallesSync() }, '…');
function pintarChip() {
  const e = API.estado;
  let txt = '✓ Al día'; let cl = 'ok';
  if (e.sincronizando) { txt = '↻ Enviando…'; cl = 'pend'; }
  else if (e.errores) { txt = `⚠ ${e.errores} con error`; cl = 'err'; }
  else if (!e.enLinea) { txt = e.pendientes ? `Sin señal · ${e.pendientes} por enviar` : 'Sin señal'; cl = 'off'; }
  else if (e.pendientes) { txt = `⏳ ${e.pendientes} por enviar`; cl = 'pend'; }
  else if (e.mensaje) { txt = '⚠ Revisar'; cl = 'err'; }
  chip.textContent = txt; chip.className = 'estado-sync ' + cl;
}
async function detallesSync() {
  const e = API.estado;
  if (e.mensaje) await aviso(e.mensaje);
  toast('Sincronizando…');
  const r = await API.sincronizar({ completo: true });
  if (!r.ok && r.codigo === 'RED') toast('Sin señal: se enviará cuando haya conexión', 'error');
  else if (!r.ok && r.codigo === 'SIN_SESION') return;
  else if (!r.ok) toast(r.mensaje || 'No se pudo sincronizar', 'error');
  else toast('✓ Todo sincronizado');
}

function marco(titulo, contenido, { atras = true, conservar = false } = {}) {
  const y = window.scrollY;
  vaciar(raiz);
  raiz.append(
    h('header', { class: 'barra-sup' },
      atras ? h('button', { class: 'atras', type: 'button', 'aria-label': 'Volver', onclick: () => history.back() }, '‹') : null,
      atras ? h('a', { class: 'atras inicio', href: '#/', 'aria-label': 'Ir al inicio' }, '🏠') : null,
      h('div', { class: 'marca' }, '🥚 ' + titulo), chip,
      h('button', { class: 'atras salir', type: 'button', 'aria-label': 'Cerrar sesión', title: 'Cerrar sesión', onclick: cerrarSesionUI }, '🚪')),
    h('main', {}, contenido, atras ? null : h('div', { style: 'margin-top:24px' }, boton('🚪 Cerrar sesión', cerrarSesionUI, { clase: 'secundario' }))));
  window.scrollTo(0, conservar ? y : 0);
  pintarChip();
}

// ---------- login ----------
function pantallaLogin(mensaje) {
  vaciar(raiz);
  API.calentar();
  let usuario = 'gerente';
  const pin = h('input', { class: 'input pin-input', type: 'password', inputmode: 'numeric', autocomplete: 'current-password', maxlength: 8, placeholder: '••••' });
  const msg = h('div', {});
  if (mensaje) msg.append(aviso_caja(mensaje, 'amarillo'));
  const entrar = async () => {
    if (pin.value.length < 4) { pin.classList.add('error'); return; }
    vaciar(msg).append(aviso_caja('Entrando…', 'info'));
    try {
      await API.entrar(usuario, pin.value);
      sesion = await API.sesion();
      // Se entra de una vez; los datos se descargan en segundo plano (la pantalla se actualiza sola al terminar).
      iniciarApp();
    } catch (e) {
      vaciar(msg).append(aviso_caja(e.codigo === 'RED' ? 'Sin señal. Para entrar por primera vez necesitas internet.' : e.message, 'rojo'));
    }
  };
  pin.addEventListener('keydown', (e) => { if (e.key === 'Enter') entrar(); });
  raiz.append(h('div', { class: 'login' }, h('div', { class: 'logo' }, '🥚'), h('h1', {}, 'Doble Yema'),
    !API_URL ? aviso_caja('Falta conectar la app con el servidor (API_URL en config.js).', 'rojo') : null,
    h('div', { class: 'campo' }, h('span', { class: 'etiqueta' }, '¿Quién eres?'), fichas([{ valor: 'gerente', texto: 'Gerente' }, { valor: 'operario', texto: 'Operario' }], { valor: usuario, onChange: (v) => { usuario = v; } })),
    h('div', { class: 'campo' }, h('span', { class: 'etiqueta' }, 'Tu PIN'), pin), msg, boton('Entrar', entrar),
    h('p', { class: 'suave centro', style: 'margin-top:20px' }, 'Versión ' + VERSION_APP)));
}

// ---------- rutas ----------
const esGerente = () => sesion && sesion.role === 'gerente';
const cerrar = (titulo) => marco(titulo, h('div', {}));

async function renderizar({ conservar = false } = {}) {
  if (!sesion) return pantallaLogin();
  const hash = (location.hash || '#/').replace(/^#/, '');
  const [rutaTxt, consulta] = hash.split('?');
  const partes = rutaTxt.split('/').filter(Boolean);
  const q = new URLSearchParams(consulta || '');
  const d = await cargar();
  const [a, b, c] = partes;
  const ger = esGerente();
  const soloGer = (fn) => (ger ? fn() : h('div', {}, aviso_caja('Esta pantalla es solo para gerencia.', 'rojo')));
  let titulo = 'Doble Yema'; let vista; let atras = true;
  try {
    if (!a) { atras = false; vista = ger ? inicioGerente(d) : Op.inicio(d, ctx); }
    else if (a === 'produccion') { titulo = 'Producción'; vista = b ? Op.formProduccion(d, b, ctx) : Op.listaLotes(d); }
    else if (a === 'bodega') { titulo = 'Bodega'; vista = Op.formBodega(d, ctx); }
    else if (a === 'sanidad') { titulo = 'Sanidad'; vista = Op.formSanidad(d, ctx); }
    else if (a === 'venta') { titulo = 'Venta'; vista = soloGer(() => Ve.formVenta(d, b, ctx)); }
    else if (a === 'recibo') { titulo = 'Recibo'; vista = soloGer(() => Ve.recibo(d, b, ctx)); }
    else if (a === 'recibo-pago') { titulo = 'Recibo'; vista = soloGer(() => Ve.reciboPago(d, b, ctx)); }
    else if (a === 'cobro') { titulo = 'Pago'; vista = soloGer(() => Ve.formCobro(d, b, ctx)); }
    else if (a === 'reposicion') { titulo = 'Reponer rotos'; vista = soloGer(() => Ve.formReposicion(d, ctx)); }
    else if (a === 'ventas') { titulo = 'Ventas'; vista = soloGer(() => Ve.listaVentas(d, ctx)); }
    else if (a === 'gasto') { titulo = 'Gasto'; vista = soloGer(() => Ga.formGasto(d, ctx)); }
    else if (a === 'gastos') { titulo = 'Gastos'; vista = soloGer(() => Ga.listaGastos(d, ctx)); }
    else if (a === 'proveedores') { titulo = 'Proveedores'; vista = soloGer(() => (b ? Ga.formProveedor(d, b, ctx) : Ga.proveedores(d, ctx))); }
    else if (a === 'cambio-gallinas') { titulo = 'Gallinas nuevas'; vista = soloGer(() => (b ? Ta.formCambio(d, b, ctx) : Ta.elegirLote(d))); }
    else if (a === 'tandas') { titulo = 'Historial de gallinas'; vista = soloGer(() => (b ? Ta.formEditarTanda(d, b, ctx) : Ta.historial(d))); }
    else if (a === 'gallinas') { titulo = 'Gallinas'; vista = soloGer(() => Ga.formGallinas(d, ctx)); }
    else if (a === 'clientes') {
      titulo = 'Clientes';
      if (!b) vista = soloGer(() => Cl.lista(d, q.get('f') || 'todos'));
      else if (b === 'nuevo') vista = soloGer(() => Cl.formCliente(d, null, ctx));
      else if (c === 'editar') vista = soloGer(() => Cl.formCliente(d, b, ctx));
      else vista = soloGer(() => Cl.detalle(d, b, ctx));
    }
    else if (a === 'precios') { titulo = 'Precios'; vista = soloGer(() => Cl.precios(d, b || 'general', ctx)); }
    else if (a === 'precios-ajuste') { titulo = 'Precios'; vista = soloGer(() => Cl.ajusteMasivo(d, ctx)); }
    else if (a === 'resumen') { titulo = 'Resumen'; vista = soloGer(() => Re.resumen(d)); }
    else if (a === 'mas') { titulo = 'Más'; vista = pantallaMas(d); }
    else vista = h('div', {}, aviso_caja('Pantalla no encontrada.', 'amarillo'));
  } catch (e) {
    console.error(e);
    vista = h('div', {}, aviso_caja('Algo falló al mostrar esta pantalla: ' + e.message, 'rojo'));
  }
  if (!atras && await API.primeraCarga()) vista = h('div', {}, aviso_caja('⏳ Descargando tus datos por primera vez… un momento.', 'info'), vista);
  marco(titulo, vista, { atras, conservar });
  vistaActual = { ruta: a || '' };
}

function inicioGerente(d) {
  return h('div', {},
    h('h1', {}, 'Hola · ' + fmtFecha(hoyISO())),
    Re.alertasInicio(d),
    h('div', { class: 'rejilla' },
      h('a', { class: 'boton-grande principal ancho', href: '#/venta' }, h('span', { class: 'emoji' }, '💰'), 'Nueva venta'),
      h('a', { class: 'boton-grande', href: '#/cobro' }, h('span', { class: 'emoji' }, '💵'), 'Registrar pago'),
      h('a', { class: 'boton-grande', href: '#/gasto' }, h('span', { class: 'emoji' }, '🧾'), 'Registrar gasto'),
      h('a', { class: 'boton-grande', href: '#/clientes' }, h('span', { class: 'emoji' }, '👥'), 'Clientes'),
      h('a', { class: 'boton-grande', href: '#/resumen' }, h('span', { class: 'emoji' }, '📊'), 'Resumen'),
      h('a', { class: 'boton-grande', href: '#/produccion' }, h('span', { class: 'emoji' }, '🥚'), 'Producción'),
      h('a', { class: 'boton-grande', href: '#/bodega' }, h('span', { class: 'emoji' }, '📦'), 'Bodega'),
      h('a', { class: 'boton-grande', href: '#/sanidad' }, h('span', { class: 'emoji' }, '💊'), 'Sanidad'),
      h('a', { class: 'boton-grande', href: '#/mas' }, h('span', { class: 'emoji' }, '⋯'), 'Más')));
}

async function cerrarSesionUI() {
  if (!(await confirmar('¿Cerrar sesión en este equipo?'))) return;
  const r = await API.salir();
  if (!r.ok) { aviso(`Hay ${r.pendientes} registro(s) sin enviar. Conéctate a internet y espera a que se envíen antes de salir.`); return; }
  sesion = null; pantallaLogin();
}

function pantallaMas(d) {
  const enlace = (href, txt) => h('li', {}, h('a', { class: 'item', href }, h('div', { class: 'grande' }, txt)));
  const lista = esGerente() ? [
    enlace('#/ventas', '🧾 Ventas recientes'), enlace('#/gastos', '💸 Gastos recientes'), enlace('#/reposicion', '💔 Reponer huevos rotos'),
    enlace('#/precios/general', '🏷️ Lista general de precios'), enlace('#/gallinas', '🐔 Vender gallinas (enfermas o recambio)'), enlace('#/cambio-gallinas', '🆕 Entran gallinas nuevas a un lote'), enlace('#/tandas', '📚 Historial de gallinas por lote'), enlace('#/proveedores', '🚚 Proveedores'),
  ] : [];
  return h('div', {}, h('h1', {}, 'Más'), h('ul', { class: 'lista' }, lista),
    tarjeta(h('div', { class: 'suave' }, `Sesión: ${sesion.usuario} · Versión ${VERSION_APP}`), [API.estado.diagLogin, API.estado.diag].filter(Boolean).map((x) => h('div', { class: 'suave' }, `${x.accion}: ${(x.total / 1000).toFixed(1)} s en total${x.servidor !== undefined ? ' (servidor ' + (x.servidor / 1000).toFixed(1) + ' s)' : ''}`)), h('div', { style: 'height:10px' }),
      boton('🚪 Cerrar sesión', cerrarSesionUI, { clase: 'secundario' })));
}

function iniciarApp() {
  let antes = false;
  API.alCambiar((e) => {
    pintarChip();
    const termino = antes && !e.sincronizando;
    antes = e.sincronizando;
    // Al terminar una sincronización se refrescan solo las pantallas de consulta (no los formularios).
    if (termino && e.cambios && sesion && ['', 'clientes', 'resumen', 'ventas', 'gastos', 'mas'].includes(vistaActual.ruta) && !/\/(nuevo|editar)/.test(location.hash)) renderizar({ conservar: true });
  });
  if (!location.hash) location.hash = '#/';
  renderizar();
  API.iniciarSincronizacionAutomatica();
}

window.addEventListener('hashchange', renderizar);

(async () => {
  sesion = await API.sesion();
  if (sesion && sesion.vencida) { pantallaLogin('Tu sesión venció. Entra de nuevo con tu PIN (lo registrado no se pierde).'); return; }
  if (!sesion) { pantallaLogin(); return; }
  iniciarApp();
})();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
