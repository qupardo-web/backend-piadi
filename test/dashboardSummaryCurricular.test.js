process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/piadi_test';
process.env.JWT_SECRET ||= 'piadi-290-pruebas-locales';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const models = require('../src/models');
const cacheService = require('../src/services/cacheService');
const dashboardService = require('../src/services/dashboardService');
const provider = require('../src/services/indicatorProvider');
const metaIntegration = require('../src/services/metaIndicatorIntegrationService');
const metaProgressService = require('../src/services/metaProgressService');
const dashboardRoutes = require('../src/routes/dashboardRoutes');

const original = [];
const stub = (object, method, replacement) => {
  original.push([object, method, object[method]]);
  object[method] = replacement;
};

test.afterEach(() => {
  while (original.length) {
    const [object, method, methodOriginal] = original.pop();
    object[method] = methodOriginal;
  }
  cacheService.flush();
});

const curricular = { key: 'desarrollo_curricular', name: 'Desarrollo Curricular', enabled: true };
const otherDepartment = { key: 'innovacion', name: 'Innovación', enabled: true };
const definitions = [
  ['tasa_aprobacion_asignatura', 'Tasa de aprobación por asignatura', 'APPROVAL_RATE_BY_COURSE', '%', 'percentage'],
  ['tasa_reprobacion_asignatura', 'Tasa de reprobación por asignatura', 'FAILURE_RATE_BY_COURSE', '%', 'percentage'],
  ['asignaturas_criticas', 'Asignaturas críticas', 'CRITICAL_COURSES', 'asignaturas', 'number'],
  ['practicas_inscritas', 'Prácticas inscritas', 'COUNT_ENROLLED_INTERNSHIPS', 'estudiantes', 'number'],
  ['practicas_aprobadas', 'Prácticas aprobadas', 'COUNT_APPROVED_INTERNSHIPS', 'estudiantes', 'number'],
  ['tasa_titulacion_cohorte', 'Tasa de titulación por cohorte', 'GRADUATION_RATE_BY_COHORT', '%', 'percentage'],
  ['titulados_por_anio', 'Titulados por año', 'COUNT_GRADUATES_BY_YEAR', 'titulados', 'number'],
  ['tiempo_promedio_titulacion', 'Tiempo promedio de titulación', 'AVERAGE_GRADUATION_TIME', 'semestres', 'number']
].map(([key, name, formulaKey, unit, format]) => ({
  key, name, formulaKey, unit, format, departmentId: curricular.key, enabled: true
}));

const rendimiento = [
  ...Array.from({ length: 10 }, (_, index) => ({
    rut: `M${index}`, codCli: `M${index}`, ramoEquiv: 'MAT', asignatura: { nombre: 'Matemática' },
    seccion: 1, anio: 2026, periodo: 1, notaFinal: index < 3 ? 3 : 5,
    estadoAsignatura: index < 3 ? 'REPROBADO' : 'APROBADO'
  })),
  ...Array.from({ length: 4 }, (_, index) => ({
    rut: `H${index}`, codCli: `H${index}`, ramoEquiv: 'HIS', asignatura: { nombre: 'Historia' },
    seccion: 2, anio: 2026, periodo: 1, notaFinal: index < 2 ? 3 : 5,
    estadoAsignatura: index < 2 ? 'REPROBADO' : 'APROBADO'
  })),
  { rut: 'OLD', codCli: 'OLD', ramoEquiv: 'MAT', asignatura: { nombre: 'Matemática' },
    seccion: 1, anio: 2025, periodo: 1, notaFinal: 3, estadoAsignatura: 'REPROBADO' }
];

const practicas = [
  { rut: 'P1', codCli: 'P1', anio: 2026, periodo: 1, tipoPractica: 'Profesional', estado: 'INSCRITA' },
  { rut: 'P1', codCli: 'P1', anio: 2026, periodo: 1, tipoPractica: 'Temprana', estado: 'APROBADA' },
  { rut: 'P2', codCli: 'P2', anio: 2026, periodo: 1, tipoPractica: 'Profesional', estado: 'INSCRITA' },
  { rut: 'P3', codCli: 'P3', anio: 2026, periodo: 1, tipoPractica: 'Profesional', estado: 'APROBADA' },
  { rut: 'OLD', codCli: 'OLD', anio: 2025, periodo: 1, tipoPractica: 'Profesional', estado: 'INSCRITA' }
];

const titulaciones = [
  { rut: 'T1', codCli: 'T1', anioTitulacion: 2026, periodo: 1, cohorte: 2022, semestresCursados: 8 },
  { rut: 'T1', codCli: 'T1', anioTitulacion: 2026, periodo: 1, cohorte: 2022, semestresCursados: 8 },
  { rut: 'T2', codCli: 'T2', anioTitulacion: 2026, periodo: 1, cohorte: 2022, semestresCursados: null },
  { rut: 'T3', codCli: 'T3', anioTitulacion: 2026, periodo: 1, cohorte: 2021, semestresCursados: 10 },
  { rut: 'OLD', codCli: 'OLD', anioTitulacion: 2025, periodo: 1, cohorte: 2020, semestresCursados: 6 }
];

const matches = (record, where = {}) => Object.entries(where).every(([field, condition]) => {
  const value = record[field];
  if (condition && typeof condition === 'object') {
    if (condition[Op.in]) return condition[Op.in].map(String).includes(String(value));
    if (condition[Op.between]) return value >= condition[Op.between][0] && value <= condition[Op.between][1];
    if (condition[Op.iLike]) return String(value).toLowerCase() === String(condition[Op.iLike]).toLowerCase();
    if (condition[Op.or]) return condition[Op.or].some((alternative) => matches({ value }, { value: alternative }));
  }
  return String(value) === String(condition);
});

const setup = ({ departments = [curricular], kpis = definitions, rows = true } = {}) => {
  const observed = { rendimiento: [], practica: [], titulacion: [], metas: [] };
  stub(provider, 'isConnected', async () => true);
  stub(models.Department, 'findAll', async () => departments.map((value) => ({ toJSON: () => value })));
  stub(models.Department, 'findOne', async ({ where }) => {
    const value = departments.find((item) => item.key === where.key);
    return value ? { toJSON: () => value } : null;
  });
  stub(models.IndicatorDefinition, 'findAll', async ({ where }) =>
    kpis.filter((kpi) => kpi.departmentId === where.departmentId).map((value) => ({ toJSON: () => value })));
  stub(models.IndicatorDefinition, 'findOne', async ({ where }) => {
    const value = kpis.find((kpi) => kpi.departmentId === where.departmentId && kpi.key === where.key);
    return value ? { toJSON: () => value } : null;
  });
  stub(models.RendimientoAsignatura, 'findAll', async (options) => {
    observed.rendimiento.push(options);
    return rows ? rendimiento.filter((row) => matches(row, options.where)
      && (!options.include[0].where || matches(row.asignatura, options.include[0].where))) : [];
  });
  stub(models.Practica, 'findAll', async (options) => {
    observed.practica.push(options);
    return rows ? practicas.filter((row) => matches(row, options.where)) : [];
  });
  stub(models.Titulacion, 'findAll', async (options) => {
    observed.titulacion.push(options);
    return rows ? titulaciones.filter((row) => matches(row, options.where)) : [];
  });
  stub(metaIntegration, 'getDashboardMetaSummary', async (query) => {
    observed.metas.push(query);
    return { total: 2, cumplidas: 1, enRiesgo: 0, cumplimientoGlobal: 50 };
  });
  return observed;
};

const cardsByKey = (department) => Object.fromEntries(department.cards.map((card) => [card.indicatorKey, card]));

test('GET /api/dashboard/summary curricular usa proveedor y fórmulas reales en sus ocho tarjetas', async () => {
  const observed = setup();
  const { data } = await dashboardService.getSummary({ department: curricular.key, year: '2026' });
  assert.equal(data.year, 2026);
  assert.deepEqual(data.filters, { year: 2026 });
  assert.equal(data.departments.length, 1);
  assert.equal(data.departments[0].departmentId, curricular.key);
  assert.equal(data.departments[0].hasIndicators, true);
  assert.deepEqual(data.departments[0].cards.map((card) => card.indicatorKey), definitions.map((kpi) => kpi.key));
  assert.deepEqual(data.meta, { totalDepartments: 1, departmentsWithIndicators: 1, totalCards: 8, sourceConnected: true });
  assert.deepEqual(data.metas, { total: 2, cumplidas: 1, enRiesgo: 0, cumplimientoGlobal: 50 });
  const cards = cardsByKey(data.departments[0]);
  assert.deepEqual(cards.tasa_aprobacion_asignatura, {
    indicatorKey: 'tasa_aprobacion_asignatura', title: 'Tasa de aprobación por asignatura',
    value: 64.29, formattedValue: '64.29%', unit: '%', format: 'percentage', hasData: true
  });
  assert.equal(cards.tasa_reprobacion_asignatura.value, 35.71);
  assert.equal(cards.tasa_reprobacion_asignatura.formattedValue, '35.71%');
  assert.equal(cards.asignaturas_criticas.value, 1);
  assert.equal(cards.practicas_inscritas.value, 3);
  assert.equal(cards.practicas_aprobadas.value, 2);
  assert.equal(cards.titulados_por_anio.value, 3);
  assert.equal(cards.tiempo_promedio_titulacion.value, 9);
  for (const key of ['asignaturas_criticas', 'practicas_inscritas', 'practicas_aprobadas', 'titulados_por_anio', 'tiempo_promedio_titulacion']) {
    assert.equal(cards[key].formattedValue, String(cards[key].value));
    assert.equal(cards[key].hasData, true);
  }
  assert.deepEqual(cards.tasa_titulacion_cohorte, {
    indicatorKey: 'tasa_titulacion_cohorte', title: 'Tasa de titulación por cohorte',
    value: null, formattedValue: null, unit: '%', format: 'percentage', hasData: false
  });
  assert.ok(observed.rendimiento.length > 0 && observed.practica.length > 0 && observed.titulacion.length > 0);
  assert.ok(observed.rendimiento.every(({ where }) => where.anio === 2026));
  assert.ok(observed.titulacion.every(({ where }) => where.anioTitulacion === 2026));
});

test('consulta global conserva departamentos ajenos y excluye KPIs deshabilitados', async () => {
  setup({ departments: [otherDepartment, curricular], kpis: definitions.map((kpi) =>
    kpi.key === 'asignaturas_criticas' ? { ...kpi, enabled: false } : kpi) });
  const { data } = await dashboardService.getSummary({ year: '2026' });
  assert.deepEqual(data.departments.map((department) => department.departmentId), ['innovacion', curricular.key]);
  assert.equal(data.departments[0].hasIndicators, false);
  assert.deepEqual(data.departments[0].cards, []);
  assert.equal(data.departments[1].cards.length, 7);
  assert.equal(cardsByKey(data.departments[1]).asignaturas_criticas, undefined);
  assert.deepEqual(data.meta, { totalDepartments: 2, departmentsWithIndicators: 1, totalCards: 7, sourceConnected: true });
  assert.deepEqual(data.filters, { year: 2026 });
});

test('año, rango, período y filtros curriculares llegan a las consultas correspondientes', async () => {
  const observed = setup();
  const query = { department: curricular.key, year: '2026', periodo: '1', asignatura: 'Historia',
    seccion: '2', tipoPractica: 'Profesional', estado: 'APROBADA', cohorte: '2022' };
  const { data } = await dashboardService.getSummary(query);
  assert.deepEqual(data.filters, { year: 2026, estado: ['APROBADA'], cohorte: [2022],
    tipoPractica: ['Profesional'], periodo: [1], asignatura: ['Historia'], seccion: [2] });
  assert.equal(cardsByKey(data.departments[0]).tasa_reprobacion_asignatura.value, 50);
  assert.equal(cardsByKey(data.departments[0]).practicas_aprobadas.value, 1);
  assert.equal(cardsByKey(data.departments[0]).titulados_por_anio.value, 2);
  assert.ok(observed.rendimiento.every(({ where }) => where.periodo[Op.in][0] === 1 && where.seccion[Op.in][0] === 2));
  assert.ok(observed.practica.every(({ where }) => where.periodo[Op.in][0] === 1));
  assert.ok(observed.titulacion.every(({ where }) => where.cohorte[Op.in][0] === 2022));
  assert.equal(observed.metas.at(-1), query);

  const ranged = await dashboardService.getSummary({ department: curricular.key, fromYear: '2025', toYear: '2026' });
  assert.equal(ranged.data.year, 2026);
  assert.deepEqual(ranged.data.filters, { fromYear: 2025, toYear: 2026 });
  assert.deepEqual(observed.rendimiento.at(-1).where.anio[Op.between], [2025, 2026]);
  assert.deepEqual(observed.titulacion.at(-1).where.anioTitulacion[Op.between], [2025, 2026]);
});

test('año y período explícitos no mezclan datos de otros cortes temporales', async () => {
  setup();
  const previous = await dashboardService.getSummary({ department: curricular.key, year: '2025' });
  const previousCards = cardsByKey(previous.data.departments[0]);
  assert.equal(previousCards.tasa_reprobacion_asignatura.value, 100);
  assert.equal(previousCards.practicas_inscritas.value, 1);
  assert.equal(previousCards.titulados_por_anio.value, 1);
  assert.equal(previousCards.tiempo_promedio_titulacion.value, 6);

  const secondSemester = await dashboardService.getSummary({ department: curricular.key, year: '2026', periodo: '2' });
  assert.deepEqual(secondSemester.data.filters, { year: 2026, periodo: [2] });
  for (const card of secondSemester.data.departments[0].cards) {
    assert.equal(card.value, null);
    assert.equal(card.hasData, false);
  }
});

test('sin registros curriculares conserva ocho tarjetas sin datos y departamento sin KPI conserva lista vacía', async () => {
  setup({ rows: false, departments: [otherDepartment, curricular] });
  const { data } = await dashboardService.getSummary({ department: curricular.key, year: '2026' });
  assert.equal(data.departments[0].cards.length, 8);
  for (const card of data.departments[0].cards) {
    assert.equal(card.value, null);
    assert.equal(card.formattedValue, null);
    assert.equal(card.hasData, false);
  }
  const empty = await dashboardService.getSummary({ department: otherDepartment.key, year: '2026' });
  assert.equal(empty.data.departments[0].hasIndicators, false);
  assert.deepEqual(empty.data.departments[0].cards, []);
  assert.equal(empty.data.meta.totalCards, 0);
});

test('fuente desconectada entrega resumen vacío sin intentar consultar modelos', async () => {
  setup();
  stub(provider, 'isConnected', async () => false);
  const { data } = await dashboardService.getSummary({ department: curricular.key, year: '2026' });
  assert.deepEqual(data.departments, []);
  assert.equal(data.meta.sourceConnected, false);
  assert.equal(data.meta.totalCards, 0);
});

test('documenta comportamiento compartido: año implícito etiqueta año actual sin filtrar las tarjetas', async () => {
  const observed = setup();
  const { data } = await dashboardService.getSummary({ department: curricular.key });
  assert.equal(data.year, new Date().getFullYear());
  assert.deepEqual(data.filters, {});
  assert.equal(cardsByKey(data.departments[0]).titulados_por_anio.value, 4);
  assert.ok(observed.titulacion.every(({ where }) => where.anioTitulacion === undefined));
});

test('documenta comportamiento compartido: periodo solo filtra tarjetas, no metas; sortBy=value no reordena', async () => {
  const observed = setup({ departments: [otherDepartment, curricular] });
  const result = await dashboardService.getSummary({ department: curricular.key, year: '2026', periodo: '1' });
  assert.deepEqual(result.data.filters.periodo, [1]);
  assert.ok(observed.practica.every(({ where }) => where.periodo[Op.in][0] === 1));
  assert.deepEqual(observed.metas.at(-1), { department: curricular.key, year: '2026', periodo: '1' });

  const sorted = await dashboardService.getSummary({ year: '2026', sortBy: 'value', order: 'desc' });
  assert.deepEqual(sorted.data.departments.map((department) => department.departmentId), ['innovacion', curricular.key]);
});

test('resumen de metas existente ignora periodo si no se envía semester', async () => {
  stub(metaProgressService, 'listMetasWithProgress', async () => [
    { anio: 2026, periodo: 'Semestre 1', status: 'cumplida', totalProgress: 100 },
    { anio: 2026, periodo: 'Semestre 2', status: 'en_riesgo', totalProgress: 20 }
  ]);
  const summary = await metaIntegration.getDashboardMetaSummary({ department: curricular.key, year: '2026', periodo: '1' });
  assert.deepEqual(summary, { total: 2, cumplidas: 1, enRiesgo: 1, cumplimientoGlobal: 60 });
});

test('Swagger conserva departamentos previos y documenta ocho indicadores y filtros curriculares', () => {
  const { swaggerDocs } = require('../src/config/swagger');
  const operation = swaggerDocs.paths['/api/dashboard/summary'].get;
  const department = operation.parameters.find((parameter) => parameter.name === 'department');
  assert.ok(department.schema.enum.includes('desarrollo_curricular'));
  for (const previous of ['educacion_continua', 'vinculacion_medio', 'innovacion', 'admision']) {
    assert.ok(department.schema.enum.includes(previous));
  }
  for (const filter of ['year', 'fromYear', 'toYear', 'periodo', 'asignatura', 'seccion', 'tipoPractica', 'estado', 'cohorte']) {
    assert.ok(operation.parameters.some((parameter) => parameter.name === filter), filter);
  }
  const response = operation.responses[200];
  assert.match(response.description, /tasa_titulacion_cohorte.*value null.*formattedValue null.*hasData false/);
  const card = response.content['application/json'].schema.properties.data.properties
    .departments.items.properties.cards.items.properties;
  for (const { key } of definitions) assert.ok(card.indicatorKey.enum.includes(key), key);
  assert.equal(card.value.nullable, true);
  assert.equal(card.formattedValue.nullable, true);
});

const request = async (path, { authenticated = true } = {}) => {
  const app = express();
  app.use('/api', dashboardRoutes);
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ success: false }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  try {
    const token = jwt.sign({ id: 1, role: 'Desarrollo Curricular', roleGroup: 'Direccion' }, process.env.JWT_SECRET);
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      headers: authenticated ? { authorization: `Bearer ${token}` } : {}
    });
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

test('endpoint HTTP preserva success, contrato JSON, filtros y errores 400/401/500 controlados', async () => {
  setup();
  const path = '/api/dashboard/summary?department=desarrollo_curricular&year=2026';
  const ok = await request(path);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.success, true);
  assert.equal(ok.body.data.departments[0].cards.length, 8);
  assert.equal(ok.body.data.departments[0].cards[0].value, 64.29);
  assert.deepEqual(ok.body.data.filters, { year: 2026 });
  assert.equal(ok.body.data.meta.totalCards, 8);
  assert.equal(ok.body.data.metas.total, 2);

  const global = await request('/api/dashboard/summary?year=2026');
  assert.equal(global.status, 200);
  assert.equal(global.body.success, true);
  assert.equal(global.body.data.departments[0].cards.length, 8);
  assert.equal(global.body.data.meta.totalDepartments, 1);

  const badPeriod = await request(`${path}&periodo=3`);
  assert.equal(badPeriod.status, 400);
  assert.equal(badPeriod.body.error.code, 'INVALID_PERIOD');
  const badYear = await request('/api/dashboard/summary?year=incorrecto');
  assert.equal(badYear.status, 400);
  assert.equal(badYear.body.error.code, 'INVALID_YEAR');
  const withoutToken = await request(path, { authenticated: false });
  assert.equal(withoutToken.status, 401);
  assert.equal(withoutToken.body.success, false);

  stub(models.RendimientoAsignatura, 'findAll', async () => { throw new Error('detalle sensible de base de datos'); });
  cacheService.flush();
  const failure = await request(path);
  assert.equal(failure.status, 500);
  assert.equal(failure.body.error.code, 'INTERNAL_ERROR');
  assert.ok(!JSON.stringify(failure.body).includes('detalle sensible'));
});
