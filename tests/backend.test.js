import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearSandbox, sandboxOcupado } from './gas-sandbox.js';

function preparar() {
  const s = crearSandbox();
  s.ejecutar('setup()');
  s.ejecutar("guardarPin_('gerente', '1234')");
  s.ejecutar("guardarPin_('operario', '5678')");
  const login = (usuario, pin) => s.llamar({ action: 'login', usuario, pin });
  const ger = login('gerente', '1234').token;
  const ope = login('operario', '5678').token;
  return { ...s, login, ger, ope };
}

const prod = (over = {}) => ({
  entity: 'Produccion',
  record: { id: 'prod-1', fecha: '2026-10-05', lote_id: 'lote-01', cubetas: 5, sueltos: 10, rotos_galpon: 1, bajas: 0, alimento_kg: 23, notas: '1-2 dosis', ts: 1790000000000, ...over },
});

test('setup crea hojas, 15 lotes y configuración', () => {
  const s = crearSandbox();
  s.ejecutar('setup()');
  for (const n of ['Config', 'Lotes', 'Produccion', 'Empaque', 'Sanidad', 'Clientes', 'Precios', 'Ventas', 'VentaItems', 'Cobros', 'Reposiciones', 'Proveedores', 'Gastos', 'SalidasAves', 'VentasAves', 'Auditoria']) {
    assert.ok(s.hojas.get(n), 'falta la hoja ' + n);
  }
  assert.equal(s.hojas.get('Lotes').getLastRow(), 16);
  const enc = s.hojas.get('Produccion').getRange(1, 1, 1, 15).getValues()[0];
  assert.equal(enc[0], 'id');
  assert.equal(enc.at(-1), 'upd');
  // idempotente: correr setup otra vez no duplica nada
  s.ejecutar('setup()');
  assert.equal(s.hojas.get('Lotes').getLastRow(), 16);
  assert.equal(s.hojas.get('Config').getLastRow(), 18);
});

test('login: sin PIN, PIN incorrecto, bloqueo y éxito', () => {
  const s = crearSandbox();
  s.ejecutar('setup()');
  assert.equal(s.llamar({ action: 'login', usuario: 'gerente', pin: '1234' }).code, 'SIN_PIN');
  s.ejecutar("guardarPin_('gerente', '1234')");
  const ok = s.llamar({ action: 'login', usuario: 'gerente', pin: '1234' });
  assert.equal(ok.ok, true);
  assert.equal(ok.role, 'gerente');
  assert.equal(s.llamar({ action: 'login', usuario: 'jefe', pin: '1234' }).ok, false);
  for (let i = 0; i < 5; i++) assert.equal(s.llamar({ action: 'login', usuario: 'gerente', pin: '0000' }).code, i < 5 ? 'LOGIN' : 'BLOQUEO');
  assert.equal(s.llamar({ action: 'login', usuario: 'gerente', pin: '1234' }).code, 'BLOQUEO');
});

test('el PIN se guarda con hash y con formato válido', () => {
  const s = crearSandbox();
  s.ejecutar('setup()');
  assert.throws(() => s.ejecutar("guardarPin_('gerente', '12')"), /4 a 8 dígitos/);
  assert.throws(() => s.ejecutar("guardarPin_('gerente', 'abcd')"), /4 a 8 dígitos/);
  s.ejecutar("guardarPin_('gerente', '246810')");
  const guardado = s.props.get('PIN_gerente');
  assert.ok(!guardado.includes('246810'));
  assert.match(guardado, /^[0-9a-f-]+\$[0-9a-f]{64}$/);
});

test('token: manipulado, ausente o tras cambio de PIN se rechaza', () => {
  const t = preparar();
  assert.equal(t.llamar({ action: 'pull', token: t.ger }).ok, true);
  assert.equal(t.llamar({ action: 'pull', token: '' }).code, 'AUTH');
  const [payload, firma] = t.ger.split('.');
  const falso = Buffer.from(JSON.stringify({ u: 'gerente', r: 'gerente', exp: Date.now() + 1e9, v: '1' })).toString('base64url');
  assert.equal(t.llamar({ action: 'pull', token: falso + '.' + firma }).code, 'AUTH');
  void payload;
  // un operario no puede convertir su token en gerente
  const [pOp, fOp] = t.ope.split('.');
  const dato = JSON.parse(Buffer.from(pOp, 'base64url').toString());
  dato.r = 'gerente';
  const manipulado = Buffer.from(JSON.stringify(dato)).toString('base64url') + '.' + fOp;
  assert.equal(t.llamar({ action: 'pull', token: manipulado }).code, 'AUTH');
  // cambiar el PIN cierra las sesiones abiertas
  t.ejecutar("guardarPin_('gerente', '9999')");
  assert.equal(t.llamar({ action: 'pull', token: t.ger }).code, 'AUTH');
});

test('operario registra producción; reenviar no duplica; el servidor fija el usuario', () => {
  const t = preparar();
  const r1 = t.llamar({ action: 'sync', token: t.ope, records: [prod({ usuario: 'gerente', anulado: true, motivo: 'x' })] });
  assert.equal(r1.results[0].status, 'ok');
  const r2 = t.llamar({ action: 'sync', token: t.ope, records: [prod({ cubetas: 99 })] });
  assert.equal(r2.results[0].status, 'dup');
  const hoja = t.hojas.get('Produccion');
  assert.equal(hoja.getLastRow(), 2);
  const pull = t.llamar({ action: 'pull', token: t.ope });
  const fila = pull.tablas.Produccion[0];
  assert.equal(fila.usuario, 'operario');
  assert.equal(fila.anulado, false);
  assert.equal(fila.cubetas, 5); // el reenvío con 99 no cambió nada
  assert.equal(fila.fecha, '2026-10-05');
  assert.equal(fila.notas, '1-2 dosis'); // texto protegido, no se volvió fecha
  assert.equal(fila.ts, 1790000000000);
});

test('operario no puede escribir ni leer finanzas', () => {
  const t = preparar();
  const venta = { entity: 'Ventas', record: { id: 'v-1', fecha: '2026-10-05', cliente_id: 'c1', total: 1000 } };
  const r = t.llamar({ action: 'sync', token: t.ope, records: [venta] });
  assert.equal(r.results[0].status, 'error');
  assert.match(r.results[0].error, /permiso/);
  const pull = t.llamar({ action: 'pull', token: t.ope });
  assert.deepEqual(Object.keys(pull.tablas).sort(), ['Config', 'Empaque', 'Lotes', 'Produccion', 'SalidasAves', 'Sanidad']);
});

test('gerente: venta, cobro, anulación con motivo y auditoría', () => {
  const t = preparar();
  const recs = [
    { entity: 'Clientes', record: { id: 'c-1', nombre: 'Tienda La Esquina', telefono: '3001234567', condicion_pago: 'semanal', limite_credito: 500000, estado: 'activo', ts: 1 } },
    { entity: 'Ventas', record: { id: 'v-1', numero: 'R-AB-0001', fecha: '2026-10-05', cliente_id: 'c-1', total: 120000, ts: 2 } },
    { entity: 'VentaItems', record: { id: 'vi-1', venta_id: 'v-1', categoria: 'AA', cubetas: 6, precio_unit: 20000, precio_lista: 21000, subtotal: 120000 } },
    { entity: 'Cobros', record: { id: 'k-1', numero: 'C-AB-0001', fecha: '2026-10-05', cliente_id: 'c-1', valor: 70000, medio: 'Nequi', ts: 3 } },
  ];
  const r = t.llamar({ action: 'sync', token: t.ger, records: recs });
  assert.deepEqual(r.results.map((x) => x.status), ['ok', 'ok', 'ok', 'ok']);
  let pull = t.llamar({ action: 'pull', token: t.ger });
  assert.equal(pull.tablas.Clientes[0].telefono, '3001234567');
  assert.equal(pull.tablas.Ventas[0].total, 120000);
  assert.equal(pull.tablas.VentaItems[0].cubetas, 6);

  // anular: edición parcial que conserva el resto de los campos
  const a = t.llamar({ action: 'sync', token: t.ger, records: [{ entity: 'Ventas', record: { id: 'v-1', anulado: true, motivo: 'Digitada dos veces' } }] });
  assert.equal(a.results[0].status, 'ok');
  pull = t.llamar({ action: 'pull', token: t.ger });
  const v = pull.tablas.Ventas[0];
  assert.equal(v.anulado, true);
  assert.equal(v.motivo, 'Digitada dos veces');
  assert.equal(v.total, 120000);
  assert.equal(v.cliente_id, 'c-1');
  assert.equal(v.usuario, 'gerente');
  const aud = t.hojas.get('Auditoria');
  assert.ok(aud.getLastRow() >= 6); // encabezado + 4 creaciones + 1 edición
  assert.equal(aud.getRange(aud.getLastRow(), 3).getValue(), 'editar');
});

test('pull incremental devuelve solo lo cambiado desde la última vez', async () => {
  const t = preparar();
  t.llamar({ action: 'sync', token: t.ope, records: [prod({ id: 'p-a' })] });
  const p1 = t.llamar({ action: 'pull', token: t.ope });
  assert.equal(p1.tablas.Produccion.length, 1);
  await new Promise((r) => setTimeout(r, 5));
  t.llamar({ action: 'sync', token: t.ope, records: [prod({ id: 'p-b', lote_id: 'lote-02' })] });
  const p2 = t.llamar({ action: 'pull', token: t.ope, since: p1.server_time });
  assert.deepEqual(p2.tablas.Produccion.map((x) => x.id), ['p-b']);
  assert.equal(p2.tablas.Lotes.length, 0);
});

test('validación: números negativos, fechas, enums e identificadores', () => {
  const t = preparar();
  const casos = [
    [prod({ id: 'p-n', cubetas: -1 }), /inválido/],
    [prod({ id: 'p-f', fecha: '05/10/2026' }), /Fecha/],
    [prod({ id: 'p-x', lote_id: '' }), /Falta/],
    [prod({ id: 'x' }), /Identificador/],
    [prod({ id: 'p ñ' }), /Identificador/],
  ];
  for (const [item, patron] of casos) {
    const r = t.llamar({ action: 'sync', token: t.ope, records: [item] });
    assert.equal(r.results[0].status, 'error');
    assert.match(r.results[0].error, patron);
  }
  const malo = t.llamar({ action: 'sync', token: t.ger, records: [{ entity: 'Cobros', record: { id: 'k-9', fecha: '2026-10-05', cliente_id: 'c', medio: 'Bitcoin', valor: 5 } }] });
  assert.match(malo.results[0].error, /no permitido/);
  assert.equal(t.llamar({ action: 'sync', token: t.ger, records: [{ entity: 'Inventada', record: { id: 'abc' } }] }).results[0].status, 'error');
  assert.equal(t.hojas.get('Produccion').getLastRow(), 1); // nada se guardó
});

test('fotos: se guarda una vez en Drive y se vincula al gasto', () => {
  const t = preparar();
  const png = Buffer.from('imagen-de-prueba').toString('base64');
  const gasto = { entity: 'Gastos', record: { id: 'g-1', fecha: '2026-10-05', categoria: 'Alimento', cantidad: 10, unidad: 'bulto', valor_total: 1000000, naturaleza: 'negocio', ts: 1, _foto: { mime: 'image/jpeg', data: png } } };
  const r = t.llamar({ action: 'sync', token: t.ger, records: [gasto] });
  assert.equal(r.results[0].status, 'ok');
  assert.match(r.results[0].foto_url, /^https:\/\/drive\.fake\//);
  assert.equal(t.archivos.length, 1);
  // reenviar el mismo gasto (reintento por mala señal) no vuelve a subir la foto
  t.llamar({ action: 'sync', token: t.ger, records: [gasto] });
  assert.equal(t.archivos.length, 1);
  const pull = t.llamar({ action: 'pull', token: t.ger });
  assert.match(pull.tablas.Gastos[0].foto_url, /drive\.fake/);
  assert.equal(pull.tablas.Gastos[0]._foto, undefined);
  // formato no permitido
  const mal = { entity: 'Gastos', record: { id: 'g-2', fecha: '2026-10-05', categoria: 'Otros', valor_total: 1, _foto: { mime: 'application/pdf', data: png } } };
  assert.equal(t.llamar({ action: 'sync', token: t.ger, records: [mal] }).results[0].status, 'error');
});

test('límite de registros por envío y acción desconocida', () => {
  const t = preparar();
  const muchos = Array.from({ length: 51 }, (_, i) => prod({ id: 'p-' + i }));
  assert.equal(t.llamar({ action: 'sync', token: t.ope, records: muchos }).code, 'LIMITE');
  assert.equal(t.llamar({ action: 'borrar-todo', token: t.ger }).code, 'ACCION');
  assert.equal(JSON.parse(t.sandbox.doGet().getContent()).ok, true);
});

test('si el servidor está ocupado responde BUSY (reintentable) y luego guarda sin duplicar', () => {
  const s = preparar();
  sandboxOcupado.valor = true;
  const r1 = s.llamar({ action: 'sync', token: s.ope, records: [prod()] });
  assert.equal(r1.ok, false);
  assert.equal(r1.code, 'BUSY');
  assert.equal(s.hojas.get('Produccion').getLastRow(), 1);
  sandboxOcupado.valor = false;
  const r2 = s.llamar({ action: 'sync', token: s.ope, records: [prod()] });
  assert.equal(r2.results[0].status, 'ok');
  assert.equal(s.hojas.get('Produccion').getLastRow(), 2);
});

test('producción con total de huevos: una hoja antigua sin la columna "huevos" la recibe sola', () => {
  const s = preparar();
  const hoja = s.hojas.get('Produccion');
  // simula la hoja creada con la versión anterior: se quita la columna 'huevos'
  const enc = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  const col = enc.indexOf('huevos') + 1;
  assert.ok(col > 0);
  hoja.deleteColumn(col);
  const r = s.llamar({ action: 'sync', token: s.ope, records: [prod({ id: 'prod-h', huevos: 187, cubetas: 0, sueltos: 0 })] });
  assert.equal(r.results[0].status, 'ok');
  const pull = s.llamar({ action: 'pull', token: s.ope });
  const fila = pull.tablas.Produccion.find((x) => x.id === 'prod-h');
  assert.equal(Number(fila.huevos), 187);
});

test('pull incremental: sin cambios responde vacío y rápido; con cambios devuelve lo nuevo', async () => {
  const t = preparar();
  const p0 = t.llamar({ action: 'pull', token: t.ger });
  assert.ok(p0.tablas.Lotes.length === 15);
  const p1 = t.llamar({ action: 'pull', token: t.ger, since: p0.server_time });
  assert.equal(p1.sin_cambios, true);
  assert.deepEqual(p1.tablas, {});
  await new Promise((r) => setTimeout(r, 5));
  t.llamar({ action: 'sync', token: t.ger, records: [{ entity: 'Clientes', record: { id: 'c-xyz1', nombre: 'Nuevo', condicion_pago: 'contado', estado: 'activo', ts: 1 } }] });
  const p2 = t.llamar({ action: 'pull', token: t.ger, since: p0.server_time });
  assert.ok(!p2.sin_cambios);
  assert.equal(p2.tablas.Clientes.length, 1);
});
