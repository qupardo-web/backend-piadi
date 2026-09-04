process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const metaRoutes = require('../src/routes/metaRoutes');
const metaController = require('../src/controllers/metaController');
const metaProgressService = require('../src/services/metaProgressService');
const metaService = require('../src/services/metaService');
const { authenticateToken, JWT_SECRET } = require('../src/middleware/authMiddleware');

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

const findGetRoute = (path) => metaRoutes.stack.find(
  (layer) => layer.route?.path === path && layer.route.methods.get
);

const runMiddleware = (middleware, req) => new Promise((resolve) => {
  middleware(req, {}, (error) => resolve(error));
});

const response = () => ({
  statusCode: 0,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; }
});

const tokenFor = (role, roleGroup = 'Direccion', options = {}) => jwt.sign(
  { id: 7, role, roleGroup },
  JWT_SECRET,
  options
);

test('las lecturas generales de Metas comienzan con authenticateToken', () => {
  for (const path of ['/', '/:id/progress', '/:id']) {
    const route = findGetRoute(path);
    assert.ok(route, `No se encontró GET ${path}`);
    assert.equal(route.route.stack[0].handle, authenticateToken);
  }
});

test('sin JWT, JWT inválido y JWT expirado reciben 401', async () => {
  const cases = [
    { headers: {} },
    { headers: { authorization: 'Bearer token-invalido' } },
    { headers: { authorization: `Bearer ${tokenFor('Rector', 'Rectoria', { expiresIn: -1 })}` } }
  ];
  for (const req of cases) {
    const error = await runMiddleware(authenticateToken, req);
    assert.equal(error.statusCode, 401);
  }
});

for (const [role, roleGroup] of [
  ['Educación Continua', 'Direccion'],
  ['Vinculación Con El Medio', 'Direccion'],
  ['Dirección de Desarrollo e Innovación', 'Direccion'],
  ['Vicerrectoria de Calidad', 'Calidad'],
  ['Rector', 'Rectoria'],
  ['Otro rol autenticado', 'Otro grupo']
]) {
  test(`${role} puede leer Metas sin autorización departamental`, async () => {
    const req = {
      headers: { authorization: `Bearer ${tokenFor(role, roleGroup)}` },
      query: { departmentId: 'vinculacion_medio' }
    };
    assert.equal(await runMiddleware(authenticateToken, req), undefined);
    assert.equal(req.user.role, role);
  });
}

test('departmentId conserva su función de filtro sin representar la identidad del usuario', async () => {
  let receivedFilters;
  stub(metaProgressService, 'listMetasWithProgress', async (filters) => {
    receivedFilters = filters;
    return [];
  });
  const res = response();
  await metaController.listWithProgress({ query: { departmentId: 'vinculacion_medio' } }, res, assert.fail);
  assert.deepEqual(receivedFilters, { departmentId: 'vinculacion_medio' });
  assert.deepEqual(res.body.data, []);
});

test('el listado elimina identidad del creador, timestamps y asociaciones internas', async () => {
  stub(metaProgressService, 'listMetasWithProgress', async () => [{
    id: 4,
    departmentId: 'vinculacion_medio',
    anio: 2026,
    nombre: 'Meta pública',
    creatorId: 99,
    createdBy: { id: 99, password: 'hash' },
    createdAt: '2026-01-01',
    updatedAt: '2026-01-02',
    sequelizeInternal: true,
    totalProgress: 50,
    metrics: [{
      id: 8,
      metaId: 4,
      indicatorKey: 'total_convenios',
      targetValue: 20,
      currentValue: 10,
      createdAt: '2026-01-01',
      indicator: { secret: 'interno' }
    }]
  }]);
  const res = response();
  await metaController.listWithProgress({ query: {} }, res, assert.fail);
  const serialized = JSON.stringify(res.body);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data[0].id, 4);
  assert.equal(res.body.data[0].metrics[0].indicatorKey, 'total_convenios');
  for (const forbidden of ['creatorId', 'createdBy', 'password', 'createdAt', 'updatedAt', 'sequelizeInternal', 'metaId', 'secret']) {
    assert.equal(serialized.includes(forbidden), false, `${forbidden} no debe exponerse`);
  }
});

test('detalle y progreso usan la misma proyección pública', async () => {
  const unsafe = {
    id: 5,
    departmentId: 'calidad',
    creatorId: 11,
    createdAt: 'interno',
    metrics: [{ id: 3, metaId: 5, indicatorKey: 'kpi-a', weight: 100 }]
  };
  stub(metaService, 'getById', async () => unsafe);
  stub(metaProgressService, 'getMetaProgress', async () => ({ ...unsafe, totalProgress: 25 }));

  for (const [controller, params] of [
    [metaController.getById, { id: '5' }],
    [metaController.getProgress, { id: '5' }]
  ]) {
    const res = response();
    await controller({ params }, res, assert.fail);
    assert.equal(res.body.data.creatorId, undefined);
    assert.equal(res.body.data.createdAt, undefined);
    assert.equal(res.body.data.metrics[0].metaId, undefined);
  }
});

test('los errores 404 mantienen el contrato del middleware centralizado', async () => {
  const expected = Object.assign(new Error('La meta solicitada no existe'), { statusCode: 404 });
  stub(metaService, 'getById', async () => { throw expected; });
  let received;
  await metaController.getById({ params: { id: '999' } }, response(), (error) => { received = error; });
  assert.equal(received, expected);
});
