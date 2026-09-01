process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const models = require('../src/models');
const dashboardService = require('../src/services/dashboardService');
const indicatorService = require('../src/services/indicatorService');
const provider = require('../src/services/indicatorProvider');

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

const vcmKpis = [
  { key: 'convenios_activos', name: 'Convenios vigentes', unit: 'convenios', format: 'number' },
  { key: 'actividades_realizadas', name: 'Actividades realizadas', unit: 'actividades', format: 'number' },
  { key: 'proyectos_vcm', name: 'Proyectos vigentes', unit: 'proyectos', format: 'number' }
];

const stubConnectedSummary = (departments, kpisByDepartment, values = {}) => {
  stub(indicatorService, 'isSourceConnected', async () => true);
  stub(indicatorService, 'listDepartments', async () => ({ data: departments }));
  stub(indicatorService, 'getEnabledKpis', async (department) => kpisByDepartment[department] || []);
  stub(indicatorService, 'getIndicatorValue', async (key, query) => ({
    data: {
      value: values[key] ?? 1,
      formattedValue: String(values[key] ?? 1),
      hasData: true,
      department: query.department
    }
  }));
};

test('summary sin department conserva el comportamiento genérico multidDepartamento', async () => {
  stubConnectedSummary(
    [
      { key: 'educacion_continua', name: 'Educación Continua', enabled: true },
      { key: 'vinculacion_medio', name: 'Vinculación con el Medio', enabled: true }
    ],
    {
      educacion_continua: [{ key: 'oferta_programada', name: 'Oferta', unit: 'cursos', format: 'number' }],
      vinculacion_medio: vcmKpis
    }
  );

  const result = await dashboardService.getSummary({ year: '2026' });
  assert.deepEqual(result.data.departments.map((item) => item.departmentId), [
    'educacion_continua', 'vinculacion_medio'
  ]);
  assert.equal(result.data.meta.totalDepartments, 2);
});

test('department=vinculacion_medio devuelve únicamente el bloque VCM', async () => {
  stubConnectedSummary(
    [
      { key: 'educacion_continua', name: 'Educación Continua', enabled: true },
      { key: 'vinculacion_medio', name: 'Vinculación con el Medio', enabled: true }
    ],
    { vinculacion_medio: vcmKpis }
  );

  const result = await dashboardService.getSummary({ department: 'vinculacion_medio', year: '2026' });
  assert.equal(result.data.departments.length, 1);
  assert.equal(result.data.departments[0].departmentId, 'vinculacion_medio');
});

test('summary VCM incluye convenios activos, actividades del año y proyectos vigentes', async () => {
  const calls = [];
  stubConnectedSummary(
    [{ key: 'vinculacion_medio', name: 'Vinculación con el Medio', enabled: true }],
    { vinculacion_medio: vcmKpis },
    { convenios_activos: 4, actividades_realizadas: 7, proyectos_vcm: 2 }
  );
  const originalGetValue = indicatorService.getIndicatorValue;
  indicatorService.getIndicatorValue = async (key, query) => {
    calls.push({ key, query });
    return originalGetValue(key, query);
  };

  const result = await dashboardService.getSummary({ department: 'vinculacion_medio', year: '2026' });
  const cards = result.data.departments[0].cards;
  assert.deepEqual(cards.map((card) => card.indicatorKey), [
    'convenios_activos', 'actividades_realizadas', 'proyectos_vcm'
  ]);
  assert.deepEqual(cards.map((card) => card.value), [4, 7, 2]);
  assert.ok(cards.every((card) => card.hasData));
  assert.ok(calls.every((call) => call.query.year === '2026'));
});

test('proyectos_vcm cuenta En Curso y excluye Finalizado usando la lógica real', async () => {
  stub(models.Proyecto, 'findAll', async () => [
    { idProyecto: 'P-1', anioInicio: 2026, estado: 'En Curso', Financiamiento: null },
    { idProyecto: 'P-2', anioInicio: 2026, estado: 'Finalizado', Financiamiento: null },
    { idProyecto: 'P-3', anioInicio: 2026, estado: 'en curso', Financiamiento: null }
  ]);
  stub(provider, 'getDepartmentByKey', async () => ({ key: 'vinculacion_medio' }));
  stub(provider, 'getKpi', async () => ({
    key: 'proyectos_vcm', formulaKey: 'COUNT_PROJECTS', format: 'number', unit: 'proyectos'
  }));

  const result = await indicatorService.getIndicatorValue('proyectos_vcm', {
    department: 'vinculacion_medio', year: '2026'
  });
  assert.equal(result.data.value, 2);
  assert.equal(result.data.hasData, true);
});
