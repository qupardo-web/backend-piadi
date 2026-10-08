process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const indicatorService = require('../src/services/indicatorService');
const indicatorProvider = require('../src/services/indicatorProvider');
const indicatorController = require('../src/controllers/indicatorController');
const indicatorRoutes = require('../src/routes/indicatorRoutes');
const { parseIndicatorFilters } = require('../src/services/indicatorFilters');
const { authenticateToken } = require('../src/middleware/authMiddleware');
const cacheService = require('../src/services/cacheService');
const { swaggerDocs } = require('../src/config/swagger');

const originals = [];
const stub = (object, key, value) => {
  originals.push([object, key, object[key]]);
  object[key] = value;
};
test.afterEach(() => {
  cacheService.flush();
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

test('detail devuelve serie por año, tabla y comparación (contrato nuevo)', async () => {
  stub(indicatorProvider, 'getKpi', async () => ({
    key: 'tasa_aprobacion', name: 'Tasa de aprobación',
    description: 'Aprobados sobre la matrícula total.',
    unit: 'porcentaje', format: 'percentage', departmentId: 'educacion_continua'
  }));
  let seriesCall;
  let valueCall;
  stub(indicatorService, 'getIndicatorValue', async (key, query) => {
    valueCall = { key, query };
    return { data: { value: 10, hasData: true, filters: { year: 2026 } } };
  });
  stub(indicatorService, 'getIndicatorSeries', async (key, query) => {
    seriesCall = { key, query };
    return { data: { points: [{ year: 2025, value: 8 }, { year: 2026, value: 10 }] } };
  });

  const result = await indicatorService.getIndicatorDetail('tasa_aprobacion', {
    anio: '2026', semestre: '1', tipo: 'Curso', modalidad: 'Online'
  });
  assert.equal(result.title, 'Tasa de aprobación');
  assert.equal(result.description, 'Aprobados sobre la matrícula total.');
  assert.equal(result.total, 10);
  assert.deepEqual(result.series, [{ year: 2025, value: 8 }, { year: 2026, value: 10 }]);
  assert.deepEqual(result.table, [{ year: 2025, value: 8 }, { year: 2026, value: 10 }]);
  assert.deepEqual(result.comparison, { previousYear: 2025, previousValue: 8, diff: 2 });
  assert.deepEqual(result.period, { from: 2025, to: 2026 });
  assert.equal(result.groupBy, null);
  assert.equal(seriesCall.key, 'tasa_aprobacion');
  // ya NO se fuerza groupBy:'year'
  assert.deepEqual(seriesCall.query, {
    semestre: '1', tipo: 'Curso', modalidad: 'Online',
    department: 'educacion_continua'
  });
  assert.deepEqual(valueCall.query, {
    semestre: '1', tipo: 'Curso', modalidad: 'Online',
    department: 'educacion_continua', year: 2026
  });
  assert.deepEqual(result.filters, { year: 2026, semesters: ['1'], tipo: ['Curso'], modalidad: ['Online'] });
});

const stubDetailKpi = () => stub(indicatorProvider, 'getKpi', async () => ({
  key: 'tasa_aprobacion',
  name: 'Tasa de aprobación',
  description: 'Aprobados sobre matrícula.',
  unit: 'porcentaje',
  format: 'percentage',
  formulaKey: 'APPROVAL_RATE',
  departmentId: 'educacion_continua'
}));

test('detail sin año usa el último punto de la serie y no el acumulado histórico', async () => {
  stubDetailKpi();
  stub(indicatorService, 'getIndicatorSeries', async () => ({
    data: { points: [{ year: 2024, value: 40 }, { year: 2025, value: 60 }] }
  }));
  let valueQuery;
  stub(indicatorService, 'getIndicatorValue', async (_key, query) => {
    valueQuery = query;
    return { data: { value: query.year === 2025 ? 60 : 100, hasData: true } };
  });

  const result = await indicatorService.getIndicatorDetail('tasa_aprobacion');

  assert.equal(result.total, 60);
  assert.equal(valueQuery.year, 2025);
  assert.deepEqual(result.filters, {});
});

for (const alias of ['year', 'anio', 'año']) {
  test(`detail con ${alias}=2025 normaliza el total sin recortar la serie histórica`, async () => {
    stubDetailKpi();
    let seriesQuery;
    let valueQuery;
    stub(indicatorService, 'getIndicatorSeries', async (_key, query) => {
      seriesQuery = query;
      return { data: { points: [{ year: 2024, value: 40 }, { year: 2025, value: 60 }] } };
    });
    stub(indicatorService, 'getIndicatorValue', async (_key, query) => {
      valueQuery = query;
      return { data: { value: 60, hasData: true } };
    });

    const result = await indicatorService.getIndicatorDetail('tasa_aprobacion', { [alias]: '2025' });

    assert.equal(result.total, 60);
    assert.equal(seriesQuery.year, undefined);
    assert.equal(seriesQuery.anio, undefined);
    assert.equal(seriesQuery['año'], undefined);
    assert.equal(valueQuery.year, 2025);
    assert.deepEqual(result.filters, { year: 2025 });
  });
}

test('detail con rango usa el último año solicitado como total', async () => {
  stubDetailKpi();
  let seriesQuery;
  let valueQuery;
  stub(indicatorService, 'getIndicatorSeries', async (_key, query) => {
    seriesQuery = query;
    return { data: { points: [
      { year: 2022, value: 10 }, { year: 2023, value: 0 },
      { year: 2024, value: 0 }, { year: 2025, value: 30 }
    ] } };
  });
  stub(indicatorService, 'getIndicatorValue', async (_key, query) => {
    valueQuery = query;
    return { data: { value: 30, hasData: true } };
  });

  const result = await indicatorService.getIndicatorDetail('tasa_aprobacion', {
    fromYear: '2022', toYear: '2025'
  });

  assert.deepEqual(seriesQuery, {
    fromYear: '2022', toYear: '2025', department: 'educacion_continua'
  });
  assert.equal(valueQuery.year, 2025);
  assert.equal(valueQuery.fromYear, undefined);
  assert.equal(valueQuery.toYear, undefined);
  assert.equal(result.total, 30);
  assert.deepEqual(result.comparison, { previousYear: 2024, previousValue: 0, diff: 30 });
});

test('detail con serie vacía devuelve una respuesta válida sin consultar un total histórico', async () => {
  stubDetailKpi();
  stub(indicatorService, 'getIndicatorSeries', async () => ({ data: { points: [] } }));
  stub(indicatorService, 'getIndicatorValue', async () => assert.fail('no debe calcular un total sin refYear'));

  const result = await indicatorService.getIndicatorDetail('tasa_aprobacion');

  assert.equal(result.total, null);
  assert.equal(result.hasData, false);
  assert.deepEqual(result.period, { from: null, to: null });
  assert.deepEqual(result.series, []);
});

test('comparison no inventa diferencia cuando el año calendario previo no es calculable', async () => {
  stubDetailKpi();
  stub(indicatorService, 'getIndicatorSeries', async () => ({ data: { points: [
    { year: 2024, value: null }, { year: 2025, value: 30 }
  ] } }));
  stub(indicatorService, 'getIndicatorValue', async () => ({
    data: { value: 30, hasData: true }
  }));

  const result = await indicatorService.getIndicatorDetail('tasa_aprobacion', { year: '2025' });

  assert.equal(result.comparison, null);
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
  assert.equal(parseIndicatorFilters({ department: 'admision', groupBy: 'periodo' }).groupBy, 'periodo');
  assert.equal(parseIndicatorFilters({ groupBy: 'anio' }).groupBy, 'year');
  assert.equal(parseIndicatorFilters({ anio: '2025' }).year, 2025);
  assert.equal(parseIndicatorFilters({ 'año': '2024' }).year, 2024);
  assert.deepEqual(parseIndicatorFilters({ semestre: '1' }).semesterLabels, ['1']);
  assert.equal(parseIndicatorFilters({ year: '2026', anio: '2025' }).year, 2026);
});

test('Swagger de detail documenta año, rango, semestre y groupBy sin inventar campos', () => {
  const operation = swaggerDocs.paths['/api/indicators/{indicatorKey}/detail'].get;
  const parameters = operation.parameters.map((parameter) => parameter.name);
  assert.ok(parameters.includes('year'));
  assert.ok(parameters.includes('anio'));
  assert.ok(parameters.includes('año'));
  assert.ok(parameters.includes('fromYear'));
  assert.ok(parameters.includes('toYear'));
  assert.ok(parameters.includes('semestre'));
  assert.ok(parameters.includes('groupBy'));
  const properties = operation.responses[200].content['application/json'].schema.properties;
  assert.ok(properties.table);
  assert.equal(properties.breakdown, undefined);
  assert.equal(properties.metadata, undefined);
});

test('detail es genérico para EC, VCM, Innovación y Curricular sin datos', async () => {
  const originalKpi = indicatorProvider.getKpi;
  const originalValue = indicatorService.getIndicatorValue;
  const originalSeries = indicatorService.getIndicatorSeries;
  const departments = ['educacion_continua', 'vinculacion_medio', 'innovacion', 'desarrollo_curricular'];
  for (const departmentId of departments) {
    const empty = departmentId === 'desarrollo_curricular';
    indicatorProvider.getKpi = async () => ({ key: `kpi-${departmentId}`, name: departmentId, description: 'd', departmentId });
    indicatorService.getIndicatorValue = async () => ({ data: { value: empty ? 0 : 1, hasData: !empty, filters: {} } });
    indicatorService.getIndicatorSeries = async () => ({ data: { points: empty ? [] : [{ year: 2026, value: 1 }] } });
    const result = await indicatorService.getIndicatorDetail(`kpi-${departmentId}`);
    assert.deepEqual(result.series, empty ? [] : [{ year: 2026, value: 1 }]);
  }
  indicatorProvider.getKpi = originalKpi;
  indicatorService.getIndicatorValue = originalValue;
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
