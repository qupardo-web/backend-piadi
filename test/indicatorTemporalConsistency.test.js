process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const indicatorService = require('../src/services/indicatorService');
const provider = require('../src/services/indicatorProvider');
const cacheService = require('../src/services/cacheService');
const metaIndicatorIntegrationService = require('../src/services/metaIndicatorIntegrationService');

const originals = [];
const stub = (object, key, value) => {
  originals.push([object, key, object[key]]);
  object[key] = value;
};

test.beforeEach(() => {
  cacheService.flush();
  stub(metaIndicatorIntegrationService, 'getIndicatorMetaContext', async () => null);
});
test.afterEach(() => {
  cacheService.flush();
  while (originals.length) {
    const [object, key, value] = originals.pop();
    object[key] = value;
  }
});

const setupKpi = ({ department, key, formulaKey, unit = 'registros', format = 'number' }) => {
  stub(provider, 'getDepartmentByKey', async (departmentKey) => (
    departmentKey === department ? { key: department } : null
  ));
  stub(provider, 'getKpi', async (departmentKey, indicatorKey) => (
    departmentKey === department && indicatorKey === key
      ? { key, departmentId: department, formulaKey, unit, format }
      : null
  ));
};

const program = (anio, overrides = {}) => ({
  anio,
  area: 'Gestión',
  dictado: true,
  matricula: 10,
  aprobados: 8,
  ingresosNetos: 100,
  ...overrides
});

test('Educación Continua completa huecos del eje anual con cero', async () => {
  setupKpi({
    department: 'educacion_continua', key: 'oferta_programada',
    formulaKey: 'COUNT_PROGRAMMED_OFFER'
  });
  stub(provider, 'getProgramRows', async () => [program(2022), program(2023), program(2025)]);

  const { data } = await indicatorService.getIndicatorSeries('oferta_programada', {
    department: 'educacion_continua'
  });

  assert.deepEqual(data.points, [
    { year: 2022, value: 1 },
    { year: 2023, value: 1 },
    { year: 2024, value: 0 },
    { year: 2025, value: 1 }
  ]);
});

test('un bucket con ratio no calculable conserva null y no se confunde con un año ausente', async () => {
  setupKpi({
    department: 'educacion_continua', key: 'tasa_aprobacion',
    formulaKey: 'APPROVAL_RATE', unit: 'porcentaje', format: 'percentage'
  });
  stub(provider, 'getProgramRows', async () => [program(2024, { matricula: 0, aprobados: 0 })]);

  const { data } = await indicatorService.getIndicatorSeries('tasa_aprobacion', {
    department: 'educacion_continua', fromYear: '2024', toYear: '2025'
  });

  assert.deepEqual(data.points, [
    { year: 2024, value: null },
    { year: 2025, value: 0 }
  ]);
  assert.equal(data.hasData, true);
});

test('series segmentadas comparten exactamente el mismo eje temporal', async () => {
  setupKpi({
    department: 'educacion_continua', key: 'oferta_programada',
    formulaKey: 'COUNT_PROGRAMMED_OFFER'
  });
  stub(provider, 'getProgramRows', async () => [
    program(2022, { area: 'A' }),
    program(2025, { area: 'A' }),
    program(2023, { area: 'B' })
  ]);

  const { data } = await indicatorService.getIndicatorSeries('oferta_programada', {
    department: 'educacion_continua', groupBy: 'area'
  });

  assert.deepEqual(data.series, [
    { label: 'A', points: [
      { year: 2022, value: 1 }, { year: 2023, value: 0 },
      { year: 2024, value: 0 }, { year: 2025, value: 1 }
    ] },
    { label: 'B', points: [
      { year: 2022, value: 0 }, { year: 2023, value: 1 },
      { year: 2024, value: 0 }, { year: 2025, value: 0 }
    ] }
  ]);
});

test('Admisión conserva conteo único y completa años no consecutivos', async () => {
  setupKpi({
    department: 'admision', key: 'matricula_total',
    formulaKey: 'COUNT_ADMISSION_ENROLLMENT_TOTAL', unit: 'estudiantes'
  });
  stub(provider, 'getAdmissionEnrollmentRows', async () => [
    { codCli: 'A', anio: 2022, periodo: 1 },
    { codCli: 'A', anio: 2022, periodo: 1 },
    { codCli: 'B', anio: 2025, periodo: 2 }
  ]);

  const { data } = await indicatorService.getIndicatorSeries('matricula_total', {
    department: 'admision'
  });

  assert.deepEqual(data.points, [
    { year: 2022, value: 1 },
    { year: 2023, value: 0 },
    { year: 2024, value: 0 },
    { year: 2025, value: 1 }
  ]);
});
