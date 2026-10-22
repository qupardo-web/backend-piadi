process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/piadi_test';

const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../src/services/indicatorService');
const provider = require('../src/services/indicatorProvider');
const integration = require('../src/services/metaIndicatorIntegrationService');
const cache = require('../src/services/cacheService');
const { INDICATORS } = require('../src/services/indicatorCatalog');
const { swaggerDocs } = require('../src/config/swagger');

const saved = [];
const stub = (object, key, value) => {
  saved.push([object, key, object[key]]);
  object[key] = value;
};
test.afterEach(() => {
  cache.flush();
  while (saved.length) {
    const [object, key, value] = saved.pop();
    object[key] = value;
  }
});

const enrollments = [
  { codCli: 'A', anio: 2023, periodo: 1, asignatura: 'Álgebra', seccion: 1, nuevoAntiguo: 'nuevo' },
  { codCli: 'A', anio: 2023, periodo: 2, asignatura: 'Historia', seccion: 2, nuevoAntiguo: 'nuevo' },
  { codCli: 'B', anio: 2024, periodo: 1, asignatura: 'Álgebra', seccion: 2, nuevoAntiguo: 'antiguo' },
  { codCli: 'C', anio: 2024, periodo: 2, asignatura: 'Historia', seccion: 1, nuevoAntiguo: 'nuevo' }
];
const characterizations = [
  { codCli: 'A', rut: 1, anio: 2024, periodo: 1, nivelSocioeconomico: 'Bajo', sexo: 'F', region: 'Norte' },
  { codCli: 'A', rut: 1, anio: 2024, periodo: 2, nivelSocioeconomico: 'Bajo', sexo: 'F', region: 'Norte' },
  { codCli: 'B', rut: 2, anio: 2024, periodo: 2, nivelSocioeconomico: 'Alto', sexo: 'M', region: 'Sur' },
  { codCli: 'C', rut: 3, anio: 2024, periodo: 1, nivelSocioeconomico: 'Bajo', sexo: 'M', region: 'Norte' },
  { codCli: 'D', rut: 4, anio: 2024, periodo: 1, nivelSocioeconomico: '__proto__', sexo: '__proto__', region: null }
];

const filtered = (rows, filters) => rows.filter((row) =>
  (filters.year == null || row.anio === filters.year) &&
  (filters.fromYear == null || row.anio >= filters.fromYear) &&
  (filters.toYear == null || row.anio <= filters.toYear) &&
  (!filters.periodo?.length || filters.primeraMatricula || filters.periodo.includes(row.periodo)) &&
  (!filters.sexo?.length || filters.sexo.includes(row.sexo))
);

const fixture = (key, department = 'admision') => {
  stub(provider, 'getKpi', async () => ({
    key, departmentId: department, name: key, description: key,
    formulaKey: INDICATORS[key].formulaKey, unit: 'personas', format: 'number'
  }));
  stub(provider, 'getDepartmentByKey', async () => ({ key: department }));
  stub(provider, 'getAdmissionEnrollmentRows', async (filters) => filtered(enrollments, filters));
  stub(provider, 'getAdmissionCharacterizationRows', async (filters) => filtered(characterizations, filters));
  stub(provider, 'getVcmConvenioRows', async (filters) => filtered([
    { anio: 2023, sector: 'Público', region: 'Norte' },
    { anio: 2024, sector: 'Privado', region: 'Sur' }
  ], filters));
  stub(provider, 'getProgramRows', async (filters) => filtered([
    { anio: 2023, programa: 'A', modalidad: 'Online', matricula: 5 },
    { anio: 2024, programa: 'A', modalidad: 'Presencial', matricula: 7 }
  ], filters));
  stub(provider, 'getParticipantRows', async (filters) => filtered([
    { anio: 2023, idParticipante: 1, sexo: 'F', rangoEdad: '20-29' },
    { anio: 2024, idParticipante: 2, sexo: 'M', rangoEdad: '30-39' }
  ], filters));
  stub(integration, 'getIndicatorMetaContext', async () => null);
};

test('sin splitBy conserva exactamente la respuesta anterior', async () => {
  fixture('matricula_por_asignatura');
  const view = await service.getIndicatorDetail('matricula_por_asignatura');
  assert.equal(view.groupBy, 'asignatura');
  for (const key of ['isBidimensional', 'columns', 'matrix', 'totals', 'matrixFilters']) {
    assert.equal(Object.hasOwn(view, key), false);
  }
});

test('NSE × sexo: IDs seguros, orden, celdas, marginales y total único', async () => {
  fixture('nivel_socioeconomico');
  const view = await service.getIndicatorDetail('nivel_socioeconomico', { splitBy: 'sexo', year: '2024' });
  assert.equal(view.isBidimensional, true);
  assert.equal(view.rowDimension, 'nivelSocioeconomico');
  assert.equal(view.colDimension, 'sexo');
  assert.deepEqual(view.columns, ['sexo:string:__proto__', 'sexo:string:F', 'sexo:string:M']);
  assert.equal(view.columnLabels['sexo:string:F'], 'F');
  assert.equal(view.columnLabels['sexo:string:__proto__'], '__proto__');
  assert.equal(view.matrix.find((row) => row.row === 'Bajo').values['sexo:string:F'], 1);
  assert.equal(view.matrix.find((row) => row.row === 'Bajo').values['sexo:string:M'], 1);
  assert.equal(view.matrix.find((row) => row.row === 'Alto').values['sexo:string:F'], null);
  assert.equal(view.matrix.find((row) => row.row === 'Bajo').total, 2);
  assert.equal(view.totals.columns['sexo:string:F'], 1);
  assert.equal(view.totals.general, 4);
  assert.equal(view.total, 4);
  assert.ok(view.table.length > 0 && view.series.length > 0);
});

test('NSE × periodo separa semestres y no suma alumnos repetidos en general', async () => {
  fixture('nivel_socioeconomico');
  const view = await service.getIndicatorDetail('nivel_socioeconomico', {
    splitBy: 'periodo', fromYear: '2024', toYear: '2024'
  });
  assert.deepEqual(view.columns, ['periodo:number:1', 'periodo:number:2']);
  assert.equal(view.matrix.find((row) => row.row === 'Bajo').values['periodo:number:1'], 2);
  assert.equal(view.matrix.find((row) => row.row === 'Bajo').values['periodo:number:2'], 1);
  assert.equal(view.matrix.find((row) => row.row === 'Bajo').total, 2);
  assert.equal(view.totals.general, 4);
});

test('asignatura × year conserva años ascendentes y no suma dos asignaturas del mismo alumno', async () => {
  fixture('matricula_por_asignatura');
  const view = await service.getIndicatorDetail('matricula_por_asignatura', {
    splitBy: 'year', fromYear: '2023', toYear: '2024'
  });
  assert.deepEqual(view.columns, ['year:number:2023', 'year:number:2024']);
  assert.equal(view.matrix.find((row) => row.row === 'Álgebra').total, 2);
  assert.equal(view.matrix.find((row) => row.row === 'Historia').total, 2);
  assert.equal(view.totals.general, 3);
  assert.equal(view.total, 2);
  assert.deepEqual(view.period, { from: 2023, to: 2024 });
});

test('groupBy explícito prevalece y year puede ser dimensión principal', async () => {
  fixture('matricula_por_asignatura');
  const bySection = await service.getIndicatorDetail('matricula_por_asignatura', {
    groupBy: 'seccion', splitBy: 'periodo'
  });
  assert.equal(bySection.rowDimension, 'seccion');
  assert.equal(bySection.colDimension, 'periodo');
  const byYear = await service.getIndicatorDetail('matricula_por_asignatura', {
    groupBy: 'year', splitBy: 'asignatura'
  });
  assert.equal(byYear.groupBy, 'year');
  assert.equal(byYear.disaggregated, false);
  assert.equal(byYear.rowDimension, 'year');
  assert.deepEqual(byYear.matrix.map((row) => row.row), ['2023', '2024']);
});

test('dimensiones inválidas, repetidas y faltantes responden 400', async () => {
  fixture('nivel_socioeconomico');
  for (const [query, code] of [
    [{ splitBy: '' }, 'INVALID_SPLIT_BY'],
    [{ splitBy: ['sexo', 'periodo'] }, 'INVALID_SPLIT_BY'],
    [{ splitBy: 'sexo,periodo' }, 'INVALID_SPLIT_BY'],
    [{ splitBy: 'invalida' }, 'INVALID_SPLIT_BY'],
    [{ splitBy: 'nivelSocioeconomico' }, 'DUPLICATE_GROUP_DIMENSIONS'],
    [{ groupBy: '', splitBy: 'sexo' }, 'MISSING_ROW_DIMENSION'],
    [{ groupBy: 'sexo,year', splitBy: 'region' }, 'INVALID_GROUP_BY'],
    [{ groupBy: ['sexo', 'region'], splitBy: 'periodo' }, 'INVALID_GROUP_BY'],
    [{ groupBy: 'invalida', splitBy: 'sexo' }, 'INVALID_GROUP_BY']
  ]) {
    await assert.rejects(service.getIndicatorDetail('nivel_socioeconomico', query),
      (error) => error.statusCode === 400 && error.code === code);
  }
  fixture('matricula_total');
  await assert.rejects(service.getIndicatorDetail('matricula_total', { splitBy: 'sexo' }),
    (error) => error.statusCode === 400 && error.code === 'MISSING_ROW_DIMENSION');
});

test('year y filtros acotan sólo la matriz; sin filas no inventa ceros', async () => {
  fixture('matricula_por_asignatura');
  const view = await service.getIndicatorDetail('matricula_por_asignatura', {
    splitBy: 'year', year: '2024', fromYear: '2023', toYear: '2024'
  });
  assert.deepEqual(view.columns, ['year:number:2024']);
  assert.equal(view.matrixFilters.year, 2024);
  const empty = await service.getIndicatorDetail('matricula_por_asignatura', { splitBy: 'year', year: '2030' });
  assert.deepEqual(empty.columns, []);
  assert.deepEqual(empty.matrix, []);
  assert.equal(empty.totals.general, null);
});

test('VCM y Educación Continua reutilizan sus providers y fórmulas', async () => {
  for (const [key, department, splitBy, expected] of [
    ['convenios_por_sector', 'vinculacion_medio', 'year', 2],
    ['matricula_por_programa', 'educacion_continua', 'modalidad', 12],
    ['perfil_participante', 'educacion_continua', 'rangoEdad', 2]
  ]) {
    fixture(key, department);
    const view = await service.getIndicatorDetail(key, { splitBy });
    assert.equal(view.totals.general, expected);
    assert.equal(view.columns.length, 2);
  }
});

test('el provider recibe nuevoAntiguo si aparece en cualquiera de los ejes', async () => {
  fixture('matricula_por_asignatura');
  const calls = [];
  stub(provider, 'getAdmissionEnrollmentRows', async (filters) => {
    calls.push(filters);
    return filtered(enrollments, filters);
  });
  await service.getIndicatorDetail('matricula_por_asignatura', { splitBy: 'nuevoAntiguo' });
  assert.ok(calls.some((filters) => filters.needsNuevoAntiguo === true));
});

test('matricula_total × periodo reutiliza la primera matrícula anual', async () => {
  fixture('matricula_total');
  const view = await service.getIndicatorDetail('matricula_total', {
    groupBy: 'asignatura', splitBy: 'periodo', year: '2023'
  });
  assert.deepEqual(view.columns, ['periodo:number:1']);
  assert.equal(view.totals.general, 1);
  assert.equal(view.matrix.find((row) => row.row === 'Historia').values['periodo:number:1'], 1);
});

test('porcentajes y cero se recalculan; límite rechaza sin truncar', async () => {
  fixture('tasa_aprobacion', 'educacion_continua');
  stub(provider, 'getProgramRows', async () => [
    { anio: 2024, programa: 'A', matricula: 10, aprobados: 0 },
    { anio: 2024, programa: 'B', matricula: 10, aprobados: 10 }
  ]);
  const view = await service.getIndicatorDetail('tasa_aprobacion', { groupBy: 'programa', splitBy: 'year' });
  assert.equal(view.matrix.find((row) => row.row === 'A').total, 0);
  assert.equal(view.matrix.find((row) => row.row === 'B').total, 100);
  assert.equal(view.totals.general, 50);
  const previousLimit = process.env.INDICATOR_MATRIX_MAX_ROWS;
  process.env.INDICATOR_MATRIX_MAX_ROWS = '1';
  try {
    await assert.rejects(
      service.getIndicatorDetail('tasa_aprobacion', { groupBy: 'programa', splitBy: 'year', year: '2024' }),
      (error) => error.statusCode === 400 && error.code === 'MATRIX_LIMIT_EXCEEDED'
    );
  } finally {
    if (previousLimit === undefined) delete process.env.INDICATOR_MATRIX_MAX_ROWS;
    else process.env.INDICATOR_MATRIX_MAX_ROWS = previousLimit;
  }
});

test('cache separa splitBy y Swagger documenta únicamente el detalle', async () => {
  fixture('nivel_socioeconomico');
  const one = await service.getIndicatorDetail('nivel_socioeconomico');
  const two = await service.getIndicatorDetail('nivel_socioeconomico', { splitBy: 'sexo' });
  assert.equal(one.isBidimensional, undefined);
  assert.equal(two.isBidimensional, true);
  const operation = swaggerDocs.paths['/api/indicators/{indicatorKey}/detail'].get;
  assert.ok(operation.parameters.some((parameter) => parameter.name === 'splitBy'));
  assert.ok(operation.responses[200].content['application/json'].schema.properties.matrix);
});
