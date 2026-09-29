process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { normalizeUploadedFilename } = require('../src/utils/filenameEncoding');
const auditService = require('../src/services/auditService');
const auditLogger = require('../src/middleware/auditLogger');
const plantillaService = require('../src/services/plantillaService');
const plantillaController = require('../src/controllers/plantillaController');

const originals = [];
const stub = (object, key, value) => {
  originals.push([object, key, object[key]]);
  object[key] = value;
};
test.afterEach(() => {
  while (originals.length) {
    const [object, key, value] = originals.pop();
    object[key] = value;
  }
});

test('normaliza mojibake y conserva ASCII y Unicode correcto', () => {
  assert.equal(normalizeUploadedFilename('DirecciÃ³n.xlsx'), 'Dirección.xlsx');
  assert.equal(normalizeUploadedFilename('InnovaciÃ³n.xlsx'), 'Innovación.xlsx');
  assert.equal(normalizeUploadedFilename('plantilla.xlsx'), 'plantilla.xlsx');
  assert.equal(normalizeUploadedFilename('Dirección.xlsx'), 'Dirección.xlsx');
  assert.equal(normalizeUploadedFilename('á é í ó ú ñ ü.xlsx'), 'á é í ó ú ñ ü.xlsx');
  assert.equal(normalizeUploadedFilename(null), null);
});

test('auditLogger registra el nombre normalizado', async () => {
  let recorded;
  stub(auditService, 'record', async (type, payload) => { recorded = { type, payload }; });
  const res = new EventEmitter();
  res.statusCode = 200;
  auditLogger({ type: 'carga' })({
    method: 'POST', originalUrl: '/api/plantillas/1/cargar', params: {},
    file: { originalname: 'DirecciÃ³n.xlsx' }, user: { id: 1 }
  }, res, () => {});
  res.emit('finish');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(recorded.payload.archivo, 'Dirección.xlsx');
});

test('plantillaController persiste el mismo nombre normalizado', async () => {
  let savedName;
  stub(plantillaService, 'guardarArchivoTemplate', async (id, buffer, name) => {
    savedName = name;
    return { id, name: 'Innovación', archivoNombre: name };
  });
  const res = {
    json(body) { this.body = body; return this; }
  };
  await plantillaController.subirTemplate({
    params: { id: '3' }, file: { buffer: Buffer.from('xlsx'), originalname: 'InnovaciÃ³n.xlsx' }
  }, res, assert.fail);
  assert.equal(savedName, 'Innovación.xlsx');
  assert.equal(res.body.plantilla.archivoNombre, 'Innovación.xlsx');
});
