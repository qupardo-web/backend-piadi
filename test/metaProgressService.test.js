process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const models = require('../src/models');
const indicatorService = require('../src/services/indicatorService');
const progressService = require('../src/services/metaProgressService');
const metaController = require('../src/controllers/metaController');

const original = [];
const stub = (object, key, value) => {
  original.push([object, key, object[key]]);
  object[key] = value;
};
test.afterEach(() => {
  while (original.length) {
    const [object, key, value] = original.pop();
    object[key] = value;
  }
});

const metric = (overrides = {}) => ({
  id: 1,
  indicatorKey: 'kpi-a',
  weight: 100,
  behavior: 'increasing',
  targetValue: 100,
  valueType: 'number',
  indicator: { key: 'kpi-a', departmentId: 'calidad' },
  ...overrides
});

const meta = (overrides = {}) => ({
  id: 1,
  departmentId: 'calidad',
  anio: 2026,
  periodo: 'Anual',
  metrics: [metric()],
  ...overrides
});

const mockValues = (values) => {
  let index = 0;
  stub(indicatorService, 'getIndicatorValue', async () => values[index++]);
};

test('calcula 64% para contribuciones 48 + 16', async () => {
  mockValues([{ data: { value: 80, hasData: true } }, { data: { value: 40, hasData: true } }]);
  const result = await progressService.calculateProgress(meta({ metrics: [
    metric({ weight: 60 }),
    metric({ id: 2, indicatorKey: 'kpi-b', weight: 40 })
  ] }), { now: new Date('2026-01-01T00:00:00Z') });
  assert.equal(result.totalProgress, 64);
  assert.deepEqual(result.metrics.map((item) => item.weightedProgress), [48, 16]);
});

test('una métrica en el target y peso 100 produce 100%', async () => {
  mockValues([{ data: { value: 100, hasData: true } }]);
  assert.equal((await progressService.calculateProgress(meta())).totalProgress, 100);
});

test('hasData false aporta cero y currentValue null', async () => {
  mockValues([{ data: { value: null, hasData: false } }]);
  const result = await progressService.calculateProgress(meta());
  assert.equal(result.totalProgress, 0);
  assert.equal(result.metrics[0].currentValue, null);
  assert.equal(result.metrics[0].hasData, false);
});

test('una métrica sin datos no impide calcular otra', async () => {
  mockValues([{ data: { value: null, hasData: false } }, { data: { value: 50, hasData: true } }]);
  const result = await progressService.calculateProgress(meta({ metrics: [
    metric({ weight: 50 }),
    metric({ id: 2, indicatorKey: 'kpi-b', weight: 50 })
  ] }));
  assert.equal(result.totalProgress, 25);
});

test('no oculta errores reales de indicatorService como ausencia de datos', async () => {
  stub(indicatorService, 'getIndicatorValue', async () => { throw new Error('fuente no disponible'); });
  await assert.rejects(progressService.calculateProgress(meta()), /fuente no disponible/);
});

test('consulta concurrentemente todas las métricas de una meta', async () => {
  let calls = 0;
  stub(indicatorService, 'getIndicatorValue', async () => { calls += 1; return { data: { value: 10, hasData: true } }; });
  await progressService.calculateProgress(meta({ metrics: [
    metric(),
    metric({ id: 2, indicatorKey: 'kpi-b' }),
    metric({ id: 3, indicatorKey: 'kpi-c' })
  ] }));
  assert.equal(calls, 3);
});

test('deduplica consultas idénticas dentro del mismo cálculo', async () => {
  let calls = 0;
  stub(indicatorService, 'getIndicatorValue', async () => { calls += 1; return { data: { value: 10, hasData: true } }; });
  await progressService.calculateProgress(meta({ metrics: [metric(), metric({ id: 2 })] }));
  assert.equal(calls, 1);
});

test('detalle de meta inexistente devuelve 404', async () => {
  stub(models.Meta, 'findByPk', async () => null);
  await assert.rejects(progressService.getMetaProgress(999), (error) => error.statusCode === 404);
});

test('meta sin MetaMetric responde progreso cero sin reconstruir legacy', async () => {
  const result = await progressService.calculateProgress(meta({ metrics: [] }), { now: new Date('2026-01-01T00:00:00Z') });
  assert.equal(result.totalProgress, 0);
  assert.deepEqual(result.metrics, []);
});

test('convierte DECIMAL Sequelize representado como string', async () => {
  mockValues([{ data: { value: '80.00', hasData: true } }]);
  const result = await progressService.calculateProgress(meta({ metrics: [metric({ weight: '60.00', targetValue: '100.00' })] }));
  assert.equal(result.metrics[0].weightedProgress, 48);
});

test('targetValue cero no genera NaN ni Infinity', async () => {
  mockValues([{ data: { value: 10, hasData: true } }]);
  const result = await progressService.calculateProgress(meta({ metrics: [metric({ targetValue: '0.00' })] }));
  assert.equal(result.totalProgress, 0);
  assert.equal(result.metrics[0].calculationIssue, 'target_value_zero');
  assert.equal(Number.isFinite(result.totalProgress), true);
});

test('no limita progreso superior a 100', async () => {
  mockValues([{ data: { value: 120, hasData: true } }]);
  const result = await progressService.calculateProgress(meta());
  assert.equal(result.totalProgress, 120);
  assert.equal(result.metrics[0].progress, 120);
});

test('controller GET /:id/progress responde contrato success/data', async () => {
  stub(progressService, 'getMetaProgress', async () => ({ id: 1, totalProgress: 64, metrics: [] }));
  const response = { statusCode: 0, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
  await metaController.getProgress({ params: { id: '1' } }, response, assert.fail);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.totalProgress, 64);
});

test('listado aplica departmentId en la consulta Sequelize', async () => {
  let query;
  stub(models.Meta, 'findAll', async (options) => { query = options; return []; });
  await progressService.listMetasWithProgress({ departmentId: 'calidad' });
  assert.deepEqual(query.where, { departmentId: 'calidad' });
});

test('listado filtra por status calculado', async () => {
  stub(models.Meta, 'findAll', async () => [
    meta({ id: 1 }),
    meta({ id: 2, metrics: [metric({ indicatorKey: 'kpi-b', indicator: { key: 'kpi-b', departmentId: 'calidad' } })] })
  ]);
  mockValues([{ data: { value: 100, hasData: true } }, { data: { value: 10, hasData: true } }]);
  const result = await progressService.listMetasWithProgress({ status: 'cumplida' }, { now: new Date('2026-03-01T00:00:00Z') });
  assert.deepEqual(result.map((item) => item.id), [1]);
});

test('status cumplida cuando totalProgress alcanza 100', () => {
  assert.equal(progressService.determineStatus(meta(), 100, new Date('2026-02-01T00:00:00Z')), 'cumplida');
});

test('status no_cumplida después de finalizar el periodo', () => {
  assert.equal(progressService.determineStatus(meta(), 99, new Date('2027-01-01T00:00:00Z')), 'no_cumplida');
});

test('status en_progreso cuando el progreso acompaña al tiempo transcurrido', () => {
  assert.equal(progressService.determineStatus(meta(), 50, new Date('2026-04-01T00:00:00Z')), 'en_progreso');
});

test('status en_riesgo cuando el progreso está detrás del tiempo transcurrido', () => {
  assert.equal(progressService.determineStatus(meta(), 1, new Date('2026-04-01T00:00:00Z')), 'en_riesgo');
});

test('periodo Anual usa solo department y year', () => {
  assert.deepEqual(progressService.buildIndicatorQuery(meta(), metric()), { department: 'calidad', year: 2026 });
});

test('meta institucional obtiene department desde la definición del indicador', () => {
  assert.deepEqual(progressService.buildIndicatorQuery(meta({ departmentId: null }), metric()), {
    department: 'calidad', year: 2026
  });
});

test('Semestre 1 se traduce a semester 1', () => {
  assert.deepEqual(progressService.buildIndicatorQuery(meta({ periodo: 'Semestre 1' }), metric()), {
    department: 'calidad', year: 2026, semester: '1'
  });
});

test('Semestre 2 se traduce a semester 2', () => {
  assert.deepEqual(progressService.buildIndicatorQuery(meta({ periodo: 'Semestre 2' }), metric()), {
    department: 'calidad', year: 2026, semester: '2'
  });
});
