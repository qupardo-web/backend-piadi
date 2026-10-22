process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/piadi_test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const models = require('../src/models');
const provider = require('../src/services/indicatorProvider');
const service = require('../src/services/indicatorService');
const formulas = require('../src/services/indicatorFormulaService');
const { INDICATORS } = require('../src/services/indicatorCatalog');
const { parseIndicatorFilters } = require('../src/services/indicatorFilters');
const metaIntegration = require('../src/services/metaIndicatorIntegrationService');
const cache = require('../src/services/cacheService');

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

const rendimiento = [
  ...Array.from({ length: 10 }, (_, index) => ({
    rut: index + 1, ramoEquiv: 'MAT', asignatura: 'Matemática', anio: 2024,
    periodo: 1, seccion: 1, estadoAsignatura: index < 3 ? 'REPROBADO' : 'APROBADO'
  })),
  ...Array.from({ length: 4 }, (_, index) => ({
    rut: index + 11, ramoEquiv: 'HIS', asignatura: 'Historia', anio: 2024,
    periodo: 2, seccion: 2, estadoAsignatura: index < 2 ? 'REPROBADO' : 'APROBADO'
  })),
  { rut: 20, ramoEquiv: 'MAT', asignatura: 'Matemática', anio: 2025,
    periodo: 1, seccion: 1, estadoAsignatura: 'APROBADO' }
];
const practicas = [
  { rut: 1, anio: 2024, periodo: 1, tipoPractica: 'Profesional', estado: 'INSCRITA' },
  { rut: 1, anio: 2024, periodo: 1, tipoPractica: 'Intermedia', estado: 'APROBADA' },
  { rut: 2, anio: 2024, periodo: 1, tipoPractica: 'Profesional', estado: 'INSCRITA' },
  { rut: 3, anio: 2024, periodo: 2, tipoPractica: 'Profesional', estado: 'APROBADA' },
  { rut: 4, anio: 2025, periodo: 1, tipoPractica: 'Profesional', estado: 'INSCRITA' }
];
const titulaciones = [
  { rut: 1, anio: 2024, periodo: 1, cohorte: 2020, semestresCursados: 8 },
  { rut: 1, anio: 2024, periodo: 1, cohorte: 2020, semestresCursados: 8 },
  { rut: 2, anio: 2024, periodo: 2, cohorte: 2020, semestresCursados: null },
  { rut: 3, anio: 2025, periodo: 1, cohorte: 2021, semestresCursados: 10 }
];

const applyFilters = (rows, filters) => rows.filter((row) =>
  (filters.year == null || row.anio === filters.year)
  && (filters.fromYear == null || row.anio >= filters.fromYear)
  && (filters.toYear == null || row.anio <= filters.toYear)
  && (!filters.periodo?.length || filters.periodo.includes(row.periodo))
  && (!filters.asignatura?.length || filters.asignatura.includes(row.asignatura))
  && (!filters.seccion?.length || filters.seccion.includes(row.seccion))
  && (!filters.tipoPractica?.length || filters.tipoPractica.includes(row.tipoPractica))
  && (!filters.estado?.length || filters.estado.includes(row.estado))
  && (!filters.cohorte?.length || filters.cohorte.includes(row.cohorte))
);

const fixture = (key, rows = {}) => {
  stub(provider, 'getDepartmentByKey', async () => ({ key: 'desarrollo_curricular' }));
  stub(provider, 'getKpi', async (_department, requestedKey) => ({
    key: requestedKey, departmentId: 'desarrollo_curricular', name: requestedKey,
    description: requestedKey, formulaKey: INDICATORS[requestedKey].formulaKey,
    format: requestedKey.startsWith('tasa_') ? 'percentage' : 'number', unit: 'unidades'
  }));
  stub(provider, 'getCurricularRendimientoRows', async (filters) => applyFilters(rows.rendimiento || rendimiento, filters));
  stub(provider, 'getCurricularPracticaRows', async (filters) => applyFilters(rows.practicas || practicas, filters));
  stub(provider, 'getCurricularTitulacionRows', async (filters) => applyFilters(rows.titulaciones || titulaciones, filters));
  stub(metaIntegration, 'getIndicatorMetaContext', async () => null);
};

const query = (extra = {}) => ({ department: 'desarrollo_curricular', ...extra });

test('ocho claves curriculares tienen fórmula registrada y sus tres fuentes', () => {
  for (const key of [
    'tasa_aprobacion_asignatura', 'tasa_reprobacion_asignatura', 'asignaturas_criticas',
    'practicas_inscritas', 'practicas_aprobadas', 'tasa_titulacion_cohorte',
    'titulados_por_anio', 'tiempo_promedio_titulacion'
  ]) {
    assert.equal(typeof formulas.formulaRegistry[INDICATORS[key].formulaKey], 'function', key);
  }
  assert.deepEqual(formulas.apply('GRADUATION_RATE_BY_COHORT', {}), { value: null, hasData: false });
});

test('tasas usan 14 evaluaciones y no promedian tasas por asignatura', async () => {
  fixture('tasa_aprobacion_asignatura');
  const approved = await service.getIndicatorValue('tasa_aprobacion_asignatura', query({ year: 2024 }));
  const failed = await service.getIndicatorValue('tasa_reprobacion_asignatura', query({ year: 2024 }));
  assert.equal(approved.data.value, 64.29); // 9/14
  assert.equal(failed.data.value, 35.71); // 5/14
  const groups = await service.getIndicatorBreakdown('tasa_reprobacion_asignatura', query({
    year: 2024, groupBy: 'asignatura'
  }));
  assert.deepEqual(groups.data.items, [
    { label: 'Historia', value: 50 }, { label: 'Matemática', value: 30 }
  ]);
});

test('sólo la reprobación superior a 30 % es crítica; desglose la identifica', async () => {
  fixture('asignaturas_criticas');
  const value = await service.getIndicatorValue('asignaturas_criticas', query({ year: 2024 }));
  assert.equal(value.data.value, 1);
  const breakdown = await service.getIndicatorBreakdown('asignaturas_criticas', query({
    year: 2024, groupBy: 'asignatura'
  }));
  assert.deepEqual(breakdown.data.items, [
    { label: 'Historia', value: 1 }, { label: 'Matemática', value: 0 }
  ]);
  const exactlyThirty = await service.getIndicatorValue('asignaturas_criticas', query({
    year: 2024, asignatura: 'Matemática'
  }));
  assert.equal(exactlyThirty.data.value, 0);
});

test('prácticas cuenta estudiantes únicos; APROBADA también integra inscritas', async () => {
  fixture('practicas_inscritas');
  const registered = await service.getIndicatorValue('practicas_inscritas', query({ year: 2024 }));
  const approved = await service.getIndicatorValue('practicas_aprobadas', query({ year: 2024 }));
  assert.equal(registered.data.value, 3);
  assert.equal(approved.data.value, 2);
  const byState = await service.getIndicatorBreakdown('practicas_inscritas', query({
    year: 2024, groupBy: 'estado'
  }));
  assert.deepEqual(byState.data.items, [
    { label: 'INSCRITA', value: 2 }, { label: 'APROBADA', value: 2 }
  ]);
  const onlyRegistered = await service.getIndicatorValue('practicas_aprobadas', query({
    year: 2024, estado: 'INSCRITA'
  }));
  assert.equal(onlyRegistered.data.value, 0);
  assert.equal(onlyRegistered.data.hasData, true);
});

test('titulación cuenta RUT únicos y promedia sólo semestres informados', async () => {
  fixture('titulados_por_anio');
  const graduates = await service.getIndicatorValue('titulados_por_anio', query({ year: 2024 }));
  const average = await service.getIndicatorValue('tiempo_promedio_titulacion', query({ year: 2024 }));
  assert.equal(graduates.data.value, 2);
  assert.equal(average.data.value, 8);
  const cohort = await service.getIndicatorBreakdown('tiempo_promedio_titulacion', query({ groupBy: 'cohorte' }));
  assert.deepEqual(cohort.data.items, [
    { label: '2021', value: 10 }, { label: '2020', value: 8 }
  ]);
  const all = await service.getIndicatorValue('tiempo_promedio_titulacion', query());
  assert.equal(all.data.value, 9);
});

test('tasa por cohorte queda nula en todos los contratos sin denominador oficial', async () => {
  fixture('tasa_titulacion_cohorte');
  const value = await service.getIndicatorValue('tasa_titulacion_cohorte', query({ cohorte: 2020 }));
  assert.equal(value.data.value, null);
  assert.equal(value.data.hasData, false);
  const series = await service.getIndicatorSeries('tasa_titulacion_cohorte', query({ fromYear: 2024, toYear: 2025 }));
  assert.deepEqual(series.data.points, [
    { year: 2024, value: null }, { year: 2025, value: null }
  ]);
  const breakdown = await service.getIndicatorBreakdown('tasa_titulacion_cohorte', query({ groupBy: 'cohorte' }));
  assert.deepEqual(breakdown.data.items, []);
  assert.equal(breakdown.data.hasData, false);
  const detail = await service.getIndicatorDetail('tasa_titulacion_cohorte');
  assert.equal(detail.total, null);
  assert.equal(detail.hasData, false);
  assert.equal(detail.formattedTotal, null);
});

test('filtros temporales y período mantienen series, detalle y ceros/nulos coherentes', async () => {
  fixture('tasa_aprobacion_asignatura');
  const filtered = await service.getIndicatorValue('tasa_aprobacion_asignatura', query({
    year: 2024, periodo: 2
  }));
  assert.equal(filtered.data.value, 50);
  const annual = await service.getIndicatorSeries('tasa_aprobacion_asignatura', query({
    fromYear: 2023, toYear: 2025
  }));
  assert.deepEqual(annual.data.points, [
    { year: 2023, value: null }, { year: 2024, value: 64.29 }, { year: 2025, value: 100 }
  ]);
  const byPeriod = await service.getIndicatorBreakdown('tasa_aprobacion_asignatura', query({
    year: 2024, groupBy: 'periodo'
  }));
  assert.deepEqual(byPeriod.data.items, [
    { label: '1', value: 70 }, { label: '2', value: 50 }
  ]);
  const segmented = await service.getIndicatorSeries('tasa_aprobacion_asignatura', query({
    year: 2024, groupBy: 'asignatura'
  }));
  assert.deepEqual(segmented.data.series, [
    { label: 'Historia', points: [{ year: 2024, value: 50 }] },
    { label: 'Matemática', points: [{ year: 2024, value: 70 }] }
  ]);
  const detail = await service.getIndicatorDetail('tasa_aprobacion_asignatura', { year: 2024 });
  assert.equal(detail.groupBy, 'asignatura');
  assert.equal(detail.total, 64.29);
  assert.equal(detail.hasData, true);
  assert.deepEqual(detail.period, { from: 2024, to: 2025 });
  assert.deepEqual(detail.table, [
    { label: 'Matemática', value: 70 }, { label: 'Historia', value: 50 }
  ]);
  const periodDetail = await service.getIndicatorDetail('tasa_aprobacion_asignatura', {
    year: 2024, groupBy: 'periodo'
  });
  assert.equal(periodDetail.groupBy, 'periodo');
  assert.deepEqual(periodDetail.table, [
    { label: '1', value: 70 }, { label: '2', value: 50 }
  ]);
  const temporalDetail = await service.getIndicatorDetail('tasa_aprobacion_asignatura', {
    year: 2024, groupBy: ''
  });
  assert.equal(temporalDetail.groupBy, null);
  assert.equal(temporalDetail.disaggregated, false);
  assert.deepEqual(temporalDetail.series, [
    { year: 2024, value: 64.29 }, { year: 2025, value: 100 }
  ]);
  const missing = await service.getIndicatorValue('tasa_aprobacion_asignatura', query({ year: 2023 }));
  assert.equal(missing.data.value, null);
  assert.equal(missing.data.hasData, false);
});

test('período curricular se conserva; Admisión y otros departamentos no cambian', () => {
  assert.equal(parseIndicatorFilters(query({ groupBy: 'periodo', periodo: '2' })).groupBy, 'periodo');
  assert.deepEqual(parseIndicatorFilters(query({ periodo: '2' })).periodo, [2]);
  assert.equal(parseIndicatorFilters({ department: 'admision', groupBy: 'periodo' }).groupBy, 'periodo');
  assert.equal(parseIndicatorFilters({ department: 'innovacion', groupBy: 'periodo' }).groupBy, 'year');
  assert.throws(() => parseIndicatorFilters(query({ periodo: '3' })), { code: 'INVALID_PERIOD' });
  assert.throws(() => parseIndicatorFilters(query({ cohorte: 'x' })), { code: 'INVALID_COHORT' });
});

test('groupBy inválido retorna error controlado y año sin registros no es cero', async () => {
  fixture('titulados_por_anio');
  await assert.rejects(service.getIndicatorSeries('titulados_por_anio', query({ groupBy: 'asignatura' })),
    (error) => error.statusCode === 400 && error.code === 'INVALID_GROUP_BY');
  const annual = await service.getIndicatorSeries('titulados_por_anio', query({ fromYear: 2023, toYear: 2024 }));
  assert.deepEqual(annual.data.points, [{ year: 2023, value: null }, { year: 2024, value: 2 }]);
});

test('registros no evaluables y semestres ausentes no se presentan como cero', async () => {
  fixture('tasa_aprobacion_asignatura', {
    rendimiento: [{ rut: 1, ramoEquiv: 'MAT', asignatura: 'Matemática', anio: 2024,
      periodo: 1, seccion: 1, estadoAsignatura: null }],
    practicas: [{ rut: 1, anio: 2024, periodo: 1, tipoPractica: 'Profesional', estado: 'PENDIENTE' }],
    titulaciones: [{ rut: 1, anio: 2024, periodo: 1, cohorte: 2020, semestresCursados: null }]
  });
  for (const key of ['tasa_aprobacion_asignatura', 'asignaturas_criticas',
    'practicas_inscritas', 'tiempo_promedio_titulacion']) {
    const result = await service.getIndicatorValue(key, query({ year: 2024 }));
    assert.equal(result.data.value, null, key);
    assert.equal(result.data.hasData, false, key);
  }
});

test('proveedores consultan modelos correctos y empujan filtros a Sequelize', async () => {
  const calls = [];
  stub(models.RendimientoAsignatura, 'findAll', async (options) => {
    calls.push(['rendimiento', options]);
    return [{ rut: 1, ramoEquiv: 'MAT', anio: 2024, periodo: 1, seccion: 2,
      notaFinal: '5.0', estadoAsignatura: 'APROBADO', asignatura: { nombre: 'Matemática' } }];
  });
  stub(models.Practica, 'findAll', async (options) => {
    calls.push(['practica', options]);
    return [{ rut: 1, anio: 2024, periodo: 1, tipoPractica: 'Profesional', estado: 'APROBADA' }];
  });
  stub(models.Titulacion, 'findAll', async (options) => {
    calls.push(['titulacion', options]);
    return [{ rut: 1, anioTitulacion: 2024, periodo: 1, cohorte: 2020,
      tiempoNormativo: '8.0', semestresCursados: '9.0' }];
  });
  const filters = parseIndicatorFilters(query({ year: 2024, periodo: 1, seccion: 2,
    asignatura: 'Matemática', tipoPractica: 'Profesional', estado: 'APROBADA', cohorte: 2020 }));
  const r = await provider.getCurricularRendimientoRows(filters);
  const p = await provider.getCurricularPracticaRows(filters);
  const t = await provider.getCurricularTitulacionRows(filters);
  assert.equal(r[0].asignatura, 'Matemática');
  assert.equal(r[0].notaFinal, 5);
  assert.equal(p[0].estado, 'APROBADA');
  assert.equal(t[0].anio, 2024);
  assert.equal(t[0].semestresCursados, 9);
  assert.equal(calls.length, 3);
  assert.equal(calls[0][1].include[0].as, 'asignatura');
  assert.equal(calls[0][1].where.anio, 2024);
  assert.deepEqual(calls[0][1].where.periodo[Op.in], [1]);
  assert.deepEqual(calls[0][1].where.seccion[Op.in], [2]);
  assert.equal(calls[2][1].where.anioTitulacion, 2024);
  assert.deepEqual(calls[2][1].where.cohorte[Op.in], [2020]);
  const range = parseIndicatorFilters(query({ fromYear: 2023, toYear: 2025 }));
  await provider.getCurricularTitulacionRows(range);
  assert.deepEqual(calls.at(-1)[1].where.anioTitulacion[Op.between], [2023, 2025]);
});

test('opciones de filtros curriculares provienen de las tres fuentes', async () => {
  const records = [];
  stub(models.RendimientoAsignatura, 'findAll', async () => {
    records.push('rendimiento');
    return [{ rut: 1, ramoEquiv: 'MAT', anio: 2024, periodo: 1, seccion: 2,
      notaFinal: '5.0', estadoAsignatura: 'APROBADO', asignatura: { nombre: 'Matemática' } }];
  });
  stub(models.Practica, 'findAll', async () => {
    records.push('practica');
    return [{ rut: 1, anio: 2025, periodo: 2, tipoPractica: 'Profesional', estado: 'APROBADA' }];
  });
  stub(models.Titulacion, 'findAll', async () => {
    records.push('titulacion');
    return [{ rut: 1, anioTitulacion: 2024, periodo: 1, cohorte: 2020,
      tiempoNormativo: '8.0', semestresCursados: '9.0' }];
  });
  const options = await provider.getFilterOptions('desarrollo_curricular', parseIndicatorFilters(query()));
  assert.deepEqual(records.sort(), ['practica', 'rendimiento', 'titulacion']);
  assert.deepEqual(options.years, [2024, 2025]);
  assert.deepEqual(options.semesters, [1, 2]);
  assert.deepEqual(options.asignaturas, ['Matemática']);
  assert.deepEqual(options.secciones, [2]);
  assert.deepEqual(options.tiposPractica, ['Profesional']);
  assert.deepEqual(options.estados, ['APROBADA']);
  assert.deepEqual(options.cohortes, [2020]);
  stub(provider, 'getDepartmentByKey', async () => ({ key: 'desarrollo_curricular' }));
  const response = await service.getDepartmentFilters('desarrollo_curricular');
  assert.deepEqual(response.data.filters.cohortes, [2020]);
});
