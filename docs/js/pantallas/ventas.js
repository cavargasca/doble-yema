// Gerencia: ventas, cobros, recibo, reposiciones.
import { h, tarjeta, campo, stepper, dinero, fichas, selector, boton, confirmar, aviso, toast, aviso_caja, pedirTexto, enlaceWhatsApp, compartirTexto, vaciar } from '../ui.js';
import { hoyISO, fmtCOP, fmtNum, fmtFecha, fmtFechaCorta, num, activo, CATEGORIAS, precioPara, estadoCuenta, textoRecibo, inventarioCubetas, indicadores, addDias, retirosActivos } from '../calc.js';
import { crear, anular, nombreCliente } from '../datos.js';
import { siguienteNumero } from '../store.js';

const MEDIOS = ['Efectivo', 'Nequi', 'Daviplata', 'Banco'];
export const clientesActivos = (d) => d.clientes.filter((c) => c.estado !== 'inactivo').sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
const opcionesClientes = (d) => clientesActivos(d).map((c) => ({ valor: c.id, texto: c.nombre }));

function campoFecha(inicial = hoyISO()) {
  const i = h('input', { class: 'input', type: 'date', value: inicial, max: hoyISO() });
  i.get = () => i.value || hoyISO();
  return i;
}

export function formVenta(d, clienteIdInicial, ctx) {
  if (!d.clientes.length) return h('div', {}, h('h1', {}, 'Nueva venta'), aviso_caja('Primero crea al menos un cliente.', 'amarillo'), h('a', { class: 'btn', href: '#/clientes/nuevo' }, 'Crear cliente'));
  const fecha = campoFecha();
  const selCli = selector(opcionesClientes(d), { valor: clienteIdInicial || '' , vacio: 'Elige el cliente…' });
  if (clienteIdInicial) selCli.value = clienteIdInicial;
  const info = h('div', {});
  const filas = {};
  const totalEl = h('div', { class: 'recibo total', style: 'font-size:1.6rem' }, '$0');
  const pago = dinero({});
  let medio = 'Efectivo';
  const medios = fichas(MEDIOS, { valor: medio, onChange: (v) => { medio = v; } });
  const notas = h('input', { class: 'input', type: 'text', placeholder: 'Opcional', maxlength: 200 });
  const costoCubeta = indicadores(d, addDias(hoyISO(), -30), hoyISO(), d.cfg).costoCubeta;
  const margenMin = num(d.cfg.margen_minimo_pct);

  const cliente = () => d.clientes.find((c) => c.id === selCli.value);
  const total = () => CATEGORIAS.reduce((a, c) => a + filas[c].cant.get() * filas[c].precio.get(), 0);

  const pintarTotal = () => {
    const t = total();
    totalEl.textContent = 'Total ' + fmtCOP(t);
    const cl = cliente();
    vaciar(info);
    if (!cl) return;
    const ec = estadoCuenta(cl, d.ventas, d.cobros, hoyISO());
    info.append(h('div', { class: 'suave' }, `Condición: ${cl.condicion_pago || 'contado'} · Debe ahora: ${fmtCOP(ec.saldo)}${ec.vencido ? ' (vencido ' + fmtCOP(ec.vencido) + ')' : ''}`));
    if (num(cl.limite_credito) > 0 && ec.saldo + t > num(cl.limite_credito)) info.append(aviso_caja(`Con esta venta la deuda sería ${fmtCOP(ec.saldo + t)}, por encima de su límite (${fmtCOP(cl.limite_credito)}).`, 'amarillo'));
    if (ec.vencido > 0) info.append(aviso_caja(`Este cliente tiene ${fmtCOP(ec.vencido)} vencido.`, 'rojo'));
  };

  const recalcular = (cat, forzar) => {
    const f = filas[cat];
    const q = f.cant.get();
    const cl = selCli.value;
    const p = precioPara(d.precios, cl, cat, q || 1, fecha.get());
    f.lista = p ? p.precio : 0;
    f.nota.textContent = !q ? '' : p ? (p.general ? 'Precio de la lista general' : 'Precio de este cliente') + (p.desde ? ` (desde ${p.desde} cubetas)` : '') : 'Sin precio definido: escríbelo.';
    if (forzar || !f.editado) f.precio.set(p ? p.precio : f.precio.get());
    f.caja.style.display = q ? '' : 'none';
    pintarTotal();
  };

  for (const c of CATEGORIAS) {
    const f = { editado: false, lista: 0 };
    f.cant = stepper({ min: 0, max: 2000, onChange: () => { if (!f.cant.get()) f.editado = false; recalcular(c); } });
    f.precio = dinero({ onChange: () => { f.editado = true; pintarTotal(); } });
    f.nota = h('div', { class: 'ayuda' });
    f.caja = h('div', { class: 'precio-linea', style: 'display:none; flex-direction:column; align-items:stretch' }, h('div', { class: 'etiqueta' }, 'Precio por cubeta'), f.precio, f.nota);
    filas[c] = f;
  }
  selCli.addEventListener('change', () => { CATEGORIAS.forEach((c) => { filas[c].editado = false; recalcular(c, true); }); const cl = cliente(); if (cl && cl.condicion_pago === 'contado') { /* se sugiere pago completo al guardar */ } });
  fecha.addEventListener('change', () => CATEGORIAS.forEach((c) => recalcular(c, true)));

  const guardar = async () => {
    const cl = cliente();
    if (!cl) { selCli.classList.add('error'); aviso('Elige el cliente.'); return; }
    const items = CATEGORIAS.filter((c) => filas[c].cant.get() > 0).map((c) => ({ cat: c, cub: filas[c].cant.get(), pu: filas[c].precio.get(), pl: filas[c].lista }));
    if (!items.length) { aviso('Agrega al menos una cubeta.'); return; }
    if (items.some((i) => !i.pu)) { aviso('Falta el precio de alguna categoría.'); return; }
    const t = total();
    const avisos = [];
    const inv = inventarioCubetas(d.empaque, d.ventas, d.ventaItems, d.reposiciones);
    for (const i of items) if (inv[i.cat].cubetas < i.cub - 0.001) avisos.push(`De ${i.cat} solo hay ${fmtNum(Math.max(inv[i.cat].cubetas, 0), 1)} cubetas empacadas según los registros.`);
    if (costoCubeta && margenMin >= 0) for (const i of items) if (i.pu < costoCubeta * (1 + margenMin / 100)) avisos.push(`${i.cat} a ${fmtCOP(i.pu)} queda por debajo del margen mínimo (costo aprox. ${fmtCOP(costoCubeta)} por cubeta).`);
    for (const i of items) if (i.pl && i.pu < i.pl * 0.9) avisos.push(`${i.cat}: ${fmtCOP(i.pu)} es más de 10 % por debajo de su precio habitual (${fmtCOP(i.pl)}).`);
    if (retirosActivos(d.sanidad, d.lotes, fecha.get()).length) avisos.push('Hay huevos en periodo de retiro por medicamento.');
    const pagado = Math.min(pago.get(), Infinity);
    if (pagado > t) avisos.push(`El pago (${fmtCOP(pagado)}) es mayor que la venta; la diferencia queda a favor del cliente.`);
    const lineas = items.map((i) => `${i.cub} ${i.cat} × ${fmtCOP(i.pu)}`).join('\n');
    const ok = await confirmar((avisos.length ? '⚠️ ' + avisos.join('\n⚠️ ') + '\n\n' : '') + `${cl.nombre}\n${lineas}\nTotal ${fmtCOP(t)}\n${pagado ? 'Pagó ' + fmtCOP(pagado) + ' (' + medio + ')' : 'No pagó todavía'}\n\n¿Guardar la venta?`, { si: 'Sí, guardar' });
    if (!ok) return;
    const numero = await siguienteNumero('R');
    const venta = await crear('Ventas', 've', { numero, fecha: fecha.get(), cliente_id: cl.id, total: t, notas: notas.value.trim() });
    for (const i of items) await crear('VentaItems', 'vi', { venta_id: venta.id, categoria: i.cat, cubetas: i.cub, precio_unit: i.pu, precio_lista: i.pl || i.pu, subtotal: i.cub * i.pu });
    if (pagado > 0) await crear('Cobros', 'co', { numero: await siguienteNumero('C'), fecha: fecha.get(), cliente_id: cl.id, valor: pagado, medio, notas: 'Pago al momento de la venta' });
    toast('✓ Venta guardada');
    ctx.ir('#/recibo/' + venta.id);
  };

  pintarTotal();
  return h('div', {},
    h('h1', {}, 'Nueva venta'),
    campo('Cliente', selCli), info,
    campo('Fecha', fecha),
    tarjeta(h('h3', {}, 'Cubetas vendidas'), CATEGORIAS.map((c) => h('div', { class: 'linea-categoria' }, h('div', { class: 'cat-nombre' }, c), h('div', {}, filas[c].cant, filas[c].caja)))),
    totalEl,
    tarjeta(h('h3', {}, '¿Pagó ahora?'), campo('Valor recibido (déjalo vacío si queda debiendo)', pago),
      boton('Pagó todo', () => pago.set(total()), { clase: 'secundario chico' }), h('div', { style: 'height:10px' }), campo('Medio de pago', medios)),
    campo('Notas', notas),
    boton('Guardar venta', guardar, { clase: 'verde' }));
}

export function recibo(d, ventaId, ctx) {
  const v = d.ventas.find((x) => x.id === ventaId);
  if (!v) return h('div', {}, aviso_caja('Venta no encontrada. Si acabas de crearla, espera un momento.', 'amarillo'));
  const cl = d.clientes.find((c) => c.id === v.cliente_id) || { nombre: '(cliente)' };
  const items = d.ventaItems.filter((i) => i.venta_id === v.id);
  const ec = estadoCuenta(cl, d.ventas, d.cobros, hoyISO());
  const ped = ec.pedidos.find((p) => p.id === v.id);
  const pagado = ped ? ped.pagado : 0;
  const negocio = d.cfg.nombre_negocio || 'Doble Yema';
  const texto = textoRecibo(negocio, cl, v, items, pagado);
  const anulada = !activo(v);
  return h('div', {},
    h('div', { class: 'recibo' },
      h('div', { class: 'cab' }, h('div', { class: 'nombre' }, '🥚 ' + negocio), h('div', { class: 'suave' }, 'Comprobante de entrega ' + (v.numero || ''))),
      anulada ? aviso_caja('ANULADA: ' + (v.motivo || ''), 'rojo') : null,
      h('div', {}, h('b', {}, 'Cliente: '), cl.nombre), h('div', {}, h('b', {}, 'Fecha: '), fmtFecha(v.fecha)),
      h('table', { class: 'tabla', style: 'margin-top:10px' }, h('thead', {}, h('tr', {}, ['Producto', 'Cant.', 'Precio', 'Subtotal'].map((t) => h('th', {}, t)))),
        h('tbody', {}, items.map((i) => h('tr', {}, h('td', {}, 'Huevo ' + i.categoria), h('td', {}, fmtNum(i.cubetas, 0)), h('td', {}, fmtCOP(i.precio_unit)), h('td', {}, fmtCOP(i.subtotal)))))),
      h('div', { class: 'total' }, 'Total ' + fmtCOP(v.total)),
      pagado > 0 ? h('div', { style: 'text-align:right' }, 'Pagado ' + fmtCOP(pagado)) : null,
      v.total - pagado > 0 ? h('div', { style: 'text-align:right; font-weight:700' }, 'Pendiente ' + fmtCOP(v.total - pagado)) : null,
      h('div', { class: 'pie' }, 'Documento de control interno. No es factura de venta. Cantidades en cubetas de 30 huevos.')),
    h('div', { class: 'no-imprimir' },
      h('div', { style: 'height:12px' }),
      cl.telefono ? h('a', { class: 'btn verde', href: enlaceWhatsApp(cl.telefono, texto), target: '_blank', rel: 'noopener' }, '📲 Enviar por WhatsApp') : boton('📲 Compartir', () => compartirTexto(texto), { clase: 'verde' }),
      h('div', { style: 'height:10px' }),
      h('div', { class: 'fila-botones' }, boton('🖨️ Imprimir', () => window.print(), { clase: 'secundario' }), boton('Nueva venta', () => ctx.ir('#/venta'), { clase: 'secundario' })),
      !anulada ? h('div', { style: 'height:10px' }) : null,
      !anulada ? boton('Anular esta venta', async () => {
        const m = await pedirTexto('¿Por qué se anula? (queda registrado)', { placeholder: 'Ej. error en cantidad' });
        if (!m) return;
        await anular('Ventas', v.id, m); toast('Venta anulada'); ctx.refrescar();
      }, { clase: 'peligro chico' }) : null));
}

export function formCobro(d, clienteIdInicial, ctx) {
  const fecha = campoFecha();
  const selCli = selector(opcionesClientes(d), { vacio: 'Elige el cliente…' });
  if (clienteIdInicial) selCli.value = clienteIdInicial;
  const info = h('div', {});
  const valor = dinero({});
  let medio = 'Efectivo';
  const medios = fichas(MEDIOS, { valor: medio, onChange: (v) => { medio = v; } });
  const notas = h('input', { class: 'input', type: 'text', placeholder: 'Opcional', maxlength: 200 });
  const ec = () => { const c = d.clientes.find((x) => x.id === selCli.value); return c ? estadoCuenta(c, d.ventas, d.cobros, hoyISO()) : null; };
  const pintar = () => {
    vaciar(info);
    const e = ec();
    if (!e) return;
    info.append(tarjeta(h('div', { class: 'kpis' }, h('div', { class: 'kpi ' + (e.saldo ? 'rojo' : 'verde') }, h('div', { class: 'valor' }, fmtCOP(e.saldo)), h('div', { class: 'nombre' }, 'Debe')),
      h('div', { class: 'kpi' }, h('div', { class: 'valor' }, e.ultimoPago ? fmtFechaCorta(e.ultimoPago.fecha) : '–'), h('div', { class: 'nombre' }, 'Último pago'))),
      e.saldo > 0 ? boton('Paga todo (' + fmtCOP(e.saldo) + ')', () => valor.set(e.saldo), { clase: 'secundario chico' }) : null));
  };
  selCli.addEventListener('change', pintar); pintar();
  const guardar = async () => {
    const e = ec(); const cl = d.clientes.find((x) => x.id === selCli.value);
    if (!cl) { aviso('Elige el cliente.'); return; }
    const v = valor.get();
    if (!v) { aviso('Escribe cuánto pagó.'); return; }
    const avisos = [];
    if (v > e.saldo) avisos.push(`Está pagando más de lo que debe (${fmtCOP(e.saldo)}). La diferencia queda a favor del cliente.`);
    const ok = await confirmar((avisos.length ? '⚠️ ' + avisos.join('\n⚠️ ') + '\n\n' : '') + `${cl.nombre} pagó ${fmtCOP(v)} por ${medio}.\nQuedará debiendo ${fmtCOP(Math.max(e.saldo - v, 0))}.\n\n¿Guardar el pago?`, { si: 'Sí, guardar' });
    if (!ok) return;
    await crear('Cobros', 'co', { numero: await siguienteNumero('C'), fecha: fecha.get(), cliente_id: cl.id, valor: v, medio, notas: notas.value.trim() });
    toast('✓ Pago guardado');
    ctx.ir('#/clientes/' + cl.id);
  };
  return h('div', {}, h('h1', {}, 'Registrar pago'), campo('Cliente', selCli), info, campo('Fecha', fecha), campo('Valor recibido', valor), campo('Medio', medios), campo('Notas', notas), boton('Guardar pago', guardar, { clase: 'verde' }));
}

export function formReposicion(d, ctx) {
  const selCli = selector(opcionesClientes(d), { vacio: 'Elige el cliente…' });
  const cat = fichas(CATEGORIAS, { valor: 'A' });
  const cant = stepper({ min: 1, max: 3000, valor: 1 });
  const guardar = async () => {
    if (!selCli.value) { selCli.classList.add('error'); aviso('Elige el cliente.'); return; }
    const ok = await confirmar(`Le repusiste a ${nombreCliente(d, selCli.value)}:\n${cant.get()} huevos ${cat.get()}\n\nSale de tu inventario y cuenta como pérdida.\n\n¿Guardar?`, { si: 'Sí, guardar' });
    if (!ok) return;
    // tipo 'entrega' = huevos buenos que salen para reponer los rotos. Los rotos que devuelve el cliente se botan y no se registran.
    await crear('Reposiciones', 're', { cliente_id: selCli.value, categoria: cat.get(), huevos: cant.get(), tipo: 'entrega' });
    toast('✓ Guardado'); ctx.ir('#/');
  };
  return h('div', {}, h('h1', {}, 'Reponer huevos rotos'),
    h('p', { class: 'suave' }, 'Cuando un cliente reporta huevos rotos y le repones la misma cantidad. Sale de tu inventario y cuenta como pérdida. Los rotos que te devuelve se botan: no hay que registrarlos.'),
    campo('Cliente', selCli), campo('Categoría de los huevos repuestos', cat), campo('¿Cuántos huevos le repusiste?', cant), boton('Guardar', guardar, { clase: 'verde' }));
}

export function listaVentas(d, ctx) {
  const ult = d.ventas.filter(activo).sort((a, b) => b.fecha.localeCompare(a.fecha) || num(b.ts) - num(a.ts)).slice(0, 40);
  return h('div', {}, h('h1', {}, 'Ventas recientes'),
    ult.length ? h('ul', { class: 'lista' }, ult.map((v) => h('li', {}, h('a', { class: 'item', href: '#/recibo/' + v.id },
      h('div', {}, h('div', { class: 'grande' }, nombreCliente(d, v.cliente_id)), h('div', { class: 'suave' }, `${fmtFechaCorta(v.fecha)} · ${v.numero || ''}${v._pendiente ? ' · sin enviar' : ''}`)),
      h('div', { class: 'derecha grande' }, fmtCOP(v.total)))))) : aviso_caja('Aún no hay ventas.', 'info'));
}
