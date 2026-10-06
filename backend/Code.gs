/**
 * Doble Yema · API (Google Apps Script)
 * La hoja de cálculo es la base de datos. Este script la expone como una API
 * protegida con PIN y token firmado, para la app instalable (PWA).
 *
 * Pasos de instalación: ver docs/INSTALACION.md
 */

const VERSION = '0.1.3';
const TOKEN_DIAS = 30;
const MAX_FALLOS = 5;
const BLOQUEO_SEG = 600;
const MAX_REGISTROS_POR_LOTE = 50;
const USUARIOS = ['operario', 'gerente'];
const CATEGORIAS_HUEVO = ['B', 'A', 'AA', 'AAA', 'JUMBO'];

const OP = ['operario', 'gerente'];
const GER = ['gerente'];

// Cada hoja: columnas, quién lee, quién escribe y reglas de validación.
// nums = columnas numéricas (>= 0). Las demás se guardan como texto.
const SCHEMA = {
  Config: { cols: ['id', 'value', 'nota'], read: OP, write: GER, req: ['id'] },
  Lotes: {
    cols: ['id', 'nombre', 'aves_iniciales', 'fecha_ingreso', 'estado', 'notas'],
    nums: ['aves_iniciales'], fechas: ['fecha_ingreso'], enums: { estado: ['activo', 'descartado'] },
    read: OP, write: GER, req: ['id', 'nombre'],
  },
  Produccion: {
    cols: ['id', 'fecha', 'lote_id', 'huevos', 'cubetas', 'sueltos', 'rotos_galpon', 'bajas', 'alimento_kg', 'notas', 'usuario', 'ts', 'anulado', 'motivo'],
    nums: ['huevos', 'cubetas', 'sueltos', 'rotos_galpon', 'bajas', 'alimento_kg', 'ts'], fechas: ['fecha'],
    read: OP, write: OP, soloCrear: true, req: ['id', 'fecha', 'lote_id'],
  },
  Empaque: {
    cols: ['id', 'fecha', 'b', 'a', 'aa', 'aaa', 'jumbo', 'sueltos_bodega', 'rotos_bodega', 'descarte', 'notas', 'usuario', 'ts', 'anulado', 'motivo'],
    nums: ['b', 'a', 'aa', 'aaa', 'jumbo', 'sueltos_bodega', 'rotos_bodega', 'descarte', 'ts'], fechas: ['fecha'],
    read: OP, write: OP, soloCrear: true, req: ['id', 'fecha'],
  },
  Sanidad: {
    cols: ['id', 'fecha', 'lote_id', 'producto', 'dosis', 'retiro_dias', 'retiro_hasta', 'notas', 'usuario', 'ts', 'anulado', 'motivo'],
    nums: ['retiro_dias', 'ts'], fechas: ['fecha', 'retiro_hasta'],
    read: OP, write: OP, soloCrear: true, req: ['id', 'fecha', 'producto'],
  },
  Clientes: {
    cols: ['id', 'nombre', 'telefono', 'direccion', 'zona', 'condicion_pago', 'limite_credito', 'estado', 'notas', 'ts'],
    nums: ['limite_credito', 'ts'], enums: { condicion_pago: ['contado', 'semanal', 'mensual'], estado: ['activo', 'inactivo'] },
    read: GER, write: GER, req: ['id', 'nombre'],
  },
  Precios: {
    cols: ['id', 'cliente_id', 'categoria', 'desde_cantidad', 'precio', 'vigente_desde', 'usuario', 'ts', 'anulado'],
    nums: ['desde_cantidad', 'precio', 'ts'], fechas: ['vigente_desde'], enums: { categoria: CATEGORIAS_HUEVO },
    read: GER, write: GER, req: ['id', 'categoria', 'vigente_desde'],
  },
  Ventas: {
    cols: ['id', 'numero', 'fecha', 'cliente_id', 'total', 'notas', 'usuario', 'ts', 'anulado', 'motivo'],
    nums: ['total', 'ts'], fechas: ['fecha'], read: GER, write: GER, req: ['id', 'fecha', 'cliente_id'],
  },
  VentaItems: {
    cols: ['id', 'venta_id', 'categoria', 'cubetas', 'precio_unit', 'precio_lista', 'subtotal', 'anulado'],
    nums: ['cubetas', 'precio_unit', 'precio_lista', 'subtotal'], enums: { categoria: CATEGORIAS_HUEVO },
    read: GER, write: GER, req: ['id', 'venta_id', 'categoria'],
  },
  Cobros: {
    cols: ['id', 'numero', 'fecha', 'cliente_id', 'valor', 'medio', 'notas', 'usuario', 'ts', 'anulado', 'motivo'],
    nums: ['valor', 'ts'], fechas: ['fecha'], enums: { medio: ['Efectivo', 'Nequi', 'Daviplata', 'Banco'] },
    read: GER, write: GER, req: ['id', 'fecha', 'cliente_id', 'medio'],
  },
  Reposiciones: {
    cols: ['id', 'fecha', 'venta_id', 'cliente_id', 'categoria', 'huevos', 'tipo', 'notas', 'usuario', 'ts', 'anulado', 'motivo'],
    nums: ['huevos', 'ts'], fechas: ['fecha'], enums: { categoria: CATEGORIAS_HUEVO, tipo: ['entrega', 'devolucion'] },
    read: GER, write: GER, req: ['id', 'fecha', 'cliente_id', 'categoria'],
  },
  SalidasAves: {
    cols: ['id', 'fecha', 'lote_id', 'cantidad', 'causa', 'notas', 'usuario', 'ts', 'anulado', 'motivo'],
    nums: ['cantidad', 'ts'], fechas: ['fecha'], enums: { causa: ['enfermedad', 'recambio'] },
    read: OP, write: GER, req: ['id', 'fecha', 'lote_id'],
  },
  VentasAves: {
    cols: ['id', 'fecha', 'salida_id', 'lote_id', 'cantidad', 'precio_unit', 'total', 'comprador', 'medio', 'notas', 'usuario', 'ts', 'anulado', 'motivo'],
    nums: ['cantidad', 'precio_unit', 'total', 'ts'], fechas: ['fecha'], enums: { medio: ['Efectivo', 'Nequi', 'Daviplata', 'Banco'] },
    read: GER, write: GER, req: ['id', 'fecha', 'lote_id'],
  },
  Proveedores: {
    cols: ['id', 'nombre', 'telefono', 'tipo', 'notas'], read: GER, write: GER, req: ['id', 'nombre'],
  },
  Gastos: {
    cols: ['id', 'fecha', 'proveedor_id', 'categoria', 'descripcion', 'cantidad', 'unidad', 'valor_total', 'medio_pago', 'naturaleza', 'foto_url', 'lote_id', 'usuario', 'ts', 'anulado', 'motivo'],
    nums: ['cantidad', 'valor_total', 'ts'], fechas: ['fecha'], enums: { naturaleza: ['negocio', 'retiro'] },
    read: GER, write: GER, req: ['id', 'fecha', 'categoria'],
  },
};
const AUDITORIA_COLS = ['ts', 'usuario', 'accion', 'entidad', 'id', 'detalle'];

const CONFIG_INICIAL = [
  ['nombre_negocio', 'Doble Yema', 'Nombre que aparece en recibos y mensajes'],
  ['huevos_por_cubeta', '30', 'Huevos por cubeta'],
  ['kg_por_bulto', '40', 'Kilos por bulto de alimento'],
  ['alimento_inicial_kg', '0', 'Kilos de alimento en bodega el día que empezaste a usar el sistema'],
  ['cubetas_vacias_inicial', '0', 'Cubetas vacías en bodega el día que empezaste a usar el sistema'],
  ['amortizacion_aves_mensual', '0', 'Costo mensual de las aves repartido en su vida productiva (pesos)'],
  ['umbral_cliente_anterior_dias', '30', 'Días sin comprar para considerar "cliente anterior"'],
  ['margen_minimo_pct', '10', 'Margen mínimo esperado por cubeta (alerta si el precio queda por debajo)'],
  ['costo_ave', '27000', 'Lo que cuesta cada gallina al comprarla (pesos)'],
  ['precio_gallina_descarte', '20000', 'Precio habitual al vender una gallina de descarte (pesos)'],
  ['meses_vida_ave', '0', 'Meses de vida productiva de una gallina. Si pones un número, el costo de las aves se reparte automáticamente (0 = no calcular)'],
  ['saldo_inicial_Efectivo', '0', 'Efectivo en caja el día que empezaste a usar el sistema'],
  ['saldo_inicial_Nequi', '0', 'Saldo de Nequi el día de inicio'],
  ['saldo_inicial_Daviplata', '0', 'Saldo de Daviplata el día de inicio'],
  ['saldo_inicial_Banco', '0', 'Saldo de la cuenta bancaria el día de inicio'],
  ['categorias_gasto', 'Alimento,Piedra cal y suplementos,Cubetas (empaque),Vitaminas y medicinas,Mano de obra,Servicios,Transporte,Mantenimiento,Aves (inversión),Otros', 'Lista de categorías de gasto, separadas por coma'],
  ['unidades', 'bulto,kg,unidad,ml,g,dosis', 'Unidades para gastos'],
];

// ---------------------------------------------------------------- entrada web

function doGet() {
  return json_({ ok: true, servicio: 'Doble Yema API', version: VERSION });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'Solicitud inválida' });
  }
  try {
    switch (req.action) {
      case 'ping':
        return json_({ ok: true, version: VERSION });
      case 'login':
        return json_(login_(req));
      case 'sync': {
        const auth = auth_(req.token);
        const lista = Array.isArray(req.records) ? req.records : [];
        if (lista.length > MAX_REGISTROS_POR_LOTE) throw errorCodigo_('Demasiados registros en un solo envío', 'LIMITE');
        return json_({ ok: true, results: sync_(auth, lista) });
      }
      case 'pull': {
        const auth = auth_(req.token);
        return json_(Object.assign({ ok: true }, pull_(auth, req.since)));
      }
      default:
        throw errorCodigo_('Acción desconocida', 'ACCION');
    }
  } catch (err) {
    return json_({ ok: false, error: err.message || String(err), code: err.codigo || '' });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function errorCodigo_(mensaje, codigo) {
  const e = new Error(mensaje);
  e.codigo = codigo;
  return e;
}

// ----------------------------------------------------------------- seguridad

function bytesAHex_(bytes) {
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function hashPin_(salt, pin) {
  return bytesAHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + pin, Utilities.Charset.UTF_8));
}

function secreto_() {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty('SECRET');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('SECRET', s);
  }
  return s;
}

function firmar_(texto) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(texto, secreto_()));
}

function guardarPin_(usuario, pin) {
  if (USUARIOS.indexOf(usuario) < 0) throw new Error('Usuario inválido');
  if (!/^\d{4,8}$/.test(String(pin))) throw new Error('El PIN debe tener de 4 a 8 dígitos');
  const props = PropertiesService.getScriptProperties();
  const salt = Utilities.getUuid();
  props.setProperty('PIN_' + usuario, salt + '$' + hashPin_(salt, String(pin)));
  props.setProperty('PINV_' + usuario, String((Number(props.getProperty('PINV_' + usuario)) || 0) + 1));
}

function login_(req) {
  const usuario = String(req.usuario || '');
  if (USUARIOS.indexOf(usuario) < 0) throw errorCodigo_('Usuario o PIN incorrecto', 'LOGIN');
  const cache = CacheService.getScriptCache();
  const clave = 'fallos_' + usuario;
  const fallos = Number(cache.get(clave)) || 0;
  if (fallos >= MAX_FALLOS) throw errorCodigo_('Demasiados intentos. Espera 10 minutos.', 'BLOQUEO');
  const props = PropertiesService.getScriptProperties();
  const guardado = props.getProperty('PIN_' + usuario);
  if (!guardado) throw errorCodigo_('El PIN aún no está configurado. Abre la hoja de cálculo y usa el menú Doble Yema.', 'SIN_PIN');
  const partes = guardado.split('$');
  const ok = hashPin_(partes[0], String(req.pin || '')) === partes[1];
  if (!ok) {
    cache.put(clave, String(fallos + 1), BLOQUEO_SEG);
    throw errorCodigo_('Usuario o PIN incorrecto', 'LOGIN');
  }
  cache.remove(clave);
  const exp = Date.now() + TOKEN_DIAS * 86400000;
  const payload = Utilities.base64EncodeWebSafe(JSON.stringify({ u: usuario, r: usuario, exp: exp, v: props.getProperty('PINV_' + usuario) || '0' }));
  return { ok: true, token: payload + '.' + firmar_(payload), usuario: usuario, role: usuario, exp: exp };
}

function auth_(token) {
  const partes = String(token || '').split('.');
  if (partes.length !== 2 || firmar_(partes[0]) !== partes[1]) throw errorCodigo_('Sesión inválida. Vuelve a entrar.', 'AUTH');
  let datos;
  try {
    datos = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(partes[0])).getDataAsString());
  } catch (e) {
    throw errorCodigo_('Sesión inválida. Vuelve a entrar.', 'AUTH');
  }
  if (!datos.exp || datos.exp < Date.now()) throw errorCodigo_('La sesión venció. Vuelve a entrar.', 'AUTH');
  const v = PropertiesService.getScriptProperties().getProperty('PINV_' + datos.u) || '0';
  if (String(datos.v) !== v) throw errorCodigo_('El PIN cambió. Vuelve a entrar.', 'AUTH');
  return { usuario: datos.u, role: datos.r };
}

// ------------------------------------------------------------- hojas y datos

function libro_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function ahora_() {
  return new Date().toISOString(); // solo para la hoja de auditoría
}

function ahoraMs_() {
  return Date.now();
}

// Texto plano: el apóstrofe inicial evita que Sheets convierta "1-2" o "2026-10-05" en fechas o fórmulas.
function t_(v) {
  const s = limpiarTexto_(v);
  return s === '' ? '' : "'" + s;
}

function columnasHoja_(nombre) {
  return (nombre === 'Auditoria' ? AUDITORIA_COLS : SCHEMA[nombre].cols).concat(nombre === 'Auditoria' ? [] : ['upd']);
}

function asegurarHoja_(nombre) {
  const libro = libro_();
  let hoja = libro.getSheetByName(nombre);
  const cols = columnasHoja_(nombre);
  if (!hoja) hoja = libro.insertSheet(nombre);
  const ultimaCol = hoja.getLastColumn();
  const actuales = ultimaCol > 0 ? hoja.getRange(1, 1, 1, ultimaCol).getValues()[0].map(String) : [];
  const faltantes = cols.filter(function (c) { return actuales.indexOf(c) < 0; });
  if (faltantes.length) {
    hoja.getRange(1, actuales.length + 1, 1, faltantes.length).setValues([faltantes]);
  }
  // El formato solo se aplica al crear la hoja o al agregar columnas; hacerlo en cada envío era lento.
  if (!actuales.length || faltantes.length) {
    const todas = actuales.concat(faltantes);
    hoja.getRange(1, 1, 1, todas.length).setFontWeight('bold').setBackground('#f3e7c3');
    hoja.setFrozenRows(1);
  }
  return hoja;
}

function leerEncabezado_(hoja) {
  return hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(String);
}

function textoCelda_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'America/Bogota', 'yyyy-MM-dd');
  return v === null || v === undefined ? '' : String(v);
}

function filaAObjeto_(nombre, encabezado, fila) {
  const nums = SCHEMA[nombre].nums || [];
  const obj = {};
  encabezado.forEach(function (c, i) {
    const v = fila[i];
    if (c === 'anulado') obj[c] = v === true || v === 'TRUE' || v === 'true';
    else if (c === 'upd' || nums.indexOf(c) >= 0) obj[c] = v === '' || v === null ? 0 : Number(v);
    else obj[c] = textoCelda_(v);
  });
  return obj;
}

function leerHoja_(nombre, since) {
  const hoja = libro_().getSheetByName(nombre);
  if (!hoja || hoja.getLastRow() < 2) return [];
  const encabezado = leerEncabezado_(hoja);
  const filas = hoja.getRange(2, 1, hoja.getLastRow() - 1, encabezado.length).getValues();
  const iUpd = encabezado.indexOf('upd');
  const salida = [];
  filas.forEach(function (f) {
    if (!f[0]) return;
    if (since && iUpd >= 0 && (Number(f[iUpd]) || 0) <= since) return;
    salida.push(filaAObjeto_(nombre, encabezado, f));
  });
  return salida;
}

function pull_(auth, since) {
  const serverTime = ahoraMs_();
  const tablas = {};
  Object.keys(SCHEMA).forEach(function (nombre) {
    if (SCHEMA[nombre].read.indexOf(auth.role) >= 0) tablas[nombre] = leerHoja_(nombre, Number(since) || 0);
  });
  return { tablas: tablas, server_time: serverTime, usuario: auth.usuario, role: auth.role };
}

// ---------------------------------------------------------------- validación

function limpiarTexto_(v) {
  return String(v === null || v === undefined ? '' : v).slice(0, 1000);
}

function validar_(nombre, rec, esEdicion) {
  const esq = SCHEMA[nombre];
  if (!rec || typeof rec !== 'object') return 'Registro vacío';
  if (!/^[A-Za-z0-9_.:-]{3,80}$/.test(String(rec.id || ''))) return 'Identificador inválido';
  for (let i = 0; i < (esq.req || []).length && !esEdicion; i++) { // al editar basta con enviar lo que cambia
    const c = esq.req[i];
    if (rec[c] === undefined || rec[c] === null || String(rec[c]) === '') return 'Falta el campo ' + c;
  }
  const nums = esq.nums || [];
  for (let i = 0; i < nums.length; i++) {
    const c = nums[i];
    if (rec[c] === undefined || rec[c] === '' || rec[c] === null) continue;
    const n = Number(rec[c]);
    if (!isFinite(n) || n < 0 || n > (c === 'ts' ? 1e14 : 1e10)) return 'Valor inválido en ' + c;
  }
  const fechas = esq.fechas || [];
  for (let i = 0; i < fechas.length; i++) {
    const c = fechas[i];
    if (rec[c] && !/^\d{4}-\d{2}-\d{2}$/.test(String(rec[c]))) return 'Fecha inválida en ' + c;
  }
  const enums = esq.enums || {};
  const claves = Object.keys(enums);
  for (let i = 0; i < claves.length; i++) {
    const c = claves[i];
    if (rec[c] !== undefined && rec[c] !== '' && enums[c].indexOf(rec[c]) < 0) return 'Valor no permitido en ' + c;
  }
  return '';
}

// ------------------------------------------------------------------ escritura

function carpeta_(clave, titulo) {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('CARPETA_' + clave);
  if (id) {
    try {
      return DriveApp.getFolderById(id);
    } catch (e) { /* si la borraron, se crea de nuevo */ }
  }
  const nueva = DriveApp.createFolder(titulo);
  props.setProperty('CARPETA_' + clave, nueva.getId());
  return nueva;
}

function guardarFoto_(foto, nombre) {
  const extensiones = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  if (!foto || !extensiones[foto.mime]) throw new Error('Formato de imagen no permitido');
  if (!foto.data || foto.data.length > 8000000) throw new Error('La imagen es demasiado grande');
  const blob = Utilities.newBlob(Utilities.base64Decode(foto.data), foto.mime, nombre + '.' + extensiones[foto.mime]);
  return carpeta_('SOPORTES', 'Doble Yema - Soportes').createFile(blob).getUrl();
}

function indiceIds_(hoja) {
  const mapa = {};
  const ultima = hoja.getLastRow();
  if (ultima >= 2) {
    hoja.getRange(2, 1, ultima - 1, 1).getValues().forEach(function (f, i) {
      if (f[0] !== '') mapa[String(f[0])] = i + 2;
    });
  }
  return mapa;
}

function guardar_(auth, item, contexto, auditoria) {
  const nombre = item && item.entity;
  const rec = item && item.record;
  const id = rec && rec.id;
  if (!nombre || !SCHEMA[nombre]) return { id: id, entity: nombre, status: 'error', error: 'Entidad desconocida' };
  const esq = SCHEMA[nombre];
  if (esq.write.indexOf(auth.role) < 0) return { id: id, entity: nombre, status: 'error', error: 'No tienes permiso para registrar esto' };
  if (!rec || typeof rec !== 'object') return { id: id, entity: nombre, status: 'error', error: 'Registro vacío' };
  if (!contexto[nombre]) {
    const hoja = asegurarHoja_(nombre);
    contexto[nombre] = { hoja: hoja, encabezado: leerEncabezado_(hoja), indice: indiceIds_(hoja) };
  }
  const ctx = contexto[nombre];
  const fila = ctx.indice[String(rec.id)];
  if (fila && esq.soloCrear && auth.role === 'operario') return { id: id, entity: nombre, status: 'dup' };
  const invalido = validar_(nombre, rec, !!fila);
  if (invalido) return { id: id, entity: nombre, status: 'error', error: invalido };

  const previo = fila ? ctx.hoja.getRange(fila, 1, 1, ctx.encabezado.length).getValues()[0] : null;
  const nuevo = {};
  Object.keys(rec).forEach(function (k) { if (k !== '_foto') nuevo[k] = rec[k]; });

  // El usuario lo fija el servidor, nunca el cliente.
  if (!fila) nuevo.usuario = auth.usuario;
  else delete nuevo.usuario;
  if (auth.role !== 'gerente') {
    nuevo.anulado = false;
    nuevo.motivo = '';
  }
  if (rec._foto) {
    const iFoto = ctx.encabezado.indexOf('foto_url');
    const yaTiene = previo && iFoto >= 0 && String(previo[iFoto] || '') !== '';
    if (!yaTiene) nuevo.foto_url = guardarFoto_(rec._foto, (rec.fecha || 'foto') + '_' + rec.id);
  }
  nuevo.upd = ahoraMs_();

  const nums = esq.nums || [];
  const valores = ctx.encabezado.map(function (c, i) {
    const v = nuevo[c];
    if (v === undefined) return previo ? previo[i] : ''; // conserva lo que no se envió
    if (c === 'anulado') return v === true || v === 'true' || v === 'TRUE';
    if (c === 'upd') return v;
    if (nums.indexOf(c) >= 0) return v === '' || v === null ? '' : Number(v);
    return t_(v);
  });

  if (fila) {
    ctx.hoja.getRange(fila, 1, 1, ctx.encabezado.length).setValues([valores]);
    auditoria.push([ahora_(), auth.usuario, 'editar', nombre, rec.id, t_(JSON.stringify(previo).slice(0, 1500))]);
  } else {
    const destino = ctx.hoja.getLastRow() + 1;
    ctx.hoja.getRange(destino, 1, 1, ctx.encabezado.length).setValues([valores]);
    ctx.indice[String(rec.id)] = destino;
    auditoria.push([ahora_(), auth.usuario, 'crear', nombre, rec.id, '']);
  }
  return { id: rec.id, entity: nombre, status: 'ok', foto_url: nuevo.foto_url || undefined };
}

function sync_(auth, lista) {
  const lock = LockService.getScriptLock();
  // Si otro envío tiene el candado, no se muestra un error técnico: el celular reintenta solo.
  if (!lock.tryLock(20000)) throw errorCodigo_('El servidor está ocupado. Se reintentará solo.', 'BUSY');
  try {
    const contexto = {};
    const auditoria = [];
    const resultados = lista.map(function (item) {
      try {
        return guardar_(auth, item, contexto, auditoria);
      } catch (err) {
        return { id: item && item.record && item.record.id, entity: item && item.entity, status: 'error', error: err.message || String(err) };
      }
    });
    if (auditoria.length) {
      const hoja = asegurarHoja_('Auditoria');
      hoja.getRange(hoja.getLastRow() + 1, 1, auditoria.length, AUDITORIA_COLS.length).setValues(auditoria);
    }
    return resultados;
  } finally {
    lock.releaseLock();
  }
}

// -------------------------------------------------------- instalación y menú

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Doble Yema')
    .addItem('1. Preparar hojas (primera vez)', 'setup')
    .addItem('2. Configurar PIN del gerente', 'pinGerente')
    .addItem('3. Configurar PIN del operario', 'pinOperario')
    .addItem('4. Activar respaldo semanal', 'instalarRespaldoSemanal')
    .addSeparator()
    .addItem('Ver estado', 'estado')
    .addToUi();
}

function setup() {
  libro_().setSpreadsheetTimeZone('America/Bogota');
  Object.keys(SCHEMA).forEach(asegurarHoja_);
  asegurarHoja_('Auditoria');
  secreto_();
  carpeta_('SOPORTES', 'Doble Yema - Soportes');
  carpeta_('RESPALDOS', 'Doble Yema - Respaldos');

  // Configuración inicial: solo agrega las claves que faltan.
  const hojaConfig = libro_().getSheetByName('Config');
  const existentes = leerHoja_('Config').map(function (r) { return r.id; });
  const nuevas = CONFIG_INICIAL.filter(function (r) { return existentes.indexOf(r[0]) < 0; })
    .map(function (r) { return [t_(r[0]), t_(r[1]), t_(r[2]), ahoraMs_()]; });
  if (nuevas.length) hojaConfig.getRange(hojaConfig.getLastRow() + 1, 1, nuevas.length, 4).setValues(nuevas);

  // 15 lotes de 200 aves para empezar; se pueden editar en la hoja "Lotes".
  const hojaLotes = libro_().getSheetByName('Lotes');
  if (hojaLotes.getLastRow() < 2) {
    const filas = [];
    for (let i = 1; i <= 15; i++) filas.push([t_('lote-' + (i < 10 ? '0' + i : i)), t_('Lote ' + i), 200, '', t_('activo'), '', ahoraMs_()]);
    hojaLotes.getRange(2, 1, filas.length, 7).setValues(filas);
  }
  const hojaInicial = libro_().getSheetByName('Hoja 1') || libro_().getSheetByName('Sheet1');
  if (hojaInicial && libro_().getSheets().length > 1) libro_().deleteSheet(hojaInicial);
  alerta_('Listo. Hojas preparadas.\n\nSiguiente paso: menú Doble Yema → Configurar PIN del gerente y del operario.');
}

// Si alguien edita a mano una fila de la hoja, se marca como cambiada para que la app la reciba.
function onEdit(e) {
  try {
    const hoja = e.range.getSheet();
    if (!SCHEMA[hoja.getName()]) return;
    const iUpd = leerEncabezado_(hoja).indexOf('upd');
    if (iUpd < 0 || e.range.getColumn() === iUpd + 1) return;
    for (let f = e.range.getRow(); f < e.range.getRow() + e.range.getNumRows(); f++) {
      if (f > 1) hoja.getRange(f, iUpd + 1).setValue(ahoraMs_());
    }
  } catch (err) { /* nunca debe interrumpir la edición */ }
}

function alerta_(texto) {
  try {
    SpreadsheetApp.getUi().alert(texto);
  } catch (e) {
    Logger.log(texto);
  }
}

function pedirPin_(usuario, titulo) {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt(titulo, 'Escribe un PIN de 4 a 8 dígitos. Si ya existe, este lo reemplaza y cierra las sesiones abiertas.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  try {
    guardarPin_(usuario, r.getResponseText().trim());
    ui.alert('PIN guardado.');
  } catch (e) {
    ui.alert(e.message);
  }
}

function pinGerente() { pedirPin_('gerente', 'PIN del gerente'); }
function pinOperario() { pedirPin_('operario', 'PIN del operario'); }

function estado() {
  const props = PropertiesService.getScriptProperties();
  const l = [];
  l.push('Versión: ' + VERSION);
  l.push('PIN gerente: ' + (props.getProperty('PIN_gerente') ? 'configurado' : 'FALTA'));
  l.push('PIN operario: ' + (props.getProperty('PIN_operario') ? 'configurado' : 'FALTA'));
  Object.keys(SCHEMA).forEach(function (n) {
    const h = libro_().getSheetByName(n);
    l.push(n + ': ' + (h ? Math.max(h.getLastRow() - 1, 0) + ' registros' : 'sin crear'));
  });
  alerta_(l.join('\n'));
}

function respaldar() {
  const carpeta = carpeta_('RESPALDOS', 'Doble Yema - Respaldos');
  const archivo = DriveApp.getFileById(libro_().getId());
  const fecha = Utilities.formatDate(new Date(), 'America/Bogota', 'yyyy-MM-dd');
  archivo.makeCopy('Respaldo ' + fecha, carpeta);
  const copias = [];
  const it = carpeta.getFiles();
  while (it.hasNext()) copias.push(it.next());
  copias.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  copias.slice(8).forEach(function (f) { f.setTrashed(true); }); // conserva las 8 más recientes
}

function instalarRespaldoSemanal() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'respaldar') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('respaldar').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(5).create();
  alerta_('Respaldo semanal activado: cada lunes en la madrugada se guarda una copia en Drive (se conservan las últimas 8).');
}
