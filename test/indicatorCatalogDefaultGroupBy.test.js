process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/piadi_test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { INDICATORS } = require('../src/services/indicatorCatalog');
const provider = require('../src/services/indicatorProvider');
const service = require('../src/services/indicatorService');
const metaIntegration = require('../src/services/metaIndicatorIntegrationService');
const cache = require('../src/services/cacheService');

const requested = {
  matricula_por_seccion: 'seccion',
  matricula_por_estado_academico: 'estadoAcademico',
  nuevos_vs_antiguos: 'nuevoAntiguo',
  nivel_socioeconomico: 'nivelSocioeconomico',
  situacion_familiar: 'situacionFamiliar',
  procedencia_geografica: 'region',
  tipo_colegio: 'tipoColegio',
  via_acceso: 'viaAcceso',
  beneficios_becas: 'beneficios',
  distribucion_sexo: 'sexo',
  rango_etario: 'rangoEtario',
  convenios_por_sector: 'sector',
  matricula_por_programa: 'programa',
  perfil_participante: 'sexo',
  tasa_aprobacion_asignatura: 'asignatura',
  tasa_reprobacion_asignatura: 'asignatura',
  asignaturas_criticas: 'asignatura'
};

test('solo los 17 indicadores solicitados ganan defaults válidos y se conserva el anterior', () => {
  assert.equal(Object.keys(requested).length, 17);
  const actual = Object.entries(INDICATORS)
    .filter(([, config]) => config.defaultGroupBy !== undefined)
    .map(([key]) => key)
    .sort();
  assert.deepEqual(actual, [...Object.keys(requested), 'matricula_por_asignatura'].sort());
  for (const [key, dimension] of Object.entries(requested)) {
    assert.equal(INDICATORS[key].defaultGroupBy, dimension, key);
    assert.ok(INDICATORS[key].allowedGroupBy.includes(dimension), key);
  }
  assert.equal(INDICATORS.matricula_por_asignatura.defaultGroupBy, 'asignatura');
  for (const key of ['matricula_total', 'tasa_aprobacion', 'total_convenios', 'proyectos_activos']) {
    assert.equal(INDICATORS[key].defaultGroupBy, undefined, key);
  }
  assert.equal(INDICATORS.tasa_aprobacion_asignatura.kind, 'curricular_rendimiento');
  assert.equal(INDICATORS.tasa_aprobacion_asignatura.formulaKey, 'APPROVAL_RATE_BY_COURSE');
  assert.equal(INDICATORS.tasa_reprobacion_asignatura.formulaKey, 'FAILURE_RATE_BY_COURSE');
  assert.equal(INDICATORS.asignaturas_criticas.formulaKey, 'CRITICAL_COURSES');
});

const originals = [];
const stub = (object, key, replacement) => {
  originals.push([object, key, object[key]]);
  object[key] = replacement;
};
test.afterEach(() => {
  cache.flush();
  while (originals.length) {
    const [object, key, original] = originals.pop();
    object[key] = original;
  }
});

const enrollment = [
  { codCli: 'A', anio: 2024, periodo: 1, asignatura: 'Álgebra', seccion: 1, estadoAcademico: 'Regular', nuevoAntiguo: 'nuevo' },
  { codCli: 'B', anio: 2024, periodo: 2, asignatura: 'Historia', seccion: 2, estadoAcademico: 'Egresado', nuevoAntiguo: 'antiguo' },
  { codCli: 'C', anio: 2025, periodo: 1, asignatura: 'Álgebra', seccion: 1, estadoAcademico: 'Regular', nuevoAntiguo: 'nuevo' }
];
const characterization = enrollment.map((row, index) => ({
  ...row, rut: index + 1, nivelSocioeconomico: index === 1 ? 'Alto' : 'Bajo',
  situacionFamiliar: index === 1 ? 'Solo' : 'Familia', region: index === 1 ? 'Sur' : 'Norte',
  tipoColegio: index === 1 ? 'Privado' : 'Público', viaAcceso: index === 1 ? 'Especial' : 'Regular',
  beneficios: index === 1 ? 'Beca' : 'Gratuidad', sexo: index === 1 ? 'M' : 'F',
  rangoEtario: index === 1 ? '25-29' : '20-24'
}));
const convenios = [
  { idConvenio: 1, anio: 2024, sector: 'Público', region: 'Norte' },
  { idConvenio: 2, anio: 2025, sector: 'Privado', region: 'Sur' }
];
const programs = [
  { idPrograma: 1, anio: 2024, programa: 'Diplomado A', matricula: 10 },
  { idPrograma: 2, anio: 2025, programa: 'Diplomado B', matricula: 20 }
];
const participants = [
  { idParticipante: 1, anio: 2024, sexo: 'F' },
  { idParticipante: 2, anio: 2025, sexo: 'M' }
];

const filtered = (rows, filters) => rows.filter((row) =>
  (filters.year == null || row.anio === filters.year)
  && (filters.fromYear == null || row.anio >= filters.fromYear)
  && (filters.toYear == null || row.anio <= filters.toYear)
  && (!filters.periodo?.length || filters.periodo.includes(row.periodo))
);

const departmentFor = (key) => {
  if (key === 'convenios_por_sector') return 'vinculacion_medio';
  if (key === 'matricula_por_programa' || key === 'perfil_participante') return 'educacion_continua';
  return 'admision';
};

const fixture = (key) => {
  const departmentId = departmentFor(key);
  stub(provider, 'getDepartmentByKey', async () => ({ key: departmentId }));
  stub(provider, 'getKpi', async () => ({
    key, departmentId, name: key, description: key, enabled: true,
    formulaKey: INDICATORS[key].formulaKey, unit: 'personas', format: 'number'
  }));
  stub(provider, 'getAdmissionEnrollmentRows', async (filters) => filtered(enrollment, filters));
  stub(provider, 'getAdmissionCharacterizationRows', async (filters) => filtered(characterization, filters));
  stub(provider, 'getVcmConvenioRows', async (filters) => filtered(convenios, filters));
  stub(provider, 'getProgramRows', async (filters) => filtered(programs, filters));
  stub(provider, 'getParticipantRows', async (filters) => filtered(participants, filters));
  stub(metaIntegration, 'getIndicatorMetaContext', async () => null);
};

for (const [key, dimension] of Object.entries(requested).filter(([key]) => !key.startsWith('tasa_') && key !== 'asignaturas_criticas')) {
  test(`detail de ${key} usa ${dimension} con filas calculadas`, async () => {
    fixture(key);
    const view = await service.getIndicatorDetail(key);
    assert.equal(view.groupBy, dimension);
    assert.equal(view.disaggregated, true);
    assert.ok(view.table.length > 0);
    assert.ok(view.table.every((item) => item.label !== undefined && item.value !== null));
    assert.ok(view.series.length > 0);
    assert.ok(view.series.every((item) => item.label !== undefined && item.points.length > 0));
    assert.equal(view.hasData, true);
    assert.ok(view.total !== null);
    assert.ok(view.formattedTotal !== null);
    assert.deepEqual(view.period, { from: 2024, to: 2025 });
    const previousValue = view.series.reduce(
      (sum, item) => sum + (item.points.find((point) => point.year === 2024)?.value || 0), 0
    );
    assert.deepEqual(view.comparison, { previousYear: 2024, previousValue, diff: view.total - previousValue });
  });
}

test('detail respeta year, vacío, otra dimensión, inválido y filtros sin alterar /values', async () => {
  fixture('matricula_por_seccion');
  for (const groupBy of ['year', '']) {
    const view = await service.getIndicatorDetail('matricula_por_seccion', { groupBy });
    assert.equal(view.groupBy, groupBy || null);
    assert.equal(view.disaggregated, false);
    assert.deepEqual(view.series, [{ year: 2024, value: 2 }, { year: 2025, value: 1 }]);
    assert.deepEqual(view.table, view.series);
  }
  const alternative = await service.getIndicatorDetail('matricula_por_seccion', { groupBy: 'asignatura' });
  assert.equal(alternative.groupBy, 'asignatura');
  assert.equal(alternative.disaggregated, true);
  await assert.rejects(
    service.getIndicatorDetail('matricula_por_seccion', { groupBy: 'invalid' }),
    (error) => error.statusCode === 400 && error.code === 'INVALID_GROUP_BY'
  );
  for (const query of [
    { year: '2024' }, { fromYear: '2024', toYear: '2025' }, { periodo: '1' },
    { year: '2024', periodo: '1' }, { groupBy: '', year: '2024' }
  ]) {
    const view = await service.getIndicatorDetail('matricula_por_seccion', query);
    assert.equal(view.groupBy, query.groupBy === '' ? null : 'seccion');
    assert.equal(view.hasData, true);
  }
  const value = await service.getIndicatorValue('matricula_por_seccion', { department: 'admision', year: '2024' });
  assert.equal(value.data.value, 2);
});

test('indicador sin default e Innovación conservan vista temporal', async () => {
  fixture('matricula_total');
  const enrollmentView = await service.getIndicatorDetail('matricula_total');
  assert.equal(enrollmentView.groupBy, null);
  assert.equal(enrollmentView.disaggregated, false);
  assert.deepEqual(enrollmentView.series, [{ year: 2024, value: 2 }, { year: 2025, value: 1 }]);
  assert.equal(INDICATORS.proyectos_activos.defaultGroupBy, undefined);
});

for (const [key, alternative] of [
  ['convenios_por_sector', 'region'],
  ['matricula_por_programa', 'area'],
  ['perfil_participante', 'region']
]) {
  test(`${key} respeta overrides, vista temporal y filtros`, async () => {
    fixture(key);
    // perfil_participante no admite year en allowedGroupBy desde antes de este cambio.
    for (const groupBy of key === 'perfil_participante' ? [''] : ['year', '']) {
      const view = await service.getIndicatorDetail(key, { groupBy });
      assert.equal(view.groupBy, groupBy || null);
      assert.equal(view.disaggregated, false);
      assert.deepEqual(view.table, view.series);
      assert.equal(view.series.length, 2);
    }
    if (key === 'perfil_participante') {
      await assert.rejects(
        service.getIndicatorDetail(key, { groupBy: 'year' }),
        (error) => error.statusCode === 400 && error.code === 'INVALID_GROUP_BY'
      );
    }
    const alternativeView = await service.getIndicatorDetail(key, { groupBy: alternative });
    assert.equal(alternativeView.groupBy, alternative);
    assert.equal(alternativeView.disaggregated, true);
    assert.ok(alternativeView.table.length > 0);
    for (const query of [{ year: '2024' }, { fromYear: '2024', toYear: '2025' }]) {
      const view = await service.getIndicatorDetail(key, query);
      assert.equal(view.groupBy, requested[key]);
      assert.equal(view.hasData, true);
    }
    await assert.rejects(
      service.getIndicatorDetail(key, { groupBy: 'invalid' }),
      (error) => error.statusCode === 400 && error.code === 'INVALID_GROUP_BY'
    );
  });
}
