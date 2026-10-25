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
const closure = require('../src/services/metaClosureService');
const scheduler = require('../src/services/metaClosureScheduler');
const progress = require('../src/services/metaProgressService');
const metaService = require('../src/services/metaService');
const landing = require('../src/services/landingService');
const integration = require('../src/services/metaIndicatorIntegrationService');
const indicatorService = require('../src/services/indicatorService');
const controller = require('../src/controllers/metaController');
const cache = require('../src/services/cacheService');
const { validateFinalSnapshot } = require('../src/utils/metaSnapshot');
const { migrateMetaClosure } = require('../src/migrations/20261025-meta-closure');
const metaRoutes = require('../src/routes/metaRoutes');
const errorHandler = require('../src/middleware/errorHandler');

const originals = [];
const stub = (object, name, replacement) => {
  originals.push([object, name, object[name]]);
  object[name] = replacement;
};
test.afterEach(() => {
  scheduler.stopMetaClosureScheduler();
  while (originals.length) {
    const [object, name, original] = originals.pop();
    object[name] = original;
  }
});

const NOW = new Date('2026-10-25T12:00:00.000Z');
const actor = { id: 7, role: 'Director', departmentId: 'calidad' };
const metric = (overrides = {}) => ({
  id: 15, metaId: 5, indicatorKey: 'kpi-a', targetValue: 80, weight: 100,
  behavior: 'debe-superar', valueType: 'number', lowerLimit: null, upperLimit: null,
  indicator: { key: 'kpi-a', departmentId: 'calidad' }, ...overrides
});
const makeMeta = (overrides = {}) => ({
  id: 5, creatorId: 7, departmentId: 'calidad', anio: 2026, periodo: 'Anual',
  indicatorKey: 'kpi-a', valorMeta: 80, lifecycleStatus: 'ACTIVA', draftMetrics: null,
  fechaLimite: new Date('2026-10-24T12:00:00.000Z'), closedAt: null, finalSnapshot: null,
  ...overrides,
  async update(data, options) {
    assert.ok(options.transaction);
    Object.assign(this, data);
  }
});
const setup = (overrides = {}) => {
  const row = makeMeta(overrides);
  const calls = { audits: [], transactions: 0, invalidations: 0, indicators: 0, metrics: 0, locks: [] };
  stub(models.sequelize, 'transaction', async (fn) => {
    calls.transactions++;
    return fn({ LOCK: { UPDATE: 'UPDATE' } });
  });
  stub(models.Meta, 'findByPk', async (_id, options) => {
    calls.locks.push(options?.lock);
    return row;
  });
  stub(models.MetaMetric, 'findAll', async () => {
    calls.metrics++;
    return [metric()];
  });
  stub(models.AuditSesion, 'create', async (event, options) => {
    assert.ok(options.transaction);
    calls.audits.push(event);
  });
  stub(cache, 'invalidateMetas', () => { calls.invalidations++; });
  stub(cache, 'invalidateDepartment', () => { calls.invalidations++; });
  const resolveIndicator = async () => {
    calls.indicators++;
    return { data: { value: 40, hasData: true } };
  };
  return { row, calls, resolveIndicator };
};

test('ACTIVA se cierra con snapshot versionado, métrica real y auditoría transaccional', async () => {
  const { row, calls, resolveIndicator } = setup();
  const result = await closure.closeMeta(5, { actor, now: NOW, resolveIndicator });
  assert.equal(result.justClosed, true);
  assert.equal(row.lifecycleStatus, 'CERRADA');
  assert.equal(row.closedAt, NOW);
  assert.deepEqual(row.finalSnapshot, {
    version: 1, totalProgress: 50, elapsedProgress: progress.elapsedPercentage(row, NOW),
    status: 'en_progreso', metrics: [{
      metricId: 15, indicatorKey: 'kpi-a', currentValue: 40, targetValue: 80,
      weight: 100, behavior: 'debe-superar', valueType: 'number', lowerLimit: null,
      upperLimit: null, progress: 50, weightedProgress: 50, hasData: true
    }]
  });
  assert.equal(calls.locks[0], 'UPDATE');
  assert.equal(calls.audits.length, 1);
  assert.equal(calls.audits[0].accion, 'META_CLOSED');
  assert.equal(calls.audits[0].usuarioId, 7);
  assert.equal(JSON.parse(calls.audits[0].detalles).source, 'manual');
  assert.equal(calls.invalidations, 2);
  assert.equal(calls.indicators, 1);
  await validateFinalSnapshot(row.finalSnapshot);
});

test('cierre repetido autorizado devuelve el original sin recálculo, escritura ni segunda auditoría', async () => {
  const { row, calls, resolveIndicator } = setup();
  await closure.closeMeta(5, { actor, now: NOW, resolveIndicator });
  const snapshot = JSON.stringify(row.finalSnapshot);
  const firstClosedAt = row.closedAt;
  const result = await closure.closeMeta(5, { actor, now: new Date('2027-01-01'), resolveIndicator });
  assert.equal(result.justClosed, false);
  assert.equal(row.closedAt, firstClosedAt);
  assert.equal(JSON.stringify(row.finalSnapshot), snapshot);
  assert.equal(calls.audits.length, 1);
  assert.equal(calls.indicators, 1);
  assert.equal(calls.metrics, 1);
});

test('dos cierres concurrentes serializados por el bloqueo producen un único snapshot y evento', async () => {
  const { row, calls, resolveIndicator } = setup();
  let previous = Promise.resolve();
  stub(models.sequelize, 'transaction', async (fn) => {
    let release;
    const turn = new Promise((resolve) => { release = resolve; });
    const wait = previous;
    previous = turn;
    await wait;
    try {
      return await fn({ LOCK: { UPDATE: 'UPDATE' } });
    } finally {
      release();
    }
  });
  const [first, second] = await Promise.all([
    closure.closeMeta(5, { actor, now: NOW, resolveIndicator }),
    closure.closeMeta(5, { actor, now: NOW, resolveIndicator })
  ]);
  assert.equal(first.justClosed, true);
  assert.equal(second.justClosed, false);
  assert.equal(row.lifecycleStatus, 'CERRADA');
  assert.equal(calls.indicators, 1);
  assert.equal(calls.audits.length, 1);
  assert.deepEqual(calls.locks, ['UPDATE', 'UPDATE']);
});

test('BORRADOR no se puede cerrar, y un usuario ajeno tampoco puede cerrar una meta', async () => {
  const { row, calls, resolveIndicator } = setup();
  row.lifecycleStatus = 'BORRADOR';
  await assert.rejects(closure.closeMeta(5, { actor, now: NOW, resolveIndicator }), { statusCode: 409 });
  row.lifecycleStatus = 'ACTIVA';
  await assert.rejects(closure.closeMeta(5, {
    actor: { id: 8, departmentId: 'otro', role: 'Director' }, now: NOW, resolveIndicator
  }), { statusCode: 403 });
  await assert.rejects(closure.closeMeta(0, { actor }), { statusCode: 400 });
  assert.equal(calls.indicators, 0);
  assert.equal(calls.audits.length, 0);
});

test('Rectoría puede cerrar y el cierre automático registra actor sistema', async () => {
  const { row, calls, resolveIndicator } = setup();
  await closure.closeMeta(5, { actor: { id: 2, role: 'Rector' }, now: NOW, resolveIndicator });
  assert.equal(row.lifecycleStatus, 'CERRADA');
  assert.equal(calls.audits[0].usuarioId, 2);
  const second = setup();
  await closure.closeMeta(5, { source: 'automatic', now: NOW, resolveIndicator: second.resolveIndicator });
  assert.equal(second.calls.audits[0].usuarioId, null);
  assert.equal(second.calls.audits[0].rol, 'Sistema');
  assert.equal(JSON.parse(second.calls.audits[0].detalles).source, 'automatic');
});

test('fecha futura o exactamente igual no cierra; una fecha superada sí', async () => {
  const { row, calls, resolveIndicator } = setup({ fechaLimite: new Date(NOW) });
  for (const fechaLimite of [new Date(NOW), new Date(NOW.getTime() + 1)]) {
    row.fechaLimite = fechaLimite;
    assert.equal((await closure.closeMeta(5, { source: 'automatic', now: NOW, resolveIndicator })).justClosed, false);
  }
  assert.equal(calls.indicators, 0);
  row.fechaLimite = new Date(NOW.getTime() - 1);
  assert.equal((await closure.closeMeta(5, { source: 'automatic', now: NOW, resolveIndicator })).justClosed, true);
});

test('el cierre automático ignora BORRADOR y CERRADA incluso cuando están vencidas', async () => {
  const { row, calls, resolveIndicator } = setup({ lifecycleStatus: 'BORRADOR' });
  assert.equal((await closure.closeMeta(5, { source: 'automatic', now: NOW, resolveIndicator })).justClosed, false);
  row.lifecycleStatus = 'CERRADA';
  assert.equal((await closure.closeMeta(5, { source: 'automatic', now: NOW, resolveIndicator })).justClosed, false);
  assert.equal(calls.indicators, 0);
  assert.equal(calls.audits.length, 0);
});

test('sin datos, el snapshot conserva currentValue=null y hasData=false', async () => {
  const { row } = setup();
  await closure.closeMeta(5, {
    actor, now: NOW, resolveIndicator: async () => ({ data: { value: null, hasData: false } })
  });
  assert.equal(row.finalSnapshot.metrics[0].currentValue, null);
  assert.equal(row.finalSnapshot.metrics[0].hasData, false);
  assert.equal(row.finalSnapshot.metrics[0].weightedProgress, 0);
});

test('un cálculo fallido impide auditoría e invalidación y permite reintento', async () => {
  const { row, calls, resolveIndicator } = setup();
  await assert.rejects(closure.closeMeta(5, {
    actor, now: NOW, resolveIndicator: async () => { throw new Error('indicador no disponible'); }
  }), /indicador no disponible/);
  assert.equal(row.lifecycleStatus, 'ACTIVA');
  assert.equal(row.finalSnapshot, null);
  assert.equal(calls.audits.length, 0);
  assert.equal(calls.invalidations, 0);
  assert.equal((await closure.closeMeta(5, { actor, now: NOW, resolveIndicator })).justClosed, true);
});

test('si falla la auditoría transaccional se revierte también el estado y el snapshot', async () => {
  const { row, calls, resolveIndicator } = setup();
  stub(models.sequelize, 'transaction', async (fn) => {
    const before = { lifecycleStatus: row.lifecycleStatus, closedAt: row.closedAt,
      finalSnapshot: row.finalSnapshot };
    try {
      return await fn({ LOCK: { UPDATE: 'UPDATE' } });
    } catch (error) {
      Object.assign(row, before);
      throw error;
    }
  });
  stub(models.AuditSesion, 'create', async () => { throw new Error('auditoría no disponible'); });
  await assert.rejects(closure.closeMeta(5, { actor, now: NOW, resolveIndicator }), /auditoría no disponible/);
  assert.equal(row.lifecycleStatus, 'ACTIVA');
  assert.equal(row.closedAt, null);
  assert.equal(row.finalSnapshot, null);
  assert.equal(calls.invalidations, 0);
});

test('PUT y DELETE de CERRADA devuelven 409 sin escritura ni invalidación', async () => {
  const { row, calls } = setup({ lifecycleStatus: 'CERRADA' });
  let writes = 0;
  row.update = async () => { writes++; };
  row.destroy = async () => { writes++; };
  await assert.rejects(metaService.update(5, { nombre: 'Alterada' }), { statusCode: 409 });
  await assert.rejects(metaService.remove(5), { statusCode: 409 });
  assert.equal(writes, 0);
  assert.equal(calls.invalidations, 0);
  assert.deepEqual(calls.locks, ['UPDATE', 'UPDATE']);
});

test('POST ordinario no crea CERRADA ni acepta campos de cierre elegidos por cliente', async () => {
  const { calls } = setup();
  const fields = {
    departmentId: 'calidad', anio: 2026, periodo: 'Anual',
    fechaInicio: '2026-01-01T00:00:00Z', fechaLimite: '2026-12-31T00:00:00Z',
    metrics: [{ indicatorKey: 'kpi-a', targetValue: 80, weight: 100,
      behavior: 'debe-superar', valueType: 'number' }]
  };
  await assert.rejects(metaService.create({ ...fields, lifecycleStatus: 'CERRADA' }, 7), { statusCode: 409 });
  await assert.rejects(metaService.create({ ...fields, finalSnapshot: {} }, 7), { statusCode: 400 });
  await assert.rejects(metaService.create({ ...fields, closedAt: NOW }, 7), { statusCode: 400 });
  assert.equal(calls.invalidations, 0);
});

test('las consultas de progreso cerrado devuelven el snapshot sin pedir indicadores', async () => {
  const { row, calls, resolveIndicator } = setup();
  await closure.closeMeta(5, { actor, now: NOW, resolveIndicator });
  const saved = JSON.stringify(row.finalSnapshot);
  const forbidden = async () => { throw new Error('No se debe recalcular'); };
  const calculation = await progress.calculateProgress({ ...row, metrics: [metric()] }, { resolveIndicator: forbidden });
  const detail = await progress.getMetaProgress(5, { user: actor, resolveIndicator: forbidden });
  stub(models.Meta, 'findAll', async () => [row]);
  const listed = await progress.listMetasWithProgress({}, { user: actor, resolveIndicator: forbidden });
  assert.equal(calculation.totalProgress, 50);
  assert.equal(detail.totalProgress, 50);
  assert.equal(listed[0].totalProgress, 50);
  calculation.metrics[0].currentValue = 999;
  assert.equal(JSON.stringify(row.finalSnapshot), saved);
  assert.equal(calls.indicators, 1);
});

test('el resumen y la línea objetivo del dashboard usan el valor congelado', async () => {
  const { row, resolveIndicator } = setup();
  await closure.closeMeta(5, { actor, now: NOW, resolveIndicator });
  row.metrics = [metric()];
  const draft = makeMeta({ id: 6, lifecycleStatus: 'BORRADOR', indicatorKey: null, valorMeta: null });
  stub(models.Meta, 'findAll', async () => [row, draft]);
  stub(indicatorService, 'getIndicatorValue', async () => { throw new Error('No se debe consultar el indicador'); });
  const summary = await integration.getDashboardMetaSummary({ department: 'calidad', year: '2026' });
  assert.deepEqual(summary, { total: 1, cumplidas: 0, enRiesgo: 0, cumplimientoGlobal: 50 });
  const context = await integration.getIndicatorMetaContext('kpi-a', { year: '2026' });
  assert.deepEqual(context, { targetLine: { value: 80, label: 'Meta' },
    metaTarget: 80, metaStatus: 'en_progreso' });
  assert.equal((await integration.getDashboardMetaSummary({ year: '2025' })).total, 0);
  row.departmentId = null;
  const institutional = await progress.getInstitutionalProgress();
  assert.equal(institutional.totalProgress, 50);
});

test('el resolver de cierre evita únicamente la caché de valores de indicadores', async () => {
  const calls = [];
  stub(indicatorService, 'getIndicatorValue', async (...args) => {
    calls.push(args);
    return { data: { value: 10, hasData: true } };
  });
  const query = { department: 'calidad', year: 2026 };
  const meta = makeMeta();
  stub(models.sequelize, 'query', async () => { throw new Error('No debe leer la vista materializada'); });
  const previousEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    await progress.createIndicatorResolver({ fresh: true })('kpi-a', query, meta);
  } finally {
    process.env.NODE_ENV = previousEnvironment;
  }
  await progress.createIndicatorResolver()('kpi-a', query, meta);
  assert.deepEqual(calls.map((call) => call[2]), [{ bypassCache: true }, { bypassCache: false }]);
});

test('GET detalle y cierre exponen resultados congelados y permisos de solo lectura', async () => {
  const { row, resolveIndicator } = setup();
  await closure.closeMeta(5, { actor, now: NOW, resolveIndicator });
  const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await controller.getById({ params: { id: '5' }, user: actor }, response, (error) => { throw error; });
  assert.equal(response.code, 200);
  assert.equal(response.body.data.totalProgress, 50);
  assert.equal(response.body.data.permissions.canEdit, false);
  assert.equal(response.body.data.permissions.canDelete, false);
  assert.equal(response.body.data.finalSnapshot.totalProgress, 50);
  await controller.close({ params: { id: '5' }, user: actor, body: {} }, response, (error) => { throw error; });
  assert.equal(response.code, 200);
  assert.equal(response.body.data.closedAt, NOW);
});

test('el controlador rechaza payload de cierre para impedir snapshot elegido por cliente', async () => {
  const { calls } = setup();
  let failure;
  await controller.close({ params: { id: '5' }, user: actor, body: { finalSnapshot: {} } }, {}, (error) => { failure = error; });
  assert.equal(failure.statusCode, 400);
  assert.equal(calls.transactions, 0);
});

test('la búsqueda automática procesa vencidas por lotes, aísla fallos y reintenta', async () => {
  const rows = [
    makeMeta({ id: 1, fechaLimite: new Date('2026-01-01') }),
    makeMeta({ id: 2, fechaLimite: new Date('2026-02-01') }),
    makeMeta({ id: 3, fechaLimite: new Date('2026-03-01') })
  ];
  const audits = [];
  stub(models.sequelize, 'transaction', async (fn) => fn({ LOCK: { UPDATE: 'UPDATE' } }));
  stub(models.Meta, 'findByPk', async (id) => rows.find((row) => row.id === id));
  stub(models.MetaMetric, 'findAll', async ({ where }) => [metric({ id: where.metaId * 10, metaId: where.metaId })]);
  stub(models.AuditSesion, 'create', async (event) => { audits.push(event); });
  stub(cache, 'invalidateMetas', () => {});
  stub(cache, 'invalidateDepartment', () => {});
  stub(models.Meta, 'findAll', async ({ where, limit }) => rows.filter((row) =>
    row.lifecycleStatus === 'ACTIVA' && row.fechaLimite < NOW
      && (!where[require('sequelize').Op.or] || row.id > where[require('sequelize').Op.or][1].id[require('sequelize').Op.gt])
  ).slice(0, limit));
  let failFirst = true;
  const originalFindAll = models.MetaMetric.findAll;
  models.MetaMetric.findAll = async (options) => {
    if (options.where.metaId === 1 && failFirst) throw new Error('falla temporal');
    return originalFindAll(options);
  };
  const priorWarn = console.warn;
  console.warn = () => {};
  try {
    const first = await closure.closeExpiredMetas({ now: NOW, batchSize: 2,
      resolveIndicator: async () => ({ data: { value: 40, hasData: true } }) });
    assert.deepEqual(first, { examined: 3, closed: 2, failed: 1 });
    failFirst = false;
    const second = await closure.closeExpiredMetas({ now: NOW, batchSize: 2,
      resolveIndicator: async () => ({ data: { value: 40, hasData: true } }) });
    assert.deepEqual(second, { examined: 1, closed: 1, failed: 0 });
    assert.equal(audits.length, 3);
  } finally {
    console.warn = priorWarn;
  }
});

test('el planificador arranca una vez, requiere base lista y reintenta sin tráfico HTTP', async () => {
  let ready = false;
  let attempts = 0;
  let runs = 0;
  assert.equal(scheduler.startMetaClosureScheduler({
    enabled: true, intervalMs: 1000,
    ensureReady: async () => { attempts++; return ready; },
    runClosure: async () => { runs++; }
  }), true);
  assert.equal(scheduler.startMetaClosureScheduler({ enabled: true }), false);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(attempts, 1);
  assert.equal(runs, 0);
  ready = true;
  await new Promise((resolve) => setTimeout(resolve, 1050));
  assert.equal(runs, 1);
  assert.equal(scheduler.stopMetaClosureScheduler(), true);
});

test('la migración contiene control de estados, guardas de escritura y es repetible', async () => {
  const sql = [];
  const database = {
    transaction: async (fn) => fn({}),
    query: async (query) => { sql.push(query); }
  };
  await migrateMetaClosure(database);
  await migrateMetaClosure(database);
  assert.equal(sql.length, 8);
  const statement = sql.join('\n');
  for (const fragment of ['ADD COLUMN IF NOT EXISTS "closedAt"', 'ADD COLUMN IF NOT EXISTS "finalSnapshot"',
    'DROP CONSTRAINT chk_metas_lifecycle', '"lifecycleStatus" = \'CERRADA\'',
    'CREATE OR REPLACE FUNCTION guard_closed_meta()', 'CREATE OR REPLACE FUNCTION guard_closed_meta_metric()',
    "IF OLD.\"lifecycleStatus\" = 'CERRADA'", 'FOR UPDATE']) {
    assert.ok(statement.includes(fragment), fragment);
  }
  assert.match(statement, /BEFORE INSERT OR UPDATE OR DELETE ON metas/);
  assert.match(statement, /BEFORE INSERT OR UPDATE OR DELETE ON meta_metrics/);
});

test('el modelo y el validador rechazan estados finales incompletos o métricas incoherentes', async () => {
  const base = makeMeta();
  const valid = {
    version: 1, totalProgress: 0, elapsedProgress: 100, status: 'no_cumplida',
    metrics: [{ metricId: 15, indicatorKey: 'kpi-a', currentValue: null,
      targetValue: 80, weight: 100, behavior: 'debe-superar', valueType: 'number',
      lowerLimit: null, upperLimit: null, progress: 0, weightedProgress: 0, hasData: false }]
  };
  assert.equal(validateFinalSnapshot(valid), valid);
  assert.throws(() => validateFinalSnapshot({ ...valid, totalProgress: 50 }), { statusCode: 400 });
  assert.throws(() => validateFinalSnapshot({ ...valid, metrics: [{ ...valid.metrics[0], currentValue: 0 }] }),
    { statusCode: 400 });
  await assert.rejects(models.Meta.build({ ...base, lifecycleStatus: 'CERRADA',
    finalSnapshot: null, closedAt: NOW }).validate(), /resultado final/);
  await models.Meta.build({ ...base, lifecycleStatus: 'CERRADA',
    finalSnapshot: valid, closedAt: NOW }).validate();
});

test('POST de cierre protege autenticación, permisos, estado, payload y respuesta idempotente', async () => {
  const { row } = setup();
  const app = express();
  app.use(express.json());
  app.use('/api/metas', metaRoutes);
  const priorError = console.error;
  console.error = () => {};
  app.use(errorHandler);
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const url = `http://127.0.0.1:${server.address().port}/api/metas`;
  const token = (user) => jwt.sign(user, process.env.JWT_SECRET);
  const request = async (id, user, body) => fetch(`${url}/${id}/cerrar`, {
    method: 'POST',
    headers: { ...(user ? { Authorization: `Bearer ${token(user)}` } : {}),
      'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const originalFindByPk = models.Meta.findByPk;
  stub(models.Meta, 'findByPk', async (id, options) => (Number(id) === 99 ? null : originalFindByPk(id, options)));
  try {
    assert.equal((await request(5)).status, 401);
    assert.equal((await request('x', actor)).status, 400);
    assert.equal((await request(99, actor)).status, 404);
    assert.equal((await request(5, { id: 8, role: 'Director', departmentId: 'otro' })).status, 403);
    assert.equal((await request(5, { id: 7, roleGroup: 'Calidad', departmentId: 'calidad' })).status, 403);
    assert.equal((await request(5, actor, { finalSnapshot: { totalProgress: 999 } })).status, 400);
    row.lifecycleStatus = 'BORRADOR';
    assert.equal((await request(5, actor)).status, 409);
    row.lifecycleStatus = 'ACTIVA';
    stub(closure, 'closeMeta', async () => {
      row.lifecycleStatus = 'CERRADA';
      row.closedAt = NOW;
      row.finalSnapshot = {
        version: 1, totalProgress: 50, elapsedProgress: 80, status: 'en_progreso',
        metrics: [{ metricId: 15, indicatorKey: 'kpi-a', currentValue: 40, targetValue: 80,
          weight: 100, behavior: 'debe-superar', valueType: 'number', lowerLimit: null,
          upperLimit: null, progress: 50, weightedProgress: 50, hasData: true }]
      };
      return { meta: row, justClosed: true };
    });
    const success = await request(5, actor);
    assert.equal(success.status, 200);
    assert.equal((await success.json()).data.finalSnapshot.totalProgress, 50);
    assert.equal((await request(5, actor)).status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    console.error = priorError;
  }
});

test('la landing de pruebas excluye CERRADA; la vista SQL permanece filtrada a ACTIVA', async () => {
  stub(progress, 'listMetasWithProgress', async () => [
    { id: 1, lifecycleStatus: 'CERRADA', totalProgress: 50, metrics: [] },
    { id: 2, lifecycleStatus: 'ACTIVA', totalProgress: 70, metrics: [] }
  ]);
  assert.deepEqual((await landing.getLandingMetas()).map((item) => item.id), [2]);
  const views = fs.readFileSync(path.join(__dirname, '../src/services/dbConstraints.js'), 'utf8');
  assert.match(views, /v_landing_metas/);
  assert.match(views, /"lifecycleStatus"\s*=\s*'ACTIVA'/);
});
