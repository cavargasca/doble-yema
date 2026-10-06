// Gerencia: gallinas nuevas en un lote (tandas) e historial de todas las tandas.
// Un lote es el corral fijo (1 al 15). Una tanda son las gallinas que entran a ese lote en una fecha.
import { h, tarjeta, campo, stepper, dinero, fichas, selector, boton, confirmar, aviso, toast, aviso_caja } from '../ui.js';
import { hoyISO, addDias, fmtCOP, fmtNum, fmtPct, fmtFecha, num, activo, tandaEn, tandasDe, avesDelLote, vivasTanda, edadSemanas, historialTandas, CAT_INVERSION } from '../calc.js';
import { crear, guardarCompleto } from '../datos.js';
import { nuevoId } from '../store.js';

const MEDIOS = ['Efectivo', 'Nequi', 'Daviplata', 'Banco'];
const EDAD_LLEGADA = 18; // las pollitas llegan de 18 semanas

const campoFecha = (valor) => h('input', { class: 'input', type: 'date', value: valor, max: hoyISO() });

function infoLote(d, l) {
  const hoy = hoyISO();
  const t = tandaEn(d, l.id, hoy);
  const vivas = avesDelLote(d, l, hoy);
  if (!t || vivas === 0) return 'Vacío';
  const sem = edadSemanas(t, hoy);
  return `${fmtNum(vivas, 0)} aves` + (sem !== null ? ` · ${sem} semanas` : '');
}

// Paso 1: elegir el lote.
export function elegirLote(d) {
  const lotes = d.lotes.filter((l) => l.estado !== 'descartado');
  return h('div', {}, h('h1', {}, 'Gallinas nuevas'),
    h('p', { class: 'suave' }, '¿En qué lote entran las gallinas nuevas? Antes de entrar, el lote debe estar vacío (las anteriores ya vendidas o retiradas).'),
    h('ul', { class: 'lista' }, lotes.map((l) => h('li', {}, h('a', { class: 'item', href: '#/cambio-gallinas/' + l.id },
      h('div', {}, h('div', { class: 'grande' }, l.nombre), h('div', { class: 'suave' }, infoLote(d, l))), h('div', { class: 'derecha' }, '›'))))));
}

// Fecha en que salió el último ave de la tanda (o el último registro de producción).
function ultimoMovimiento(d, t) {
  const fs = [t.fecha_ingreso];
  for (const p of d.produccion) if (activo(p) && p.lote_id === t.lote_id && p.fecha >= t.fecha_ingreso && (!t.fecha_cierre || p.fecha <= t.fecha_cierre)) fs.push(p.fecha);
  for (const s of d.salidasAves || []) if (activo(s) && s.lote_id === t.lote_id && s.fecha >= t.fecha_ingreso) fs.push(s.fecha);
  return fs.sort().at(-1);
}

// Paso 2: registrar la tanda nueva (y cerrar la anterior).
export function formCambio(d, loteId, ctx) {
  const lote = d.lotes.find((l) => l.id === loteId);
  if (!lote) return h('div', {}, aviso_caja('Lote no encontrado.', 'rojo'));
  const hoy = hoyISO();
  const actual = tandasDe(d, lote.id).filter((t) => !t.fecha_cierre).at(-1) || null;
  const vivasHoy = actual ? vivasTanda(d, actual) : 0;
  let medio = 'Efectivo'; let registrarGasto = true;
  const fecha = campoFecha(hoy);
  const cant = stepper({ min: 1, max: 1000, valor: 200 });
  const costo = dinero({ valor: num(d.cfg.costo_ave) || 27000 });
  const edad = stepper({ min: 0, max: 60, valor: EDAD_LLEGADA });
  const provs = [...d.proveedores].sort((a, b) => (/gallina/i.test(b.tipo || '') ? 1 : 0) - (/gallina/i.test(a.tipo || '') ? 1 : 0));
  const selProv = selector(provs.map((p) => ({ valor: p.id, texto: p.nombre + (p.tipo ? ` (${p.tipo})` : '') })), { vacio: 'Sin proveedor' });
  const total = h('div', { class: 'grande', style: 'margin:6px 0' });
  const pintarTotal = () => { total.textContent = `Inversión: ${fmtCOP(cant.get() * costo.get())}`; };
  cant.addEventListener('input', pintarTotal); costo.addEventListener('input', pintarTotal); pintarTotal();
  const notas = h('input', { class: 'input', type: 'text', placeholder: 'Opcional', maxlength: 200 });

  const guardar = async () => {
    const ingreso = fecha.value;
    if (!ingreso) { fecha.classList.add('error'); aviso('Falta la fecha en que llegaron.'); return; }
    if (actual && ingreso <= actual.fecha_ingreso) { aviso(`La tanda anterior entró el ${fmtFecha(actual.fecha_ingreso)}; la nueva debe ser posterior.`); return; }
    if (actual && ingreso <= ultimoMovimiento(d, actual) && ultimoMovimiento(d, actual) > actual.fecha_ingreso) { aviso(`La tanda anterior tuvo movimientos hasta el ${fmtFecha(ultimoMovimiento(d, actual))} (producción, bajas o ventas). Las gallinas nuevas deben llegar después de esa fecha.`); return; }
    if (!costo.get()) { costo.querySelector('input').classList.add('error'); aviso('Escribe cuánto costó cada gallina.'); return; }
    const avisos = [];
    if (vivasHoy > 0) avisos.push(`Este lote aún tiene ${vivasHoy} gallinas registradas. Se anotarán como salida sin venta. Si las vendiste, primero regístralas en "Vender gallinas".`);
    if (cant.get() !== 200) avisos.push(`Normalmente entran 200 gallinas y anotaste ${cant.get()}.`);
    const c = costo.get(); const base = num(d.cfg.costo_ave) || 27000;
    if (c < base * 0.6 || c > base * 1.5) avisos.push(`El costo por gallina (${fmtCOP(c)}) se ve distinto al habitual (${fmtCOP(base)}).`);
    const ok = await confirmar((avisos.length ? '⚠️ ' + avisos.join('\n⚠️ ') + '\n\n' : '') +
      `Entran ${cant.get()} gallinas a ${lote.nombre} el ${fmtFecha(ingreso)}.\nCosto ${fmtCOP(c)} c/u = ${fmtCOP(cant.get() * c)}.\n${actual ? 'La tanda anterior se cierra y queda en el historial.\n' : ''}\n¿Guardar?`, { si: 'Sí, guardar' });
    if (!ok) return;
    const ayer = addDias(ingreso, -1);
    if (actual) {
      if (vivasHoy > 0) await crear('SalidasAves', 'sa', { fecha: ayer, lote_id: lote.id, cantidad: vivasHoy, causa: 'recambio', notas: 'Cierre de tanda al entrar gallinas nuevas' });
      const cierre = vivasHoy > 0 ? ayer : [ultimoMovimiento(d, actual), ayer].sort()[0];
      const { _pendiente, virtual, ...base0 } = actual;
      await guardarCompleto('Tandas', { ...base0, id: virtual ? nuevoId('ta') : actual.id, lote_id: lote.id, fecha_cierre: cierre < actual.fecha_ingreso ? actual.fecha_ingreso : cierre, estado: 'cerrada', ts: Date.now() });
    }
    const nueva = { id: nuevoId('ta'), lote_id: lote.id, fecha_ingreso: ingreso, aves: cant.get(), costo_ave: c, proveedor_id: selProv.value, edad_ingreso_sem: edad.get(), fecha_cierre: '', estado: 'activa', notas: notas.value.trim(), ts: Date.now() };
    await guardarCompleto('Tandas', nueva);
    if (registrarGasto) {
      await crear('Gastos', 'ga', { fecha: ingreso, proveedor_id: selProv.value, categoria: CAT_INVERSION, descripcion: `Compra de ${cant.get()} gallinas · ${lote.nombre}`, cantidad: cant.get(), unidad: 'unidad', valor_total: cant.get() * c, medio_pago: medio, naturaleza: 'negocio', lote_id: lote.id });
    }
    toast('✓ Gallinas nuevas registradas'); ctx.ir('#/tandas');
  };

  return h('div', {}, h('h1', {}, 'Gallinas nuevas · ' + lote.nombre),
    actual ? aviso_caja(vivasHoy > 0 ? `Hoy el lote tiene ${fmtNum(vivasHoy, 0)} gallinas (${infoLote(d, lote)}). Al guardar, esta tanda se cierra.` : 'El lote está vacío: la tanda anterior se cierra al guardar.', vivasHoy > 0 ? 'amarillo' : 'info') : aviso_caja('Este lote aún no tiene gallinas registradas.', 'info'),
    campo('¿Qué día llegaron?', fecha), campo('¿Cuántas gallinas?', cant), campo('Costo por gallina', costo), total,
    campo('Edad al llegar (semanas)', edad, 'Normalmente llegan de 18 semanas y empiezan a poner hacia las 22. De aquí sale la edad que se muestra en cada lote.'),
    campo('Proveedor', selProv),
    campo('¿Registrar también la compra como gasto?', fichas([{ valor: 'si', texto: 'Sí, registrar' }, { valor: 'no', texto: 'No, ya está' }], { valor: 'si', onChange: (v) => { registrarGasto = v === 'si'; } })),
    campo('¿Con qué se pagó?', fichas(MEDIOS, { valor: medio, onChange: (v) => { medio = v; } })),
    campo('Notas', notas),
    boton('Guardar gallinas nuevas', guardar, { clase: 'verde' }));
}

// Corregir los datos de una tanda (por ejemplo, cargar los datos iniciales de un lote).
export function formEditarTanda(d, id, ctx) {
  const hist = historialTandas(d, d.cfg).find((x) => x.tanda.id === id);
  if (!hist) return h('div', {}, aviso_caja('Tanda no encontrada.', 'rojo'));
  const t = hist.tanda;
  const fecha = campoFecha(t.fecha_ingreso === '0000-01-01' ? '' : t.fecha_ingreso);
  const cant = stepper({ min: 1, max: 1000, valor: num(t.aves) || 200 });
  const costo = dinero({ valor: num(t.costo_ave) || num(d.cfg.costo_ave) || 27000 });
  const edad = stepper({ min: 0, max: 60, valor: t.edad_ingreso_sem === '' ? EDAD_LLEGADA : num(t.edad_ingreso_sem) });
  const notas = h('input', { class: 'input', type: 'text', maxlength: 200, value: t.notas || '' });
  return h('div', {}, h('h1', {}, `Datos de la tanda · ${hist.lote.nombre}`),
    h('p', { class: 'suave' }, 'Corrige los datos de estas gallinas. No cambia la producción ya registrada.'),
    campo('Fecha en que llegaron', fecha), campo('Gallinas que entraron', cant), campo('Costo por gallina', costo), campo('Edad al llegar (semanas)', edad), campo('Notas', notas),
    boton('Guardar', async () => {
      if (!fecha.value) { fecha.classList.add('error'); aviso('Falta la fecha en que llegaron.'); return; }
      const { _pendiente, virtual, ...base } = t;
      await guardarCompleto('Tandas', { ...base, id: virtual ? nuevoId('ta') : t.id, lote_id: t.lote_id, fecha_ingreso: fecha.value, aves: cant.get(), costo_ave: costo.get(), edad_ingreso_sem: edad.get(), estado: t.fecha_cierre ? 'cerrada' : 'activa', notas: notas.value.trim(), ts: Date.now() });
      toast('✓ Guardado'); ctx.ir('#/tandas');
    }, { clase: 'verde' }));
}

const fila = (n, v) => h('tr', {}, h('td', { class: 'suave' }, n), h('td', { style: 'text-align:right; font-weight:700' }, v));

// Historial: todas las tandas de todos los lotes, con su resultado.
export function historial(d) {
  const hist = historialTandas(d, d.cfg);
  const tarjetaTanda = (x) => {
    const titulo = h('div', { class: 'fila entre' }, h('h3', { style: 'margin:0' }, `${x.lote.nombre} · ${x.tanda.fecha_ingreso === '0000-01-01' ? 'sin fecha de ingreso' : 'desde ' + fmtFecha(x.tanda.fecha_ingreso)}`),
      h('span', { class: x.cerrada ? 'suave' : x.vacia ? 'estado-falta' : 'estado-ok' }, x.cerrada ? 'Cerrada' : x.vacia ? 'Vacía' : 'Activa'));
    const resumen = h('div', { class: 'suave' }, `${fmtNum(x.aves, 0)} aves${x.edadSem !== null ? ` · ${x.edadSem} semanas${x.cerrada ? ' al cerrar' : ''}` : ''}${x.cerrada ? ` · cerró ${fmtFecha(x.tanda.fecha_cierre)}` : x.vacia ? '' : ` · hoy ${fmtNum(x.vivas, 0)} vivas`}`);
    const editar = h('a', { class: 'btn secundario chico', href: '#/tandas/' + x.tanda.id, style: 'margin-top:10px' }, '✏️ Corregir datos');
    // Sin producción ni ventas todavía: tarjeta corta para no llenar la pantalla.
    if (!x.huevos && !x.recuperado && !x.cerrada) return tarjeta(titulo, resumen, h('div', { class: 'suave' }, 'Aún sin producción registrada.'), editar);
    return tarjeta(titulo, resumen,
      h('table', { class: 'tabla', style: 'margin-top:8px' }, h('tbody', {},
        fila('Huevos producidos', fmtNum(x.huevos, 0)), fila('Postura promedio', fmtPct(x.postura, 0)),
        fila('Mortalidad', x.mortalidadPct === null ? '–' : fmtPct(x.mortalidadPct, 1)), fila('Alimento por ave', x.gAveDia ? fmtNum(x.gAveDia, 0) + ' g/día' : '–'),
        fila('Invertido en aves', fmtCOP(x.invertido)), fila('Recuperado vendiendo', fmtCOP(x.recuperado) + (x.recuperadoPct !== null ? ` (${fmtNum(x.recuperadoPct, 0)} %)` : '')),
        fila('Costo neto de las aves', fmtCOP(x.neto)), fila('Costo de aves por huevo', x.costoAveHuevo ? fmtCOP(x.costoAveHuevo) : '–'))),
      editar);
  };
  return h('div', {}, h('h1', {}, 'Historial de gallinas'),
    h('p', { class: 'suave' }, 'Cada vez que entran gallinas nuevas a un lote empieza una tanda. Aquí ves cómo le fue a cada una.'),
    h('a', { class: 'boton-grande', href: '#/cambio-gallinas' }, h('span', { class: 'emoji' }, '🐔'), 'Entran gallinas nuevas'),
    hist.length ? hist.map(tarjetaTanda) : aviso_caja('Aún no hay gallinas registradas. Carga los lotes en la hoja o usa "Entran gallinas nuevas".', 'info'));
}
