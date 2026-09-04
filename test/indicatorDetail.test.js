process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const indicatorService = require('../src/services/indicatorService');
const indicatorProvider = require('../src/services/indicatorProvider');
const indicatorController = require('../src/controllers/indicatorController');
const indicatorRoutes = require('../src/routes/indicatorRoutes');
const { parseIndicatorFilters } = require('../src/services/indicatorFilters');
const { authenticateToken } = require('../src/middleware/authMiddleware');

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

const response = () => ({
  statusCode: 0,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; }
});

test('la ruta detail exige autenticación antes del controller', () => {
  const route = indicatorRoutes.stack.find((layer) => layer.route?.path === '/indicators/:indicatorKey/detail');
  assert.equal(route.route.methods.get, true);
  assert.equal(route.route.stack[0].handle, authenticateToken);
});

test('detail devuelve contrato exacto, metadata y transforma la serie reutilizada', async () => {
  stub(indicatorProvider, 'getKpi', async () => ({
    key: 'tasa_aprobacion', name: 'Tasa de aprobación',
    description: 'Aprobados sobre la matrícula total.', departmentId: 'educacion_continua'
  }));
  let seriesCall;
  stub(indicatorService, 'getIndicatorSeries', async (key, query) => {
    seriesCall = { key, query };
    return { data: { points: [{ year: 2025, value: 8 }, { year: 2026, value: 10 }] } };
  });

  const result = await indicatorService.getIndicatorDetail('tasa_aprobacion', {
    anio: '2026', semestre: '1', tipo: 'Curso', modalidad: 'Online'
  });
  assert.deepEqual(result, {
    title: 'Tasa de aprobación',
    description: 'Aprobados sobre la matrícula total.',
    data: [{ period: 2025, value: 8 }, { period: 2026, value: 10 }]
  });
  assert.equal(seriesCall.key, 'tasa_aprobacion');
  assert.deepEqual(seriesCall.query, {
    anio: '2026', semestre: '1', tipo: 'Curso', modalidad: 'Online',
    department: 'educacion_continua', groupBy: 'periodo'
  });
});

test('controller pasa req.query y responde el contrato sin wrapper', async () => {
  let receivedQuery;
  stub(indicatorService, 'getIndicatorDetail', async (key, query) => {
    receivedQuery = query;
    return { title: key, description: 'Detalle', data: [] };
  });
  const res = response();
  await indicatorController.getIndicatorDetail({
    params: { indicatorKey: 'kpi' }, query: { year: '2026' }
  }, res, assert.fail);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { title: 'kpi', description: 'Detalle', data: [] });
  assert.deepEqual(receivedQuery, { year: '2026' });
});

test('aliases de periodo, año y semestre se normalizan genéricamente', () => {
  assert.equal(parseIndicatorFilters({ groupBy: 'periodo' }).groupBy, 'year');
  assert.equal(parseIndicatorFilters({ groupBy: 'anio' }).groupBy, 'year');
  assert.equal(parseIndicatorFilters({ anio: '2025' }).year, 2025);
  assert.equal(parseIndicatorFilters({ 'año': '2024' }).year, 2024);
  assert.deepEqual(parseIndicatorFilters({ semestre: '1' }).semesterLabels, ['1']);
  assert.equal(parseIndicatorFilters({ year: '2026', anio: '2025' }).year, 2026);
});

test('detail es genérico para EC, VCM, Innovación y Curricular sin datos', async () => {
  const originalKpi = indicatorProvider.getKpi;
  const originalSeries = indicatorService.getIndicatorSeries;
  const departments = ['educacion_continua', 'vinculacion_medio', 'innovacion', 'desarrollo_curricular'];
  for (const departmentId of departments) {
    indicatorProvider.getKpi = async () => ({ key: `kpi-${departmentId}`, name: departmentId, description: 'd', departmentId });
    indicatorService.getIndicatorSeries = async () => ({ data: { points: departmentId === 'desarrollo_curricular' ? [] : [{ year: 2026, value: 1 }] } });
    const result = await indicatorService.getIndicatorDetail(`kpi-${departmentId}`);
    assert.deepEqual(result.data, departmentId === 'desarrollo_curricular' ? [] : [{ period: 2026, value: 1 }]);
  }
  indicatorProvider.getKpi = originalKpi;
  indicatorService.getIndicatorSeries = originalSeries;
});

test('key inexistente responde 404 sin consultar series', async () => {
  stub(indicatorProvider, 'getKpi', async () => null);
  stub(indicatorService, 'getIndicatorSeries', async () => assert.fail('no debe consultar series'));
  await assert.rejects(
    indicatorService.getIndicatorDetail('non-existent'),
    (error) => error.statusCode === 404 && error.code === 'KPI_NOT_FOUND'
  );
});
