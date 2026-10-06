// Pantallas de campo: producción por lote, bodega y sanidad. Sin precios ni dinero.
import { h, tarjeta, campo, stepper, fichas, selector, boton, confirmar, aviso, toast, aviso_caja, insignia } from '../ui.js';
import { hoyISO, addDias, fmtFecha, fmtNum, num, activo, huevos, avesVivas, cruceBodega, resumenDia, retirosActivos, CATEGORIAS, COL_CAT } from '../calc.js';
import { crear } from '../datos.js';

const selFecha = (inicial, onChange) => {
  const hoy = hoyISO();
  return fichas([{ valor: hoy, texto: 'Hoy' }, { valor: addDias(hoy, -1), texto: 'Ayer' }], { valor: inicial, onChange });
};

export function inicio(d, ctx) {
  const hoy = hoyISO();
  const r = resumenDia(d.produccion, d.empaque, hoy);
  const total = d.lotes.filter((l) => l.estado !== 'descartado').length;
  const cruce = cruceBodega(d.produccion, d.empaque, hoy);
  const retiros = retirosActivos(d.sanidad, d.lotes, hoy);
  return h('div', {},
    h('h1', {}, 'Hoy · ' + fmtFecha(hoy)),
    retiros.length ? aviso_caja('⚠️ Huevos en retiro por medicamento: ' + retiros.map((x) => x.lote).join(', '), 'amarillo') : null,
    h('div', { class: 'rejilla' },
      h('a', { class: 'boton-grande principal ancho', href: '#/produccion' }, h('span', { class: 'emoji' }, '🥚'), h('span', {}, 'Producción del galpón', h('div', { class: 'suave', style: 'color:#fff' }, `${r.lotesRegistrados} de ${total} lotes hoy`))),
      h('a', { class: 'boton-grande', href: '#/bodega' }, h('span', { class: 'emoji' }, '📦'), 'Bodega'),
      h('a', { class: 'boton-grande', href: '#/sanidad' }, h('span', { class: 'emoji' }, '💊'), 'Sanidad')),
    h('h2', {}, 'Lo de hoy'),
    tarjeta(
      h('div', { class: 'kpis' },
        kpi('Huevos recogidos', fmtNum(r.huevosRecibidos, 0)),
        kpi('Cubetas empacadas', fmtNum(r.cubetasEmpacadas, 0)),
        kpi('Rotos (galpón + bodega)', fmtNum(r.rotosGalpon + r.rotosBodega, 0)),
        kpi('Bajas (aves)', fmtNum(r.bajas, 0))),
      Math.abs(cruce.diferencia) > 5 ? aviso_caja(`Faltan por clasificar o contar ${fmtNum(cruce.diferencia, 0)} huevos entre galpón y bodega.`, 'amarillo') : null));
}

const kpi = (nombre, valor, clase = '') => h('div', { class: 'kpi ' + clase }, h('div', { class: 'valor' }, valor), h('div', { class: 'nombre' }, nombre));

export function listaLotes(d) {
  const hoy = hoyISO();
  return h('div', {},
    h('h1', {}, '¿Qué lote?'),
    h('ul', { class: 'lista' }, d.lotes.filter((l) => l.estado !== 'descartado').map((l) => {
      const regs = d.produccion.filter((p) => activo(p) && p.lote_id === l.id && p.fecha === hoy);
      const huev = regs.reduce((a, p) => a + huevos(p.cubetas, p.sueltos), 0);
      return h('li', {}, h('a', { class: 'item', href: '#/produccion/' + l.id },
        h('div', {}, h('div', { class: 'grande' }, l.nombre), h('div', { class: 'suave' }, `${fmtNum(avesVivas(l, bajasDe(d, l.id)), 0)} aves`)),
        h('div', { class: 'derecha' }, regs.length ? h('span', { class: 'estado-ok' }, `✓ ${fmtNum(huev, 0)} huevos`) : h('span', { class: 'estado-falta' }, 'Falta'))));
    })));
}

const bajasDe = (d, loteId) => d.produccion.filter((p) => activo(p) && p.lote_id === loteId).reduce((a, p) => a + num(p.bajas), 0);

export function formProduccion(d, loteId, ctx) {
  const lote = d.lotes.find((l) => l.id === loteId);
  if (!lote) return h('div', {}, aviso_caja('Lote no encontrado', 'rojo'));
  let fecha = hoyISO();
  const cubetas = stepper({ min: 0, max: 200 });
  const sueltos = stepper({ min: 0, max: 29 });
  const rotos = stepper({ min: 0, max: 500 });
  const bajas = stepper({ min: 0, max: 200 });
  const alimento = stepper({ min: 0, max: 500, paso: 1, decimales: 1 });
  const notas = h('input', { class: 'input', type: 'text', placeholder: 'Opcional (ej. llovió, se escapó una gallina)', maxlength: 200 });
  const vivas = avesVivas(lote, bajasDe(d, lote.id));

  const guardar = async () => {
    const c = cubetas.get(); const s = sueltos.get(); const r = rotos.get(); const b = bajas.get(); const a = alimento.get();
    if (!c && !s && !r && !b && !a) { aviso('Todo está en cero. Si hoy no hubo nada, igual toca anotar al menos el alimento o las bajas.'); return; }
    const total = huevos(c, s) + r;
    const avisos = [];
    if (vivas > 0 && total > vivas) avisos.push(`Anotaste ${total} huevos y el lote tiene ${vivas} aves: es más de 1 huevo por ave.`);
    const previos = d.produccion.filter((p) => activo(p) && p.lote_id === lote.id && p.fecha < fecha).sort((x, y) => y.fecha.localeCompare(x.fecha)).slice(0, 7);
    if (previos.length >= 3 && vivas > 0) {
      const prom = previos.reduce((acc, p) => acc + huevos(p.cubetas, p.sueltos) + num(p.rotos_galpon), 0) / previos.length;
      if (prom > 0 && total < prom * 0.6) avisos.push(`Es mucho menos de lo normal (normalmente ~${Math.round(prom)} huevos).`);
      if (prom > 0 && total > prom * 1.4) avisos.push(`Es mucho más de lo normal (normalmente ~${Math.round(prom)} huevos).`);
    }
    if (b >= 5) avisos.push(`${b} aves muertas en un día es mucho. Revisa el lote.`);
    if (a > 0 && vivas > 0 && (a * 1000) / vivas > 160) avisos.push(`${a} kg de alimento son más de 160 g por ave.`);
    const repetido = d.produccion.some((p) => activo(p) && p.lote_id === lote.id && p.fecha === fecha);
    if (repetido) avisos.push('Este lote ya tiene un registro en esa fecha; este se SUMA al anterior.');
    const resumen = `${lote.nombre} · ${fecha === hoyISO() ? 'hoy' : 'ayer'}\n\n🥚 ${c} cubetas y ${s} sueltos\n💔 ${r} rotos en el galpón\n🐔 ${b} bajas\n🌾 ${fmtNum(a, 1)} kg de alimento`;
    const ok = await confirmar((avisos.length ? '⚠️ ' + avisos.join('\n⚠️ ') + '\n\n' : '') + resumen + '\n\n¿Guardar?', { si: 'Sí, guardar' });
    if (!ok) return;
    await crear('Produccion', 'pr', { fecha, lote_id: lote.id, cubetas: c, sueltos: s, rotos_galpon: r, bajas: b, alimento_kg: a, notas: notas.value.trim() });
    toast('✓ Guardado');
    ctx.ir('#/produccion');
  };

  return h('div', {},
    h('h1', {}, lote.nombre),
    h('p', { class: 'suave' }, `${fmtNum(vivas, 0)} aves vivas`),
    campo('¿Qué día?', selFecha(fecha, (v) => { fecha = v; })),
    campo('Cubetas completas recogidas', cubetas),
    campo('Huevos sueltos (los que no completan cubeta)', sueltos),
    campo('Huevos rotos en el galpón', rotos),
    campo('Gallinas muertas (bajas)', bajas),
    campo('Alimento dado (kilos)', alimento, 'Un bulto son 40 kilos.'),
    campo('Notas', notas),
    boton('Guardar', guardar, { clase: 'verde' }));
}

export function formBodega(d, ctx) {
  let fecha = hoyISO();
  const cat = Object.fromEntries(CATEGORIAS.map((c) => [c, stepper({ min: 0, max: 5000 })]));
  const sueltos = stepper({ min: 0, max: 29 });
  const rotos = stepper({ min: 0, max: 1000 });
  const descarte = stepper({ min: 0, max: 1000 });
  const notas = h('input', { class: 'input', type: 'text', placeholder: 'Opcional', maxlength: 200 });
  const hoy = hoyISO();
  const rd = resumenDia(d.produccion, d.empaque, hoy);

  const guardar = async () => {
    const vals = Object.fromEntries(CATEGORIAS.map((c) => [COL_CAT[c], cat[c].get()]));
    const totalCub = Object.values(vals).reduce((a, b) => a + b, 0);
    if (!totalCub && !rotos.get() && !descarte.get() && !sueltos.get()) { aviso('Todo está en cero.'); return; }
    const simulado = [...d.empaque, { ...vals, sueltos_bodega: sueltos.get(), rotos_bodega: rotos.get(), descarte: descarte.get(), fecha, id: 'x' }];
    const cruce = cruceBodega(d.produccion, simulado, fecha);
    const avisos = [];
    if (Math.abs(cruce.diferencia) > 10) avisos.push(`Con esto, los huevos de galpón y bodega no cuadran (diferencia de ${fmtNum(cruce.diferencia, 0)}). Puede que falte registrar producción o empaque.`);
    const detalle = CATEGORIAS.filter((c) => cat[c].get()).map((c) => `${cat[c].get()} ${c}`).join(' · ') || 'ninguna cubeta';
    const ok = await confirmar((avisos.length ? '⚠️ ' + avisos.join('\n⚠️ ') + '\n\n' : '') + `Empacadas: ${detalle}\nRotos: ${rotos.get()} · Descarte: ${descarte.get()} · Sueltos: ${sueltos.get()}\n\n¿Guardar?`, { si: 'Sí, guardar' });
    if (!ok) return;
    await crear('Empaque', 'em', { fecha, ...vals, sueltos_bodega: sueltos.get(), rotos_bodega: rotos.get(), descarte: descarte.get(), notas: notas.value.trim() });
    toast('✓ Guardado');
    ctx.ir('#/');
  };

  return h('div', {},
    h('h1', {}, 'Bodega · empaque'),
    aviso_caja(`Hoy llegaron del galpón ${fmtNum(rd.huevosRecibidos, 0)} huevos (≈ ${fmtNum(rd.huevosRecibidos / 30, 1)} cubetas).`, 'info'),
    campo('¿Qué día?', selFecha(fecha, (v) => { fecha = v; })),
    tarjeta(h('h3', {}, 'Cubetas empacadas por categoría'),
      CATEGORIAS.map((c) => h('div', { class: 'linea-categoria' }, h('div', { class: 'cat-nombre' }, c), cat[c]))),
    campo('Huevos que quedaron sin empacar', sueltos),
    campo('Rotos en bodega', rotos),
    campo('Descarte (sucios, defectuosos)', descarte),
    campo('Notas', notas),
    boton('Guardar', guardar, { clase: 'verde' }));
}

export function formSanidad(d, ctx) {
  const hoy = hoyISO();
  const lote = selector(d.lotes.map((l) => ({ valor: l.id, texto: l.nombre })), { vacio: 'Todos los lotes' });
  const producto = h('input', { class: 'input', type: 'text', placeholder: 'Ej. Vitamina, vacuna, antibiótico', maxlength: 100 });
  const dosis = h('input', { class: 'input', type: 'text', placeholder: 'Ej. 1 ml por litro', maxlength: 100 });
  const retiro = stepper({ min: 0, max: 60 });
  const notas = h('input', { class: 'input', type: 'text', placeholder: 'Opcional', maxlength: 200 });
  const guardar = async () => {
    if (!producto.value.trim()) { producto.classList.add('error'); aviso('Escribe qué producto se aplicó.'); return; }
    const dias = retiro.get();
    const ok = await confirmar(`${lote.selectedOptions[0].textContent}\n${producto.value.trim()}${dosis.value ? ' · ' + dosis.value : ''}\n${dias ? 'Retiro: no vender huevo por ' + dias + ' día(s)' : 'Sin días de retiro'}\n\n¿Guardar?`, { si: 'Sí, guardar' });
    if (!ok) return;
    await crear('Sanidad', 'sa', { fecha: hoy, lote_id: lote.value, producto: producto.value.trim(), dosis: dosis.value.trim(), retiro_dias: dias, retiro_hasta: dias ? addDias(hoy, dias) : '', notas: notas.value.trim() });
    toast('✓ Guardado');
    ctx.ir('#/');
  };
  const activos = retirosActivos(d.sanidad, d.lotes, hoy);
  return h('div', {},
    h('h1', {}, 'Sanidad'),
    activos.length ? tarjeta(h('h3', {}, 'En retiro ahora'), activos.map((a) => h('div', {}, `${a.lote}: ${a.producto} hasta ${fmtFecha(a.retiro_hasta)}`))) : null,
    campo('Lote', lote), campo('Producto', producto), campo('Dosis', dosis),
    campo('Días de retiro', retiro, 'Días que NO se pueden vender los huevos. Si no sabes, mira la etiqueta del producto.'),
    campo('Notas', notas),
    boton('Guardar', guardar, { clase: 'verde' }));
}
