import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../docs/js/calc.js';

const cliente = { id: 'c1', nombre: 'Tienda La Esquina', condicion_pago: 'semanal' };

test('precioPara: tramo por cantidad y precio general de respaldo', () => {
  const precios = [
    { id: 'p0', cliente_id: '', categoria: 'AA', desde_cantidad: 0, precio: 20000, vigente_desde: '2026-10-01' },
    { id: 'p1', cliente_id: 'c1', categoria: 'AA', desde_cantidad: 0, precio: 18000, vigente_desde: '2026-10-01' },
    { id: 'p2', cliente_id: 'c1', categoria: 'AA', desde_cantidad: 10, precio: 17000, vigente_desde: '2026-10-01' },
  ];
  assert.equal(C.precioPara(precios, 'c1', 'AA', 5, '2026-10-05').precio, 18000);
  assert.equal(C.precioPara(precios, 'c1', 'AA', 10, '2026-10-05').precio, 17000);
  assert.equal(C.precioPara(precios, 'c1', 'AA', 25, '2026-10-05').precio, 17000);
  // cliente sin precio propio usa la lista general
  const g = C.precioPara(precios, 'c9', 'AA', 5, '2026-10-05');
  assert.equal(g.precio, 20000);
  assert.equal(g.general, true);
  // categoría sin precio
  assert.equal(C.precioPara(precios, 'c1', 'JUMBO', 5, '2026-10-05'), null);
});

test('precioPara: un cambio de precio conserva el historial y respeta la fecha', () => {
  const precios = [
    { id: 'p1', cliente_id: 'c1', categoria: 'A', desde_cantidad: 0, precio: 15000, vigente_desde: '2026-10-01' },
    { id: 'p2', cliente_id: 'c1', categoria: 'A', desde_cantidad: 0, precio: 16000, vigente_desde: '2026-10-10' },
  ];
  assert.equal(C.precioPara(precios, 'c1', 'A', 1, '2026-10-05').precio, 15000);
  assert.equal(C.precioPara(precios, 'c1', 'A', 1, '2026-10-12').precio, 16000);
});

test('precioPara: ignora registros anulados', () => {
  const precios = [
    { id: 'p1', cliente_id: 'c1', categoria: 'A', desde_cantidad: 0, precio: 15000, vigente_desde: '2026-10-01' },
    { id: 'p2', cliente_id: 'c1', categoria: 'A', desde_cantidad: 0, precio: 99999, vigente_desde: '2026-10-03', anulado: true },
  ];
  assert.equal(C.precioPara(precios, 'c1', 'A', 1, '2026-10-05').precio, 15000);
});

test('ajustarPrecios: sube 3 % y redondea a 50 pesos, incluye tramos', () => {
  const precios = [
    { id: 'p1', cliente_id: 'c1', categoria: 'AA', desde_cantidad: 0, precio: 18000, vigente_desde: '2026-10-01' },
    { id: 'p2', cliente_id: 'c1', categoria: 'AA', desde_cantidad: 10, precio: 17000, vigente_desde: '2026-10-01' },
    { id: 'p3', cliente_id: 'c1', categoria: 'A', desde_cantidad: 0, precio: 16000, vigente_desde: '2026-10-01' },
  ];
  const n = C.ajustarPrecios(precios, ['c1'], ['AA'], 3, '2026-10-06');
  assert.equal(n.length, 2);
  assert.deepEqual(n.map((x) => x.precio).sort(), [17500, 18550]);
  assert.ok(n.every((x) => x.categoria === 'AA' && x.vigente_desde === '2026-10-06'));
});

test('vencimiento según condición de pago', () => {
  assert.equal(C.vencimiento('2026-10-05', 'contado'), '2026-10-05');
  assert.equal(C.vencimiento('2026-10-05', 'semanal'), '2026-10-11'); // lunes -> domingo
  assert.equal(C.vencimiento('2026-10-11', 'semanal'), '2026-10-11'); // domingo
  assert.equal(C.vencimiento('2026-10-05', 'mensual'), '2026-10-31');
  assert.equal(C.vencimiento('2026-02-10', 'mensual'), '2026-02-28');
});

test('estadoCuenta: los abonos pagan primero la deuda más antigua', () => {
  const ventas = [
    { id: 'v1', cliente_id: 'c1', fecha: '2026-10-01', total: 100000, numero: 'R-1' },
    { id: 'v2', cliente_id: 'c1', fecha: '2026-10-03', total: 200000, numero: 'R-2' },
    { id: 'v3', cliente_id: 'c1', fecha: '2026-10-04', total: 50000, numero: 'R-3', anulado: true },
    { id: 'v4', cliente_id: 'otro', fecha: '2026-10-03', total: 999, numero: 'R-4' },
  ];
  const cobros = [
    { id: 'k1', cliente_id: 'c1', fecha: '2026-10-02', valor: 120000, medio: 'Nequi' },
    { id: 'k2', cliente_id: 'c1', fecha: '2026-10-04', valor: 30000, medio: 'Efectivo', anulado: true },
  ];
  const ec = C.estadoCuenta(cliente, ventas, cobros, '2026-10-08');
  assert.equal(ec.facturado, 300000);
  assert.equal(ec.cobrado, 120000);
  assert.equal(ec.saldo, 180000);
  assert.equal(ec.pedidos[0].pendiente, 0); // v1 pagada completa
  assert.equal(ec.pedidos[1].pagado, 20000); // sobrante aplicado a v2
  assert.equal(ec.pedidos[1].pendiente, 180000);
  assert.equal(ec.pendientes.length, 1);
  assert.equal(ec.ultimoPago.valor, 120000);
  assert.equal(ec.ultimoPago.medio, 'Nequi');
  // semanal: v2 (3/oct, sábado) vence el domingo 4/oct -> 4 días de mora al 8/oct
  assert.equal(ec.pedidos[1].vence, '2026-10-04');
  assert.equal(ec.pedidos[1].diasMora, 4);
  assert.equal(ec.vencido, 180000);
  assert.equal(ec.edad.d0_7, 180000);
});

test('estadoCuenta: saldo a favor y antigüedad', () => {
  const ventas = [{ id: 'v1', cliente_id: 'c1', fecha: '2026-08-01', total: 100000 }];
  const cobros = [{ id: 'k1', cliente_id: 'c1', fecha: '2026-08-02', valor: 150000 }];
  const ec = C.estadoCuenta(cliente, ventas, cobros, '2026-10-05');
  assert.equal(ec.saldo, 0);
  assert.equal(ec.aFavor, 50000);
  const ventas2 = [{ id: 'v1', cliente_id: 'c1', fecha: '2026-08-01', total: 100000 }];
  const ec2 = C.estadoCuenta(cliente, ventas2, [], '2026-10-05');
  assert.equal(ec2.edad.d31, 100000);
});

test('movimientos: saldo corrido', () => {
  const ventas = [{ id: 'v1', cliente_id: 'c1', fecha: '2026-10-01', total: 100000, numero: 'R-1' }];
  const cobros = [{ id: 'k1', cliente_id: 'c1', fecha: '2026-10-02', valor: 40000, medio: 'Daviplata' }];
  const items = [{ venta_id: 'v1', categoria: 'AA', cubetas: 5 }];
  const m = C.movimientos(cliente, ventas, cobros, items);
  assert.deepEqual(m.map((x) => x.saldo), [100000, 60000]);
  assert.equal(m[0].detalle, '5 AA');
});

test('textoEstadoCuenta menciona saldo y último pago', () => {
  const ventas = [{ id: 'v1', cliente_id: 'c1', fecha: '2026-10-01', total: 100000, numero: 'R-1' }];
  const cobros = [{ id: 'k1', cliente_id: 'c1', fecha: '2026-10-02', valor: 40000, medio: 'Nequi' }];
  const ec = C.estadoCuenta(cliente, ventas, cobros, '2026-10-05');
  const t = C.textoEstadoCuenta('Doble Yema', cliente, ec, '2026-10-05');
  assert.match(t, /Doble Yema/);
  assert.match(t, /Tienda La Esquina/);
  assert.match(t, /Saldo pendiente: \$60\.000/);
  assert.match(t, /Último pago: 02\/10\/2026/);
});

test('cruceBodega: cuadra cuando todo lo recibido está contado', () => {
  const produccion = [
    { id: 'a', fecha: '2026-10-05', lote_id: 'l1', cubetas: 5, sueltos: 10 }, // 160
    { id: 'b', fecha: '2026-10-05', lote_id: 'l2', cubetas: 4, sueltos: 0 }, // 120
  ];
  const empaque = [{ id: 'e', fecha: '2026-10-05', b: 1, a: 2, aa: 3, aaa: 0, jumbo: 0, sueltos_bodega: 10, rotos_bodega: 4, descarte: 6 }];
  // 280 recibidos = 6*30=180 empacados + 4 rotos + 6 descarte + 10 sueltos = 200 -> diferencia 80
  let c = C.cruceBodega(produccion, empaque, '2026-10-05');
  assert.equal(c.recibidos, 280);
  assert.equal(c.empacados, 180);
  assert.equal(c.diferencia, 80);
  const empaque2 = [{ ...empaque[0], aa: 8 }]; // 11 cubetas = 330 -> no, ajustamos
  c = C.cruceBodega(produccion, [{ id: 'e', fecha: '2026-10-05', b: 1, a: 2, aa: 5, aaa: 0, jumbo: 0, sueltos_bodega: 10, rotos_bodega: 4, descarte: 6 }], '2026-10-05');
  assert.equal(c.diferencia, 280 - 240 - 4 - 6 - 10);
  assert.equal(c.diferencia, 20);
  void empaque2;
});

test('cruceBodega: sin diferencia', () => {
  const produccion = [{ id: 'a', fecha: '2026-10-05', lote_id: 'l1', cubetas: 10, sueltos: 0 }]; // 300
  const empaque = [{ id: 'e', fecha: '2026-10-05', b: 0, a: 4, aa: 5, aaa: 0, jumbo: 0, sueltos_bodega: 0, rotos_bodega: 0, descarte: 0 }]; // 270
  const c = C.cruceBodega(produccion, empaque, '2026-10-05');
  assert.equal(c.diferencia, 30);
  const empaque2 = [{ ...empaque[0], rotos_bodega: 12, descarte: 8, sueltos_bodega: 10 }];
  assert.equal(C.cruceBodega(produccion, empaque2, '2026-10-05').diferencia, 0);
});

test('inventarioCubetas descuenta ventas y reposiciones', () => {
  const empaque = [{ id: 'e', fecha: '2026-10-05', b: 0, a: 0, aa: 10, aaa: 0, jumbo: 0 }];
  const ventas = [{ id: 'v1' }, { id: 'v2', anulado: true }];
  const items = [
    { venta_id: 'v1', categoria: 'AA', cubetas: 4 },
    { venta_id: 'v2', categoria: 'AA', cubetas: 3 }, // anulada: no cuenta
  ];
  const reps = [{ categoria: 'AA', huevos: 15 }];
  const inv = C.inventarioCubetas(empaque, ventas, items, reps);
  assert.equal(inv.AA.huevos, 300 - 120 - 15);
  assert.equal(inv.AA.cubetas, 5.5);
  assert.equal(inv.JUMBO.huevos, 0);
});

test('stockAlimento: bultos de 40 kg, consumo diario y días restantes', () => {
  const gastos = [
    { id: 'g1', categoria: 'Alimento', unidad: 'bulto', cantidad: 20, valor_total: 2000000 }, // 800 kg
    { id: 'g2', categoria: 'Vitaminas y medicinas', unidad: 'ml', cantidad: 500, valor_total: 50000 },
  ];
  const produccion = [
    { id: 'a', fecha: '2026-10-04', alimento_kg: 100 },
    { id: 'b', fecha: '2026-10-05', alimento_kg: 100 },
  ];
  const s = C.stockAlimento(gastos, produccion, { kg_por_bulto: 40 }, '2026-10-05');
  assert.equal(s.stockKg, 600);
  assert.equal(s.bultos, 15);
  assert.equal(s.consumoDia, 100);
  assert.equal(s.diasRestantes, 6);
  assert.equal(C.precioKgAlimento(gastos), 2500);
});

test('stockCubetasVacias', () => {
  const gastos = [{ categoria: 'Cubetas (empaque)', cantidad: 1000 }];
  const empaque = [{ b: 10, a: 20, aa: 30, aaa: 0, jumbo: 0 }];
  assert.equal(C.stockCubetasVacias(gastos, empaque, {}).stock, 940);
});

test('porLote: postura, mortalidad y alimento por ave', () => {
  const lotes = [{ id: 'l1', nombre: 'Lote 1', aves_iniciales: 200, estado: 'activo' }];
  const produccion = [
    { id: 'a', fecha: '2026-10-04', lote_id: 'l1', cubetas: 6, sueltos: 0, rotos_galpon: 0, bajas: 0, alimento_kg: 23 }, // 180 huevos
    { id: 'b', fecha: '2026-10-05', lote_id: 'l1', cubetas: 5, sueltos: 20, rotos_galpon: 2, bajas: 2, alimento_kg: 22.8 }, // 172 huevos
  ];
  const d = { lotes, produccion, gastos: [{ categoria: 'Alimento', unidad: 'bulto', cantidad: 10, valor_total: 1000000 }] };
  const [l] = C.porLote(d, '2026-10-01', '2026-10-31', { kg_por_bulto: 40 });
  // aves vivas: 200 (día 4) y 198 (día 5) = 398
  assert.ok(Math.abs(l.postura - ((180 + 172) / 398) * 100) < 1e-9);
  assert.equal(l.bajas, 2);
  assert.equal(l.mortalidadPct, 1);
  assert.ok(Math.abs(l.gAveDia - (45.8 * 1000) / 398) < 1e-9);
  assert.ok(l.costoAlimentoHuevo > 0);
});

test('indicadores: ventas, costos, margen y costo por huevo', () => {
  const d = {
    lotes: [{ id: 'l1', nombre: 'Lote 1', aves_iniciales: 200 }],
    produccion: [{ id: 'p', fecha: '2026-10-05', lote_id: 'l1', cubetas: 6, sueltos: 0, rotos_galpon: 0, bajas: 0, alimento_kg: 23 }],
    empaque: [{ id: 'e', fecha: '2026-10-05', b: 0, a: 0, aa: 6, aaa: 0, jumbo: 0, sueltos_bodega: 0, rotos_bodega: 0, descarte: 0 }],
    ventas: [{ id: 'v1', fecha: '2026-10-05', cliente_id: 'c1', total: 120000 }],
    ventaItems: [{ venta_id: 'v1', categoria: 'AA', cubetas: 6, precio_unit: 20000, precio_lista: 21000, subtotal: 120000 }],
    cobros: [{ id: 'k1', fecha: '2026-10-05', cliente_id: 'c1', valor: 70000 }],
    gastos: [
      { id: 'g1', fecha: '2026-10-05', categoria: 'Alimento', valor_total: 60000, naturaleza: 'negocio', unidad: 'bulto', cantidad: 1 },
      { id: 'g2', fecha: '2026-10-05', categoria: 'Servicios', valor_total: 6000, naturaleza: 'negocio' },
      { id: 'g3', fecha: '2026-10-05', categoria: 'Otros', valor_total: 500000, naturaleza: 'retiro' },
      { id: 'g4', fecha: '2026-10-05', categoria: 'Aves (inversión)', valor_total: 900000, naturaleza: 'negocio' },
    ],
    reposiciones: [{ id: 'r1', fecha: '2026-10-05', cliente_id: 'c1', categoria: 'AA', huevos: 3 }],
  };
  const i = C.indicadores(d, '2026-10-05', '2026-10-05', {});
  assert.equal(i.ventasTotal, 120000);
  assert.equal(i.cobrado, 70000);
  assert.equal(i.cubetasVendidas, 6);
  assert.equal(i.precioPromedioCubeta, 20000);
  assert.equal(i.costoTotal, 66000); // sin retiros ni inversión
  assert.equal(i.retiros, 500000);
  assert.equal(i.margen, 54000);
  assert.equal(i.margenPct, 45);
  assert.equal(i.costoHuevo, 66000 / 180);
  assert.equal(i.perdidas, 3);
  assert.equal(i.mezclaVendida.AA, 6);
  assert.equal(i.gastosPorCategoria.Alimento, 60000);
  assert.ok(Math.abs(i.posturaPct - 90) < 1e-9); // 180 huevos / 200 aves
  const m = C.margenCliente(d, 'c1', '2026-10-05', '2026-10-05', i.costoCubeta);
  assert.equal(m.descuento, 6000);
  assert.equal(m.ingreso, 120000);
  assert.ok(m.margen < 120000 && m.margen > 0);
});

test('amortización prorrateada entra al costo', () => {
  const d = { lotes: [], produccion: [], empaque: [], ventas: [], ventaItems: [], cobros: [], gastos: [], reposiciones: [] };
  const i = C.indicadores(d, '2026-10-01', '2026-10-30', { amortizacion_aves_mensual: 3000000 });
  assert.equal(i.amortizacion, 3000000);
});

test('retirosActivos y alertas', () => {
  const d = {
    lotes: [{ id: 'l1', nombre: 'Lote 1', aves_iniciales: 200 }, { id: 'l2', nombre: 'Lote 2', aves_iniciales: 200 }],
    sanidad: [{ id: 's1', fecha: '2026-10-04', lote_id: 'l1', producto: 'Antibiótico X', retiro_dias: 7, retiro_hasta: '2026-10-11' }],
    produccion: [{ id: 'p', fecha: '2026-10-05', lote_id: 'l1', cubetas: 6, sueltos: 0, alimento_kg: 400 }],
    empaque: [],
    gastos: [{ categoria: 'Alimento', unidad: 'bulto', cantidad: 12, valor_total: 1, fecha: '2026-10-01' }], // 480 kg
    clientes: [{ id: 'c1', nombre: 'X', condicion_pago: 'contado' }],
    ventas: [{ id: 'v1', cliente_id: 'c1', fecha: '2026-10-01', total: 50000 }],
    cobros: [],
  };
  assert.equal(C.retirosActivos(d.sanidad, d.lotes, '2026-10-05').length, 1);
  const a = C.alertas(d, { kg_por_bulto: 40 }, '2026-10-05');
  const textos = a.map((x) => x.texto).join(' | ');
  assert.match(textos, /Bodega no cuadra/);
  assert.match(textos, /Alimento para/);
  assert.match(textos, /retiro/);
  assert.match(textos, /Cartera vencida/);
  assert.match(textos, /sin registro de producción/);
});

test('fechas: hoyISO, inicioSemana, inicioMes, formato', () => {
  assert.match(C.hoyISO(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(C.hoyISO(new Date('2026-10-06T03:00:00Z')), '2026-10-05'); // 22:00 en Bogotá
  assert.equal(C.inicioSemana('2026-10-05'), '2026-10-05'); // lunes
  assert.equal(C.inicioSemana('2026-10-11'), '2026-10-05'); // domingo
  assert.equal(C.inicioMes('2026-10-17'), '2026-10-01');
  assert.equal(C.fmtFecha('2026-10-05'), '05/10/2026');
  assert.equal(C.fmtCOP(1250000), '$1.250.000');
});

test('producción: el galpón anota un solo total de huevos y los registros antiguos siguen contando', () => {
  const produccion = [
    { id: 'n', fecha: '2026-10-05', lote_id: 'l1', huevos: 190, cubetas: 0, sueltos: 0, rotos_galpon: 2, bajas: 0, alimento_kg: 8.2 },
    { id: 'v', fecha: '2026-10-05', lote_id: 'l1', cubetas: 2, sueltos: 5 }, // formato anterior: 65 huevos
  ];
  assert.equal(C.huevosProd(produccion[0]), 190);
  assert.equal(C.huevosProd(produccion[1]), 65);
  const r = C.resumenDia(produccion, [], '2026-10-05');
  assert.equal(r.huevosRecibidos, 255);
  const c = C.cruceBodega(produccion, [{ id: 'e', fecha: '2026-10-05', b: 0, a: 8, aa: 0, aaa: 0, jumbo: 0, sueltos_bodega: 15, rotos_bodega: 0, descarte: 0 }], '2026-10-05');
  assert.equal(c.recibidos, 255);
  assert.equal(c.diferencia, 0); // 8 cubetas (240) + 15 sueltos
});

test('gallinas de descarte: salen del lote, ingresan y entran al margen', () => {
  const d = {
    lotes: [{ id: 'l1', nombre: 'Lote 1', aves_iniciales: 200 }], produccion: [{ id: 'p', fecha: '2026-10-01', lote_id: 'l1', bajas: 2 }],
    empaque: [], ventas: [], ventaItems: [], cobros: [], gastos: [], reposiciones: [],
    salidasAves: [{ id: 's1', fecha: '2026-10-02', lote_id: 'l1', cantidad: 5, causa: 'enfermedad' }, { id: 's2', fecha: '2026-10-02', lote_id: 'l1', cantidad: 9, anulado: true }],
    ventasAves: [{ id: 'va1', fecha: '2026-10-02', lote_id: 'l1', cantidad: 5, precio_unit: 20000, total: 100000, medio: 'Efectivo' }],
  };
  assert.equal(C.avesSalidas(d, 'l1'), 7);
  const inv = C.inversionAves(d, { costo_ave: 27000 });
  assert.equal(inv.invertido, 5400000);
  assert.equal(inv.recuperado, 100000);
  assert.equal(inv.avesActuales, 193);
  const i = C.indicadores(d, '2026-10-01', '2026-10-30', { costo_ave: 27000, meses_vida_ave: 18 });
  assert.equal(i.ingresoAves, 100000);
  assert.equal(i.avesVendidas, 5);
  assert.ok(i.amortizacion > 0);
  assert.equal(i.margen, 100000 - i.costoTotal);
});
