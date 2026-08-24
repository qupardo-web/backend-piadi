process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const models = require('../src/models');
const metaProgressService = require('../src/services/metaProgressService');
const landingService = require('../src/services/landingService');
const landingController = require('../src/controllers/landingController');
const landingRoutes = require('../src/routes/landingRoutes');
const { swaggerDocs } = require('../src/config/swagger');

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

const meta = (overrides = {}) => ({
  id: 1,
  departmentId: 'calidad',
  anio: 2026,
  periodo: 'Anual',
  creatorId: 99,
  createdAt: '2026-01-01',
  indicatorKey: 'legacy',
  totalProgress: 64,
  elapsedProgress: 50,
  status: 'en_progreso',
  metrics: [{
    metricId: 10,
    indicatorKey: 'kpi-a',
    currentValue: 64,
    targetValue: 100,
    weight: 100,
    behavior: 'increasing',
    valueType: 'number',
    progress: 64,
    weightedProgress: 64,
    hasData: true
  }],
  ...overrides
});

const response = () => ({
  statusCode: 0,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; }
});

const mockDepartments = (departments = [{ key: 'calidad', name: 'Calidad' }]) => {
  stub(models.Department, 'findAll', async () => departments);
};

test('registra GET /metas y Swagger publica /api/landing/metas', () => {
  const route = landingRoutes.stack.find((layer) => layer.route?.path === '/metas');
  assert.equal(route.route.methods.get, true);
  assert.ok(swaggerDocs.paths['/api/landing/metas'].get);
});

test('controller responde 200 con la convención success/data', async () => {
  stub(landingService, 'getLandingMetas', async () => [meta()]);
  const res = response();
  await landingController.getMetas({}, res, assert.fail);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
});

test('lista vacía responde data [] y evita consultar departamentos', async () => {
  stub(metaProgressService, 'listMetasWithProgress', async () => []);
  let departmentQueries = 0;
  stub(models.Department, 'findAll', async () => { departmentQueries += 1; return []; });
  assert.deepEqual(await landingService.getLandingMetas(), []);
  assert.equal(departmentQueries, 0);
});

test('proyecta progreso y estado sin exponer campos internos', async () => {
  stub(metaProgressService, 'listMetasWithProgress', async () => [meta()]);
  mockDepartments();
  const [result] = await landingService.getLandingMetas();
  assert.equal(result.totalProgress, 64);
  assert.equal(result.status, 'en_progreso');
  assert.equal(result.creatorId, undefined);
  assert.equal(result.createdAt, undefined);
  assert.equal(result.indicatorKey, undefined);
  assert.equal(result.metrics[0].metricId, undefined);
});

test('retorna múltiples metas y asocia departamentos con una consulta bulk', async () => {
  stub(metaProgressService, 'listMetasWithProgress', async () => [
    meta(),
    meta({ id: 2, departmentId: 'vcm' })
  ]);
  let queries = 0;
  stub(models.Department, 'findAll', async () => {
    queries += 1;
    return [{ key: 'calidad', name: 'Calidad' }, { key: 'vcm', name: 'Vinculación con el Medio' }];
  });
  const result = await landingService.getLandingMetas();
  assert.deepEqual(result.map((item) => item.department.name), ['Calidad', 'Vinculación con el Medio']);
  assert.equal(queries, 1);
});

test('conserva meta institucional y meta sin métricas de forma segura', async () => {
  stub(metaProgressService, 'listMetasWithProgress', async () => [
    meta({ departmentId: null, totalProgress: 0, metrics: [] })
  ]);
  const [result] = await landingService.getLandingMetas();
  assert.equal(result.department, null);
  assert.equal(result.totalProgress, 0);
  assert.deepEqual(result.metrics, []);
  assert.equal(Number.isFinite(result.totalProgress), true);
});

test('controller delega errores reales al middleware centralizado', async () => {
  const error = new Error('base no disponible');
  stub(landingService, 'getLandingMetas', async () => { throw error; });
  let forwarded;
  await landingController.getMetas({}, response(), (received) => { forwarded = received; });
  assert.equal(forwarded, error);
});

test('reutiliza listMetasWithProgress una vez y no recalcula progreso', async () => {
  let listCalls = 0;
  stub(metaProgressService, 'listMetasWithProgress', async () => { listCalls += 1; return [meta()]; });
  stub(metaProgressService, 'calculateProgress', async () => assert.fail('no debe recalcular'));
  mockDepartments();
  await landingService.getLandingMetas();
  assert.equal(listCalls, 1);
});
