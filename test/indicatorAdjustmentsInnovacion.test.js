process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const models = require('../src/models');
const indicatorService = require('../src/services/indicatorService');
const formulaService = require('../src/services/indicatorFormulaService');
const metaIndicatorIntegrationService = require('../src/services/metaIndicatorIntegrationService');
const { getIndicatorConfig } = require('../src/services/indicatorCatalog');
const { parseIndicatorFilters } = require('../src/services/indicatorFilters');
const { seedIndicators } = require('../src/services/indicatorSeeder');

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

const definitions = {
  proyectos_activos: ['COUNT_ACTIVE_INNOVATION_PROJECTS', 'proyectos'],
  total_proyectos: ['COUNT_ALL_INNOVATION_PROJECTS', 'proyectos'],
  proyectos_finalizados: ['COUNT_FINALIZED_INNOVATION_PROJECTS', 'proyectos'],
  financiamiento_obtenido: ['SUM_INNOVATION_FINANCING', 'CLP'],
  secciones_curso: ['COUNT_INNOVATION_SECTIONS', 'secciones'],
  docentes_involucrados: ['SUM_INNOVATION_TEACHERS', 'docentes']
};

const valueMatches = (value, expected) => {
  if (expected === null || typeof expected !== 'object') return value === expected;
  if (expected[Op.iLike] !== undefined) {
    return String(value).toLocaleLowerCase('es') === String(expected[Op.iLike]).toLocaleLowerCase('es');
  }
  if (expected[Op.or]) return expected[Op.or].some((condition) => valueMatches(value, condition));
  if (expected[Op.between]) return value >= expected[Op.between][0] && value <= expected[Op.between][1];
  if (expected[Op.lte] !== undefined && !(value <= expected[Op.lte])) return false;
  if (expected[Op.gte] !== undefined && !(value >= expected[Op.gte])) return false;
  return true;
};

const rowMatches = (row, where) => Reflect.ownKeys(where).every((key) => {
  if (key === Op.and) return where[key].every((condition) => rowMatches(row, condition));
  return valueMatches(row[key], where[key]);
});

const project = (overrides = {}) => ({
  idProyecto: 'INN-1',
  anioInicio: 2024,
  anioTermino: 2024,
  tipoProyecto: 'Estudiantil',
  estado: 'En Curso',
  areaTematica: 'Tecnología',
  nDocentes: 0,
  Financiamiento: null,
  ...overrides
});

const section = (overrides = {}) => ({
  idSeccion: 'SEC-1',
  anio: 2024,
  semestre: 'Otoño',
  curso: 'Emprendimiento e Innovación',
  ...overrides
});

const setupData = ({ projects = [], sections = [] } = {}) => {
  stub(models.Department, 'findOne', async ({ where }) => (
    where.key === 'innovacion' ? { toJSON: () => ({ key: 'innovacion' }) } : null
  ));
  stub(models.IndicatorDefinition, 'findOne', async ({ where }) => {
    const definition = definitions[where.key];
    if (!definition || where.departmentId !== 'innovacion') return null;
    return {
      toJSON: () => ({
        key: where.key,
        departmentId: 'innovacion',
        name: where.key,
        formulaKey: definition[0],
        unit: definition[1],
        format: definition[1] === 'CLP' ? 'currency' : 'number',
        enabled: true
      })
    };
  });
  stub(models.Proyecto, 'findAll', async ({ where }) => projects.filter((row) => rowMatches(row, where)));
  stub(models.Seccion, 'findAll', async ({ where }) => sections.filter((row) => rowMatches(row, where)));
  stub(metaIndicatorIntegrationService, 'getIndicatorMetaContext', async () => null);
};

test('rangos filtran proyectos por su dimensión temporal y year mantiene precedencia', async () => {
  setupData({ projects: [
    project({ idProyecto: 'A', anioInicio: 2021 }),
    project({ idProyecto: 'B', anioInicio: 2022 }),
    project({ idProyecto: 'C', anioInicio: 2024 }),
    project({ idProyecto: 'D', anioInicio: 2027 })
  ] });

  const { data } = await indicatorService.getIndicatorSeries('total_proyectos', {
    department: 'innovacion', fromYear: '2022', toYear: '2026'
  });
  const oneBoundary = await indicatorService.getIndicatorSeries('total_proyectos', {
    department: 'innovacion', fromYear: '2024'
  });
  const yearWins = await indicatorService.getIndicatorSeries('total_proyectos', {
    department: 'innovacion', year: '2024', fromYear: '2022', toYear: '2026'
  });
  assert.deepEqual(data.points, [
    { year: 2022, value: 1 },
    { year: 2023, value: 0 },
    { year: 2024, value: 1 },
    { year: 2025, value: 0 },
    { year: 2026, value: 0 }
  ]);
  assert.deepEqual(oneBoundary.data.points, [{ year: 2024, value: 1 }]);
  assert.deepEqual(yearWins.data.points, [{ year: 2024, value: 1 }]);
  const parsed = parseIndicatorFilters({ year: '2024', fromYear: '2022', toYear: '2026' });
  assert.equal(parsed.year, 2024);
  assert.equal(parsed.fromYear, null);
  assert.equal(parsed.toYear, null);
});

test('proyectos finalizados usan anioTermino dentro del rango', async () => {
  setupData({ projects: [
    project({ idProyecto: 'A', anioInicio: 2020, anioTermino: 2022, estado: 'Finalizado' }),
    project({ idProyecto: 'B', anioInicio: 2021, anioTermino: 2024, estado: 'Finalizado' }),
    project({ idProyecto: 'C', anioInicio: 2023, anioTermino: 2024, estado: 'En Curso' })
  ] });
  const { data } = await indicatorService.getIndicatorSeries('proyectos_finalizados', {
    department: 'innovacion', fromYear: '2022', toYear: '2024'
  });
  assert.deepEqual(data.points, [
    { year: 2022, value: 1 },
    { year: 2023, value: 0 },
    { year: 2024, value: 1 }
  ]);
});

test('serie de activos aplica solapamiento y expande cada proyecto por año', async () => {
  setupData({ projects: [
    project({ idProyecto: 'ANTES', anioInicio: 2020, anioTermino: 2024 }),
    project({ idProyecto: 'DESPUES', anioInicio: 2026, anioTermino: 2028 }),
    project({ idProyecto: 'COMPLETO', anioInicio: 2020, anioTermino: 2030 }),
    project({ idProyecto: 'FUERA', anioInicio: 2018, anioTermino: 2021 })
  ] });
  const { data } = await indicatorService.getIndicatorSeries('proyectos_activos', {
    department: 'innovacion', fromYear: '2022', toYear: '2026'
  });
  const value = await indicatorService.getIndicatorValue('proyectos_activos', {
    department: 'innovacion', fromYear: '2022', toYear: '2026'
  });
  assert.deepEqual(data.points, [
    { year: 2022, value: 2 },
    { year: 2023, value: 2 },
    { year: 2024, value: 2 },
    { year: 2025, value: 1 },
    { year: 2026, value: 2 }
  ]);
  assert.equal(value.data.value, 3);
});

test('área temática acepta nombre canónico, alias y filtro sin redefinir area global', async () => {
  setupData({ projects: [
    project({ idProyecto: 'A', areaTematica: 'Salud' }),
    project({ idProyecto: 'B', areaTematica: 'salud' }),
    project({ idProyecto: 'C', areaTematica: 'Tecnología' })
  ] });
  const canonical = await indicatorService.getIndicatorBreakdown('total_proyectos', {
    department: 'innovacion', groupBy: 'areaTematica'
  });
  const alias = await indicatorService.getIndicatorBreakdown('total_proyectos', {
    department: 'innovacion', groupBy: 'area'
  });
  const filtered = await indicatorService.getIndicatorValue('total_proyectos', {
    department: 'innovacion', area: 'SALUD'
  });
  assert.deepEqual(canonical.data.items, [
    { label: 'Salud', value: 1 },
    { label: 'salud', value: 1 },
    { label: 'Tecnología', value: 1 }
  ]);
  assert.deepEqual(alias.data.items, canonical.data.items);
  assert.equal(filtered.data.value, 2);
  assert.equal(parseIndicatorFilters({ groupBy: 'area' }).groupBy, 'area');
});

test('secciones_curso cuenta sólo el curso oficial y agrupa por semestre y año', async () => {
  setupData({ sections: [
    section({ idSeccion: 'A', anio: 2024, semestre: 'Otoño' }),
    section({ idSeccion: 'B', anio: 2024, semestre: 'Otoño', curso: 'emprendimiento e innovación' }),
    section({ idSeccion: 'C', anio: 2024, semestre: 'Primavera' }),
    section({ idSeccion: 'D', anio: 2025, semestre: 'Primavera' }),
    section({ idSeccion: 'X', curso: 'Otra asignatura' })
  ] });
  const breakdown = await indicatorService.getIndicatorBreakdown('secciones_curso', {
    department: 'innovacion', year: '2024', groupBy: 'semestre'
  });
  const series = await indicatorService.getIndicatorSeries('secciones_curso', {
    department: 'innovacion', fromYear: '2024', toYear: '2025'
  });
  const empty = await indicatorService.getIndicatorSeries('secciones_curso', {
    department: 'innovacion', year: '2030'
  });
  assert.deepEqual(breakdown.data.items, [
    { label: 'Otoño', value: 2 },
    { label: 'Primavera', value: 1 }
  ]);
  assert.deepEqual(series.data.points, [
    { year: 2024, value: 3 },
    { year: 2025, value: 1 }
  ]);
  assert.deepEqual(empty.data.points, [{ year: 2030, value: 0 }]);
});

test('docentes_involucrados suma nDocentes por anioInicio y excluye VCM', async () => {
  setupData({ projects: [
    project({ idProyecto: 'A', anioInicio: 2024, nDocentes: 2 }),
    project({ idProyecto: 'B', anioInicio: 2024, nDocentes: 3 }),
    project({ idProyecto: 'C', anioInicio: 2025, nDocentes: 0 }),
    project({ idProyecto: 'VCM', anioInicio: 2024, nDocentes: 20, tipoProyecto: 'Fomento Productivo' })
  ] });
  const { data } = await indicatorService.getIndicatorSeries('docentes_involucrados', {
    department: 'innovacion', fromYear: '2024', toYear: '2025'
  });
  assert.deepEqual(data.points, [
    { year: 2024, value: 5 },
    { year: 2025, value: 0 }
  ]);
  assert.deepEqual(formulaService.apply('SUM_INNOVATION_TEACHERS', { docentesSum: 5 }), {
    value: 5, hasData: true
  });
});

test('financiamiento conserva fuente y agrega agrupación anual por Proyecto.anioInicio', async () => {
  setupData({ projects: [
    project({ idProyecto: 'A', anioInicio: 2023, Financiamiento: { financiamientoExterno: 'Sí', fuenteFinanciamiento: 'CORFO', montoAdjudicado: 10 } }),
    project({ idProyecto: 'B', anioInicio: 2024, Financiamiento: { financiamientoExterno: 'true', fuenteFinanciamiento: 'ANID', montoAdjudicado: 20 } }),
    project({ idProyecto: 'C', anioInicio: 2024, Financiamiento: { financiamientoExterno: 'No', fuenteFinanciamiento: 'Interno', montoAdjudicado: 99 } })
  ] });
  const annual = await indicatorService.getIndicatorBreakdown('financiamiento_obtenido', {
    department: 'innovacion', fromYear: '2023', toYear: '2024', groupBy: 'anio'
  });
  const series = await indicatorService.getIndicatorSeries('financiamiento_obtenido', {
    department: 'innovacion', fromYear: '2023', toYear: '2024'
  });
  const sources = await indicatorService.getIndicatorBreakdown('financiamiento_obtenido', {
    department: 'innovacion', groupBy: 'fuente'
  });
  assert.deepEqual(annual.data.items, [
    { label: '2024', value: 20 },
    { label: '2023', value: 10 }
  ]);
  assert.deepEqual(series.data.points, [
    { year: 2023, value: 10 },
    { year: 2024, value: 20 }
  ]);
  assert.deepEqual(sources.data.items, [
    { label: 'ANID', value: 20 },
    { label: 'CORFO', value: 10 }
  ]);
  assert.deepEqual(getIndicatorConfig('financiamiento_obtenido').allowedGroupBy, ['fuente', 'year']);
});

test('catálogo registra ambos indicadores nuevos con sus fórmulas', () => {
  assert.equal(getIndicatorConfig('secciones_curso').formulaKey, 'COUNT_INNOVATION_SECTIONS');
  assert.equal(getIndicatorConfig('docentes_involucrados').formulaKey, 'SUM_INNOVATION_TEACHERS');
  assert.deepEqual(getIndicatorConfig('secciones_curso').allowedGroupBy, ['year', 'semestre']);
});

test('seeder registra secciones_curso y docentes_involucrados una sola vez por clave', async () => {
  const seeded = [];
  stub(models.Department, 'findOrCreate', async () => []);
  stub(models.Department, 'update', async () => [1]);
  stub(models.IndicatorDefinition, 'findOrCreate', async ({ where, defaults }) => {
    if (where.departmentId === 'innovacion') seeded.push(defaults);
    return [];
  });
  stub(models.IndicatorDefinition, 'update', async () => [1]);

  await seedIndicators();

  const sections = seeded.filter((definition) => definition.key === 'secciones_curso');
  const teachers = seeded.filter((definition) => definition.key === 'docentes_involucrados');
  assert.equal(sections.length, 1);
  assert.equal(sections[0].formulaKey, 'COUNT_INNOVATION_SECTIONS');
  assert.equal(teachers.length, 1);
  assert.equal(teachers[0].formulaKey, 'SUM_INNOVATION_TEACHERS');
});

test('Swagger documenta indicadores, dimensiones y año financiero de Innovación', () => {
  const { swaggerDocs } = require('../src/config/swagger');
  const series = swaggerDocs.paths['/api/indicators/{indicatorKey}/series'].get;
  const breakdown = swaggerDocs.paths['/api/indicators/{indicatorKey}/breakdown'].get;
  const seriesGroupBy = series.parameters.find((parameter) => parameter.name === 'groupBy');
  const breakdownGroupBy = breakdown.parameters.find((parameter) => parameter.name === 'groupBy');
  const documentation = JSON.stringify({ series, breakdown });

  assert.ok(seriesGroupBy.schema.enum.includes('areaTematica'));
  assert.ok(breakdownGroupBy.schema.enum.includes('semestre'));
  assert.match(documentation, /secciones_curso/);
  assert.match(documentation, /docentes_involucrados/);
  assert.match(documentation, /Proyecto\.anioInicio/);
});
