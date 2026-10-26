process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/piadi_test';
process.env.JWT_SECRET ||= 'test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const jwt = require('jsonwebtoken');
const models = require('../src/models');
const metaService = require('../src/services/metaService');
const progressService = require('../src/services/metaProgressService');
const integrationService = require('../src/services/metaIndicatorIntegrationService');
const landingService = require('../src/services/landingService');
const metaController = require('../src/controllers/metaController');
const { canReadMeta } = require('../src/middleware/rectoriaAuthorization');
const { buildChanges } = require('../src/middleware/metaAudit');
const { migrateMetaLifecycle } = require('../src/migrations/20261024-meta-lifecycle');
const { ValidationError } = require('../src/utils/errors');

const saved = [];
const stub = (object, key, replacement) => {
  saved.push([object, key, object[key]]);
  object[key] = replacement;
};
test.afterEach(() => {
  while (saved.length) {
    const [object, key, original] = saved.pop();
    object[key] = original;
  }
});

const metric = (overrides = {}) => ({
  indicatorKey: 'kpi-a', weight: 100, behavior: 'debe-superar',
  targetValue: 80, valueType: 'number', ...overrides
});
const fields = () => ({
  departmentId: 'calidad', anio: 2026, periodo: 'Anual', nombre: 'Meta de prueba',
  fechaInicio: '2026-01-01T00:00:00Z', fechaLimite: '2026-12-31T23:59:59Z'
});

const setupWrites = (existing = {}) => {
  const calls = { create: [], update: [], destroy: 0, bulkCreate: [], transactions: 0 };
  const row = {
    id: 5, creatorId: 7, lifecycleStatus: 'BORRADOR', draftMetrics: [],
    indicatorKey: null, valorMeta: null, metrics: [], ...fields(), ...existing,
    async update(data) { calls.update.push(data); Object.assign(this, data); }
  };
  stub(models.sequelize, 'transaction', async (callback) => {
    calls.transactions++;
    return callback({ LOCK: { UPDATE: 'UPDATE' } });
  });
  stub(models.IndicatorDefinition, 'findAll', async () => [{ key: 'kpi-a' }]);
  stub(models.Department, 'findOne', async () => ({ key: 'calidad' }));
  stub(models.Meta, 'create', async (data) => {
    calls.create.push(data);
    Object.assign(row, data);
    return row;
  });
  stub(models.Meta, 'findByPk', async () => row);
  stub(models.MetaMetric, 'destroy', async () => { calls.destroy++; row.metrics = []; });
  stub(models.MetaMetric, 'bulkCreate', async (data) => { calls.bulkCreate.push(data); row.metrics = data; });
  return { calls, row };
};

const validation400 = (error) => error instanceof ValidationError && error.statusCode === 400;

test('el modelo conserva ACTIVA por defecto y admite nulos de BORRADOR', async () => {
  assert.equal(models.Meta.rawAttributes.lifecycleStatus.defaultValue, 'ACTIVA');
  assert.equal(models.Meta.rawAttributes.indicatorKey.allowNull, true);
  assert.equal(models.Meta.rawAttributes.valorMeta.allowNull, true);
  assert.equal(models.Meta.rawAttributes.draftMetrics.type.key, 'JSONB');
  assert.equal(models.MetaMetric.rawAttributes.indicatorKey.allowNull, false);
  assert.equal(models.MetaMetric.rawAttributes.weight.allowNull, false);
  await models.Meta.build({ ...fields(), lifecycleStatus: 'BORRADOR', indicatorKey: null, valorMeta: null, draftMetrics: [] }).validate();
  await assert.rejects(
    models.Meta.build({ ...fields(), lifecycleStatus: 'ACTIVA', indicatorKey: null, valorMeta: null }).validate(),
    /indicador y valorMeta/
  );
  await assert.rejects(
    models.Meta.build({ ...fields(), lifecycleStatus: 'BORRADOR', indicatorKey: 'kpi-a', valorMeta: 80 }).validate(),
    /BORRADOR no debe contener/
  );
  await assert.rejects(
    models.Meta.build({ ...fields(), lifecycleStatus: 'ACTIVA', indicatorKey: 'kpi-a', valorMeta: 80,
      draftMetrics: [{ weight: 40 }] }).validate(),
    /sin draftMetrics/
  );
});

test('POST sin estado conserva ACTIVA y el contrato estricto de métricas', async () => {
  const { calls } = setupWrites();
  await metaService.create({ ...fields(), metrics: [metric()] }, 7);
  assert.equal(calls.create[0].lifecycleStatus, 'ACTIVA');
  assert.equal(calls.create[0].indicatorKey, 'kpi-a');
  assert.equal(calls.create[0].valorMeta, 80);
  assert.equal(calls.bulkCreate.length, 1);
  await assert.rejects(metaService.create({ ...fields() }, 7), validation400);
});

test('POST guarda BORRADOR sin objetivo ni MetaMetric y conserva datos parciales', async () => {
  const { calls, row } = setupWrites();
  const partial = [{ indicatorKey: 'kpi-a', weight: 30 }, { behavior: '', targetValue: null }];
  await metaService.create({ ...fields(), lifecycleStatus: 'BORRADOR', draftMetrics: partial }, 7);
  assert.equal(row.lifecycleStatus, 'BORRADOR');
  assert.equal(calls.create[0].indicatorKey, null);
  assert.equal(calls.create[0].valorMeta, null);
  assert.deepEqual(row.draftMetrics, partial);
  assert.equal(calls.bulkCreate.length, 0);
  await metaService.create({ ...fields(), lifecycleStatus: 'BORRADOR' }, 7);
  assert.deepEqual(calls.create[1].draftMetrics, []);
});

test('draftMetrics rechaza propiedades desconocidas, objetos anidados y tipos inválidos', async () => {
  const { calls } = setupWrites();
  for (const draftMetrics of [
    {}, [{ indicadorInventado: 'x' }], [{ weight: { value: 10 } }],
    [{ weight: Number.POSITIVE_INFINITY }], [null]
  ]) {
    await assert.rejects(
      metaService.create({ ...fields(), lifecycleStatus: 'BORRADOR', draftMetrics }, 7),
      validation400
    );
  }
  await assert.rejects(
    metaService.create({ ...fields(), lifecycleStatus: 'BORRADOR', metrics: [metric()] }, 7),
    validation400
  );
  await assert.rejects(
    metaService.create({ ...fields(), lifecycleStatus: 'BORRADOR', valorMeta: 80 }, 7),
    validation400
  );
  assert.equal(calls.create.length, 0);
  assert.equal(calls.bulkCreate.length, 0);
});

test('PUT de BORRADOR conserva o reemplaza draftMetrics sin tocar MetaMetric', async () => {
  const { calls, row } = setupWrites({ draftMetrics: [{ weight: 20 }] });
  await metaService.update(5, { nombre: 'Avance parcial' });
  assert.deepEqual(row.draftMetrics, [{ weight: 20 }]);
  await metaService.update(5, { draftMetrics: [{ weight: 40, targetValue: '' }] });
  assert.deepEqual(row.draftMetrics, [{ weight: 40, targetValue: '' }]);
  await metaService.update(5, { draftMetrics: [] });
  assert.deepEqual(row.draftMetrics, []);
  assert.equal(calls.destroy, 0);
  assert.equal(calls.bulkCreate.length, 0);
});

test('PUT activa transaccionalmente con métricas completas y limpia draftMetrics', async () => {
  const { calls, row } = setupWrites({ draftMetrics: [{ weight: 40 }] });
  await metaService.update(5, { lifecycleStatus: 'ACTIVA', metrics: [metric()] });
  assert.equal(row.lifecycleStatus, 'ACTIVA');
  assert.equal(row.indicatorKey, 'kpi-a');
  assert.equal(row.valorMeta, 80);
  assert.equal(row.draftMetrics, null);
  assert.equal(calls.destroy, 1);
  assert.equal(calls.bulkCreate[0][0].metaId, 5);
  assert.equal(calls.transactions, 1);
});

test('activación inválida no actualiza la meta ni sustituye métricas', async () => {
  const { calls, row } = setupWrites({ draftMetrics: [{ weight: 40 }] });
  const invalid = [
    { lifecycleStatus: 'ACTIVA' },
    { lifecycleStatus: 'ACTIVA', metrics: [metric({ weight: 90 })] },
    { lifecycleStatus: 'ACTIVA', metrics: [metric({ weight: 110 })] },
    { lifecycleStatus: 'ACTIVA', metrics: [metric({ targetValue: null })] }
  ];
  for (const payload of invalid) {
    await assert.rejects(metaService.update(5, payload), validation400);
  }
  await assert.rejects(
    metaService.update(5, { lifecycleStatus: 'ACTIVA', metrics: [metric({ indicatorKey: 'ausente' })] }),
    (error) => error.statusCode === 404
  );
  assert.equal(row.lifecycleStatus, 'BORRADOR');
  assert.deepEqual(row.draftMetrics, [{ weight: 40 }]);
  assert.equal(calls.update.length, 0);
  assert.equal(calls.destroy, 0);
  assert.equal(calls.bulkCreate.length, 0);
});

test('activación valida los campos generales finales de un BORRADOR', async () => {
  const { calls, row } = setupWrites({ nombre: null, fechaInicio: null });
  await assert.rejects(
    metaService.update(5, { lifecycleStatus: 'ACTIVA', metrics: [metric()] }),
    validation400
  );
  assert.equal(row.lifecycleStatus, 'BORRADOR');
  assert.equal(calls.update.length, 0);
  await metaService.update(5, {
    lifecycleStatus: 'ACTIVA', nombre: 'Meta completa', fechaInicio: '2026-01-01T00:00:00Z', metrics: [metric()]
  });
  assert.equal(row.lifecycleStatus, 'ACTIVA');
  assert.equal(row.nombre, 'Meta completa');
});

test('BORRADOR valida año y fecha de inicio en creación y cambios parciales', async () => {
  const { calls, row } = setupWrites({ draftMetrics: [{ weight: 40 }] });
  await assert.rejects(
    metaService.create({ ...fields(), lifecycleStatus: 'BORRADOR', fechaInicio: '2025-12-15' }, 7),
    validation400
  );
  await assert.rejects(metaService.update(5, { anio: 2027 }), validation400);
  await assert.rejects(metaService.update(5, { inicio: '2025-12-15' }), validation400);
  assert.equal(calls.create.length, 0);
  assert.equal(calls.update.length, 0);
  assert.equal(calls.bulkCreate.length, 0);

  await metaService.update(5, { anio: 2027, fechaInicio: '2027-01-15T00:00:00Z' });
  assert.equal(row.anio, 2027);
  assert.equal(row.fechaInicio, '2027-01-15T00:00:00Z');
  assert.deepEqual(row.draftMetrics, [{ weight: 40 }]);
});

test('activación rechaza un BORRADOR con años incompatibles y acepta su corrección', async () => {
  const { calls, row } = setupWrites({ fechaInicio: '2025-12-15T00:00:00Z' });
  await assert.rejects(
    metaService.update(5, { lifecycleStatus: 'ACTIVA', metrics: [metric()] }),
    validation400
  );
  await assert.rejects(
    metaService.update(5, { lifecycleStatus: 'ACTIVA', metrics: [metric()],
      fechaInicio: '2026-01-01T00:30:00+02:00' }),
    validation400
  );
  assert.equal(row.lifecycleStatus, 'BORRADOR');
  assert.equal(calls.update.length, 0);
  assert.equal(calls.bulkCreate.length, 0);

  await metaService.update(5, { lifecycleStatus: 'ACTIVA', metrics: [metric()],
    fechaInicio: '2026-01-01T00:00:00Z' });
  assert.equal(row.lifecycleStatus, 'ACTIVA');
  assert.equal(row.fechaInicio, '2026-01-01T00:00:00Z');
  assert.equal(calls.bulkCreate.length, 1);
});

test('un fallo de persistencia en la activación revierte la transacción simulada', async () => {
  const { row } = setupWrites({ draftMetrics: [{ weight: 40 }] });
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  let rollback = false;
  stub(models.sequelize, 'transaction', async (callback) => {
    const previous = { ...row, draftMetrics: structuredClone(row.draftMetrics), metrics: [...row.metrics] };
    try {
      return await callback(transaction);
    } catch (error) {
      Object.assign(row, previous);
      rollback = true;
      throw error;
    }
  });
  stub(row, 'update', async (data, options) => {
    assert.equal(options.transaction, transaction);
    Object.assign(row, data);
  });
  stub(models.MetaMetric, 'destroy', async (options) => {
    assert.equal(options.transaction, transaction);
    row.metrics = [];
  });
  stub(models.MetaMetric, 'bulkCreate', async (_data, options) => {
    assert.equal(options.transaction, transaction);
    throw new Error('fallo simulado al persistir métricas');
  });
  await assert.rejects(
    metaService.update(5, { lifecycleStatus: 'ACTIVA', metrics: [metric()] }),
    /fallo simulado/
  );
  assert.equal(rollback, true);
  assert.equal(row.lifecycleStatus, 'BORRADOR');
  assert.deepEqual(row.draftMetrics, [{ weight: 40 }]);
  assert.deepEqual(row.metrics, []);
});

test('ACTIVA no vuelve a BORRADOR y conserva reemplazo completo de métricas', async () => {
  const { calls, row } = setupWrites({
    lifecycleStatus: 'ACTIVA', indicatorKey: 'kpi-a', valorMeta: 80, draftMetrics: null
  });
  await assert.rejects(metaService.update(5, { lifecycleStatus: 'BORRADOR' }), validation400);
  await assert.rejects(metaService.update(5, { lifecycleStatus: 'CERRADA' }), validation400);
  await assert.rejects(metaService.update(5, { draftMetrics: [{ weight: 10 }], metrics: [metric()] }), validation400);
  await metaService.update(5, { metrics: [metric({ targetValue: 90 })] });
  assert.equal(row.lifecycleStatus, 'ACTIVA');
  assert.equal(row.valorMeta, 90);
  assert.equal(calls.destroy, 1);
  assert.equal(calls.bulkCreate.length, 1);
});

test('un estado actual desconocido no permite transiciones arbitrarias', async () => {
  const { calls } = setupWrites({ lifecycleStatus: 'CERRADA' });
  await assert.rejects(metaService.update(5, { lifecycleStatus: 'ACTIVA', metrics: [metric()] }), validation400);
  assert.equal(calls.update.length, 0);
});

test('BORRADOR no consulta indicadores y distingue nulo de progreso cero', async () => {
  let calls = 0;
  const progress = await progressService.calculateProgress({
    lifecycleStatus: 'BORRADOR', anio: 2026, periodo: 'Anual', metrics: []
  }, { resolveIndicator: () => { calls++; throw new Error('No debe consultar'); } });
  assert.deepEqual(progress, { totalProgress: null, elapsedProgress: null, status: null, metrics: [] });
  assert.equal(calls, 0);
  const active = await progressService.calculateProgress({
    lifecycleStatus: 'ACTIVA', anio: 2026, periodo: 'Anual', metrics: []
  }, { now: new Date('2026-01-01T00:00:00Z') });
  assert.equal(active.totalProgress, 0);
  assert.equal(active.status, 'en_progreso');
});

test('detalle, progreso y listado ocultan BORRADOR ajeno y preservan ACTIVA', async () => {
  const draft = { id: 5, creatorId: 7, lifecycleStatus: 'BORRADOR', draftMetrics: [{ weight: 40 }], metrics: [] };
  const active = { id: 6, creatorId: 8, lifecycleStatus: 'ACTIVA', anio: 2026, periodo: 'Anual', metrics: [] };
  const stranger = { id: 9, roleGroup: 'Calidad' };
  const owner = { id: 7, roleGroup: 'Direccion' };
  const rector = { id: 10, roleGroup: 'Rectoria' };
  assert.equal(canReadMeta(stranger, draft), false);
  assert.equal(canReadMeta(owner, draft), true);
  assert.equal(canReadMeta(rector, draft), true);
  assert.equal(canReadMeta(stranger, active), true);
  assert.equal(canReadMeta({ id: null, roleGroup: 'Direccion' }, { ...draft, creatorId: null }), false);

  stub(metaService, 'getById', async () => draft);
  let nextError;
  await metaController.getById({ params: { id: 5 }, user: stranger }, {}, (error) => { nextError = error; });
  assert.equal(nextError.statusCode, 404);

  stub(models.Meta, 'findByPk', async () => draft);
  await assert.rejects(progressService.getMetaProgress(5, { user: stranger }), (error) => error.statusCode === 404);
  stub(models.Meta, 'findAll', async () => [draft, active]);
  const visible = await progressService.listMetasWithProgress({}, { user: stranger, now: new Date('2026-01-01T00:00:00Z') });
  assert.deepEqual(visible.map((meta) => meta.id), [6]);
  const owned = await progressService.listMetasWithProgress({}, { user: owner, now: new Date('2026-01-01T00:00:00Z') });
  assert.deepEqual(owned.map((meta) => meta.id), [5, 6]);
  assert.equal(owned[0].totalProgress, null);
});

test('serialización expone lifecycleStatus y draftMetrics sin revelar identidad interna', () => {
  const result = metaController.serializeMeta({
    id: 5, creatorId: 7, lifecycleStatus: 'BORRADOR', draftMetrics: [{ weight: 40 }],
    status: null, totalProgress: null, elapsedProgress: null, metrics: []
  }, { id: 7, roleGroup: 'Direccion', departmentId: 'calidad' });
  assert.equal(result.lifecycleStatus, 'BORRADOR');
  assert.deepEqual(result.draftMetrics, [{ weight: 40 }]);
  assert.equal(result.status, null);
  assert.equal(result.totalProgress, null);
  assert.equal(Object.hasOwn(result, 'creatorId'), false);
});

test('endpoints HTTP conservan autenticación, visibilidad, activación y códigos de error', async () => {
  const { row } = setupWrites();
  stub(models.Meta, 'findAll', async () => [row]);
  stub(require('../src/services/indicatorService'), 'getIndicatorValue', async () => ({ data: { value: 64, hasData: true } }));
  stub(require('../src/services/auditService'), 'record', async () => {});
  const app = express();
  app.use(express.json());
  app.use('/api/metas', require('../src/routes/metaRoutes'));
  app.use(require('../src/middleware/errorHandler'));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const request = async (method, route, body, user = { id: 7, roleGroup: 'Direccion', departmentId: 'calidad' }) => {
    const headers = { 'content-type': 'application/json' };
    if (user) headers.authorization = `Bearer ${jwt.sign(user, process.env.JWT_SECRET)}`;
    const response = await fetch(`http://127.0.0.1:${server.address().port}${route}`, {
      method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    return { status: response.status, body: await response.json() };
  };
  try {
    assert.equal((await request('GET', '/api/metas', undefined, null)).status, 401);
    assert.equal((await request('POST', '/api/metas', { ...fields(), lifecycleStatus: 'BORRADOR' }, null)).status, 401);
    assert.equal((await request('POST', '/api/metas', { ...fields(), lifecycleStatus: 'BORRADOR' },
      { id: 7, roleGroup: 'Calidad', departmentId: 'calidad' })).status, 403);
    const created = await request('POST', '/api/metas', {
      ...fields(), lifecycleStatus: 'BORRADOR', draftMetrics: [{ indicatorKey: 'kpi-a', weight: 40 }]
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.lifecycleStatus, 'BORRADOR');
    assert.equal(created.body.data.valorMeta, null);

    const detail = await request('GET', '/api/metas/5');
    assert.equal(detail.status, 200);
    assert.deepEqual(detail.body.data.draftMetrics, [{ indicatorKey: 'kpi-a', weight: 40 }]);
    const progress = await request('GET', '/api/metas/5/progress');
    assert.equal(progress.status, 200);
    assert.equal(progress.body.data.status, null);
    assert.equal(progress.body.data.totalProgress, null);
    const ownerList = await request('GET', '/api/metas');
    assert.deepEqual(ownerList.body.data.map((item) => item.id), [5]);

    const stranger = { id: 9, roleGroup: 'Direccion', departmentId: 'calidad' };
    assert.equal((await request('GET', '/api/metas/5', undefined, stranger)).status, 404);
    assert.equal((await request('GET', '/api/metas/5/progress', undefined, stranger)).status, 404);
    assert.deepEqual((await request('GET', '/api/metas', undefined, stranger)).body.data, []);
    assert.equal((await request('PUT', '/api/metas/5', { nombre: 'Ajena' }, stranger)).status, 403);
    assert.equal((await request('PUT', '/api/metas/5', { nombre: 'Sin token' }, null)).status, 401);
    assert.equal((await request('PUT', '/api/metas/5', { nombre: 'Otro departamento' },
      { id: 7, roleGroup: 'Direccion', departmentId: 'otro' })).status, 403);
    assert.equal((await request('GET', '/api/metas/5', undefined, { id: 10, roleGroup: 'Rectoria' })).status, 200);

    const invalid = await request('PUT', '/api/metas/5', { lifecycleStatus: 'ACTIVA', metrics: [metric({ weight: 90 })] });
    assert.equal(invalid.status, 400);
    assert.equal(row.lifecycleStatus, 'BORRADOR');
    const activated = await request('PUT', '/api/metas/5', { lifecycleStatus: 'ACTIVA', metrics: [metric()] });
    assert.equal(activated.status, 200);
    assert.equal(activated.body.data.lifecycleStatus, 'ACTIVA');
    assert.equal(activated.body.data.draftMetrics, null);
    assert.equal((await request('GET', '/api/metas/5', undefined, stranger)).status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('dashboard, contexto de indicadores, institucional y landing omiten BORRADOR', async () => {
  const active = { id: 1, lifecycleStatus: 'ACTIVA', anio: 2026, periodo: 'Anual', totalProgress: 80, status: 'en_progreso',
    metrics: [metric({ indicatorKey: 'kpi-b', indicator: { departmentId: 'calidad' } })] };
  const draft = { id: 2, lifecycleStatus: 'BORRADOR', anio: 2026, periodo: 'Anual', totalProgress: null, status: null,
    metrics: [{ indicatorKey: 'kpi-a', targetValue: 50 }] };
  stub(progressService, 'listMetasWithProgress', async () => [active, draft]);
  stub(models.Meta, 'findAll', async () => [active, draft]);
  stub(require('../src/services/indicatorService'), 'getIndicatorValue', async () => ({ data: { value: 64, hasData: true } }));
  const summary = await integrationService.getDashboardMetaSummary({ year: '2026' });
  assert.equal(summary.total, 1);
  assert.equal(summary.cumplimientoGlobal, 80);
  assert.equal(await integrationService.getIndicatorMetaContext('kpi-a', { year: '2026' }), null);
  const institutional = await progressService.getInstitutionalProgress();
  assert.equal(institutional.totalProgress, 80);
  const landing = await landingService.getLandingMetas();
  assert.deepEqual(landing.map((meta) => meta.id), [1]);
});

test('auditoría registra transición sin copiar draftMetrics y Swagger documenta el contrato', () => {
  const changes = buildChanges(
    { lifecycleStatus: 'BORRADOR', draftMetrics: [{ weight: 40 }], metrics: [] },
    { lifecycleStatus: 'ACTIVA', draftMetrics: null, metrics: [metric()] }
  );
  assert.deepEqual(changes.lifecycleStatus, { before: 'BORRADOR', after: 'ACTIVA' });
  assert.equal(Object.hasOwn(changes, 'draftMetrics'), false);
  const { swaggerDocs } = require('../src/config/swagger');
  const schemas = swaggerDocs.components.schemas;
  assert.ok(schemas.MetaDraftInput);
  assert.ok(schemas.MetaUpdateInput);
  assert.ok(schemas.DraftMetricInput);
  assert.match(swaggerDocs.paths['/api/metas'].post.description, /BORRADOR/);
});

test('migración declara backfill, restricciones condicionales y vista pública filtra ACTIVA', async () => {
  const queries = [];
  const database = {
    transaction: async (callback) => callback({ id: 'tx' }),
    query: async (sql, options) => { queries.push({ sql, options }); }
  };
  await migrateMetaLifecycle(database);
  assert.equal(queries.length, 3);
  assert.ok(queries.every(({ options }) => options.transaction.id === 'tx'));
  const sql = queries.map(({ sql: statement }) => statement).join('\n');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "lifecycleStatus"/);
  assert.match(sql, /UPDATE metas SET "lifecycleStatus" = 'ACTIVA'/);
  assert.match(sql, /ALTER COLUMN "valorMeta" DROP NOT NULL/);
  assert.match(sql, /chk_metas_lifecycle/);
  const views = fs.readFileSync(path.join(__dirname, '../src/services/dbConstraints.js'), 'utf8');
  assert.match(views, /FROM metas m\s+LEFT JOIN indicator_definitions i ON m\."indicatorKey" = i\.key\s+WHERE m\."lifecycleStatus" = 'ACTIVA'/);
  assert.equal((views.match(/SELECT DISTINCT anio FROM metas WHERE anio IS NOT NULL AND "lifecycleStatus" = 'ACTIVA'/g) || []).length, 2);
});

test('inicio de servidor conserva ambas migraciones antes de semillas y restricciones', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
  const steps = [
    'await sequelize.sync()',
    'await migrateMetaLifecycle()',
    'await migrateHelpAdmin()',
    'await preparePlantillaDepartmentMigration()',
    'await seedDatabase()',
    'await migratePlantillaDepartments()',
    'await seedIndicators()',
    'await initDbConstraints()'
  ];
  let previous = -1;
  for (const step of steps) {
    assert.equal(source.split(step).length - 1, 1, `${step} debe ejecutarse una sola vez`);
    const position = source.indexOf(step);
    assert.ok(position > previous, `${step} debe conservar el orden de inicialización`);
    previous = position;
  }
  assert.match(source, /app\.use\('\/api\/help', helpRoutes\)/);
});
