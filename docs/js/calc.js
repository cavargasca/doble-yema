// Lógica de negocio de Doble Yema. Funciones puras: no tocan el DOM ni la red,
// para poder probarlas con `npm test` y reutilizarlas en la app.

export const CATEGORIAS = ['B', 'A', 'AA', 'AAA', 'JUMBO'];
export const COL_CAT = { B: 'b', A: 'a', AA: 'aa', AAA: 'aaa', JUMBO: 'jumbo' };
export const HUEVOS_POR_CUBETA = 30;
export const CAT_ALIMENTO = 'Alimento';
export const CAT_CUBETAS = 'Cubetas (empaque)';
export const CAT_INVERSION = 'Aves (inversión)';

// ---------- utilidades básicas ----------
export const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
export const activo = (r) => !(r && (r.anulado === true || r.anulado === 'TRUE' || r.anulado === 'true' || r.anulado === 1));
const sum = (arr, f) => arr.reduce((a, x) => a + num(typeof f === 'function' ? f(x) : x[f]), 0);
const byFechaId = (a, b) => String(a.fecha).localeCompare(String(b.fecha)) || (num(a.ts) - num(b.ts)) || String(a.id).localeCompare(String(b.id));

export function hoyISO(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(now);
}
export function addDias(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function diasEntre(a, b) {
  return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
}
export function inicioSemana(iso) {
  const dow = new Date(iso + 'T12:00:00Z').getUTCDay(); // 0 = domingo
  return addDias(iso, -(dow === 0 ? 6 : dow - 1)); // semana lunes-domingo
}
export function inicioMes(iso) {
  return iso.slice(0, 8) + '01';
}
export const fmtCOP = (n) => '$' + Math.round(num(n)).toLocaleString('es-CO');
export const fmtNum = (n, d = 1) => num(n).toLocaleString('es-CO', { maximumFractionDigits: d });
export const fmtPct = (n, d = 1) => (n === null || n === undefined || !Number.isFinite(n) ? '–' : fmtNum(n, d) + ' %');
export function fmtFecha(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
export function fmtFechaCorta(iso) {
  if (!iso) return '';
  const [, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}`;
}

// ---------- huevos y cubetas ----------
export const huevos = (cubetas, sueltos = 0) => num(cubetas) * HUEVOS_POR_CUBETA + num(sueltos);
// Huevos buenos de un registro de producción. El galpón anota un solo total ("huevos");
// los registros antiguos traían cubetas y sueltos, y también se siguen contando.
export const huevosProd = (p) => num(p.huevos) + huevos(p.cubetas, p.sueltos);

// ---------- precios por cliente ----------
// Un registro de Precios: { cliente_id ('' = lista general), categoria, desde_cantidad (0 = precio base),
// precio, vigente_desde }. Para cambiar un precio se agrega un registro nuevo; el historial queda.
export function listaVigente(precios, clienteId, fecha) {
  const mapa = new Map();
  for (const p of precios) {
    if (!activo(p) || p.cliente_id !== clienteId || (p.vigente_desde || '0000') > fecha) continue;
    const k = `${p.categoria}|${num(p.desde_cantidad)}`;
    const prev = mapa.get(k);
    if (!prev || String(p.vigente_desde || '').localeCompare(String(prev.vigente_desde || '')) > 0 ||
        (p.vigente_desde === prev.vigente_desde && (num(p.ts) > num(prev.ts) || (num(p.ts) === num(prev.ts) && String(p.id) > String(prev.id))))) mapa.set(k, p);
  }
  return [...mapa.values()];
}

export function precioPara(precios, clienteId, categoria, cubetas, fecha) {
  const q = Math.max(num(cubetas), 0);
  const elegir = (cid) => {
    const tramos = listaVigente(precios, cid, fecha)
      .filter((p) => p.categoria === categoria && num(p.desde_cantidad) <= q)
      .sort((a, b) => num(b.desde_cantidad) - num(a.desde_cantidad));
    return tramos[0] || null;
  };
  const p = elegir(clienteId) || elegir('');
  return p ? { precio: num(p.precio), desde: num(p.desde_cantidad), general: p.cliente_id === '' } : null;
}

// Para ajustes masivos: devuelve los registros nuevos de precio con el porcentaje aplicado.
export function ajustarPrecios(precios, clientesIds, categorias, pct, fecha, redondeo = 50) {
  const nuevos = [];
  for (const cid of clientesIds) {
    for (const p of listaVigente(precios, cid, fecha)) {
      if (!categorias.includes(p.categoria)) continue;
      const nuevo = Math.round((num(p.precio) * (1 + pct / 100)) / redondeo) * redondeo;
      if (nuevo !== num(p.precio)) nuevos.push({ cliente_id: cid, categoria: p.categoria, desde_cantidad: num(p.desde_cantidad), precio: nuevo, vigente_desde: fecha });
    }
  }
  return nuevos;
}

// ---------- cartera ----------
export function vencimiento(fecha, condicion) {
  if (condicion === 'semanal') {
    const dow = new Date(fecha + 'T12:00:00Z').getUTCDay();
    return addDias(fecha, dow === 0 ? 0 : 7 - dow); // domingo de esa semana
  }
  if (condicion === 'mensual') {
    const [y, m] = fecha.split('-').map(Number);
    const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`;
  }
  return fecha; // contado
}

// Los abonos se aplican a la deuda más antigua (primero en entrar, primero en pagarse).
export function estadoCuenta(cliente, ventas, cobros, hoy) {
  const vs = ventas.filter((v) => v.cliente_id === cliente.id && activo(v)).sort(byFechaId);
  const cs = cobros.filter((c) => c.cliente_id === cliente.id && activo(c)).sort(byFechaId);
  const facturado = sum(vs, 'total');
  const cobrado = sum(cs, 'valor');
  let credito = cobrado;
  const pedidos = vs.map((v) => {
    const total = num(v.total);
    const pagado = Math.min(credito, total);
    credito -= pagado;
    const pendiente = total - pagado;
    const venc = vencimiento(v.fecha, cliente.condicion_pago || 'contado');
    return {
      id: v.id, numero: v.numero, fecha: v.fecha, total, pagado, pendiente,
      vence: venc, diasEdad: diasEntre(v.fecha, hoy), diasMora: pendiente > 0 ? Math.max(diasEntre(venc, hoy), 0) : 0,
    };
  });
  const pendientes = pedidos.filter((p) => p.pendiente > 0);
  const ultimo = cs.length ? cs[cs.length - 1] : null;
  const edad = { d0_7: 0, d8_15: 0, d16_30: 0, d31: 0 };
  for (const p of pendientes) {
    if (p.diasEdad <= 7) edad.d0_7 += p.pendiente;
    else if (p.diasEdad <= 15) edad.d8_15 += p.pendiente;
    else if (p.diasEdad <= 30) edad.d16_30 += p.pendiente;
    else edad.d31 += p.pendiente;
  }
  const vencido = sum(pendientes.filter((p) => p.diasMora > 0), 'pendiente');
  return {
    facturado, cobrado, saldo: Math.max(facturado - cobrado, 0), aFavor: Math.max(cobrado - facturado, 0),
    pedidos, pendientes, vencido, edad,
    ultimoPago: ultimo ? { fecha: ultimo.fecha, valor: num(ultimo.valor), medio: ultimo.medio } : null,
    ultimaCompra: vs.length ? vs[vs.length - 1].fecha : null,
  };
}

export function cartera(clientes, ventas, cobros, hoy) {
  return clientes.map((c) => ({ cliente: c, ...estadoCuenta(c, ventas, cobros, hoy) }))
    .sort((a, b) => b.vencido - a.vencido || b.saldo - a.saldo);
}

export function movimientos(cliente, ventas, cobros, ventaItems = []) {
  const lista = [];
  for (const v of ventas.filter((x) => x.cliente_id === cliente.id && activo(x))) {
    const items = ventaItems.filter((i) => i.venta_id === v.id);
    lista.push({ tipo: 'venta', fecha: v.fecha, ts: num(v.ts), id: v.id, numero: v.numero, valor: num(v.total), detalle: items.map((i) => `${num(i.cubetas)} ${i.categoria}`).join(', ') });
  }
  for (const c of cobros.filter((x) => x.cliente_id === cliente.id && activo(x))) {
    lista.push({ tipo: 'cobro', fecha: c.fecha, ts: num(c.ts), id: c.id, numero: c.numero, valor: num(c.valor), detalle: c.medio || '' });
  }
  lista.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.ts - b.ts);
  let saldo = 0;
  for (const m of lista) {
    saldo += m.tipo === 'venta' ? m.valor : -m.valor;
    m.saldo = saldo;
  }
  return lista;
}

export function textoEstadoCuenta(negocio, cliente, ec, hoy) {
  const l = [`*${negocio}* · Estado de cuenta`, `Cliente: ${cliente.nombre}`, `Fecha: ${fmtFecha(hoy)}`, ''];
  if (ec.pendientes.length) {
    l.push('Pedidos pendientes:');
    for (const p of ec.pendientes) {
      l.push(`• ${fmtFechaCorta(p.fecha)}${p.numero ? ' · ' + p.numero : ''} · total ${fmtCOP(p.total)} · pendiente ${fmtCOP(p.pendiente)}`);
    }
  } else l.push('No tienes pedidos pendientes.');
  if (ec.ultimoPago) l.push('', `Último pago: ${fmtFecha(ec.ultimoPago.fecha)} · ${fmtCOP(ec.ultimoPago.valor)}${ec.ultimoPago.medio ? ' (' + ec.ultimoPago.medio + ')' : ''}`);
  l.push('', ec.aFavor > 0 ? `*Saldo a tu favor: ${fmtCOP(ec.aFavor)}*` : `*Saldo pendiente: ${fmtCOP(ec.saldo)}*`);
  return l.join('\n');
}

export function textoRecibo(negocio, cliente, venta, items, pagado) {
  const l = [`*${negocio}* · Comprobante de entrega ${venta.numero || ''}`.trim(), `Cliente: ${cliente.nombre}`, `Fecha: ${fmtFecha(venta.fecha)}`, ''];
  for (const i of items) l.push(`• ${num(i.cubetas)} cubeta(s) ${i.categoria} × ${fmtCOP(i.precio_unit)} = ${fmtCOP(i.subtotal)}`);
  l.push('', `*Total: ${fmtCOP(venta.total)}*`);
  if (pagado > 0) l.push(`Pagado: ${fmtCOP(pagado)}`);
  if (num(venta.total) - pagado > 0) l.push(`Pendiente: ${fmtCOP(num(venta.total) - pagado)}`);
  l.push('', '_Este comprobante no es factura de venta._');
  return l.join('\n');
}

// ---------- producción y bodega ----------
export function avesVivas(lote, bajasHasta) {
  return Math.max(num(lote.aves_iniciales) - bajasHasta, 0);
}

function bajasHasta(produccion, loteId, fecha) {
  return sum(produccion.filter((p) => activo(p) && p.lote_id === loteId && p.fecha <= fecha), 'bajas');
}

// Aves que han salido de un lote hasta una fecha: muertas (bajas) + retiradas por enfermedad o recambio.
export function avesSalidas(d, loteId, hasta = '9999-12-31') {
  const salidas = sum((d.salidasAves || []).filter((s) => activo(s) && s.lote_id === loteId && s.fecha <= hasta), 'cantidad');
  return bajasHasta(d.produccion, loteId, hasta) + salidas;
}

// Inversión en aves y cuánto se ha recuperado vendiendo gallinas de descarte.
export function inversionAves(d, cfg = {}) {
  const costo = num(cfg.costo_ave) || 27000;
  const lotes = d.lotes.filter((l) => l.estado !== 'descartado');
  const avesComp = sum(lotes, 'aves_iniciales');
  const ventas = (d.ventasAves || []).filter(activo);
  const recuperado = sum(ventas, 'total');
  const invertido = avesComp * costo;
  return {
    avesComp, costoAve: costo, invertido, recuperado, vendidas: sum(ventas, 'cantidad'),
    recuperadoPct: invertido > 0 ? (recuperado / invertido) * 100 : null,
    avesActuales: sum(lotes, (l) => Math.max(num(l.aves_iniciales) - avesSalidas(d, l.id), 0)),
  };
}

// Cruce diario: lo que entra a bodega contra lo que sale clasificado, roto o descartado.
export function cruceBodega(produccion, empaque, hasta) {
  const prod = produccion.filter((p) => activo(p) && p.fecha <= hasta);
  const emp = empaque.filter((e) => activo(e) && e.fecha <= hasta);
  const recibidos = sum(prod, (p) => huevosProd(p));
  const empacados = sum(emp, (e) => CATEGORIAS.reduce((a, c) => a + num(e[COL_CAT[c]]), 0)) * HUEVOS_POR_CUBETA;
  const rotosBodega = sum(emp, 'rotos_bodega');
  const descarte = sum(emp, 'descarte');
  const ultimo = [...emp].sort(byFechaId).pop();
  const sueltosBodega = ultimo ? num(ultimo.sueltos_bodega) : 0; // huevos que quedaron sin empacar en el último registro
  const diferencia = recibidos - empacados - rotosBodega - descarte - sueltosBodega;
  return { recibidos, empacados, rotosBodega, descarte, sueltosBodega, diferencia };
}

export function resumenDia(produccion, empaque, fecha) {
  const prod = produccion.filter((p) => activo(p) && p.fecha === fecha);
  const emp = empaque.filter((e) => activo(e) && e.fecha === fecha);
  return {
    lotesRegistrados: new Set(prod.map((p) => p.lote_id)).size,
    huevosRecibidos: sum(prod, (p) => huevosProd(p)),
    rotosGalpon: sum(prod, 'rotos_galpon'),
    bajas: sum(prod, 'bajas'),
    alimentoKg: sum(prod, 'alimento_kg'),
    cubetasEmpacadas: sum(emp, (e) => CATEGORIAS.reduce((a, c) => a + num(e[COL_CAT[c]]), 0)),
    porCategoria: Object.fromEntries(CATEGORIAS.map((c) => [c, sum(emp, COL_CAT[c])])),
    rotosBodega: sum(emp, 'rotos_bodega'),
    descarte: sum(emp, 'descarte'),
  };
}

export function retirosActivos(sanidad, lotes, hoy) {
  return sanidad.filter((s) => activo(s) && s.retiro_hasta && s.retiro_hasta >= hoy)
    .map((s) => ({ ...s, lote: (lotes.find((l) => l.id === s.lote_id) || {}).nombre || 'Todos los lotes' }));
}

// ---------- inventarios ----------
export function inventarioCubetas(empaque, ventas, ventaItems, reposiciones) {
  const ventasActivas = new Set(ventas.filter(activo).map((v) => v.id));
  const res = {};
  for (const c of CATEGORIAS) {
    const emp = sum(empaque.filter(activo), COL_CAT[c]) * HUEVOS_POR_CUBETA;
    const vend = sum(ventaItems.filter((i) => ventasActivas.has(i.venta_id) && i.categoria === c), 'cubetas') * HUEVOS_POR_CUBETA;
    const rep = sum(reposiciones.filter((r) => activo(r) && r.categoria === c), 'huevos');
    res[c] = { huevos: emp - vend - rep, cubetas: (emp - vend - rep) / HUEVOS_POR_CUBETA };
  }
  return res;
}

export function kgComprados(gastos, kgBulto = 40) {
  return sum(gastos.filter((g) => activo(g) && g.categoria === CAT_ALIMENTO), (g) =>
    g.unidad === 'bulto' ? num(g.cantidad) * kgBulto : g.unidad === 'kg' ? num(g.cantidad) : 0);
}

export function stockAlimento(gastos, produccion, cfg, hoy) {
  const comprados = kgComprados(gastos, num(cfg.kg_por_bulto) || 40) + num(cfg.alimento_inicial_kg);
  const consumido = sum(produccion.filter(activo), 'alimento_kg');
  const stockKg = comprados - consumido;
  const desde = addDias(hoy, -6);
  const reciente = produccion.filter((p) => activo(p) && p.fecha >= desde && p.fecha <= hoy);
  const diasConDatos = new Set(reciente.map((p) => p.fecha)).size;
  const consumoDia = diasConDatos ? sum(reciente, 'alimento_kg') / diasConDatos : 0;
  return { stockKg, bultos: stockKg / (num(cfg.kg_por_bulto) || 40), consumoDia, diasRestantes: consumoDia > 0 ? stockKg / consumoDia : null };
}

export function stockCubetasVacias(gastos, empaque, cfg) {
  const compradas = sum(gastos.filter((g) => activo(g) && g.categoria === CAT_CUBETAS), 'cantidad') + num(cfg.cubetas_vacias_inicial);
  const usadas = sum(empaque.filter(activo), (e) => CATEGORIAS.reduce((a, c) => a + num(e[COL_CAT[c]]), 0));
  return { compradas, usadas, stock: compradas - usadas };
}

// ---------- indicadores ----------
export function porLote(d, desde, hasta, cfg = {}) {
  const kgPrecio = precioKgAlimento(d.gastos, num(cfg.kg_por_bulto) || 40);
  return d.lotes.filter((l) => l.estado !== 'descartado').map((lote) => {
    const regs = d.produccion.filter((p) => activo(p) && p.lote_id === lote.id && p.fecha >= desde && p.fecha <= hasta);
    const huevosTotal = sum(regs, (p) => huevosProd(p) + num(p.rotos_galpon));
    const avesDia = sum(regs, (p) => avesVivas(lote, avesSalidas(d, lote.id, p.fecha)));
    const bajas = sum(regs, 'bajas');
    const alimentoKg = sum(regs, 'alimento_kg');
    return {
      lote, dias: regs.length, huevos: huevosTotal, bajas,
      postura: avesDia > 0 ? (huevosTotal / avesDia) * 100 : null,
      mortalidadPct: num(lote.aves_iniciales) > 0 ? (bajas / num(lote.aves_iniciales)) * 100 : null,
      alimentoKg,
      gAveDia: avesDia > 0 ? (alimentoKg * 1000) / avesDia : null,
      costoAlimentoHuevo: huevosTotal > 0 && kgPrecio ? (alimentoKg * kgPrecio) / huevosTotal : null,
    };
  });
}

export function precioKgAlimento(gastos, kgBulto = 40) {
  const g = gastos.filter((x) => activo(x) && x.categoria === CAT_ALIMENTO && (x.unidad === 'bulto' || x.unidad === 'kg'));
  const kg = sum(g, (x) => (x.unidad === 'bulto' ? num(x.cantidad) * kgBulto : num(x.cantidad)));
  return kg > 0 ? sum(g, 'valor_total') / kg : null;
}

export function indicadores(d, desde, hasta, cfg = {}) {
  const en = (f) => f >= desde && f <= hasta;
  const ventas = d.ventas.filter((v) => activo(v) && en(v.fecha));
  const idsVentas = new Set(ventas.map((v) => v.id));
  const items = d.ventaItems.filter((i) => idsVentas.has(i.venta_id));
  const cobros = d.cobros.filter((c) => activo(c) && en(c.fecha));
  const gastos = d.gastos.filter((g) => activo(g) && en(g.fecha));
  const gastosOper = gastos.filter((g) => g.naturaleza !== 'retiro' && g.categoria !== CAT_INVERSION);
  const dias = diasEntre(desde, hasta) + 1;
  // El costo de las aves se reparte en el tiempo: o un valor mensual fijo, o (si se indica la vida productiva) costo por ave / meses.
  let amortMensual = num(cfg.amortizacion_aves_mensual);
  if (!amortMensual && num(cfg.meses_vida_ave) > 0) {
    const vivas = sum(d.lotes.filter((l) => l.estado !== 'descartado'), (l) => Math.max(num(l.aves_iniciales) - avesSalidas(d, l.id, hasta), 0));
    amortMensual = (vivas * (num(cfg.costo_ave) || 27000)) / num(cfg.meses_vida_ave);
  }
  const amortizacion = (amortMensual * dias) / 30;
  const ventasAves = (d.ventasAves || []).filter((v) => activo(v) && en(v.fecha));
  const ingresoAves = sum(ventasAves, 'total');
  const avesVendidas = sum(ventasAves, 'cantidad');
  const costoTotal = sum(gastosOper, 'valor_total') + amortizacion;

  const prod = d.produccion.filter((p) => activo(p) && en(p.fecha));
  const emp = d.empaque.filter((e) => activo(e) && en(e.fecha));
  const reps = d.reposiciones.filter((r) => activo(r) && en(r.fecha));
  const huevosBuenos = sum(prod, (p) => huevosProd(p));
  const rotosGalpon = sum(prod, 'rotos_galpon');
  const rotosBodega = sum(emp, 'rotos_bodega');
  const descarte = sum(emp, 'descarte');
  const reposicionHuevos = sum(reps, 'huevos');
  const cubetasEmpacadas = sum(emp, (e) => CATEGORIAS.reduce((a, c) => a + num(e[COL_CAT[c]]), 0));
  const huevosVendibles = cubetasEmpacadas * HUEVOS_POR_CUBETA || huevosBuenos;
  const cubetasVendidas = sum(items, 'cubetas');
  const ventasTotal = sum(ventas, 'total');
  const huevosTotal = huevosBuenos + rotosGalpon;
  const perdidas = rotosGalpon + rotosBodega + descarte + reposicionHuevos;

  const lotes = porLote(d, desde, hasta, cfg);
  const avesDia = lotes.reduce((a, l) => a + (l.postura ? l.huevos / (l.postura / 100) : 0), 0);

  const costoHuevo = huevosVendibles > 0 ? costoTotal / huevosVendibles : null;
  const gastosPorCategoria = {};
  for (const g of gastosOper) gastosPorCategoria[g.categoria] = (gastosPorCategoria[g.categoria] || 0) + num(g.valor_total);

  return {
    desde, hasta, dias,
    ventasTotal, cobrado: sum(cobros, 'valor'), cubetasVendidas,
    precioPromedioCubeta: cubetasVendidas > 0 ? ventasTotal / cubetasVendidas : null,
    gastosTotal: sum(gastos, 'valor_total'), costoTotal, amortizacion, gastosPorCategoria,
    retiros: sum(gastos.filter((g) => g.naturaleza === 'retiro'), 'valor_total'),
    ingresoAves, avesVendidas,
    margen: ventasTotal + ingresoAves - costoTotal, margenPct: ventasTotal + ingresoAves > 0 ? ((ventasTotal + ingresoAves - costoTotal) / (ventasTotal + ingresoAves)) * 100 : null,
    costoHuevo, costoCubeta: costoHuevo === null ? null : costoHuevo * HUEVOS_POR_CUBETA,
    huevosTotal, huevosBuenos, cubetasEmpacadas, perdidas,
    perdidasPct: huevosTotal > 0 ? (perdidas / huevosTotal) * 100 : null,
    posturaPct: avesDia > 0 ? (huevosTotal / avesDia) * 100 : null,
    mezclaVendida: Object.fromEntries(CATEGORIAS.map((c) => [c, sum(items.filter((i) => i.categoria === c), 'cubetas')])),
    mezclaEmpacada: Object.fromEntries(CATEGORIAS.map((c) => [c, sum(emp, COL_CAT[c])])),
    lotes,
  };
}

// Margen por cliente: ventas, descuento frente a lista y reposiciones.
export function margenCliente(d, clienteId, desde, hasta, costoCubeta) {
  const ventas = d.ventas.filter((v) => activo(v) && v.cliente_id === clienteId && v.fecha >= desde && v.fecha <= hasta);
  const ids = new Set(ventas.map((v) => v.id));
  const items = d.ventaItems.filter((i) => ids.has(i.venta_id));
  const cubetas = sum(items, 'cubetas');
  const ingreso = sum(ventas, 'total');
  const descuento = sum(items, (i) => Math.max(num(i.precio_lista) - num(i.precio_unit), 0) * num(i.cubetas));
  const reposiciones = d.reposiciones.filter((r) => activo(r) && r.cliente_id === clienteId && r.fecha >= desde && r.fecha <= hasta);
  const huevosRep = sum(reposiciones, 'huevos');
  const costoRep = costoCubeta ? (huevosRep / HUEVOS_POR_CUBETA) * costoCubeta : 0;
  const costo = costoCubeta ? cubetas * costoCubeta + costoRep : null;
  return { cubetas, ingreso, descuento, huevosRep, costoRep, margen: costo === null ? null : ingreso - costo, margenPct: costo !== null && ingreso > 0 ? ((ingreso - costo) / ingreso) * 100 : null };
}

// ---------- alertas para el gerente ----------
export function alertas(d, cfg, hoy) {
  const lista = [];
  const cruce = cruceBodega(d.produccion, d.empaque, hoy);
  if (Math.abs(cruce.diferencia) > 5) lista.push({ nivel: 'rojo', texto: `Bodega no cuadra: diferencia de ${fmtNum(cruce.diferencia, 0)} huevos.` });
  const al = stockAlimento(d.gastos, d.produccion, cfg, hoy);
  if (al.diasRestantes !== null && al.diasRestantes < 3) lista.push({ nivel: 'rojo', texto: `Alimento para ${fmtNum(al.diasRestantes, 1)} días. Hora de pedir purina.` });
  const cv = stockCubetasVacias(d.gastos, d.empaque, cfg);
  if (cv.compradas > 0 && cv.stock < 100) lista.push({ nivel: 'amarillo', texto: `Quedan ${fmtNum(cv.stock, 0)} cubetas vacías.` });
  const ret = retirosActivos(d.sanidad, d.lotes, hoy);
  for (const r of ret) lista.push({ nivel: 'amarillo', texto: `${r.lote}: huevos en retiro por ${r.producto} hasta ${fmtFecha(r.retiro_hasta)}.` });
  const cart = cartera(d.clientes.filter((c) => c.estado !== 'inactivo'), d.ventas, d.cobros, hoy);
  const vencido = sum(cart, 'vencido');
  if (vencido > 0) lista.push({ nivel: 'amarillo', texto: `Cartera vencida: ${fmtCOP(vencido)} en ${cart.filter((c) => c.vencido > 0).length} cliente(s).` });
  const sin = d.lotes.filter((l) => l.estado !== 'descartado' && !d.produccion.some((p) => activo(p) && p.lote_id === l.id && p.fecha === hoy));
  if (sin.length) lista.push({ nivel: 'info', texto: `${sin.length} lote(s) sin registro de producción hoy.` });
  return lista;
}
