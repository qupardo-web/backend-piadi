process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const auditService = require('../src/services/auditService');
const metaService = require('../src/services/metaService');
const metaController = require('../src/controllers/metaController');
const { auditMetaOperation, buildChanges } = require('../src/middleware/metaAudit');
const metaRoutes = require('../src/routes/metaRoutes');

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

const response = () => Object.assign(new EventEmitter(), {
  locals: {},
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
  send() { return this; }
});

const waitForAudit = () => new Promise((resolve) => setImmediate(resolve));

const runAuditedController = async ({ operation, controller, req, res }) => {
  auditMetaOperation(operation)(req, res, () => {});
  let propagated;
  await controller(req, res, (error) => { propagated = error; });
  if (propagated) {
    res.statusCode = propagated.statusCode || 500;
  }
  res.emit('finish');
  await waitForAudit();
  return propagated;
};

const metric = (targetValue) => ({
  id: 99,
  metaId: 15,
  indicatorKey: 'total-convenios',
  weight: 100,
  behavior: 'debe-alcanzar-o-superar',
  targetValue,
  valueType: 'number',
  createdAt: 'dato interno',
  password: 'no registrar'
});

test('CREATE registra un único META_CREATED con actor, Meta y cantidad de métricas', async () => {
  const records = [];
  const created = {
    id: 15,
    departmentId: 'vinculacion_medio',
    nombre: 'Convenios vigentes',
    metrics: [metric(75), { ...metric(80), indicatorKey: 'actividades-vcm' }]
  };
  stub(metaService, 'create', async () => created);
  stub(auditService, 'record', async (type, payload) => { records.push({ type, payload }); });
  const req = {
    method: 'POST',
    originalUrl: '/api/metas',
    user: { id: 7, role: 'Vinculación Con El Medio', roleGroup: 'Direccion' },
    body: { password: 'no registrar', authorization: 'Bearer secreto' }
  };
  const res = response();

  await runAuditedController({ operation: 'CREATE', controller: metaController.create, req, res });

  assert.equal(records.length, 1);
  assert.equal(records[0].type, 'session');
  assert.equal(records[0].payload.action, 'META_CREATED');
  assert.equal(records[0].payload.userId, 7);
  assert.equal(records[0].payload.role, 'Vinculación Con El Medio');
  const details = JSON.parse(records[0].payload.detalles);
  assert.equal(details.metaId, 15);
  assert.equal(details.metaName, 'Convenios vigentes');
  assert.equal(details.departmentId, 'vinculacion_medio');
  assert.equal(details.metricCount, 2);
});

test('UPDATE registra META_UPDATED con diff seguro de Meta y métricas persistidas', async () => {
  const records = [];
  const before = {
    id: 15,
    departmentId: 'vinculacion_medio',
    nombre: 'Meta inicial',
    valorMeta: '75.00',
    updatedAt: 'dato interno',
    metrics: [metric(75)]
  };
  const after = {
    ...before,
    nombre: 'Meta ajustada',
    valorMeta: '80.00',
    metrics: [metric(80)]
  };
  stub(metaService, 'update', async () => after);
  stub(auditService, 'record', async (type, payload) => { records.push({ type, payload }); });
  const req = {
    method: 'PUT',
    originalUrl: '/api/metas/15',
    params: { id: '15' },
    user: { id: 7, role: 'Vinculación Con El Medio', roleGroup: 'Direccion' },
    meta: before,
    headers: { authorization: 'Bearer secreto' },
    body: { password: 'no registrar', nombre: 'Meta ajustada' }
  };
  const res = response();

  await runAuditedController({ operation: 'UPDATE', controller: metaController.update, req, res });

  assert.equal(records.length, 1);
  assert.equal(records[0].payload.action, 'META_UPDATED');
  const details = JSON.parse(records[0].payload.detalles);
  assert.equal(details.metaName, 'Meta ajustada');
  assert.deepEqual(details.changes.nombre, { before: 'Meta inicial', after: 'Meta ajustada' });
  assert.deepEqual(details.changes.valorMeta, { before: '75.00', after: '80.00' });
  assert.equal(details.changes.metrics.before[0].targetValue, 75);
  assert.equal(details.changes.metrics.after[0].targetValue, 80);
  for (const forbidden of ['password', 'authorization', 'Bearer secreto', 'updatedAt', 'createdAt']) {
    assert.equal(records[0].payload.detalles.includes(forbidden), false);
  }
});

test('DELETE registra la referencia mínima solo después de eliminar correctamente', async () => {
  const records = [];
  stub(metaService, 'remove', async () => undefined);
  stub(auditService, 'record', async (type, payload) => { records.push({ type, payload }); });
  const req = {
    method: 'DELETE',
    originalUrl: '/api/metas/15',
    params: { id: '15' },
    user: { id: 7, role: 'Vinculación Con El Medio', roleGroup: 'Direccion' },
    meta: {
      id: 15,
      departmentId: 'vinculacion_medio',
      nombre: 'Meta a eliminar',
      anio: 2026,
      periodo: 'Anual',
      password: 'no registrar'
    }
  };
  const res = response();

  await runAuditedController({ operation: 'DELETE', controller: metaController.remove, req, res });

  assert.equal(res.statusCode, 204);
  assert.equal(records.length, 1);
  assert.equal(records[0].payload.action, 'META_DELETED');
  const details = JSON.parse(records[0].payload.detalles);
  assert.equal(details.metaId, 15);
  assert.equal(details.metaName, 'Meta a eliminar');
  assert.equal(details.departmentId, 'vinculacion_medio');
  assert.deepEqual(details.reference, { nombre: 'Meta a eliminar', anio: 2026, periodo: 'Anual' });
});

test('Rectoría conserva UPDATE_DEPARTMENTAL_META sin duplicar META_UPDATED', async () => {
  const records = [];
  const before = { id: 15, departmentId: 'calidad', nombre: 'Anterior', metrics: [] };
  const after = { ...before, nombre: 'Nueva', metrics: [] };
  stub(metaService, 'update', async () => after);
  stub(auditService, 'record', async (type, payload) => { records.push({ type, payload }); });
  const req = {
    method: 'PUT',
    originalUrl: '/api/metas/15',
    params: { id: '15' },
    user: { id: 2, role: 'Rector', roleGroup: 'Rectoria' },
    meta: before,
    body: { nombre: 'Nueva' }
  };

  await runAuditedController({ operation: 'UPDATE', controller: metaController.update, req, res: response() });

  assert.equal(records.length, 1);
  assert.equal(records[0].payload.action, 'UPDATE_DEPARTMENTAL_META');
  const details = JSON.parse(records[0].payload.detalles);
  assert.equal(details.metaName, 'Nueva');
  assert.equal(details.changes.nombre.after, 'Nueva');
});

test('una operación fallida no se registra como éxito', async () => {
  const records = [];
  stub(metaService, 'update', async () => { throw Object.assign(new Error('fallo controlado'), { statusCode: 500 }); });
  stub(auditService, 'record', async (type, payload) => { records.push({ type, payload }); });
  const req = {
    method: 'PUT',
    originalUrl: '/api/metas/15',
    params: { id: '15' },
    user: { id: 7, role: 'Vinculación Con El Medio', roleGroup: 'Direccion' },
    meta: { id: 15, departmentId: 'vinculacion_medio' },
    body: {}
  };

  const error = await runAuditedController({
    operation: 'UPDATE',
    controller: metaController.update,
    req,
    res: response()
  });

  assert.equal(error.message, 'fallo controlado');
  assert.equal(records.length, 0);
});

test('el diff excluye propiedades ORM, identidad, timestamps y secretos', () => {
  const changes = buildChanges(
    {
      id: 15,
      creatorId: 7,
      departmentId: 'calidad',
      nombre: 'Antes',
      password: 'secreto',
      token: 'jwt',
      createdAt: 'ayer',
      updatedAt: 'ayer',
      metrics: [metric(75)]
    },
    {
      id: 15,
      creatorId: 8,
      departmentId: 'calidad',
      nombre: 'Después',
      password: 'otro',
      token: 'otro-jwt',
      createdAt: 'ayer',
      updatedAt: 'hoy',
      metrics: [metric(80)]
    }
  );

  assert.deepEqual(Object.keys(changes).sort(), ['metrics', 'nombre']);
  const serialized = JSON.stringify(changes);
  for (const forbidden of ['password', 'token', 'creatorId', 'createdAt', 'updatedAt', 'metaId']) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test('las rutas CREATE, UPDATE y DELETE conectan una sola auditoría general', () => {
  const routes = metaRoutes.stack.filter((layer) => layer.route);
  for (const [method, path] of [['post', '/'], ['put', '/:id'], ['delete', '/:id']]) {
    const route = routes.find((layer) => layer.route.path === path && layer.route.methods[method]);
    const handlers = route.route.stack.map((layer) => layer.handle.name);
    assert.equal(handlers.filter((name) => name === 'auditMetaOperationMiddleware').length, 1);
    assert.equal(handlers.includes('auditRectoriaDepartmentalMetaUpdate'), false);
  }
});

test('un fallo del audit log no revierte ni cambia la respuesta exitosa de Meta', async () => {
  stub(metaService, 'create', async () => ({ id: 15, departmentId: 'calidad', metrics: [] }));
  stub(auditService, 'record', async () => { throw new Error('audit offline'); });
  const warnings = [];
  stub(console, 'warn', (...args) => warnings.push(args.join(' ')));
  const req = {
    method: 'POST',
    originalUrl: '/api/metas',
    user: { id: 7, role: 'Vicerrectoria de Calidad', roleGroup: 'Calidad' },
    body: {}
  };
  const res = response();

  await runAuditedController({ operation: 'CREATE', controller: metaController.create, req, res });

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.success, true);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /No se pudo registrar CREATE/);
});
