// Comunicación con el backend (Apps Script) y sincronización de la cola.
import { API_URL } from './config.js';
import * as S from './store.js';

const listeners = new Set();
export const alCambiar = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const avisar = () => listeners.forEach((fn) => { try { fn(estado); } catch (e) { /* la interfaz no debe romper la sincronización */ } });

export const estado = { enLinea: navigator.onLine, sincronizando: false, pendientes: 0, errores: 0, ultimaSync: 0, mensaje: '' };

// Se envía como texto plano (sin cabeceras personalizadas) para evitar el preflight de CORS con Apps Script.
async function llamar(cuerpo, ms = 60000) {
  if (!API_URL) throw Object.assign(new Error('La app aún no está conectada al servidor (falta API_URL en config.js).'), { codigo: 'SIN_URL' });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const resp = await fetch(API_URL, { method: 'POST', body: JSON.stringify(cuerpo), redirect: 'follow', signal: ctrl.signal });
    const datos = await resp.json();
    if (!datos.ok) throw Object.assign(new Error(datos.error || 'Error del servidor'), { codigo: datos.code || 'ERROR' });
    return datos;
  } catch (e) {
    if (e.codigo) throw e;
    throw Object.assign(new Error('Sin conexión con el servidor'), { codigo: 'RED' });
  } finally {
    clearTimeout(timer);
  }
}

// Despierta el servidor mientras la persona escribe su PIN (la primera llamada del día suele tardar).
export function calentar() { if (API_URL && navigator.onLine) llamar({ action: 'ping' }, 15000).catch(() => {}); }

export async function entrar(usuario, pin) {
  const r = await llamar({ action: 'login', usuario, pin });
  await S.setMeta('token', r.token);
  await S.setMeta('usuario', r.usuario);
  await S.setMeta('role', r.role);
  await S.setMeta('exp', r.exp);
  return r;
}

export async function primeraCarga() { return !(await S.getMeta('ultimoCompleto')); }

export async function sesion() {
  const [token, usuario, role, exp] = await Promise.all(['token', 'usuario', 'role', 'exp'].map(S.getMeta));
  if (!token || !role) return null;
  return { token, usuario, role, vencida: exp && exp < Date.now() };
}

export async function salir() {
  const pend = await S.colaContar();
  if (pend > 0) return { ok: false, pendientes: pend };
  await S.limpiarTodo();
  return { ok: true };
}

export async function actualizarPendientes() {
  estado.pendientes = await S.colaContar();
  avisar();
}

async function enviarCola(token) {
  const cola = (await S.colaTodos()).sort((a, b) => a.n - b.n);
  let enviados = 0;
  // Los registros con foto van solos (son pesados); el resto en lotes de 20.
  let i = 0;
  while (i < cola.length) {
    const lote = [];
    while (i < cola.length && lote.length < 20) {
      const item = cola[i];
      if (item.record._foto) {
        if (lote.length === 0) { lote.push(item); i++; }
        break;
      }
      lote.push(item); i++;
    }
    const r = await llamar({ action: 'sync', token, records: lote.map((x) => ({ entity: x.entity, record: x.record })) });
    for (let k = 0; k < lote.length; k++) {
      const item = lote[k];
      const res = r.results[k] || {};
      if (res.status === 'ok' || res.status === 'dup') {
        await S.colaQuitar(item.n);
        await S.marcarEnviado(item.entity, item.record.id, res.foto_url ? { foto_url: res.foto_url } : {});
        enviados++;
      } else {
        item.intentos++;
        item.error = res.error || 'Error desconocido';
        await S.colaActualizar(item);
      }
    }
  }
  return enviados;
}

async function traer(token, completo) {
  const desde = completo ? 0 : Math.max(((await S.getMeta('ultimoPull')) || 0) - 5000, 0);
  const r = await llamar({ action: 'pull', token, since: desde || undefined });
  for (const [tabla, filas] of Object.entries(r.tablas)) {
    if (!S.TABLAS.includes(tabla)) continue;
    if (!desde) await S.reemplazarTabla(tabla, filas);
    else await S.mezclar(tabla, filas);
  }
  await S.setMeta('ultimoPull', r.server_time);
  const recibidas = Object.values(r.tablas).reduce((a, f) => a + f.length, 0);
  if (!desde) await S.setMeta('ultimoCompleto', Date.now());
  return recibidas;
}

let enCurso = null;

// Envía lo pendiente y trae lo nuevo. Seguro de llamar muchas veces.
export function sincronizar({ completo = false } = {}) {
  if (enCurso) return enCurso;
  enCurso = (async () => {
    estado.sincronizando = true; estado.mensaje = ''; estado.cambios = false;
    avisar();
    try {
      const s = await sesion();
      if (!s) return { ok: false, codigo: 'SIN_SESION' };
      estado.enLinea = navigator.onLine;
      if (!navigator.onLine) return { ok: false, codigo: 'RED' };
      const enviados = await enviarCola(s.token);
      const ultimoCompleto = (await S.getMeta('ultimoCompleto')) || 0;
      const toca = completo || Date.now() - ultimoCompleto > 3600000;
      const recibidas = await traer(s.token, toca);
      estado.cambios = enviados + recibidas > 0; // si no cambió nada, la pantalla no se redibuja
      estado.ultimaSync = Date.now();
      estado.enLinea = true;
      return { ok: true };
    } catch (e) {
      if (e.codigo === 'BUSY') {
        // El servidor estaba ocupado con otro envío: no es un error, se reintenta solo.
        estado.mensaje = '';
        setTimeout(() => sincronizar(), 8000);
      } else if (e.codigo === 'AUTH') {
        await S.delMeta('token');
        estado.mensaje = 'Tu sesión venció. Vuelve a entrar con tu PIN (lo registrado no se pierde).';
      } else if (e.codigo === 'RED') estado.enLinea = false;
      else estado.mensaje = e.message;
      return { ok: false, codigo: e.codigo, mensaje: e.message };
    } finally {
      estado.sincronizando = false;
      estado.pendientes = await S.colaContar();
      const cola = await S.colaTodos();
      estado.errores = cola.filter((c) => c.error).length;
      enCurso = null;
      avisar();
    }
  })();
  return enCurso;
}

export function iniciarSincronizacionAutomatica() {
  window.addEventListener('online', () => { estado.enLinea = true; avisar(); sincronizar(); });
  window.addEventListener('offline', () => { estado.enLinea = false; avisar(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sincronizar(); });
  setInterval(() => { if (navigator.onLine && document.visibilityState === 'visible') sincronizar(); }, 60000);
  sincronizar();
}
