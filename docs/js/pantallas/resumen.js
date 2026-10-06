// Gerencia: tablero de indicadores, alertas, inventarios y dinero por medio.
import { h, tarjeta, fichas, aviso_caja, barra, dinero, vaciar } from '../ui.js';
import { hoyISO, addDias, inicioSemana, inicioMes, fmtCOP, fmtNum, fmtPct, fmtFecha, num, activo, CATEGORIAS, indicadores, alertas, inventarioCubetas, stockAlimento, stockCubetasVacias, cartera, inversionAves } from '../calc.js';

const MEDIOS = ['Efectivo', 'Nequi', 'Daviplata', 'Banco'];
const kpi = (n, v, clase = '') => h('div', { class: 'kpi ' + clase }, h('div', { class: 'valor' }, v), h('div', { class: 'nombre' }, n));

export function alertasInicio(d) {
  const a = alertas(d, d.cfg, hoyISO());
  return a.length ? h('div', {}, a.slice(0, 4).map((x) => aviso_caja(x.texto, x.nivel))) : null;
}

export function dineroPorMedio(d) {
  const hoy = hoyISO();
  return MEDIOS.map((m) => {
    const inicial = num(d.cfg['saldo_inicial_' + m]);
    const entra = d.cobros.filter((c) => activo(c) && c.medio === m).reduce((a, c) => a + num(c.valor), 0);
    const sale = d.gastos.filter((g) => activo(g) && g.medio_pago === m).reduce((a, g) => a + num(g.valor_total), 0);
    const aves = (d.ventasAves || []).filter((v) => activo(v) && v.medio === m).reduce((a, v) => a + num(v.total), 0);
    return { medio: m, inicial, entra: entra + aves, sale, saldo: inicial + entra + aves - sale };
  });
}

let periodoElegido = 'semana'; // se conserva al actualizarse la pantalla

export function resumen(d) {
  const hoy = hoyISO();
  const periodos = { hoy: [hoy, hoy], semana: [inicioSemana(hoy), hoy], mes: [inicioMes(hoy), hoy], d30: [addDias(hoy, -29), hoy] };
  let per = periodoElegido;
  const cont = h('div', {});
  const pintar = () => {
    vaciar(cont);
    const [desde, hasta] = periodos[per];
    const i = indicadores(d, desde, hasta, d.cfg);
    const cart = cartera(d.clientes, d.ventas, d.cobros, hoy);
    const porCobrar = cart.reduce((a, r) => a + r.saldo, 0);
    const vencido = cart.reduce((a, r) => a + r.vencido, 0);
    const inv = inventarioCubetas(d.empaque, d.ventas, d.ventaItems, d.reposiciones);
    const al = stockAlimento(d.gastos, d.produccion, d.cfg, hoy);
    const cv = stockCubetasVacias(d.gastos, d.empaque, d.cfg);
    const dinero$ = dineroPorMedio(d);
    const inA = inversionAves(d, d.cfg);
    cont.append(
      h('div', { class: 'kpis' },
        kpi('Ventas de huevos', fmtCOP(i.ventasTotal)), kpi('Cobrado', fmtCOP(i.cobrado)),
        kpi('Venta de gallinas' + (i.avesVendidas ? ` (${fmtNum(i.avesVendidas, 0)})` : ''), fmtCOP(i.ingresoAves)),
        kpi('Gastos del negocio', fmtCOP(i.costoTotal)), kpi('Margen', fmtCOP(i.margen) + (i.margenPct !== null ? ` (${fmtNum(i.margenPct, 0)} %)` : ''), i.margen < 0 ? 'rojo' : 'verde'),
        kpi('Cubetas vendidas', fmtNum(i.cubetasVendidas, 0)), kpi('Precio prom. cubeta', i.precioPromedioCubeta ? fmtCOP(i.precioPromedioCubeta) : '–'),
        kpi('Costo por cubeta', i.costoCubeta ? fmtCOP(i.costoCubeta) : '–'), kpi('Postura', fmtPct(i.posturaPct)),
        kpi('Pérdidas (rotos, descarte)', fmtPct(i.perdidasPct), i.perdidasPct > 5 ? 'rojo' : ''), kpi('Retiros personales', fmtCOP(i.retiros))),
      h('h2', {}, 'Inversión en gallinas'),
      tarjeta(h('div', { class: 'kpis', style: 'margin:0' }, kpi('Invertido en aves', fmtCOP(inA.invertido)), kpi('Recuperado vendiendo', fmtCOP(inA.recuperado) + (inA.recuperadoPct !== null ? ` (${fmtNum(inA.recuperadoPct, 0)} %)` : ''), 'verde'),
        kpi('Gallinas hoy', fmtNum(inA.avesActuales, 0)), kpi('Costo por ave', fmtCOP(inA.costoAve))),
        h('p', { class: 'suave' }, `Cada gallina costó ${fmtCOP(inA.costoAve)}. Su costo se reparte mes a mes en los gastos (amortización) y lo que recuperas al venderlas entra como ingreso.`),
        h('div', { class: 'fila-botones' }, h('a', { href: '#/gallinas', class: 'btn secundario chico' }, 'Vender gallinas'), h('a', { href: '#/tandas', class: 'btn secundario chico' }, 'Historial por lote'))),
      h('h2', {}, 'Por cobrar'),
      tarjeta(h('div', { class: 'kpis', style: 'margin:0' }, kpi('Total por cobrar', fmtCOP(porCobrar)), kpi('Vencido', fmtCOP(vencido), vencido ? 'rojo' : '')),
        h('a', { href: '#/clientes?f=deuda', class: 'btn secundario chico', style: 'margin-top:10px' }, 'Ver quién debe')),
      h('h2', {}, 'Dinero por medio de pago'),
      tarjeta(h('div', { class: 'tabla-scroll' }, h('table', { class: 'tabla' }, h('thead', {}, h('tr', {}, ['Medio', 'Entró', 'Salió', 'Debería haber'].map((t) => h('th', {}, t)))),
        h('tbody', {}, dinero$.map((m) => h('tr', {}, h('td', {}, m.medio), h('td', {}, fmtCOP(m.entra)), h('td', {}, fmtCOP(m.sale)), h('td', {}, h('b', {}, fmtCOP(m.saldo)))))))),
        h('p', { class: 'suave' }, 'Incluye el saldo inicial de la hoja Config. Cuenta el efectivo y compáralo con lo que "debería haber".'),
        arqueo(dinero$[0].saldo)),
      h('h2', {}, 'Inventario'),
      tarjeta(h('table', { class: 'tabla' }, h('thead', {}, h('tr', {}, ['Categoría', 'Cubetas listas'].map((t) => h('th', {}, t)))), h('tbody', {}, CATEGORIAS.map((c) => h('tr', {}, h('td', {}, c), h('td', {}, fmtNum(inv[c].cubetas, 1)))))),
        h('div', { style: 'margin-top:10px' }, `🌾 Alimento: ${fmtNum(al.bultos, 1)} bultos (${fmtNum(al.stockKg, 0)} kg)${al.diasRestantes !== null ? ' · alcanza ~' + fmtNum(al.diasRestantes, 0) + ' días' : ''}`),
        h('div', {}, `📦 Cubetas vacías: ${fmtNum(cv.stock, 0)}`)),
      h('h2', {}, 'Mezcla de categorías vendida'),
      tarjeta(CATEGORIAS.map((c) => h('div', { style: 'margin-bottom:8px' }, h('div', { class: 'fila entre' }, h('span', {}, c), h('b', {}, fmtNum(i.mezclaVendida[c], 0) + ' cub.')), barra(i.cubetasVendidas ? (i.mezclaVendida[c] / i.cubetasVendidas) * 100 : 0)))),
      h('h2', {}, 'Gastos por categoría'),
      tarjeta(Object.entries(i.gastosPorCategoria).sort((a, b) => b[1] - a[1]).map(([k, v]) => h('div', { style: 'margin-bottom:8px' }, h('div', { class: 'fila entre' }, h('span', {}, k), h('b', {}, fmtCOP(v))), barra(i.costoTotal ? (v / i.costoTotal) * 100 : 0))) , !Object.keys(i.gastosPorCategoria).length ? h('div', { class: 'suave' }, 'Sin gastos en el periodo.') : null),
      h('h2', {}, 'Producción por lote'),
      tarjeta(h('div', { class: 'tabla-scroll' }, h('table', { class: 'tabla' }, h('thead', {}, h('tr', {}, ['Lote', 'Postura', 'Muertas', 'g/ave', '$ alim./huevo'].map((t) => h('th', {}, t)))),
        h('tbody', {}, i.lotes.filter((l) => l.dias).map((l) => h('tr', {}, h('td', {}, l.lote.nombre), h('td', {}, fmtPct(l.postura, 0)), h('td', {}, fmtNum(l.bajas, 0)), h('td', {}, l.gAveDia ? fmtNum(l.gAveDia, 0) : '–'), h('td', {}, l.costoAlimentoHuevo ? fmtCOP(l.costoAlimentoHuevo * 100) + '/100' : '–'))))))));
  };
  pintar();
  return h('div', {}, h('h1', {}, 'Resumen'), alertasInicio(d),
    h('div', { style: 'margin-bottom:12px' }, fichas([{ valor: 'hoy', texto: 'Hoy' }, { valor: 'semana', texto: 'Esta semana' }, { valor: 'mes', texto: 'Este mes' }, { valor: 'd30', texto: '30 días' }], { valor: per, onChange: (v) => { per = v; periodoElegido = v; pintar(); } })), cont);
}

function arqueo(esperado) {
  const contado = dinero({});
  const res = h('div', { style: 'margin-top:8px; font-weight:700' });
  contado.addEventListener('input', () => {
    const c = contado.get();
    const dif = c - esperado;
    res.textContent = !c ? '' : dif === 0 ? '✓ Cuadra' : (dif > 0 ? 'Sobran ' : 'Faltan ') + fmtCOP(Math.abs(dif));
    res.style.color = dif === 0 ? 'var(--verde)' : 'var(--rojo)';
  });
  return h('div', {}, h('div', { class: 'etiqueta' }, 'Arqueo: ¿cuánto efectivo contaste?'), contado, res);
}
