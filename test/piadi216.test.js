process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const models = require('../src/models');
const indicatorService = require('../src/services/indicatorService');
const metaService = require('../src/services/metaService');
const metaProgressService = require('../src/services/metaProgressService');
const auditService = require('../src/services/auditService');
const metaRoutes = require('../src/routes/metaRoutes');
const { authenticateToken } = require('../src/middleware/authMiddleware');
const { requireMetaOwnership } = require('../src/middleware/metaOwnership');
const {
  requireRectoria,
  requireRectoriaForInstitutionalCreation
} = require('../src/middleware/rectoriaAuthorization');
const { auditRectoriaDepartmentalMetaUpdate } = require('../src/middleware/metaAudit');

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

const metric = (overrides = {}) => ({
  id: 1,
  indicatorKey: 'kpi-a',
  weight: 100,
  behavior: 'debe-alcanzar-o-superar',
  targetValue: 100,
  valueType: 'number',
  indicator: { key: 'kpi-a', departmentId: 'calidad' },
  ...overrides
});

const payload = (departmentId = null) => ({
  departmentId,
  anio: 2026,
  periodo: 'Anual',
  metrics: [
    metric({ weight: 60 }),
    metric({ id: 2, indicatorKey: 'kpi-b', weight: 40, indicator: { key: 'kpi-b', departmentId: 'calidad' } })
  ]
});

const runMiddleware = async (middleware, req) => {
  let result = 'not-called';
  await middleware(req, {}, (error) => { result = error; });
  return result;
};

const setupTransaction = () => {
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  stub(models.sequelize, 'transaction', async (callback) => callback(transaction));
  stub(models.IndicatorDefinition, 'findAll', async ({ where }) => (
    where.key[Object.getOwnPropertySymbols(where.key)[0]].map((key) => ({ key }))
  ));
  return transaction;
};

test('1. Rectoría crea una meta institucional con múltiples métricas', async () => {
  assert.equal(await runMiddleware(requireRectoriaForInstitutionalCreation, {
    body: payload(null),
    user: { id: 9, role: 'Rector', roleGroup: 'Rectoria' }
  }), undefined);

  setupTransaction();
  let created;
  let inserted;
  stub(models.Meta, 'create', async (data) => { created = data; return { id: 7 }; });
  stub(models.MetaMetric, 'bulkCreate', async (rows) => { inserted = rows; });
  stub(models.Meta, 'findByPk', async () => ({ id: 7, departmentId: null, creatorId: 9, metrics: inserted }));

  const result = await metaService.create(payload(null), 9);
  assert.equal(created.departmentId, null);
  assert.equal(created.creatorId, 9);
  assert.equal(result.metrics.length, 2);
});

test('2. un usuario no Rectoría no puede crear una meta institucional', async () => {
  const error = await runMiddleware(requireRectoriaForInstitutionalCreation, {
    body: payload(null),
    user: { id: 8, role: 'Director', roleGroup: 'Direccion' }
  });
  assert.equal(error.statusCode, 403);
});

test('3. listado institucional filtra departmentId null y conserva progreso y breakdown', async () => {
  const rows = [
    { id: 1, departmentId: null, anio: 2026, periodo: 'Anual', metrics: [metric()] },
    { id: 2, departmentId: null, anio: 2026, periodo: 'Anual', metrics: [metric({ id: 2 })] },
    { id: 3, departmentId: 'calidad', anio: 2026, periodo: 'Anual', metrics: [metric({ id: 3 })] }
  ];
  stub(models.Meta, 'findAll', async ({ where }) => rows.filter((row) => row.departmentId === where.departmentId));
  stub(indicatorService, 'getIndicatorValue', async () => ({ data: { value: 50, hasData: true } }));

  const result = await metaProgressService.listInstitutionalMetasWithProgress({ now: new Date('2026-06-01') });
  assert.deepEqual(result.map((meta) => meta.id), [1, 2]);
  assert.equal(result[0].totalProgress, 50);
  assert.equal(typeof result[0].status, 'string');
  assert.equal(result[0].metrics[0].weightedProgress, 50);
});

test('4. GET institucional rechaza a usuario autenticado no Rectoría', async () => {
  const error = await runMiddleware(requireRectoria, {
    user: { role: 'Director', roleGroup: 'Direccion' }
  });
  assert.equal(error.statusCode, 403);
});

test('5. GET institucional sin token obtiene 401 en authenticateToken', async () => {
  const error = await runMiddleware(authenticateToken, { headers: {} });
  assert.equal(error.statusCode, 401);
});

test('6. Rectoría puede actualizar una meta de otro creador', async () => {
  stub(models.Meta, 'findByPk', async () => ({ id: 4, creatorId: 1, departmentId: 'calidad' }));
  assert.equal(await runMiddleware(requireMetaOwnership, {
    params: { id: '4' },
    user: { id: 2, role: 'Rector' }
  }), undefined);
});

test('7. un usuario no propietario y no Rectoría no puede actualizar', async () => {
  stub(models.Meta, 'findByPk', async () => ({ id: 4, creatorId: 1, departmentId: 'calidad' }));
  const error = await runMiddleware(requireMetaOwnership, {
    params: { id: '4' },
    user: { id: 2, role: 'Director', roleGroup: 'Direccion' }
  });
  assert.equal(error.statusCode, 403);
});

test('8. Rectoría puede eliminar cualquier meta', async () => {
  const instance = { id: 4, creatorId: 1, departmentId: null, destroy: async () => {} };
  stub(models.Meta, 'findByPk', async () => instance);
  assert.equal(await runMiddleware(requireMetaOwnership, {
    params: { id: '4' },
    user: { id: 2, roleGroup: 'Rectoria' }
  }), undefined);
  setupTransaction();
  await metaService.remove(4);
});

test('9. la eliminación de Meta declara cascada hacia MetaMetric', () => {
  assert.equal(models.Meta.associations.metrics.options.onDelete, 'CASCADE');
  assert.equal(models.MetaMetric.associations.meta.options.onDelete, 'CASCADE');
});

test('10. progreso institucional promedia el total ponderado de sus metas', async () => {
  stub(models.Meta, 'findAll', async () => [
    { id: 1, departmentId: null, anio: 2026, periodo: 'Anual', metrics: [metric({ indicatorKey: 'a', indicator: { key: 'a', departmentId: 'calidad' } })] },
    { id: 2, departmentId: null, anio: 2026, periodo: 'Anual', metrics: [metric({ indicatorKey: 'b', indicator: { key: 'b', departmentId: 'calidad' } })] }
  ]);
  stub(indicatorService, 'getIndicatorValue', async (key) => ({ data: { value: key === 'a' ? 25 : 75, hasData: true } }));
  const result = await metaProgressService.getInstitutionalProgress({ now: new Date('2026-06-01') });
  assert.equal(result.totalProgress, 50);
});

test('11. progreso institucional sin metas retorna cero seguro', async () => {
  stub(models.Meta, 'findAll', async ({ where }) => {
    assert.equal(where.departmentId, null);
    return [];
  });
  const result = await metaProgressService.getInstitutionalProgress();
  assert.deepEqual(result, { totalProgress: 0 });
  assert.equal(Number.isFinite(result.totalProgress), true);
});

test('12. modificación departamental por Rectoría registra auditoría existente', async () => {
  const records = [];
  stub(auditService, 'record', async (type, data) => { records.push({ type, data }); });
  const response = new EventEmitter();
  response.statusCode = 200;
  const req = {
    method: 'PUT',
    originalUrl: '/api/metas/15',
    user: { id: 2, role: 'Rector', roleGroup: 'Rectoria' },
    meta: { id: 15, departmentId: 'calidad' }
  };
  auditRectoriaDepartmentalMetaUpdate(req, response, () => {});
  response.emit('finish');
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(records.length, 1);
  assert.equal(records[0].type, 'session');
  assert.equal(records[0].data.action, 'UPDATE_DEPARTMENTAL_META');
  assert.equal(JSON.parse(records[0].data.detalles).metaId, 15);
});

test('13. regresión: el propietario conserva permisos sobre su meta', async () => {
  stub(models.Meta, 'findByPk', async () => ({ id: 5, creatorId: 8, departmentId: 'calidad' }));
  assert.equal(await runMiddleware(requireMetaOwnership, {
    params: { id: '5' },
    user: { id: 8, role: 'Director', roleGroup: 'Direccion' }
  }), undefined);
});

test('14. las rutas institucionales se registran antes de la ruta dinámica por id', () => {
  const routes = metaRoutes.stack.filter((layer) => layer.route);
  const paths = routes.map((layer) => layer.route.path);
  assert.ok(paths.indexOf('/institucional/progress') < paths.indexOf('/:id'));
  assert.ok(paths.indexOf('/institucional') < paths.indexOf('/:id'));
  for (const path of ['/institucional/progress', '/institucional']) {
    const handlers = routes.find((layer) => layer.route.path === path).route.stack.map((layer) => layer.handle.name);
    assert.deepEqual(handlers.slice(0, 2), ['authenticateToken', 'requireRectoria']);
  }
});

test('15. regresión: un usuario normal conserva la creación departamental', async () => {
  assert.equal(await runMiddleware(requireRectoriaForInstitutionalCreation, {
    body: payload('calidad'),
    user: { id: 8, role: 'Director', roleGroup: 'Direccion' }
  }), undefined);
});

test('16. un propietario normal no genera la auditoría específica de Rectoría', async () => {
  const records = [];
  stub(auditService, 'record', async (type, data) => { records.push({ type, data }); });
  const response = new EventEmitter();
  response.statusCode = 200;
  auditRectoriaDepartmentalMetaUpdate({
    method: 'PUT',
    originalUrl: '/api/metas/15',
    user: { id: 8, role: 'Director', roleGroup: 'Direccion' },
    meta: { id: 15, departmentId: 'calidad' }
  }, response, () => {});
  response.emit('finish');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(records.length, 0);
});
