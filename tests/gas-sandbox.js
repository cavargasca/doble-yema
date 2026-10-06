// Simula lo mínimo de Google Apps Script para probar backend/Code.gs en Node,
// sin tocar ninguna cuenta de Google.
import vm from 'node:vm';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const signed = (buf) => Array.from(buf, (b) => (b > 127 ? b - 256 : b));
const unsigned = (arr) => Buffer.from(arr.map((b) => b & 0xff));

class FakeRange {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr, nc }); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) {
        const v = (this.sheet.data[this.r - 1 + i] || [])[this.c - 1 + j];
        row.push(v === undefined ? '' : v);
      }
      out.push(row);
    }
    return out;
  }
  getValue() { return this.getValues()[0][0]; }
  setValues(vals) {
    vals.forEach((fila, i) => {
      const idx = this.r - 1 + i;
      this.sheet.data[idx] = this.sheet.data[idx] || [];
      fila.forEach((v, j) => {
        // Igual que Sheets: un apóstrofe inicial fuerza texto y no se guarda.
        this.sheet.data[idx][this.c - 1 + j] = typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v;
      });
    });
    return this;
  }
  setValue(v) { return this.setValues([[v]]); }
  setFontWeight() { return this; }
  setBackground() { return this; }
  setNumberFormat() { return this; }
  getSheet() { return this.sheet; }
  getRow() { return this.r; }
  getColumn() { return this.c; }
  getNumRows() { return this.nr; }
}

class FakeSheet {
  constructor(name) { this.name = name; this.data = []; }
  getName() { return this.name; }
  getLastRow() {
    for (let i = this.data.length - 1; i >= 0; i--) if ((this.data[i] || []).some((v) => v !== undefined && v !== '')) return i + 1;
    return 0;
  }
  getLastColumn() { return this.data.reduce((m, f) => Math.max(m, (f || []).length), 0); }
  getRange(r, c, nr = 1, nc = 1) { return new FakeRange(this, r, c, nr, nc); }
  setFrozenRows() {}
}

export const sandboxOcupado = { valor: false };
export function crearSandbox() {
  const hojas = new Map();
  const libro = {
    getSheetByName: (n) => hojas.get(n) || null,
    insertSheet: (n) => { const h = new FakeSheet(n); hojas.set(n, h); return h; },
    getSheets: () => [...hojas.values()],
    deleteSheet: (h) => hojas.delete(h.name),
    setSpreadsheetTimeZone() {},
    getId: () => 'libro-1',
  };
  const props = new Map();
  const cache = new Map();
  const archivos = [];
  const carpetas = new Map();
  const mkCarpeta = (nombre) => {
    const id = 'carpeta-' + (carpetas.size + 1);
    const c = { getId: () => id, createFile: (blob) => { archivos.push({ nombre: blob.name, bytes: blob.bytes.length }); return { getUrl: () => `https://drive.fake/${archivos.length}` }; } };
    carpetas.set(id, c);
    return c;
  };
  const sandbox = {
    console, Date, JSON, Math, Number, String, Object, Array, isFinite, Error, RegExp, Buffer,
    SpreadsheetApp: { getActiveSpreadsheet: () => libro, getUi: () => { throw new Error('sin interfaz en pruebas'); } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (props.has(k) ? props.get(k) : null), setProperty: (k, v) => props.set(k, String(v)) }) },
    CacheService: { getScriptCache: () => ({ get: (k) => (cache.has(k) ? cache.get(k) : null), put: (k, v) => cache.set(k, v), remove: (k) => cache.delete(k) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock() { return !sandboxOcupado.valor; }, releaseLock() {} }) },
    Logger: { log() {} },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (s) => ({ getContent: () => s, setMimeType() { return this; } }),
    },
    DriveApp: { createFolder: (n) => mkCarpeta(n), getFolderById: (id) => carpetas.get(id) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, s) => signed(crypto.createHash('sha256').update(s).digest()),
      computeHmacSha256Signature: (v, k) => signed(crypto.createHmac('sha256', k).update(v).digest()),
      base64EncodeWebSafe: (x) => (typeof x === 'string' ? Buffer.from(x, 'utf8') : unsigned(x)).toString('base64url'),
      base64DecodeWebSafe: (s) => signed(Buffer.from(s, 'base64url')),
      base64Decode: (s) => signed(Buffer.from(s, 'base64')),
      newBlob: (bytes, mime, name) => ({ bytes: unsigned(bytes), mime, name, getDataAsString: () => unsigned(bytes).toString('utf8') }),
      formatDate: (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(d),
      getUuid: () => crypto.randomUUID(),
    },
  };
  vm.createContext(sandbox);
  const codigo = fs.readFileSync(path.join(aqui, '..', 'backend', 'Code.gs'), 'utf8');
  vm.runInContext(codigo, sandbox, { filename: 'Code.gs' });

  const llamar = (req) => JSON.parse(sandbox.doPost({ postData: { contents: JSON.stringify(req) } }).getContent());
  return { sandbox, hojas, props, cache, archivos, llamar, ejecutar: (js) => vm.runInContext(js, sandbox) };
}
