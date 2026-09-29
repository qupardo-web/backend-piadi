process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const metaController = require('../src/controllers/metaController');
const metaProgressService = require('../src/services/metaProgressService');
const { requireMetaDepartmentAccess } = require('../src/middleware/rectoriaAuthorization');

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

const run = (middleware, req) => new Promise((resolve) => middleware(req, {}, resolve));
const response = () => ({
  statusCode: 0,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; }
});

test('Calidad no puede escribir aunque sea creador y coincida su departamento', async () => {
  const error = await run(requireMetaDepartmentAccess, {
    user: { id: 7, role: 'Vicerrectoria de Calidad', roleGroup: 'Calidad', departmentId: 'calidad' },
    meta: { id: 9, creatorId: 7, departmentId: 'calidad' },
    body: { nombre: 'Intento de cambio' }
  });
  assert.equal(error.statusCode, 403);
});

test('las capacidades respetan creador, departamento, solo lectura y Rectoría global', () => {
  const meta = { id: 9, creatorId: 7, departmentId: 'vinculacion_medio', metrics: [] };
  const cases = [
    [{ id: 7, roleGroup: 'Direccion', departmentId: 'vinculacion_medio' }, true],
    [{ id: 8, roleGroup: 'Direccion', departmentId: 'vinculacion_medio' }, false],
    [{ id: 7, roleGroup: 'Direccion', departmentId: 'educacion_continua' }, false],
    [{ id: 7, roleGroup: 'Calidad', departmentId: 'vinculacion_medio' }, false],
    [{ id: 100, role: 'Rector', roleGroup: 'Rectoria', departmentId: null }, true]
  ];

  for (const [user, allowed] of cases) {
    assert.deepEqual(metaController.serializeMeta(meta, user).permissions, {
      canEdit: allowed,
      canDelete: allowed
    });
  }
});

test('el listado expone capacidades calculadas sin revelar creatorId', async () => {
  stub(metaProgressService, 'listMetasWithProgress', async () => [{
    id: 9,
    creatorId: 7,
    departmentId: 'vinculacion_medio',
    nombre: 'Meta VCM',
    metrics: []
  }]);
  const res = response();
  await metaController.listWithProgress({
    query: {},
    user: { id: 7, roleGroup: 'Direccion', departmentId: 'vinculacion_medio' }
  }, res, assert.fail);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data[0].permissions, { canEdit: true, canDelete: true });
  assert.equal(res.body.data[0].creatorId, undefined);
});
