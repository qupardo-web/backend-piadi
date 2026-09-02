process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const dashboardService = require('../src/services/dashboardService');
const indicatorService = require('../src/services/indicatorService');
const provider = require('../src/services/indicatorProvider');
const metaProgressService = require('../src/services/metaProgressService');

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

const metric = (indicatorKey, targetValue) => ({ indicatorKey, targetValue });
const meta = (overrides = {}) => ({
  id: 1,
  departmentId: 'educacion_continua',
  anio: 2026,
  periodo: 'Anual',
  totalProgress: 50,
  status: 'en_progreso',
  metrics: [metric('oferta_programada', 10)],
  ...overrides
});

const stubDashboardIndicators = () => {
  stub(indicatorService, 'isSourceConnected', async () => true);
  stub(indicatorService, 'listDepartments', async () => ({
    data: [{ key: 'educacion_continua', name: 'Educación Continua', enabled: true }]
  }));
  stub(indicatorService, 'getEnabledKpis', async () => [
    { key: 'oferta_programada', name: 'Oferta', unit: 'cursos', format: 'number' }
  ]);
  stub(indicatorService, 'getIndicatorValue', async () => ({
    data: { value: 5, formattedValue: '5', hasData: true }
  }));
};

const stubIndicator = (rows) => {
  stub(provider, 'getDepartmentByKey', async () => ({ key: 'educacion_continua' }));
  stub(provider, 'getKpi', async () => ({
    key: 'oferta_programada', formulaKey: 'COUNT_PROGRAMMED_OFFER', format: 'number', unit: 'cursos'
  }));
  stub(provider, 'getProgramRows', async () => rows);
};

test('dashboard summary agrega el resumen de metas con promedio de totalProgress', async () => {
  stubDashboardIndicators();
  stub(metaProgressService, 'listMetasWithProgress', async () => [
    meta({ id: 1, totalProgress: 100, status: 'cumplida' }),
    meta({ id: 2, totalProgress: 100, status: 'cumplida' }),
    meta({ id: 3, totalProgress: 50, status: 'en_riesgo' }),
    meta({ id: 4, totalProgress: 40, status: 'en_progreso' }),
    meta({ id: 5, totalProgress: 30, status: 'en_progreso' })
  ]);

  const result = await dashboardService.getSummary({ department: 'educacion_continua', year: '2026' });
  assert.deepEqual(result.data.metas, {
    total: 5, cumplidas: 2, enRiesgo: 1, cumplimientoGlobal: 64
  });
  assert.equal(result.data.departments[0].cards[0].indicatorKey, 'oferta_programada');
});

test('dashboard summary sin metas conserva el contrato y devuelve contadores en cero', async () => {
  stubDashboardIndicators();
  stub(metaProgressService, 'listMetasWithProgress', async () => []);

  const result = await dashboardService.getSummary({ department: 'educacion_continua' });
  assert.deepEqual(result.data.metas, {
    total: 0, cumplidas: 0, enRiesgo: 0, cumplimientoGlobal: 0
  });
  assert.ok(Array.isArray(result.data.departments));
  assert.ok(result.data.meta);
  assert.ok(result.data.filters);
});

test('series conserva points y agrega targetLine para una MetaMetric aplicable', async () => {
  stubIndicator([{ anio: 2026 }, { anio: 2026 }]);
  stub(metaProgressService, 'listMetasWithProgress', async () => [meta()]);

  const result = await indicatorService.getIndicatorSeries('oferta_programada', {
    department: 'educacion_continua', year: '2026'
  });
  assert.deepEqual(result.data.points, [{ year: 2026, value: 2 }]);
  assert.deepEqual(result.data.targetLine, { value: 10, label: 'Meta' });
});

test('series sin meta conserva points y omite targetLine', async () => {
  stubIndicator([{ anio: 2026 }]);
  stub(metaProgressService, 'listMetasWithProgress', async () => []);

  const result = await indicatorService.getIndicatorSeries('oferta_programada', {
    department: 'educacion_continua', year: '2026'
  });
  assert.deepEqual(result.data.points, [{ year: 2026, value: 1 }]);
  assert.equal(Object.hasOwn(result.data, 'targetLine'), false);
});

test('breakdown obtiene metaTarget y metaStatus desde el motor real de progreso', async () => {
  stubIndicator([{ anio: 2026, area: 'Salud' }]);
  const rawMeta = {
    id: 9,
    departmentId: 'educacion_continua',
    anio: 2026,
    periodo: 'Anual',
    metrics: [{
      id: 1,
      indicatorKey: 'oferta_programada',
      targetValue: 10,
      weight: 100,
      behavior: 'no-debe-superar',
      valueType: 'number',
      lowerLimit: null,
      upperLimit: null,
      indicator: { departmentId: 'educacion_continua' }
    }]
  };
  const progress = await metaProgressService.calculateProgress(rawMeta, {
    now: new Date('2026-01-01T00:00:00Z'),
    resolveIndicator: async () => ({ data: { value: 8, hasData: true } })
  });
  stub(metaProgressService, 'listMetasWithProgress', async () => [{ ...rawMeta, ...progress }]);

  const result = await indicatorService.getIndicatorBreakdown('oferta_programada', {
    department: 'educacion_continua', year: '2026', groupBy: 'area'
  });
  assert.deepEqual(result.data.items, [{ label: 'Salud', value: 1 }]);
  assert.equal(result.data.metaTarget, 10);
  assert.equal(result.data.metaStatus, 'en_riesgo');
});

test('breakdown sin meta conserva items y omite metaTarget/metaStatus', async () => {
  stubIndicator([{ anio: 2026, area: 'Salud' }]);
  stub(metaProgressService, 'listMetasWithProgress', async () => []);

  const result = await indicatorService.getIndicatorBreakdown('oferta_programada', {
    department: 'educacion_continua', year: '2026', groupBy: 'area'
  });
  assert.deepEqual(result.data.items, [{ label: 'Salud', value: 1 }]);
  assert.equal(Object.hasOwn(result.data, 'metaTarget'), false);
  assert.equal(Object.hasOwn(result.data, 'metaStatus'), false);
});

test('múltiples metas igualmente aplicables no provocan una selección arbitraria', async () => {
  stubIndicator([{ anio: 2026 }]);
  stub(metaProgressService, 'listMetasWithProgress', async () => [meta({ id: 1 }), meta({ id: 2 })]);

  const result = await indicatorService.getIndicatorSeries('oferta_programada', {
    department: 'educacion_continua', year: '2026'
  });
  assert.equal(Object.hasOwn(result.data, 'targetLine'), false);
});

test('el alcance de metas respeta department, año y semestre de la consulta', async () => {
  stubIndicator([{ anio: 2026 }]);
  stub(metaProgressService, 'listMetasWithProgress', async (filters) => {
    assert.deepEqual(filters, { departmentId: 'educacion_continua' });
    return [
      meta({ periodo: 'Semestre 1', metrics: [metric('oferta_programada', 20)] }),
      meta({ id: 2, periodo: 'Semestre 2', metrics: [metric('oferta_programada', 30)] }),
      meta({ id: 3, anio: 2025, periodo: 'Semestre 1', metrics: [metric('oferta_programada', 40)] })
    ];
  });

  const result = await indicatorService.getIndicatorSeries('oferta_programada', {
    department: 'educacion_continua', year: '2026', semester: '1'
  });
  assert.deepEqual(result.data.targetLine, { value: 20, label: 'Meta' });
});
