// Gerencia: clientes, estado de cuenta, precios por cliente y ajuste masivo.
import { h, tarjeta, campo, stepper, dinero, fichas, selector, boton, confirmar, aviso, toast, aviso_caja, insignia, enlaceWhatsApp, compartirTexto, vaciar } from '../ui.js';
import { hoyISO, fmtCOP, fmtNum, fmtFecha, fmtFechaCorta, num, activo, CATEGORIAS, estadoCuenta, cartera, movimientos, textoEstadoCuenta, listaVigente, ajustarPrecios, margenCliente, indicadores, diasEntre, addDias } from '../calc.js';
import { crear, guardarCompleto } from '../datos.js';
import { nuevoId } from '../store.js';

export function lista(d, filtroInicial = 'todos') {
  const hoy = hoyISO();
  const umbral = num(d.cfg.umbral_cliente_anterior_dias) || 30;
  const cart = cartera(d.clientes, d.ventas, d.cobros, hoy);
  let filtro = filtroInicial; let texto = '';
  const cont = h('ul', { class: 'lista' });
  const pintar = () => {
    vaciar(cont);
    const t = texto.toLowerCase();
    const filas = cart.filter((r) => {
      if (t && !r.cliente.nombre.toLowerCase().includes(t)) return false;
      const anterior = r.cliente.estado === 'inactivo' || (r.ultimaCompra && diasEntre(r.ultimaCompra, hoy) > umbral);
      if (filtro === 'deuda') return r.saldo > 0;
      if (filtro === 'anteriores') return anterior;
      if (filtro === 'activos') return !anterior;
      return true;
    });
    if (!filas.length) cont.append(h('li', {}, aviso_caja('No hay clientes para mostrar.', 'info')));
    for (const r of filas) cont.append(h('li', {}, h('a', { class: 'item', href: '#/clientes/' + r.cliente.id },
      h('div', {}, h('div', { class: 'grande' }, r.cliente.nombre), h('div', { class: 'suave' }, r.ultimaCompra ? 'Última compra ' + fmtFechaCorta(r.ultimaCompra) : 'Sin compras')),
      h('div', { class: 'derecha' }, r.saldo > 0 ? h('div', { class: 'grande', style: 'color:' + (r.vencido ? 'var(--rojo)' : 'var(--ambar)') }, fmtCOP(r.saldo)) : h('span', { class: 'estado-ok' }, 'Al día'), r.vencido ? h('div', { class: 'suave' }, 'vencido') : null))));
  };
  const buscar = h('input', { class: 'input', type: 'search', placeholder: '🔍 Buscar cliente' });
  buscar.addEventListener('input', () => { texto = buscar.value; pintar(); });
  const totalDeuda = cart.reduce((a, r) => a + r.saldo, 0);
  pintar();
  return h('div', {}, h('h1', {}, 'Clientes'),
    h('div', { class: 'busqueda' }, buscar, h('div', { style: 'height:8px' }), fichas([{ valor: 'todos', texto: 'Todos' }, { valor: 'activos', texto: 'Activos' }, { valor: 'deuda', texto: 'Con deuda' }, { valor: 'anteriores', texto: 'Anteriores' }], { valor: filtro, onChange: (v) => { filtro = v; pintar(); } })),
    h('p', { class: 'suave' }, `Por cobrar en total: ${fmtCOP(totalDeuda)}`),
    cont, h('div', { style: 'height:8px' }), h('a', { class: 'btn', href: '#/clientes/nuevo' }, '+ Cliente nuevo'));
}

export function detalle(d, id, ctx) {
  const c = d.clientes.find((x) => x.id === id);
  if (!c) return h('div', {}, aviso_caja('Cliente no encontrado.', 'rojo'));
  const hoy = hoyISO();
  const ec = estadoCuenta(c, d.ventas, d.cobros, hoy);
  const negocio = d.cfg.nombre_negocio || 'Doble Yema';
  const texto = textoEstadoCuenta(negocio, c, ec, hoy);
  const movs = movimientos(c, d.ventas, d.cobros, d.ventaItems).reverse().slice(0, 30);
  const ind = indicadores(d, addDias(hoy, -30), hoy, d.cfg);
  const mc = margenCliente(d, c.id, addDias(hoy, -90), hoy, ind.costoCubeta);
  return h('div', {},
    h('h1', {}, c.nombre),
    h('p', { class: 'suave' }, [c.telefono, c.zona, 'Paga: ' + (c.condicion_pago || 'contado'), c.estado === 'inactivo' ? 'INACTIVO' : ''].filter(Boolean).join(' · ')),
    h('div', { class: 'kpis' },
      kpi('Debe', fmtCOP(ec.saldo), ec.saldo ? (ec.vencido ? 'rojo' : '') : 'verde'),
      kpi('Vencido', fmtCOP(ec.vencido), ec.vencido ? 'rojo' : ''),
      kpi('Último pago', ec.ultimoPago ? `${fmtCOP(ec.ultimoPago.valor)} · ${fmtFechaCorta(ec.ultimoPago.fecha)}` : '–'),
      kpi('Última compra', ec.ultimaCompra ? fmtFechaCorta(ec.ultimaCompra) : '–')),
    ec.aFavor > 0 ? aviso_caja('Tiene saldo a favor: ' + fmtCOP(ec.aFavor), 'verde') : null,
    h('div', { class: 'fila-botones' }, h('a', { class: 'btn', href: '#/venta/' + c.id }, '💰 Vender'), h('a', { class: 'btn secundario', href: '#/cobro/' + c.id }, '💵 Cobrar')),
    h('div', { style: 'height:10px' }),
    c.telefono ? h('a', { class: 'btn verde', href: enlaceWhatsApp(c.telefono, texto), target: '_blank', rel: 'noopener' }, '📲 Enviar estado de cuenta') : boton('📲 Compartir estado de cuenta', () => compartirTexto(texto), { clase: 'verde' }),
    h('div', { style: 'height:10px' }),
    h('div', { class: 'fila-botones' }, h('a', { class: 'btn secundario', href: '#/precios/' + c.id }, '🏷️ Precios'), h('a', { class: 'btn secundario', href: '#/clientes/' + c.id + '/editar' }, '✏️ Editar')),
    ec.pendientes.length ? h('div', {}, h('h2', {}, 'Pedidos pendientes'), tarjeta(ec.pendientes.map((p) => h('div', { class: 'fila entre', style: 'padding:6px 0' }, h('div', {}, fmtFechaCorta(p.fecha) + (p.numero ? ' · ' + p.numero : ''), h('div', { class: 'suave' }, p.diasMora > 0 ? `vencido hace ${p.diasMora} días` : 'vence ' + fmtFechaCorta(p.vence))), h('b', {}, fmtCOP(p.pendiente)))))) : null,
    h('h2', {}, 'Antigüedad de la deuda'),
    tarjeta(h('div', { class: 'tabla-scroll' }, h('table', { class: 'tabla' }, h('thead', {}, h('tr', {}, ['0-7 d', '8-15 d', '16-30 d', '+30 d'].map((t) => h('th', {}, t)))), h('tbody', {}, h('tr', {}, [ec.edad.d0_7, ec.edad.d8_15, ec.edad.d16_30, ec.edad.d31].map((v) => h('td', {}, fmtCOP(v)))))))),
    h('h2', {}, 'Rentabilidad (últimos 90 días)'),
    tarjeta(h('div', {}, `Cubetas: ${fmtNum(mc.cubetas, 0)} · Ventas: ${fmtCOP(mc.ingreso)}`), h('div', {}, `Descuento frente a lista: ${fmtCOP(mc.descuento)}`),
      mc.margen !== null ? h('div', { style: 'font-weight:700' }, `Margen estimado: ${fmtCOP(mc.margen)} (${fmtNum(mc.margenPct, 1)} %)`) : h('div', { class: 'suave' }, 'Falta información de costos para calcular el margen.')),
    h('h2', {}, 'Historial'),
    movs.length ? h('ul', { class: 'lista' }, movs.map((m) => h('li', {}, m.tipo === 'venta'
      ? h('a', { class: 'item', href: '#/recibo/' + m.id }, h('div', {}, h('div', { class: 'grande' }, '🥚 Pedido ' + (m.numero || '')), h('div', { class: 'suave' }, fmtFechaCorta(m.fecha) + ' · ' + m.detalle)), h('div', { class: 'derecha' }, h('div', { class: 'grande' }, '+' + fmtCOP(m.valor)), h('div', { class: 'suave' }, 'saldo ' + fmtCOP(m.saldo))))
      : h('div', { class: 'item' }, h('div', {}, h('div', { class: 'grande' }, '💵 Pago ' + (m.numero || '')), h('div', { class: 'suave' }, fmtFechaCorta(m.fecha) + ' · ' + m.detalle)), h('div', { class: 'derecha' }, h('div', { class: 'grande', style: 'color:var(--verde)' }, '−' + fmtCOP(m.valor)), h('div', { class: 'suave' }, 'saldo ' + fmtCOP(m.saldo))))))) : aviso_caja('Sin movimientos todavía.', 'info'));
}

const kpi = (n, v, clase = '') => h('div', { class: 'kpi ' + clase }, h('div', { class: 'valor', style: 'font-size:1.1rem' }, v), h('div', { class: 'nombre' }, n));

export function formCliente(d, id, ctx) {
  const c = id ? d.clientes.find((x) => x.id === id) : null;
  if (id && !c) return h('div', {}, aviso_caja('Cliente no encontrado.', 'rojo'));
  const nombre = h('input', { class: 'input', type: 'text', value: c ? c.nombre : '', maxlength: 100, placeholder: 'Nombre o negocio' });
  const tel = h('input', { class: 'input', type: 'tel', value: c ? c.telefono : '', maxlength: 20, placeholder: '3001234567' });
  const dir = h('input', { class: 'input', type: 'text', value: c ? c.direccion : '', maxlength: 150 });
  const zona = h('input', { class: 'input', type: 'text', value: c ? c.zona : '', maxlength: 60, placeholder: 'Barrio o zona' });
  const cond = fichas([{ valor: 'contado', texto: 'De contado' }, { valor: 'semanal', texto: 'Cierre de semana' }, { valor: 'mensual', texto: 'Cierre de mes' }], { valor: (c && c.condicion_pago) || 'contado' });
  const limite = dinero({ valor: c ? num(c.limite_credito) : 0 });
  const estado = fichas([{ valor: 'activo', texto: 'Activo' }, { valor: 'inactivo', texto: 'Inactivo' }], { valor: (c && c.estado) || 'activo' });
  const notas = h('input', { class: 'input', type: 'text', value: c ? c.notas : '', maxlength: 200 });
  return h('div', {}, h('h1', {}, c ? 'Editar cliente' : 'Cliente nuevo'),
    campo('Nombre', nombre), campo('Teléfono (WhatsApp)', tel), campo('Dirección', dir), campo('Zona', zona), campo('¿Cuándo paga?', cond),
    campo('Límite de deuda (opcional)', limite, 'Te avisamos si una venta lo supera. Vacío = sin límite.'), c ? campo('Estado', estado) : null, campo('Notas', notas),
    boton('Guardar', async () => {
      if (!nombre.value.trim()) { nombre.classList.add('error'); aviso('Falta el nombre.'); return; }
      const rec = { ...(c || {}), id: c ? c.id : nuevoId('cl'), nombre: nombre.value.trim(), telefono: tel.value.trim(), direccion: dir.value.trim(), zona: zona.value.trim(), condicion_pago: cond.get(), limite_credito: limite.get(), estado: estado.get(), notas: notas.value.trim(), ts: Date.now() };
      await guardarCompleto('Clientes', rec);
      toast('✓ Guardado'); ctx.ir('#/clientes/' + rec.id);
    }, { clase: 'verde' }));
}

export function precios(d, clienteId, ctx) {
  const general = clienteId === 'general';
  const cid = general ? '' : clienteId;
  const c = general ? null : d.clientes.find((x) => x.id === clienteId);
  if (!general && !c) return h('div', {}, aviso_caja('Cliente no encontrado.', 'rojo'));
  const hoy = hoyISO();
  const vigente = listaVigente(d.precios, cid, hoy);
  const cat = fichas(CATEGORIAS, { valor: 'A' });
  const desde = stepper({ min: 1, max: 2000, valor: 1 });
  const precio = dinero({});
  const generalVig = listaVigente(d.precios, '', hoy);
  return h('div', {}, h('h1', {}, general ? 'Lista general de precios' : 'Precios de ' + c.nombre),
    general ? h('p', { class: 'suave' }, 'Se usa con todos los clientes que no tengan un precio propio.') : h('p', { class: 'suave' }, 'Si una categoría no tiene precio propio, se usa la lista general.'),
    tarjeta(h('h3', {}, 'Precios vigentes (por cubeta)'),
      vigente.length ? h('table', { class: 'tabla' }, h('thead', {}, h('tr', {}, ['Categ.', 'Desde', 'Precio', 'Vigente'].map((t) => h('th', {}, t)))),
        h('tbody', {}, vigente.sort((a, b) => CATEGORIAS.indexOf(a.categoria) - CATEGORIAS.indexOf(b.categoria) || num(a.desde_cantidad) - num(b.desde_cantidad)).map((p) => h('tr', {}, h('td', {}, p.categoria), h('td', {}, num(p.desde_cantidad) > 1 ? num(p.desde_cantidad) + ' cub.' : 'Base'), h('td', {}, fmtCOP(p.precio)), h('td', {}, fmtFechaCorta(p.vigente_desde)))))) : h('div', { class: 'suave' }, general ? 'Aún no hay precios.' : 'Sin precios propios.'),
      !general && generalVig.length ? h('div', { class: 'suave', style: 'margin-top:8px' }, 'Lista general: ' + generalVig.filter((p) => num(p.desde_cantidad) <= 1).map((p) => `${p.categoria} ${fmtCOP(p.precio)}`).join(' · ')) : null),
    tarjeta(h('h3', {}, 'Cambiar o agregar un precio'), campo('Categoría', cat), campo('A partir de cuántas cubetas', desde, '1 = precio normal. Para descuento por volumen, agrega otro con más cubetas (ej. 10).'), campo('Nuevo precio por cubeta', precio),
      boton('Guardar precio', async () => {
        if (!precio.get()) { aviso('Escribe el precio.'); return; }
        const ok = await confirmar(`${cat.get()} desde ${desde.get()} cubeta(s): ${fmtCOP(precio.get())}\nRige desde hoy; el historial se conserva.`);
        if (!ok) return;
        await crear('Precios', 'pc', { cliente_id: cid, categoria: cat.get(), desde_cantidad: desde.get() <= 1 ? 0 : desde.get(), precio: precio.get(), vigente_desde: hoy });
        toast('✓ Precio guardado'); ctx.refrescar();
      }, { clase: 'verde' })),
    general ? h('a', { class: 'btn secundario', href: '#/precios-ajuste' }, '📈 Subir o bajar todos los precios (%)') : null);
}

export function ajusteMasivo(d, ctx) {
  const hoy = hoyISO();
  const pct = h('input', { class: 'input grande', type: 'text', inputmode: 'decimal', placeholder: 'Ej. 5 para subir 5 %, -3 para bajar 3 %' });
  const cats = new Set(CATEGORIAS);
  const fCats = h('div', { class: 'fichas' });
  const pintarCats = () => { vaciar(fCats); for (const c of CATEGORIAS) fCats.append(h('button', { type: 'button', class: 'ficha' + (cats.has(c) ? ' activa' : ''), onclick: () => { cats.has(c) ? cats.delete(c) : cats.add(c); pintarCats(); } }, c)); };
  pintarCats();
  const alcance = fichas([{ valor: 'todos', texto: 'General + todos los clientes' }, { valor: 'general', texto: 'Solo lista general' }], { valor: 'todos' });
  return h('div', {}, h('h1', {}, 'Ajuste de precios'), h('p', { class: 'suave' }, 'Aplica un porcentaje a los precios vigentes. Se redondea a $50 y se guarda el historial.'),
    campo('Porcentaje', pct), campo('Categorías', fCats), campo('¿A quién?', alcance),
    boton('Ver cambios', async () => {
      const p = parseFloat(String(pct.value).replace(',', '.'));
      if (!Number.isFinite(p) || p === 0 || Math.abs(p) > 50) { aviso('Escribe un porcentaje válido (entre -50 y 50).'); return; }
      if (!cats.size) { aviso('Elige al menos una categoría.'); return; }
      const ids = alcance.get() === 'general' ? [''] : ['', ...d.clientes.filter((c) => c.estado !== 'inactivo').map((c) => c.id)];
      const nuevos = ajustarPrecios(d.precios, ids, [...cats], p, hoy);
      if (!nuevos.length) { aviso('No hay precios que cambiar.'); return; }
      const ok = await confirmar(`Se cambiarán ${nuevos.length} precios (${p > 0 ? '+' : ''}${p} %).\nEjemplo: ${nuevos[0].categoria} pasa a ${fmtCOP(nuevos[0].precio)}.\n\n¿Aplicar?`, { si: 'Sí, aplicar' });
      if (!ok) return;
      for (const n of nuevos) await crear('Precios', 'pc', n);
      toast(`✓ ${nuevos.length} precios actualizados`); ctx.ir('#/precios/general');
    }, { clase: 'verde' }));
}
