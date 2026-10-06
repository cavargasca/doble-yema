// Gerencia: gastos y proveedores.
import { h, tarjeta, campo, stepper, dinero, fichas, selector, boton, confirmar, aviso, toast, aviso_caja, pedirTexto, comprimirImagen, vaciar } from '../ui.js';
import { hoyISO, fmtCOP, fmtNum, fmtFechaCorta, num, activo, CAT_ALIMENTO, CAT_CUBETAS, precioKgAlimento, avesDelLote, inversionAves } from '../calc.js';
import { crear, guardarCompleto, anular, lista } from '../datos.js';
import { nuevoId } from '../store.js';

const MEDIOS = ['Efectivo', 'Nequi', 'Daviplata', 'Banco'];

export function formGasto(d, ctx) {
  const cats = lista(d.cfg.categorias_gasto, 'Alimento,Cubetas (empaque),Vitaminas y medicinas,Mano de obra,Servicios,Transporte,Mantenimiento,Aves (inversión),Otros');
  if (!cats.includes('Piedra cal y suplementos')) cats.splice(1, 0, 'Piedra cal y suplementos');
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

const TIPOS_PROV = ['Alimento (concentrado)', 'Piedra cal / suplementos', 'Gallinas', 'Cubetas y empaque', 'Medicinas y vitaminas', 'Transporte', 'Otro'];

export function proveedores(d, ctx) {
  const lista$ = d.proveedores.filter((p) => p.estado !== 'inactivo').sort((a, b) => (a.tipo || '').localeCompare(b.tipo || '') || a.nombre.localeCompare(b.nombre));
  return h('div', {}, h('h1', {}, 'Proveedores'),
    lista$.length ? h('ul', { class: 'lista' }, lista$.map((p) => h('li', {}, h('a', { class: 'item', href: '#/proveedores/' + p.id },
      h('div', {}, h('div', { class: 'grande' }, p.nombre), h('div', { class: 'suave' }, [p.tipo || 'Sin tipo', p.telefono].filter(Boolean).join(' · ')))
      , h('div', { class: 'derecha' }, '✏️'))))) : aviso_caja('Aún no hay proveedores.', 'info'),
    h('a', { class: 'boton-grande', href: '#/proveedores/nuevo' }, h('span', { class: 'emoji' }, '➕'), 'Agregar proveedor'));
}

export function formProveedor(d, id, ctx) {
  const ex = id && id !== 'nuevo' ? d.proveedores.find((p) => p.id === id) : null;
  const tipos = [...TIPOS_PROV];
  if (ex && ex.tipo && !tipos.includes(ex.tipo)) tipos.unshift(ex.tipo);
  const nombre = h('input', { class: 'input', type: 'text', placeholder: 'Ej: Purina', maxlength: 100, value: ex ? ex.nombre : '' });
  const tel = h('input', { class: 'input', type: 'tel', placeholder: 'Teléfono (opcional)', maxlength: 20, value: ex ? ex.telefono || '' : '' });
  const tipo = selector(tipos.map((t) => ({ valor: t, texto: t })), { valor: ex ? ex.tipo : '', vacio: 'Elige qué le compras…' });
  const notas = h('input', { class: 'input', type: 'text', placeholder: 'Notas (opcional)', maxlength: 200, value: ex ? ex.notas || '' : '' });
  const guardar = async () => {
    let ok = true;
    if (!nombre.value.trim()) { nombre.classList.add('error'); ok = false; }
    if (!tipo.value) { tipo.classList.add('error'); ok = false; }
    if (!ok) { aviso('Falta el nombre y el tipo de proveedor.'); return; }
    await guardarCompleto('Proveedores', { ...(ex || {}), id: ex ? ex.id : nuevoId('pv'), nombre: nombre.value.trim(), telefono: tel.value.trim(), tipo: tipo.value, notas: notas.value.trim() });
    toast('✓ Guardado'); ctx.ir('#/proveedores');
  };
  return h('div', {}, h('h1', {}, ex ? 'Editar proveedor' : 'Proveedor nuevo'),
    campo('Nombre', nombre), campo('¿Qué le compras?', tipo), campo('Teléfono', tel), campo('Notas', notas),
    boton('Guardar', guardar, { clase: 'verde' }));
}

// Venta (o salida) de gallinas enfermas o de recambio: recupera parte del costo de las aves.
export function formGallinas(d, ctx) {
  const lotes = d.lotes.filter((l) => l.estado !== 'descartado');
  const vivasDe = (id) => { const l = lotes.find((x) => x.id === id); return l ? avesDelLote(d, l) : 0; };
  const precioBase = num(d.cfg.precio_gallina_descarte) || 20000;
  const costoAve = num(d.cfg.costo_ave) || 27000;
  let causa = 'enfermedad'; let medio = 'Efectivo';
  const selLote = selector(lotes.map((l) => ({ valor: l.id, texto: `${l.nombre} (${vivasDe(l.id)} aves)` })), { vacio: 'Elige el lote…' });
  const cant = stepper({ min: 1, max: 3000, valor: 1 });
  const precio = dinero({ valor: precioBase });
  const comprador = h('input', { class: 'input', type: 'text', placeholder: 'Quién las compró (opcional)', maxlength: 100 });
  const total = h('div', { class: 'grande', style: 'margin:8px 0' });
  const nota = h('div', { class: 'suave' });
  const calc = () => {
    const t = cant.get() * precio.get();
    total.textContent = 'Total: ' + fmtCOP(t);
    const p = precio.get();
    nota.textContent = p ? `Recuperas el ${fmtNum((p / costoAve) * 100, 0)} % de lo que costó cada gallina (${fmtCOP(costoAve)}).` : 'Sin precio: solo se registra que salieron del galpón.';
  };
  cant.addEventListener('input', calc); precio.addEventListener('input', calc);
  const fMedio = fichas(MEDIOS, { valor: medio, onChange: (v) => { medio = v; } });
  const fCausa = fichas([{ valor: 'enfermedad', texto: '🤒 Enferma' }, { valor: 'recambio', texto: '🔁 Recambio' }], { valor: causa, onChange: (v) => { causa = v; } });
  const guardar = async () => {
    if (!selLote.value) { selLote.classList.add('error'); aviso('Elige el lote de donde salen las gallinas.'); return; }
    const n = cant.get(); const p = precio.get();
    if (n > vivasDe(selLote.value)) { aviso(`Ese lote solo tiene ${vivasDe(selLote.value)} aves vivas.`); return; }
    if (p && (p < costoAve * 0.2 || p > costoAve * 1.5) && !(await confirmar(`El precio ${fmtCOP(p)} por gallina se ve raro (compraste a ${fmtCOP(costoAve)}). ¿Es correcto?`, { si: 'Sí, es correcto' }))) return;
    const ok = await confirmar(`${n} gallina(s) ${causa === 'enfermedad' ? 'enfermas' : 'de recambio'} salen de ${lotes.find((l) => l.id === selLote.value).nombre}.\n${p ? `Vendidas a ${fmtCOP(p)} c/u = ${fmtCOP(n * p)} por ${medio}.` : 'Sin venta.'}\n\n¿Guardar?`, { si: 'Sí, guardar' });
    if (!ok) return;
    const fecha = hoyISO();
    const sal = await crear('SalidasAves', 'sa', { fecha, lote_id: selLote.value, cantidad: n, causa, notas: '' });
    if (p) await crear('VentasAves', 'va', { fecha, salida_id: sal.id, lote_id: selLote.value, cantidad: n, precio_unit: p, total: n * p, comprador: comprador.value.trim(), medio, notas: '' });
    toast('✓ Guardado'); ctx.ir('#/');
  };
  calc();
  const inv = inversionAves(d, d.cfg);
  return h('div', {}, h('h1', {}, 'Vender gallinas'),
    h('p', { class: 'suave' }, 'Cuando sacas gallinas enfermas o es momento de cambiarlas. Si las vendes, el dinero entra a tu caja y ayuda a recuperar lo que costaron.'),
    campo('Lote', selLote), campo('Motivo', fCausa), campo('¿Cuántas gallinas?', cant),
    campo('Precio por gallina', precio, 'Pon 0 si no se vendieron (por ejemplo, si se regalaron).'), nota, total,
    campo('Comprador', comprador), campo('¿Cómo te pagaron?', fMedio),
    boton('Guardar', guardar, { clase: 'verde' }),
    inv.vendidas ? tarjeta(h('div', { class: 'suave' }, `Hasta hoy: ${fmtNum(inv.vendidas, 0)} gallinas vendidas por ${fmtCOP(inv.recuperado)}.`)) : null);
}
