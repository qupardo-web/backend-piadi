process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const models = require('../src/models');
const dashboardService = require('../src/services/dashboardService');
const indicatorService = require('../src/services/indicatorService');
const metaIndicatorIntegrationService = require('../src/services/metaIndicatorIntegrationService');

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

const innovationKpis = [
  { key: 'proyectos_activos', name: 'Proyectos activos', unit: 'proyectos', format: 'number' },
  { key: 'financiamiento_obtenido', name: 'Financiamiento obtenido', unit: 'CLP', format: 'currency' },
  { key: 'proyectos_finalizados', name: 'Innovaciones implementadas', unit: 'proyectos', format: 'number' }
];

const values = {
  proyectos_activos: { value: 4, formattedValue: '4' },
  financiamiento_obtenido: { value: 25000000, formattedValue: '$25.000.000' },
  proyectos_finalizados: { value: 3, formattedValue: '3' }
};

const setupSummary = (departments, kpisByDepartment) => {
  stub(metaIndicatorIntegrationService, 'getDashboardMetaSummary', async () => ({
    total: 0, cumplidas: 0, enRiesgo: 0, cumplimientoGlobal: 0
  }));
  stub(indicatorService, 'isSourceConnected', async () => true);
  stub(indicatorService, 'listDepartments', async () => ({ data: departments }));
  stub(indicatorService, 'getEnabledKpis', async (department) => kpisByDepartment[department] || []);
  stub(indicatorService, 'getIndicatorValue', async (key) => ({
    data: { ...(values[key] || { value: 1, formattedValue: '1' }), hasData: true }
  }));
};

const innovationDepartment = { key: 'innovacion', name: 'Innovación', enabled: true, hasData: true };

test('1. department=innovacion devuelve únicamente Innovación', async () => {
  setupSummary([
    { key: 'educacion_continua', name: 'Educación Continua', enabled: true },
    { key: 'vinculacion_medio', name: 'Vinculación con el Medio', enabled: true },
    innovationDepartment
  ], { innovacion: innovationKpis });

  const result = await dashboardService.getSummary({ department: 'innovacion', year: '2026' });
  assert.equal(result.data.departments.length, 1);
  assert.equal(result.data.departments[0].departmentId, 'innovacion');
});

test('2. summary Innovación incluye proyectos_activos con su contrato de card', async () => {
  setupSummary([innovationDepartment], { innovacion: innovationKpis });
  const result = await dashboardService.getSummary({ department: 'innovacion', year: '2026' });
  const card = result.data.departments[0].cards.find((item) => item.indicatorKey === 'proyectos_activos');

  assert.deepEqual(card, {
    indicatorKey: 'proyectos_activos', title: 'Proyectos activos', value: 4,
    formattedValue: '4', unit: 'proyectos', format: 'number', hasData: true
  });
});

test('3. summary Innovación incluye financiamiento_obtenido con formato CLP', async () => {
  setupSummary([innovationDepartment], { innovacion: innovationKpis });
  const result = await dashboardService.getSummary({ department: 'innovacion', year: '2026' });
  const card = result.data.departments[0].cards.find((item) => item.indicatorKey === 'financiamiento_obtenido');

  assert.equal(card.value, 25000000);
  assert.equal(card.formattedValue, '$25.000.000');
  assert.equal(card.unit, 'CLP');
  assert.equal(card.hasData, true);
});

test('4. summary Innovación representa innovaciones implementadas con proyectos_finalizados', async () => {
  setupSummary([innovationDepartment], { innovacion: innovationKpis });
  const result = await dashboardService.getSummary({ department: 'innovacion', year: '2026' });
  const card = result.data.departments[0].cards.find((item) => item.indicatorKey === 'proyectos_finalizados');

  assert.equal(card.title, 'Innovaciones implementadas');
  assert.equal(card.value, 3);
  assert.equal(card.unit, 'proyectos');
  assert.equal(card.hasData, true);
});

const valueMatches = (value, expected) => {
  if (expected === null || typeof expected !== 'object') return value === expected;
  if (expected[Op.iLike] !== undefined) {
    return String(value).toLocaleLowerCase('es') === String(expected[Op.iLike]).toLocaleLowerCase('es');
  }
  if (expected[Op.or]) return expected[Op.or].some((condition) => valueMatches(value, condition));
  if (expected[Op.lte] !== undefined && !(value <= expected[Op.lte])) return false;
  if (expected[Op.gte] !== undefined && !(value >= expected[Op.gte])) return false;
  return true;
};

const rowMatches = (row, where) => Reflect.ownKeys(where).every((key) => {
  if (key === Op.and) return where[key].every((condition) => rowMatches(row, condition));
  return valueMatches(row[key], where[key]);
});

const project = (overrides = {}) => ({
  idProyecto: 'INN-1', anioInicio: 2025, anioTermino: 2026,
  tipoProyecto: 'Estudiantil', estado: 'Finalizado', ...overrides
});

const setupFinalizedProjects = (projects) => {
  stub(models.Department, 'findOne', async () => ({ toJSON: () => ({ key: 'innovacion' }) }));
  stub(models.IndicatorDefinition, 'findOne', async () => ({
    toJSON: () => ({
      key: 'proyectos_finalizados', departmentId: 'innovacion', name: 'Innovaciones implementadas',
      unit: 'proyectos', format: 'number', formulaKey: 'COUNT_FINALIZED_INNOVATION_PROJECTS', enabled: true
    })
  }));
  stub(models.Proyecto, 'findAll', async ({ where }) => projects.filter((row) => rowMatches(row, where)));
};

test('5. proyectos_finalizados cuenta solo estado Finalizado del año de término consultado', async () => {
  setupFinalizedProjects([
    project({ idProyecto: 'A' }),
    project({ idProyecto: 'B', tipoProyecto: 'Institucional' }),
    project({ idProyecto: 'C', estado: 'En Curso' }),
    project({ idProyecto: 'D', anioTermino: 2025 })
  ]);

  const { data } = await indicatorService.getIndicatorValue('proyectos_finalizados', {
    department: 'innovacion', year: '2026'
  });
  assert.equal(data.value, 2);
  assert.equal(data.hasData, true);
});

test('6. proyectos VCM no contaminan innovaciones implementadas', async () => {
  setupFinalizedProjects([
    project({ idProyecto: 'INN' }),
    project({ idProyecto: 'VCM', tipoProyecto: 'Fomento Productivo' })
  ]);

  const { data } = await indicatorService.getIndicatorValue('proyectos_finalizados', {
    department: 'innovacion', year: '2026'
  });
  assert.equal(data.value, 1);
});

test('7. summary sin filtro contiene EC, VCM e Innovación aunque existan otros departamentos', async () => {
  setupSummary([
    { key: 'educacion_continua', name: 'Educación Continua', enabled: true },
    { key: 'vinculacion_medio', name: 'Vinculación con el Medio', enabled: true },
    innovationDepartment,
    { key: 'institucional', name: 'Institucional', enabled: true }
  ], {
    educacion_continua: [{ key: 'oferta_programada', name: 'Oferta', unit: 'cursos', format: 'number' }],
    vinculacion_medio: [{ key: 'proyectos_vcm', name: 'Proyectos vigentes', unit: 'proyectos', format: 'number' }],
    innovacion: innovationKpis
  });

  const result = await dashboardService.getSummary({ year: '2026' });
  const ids = result.data.departments.map((department) => department.departmentId);
  assert.ok(ids.includes('educacion_continua'));
  assert.ok(ids.includes('vinculacion_medio'));
  assert.ok(ids.includes('innovacion'));
  assert.ok(ids.includes('institucional'));
});

test('8. las cards permanecen aisladas por departamento', async () => {
  setupSummary([
    { key: 'educacion_continua', name: 'Educación Continua', enabled: true },
    { key: 'vinculacion_medio', name: 'Vinculación con el Medio', enabled: true },
    innovationDepartment
  ], {
    educacion_continua: [{ key: 'oferta_programada', name: 'Oferta', unit: 'cursos', format: 'number' }],
    vinculacion_medio: [{ key: 'proyectos_vcm', name: 'Proyectos vigentes', unit: 'proyectos', format: 'number' }],
    innovacion: innovationKpis
  });

  const result = await dashboardService.getSummary({ year: '2026' });
  const byId = Object.fromEntries(result.data.departments.map((department) => [department.departmentId, department.cards]));
  assert.deepEqual(byId.educacion_continua.map((card) => card.indicatorKey), ['oferta_programada']);
  assert.deepEqual(byId.vinculacion_medio.map((card) => card.indicatorKey), ['proyectos_vcm']);
  assert.deepEqual(byId.innovacion.map((card) => card.indicatorKey), innovationKpis.map((kpi) => kpi.key));
});

test('9. seeder deja Innovación con hasData true y deshabilita definiciones provisionales', async () => {
  const departmentSeeds = [];
  const departmentUpdates = [];
  const indicatorUpdates = [];
  stub(models.Department, 'findOrCreate', async (options) => { departmentSeeds.push(options); return []; });
  stub(models.Department, 'update', async (...args) => { departmentUpdates.push(args); return [1]; });
  stub(models.IndicatorDefinition, 'findOrCreate', async () => []);
  stub(models.IndicatorDefinition, 'update', async (...args) => { indicatorUpdates.push(args); return [1]; });

  await require('../src/services/indicatorSeeder').seedIndicators();

  const innovationSeed = departmentSeeds.find((entry) => entry.where.key === 'innovacion');
  assert.equal(innovationSeed.defaults.hasData, true);
  assert.ok(departmentUpdates.some(([values, options]) => (
    values.hasData === true && options.where.key === 'innovacion'
  )));
  assert.ok(indicatorUpdates.some(([values, options]) => (
    values.enabled === false
      && options.where.departmentId === 'innovacion'
      && options.where.key.includes('proyectos_innovacion')
      && options.where.key.includes('patentes_solicitadas')
  )));
});

test('10. Swagger documenta el filtro y las cards de Innovación', () => {
  const { swaggerDocs } = require('../src/config/swagger');
  const operation = swaggerDocs.paths['/api/dashboard/summary'].get;
  const departmentParam = operation.parameters.find((parameter) => parameter.name === 'department');
  const cardSchema = operation.responses[200].content['application/json'].schema
    .properties.data.properties.departments.items.properties.cards.items.properties;

  assert.ok(departmentParam.schema.enum.includes('innovacion'));
  assert.equal(departmentParam.schema.example, 'innovacion');
  assert.ok(cardSchema.indicatorKey.enum.includes('proyectos_activos'));
  assert.ok(cardSchema.indicatorKey.enum.includes('financiamiento_obtenido'));
  assert.ok(cardSchema.indicatorKey.enum.includes('proyectos_finalizados'));
});
