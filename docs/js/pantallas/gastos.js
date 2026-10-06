// Gerencia: gastos y proveedores.
import { h, tarjeta, campo, stepper, dinero, fichas, selector, boton, confirmar, aviso, toast, aviso_caja, pedirTexto, comprimirImagen, vaciar } from '../ui.js';
import { hoyISO, fmtCOP, fmtNum, fmtFechaCorta, num, activo, CAT_ALIMENTO, CAT_CUBETAS, precioKgAlimento } from '../calc.js';
import { crear, guardarCompleto, anular, lista } from '../datos.js';
import { nuevoId } from '../store.js';

const MEDIOS = ['Efectivo', 'Nequi', 'Daviplata', 'Banco'];

export function formGasto(d, ctx) {
  const cats = lista(d.cfg.categorias_gasto, 'Alimento,Cubetas (empaque),Vitaminas y medicinas,Mano de obra,Servicios,Transporte,Mantenimiento,Aves (inversión),Otros');
  const unidades = lista(d.cfg.unidades, 'bulto,kg,unidad,ml,g,dosis');
  let categoria = '';
  let medio = 'Efectivo';
  let naturaleza = 'negocio';
  let foto = null;
  const fecha = h('input', { class: 'input', type: 'date', value: hoyISO(), max: hoyISO() });
  const zonaDetalle = h('div', {});
  const valor = dinero({});
  const desc = h('input', { class: 'input', type: 'text', placeholder: 'Qué se compró', maxlength: 200 });
  const cant = stepper({ min: 0, max: 100000, valor: 1, paso: 1, decimales: 1 });
  const selUnidad = selector(unidades.map((u) => ({ valor: u, texto: u })), { valor: 'unidad' });
  const bultos = stepper({ min: 1, max: 1000, valor: 1 });
  const selProv = selector(d.proveedores.map((p) => ({ valor: p.id, texto: p.nombre })), { vacio: 'Sin proveedor' });
  const selLote = selector(d.lotes.map((l) => ({ valor: l.id, texto: l.nombre })), { vacio: 'No aplica / todos' });
  const vistaFoto = h('div', {});
  const archivo = h('input', { type: 'file', accept: 'image/*', capture: 'environment', style: 'display:none' });
  archivo.addEventListener('change', async () => {
    if (!archivo.files[0]) return;
    try {
      foto = await comprimirImagen(archivo.files[0]);
      vaciar(vistaFoto).append(h('img', { src: foto.vista, style: 'max-width:100%; border-radius:12px; margin-top:8px' }), h('div', { class: 'suave' }, `Foto lista (${Math.round(foto.bytes / 1024)} KB)`));
    } catch (e) { toast('No se pudo leer la foto', 'error'); }
  });

  const pintarDetalle = () => {
    vaciar(zonaDetalle);
    if (categoria === CAT_ALIMENTO) zonaDetalle.append(campo('¿Cuántos bultos?', bultos, 'Cada bulto es de ' + (d.cfg.kg_por_bulto || 40) + ' kg.'));
    else if (categoria === CAT_CUBETAS) zonaDetalle.append(campo('¿Cuántas cubetas?', cant), campo('Descripción', desc));
    else zonaDetalle.append(campo('¿Qué se compró?', desc), h('div', { class: 'fila' }, h('div', { style: 'flex:1' }, campo('Cantidad', cant)), h('div', { style: 'flex:1' }, campo('Unidad', selUnidad))));
    if (categoria === 'Vitaminas y medicinas') zonaDetalle.append(campo('Lote (si es para uno)', selLote));
  };
  const fCat = fichas(cats, { valor: '', onChange: (v) => { categoria = v; pintarDetalle(); } });

  const guardar = async () => {
    if (!categoria) { aviso('Elige el tipo de gasto.'); return; }
    const v = valor.get();
    if (!v) { aviso('Escribe cuánto costó en total.'); return; }
    const rec = { fecha: fecha.value || hoyISO(), proveedor_id: selProv.value, categoria, valor_total: v, medio_pago: medio, naturaleza, lote_id: categoria === 'Vitaminas y medicinas' ? selLote.value : '' };
    const avisos = [];
    if (categoria === CAT_ALIMENTO) {
      Object.assign(rec, { cantidad: bultos.get(), unidad: 'bulto', descripcion: 'Alimento (' + bultos.get() + ' bultos)' });
      const kgB = num(d.cfg.kg_por_bulto) || 40;
      const prom = precioKgAlimento(d.gastos, kgB);
      const nuevo = v / (bultos.get() * kgB);
      if (prom && Math.abs(nuevo - prom) / prom > 0.15) avisos.push(`Pagaste ${fmtCOP(nuevo * kgB)} por bulto; lo habitual es ${fmtCOP(prom * kgB)}.`);
    } else {
      if (!desc.value.trim()) { desc.classList.add('error'); aviso('Escribe qué se compró.'); return; }
      Object.assign(rec, { cantidad: cant.get(), unidad: categoria === CAT_CUBETAS ? 'unidad' : selUnidad.value, descripcion: desc.value.trim() });
    }
    if (!foto) avisos.push('No tomaste foto de la factura o recibo.');
    if (naturaleza === 'retiro') avisos.push('Marcado como retiro personal: no cuenta como costo del negocio.');
    const ok = await confirmar((avisos.length ? '⚠️ ' + avisos.join('\n⚠️ ') + '\n\n' : '') + `${categoria}: ${rec.descripcion}\nTotal ${fmtCOP(v)} · ${medio}\n\n¿Guardar el gasto?`, { si: 'Sí, guardar' });
    if (!ok) return;
    await crear('Gastos', 'ga', rec, foto ? { mime: foto.mime, data: foto.data } : undefined);
    toast('✓ Gasto guardado'); ctx.ir('#/');
  };

  return h('div', {}, h('h1', {}, 'Registrar gasto'),
    campo('Fecha', fecha), campo('Tipo de gasto', fCat), zonaDetalle,
    campo('Valor total pagado', valor),
    campo('Proveedor', selProv), boton('+ Proveedor nuevo', async () => {
      const n = await pedirTexto('Nombre del proveedor'); if (!n) return;
      const p = { id: nuevoId('pv'), nombre: n, telefono: '', tipo: '', notas: '' };
      await guardarCompleto('Proveedores', p); d.proveedores.push(p);
      selProv.append(h('option', { value: p.id }, p.nombre)); selProv.value = p.id;
    }, { clase: 'secundario chico' }), h('div', { style: 'height:14px' }),
    campo('¿Con qué se pagó?', fichas(MEDIOS, { valor: medio, onChange: (v) => { medio = v; } })),
    campo('¿De quién es el gasto?', fichas([{ valor: 'negocio', texto: 'Del negocio' }, { valor: 'retiro', texto: 'Retiro personal' }], { valor: naturaleza, onChange: (v) => { naturaleza = v; } })),
    h('div', { class: 'campo' }, h('span', { class: 'etiqueta' }, 'Foto de la factura o recibo'), archivo, boton('📷 Tomar foto', () => archivo.click(), { clase: 'secundario' }), vistaFoto),
    boton('Guardar gasto', guardar, { clase: 'verde' }));
}

export function listaGastos(d, ctx) {
  const ult = d.gastos.filter(activo).sort((a, b) => b.fecha.localeCompare(a.fecha) || num(b.ts) - num(a.ts)).slice(0, 40);
  const prov = (id) => (d.proveedores.find((p) => p.id === id) || {}).nombre || '';
  return h('div', {}, h('h1', {}, 'Gastos recientes'),
    ult.length ? h('ul', { class: 'lista' }, ult.map((g) => h('li', {}, h('div', { class: 'item' },
      h('div', {}, h('div', { class: 'grande' }, g.descripcion || g.categoria), h('div', { class: 'suave' }, `${fmtFechaCorta(g.fecha)} · ${g.categoria}${prov(g.proveedor_id) ? ' · ' + prov(g.proveedor_id) : ''}${g._pendiente ? ' · sin enviar' : ''}`),
        g.foto_url ? h('a', { href: g.foto_url, target: '_blank', rel: 'noopener', class: 'suave' }, 'Ver foto') : null),
      h('div', { class: 'derecha' }, h('div', { class: 'grande' }, fmtCOP(g.valor_total)),
        boton('Anular', async () => { const m = await pedirTexto('¿Por qué se anula?'); if (!m) return; await anular('Gastos', g.id, m); toast('Gasto anulado'); ctx.refrescar(); }, { clase: 'peligro chico' })))))) : aviso_caja('Aún no hay gastos.', 'info'));
}

export function proveedores(d, ctx) {
  const nombre = h('input', { class: 'input', type: 'text', placeholder: 'Nombre del proveedor', maxlength: 100 });
  const tel = h('input', { class: 'input', type: 'tel', placeholder: 'Teléfono (opcional)', maxlength: 20 });
  return h('div', {}, h('h1', {}, 'Proveedores'),
    h('ul', { class: 'lista' }, d.proveedores.map((p) => h('li', { class: 'item' }, h('div', {}, h('div', { class: 'grande' }, p.nombre), h('div', { class: 'suave' }, p.telefono || ''))))),
    tarjeta(h('h3', {}, 'Agregar proveedor'), nombre, h('div', { style: 'height:8px' }), tel, h('div', { style: 'height:8px' }),
      boton('Agregar', async () => {
        if (!nombre.value.trim()) { nombre.classList.add('error'); return; }
        await guardarCompleto('Proveedores', { id: nuevoId('pv'), nombre: nombre.value.trim(), telefono: tel.value.trim(), tipo: '', notas: '' });
        toast('✓ Agregado'); ctx.refrescar();
      }, { clase: 'verde' })));
}
