process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/piadi_test';

const test = require('node:test');
const assert = require('node:assert/strict');
const models = require('../src/models');
const dashboardController = require('../src/controllers/dashboardController');
const dashboardService = require('../src/services/dashboardService');
const indicatorService = require('../src/services/indicatorService');
const provider = require('../src/services/indicatorProvider');
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

const admissionKpis = [
  ['matricula_total', 'Matrícula total por período', 'COUNT_ADMISSION_ENROLLMENT_TOTAL'],
  ['nuevos_vs_antiguos', 'Estudiantes nuevos vs antiguos', 'COUNT_ADMISSION_NEW_VS_OLD'],
  ['matricula_por_asignatura', 'Matrícula por asignatura', 'COUNT_ADMISSION_BY_COURSE'],
  ['matricula_por_seccion', 'Matrícula por sección', 'COUNT_ADMISSION_BY_SECTION'],
  ['matricula_por_estado_academico', 'Matrícula por estado académico', 'COUNT_ADMISSION_BY_ACADEMIC_STATUS'],
  ['nivel_socioeconomico', 'Nivel socioeconómico (NSE)', 'DISTRIBUTION_ADMISSION_SOCIOECONOMIC'],
  ['situacion_familiar', 'Situación familiar', 'DISTRIBUTION_ADMISSION_FAMILY_SITUATION'],
  ['procedencia_geografica', 'Procedencia geográfica', 'DISTRIBUTION_ADMISSION_GEOGRAPHY'],
  ['tipo_colegio', 'Tipo de colegio de procedencia', 'DISTRIBUTION_ADMISSION_SCHOOL_TYPE'],
  ['via_acceso', 'Vía de acceso institucional', 'DISTRIBUTION_ADMISSION_ACCESS_ROUTE'],
  ['beneficios_becas', 'Beneficios y becas', 'DISTRIBUTION_ADMISSION_BENEFITS'],
  ['distribucion_sexo', 'Distribución por sexo', 'DISTRIBUTION_ADMISSION_GENDER'],
  ['rango_etario', 'Distribución por rango etario', 'DISTRIBUTION_ADMISSION_AGE_RANGE']
].map(([key, name, formulaKey]) => ({
  key,
  departmentId: 'admision',
  name,
  description: name,
  formulaKey,
  unit: 'estudiantes',
  format: 'number',
  enabled: true
}));

const admissionDepartment = {
  key: 'admision', name: 'Admisión', enabled: true, hasData: true, order: 6
};

const enrollmentRows = [
  {
    codCli: 'A', ramoEquiv: 'AUD-101', anio: 2026, periodo: 1, seccion: 1,
    estadoCad: 'Regular', alumno: { rut: 11111111 }, asignatura: { nombre: 'Auditoría' }
  },
  {
    codCli: 'B', ramoEquiv: 'CON-101', anio: 2026, periodo: 1, seccion: 2,
    estadoCad: 'Regular', alumno: { rut: 22222222 }, asignatura: { nombre: 'Contabilidad' }
  }
];

const characterizationRows = enrollmentRows.map((row, index) => ({
  codCli: row.codCli,
  anio: row.anio,
  periodo: row.periodo,
  alumno: {
    rut: row.alumno.rut,
    caracterizacion: {
      rut: row.alumno.rut,
      sexo: index === 0 ? 'F' : 'M',
      fechaNacimiento: index === 0 ? '2000-05-10' : '1999-08-20',
      region: index === 0 ? 'Valparaíso' : 'Biobío',
      comuna: index === 0 ? 'Valparaíso' : 'Concepción',
      tipoColegio: index === 0 ? 'Municipal' : 'Subvencionado',
      viaAcceso: index === 0 ? 'PAES' : 'Especial',
      nivelSocioeconomico: index === 0 ? 'Medio' : 'Bajo',
      situacionFamiliar: index === 0 ? 'Biparental' : 'Monoparental',
      beneficios: index === 0 ? 'Gratuidad' : 'Beca'
    }
  }
}));

const setupRealAdmissionFlow = ({ departments = [admissionDepartment], kpis = admissionKpis, noRows = false } = {}) => {
  const observedFilters = [];
  const originalEnrollmentProvider = provider.getAdmissionEnrollmentRows;
  const originalCharacterizationProvider = provider.getAdmissionCharacterizationRows;

  stub(metaIndicatorIntegrationService, 'getDashboardMetaSummary', async () => ({
    total: 0, cumplidas: 0, enRiesgo: 0, cumplimientoGlobal: 0
  }));
  stub(provider, 'isConnected', async () => true);
  stub(provider, 'getDepartments', async () => departments);
  stub(provider, 'getKpisByDepartment', async (departmentKey) => (
    departmentKey === 'admision' ? kpis : []
  ));
  stub(provider, 'getDepartmentByKey', async (departmentKey) => (
    departments.find((department) => department.key === departmentKey) || null
  ));
  stub(provider, 'getKpi', async (departmentKey, indicatorKey) => (
    departmentKey === 'admision' ? kpis.find((kpi) => kpi.key === indicatorKey) || null : null
  ));
  stub(models.MatriculaPorAsignatura, 'findAll', async (options = {}) => {
    if (noRows) return [];
    if (options.raw) {
      return [{ codCli: 'A', firstYear: 2026 }, { codCli: 'B', firstYear: 2025 }];
    }
    const isCharacterization = Boolean(options.include?.[0]?.include);
    return isCharacterization ? characterizationRows : enrollmentRows;
  });
  stub(provider, 'getAdmissionEnrollmentRows', async (filters) => {
    observedFilters.push({ kind: 'enrollment', filters });
    return originalEnrollmentProvider(filters);
  });
  stub(provider, 'getAdmissionCharacterizationRows', async (filters) => {
    observedFilters.push({ kind: 'characterization', filters });
    return originalCharacterizationProvider(filters);
  });

  return observedFilters;
};

test('summary Admisión integra los 13 KPIs habilitados mediante el motor genérico', async () => {
  const observedFilters = setupRealAdmissionFlow();
  const result = await dashboardService.getSummary({
    department: 'admision', year: '2026', periodo: '1'
  });

  assert.equal(result.data.departments.length, 1);
  const department = result.data.departments[0];
  assert.equal(department.departmentId, 'admision');
  assert.equal(department.hasIndicators, true);
  assert.deepEqual(
    department.cards.map((card) => card.indicatorKey),
    admissionKpis.map((kpi) => kpi.key)
  );

  const matricula = department.cards.find((card) => card.indicatorKey === 'matricula_total');
  assert.deepEqual(matricula, {
    indicatorKey: 'matricula_total',
    title: 'Matrícula total por período',
    value: 2,
    formattedValue: '2',
    unit: 'estudiantes',
    format: 'number',
    hasData: true
  });

  assert.equal(department.cards.find((card) => card.indicatorKey === 'nuevos_vs_antiguos').value, 2);
  for (const key of ['nivel_socioeconomico', 'procedencia_geografica', 'distribucion_sexo']) {
    const card = department.cards.find((item) => item.indicatorKey === key);
    assert.equal(card.value, 2);
    assert.equal(card.hasData, true);
  }

  const ageRange = department.cards.find((card) => card.indicatorKey === 'rango_etario');
  assert.equal(ageRange.value, null);
  assert.equal(ageRange.formattedValue, null);
  assert.equal(ageRange.hasData, false);
  assert.ok(observedFilters.every(({ filters }) => filters.year === 2026));
  for (const { filters } of observedFilters) {
    assert.deepEqual(filters.periodo, [1]);
  }
});

test('summary reenvía aliases de semester/período de Admisión sin duplicar su normalización', async () => {
  const observedFilters = setupRealAdmissionFlow({ kpis: [admissionKpis[0]] });

  await dashboardService.getSummary({ department: 'admision', year: '2026', semester: 'Segundo semestre' });
  assert.deepEqual(observedFilters.at(-1).filters.periodo, [2]);

  observedFilters.length = 0;
  await dashboardService.getSummary({ department: 'admision', year: '2026', periodo: '1er semestre' });
  assert.deepEqual(observedFilters.at(-1).filters.periodo, [1]);
});

test('un KPI de Admisión sin filas conserva la card con value null y hasData false', async () => {
  setupRealAdmissionFlow({ kpis: [admissionKpis[0]], noRows: true });
  const result = await dashboardService.getSummary({ department: 'admision', year: '2026' });
  assert.deepEqual(result.data.departments[0].cards[0], {
    indicatorKey: 'matricula_total',
    title: 'Matrícula total por período',
    value: null,
    formattedValue: null,
    unit: 'estudiantes',
    format: 'number',
    hasData: false
  });
});

test('summary global incluye Admisión junto a los demás departamentos habilitados', async () => {
  setupRealAdmissionFlow({
    departments: [
      { key: 'vinculacion_medio', name: 'Vinculación con el Medio', enabled: true },
      { key: 'innovacion', name: 'Innovación', enabled: true },
      admissionDepartment
    ]
  });

  const result = await dashboardService.getSummary({ year: '2026' });
  assert.deepEqual(result.data.departments.map((department) => department.departmentId), [
    'vinculacion_medio', 'innovacion', 'admision'
  ]);
});

test('departamento inexistente conserva HTTP 200 con departments vacío', async () => {
  setupRealAdmissionFlow();
  let statusCode;
  let body;
  const response = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    }
  };

  await dashboardController.getSummary(
    { query: { department: 'no_existe', year: '2026' } },
    response
  );

  assert.equal(statusCode, 200);
  assert.equal(body.success, true);
  assert.deepEqual(body.data.departments, []);
  assert.equal(body.data.meta.totalDepartments, 0);
  assert.equal(body.data.meta.totalCards, 0);
});

test('Swagger documenta Admisión y sus filtros semestrales en dashboard summary', () => {
  const { swaggerDocs } = require('../src/config/swagger');
  const operation = swaggerDocs.paths['/api/dashboard/summary'].get;
  const department = operation.parameters.find((parameter) => parameter.name === 'department');
  const semester = operation.parameters.find((parameter) => parameter.name === 'semester');
  const periodo = operation.parameters.find((parameter) => parameter.name === 'periodo');
  const cardProperties = operation.responses[200].content['application/json'].schema
    .properties.data.properties.departments.items.properties.cards.items.properties;

  assert.ok(department.schema.enum.includes('admision'));
  assert.match(department.description, /13 KPIs habilitados/);
  assert.match(semester.description, /Admisión/);
  assert.deepEqual(periodo.schema.enum.slice(0, 2), ['1', '2']);
  for (const key of ['matricula_total', 'nuevos_vs_antiguos', 'nivel_socioeconomico', 'rango_etario']) {
    assert.ok(cardProperties.indicatorKey.enum.includes(key));
  }
  assert.equal(cardProperties.value.nullable, true);
  assert.equal(cardProperties.formattedValue.nullable, true);
});
