const test = require('node:test');
const assert = require('node:assert/strict');
const models = require('../src/models');
const metaService = require('../src/services/metaService');
const { requireMetaOwnership } = require('../src/middleware/metaOwnership');
const metaController = require('../src/controllers/metaController');

const metric = (overrides = {}) => ({
  indicatorKey: 'kpi-a',
  weight: 100,
  behavior: 'increasing',
  targetValue: 100,
  valueType: 'number',
  ...overrides
});

const metaPayload = (metrics = [metric()]) => ({
  departmentId: 'calidad',
  anio: 2026,
  periodo: 'Anual',
  metrics
});

const original = {};
const stub = (object, key, value) => {
  original[`${object.name || object.constructor.name}.${key}`] = [object, key, object[key]];
  object[key] = value;
};
const restore = () => {
  Object.values(original).forEach(([object, key, value]) => { object[key] = value; });
  Object.keys(original).forEach((key) => delete original[key]);
};

const setupPersistence = (keys = ['kpi-a']) => {
  const tx = { LOCK: { UPDATE: 'UPDATE' } };
  stub(models.sequelize, 'transaction', async (callback) => callback(tx));
  stub(models.IndicatorDefinition, 'findAll', async () => keys.map((key) => ({ key })));
  stub(models.Department, 'findOne', async () => ({ key: 'calidad' }));
  return tx;
};

test.afterEach(restore);

test('acepta una métrica con peso 100', () => {
  assert.equal(metaService.normalizeMetrics([metric()]).length, 1);
});

test('acepta múltiples métricas cuyos pesos suman 100', () => {
  const result = metaService.normalizeMetrics([
    metric({ weight: 60 }),
    metric({ indicatorKey: 'kpi-b', weight: 40 })
  ]);
  assert.deepEqual(result.map((item) => item.weight), [60, 40]);
});

test('rechaza pesos cuya suma es 90', () => {
  assert.throws(() => metaService.normalizeMetrics([
    metric({ weight: 50 }),
    metric({ indicatorKey: 'kpi-b', weight: 40 })
  ]), /exactamente 100/);
});

test('acepta 33.33 + 33.33 + 33.34 sin error de coma flotante', () => {
  assert.equal(metaService.normalizeMetrics([
    metric({ weight: 33.33 }),
    metric({ indicatorKey: 'kpi-b', weight: 33.33 }),
    metric({ indicatorKey: 'kpi-c', weight: 33.34 })
  ]).length, 3);
});

test('rechaza NaN, Infinity, negativos y strings no numéricos', () => {
  [NaN, Infinity, -1, 'abc'].forEach((weight) => {
    assert.throws(() => metaService.normalizeMetrics([metric({ weight })]));
  });
});

test('crea la meta y persiste sus métricas asociadas', async () => {
  setupPersistence(['kpi-a', 'kpi-b']);
  let createdPayload;
  let metricRows;
  stub(models.Meta, 'create', async (payload) => {
    createdPayload = payload;
    return { id: 7 };
  });
  stub(models.MetaMetric, 'bulkCreate', async (rows) => { metricRows = rows; });
  stub(models.Meta, 'findByPk', async () => ({ id: 7, metrics: metricRows }));

  const result = await metaService.create(metaPayload([
    metric({ weight: 60 }),
    metric({ indicatorKey: 'kpi-b', weight: 40, targetValue: 50 })
  ]), 9);

  assert.equal(createdPayload.creatorId, 9);
  assert.equal(createdPayload.indicatorKey, 'kpi-a');
  assert.equal(createdPayload.valorMeta, 100);
  assert.equal(metricRows.length, 2);
  assert.equal(result.id, 7);
});

test('POST responde 201 con el contrato success/data', async () => {
  stub(metaService, 'create', async () => ({ id: 7, metrics: [metric()] }));
  const response = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  await metaController.create({ body: metaPayload(), user: { id: 9 } }, response, assert.fail);
  assert.equal(response.statusCode, 201);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.metrics.length, 1);
});

test('rechaza la creación cuando un indicatorKey no existe', async () => {
  setupPersistence([]);
  await assert.rejects(metaService.create(metaPayload(), 9), /No existen los siguientes indicadores/);
});

test('GET devuelve una meta existente con metrics', async () => {
  stub(models.Meta, 'findByPk', async () => ({ id: 2, metrics: [metric()] }));
  const result = await metaService.getById(2);
  assert.equal(result.metrics.length, 1);
});

test('GET devuelve 404 lógico para una meta inexistente', async () => {
  stub(models.Meta, 'findByPk', async () => null);
  await assert.rejects(metaService.getById(999), (error) => error.statusCode === 404);
});

test('PUT reemplaza completamente las métricas y sincroniza campos heredados', async () => {
  setupPersistence(['kpi-c', 'kpi-d', 'kpi-e']);
  const instance = { id: 3, update: async (payload) => { instance.updated = payload; } };
  let destroyed = false;
  let inserted;
  let findCount = 0;
  stub(models.Meta, 'findByPk', async () => (++findCount === 1 ? instance : { id: 3, metrics: inserted }));
  stub(models.MetaMetric, 'destroy', async () => { destroyed = true; });
  stub(models.MetaMetric, 'bulkCreate', async (rows) => { inserted = rows; });

  const metrics = [
    metric({ indicatorKey: 'kpi-c', weight: 20, targetValue: 10 }),
    metric({ indicatorKey: 'kpi-d', weight: 30 }),
    metric({ indicatorKey: 'kpi-e', weight: 50 })
  ];
  const result = await metaService.update(3, { metrics });
  assert.equal(destroyed, true);
  assert.equal(inserted.length, 3);
  assert.equal(instance.updated.indicatorKey, 'kpi-c');
  assert.equal(instance.updated.valorMeta, 10);
  assert.equal(result.metrics.length, 3);
});

test('PUT propaga fallos dentro de la transacción administrada', async () => {
  setupPersistence(['kpi-a']);
  const instance = { id: 3, update: async () => {} };
  stub(models.Meta, 'findByPk', async () => instance);
  stub(models.MetaMetric, 'destroy', async () => {});
  stub(models.MetaMetric, 'bulkCreate', async () => { throw new Error('fallo de métrica'); });
  await assert.rejects(metaService.update(3, { metrics: [metric()] }), /fallo de métrica/);
});

const runOwnership = async ({ creatorId = 1, user, exists = true }) => {
  stub(models.Meta, 'findByPk', async () => exists ? { id: 5, creatorId } : null);
  let nextValue = 'not-called';
  await requireMetaOwnership({ params: { id: '5' }, user }, {}, (value) => { nextValue = value; });
  return nextValue;
};

test('ownership permite al creador', async () => {
  assert.equal(await runOwnership({ creatorId: 8, user: { id: 8, roleGroup: 'Direccion' } }), undefined);
});

test('ownership rechaza a un usuario ajeno', async () => {
  const error = await runOwnership({ creatorId: 8, user: { id: 9, roleGroup: 'Direccion' } });
  assert.equal(error.statusCode, 403);
});

test('ownership permite al grupo real Rectoria', async () => {
  assert.equal(await runOwnership({ creatorId: 8, user: { id: 9, roleGroup: 'Rectoria' } }), undefined);
});

test('ownership devuelve 404 cuando la meta no existe', async () => {
  const error = await runOwnership({ user: { id: 9, roleGroup: 'Rectoria' }, exists: false });
  assert.equal(error.statusCode, 404);
});

test('DELETE destruye la meta y la asociación declara cascade para métricas', async () => {
  setupPersistence();
  let destroyed = false;
  stub(models.Meta, 'findByPk', async () => ({ id: 4, destroy: async () => { destroyed = true; } }));
  await metaService.remove(4);
  assert.equal(destroyed, true);
  assert.equal(models.Meta.associations.metrics.options.onDelete, 'CASCADE');
});
