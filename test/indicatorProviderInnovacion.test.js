process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const models = require('../src/models');
const indicatorService = require('../src/services/indicatorService');
const formulaService = require('../src/services/indicatorFormulaService');

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
  proyectos_activos: {
    key: 'proyectos_activos', departmentId: 'innovacion', name: 'Proyectos activos',
    unit: 'proyectos', format: 'number', formulaKey: 'COUNT_ACTIVE_INNOVATION_PROJECTS', enabled: true
  },
  total_proyectos: {
    key: 'total_proyectos', departmentId: 'innovacion', name: 'Total de proyectos',
    unit: 'proyectos', format: 'number', formulaKey: 'COUNT_ALL_INNOVATION_PROJECTS', enabled: true
  },
  financiamiento_obtenido: {
    key: 'financiamiento_obtenido', departmentId: 'innovacion', name: 'Financiamiento obtenido',
    unit: 'CLP', format: 'currency', formulaKey: 'SUM_INNOVATION_FINANCING', enabled: true
  },
  secciones_curso: {
    key: 'secciones_curso', departmentId: 'innovacion', name: 'Secciones del curso de innovación',
    unit: 'secciones', format: 'number', formulaKey: 'COUNT_INNOVATION_SECTIONS', enabled: true
  },
  proyectos_con_financiamiento_externo: {
    key: 'proyectos_con_financiamiento_externo', departmentId: 'innovacion', name: 'Proyectos con financiamiento externo',
    unit: 'proyectos', format: 'number', formulaKey: 'COUNT_EXTERNAL_FINANCED_PROJECTS', enabled: true
  },
  proyectos_finalizados: {
    key: 'proyectos_finalizados', departmentId: 'innovacion', name: 'Innovaciones implementadas',
    unit: 'proyectos', format: 'number', formulaKey: 'COUNT_FINALIZED_INNOVATION_PROJECTS', enabled: true
  },
  docentes_involucrados: {
    key: 'docentes_involucrados', departmentId: 'innovacion', name: 'Docentes involucrados',
    unit: 'docentes', format: 'number', formulaKey: 'SUM_INNOVATION_TEACHERS', enabled: true
  }
};

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
  idProyecto: 'INN-1',
  anioInicio: 2024,
  anioTermino: 2024,
  tipoProyecto: 'Estudiantil',
  estado: 'En Curso',
  Financiamiento: null,
  ...overrides
});

const setupData = (projects) => {
  stub(models.Department, 'findOne', async ({ where }) => (
    where.key === 'innovacion' ? { toJSON: () => ({ key: 'innovacion' }) } : null
  ));
  stub(models.IndicatorDefinition, 'findOne', async ({ where }) => {
    const definition = definitions[where.key];
    return definition && where.departmentId === 'innovacion'
      ? { toJSON: () => ({ ...definition }) }
      : null;
  });
  stub(models.Proyecto, 'findAll', async ({ where }) => projects.filter((row) => rowMatches(row, where)));
};

test('1. proyectos_activos/values usa actividad temporal histórica', async () => {
  setupData([
    project({ idProyecto: 'A', anioInicio: 2023, anioTermino: 2025, estado: 'Finalizado' }),
    project({ idProyecto: 'B', anioInicio: 2024, anioTermino: 2024 }),
    project({ idProyecto: 'C', anioInicio: 2025, anioTermino: 2026 }),
    project({ idProyecto: 'VCM', anioInicio: 2023, anioTermino: 2026, tipoProyecto: 'Fomento Productivo' })
  ]);

  const { data } = await indicatorService.getIndicatorValue('proyectos_activos', {
    department: 'innovacion', year: '2024'
  });
  assert.equal(data.value, 2);
  assert.equal(data.hasData, true);
  assert.equal(data.meta.formulaKey, 'COUNT_ACTIVE_INNOVATION_PROJECTS');
});

test('2. total_proyectos/series con groupBy=anio genera 2, 3, 1 ordenado', async () => {
  setupData([
    project({ idProyecto: 'A', anioInicio: 2023 }),
    project({ idProyecto: 'B', anioInicio: 2023, tipoProyecto: 'Institucional' }),
    project({ idProyecto: 'C', anioInicio: 2024 }),
    project({ idProyecto: 'D', anioInicio: 2024, tipoProyecto: 'Institucional' }),
    project({ idProyecto: 'E', anioInicio: 2024 }),
    project({ idProyecto: 'F', anioInicio: 2025 })
  ]);

  const { data } = await indicatorService.getIndicatorSeries('total_proyectos', {
    department: 'innovacion', groupBy: 'anio'
  });
  assert.deepEqual(data.points, [
    { year: 2023, value: 2 },
    { year: 2024, value: 3 },
    { year: 2025, value: 1 }
  ]);
});

test('3. financiamiento_obtenido/breakdown agrupa monto adjudicado externo por fuente', async () => {
  setupData([
    project({ idProyecto: 'A', Financiamiento: { fuenteFinanciamiento: 'CORFO', montoAdjudicado: 10000000, montoEjecutadoEstimado: 99000000, financiamientoExterno: 'Sí' } }),
    project({ idProyecto: 'B', Financiamiento: { fuenteFinanciamiento: 'CORFO', montoAdjudicado: 5000000, financiamientoExterno: 'si' } }),
    project({ idProyecto: 'C', tipoProyecto: 'Institucional', Financiamiento: { fuenteFinanciamiento: 'ANID', montoAdjudicado: 10000000, financiamientoExterno: 'true' } }),
    project({ idProyecto: 'D', Financiamiento: { fuenteFinanciamiento: 'Interno', montoAdjudicado: 90000000, financiamientoExterno: 'No' } })
  ]);

  const { data } = await indicatorService.getIndicatorBreakdown('financiamiento_obtenido', {
    department: 'innovacion', groupBy: 'fuente'
  });
  assert.deepEqual(data.items, [
    { label: 'CORFO', value: 15000000 },
    { label: 'ANID', value: 10000000 }
  ]);
});

test('4. filtro year aplica a anioInicio en total_proyectos', async () => {
  setupData([
    project({ idProyecto: 'A', anioInicio: 2023 }),
    project({ idProyecto: 'B', anioInicio: 2024 }),
    project({ idProyecto: 'C', anioInicio: 2024 })
  ]);
  const { data } = await indicatorService.getIndicatorValue('total_proyectos', {
    department: 'innovacion', year: '2024'
  });
  assert.equal(data.value, 2);
});

test('5. filtro tipo se aplica contextualmente a tipoProyecto', async () => {
  setupData([
    project({ idProyecto: 'A', tipoProyecto: 'Estudiantil' }),
    project({ idProyecto: 'B', tipoProyecto: 'Institucional' }),
    project({ idProyecto: 'C', tipoProyecto: 'Estudiantil' })
  ]);
  const { data } = await indicatorService.getIndicatorValue('total_proyectos', {
    department: 'innovacion', tipo: 'Institucional'
  });
  assert.equal(data.value, 1);
});

test('6. filtro estado se aplica al campo Proyecto.estado', async () => {
  setupData([
    project({ idProyecto: 'A', estado: 'En Curso' }),
    project({ idProyecto: 'B', estado: 'Finalizado' }),
    project({ idProyecto: 'C', estado: 'Finalizado' })
  ]);
  const { data } = await indicatorService.getIndicatorValue('total_proyectos', {
    department: 'innovacion', estado: 'Finalizado'
  });
  assert.equal(data.value, 2);
});

test('7. combinación year, tipo y estado aplica todas las condiciones', async () => {
  setupData([
    project({ idProyecto: 'A', anioInicio: 2024, tipoProyecto: 'Estudiantil', estado: 'Finalizado' }),
    project({ idProyecto: 'B', anioInicio: 2024, tipoProyecto: 'Institucional', estado: 'Finalizado' }),
    project({ idProyecto: 'C', anioInicio: 2023, tipoProyecto: 'Estudiantil', estado: 'Finalizado' }),
    project({ idProyecto: 'D', anioInicio: 2024, tipoProyecto: 'Estudiantil', estado: 'En Curso' })
  ]);
  const { data } = await indicatorService.getIndicatorValue('total_proyectos', {
    department: 'innovacion', year: '2024', tipo: 'Estudiantil', estado: 'Finalizado'
  });
  assert.equal(data.value, 1);
});

test('8. una llamada posterior sin filtros recupera el total completo', async () => {
  setupData([
    project({ idProyecto: 'A', tipoProyecto: 'Estudiantil' }),
    project({ idProyecto: 'B', tipoProyecto: 'Institucional' })
  ]);
  const filtered = await indicatorService.getIndicatorValue('total_proyectos', {
    department: 'innovacion', tipo: 'Estudiantil'
  });
  const complete = await indicatorService.getIndicatorValue('total_proyectos', {
    department: 'innovacion'
  });
  assert.equal(filtered.data.value, 1);
  assert.equal(complete.data.value, 2);
});

test('9. tipos de proyecto VCM no contaminan el dominio Innovación', async () => {
  setupData([
    project({ idProyecto: 'INN-A', tipoProyecto: 'Estudiantil' }),
    project({ idProyecto: 'INN-B', tipoProyecto: 'Institucional' }),
    project({ idProyecto: 'VCM-A', tipoProyecto: 'Fomento Productivo' }),
    project({ idProyecto: 'VCM-B', tipoProyecto: 'Asistencia Técnica' })
  ]);
  const { data } = await indicatorService.getIndicatorValue('total_proyectos', {
    department: 'innovacion'
  });
  assert.equal(data.value, 2);
});

test('10. regresión Educación Continua conserva su fórmula', () => {
  assert.deepEqual(formulaService.apply('COUNT_PROGRAMMED_OFFER', { ofertaProgramada: 4 }), {
    value: 4, hasData: true
  });
});

test('11. regresión VCM conserva sus fórmulas', () => {
  assert.deepEqual(formulaService.apply('COUNT_PROJECTS', { proyectosCount: 3 }), {
    value: 3, hasData: true
  });
  assert.deepEqual(formulaService.apply('FINANCING_SUM', { financiamientoSum: 1200 }), {
    value: 1200, hasData: true
  });
});
