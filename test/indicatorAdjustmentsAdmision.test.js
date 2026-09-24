process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/piadi_test';

const test = require('node:test');
const assert = require('node:assert/strict');
const provider = require('../src/services/indicatorProvider');
const indicatorService = require('../src/services/indicatorService');
const formulaService = require('../src/services/indicatorFormulaService');
const metaIndicatorIntegrationService = require('../src/services/metaIndicatorIntegrationService');
const { parseIndicatorFilters } = require('../src/services/indicatorFilters');
const { MatriculaPorAsignatura } = require('../src/models');
const { swaggerDocs } = require('../src/config/swagger');

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

test.beforeEach(() => {
  stub(metaIndicatorIntegrationService, 'getIndicatorMetaContext', async () => null);
});

const formulas = {
  matricula_total: 'COUNT_ADMISSION_ENROLLMENT_TOTAL',
  nuevos_vs_antiguos: 'COUNT_ADMISSION_NEW_VS_OLD',
  matricula_por_asignatura: 'COUNT_ADMISSION_BY_COURSE',
  matricula_por_seccion: 'COUNT_ADMISSION_BY_SECTION',
  matricula_por_estado_academico: 'COUNT_ADMISSION_BY_ACADEMIC_STATUS',
  nivel_socioeconomico: 'DISTRIBUTION_ADMISSION_SOCIOECONOMIC',
  situacion_familiar: 'DISTRIBUTION_ADMISSION_FAMILY_SITUATION',
  procedencia_geografica: 'DISTRIBUTION_ADMISSION_GEOGRAPHY',
  tipo_colegio: 'DISTRIBUTION_ADMISSION_SCHOOL_TYPE',
  via_acceso: 'DISTRIBUTION_ADMISSION_ACCESS_ROUTE',
  beneficios_becas: 'DISTRIBUTION_ADMISSION_BENEFITS',
  distribucion_sexo: 'DISTRIBUTION_ADMISSION_GENDER',
  rango_etario: 'DISTRIBUTION_ADMISSION_AGE_RANGE'
};

const stubKpi = (key) => {
  stub(provider, 'getDepartmentByKey', async () => ({ key: 'admision' }));
  stub(provider, 'getKpi', async () => ({
    key, departmentId: 'admision', name: key, description: key,
    formulaKey: formulas[key], format: 'number', unit: 'estudiantes', enabled: true
  }));
};

const enrollment = (codCli, overrides = {}) => ({
  codCli, anio: 2026, periodo: 1, asignatura: 'Auditoría', seccion: 1,
  estadoAcademico: 'Regular', nuevoAntiguo: 'nuevo', ...overrides
});

test('matricula_total cuenta estudiantes únicos y no inscripciones', async () => {
  stubKpi('matricula_total');
  stub(provider, 'getAdmissionEnrollmentRows', async () => [
    ...Array.from({ length: 5 }, (_, index) => enrollment('A', { asignatura: `A-${index}` })),
    ...Array.from({ length: 3 }, (_, index) => enrollment('B', { asignatura: `B-${index}` }))
  ]);
  const result = await indicatorService.getIndicatorValue('matricula_total', { department: 'admision', year: '2026' });
  assert.equal(result.data.value, 2);
  assert.equal(result.data.hasData, true);
});

test('breakdown por asignatura, sección y estado cuenta codCli únicos dentro de cada grupo', async () => {
  const rows = [
    enrollment('A'), enrollment('A'), enrollment('B'),
    enrollment('C', { asignatura: 'Contabilidad', seccion: 2, estadoAcademico: 'Egresado' })
  ];
  for (const [key, groupBy] of [
    ['matricula_por_asignatura', 'asignatura'],
    ['matricula_por_seccion', 'seccion'],
    ['matricula_por_estado_academico', 'estadoAcademico']
  ]) {
    stubKpi(key);
    stub(provider, 'getAdmissionEnrollmentRows', async () => rows);
    const result = await indicatorService.getIndicatorBreakdown(key, { department: 'admision', groupBy });
    assert.equal(result.data.items.reduce((sum, item) => sum + item.value, 0), 3);
  }
});

test('nuevos vs antiguos usa la dimensión derivada y cuenta estudiantes únicos', async () => {
  stubKpi('nuevos_vs_antiguos');
  stub(provider, 'getAdmissionEnrollmentRows', async () => [
    enrollment('A', { nuevoAntiguo: 'antiguo' }),
    enrollment('A', { nuevoAntiguo: 'antiguo', asignatura: 'Contabilidad' }),
    enrollment('B', { nuevoAntiguo: 'nuevo' })
  ]);
  const result = await indicatorService.getIndicatorBreakdown('nuevos_vs_antiguos', {
    department: 'admision', year: '2026', groupBy: 'nuevoAntiguo'
  });
  assert.deepEqual(result.data.items, [
    { label: 'antiguo', value: 1 },
    { label: 'nuevo', value: 1 }
  ]);
});

test('distribuciones de caracterización cuentan un estudiante por identidad', async () => {
  const rows = [
    {
      codCli: 'A', rut: 1, anio: 2026, periodo: 1, sexo: 'F', nivelSocioeconomico: 'Medio',
      situacionFamiliar: 'Biparental', region: 'Valparaíso', comuna: 'Valparaíso',
      tipoColegio: 'Municipal', viaAcceso: 'PAES', beneficios: 'Gratuidad'
    },
    {
      codCli: 'A', rut: 1, anio: 2026, periodo: 1, sexo: 'F', nivelSocioeconomico: 'Medio',
      situacionFamiliar: 'Biparental', region: 'Valparaíso', comuna: 'Valparaíso',
      tipoColegio: 'Municipal', viaAcceso: 'PAES', beneficios: 'Gratuidad'
    },
    {
      codCli: 'B', rut: 2, anio: 2026, periodo: 1, sexo: 'M', nivelSocioeconomico: 'Bajo',
      situacionFamiliar: 'Monoparental', region: 'Biobío', comuna: 'Concepción',
      tipoColegio: 'Subvencionado', viaAcceso: 'Especial', beneficios: 'Beca'
    }
  ];
  for (const [key, groupBy] of [
    ['distribucion_sexo', 'sexo'],
    ['nivel_socioeconomico', 'nivelSocioeconomico'],
    ['situacion_familiar', 'situacionFamiliar'],
    ['procedencia_geografica', 'region'],
    ['procedencia_geografica', 'comuna'],
    ['tipo_colegio', 'tipoColegio'],
    ['via_acceso', 'viaAcceso'],
    ['beneficios_becas', 'beneficios']
  ]) {
    stubKpi(key);
    stub(provider, 'getAdmissionCharacterizationRows', async () => rows);
    const result = await indicatorService.getIndicatorBreakdown(key, { department: 'admision', groupBy });
    assert.equal(result.data.items.reduce((sum, item) => sum + item.value, 0), 2);
  }
});

test('rango_etario queda protegido mientras no existan tramos institucionales', async () => {
  stubKpi('rango_etario');
  stub(provider, 'getAdmissionCharacterizationRows', async () => [
    { codCli: 'A', rut: 1, anio: 2026, periodo: 1, edad: 20, rangoEtario: null }
  ]);
  const result = await indicatorService.getIndicatorValue('rango_etario', { department: 'admision', year: '2026' });
  assert.equal(result.data.value, null);
  assert.equal(result.data.hasData, false);
});

test('período admite aliases 1/2, rechaza 3/4 y groupBy=periodo se conserva', async () => {
  assert.deepEqual(parseIndicatorFilters({ department: 'admision', periodo: '1' }).periodo, [1]);
  assert.deepEqual(parseIndicatorFilters({ department: 'admision', semester: 'Segundo semestre' }).periodo, [2]);
  assert.equal(parseIndicatorFilters({ department: 'admision', groupBy: 'periodo' }).groupBy, 'periodo');
  assert.throws(() => parseIndicatorFilters({ department: 'admision', periodo: '3' }), /semestre 1 o 2/);
  assert.throws(() => parseIndicatorFilters({ department: 'admision', periodo: '4' }), /semestre 1 o 2/);

  const periodoValidation = MatriculaPorAsignatura.rawAttributes.periodo.validate;
  assert.equal(periodoValidation.min, 1);
  assert.equal(periodoValidation.max, 2);
});

test('las 13 fórmulas están registradas y reutilizan el conteo común salvo rango etario', () => {
  for (const [key, formulaKey] of Object.entries(formulas)) {
    assert.equal(typeof formulaService.formulaRegistry[formulaKey], 'function', `${key} debe registrar ${formulaKey}`);
  }
  assert.deepEqual(formulaService.apply('COUNT_ADMISSION_BY_COURSE', { admissionUniqueCount: 3 }), {
    value: 3, hasData: true
  });
  assert.deepEqual(formulaService.apply('DISTRIBUTION_ADMISSION_AGE_RANGE', { admissionUniqueCount: 3 }), {
    value: null, hasData: false
  });
});

test('motor genérico entrega series por período y detail reutiliza esas series', async () => {
  stubKpi('matricula_total');
  stub(provider, 'getAdmissionEnrollmentRows', async () => [
    enrollment('A', { periodo: 1 }),
    enrollment('A', { periodo: 1, asignatura: 'Contabilidad' }),
    enrollment('B', { periodo: 2 })
  ]);

  const series = await indicatorService.getIndicatorSeries('matricula_total', {
    department: 'admision', year: '2026', groupBy: 'periodo'
  });
  assert.deepEqual(series.data.series, [
    { label: '1', points: [{ year: 2026, value: 1 }] },
    { label: '2', points: [{ year: 2026, value: 1 }] }
  ]);

  const detail = await indicatorService.getIndicatorDetail('matricula_total', { year: '2026' });
  assert.deepEqual(detail.data, [
    { period: '2026-P1', value: 1 },
    { period: '2026-P2', value: 1 }
  ]);
});

test('Swagger documenta período y dimensiones de Admisión', () => {
  const valueParameters = swaggerDocs.paths['/api/indicators/{indicatorKey}/values'].get.parameters;
  assert.ok(valueParameters.some((parameter) => parameter.name === 'periodo'));
  assert.ok(valueParameters.some((parameter) => parameter.name === 'nuevoAntiguo'));
  const groupBy = swaggerDocs.paths['/api/indicators/{indicatorKey}/breakdown'].get.parameters
    .find((parameter) => parameter.name === 'groupBy');
  for (const dimension of ['periodo', 'asignatura', 'seccion', 'estadoAcademico', 'nuevoAntiguo', 'edad']) {
    assert.ok(groupBy.schema.enum.includes(dimension), `Swagger debe incluir groupBy=${dimension}`);
  }
});
