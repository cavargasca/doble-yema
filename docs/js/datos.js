// Carga de datos locales y creación de registros (todo pasa por la cola de envío).
import * as S from './store.js';
import * as API from './api.js';
import { hoyISO } from './calc.js';

const CLAVES = {
  Config: 'config', Lotes: 'lotes', Produccion: 'produccion', Empaque: 'empaque', Sanidad: 'sanidad', Clientes: 'clientes',
  Precios: 'precios', Ventas: 'ventas', VentaItems: 'ventaItems', Cobros: 'cobros', Reposiciones: 'reposiciones',
  Proveedores: 'proveedores', Gastos: 'gastos', SalidasAves: 'salidasAves', VentasAves: 'ventasAves', Tandas: 'tandas',
};

export async function cargar() {
  const d = {};
  await Promise.all(Object.entries(CLAVES).map(async ([t, k]) => { d[k] = await S.todos(t); }));
  const cfg = { nombre_negocio: 'Doble Yema', kg_por_bulto: '40', margen_minimo_pct: '10', umbral_cliente_anterior_dias: '30', costo_ave: '27000', precio_gallina_descarte: '20000', meses_vida_ave: '0' };
  for (const r of d.config) cfg[r.id] = r.value;
  d.cfg = cfg;
  d.lotes.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return d;
}

export const lista = (txt, def) => String((txt === undefined || txt === '') ? def : txt).split(',').map((s) => s.trim()).filter(Boolean);

function sincronizarYa() {
  API.actualizarPendientes();
  setTimeout(() => API.sincronizar(), 50);
}

export async function crear(entidad, prefijo, datos, foto) {
  const reg = { id: S.nuevoId(prefijo), ts: Date.now(), ...datos };
  if (!reg.fecha && entidad !== 'Precios') reg.fecha = hoyISO();
  const guardado = await S.registrar(entidad, reg, foto);
  sincronizarYa();
  return guardado;
}

// Para clientes, proveedores y otros registros sin historial: se envía el registro completo.
export async function guardarCompleto(entidad, registro) {
  const { _pendiente, ...limpio } = registro;
  const guardado = await S.registrar(entidad, limpio);
  sincronizarYa();
  return guardado;
}

// Nada se borra: se anula con motivo y el registro queda en el historial.
export async function anular(entidad, id, motivo) {
  const actual = await S.uno(entidad, id);
  if (!actual) throw new Error('No se encontró el registro');
  return guardarCompleto(entidad, { ...actual, anulado: true, motivo });
}

export const nombreCliente = (d, id) => (d.clientes.find((c) => c.id === id) || {}).nombre || '(cliente)';
