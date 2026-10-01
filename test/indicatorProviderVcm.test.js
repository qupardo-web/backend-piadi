process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const models = require('../src/models');
const provider = require('../src/services/indicatorProvider');
const indicatorService = require('../src/services/indicatorService');
const metaIndicatorIntegrationService = require('../src/services/metaIndicatorIntegrationService');
const { parseIndicatorFilters } = require('../src/services/indicatorFilters');
const cacheService = require('../src/services/cacheService');

const originals = [];
const stub = (object, key, value) => {
  originals.push([object, key, object[key]]);
  object[key] = value;
};

const valueMatches = (value, expected) => {
  if (expected === null || typeof expected !== 'object') return value === expected;
  if (expected[Op.between]) return value >= expected[Op.between][0] && value <= expected[Op.between][1];
  if (expected[Op.lte] !== undefined && value > expected[Op.lte]) return false;
  if (expected[Op.gte] !== undefined && value < expected[Op.gte]) return false;
  return true;
};

const rowMatches = (row, where) => Reflect.ownKeys(where).every((key) => {
  if (key === Op.and) return where[key].every((condition) => rowMatches(row, condition));
  return valueMatches(row[key], where[key]);
});

test.afterEach(() => {
  cacheService.flush();
  while (originals.length) {
    const [object, key, value] = originals.pop();
    object[key] = value;
  }
});

const filters = (query = {}) => parseIndicatorFilters({ department: 'vinculacion_medio', ...query });

test.beforeEach(() => {
  stub(metaIndicatorIntegrationService, 'getIndicatorMetaContext', async () => null);
});

const captureConvenioWhere = async (query) => {
  let captured;
  stub(models.Convenio, 'findAll', async (options) => { captured = options.where; return []; });
  await provider.getVcmConvenioRows(filters(query));
  return captured;
};

const stubKpi = (key, formulaKey, format = 'number', unit = 'registros') => {
  stub(provider, 'getDepartmentByKey', async () => ({ key: 'vinculacion_medio' }));
  stub(provider, 'getKpi', async () => ({ key, formulaKey, format, unit }));
};

test('total_convenios/values calcula el total con datos VCM', async () => {
  stubKpi('total_convenios', 'COUNT_CONVENIOS', 'number', 'convenios');
  stub(provider, 'getVcmConvenioRows', async () => [
    { idConvenio: 'C-1', anio: 2025 },
    { idConvenio: 'C-2', anio: 2025 },
    { idConvenio: 'C-3', anio: 2026 }
  ]);

  const result = await indicatorService.getIndicatorValue('total_convenios', {
    department: 'vinculacion_medio'
  });

  assert.equal(result.data.value, 3);
  assert.equal(result.data.hasData, true);
  assert.equal(result.data.indicatorKey, 'total_convenios');
});

test('convenios_activos/series acepta groupBy=anio y calcula la serie ordenada', async () => {
  stubKpi('convenios_activos', 'COUNT_ACTIVE_CONVENIOS', 'number', 'convenios');
  stub(provider, 'getVcmConvenioRows', async () => [
    { anio: 2025, activo: true },
    { anio: 2024, activo: true },
    { anio: 2025, activo: false },
    { anio: 2025, activo: true }
  ]);

  const result = await indicatorService.getIndicatorSeries('convenios_activos', {
    department: 'vinculacion_medio', groupBy: 'anio'
  });
  const resultWithYear = await indicatorService.getIndicatorSeries('convenios_activos', {
    department: 'vinculacion_medio', groupBy: 'year'
  });

  assert.deepEqual(result.data.points, [
    { year: 2024, value: 1 },
    { year: 2025, value: 2 }
  ]);
  assert.deepEqual(result.data.points, resultWithYear.data.points);
});

test('actividades_realizadas/breakdown interpreta groupBy=tipo como tipoActividad', async () => {
  stubKpi('actividades_realizadas', 'COUNT_ACTIVITIES', 'number', 'actividades');
  stub(provider, 'getVcmActividadRows', async () => [
    { anio: 2026, tipoActividad: 'Taller' },
    { anio: 2026, tipoActividad: 'Taller' },
    { anio: 2026, tipoActividad: 'Seminario' }
  ]);

  const result = await indicatorService.getIndicatorBreakdown('actividades_realizadas', {
    department: 'vinculacion_medio', groupBy: 'tipo'
  });

  assert.equal(result.data.groupBy, 'tipo');
  assert.deepEqual(result.data.items, [
    { label: 'Taller', value: 2 },
    { label: 'Seminario', value: 1 }
  ]);
});

test('provider de convenios aplica juntos los filtros year, tipo y sector', async () => {
  const where = await captureConvenioWhere({ year: '2026', tipo: 'Marco', sector: 'Público' });
  assert.equal(where.anioFirma, 2026);
  assert.equal(where.tipoConvenio[Op.iLike], 'Marco');
  assert.equal(where.sector[Op.iLike], 'Público');
});

test('provider de actividades aplica tipo, sector y año sin reemplazar condiciones', async () => {
  let where;
  stub(models.Actividad, 'findAll', async (options) => { where = options.where; return []; });
  await provider.getVcmActividadRows(filters({ year: '2025', tipo: 'Taller', sector: 'Social' }));
  assert.equal(where.anio, 2025);
  assert.equal(where.tipoActividad[Op.iLike], 'Taller');
  assert.equal(where.sector[Op.iLike], 'Social');
});

test('quitar el filtro tipo restaura una consulta VCM sin condición de tipo', async () => {
  const queries = [];
  stub(models.Actividad, 'findAll', async (options) => { queries.push(options.where); return []; });
  await provider.getVcmActividadRows(filters({ tipo: 'Taller' }));
  await provider.getVcmActividadRows(filters());
  assert.equal(queries[0].tipoActividad[Op.iLike], 'Taller');
  assert.equal(queries[1].tipoActividad, undefined);
});

test('sin areaVinculada no agrega condición y una request posterior restaura el where base', async () => {
  const queries = [];
  stub(models.Convenio, 'findAll', async (options) => { queries.push(options.where); return []; });
  await provider.getVcmConvenioRows(filters());
  await provider.getVcmConvenioRows(filters({ areaVinculada: 'Docencia' }));
  await provider.getVcmConvenioRows(filters());
  assert.equal(queries[0].areaVinculada, undefined);
  assert.equal(queries[1].areaVinculada[Op.iLike], 'Docencia');
  assert.equal(queries[2].areaVinculada, undefined);
});

test('aplica distintas áreas mediante comparación case-insensitive', async () => {
  for (const area of ['Docencia', 'Investigación', 'dOcEnCiA']) {
    const where = await captureConvenioWhere({ areaVinculada: area });
    assert.equal(where.areaVinculada[Op.iLike], area);
  }
});

test('combina areaVinculada con región y sector sin reemplazar condiciones', async () => {
  const where = await captureConvenioWhere({
    areaVinculada: 'Docencia', region: 'Valparaíso', sector: 'Público'
  });
  assert.equal(where.areaVinculada[Op.iLike], 'Docencia');
  assert.equal(where.region[Op.iLike], 'Valparaíso');
  assert.equal(where.sector[Op.iLike], 'Público');
});

test('combina múltiples áreas con filtros de año', async () => {
  const where = await captureConvenioWhere({
    areaVinculada: 'Docencia,Investigación', fromYear: '2024', toYear: '2026'
  });
  assert.equal(where.areaVinculada[Op.or].length, 2);
  assert.deepEqual(where.anioFirma[Op.between], [2024, 2026]);
});

test('groupBy areaVinculada continúa disponible para indicadores de convenios', async () => {
  stub(provider, 'getDepartmentByKey', async () => ({ key: 'vinculacion_medio' }));
  stub(provider, 'getKpi', async () => ({
    key: 'total_convenios', formulaKey: 'COUNT_CONVENIOS', format: 'number', unit: 'convenios'
  }));
  stub(provider, 'getVcmConvenioRows', async () => [
    { areaVinculada: 'Docencia', anio: 2026, activo: true },
    { areaVinculada: 'Investigación', anio: 2026, activo: true }
  ]);
  const result = await indicatorService.getIndicatorBreakdown('total_convenios', {
    department: 'vinculacion_medio', groupBy: 'areaVinculada'
  });
  assert.equal(result.data.groupBy, 'areaVinculada');
  assert.deepEqual(result.data.items.map((item) => item.label), ['Docencia', 'Investigación']);
});

test('getFilterOptions expone áreas reales, ordenadas y sin vacíos ni duplicados', async () => {
  stub(models.Convenio, 'findAll', async () => [
    { anioFirma: 2026, areaVinculada: ' Vinculación ' },
    { anioFirma: 2026, areaVinculada: 'docencia' },
    { anioFirma: 2026, areaVinculada: 'Docencia' },
    { anioFirma: 2026, areaVinculada: '' },
    { anioFirma: 2026, areaVinculada: '   ' },
    { anioFirma: 2026, areaVinculada: null }
  ]);
  stub(models.Actividad, 'findAll', async () => []);
  stub(models.Participacion, 'findAll', async () => []);
  stub(models.ArticulacionTP, 'findAll', async () => []);
  const options = await provider.getFilterOptions('vinculacion_medio', filters());
  assert.deepEqual(options.areas, ['docencia', 'Vinculación']);
});

test('proyectos_vcm expande un proyecto durante cada año de vigencia', async () => {
  stubKpi('proyectos_vcm', 'COUNT_PROJECTS', 'number', 'proyectos');
  stub(models.Proyecto, 'findAll', async () => [{
    idProyecto: 'VCM-1', anioInicio: 2023, anioTermino: 2025,
    estado: 'Finalizado', Financiamiento: null
  }]);

  const { data } = await indicatorService.getIndicatorSeries('proyectos_vcm', {
    department: 'vinculacion_medio', fromYear: '2023', toYear: '2025'
  });

  assert.deepEqual(data.points, [
    { year: 2023, value: 1 },
    { year: 2024, value: 1 },
    { year: 2025, value: 1 }
  ]);
});

test('proyectos_vcm aplica solapamiento en consultas puntuales aunque hoy esté finalizado', async () => {
  stubKpi('proyectos_vcm', 'COUNT_PROJECTS', 'number', 'proyectos');
  const projectRows = [{
    idProyecto: 'VCM-1', anioInicio: 2023, anioTermino: 2025,
    estado: 'Finalizado', Financiamiento: null
  }];
  stub(models.Proyecto, 'findAll', async ({ where }) => projectRows.filter((row) => rowMatches(row, where)));

  const inRange = await indicatorService.getIndicatorValue('proyectos_vcm', {
    department: 'vinculacion_medio', year: '2024'
  });
  const beforeRange = await indicatorService.getIndicatorValue('proyectos_vcm', {
    department: 'vinculacion_medio', year: '2022'
  });

  assert.equal(inRange.data.value, 1);
  assert.equal(beforeRange.data.value, null);
  assert.equal(beforeRange.data.hasData, false);
});

test('financiamiento_vcm conserva el año de inicio y no multiplica montos por vigencia', async () => {
  stubKpi('financiamiento_vcm', 'FINANCING_SUM', 'currency', 'CLP');
  const projectRows = [{
    idProyecto: 'VCM-1', anioInicio: 2023, anioTermino: 2025,
    estado: 'Finalizado',
    Financiamiento: { montoAdjudicado: 10000000 }
  }];
  stub(models.Proyecto, 'findAll', async ({ where }) => projectRows.filter((row) => rowMatches(row, where)));

  const { data } = await indicatorService.getIndicatorSeries('financiamiento_vcm', {
    department: 'vinculacion_medio', fromYear: '2023', toYear: '2025'
  });

  assert.deepEqual(data.points, [
    { year: 2023, value: 10000000 },
    { year: 2024, value: 0 },
    { year: 2025, value: 0 }
  ]);
});
