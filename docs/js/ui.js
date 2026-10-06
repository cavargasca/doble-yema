// Componentes de interfaz sencillos, sin librerías externas.
import { fmtCOP } from './calc.js';

export function h(tag, props = {}, ...hijos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (['value', 'checked', 'disabled', 'selected'].includes(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of hijos.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const vaciar = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

export const aNumero = (txt) => {
  const n = parseFloat(String(txt).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const aDecimal = (txt) => {
  const n = parseFloat(String(txt).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

// ---------- avisos ----------
let toastEl = null;
export function toast(mensaje, tipo = 'ok') {
  if (!toastEl) {
    toastEl = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastEl);
  }
  toastEl.className = 'toast visible ' + tipo;
  toastEl.textContent = mensaje;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { toastEl.className = 'toast'; }, tipo === 'error' ? 5000 : 2200);
}

function dialogo(contenido, { cerrable = true } = {}) {
  return new Promise((resolve) => {
    const fondo = h('div', { class: 'modal-fondo' });
    const cerrar = (v) => { fondo.remove(); document.body.classList.remove('sin-scroll'); resolve(v); };
    const caja = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, contenido(cerrar));
    fondo.append(caja);
    if (cerrable) fondo.addEventListener('click', (e) => { if (e.target === fondo) cerrar(null); });
    document.body.append(fondo);
    document.body.classList.add('sin-scroll');
  });
}

export function confirmar(mensaje, { si = 'Sí, continuar', no = 'Cancelar', peligro = false } = {}) {
  return dialogo((cerrar) => [
    h('p', { class: 'modal-texto' }, mensaje),
    h('div', { class: 'fila-botones' },
      h('button', { class: 'btn secundario', type: 'button', onclick: () => cerrar(false) }, no),
      h('button', { class: 'btn ' + (peligro ? 'peligro' : ''), type: 'button', onclick: () => cerrar(true) }, si)),
  ]);
}

export function aviso(mensaje) {
  return dialogo((cerrar) => [
    h('p', { class: 'modal-texto' }, mensaje),
    h('button', { class: 'btn', type: 'button', onclick: () => cerrar(true) }, 'Entendido'),
  ]);
}

export function pedirTexto(titulo, { placeholder = '', requerido = true, valor = '' } = {}) {
  return dialogo((cerrar) => {
    const input = h('input', { type: 'text', class: 'input', placeholder, value: valor, maxlength: 200 });
    setTimeout(() => input.focus(), 50);
    const ok = () => {
      if (requerido && !input.value.trim()) { input.classList.add('error'); return; }
      cerrar(input.value.trim());
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    return [
      h('p', { class: 'modal-texto' }, titulo), input,
      h('div', { class: 'fila-botones' },
        h('button', { class: 'btn secundario', type: 'button', onclick: () => cerrar(null) }, 'Cancelar'),
        h('button', { class: 'btn', type: 'button', onclick: ok }, 'Aceptar')),
    ];
  });
}

export const modal = dialogo;

// ---------- campos ----------
export function campo(etiqueta, control, ayuda) {
  // Solo los campos simples van dentro de <label>; los grupos de botones no (el nombre accesible de cada botón se confundiría).
  const simple = ['INPUT', 'SELECT', 'TEXTAREA'].includes(control.tagName);
  return h(simple ? 'label' : 'div', { class: 'campo' }, h('span', { class: 'etiqueta' }, etiqueta), control, ayuda ? h('span', { class: 'ayuda' }, ayuda) : null);
}

// Contador con botones grandes: pensado para dedos con guantes y poca práctica.
export function stepper({ valor = 0, min = 0, max = 100000, paso = 1, decimales = 0, onChange } = {}) {
  let v = valor;
  const redondear = (n) => Number(n.toFixed(decimales));
  const mostrar = (n) => (decimales ? String(n).replace('.', ',') : String(n));
  const input = h('input', { type: 'text', inputmode: decimales ? 'decimal' : 'numeric', class: 'step-valor', value: mostrar(v), 'aria-label': 'cantidad' });
  const poner = (n, emitir = true) => {
    v = redondear(Math.min(Math.max(n, min), max));
    input.value = mostrar(v);
    if (emitir && onChange) onChange(v);
  };
  input.addEventListener('focus', () => input.select());
  // El valor escrito se toma mientras se digita (acepta coma o punto), sin depender de salir del campo.
  input.addEventListener('input', () => {
    v = redondear(Math.min(Math.max(aDecimal(input.value), min), max));
    if (onChange) onChange(v);
  });
  input.addEventListener('change', () => poner(aDecimal(input.value)));
  const el = h('div', { class: 'stepper' },
    h('button', { type: 'button', class: 'step-btn', 'aria-label': 'menos', onclick: () => poner(v - paso) }, '−'),
    input,
    h('button', { type: 'button', class: 'step-btn', 'aria-label': 'más', onclick: () => poner(v + paso) }, '+'));
  el.get = () => v;
  el.set = (n, emitir = false) => poner(n, emitir);
  return el;
}

// Campo de dinero: acepta dígitos y muestra el valor con puntos de miles debajo.
export function dinero({ valor = 0, onChange, placeholder = '0' } = {}) {
  const input = h('input', { type: 'text', inputmode: 'numeric', class: 'input grande', placeholder, value: valor ? String(Math.round(valor)) : '' });
  const vista = h('div', { class: 'vista-dinero' }, valor ? fmtCOP(valor) : '');
  const leer = () => Math.round(aNumero(input.value));
  input.addEventListener('input', () => {
    vista.textContent = leer() ? fmtCOP(leer()) : '';
    if (onChange) onChange(leer());
  });
  input.addEventListener('focus', () => input.select());
  const el = h('div', { class: 'dinero' }, input, vista);
  el.get = leer;
  el.set = (n) => { input.value = n ? String(Math.round(n)) : ''; vista.textContent = n ? fmtCOP(n) : ''; if (onChange) onChange(leer()); };
  return el;
}

// Opciones como botones tocables (una sola selección).
export function fichas(opciones, { valor, onChange, clase = '' } = {}) {
  let actual = valor;
  const cont = h('div', { class: 'fichas ' + clase, role: 'radiogroup' });
  const pintar = () => {
    vaciar(cont);
    for (const o of opciones) {
      const val = typeof o === 'string' ? o : o.valor;
      const txt = typeof o === 'string' ? o : o.texto;
      cont.append(h('button', {
        type: 'button', class: 'ficha' + (val === actual ? ' activa' : ''), role: 'radio', 'aria-checked': val === actual ? 'true' : 'false',
        onclick: () => { actual = val; pintar(); if (onChange) onChange(val); },
      }, txt));
    }
  };
  pintar();
  cont.get = () => actual;
  cont.set = (v) => { actual = v; pintar(); };
  return cont;
}

export function selector(opciones, { valor = '', onChange, vacio } = {}) {
  const sel = h('select', { class: 'input' });
  if (vacio) sel.append(h('option', { value: '' }, vacio));
  for (const o of opciones) sel.append(h('option', { value: o.valor, selected: o.valor === valor }, o.texto));
  if (onChange) sel.addEventListener('change', () => onChange(sel.value));
  return sel;
}

export function boton(texto, onclick, { clase = '', icono = '' } = {}) {
  return h('button', { type: 'button', class: 'btn ' + clase, onclick }, icono ? h('span', { class: 'icono', 'aria-hidden': 'true' }, icono) : null, texto);
}

export function tarjeta(...hijos) {
  return h('section', { class: 'tarjeta' }, ...hijos);
}

export function insignia(texto, tipo = 'neutro') {
  return h('span', { class: 'insignia ' + tipo }, texto);
}

export function aviso_caja(texto, nivel = 'info') {
  return h('div', { class: 'caja-aviso ' + nivel, role: nivel === 'rojo' ? 'alert' : 'note' }, texto);
}

// ---------- fotos ----------
export function comprimirImagen(archivo, lado = 1280, calidad = 0.7) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, lado / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * escala);
      c.height = Math.round(img.height * escala);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL('image/jpeg', calidad);
      URL.revokeObjectURL(url);
      resolve({ mime: 'image/jpeg', data: dataUrl.split(',')[1], vista: dataUrl, bytes: Math.round((dataUrl.length * 3) / 4) });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la foto')); };
    img.src = url;
  });
}

// ---------- compartir ----------
export function enlaceWhatsApp(telefono, texto) {
  const limpio = String(telefono || '').replace(/\D/g, '');
  const numero = limpio.length === 10 ? '57' + limpio : limpio;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

export async function compartirTexto(texto, titulo = 'Doble Yema') {
  if (navigator.share) {
    try { await navigator.share({ title: titulo, text: texto }); return true; } catch (e) { if (e.name === 'AbortError') return false; }
  }
  try { await navigator.clipboard.writeText(texto); toast('Texto copiado'); return true; } catch (e) { return false; }
}

export function barra(porcentaje, tipo = '') {
  return h('div', { class: 'barra' }, h('div', { class: 'barra-llena ' + tipo, style: `width:${Math.max(0, Math.min(100, porcentaje))}%` }));
}
