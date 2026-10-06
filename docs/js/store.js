// Almacenamiento local (IndexedDB): tablas en caché, cola de envíos pendientes y datos de sesión.
// Todo lo que se registra se guarda primero aquí, así funciona sin señal.

const DB_NOMBRE = 'doble-yema';
const DB_VERSION = 3;
export const TABLAS = ['Config', 'Lotes', 'Produccion', 'Empaque', 'Sanidad', 'Clientes', 'Precios', 'Ventas', 'VentaItems', 'Cobros', 'Reposiciones', 'Proveedores', 'Gastos', 'SalidasAves', 'VentasAves', 'Tandas'];

let dbPromesa = null;

function abrir() {
  if (dbPromesa) return dbPromesa;
  dbPromesa = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOMBRE, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const t of TABLAS) if (!db.objectStoreNames.contains(t)) db.createObjectStore(t, { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'k' });
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'n', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromesa;
}

function promesa(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(stores, modo, fn) {
  const db = await abrir();
  const t = db.transaction(stores, modo);
  const hecho = new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
  const res = await fn(t);
  await hecho;
  return res;
}

export const todos = (tabla) => tx([tabla], 'readonly', (t) => promesa(t.objectStore(tabla).getAll()));
export const uno = (tabla, id) => tx([tabla], 'readonly', (t) => promesa(t.objectStore(tabla).get(id)));

export async function guardarLocal(tabla, registro) {
  await tx([tabla], 'readwrite', (t) => t.objectStore(tabla).put(registro));
}

export async function mezclar(tabla, registros) {
  if (!registros.length) return;
  await tx([tabla], 'readwrite', async (t) => {
    const s = t.objectStore(tabla);
    for (const r of registros) {
      const actual = await promesa(s.get(r.id));
      // Un registro con envío pendiente manda sobre lo que trae el servidor, hasta que se envíe.
      if (actual && actual._pendiente) continue;
      s.put(r);
    }
  });
}

export async function reemplazarTabla(tabla, registros) {
  await tx([tabla], 'readwrite', async (t) => {
    const s = t.objectStore(tabla);
    const locales = await promesa(s.getAll());
    const pendientes = new Set(locales.filter((l) => l._pendiente).map((l) => l.id));
    await promesa(s.clear());
    for (const l of locales) if (l._pendiente) s.put(l);
    for (const r of registros) if (!pendientes.has(r.id)) s.put(r);
  });
}

export const getMeta = async (k) => {
  const r = await tx(['meta'], 'readonly', (t) => promesa(t.objectStore('meta').get(k)));
  return r ? r.v : undefined;
};
export const setMeta = (k, v) => tx(['meta'], 'readwrite', (t) => t.objectStore('meta').put({ k, v }));
export const delMeta = (k) => tx(['meta'], 'readwrite', (t) => t.objectStore('meta').delete(k));

// ---------- cola de envíos ----------
export const colaTodos = () => tx(['outbox'], 'readonly', (t) => promesa(t.objectStore('outbox').getAll()));
export const colaContar = () => tx(['outbox'], 'readonly', (t) => promesa(t.objectStore('outbox').count()));
export const colaQuitar = (n) => tx(['outbox'], 'readwrite', (t) => t.objectStore('outbox').delete(n));
export const colaActualizar = (item) => tx(['outbox'], 'readwrite', (t) => t.objectStore('outbox').put(item));

// Guarda el registro en la tabla local y lo deja en la cola para enviarlo cuando haya conexión.
export async function registrar(entity, registro, foto) {
  const local = { ...registro, _pendiente: true };
  await tx([entity, 'outbox'], 'readwrite', (t) => {
    t.objectStore(entity).put(local);
    const envio = { ...registro };
    if (foto) envio._foto = foto;
    t.objectStore('outbox').add({ entity, record: envio, creado: Date.now(), intentos: 0, error: '' });
  });
  return local;
}

export async function marcarEnviado(entity, id, extra = {}) {
  await tx([entity], 'readwrite', async (t) => {
    const s = t.objectStore(entity);
    const r = await promesa(s.get(id));
    if (r) {
      const { _pendiente, ...limpio } = r;
      s.put({ ...limpio, ...extra });
    }
  });
}

export async function limpiarTodo() {
  const db = await abrir();
  db.close();
  dbPromesa = null;
  await new Promise((resolve) => {
    const r = indexedDB.deleteDatabase(DB_NOMBRE);
    r.onsuccess = r.onerror = r.onblocked = () => resolve();
  });
}

// Identificadores únicos generados en el teléfono, para que reenviar nunca duplique.
export function nuevoId(prefijo) {
  const aleatorio = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2) + Date.now().toString(16)).replace(/-/g, '').slice(0, 14);
  return `${prefijo}-${aleatorio}`;
}

// Numeración propia de comprobantes: prefijo por dispositivo + consecutivo.
export async function siguienteNumero(prefijo) {
  let dev = await getMeta('dispositivo');
  if (!dev) {
    dev = Array.from({ length: 2 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
    await setMeta('dispositivo', dev);
  }
  const clave = 'consecutivo_' + prefijo;
  const n = ((await getMeta(clave)) || 0) + 1;
  await setMeta(clave, n);
  return `${prefijo}-${dev}-${String(n).padStart(4, '0')}`;
}
