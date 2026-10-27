process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/piadi_test';
process.env.JWT_SECRET ||= 'test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const models = require('../src/models');
const helpService = require('../src/services/helpService');
const helpRoutes = require('../src/routes/helpRoutes');
const errorHandler = require('../src/middleware/errorHandler');
const { swaggerDocs } = require('../src/config/swagger');
const { HELP_MODULES } = require('../src/config/helpModules');
const { migrateHelpAdmin } = require('../src/migrations/20261025-help-admin');

const originals = [];
const stub = (object, name, replacement) => {
  originals.push([object, name, object[name]]);
  object[name] = replacement;
};
test.afterEach(() => {
  while (originals.length) {
    const [object, name, original] = originals.pop();
    object[name] = original;
  }
});

const entryData = (overrides = {}) => ({
  modulo: 'desarrollo_curricular',
  pregunta: '¿Cómo se consulta la tasa de aprobación?',
  respuesta: 'Selecciona el período y revisa el indicador correspondiente.',
  orden: 1,
  activo: true,
  ...overrides
});

const setupStore = (initial = []) => {
  const rows = initial.map((row) => ({ ...row }));
  const calls = { create: [], update: [], destroy: 0, findAll: [] };
  let nextId = Math.max(0, ...rows.map((row) => row.id)) + 1;
  stub(models.EntradaAyuda, 'findAll', async (options) => {
    calls.findAll.push(options);
    return [...rows].sort((a, b) => a.modulo.localeCompare(b.modulo)
      || a.orden - b.orden || a.id - b.id);
  });
  stub(models.EntradaAyuda, 'create', async (data) => {
    calls.create.push({ ...data });
    const row = { id: nextId++, ...data, createdAt: new Date('2026-10-25T00:00:00Z'),
      updatedAt: new Date('2026-10-25T00:00:00Z') };
    rows.push(row);
    return row;
  });
  stub(models.EntradaAyuda, 'findByPk', async (id) => {
    const row = rows.find((candidate) => candidate.id === id);
    if (!row) return null;
    return {
      ...row,
      async update(fields) {
        calls.update.push({ id, fields: { ...fields } });
        Object.assign(row, fields);
        Object.assign(this, fields);
        return this;
      }
    };
  });
  stub(models.EntradaAyuda, 'destroy', async () => { calls.destroy++; });
  return { rows, calls };
};

const rejects400 = (promise) => assert.rejects(promise, { statusCode: 400 });

test('modelo y catálogo comparten los once módulos provisionales y los tipos previstos', async () => {
  assert.deepEqual(HELP_MODULES, [
    'dashboard', 'educacion_continua', 'vinculacion_medio', 'innovacion',
    'admision', 'desarrollo_curricular', 'metas', 'carga_datos',
    'repositorio', 'reportes', 'auditoria'
  ]);
  assert.equal(models.EntradaAyuda.getTableName(), 'entradas_ayuda');
  assert.equal(models.EntradaAyuda.rawAttributes.activo.defaultValue, true);
  assert.equal(models.EntradaAyuda.rawAttributes.orden.allowNull, false);
  assert.equal(models.EntradaAyuda.options.timestamps, true);
  await models.EntradaAyuda.build(entryData()).validate();
  await assert.rejects(models.EntradaAyuda.build(entryData({ modulo: 'inventado' })).validate());
  await assert.rejects(models.EntradaAyuda.build(entryData({ orden: -1 })).validate());
});

test('listado administrativo vacío y mixto conserva inactivas y orden módulo/orden/id', async () => {
  const { calls } = setupStore();
  assert.deepEqual(await helpService.listAdmin(), []);
  assert.deepEqual(calls.findAll[0], {
    order: [['modulo', 'ASC'], ['orden', 'ASC'], ['id', 'ASC']]
  });
  const sample = [
    { id: 3, ...entryData({ modulo: 'metas', orden: 2, activo: false }) },
    { id: 2, ...entryData({ modulo: 'dashboard', orden: 1 }) },
    { id: 4, ...entryData({ modulo: 'dashboard', orden: 1, activo: false }) },
    { id: 1, ...entryData({ modulo: 'dashboard', orden: 0 }) }
  ];
  const second = setupStore(sample);
  assert.deepEqual((await helpService.listAdmin()).map((row) => row.id), [1, 2, 4, 3]);
  assert.equal((await helpService.listAdmin()).filter((row) => !row.activo).length, 2);
  assert.equal(second.calls.destroy, 0);
});

test('creación normaliza texto plano, conserva activo=false y aplica true por defecto', async () => {
  const { calls, rows } = setupStore();
  const created = await helpService.createEntry(entryData({
    pregunta: '  ¿Cómo   se consulta?  ', respuesta: '  Paso  uno.\r\nPaso  dos.  ', activo: false
  }));
  assert.equal(created.pregunta, '¿Cómo se consulta?');
  assert.equal(created.respuesta, 'Paso uno.\nPaso dos.');
  assert.equal(created.activo, false);
  assert.equal(rows.length, 1);
  const withoutActive = entryData();
  delete withoutActive.activo;
  await helpService.createEntry(withoutActive);
  assert.equal(calls.create[1].activo, true);
});

test('POST rechaza módulo, pregunta, respuesta, orden, activo y propiedades inválidas', async () => {
  const { calls } = setupStore();
  for (const invalid of [
    { modulo: 'inexistente' }, { modulo: '' }, { modulo: [] },
    { pregunta: '   ' }, { pregunta: {} }, { pregunta: '<script>alert(1)</script>' },
    { respuesta: '' }, { respuesta: [] }, { respuesta: '<b>HTML</b>' },
    { orden: -1 }, { orden: 1.5 }, { orden: '1' }, { orden: 2147483648 },
    { activo: 'false' }, { activo: 0 }, { createdAt: '2026-01-01' },
    { id: 9 }, { extra: 'no' }
  ]) {
    await rejects400(helpService.createEntry(entryData(invalid)));
  }
  for (const key of ['modulo', 'pregunta', 'respuesta', 'orden']) {
    const missing = entryData();
    delete missing[key];
    await rejects400(helpService.createEntry(missing));
  }
  await rejects400(helpService.createEntry({}));
  await rejects400(helpService.createEntry([]));
  assert.equal(calls.create.length, 0);
});

test('PUT parcial activa, desactiva y conserva campos omitidos sin borrar', async () => {
  const { calls, rows } = setupStore([{ id: 5, ...entryData() }]);
  await helpService.updateEntry('5', { activo: false });
  assert.equal(rows[0].activo, false);
  assert.equal(rows[0].pregunta, entryData().pregunta);
  await helpService.updateEntry('5', { activo: true });
  await helpService.updateEntry('5', { pregunta: ' Nueva pregunta ', respuesta: ' Nueva respuesta ' });
  await helpService.updateEntry('5', { modulo: 'metas', orden: 2 });
  assert.equal(rows[0].activo, true);
  assert.equal(rows[0].pregunta, 'Nueva pregunta');
  assert.equal(rows[0].respuesta, 'Nueva respuesta');
  assert.equal(rows[0].modulo, 'metas');
  assert.equal(rows[0].orden, 2);
  assert.deepEqual(calls.update[0].fields, { activo: false });
  assert.equal(calls.destroy, 0);
});

test('PUT rechaza ID, payload y módulo inválidos; devuelve 404 sin upsert', async () => {
  const { calls, rows } = setupStore([{ id: 1, ...entryData() }]);
  for (const id of ['0', '-1', 'abc', '1.2', '2147483648']) {
    await rejects400(helpService.updateEntry(id, { activo: false }));
  }
  for (const body of [{}, { activo: 'false' }, { modulo: 'inexistente' },
    { pregunta: '<img src=x>' }, { orden: -1 }, { foo: 1 }, { id: 2 }, null]) {
    await rejects400(helpService.updateEntry('1', body));
  }
  await assert.rejects(helpService.updateEntry('999', { activo: false }), { statusCode: 404 });
  assert.equal(calls.update.length, 0);
  assert.equal(calls.create.length, 0);
  assert.equal(rows.length, 1);
});

test('migración es repetible, preserva datos y usa el catálogo central en su restricción', async () => {
  const queries = [];
  const database = {
    transaction: async (callback) => callback({ id: 'transacción simulada' }),
    query: async (sql, options) => {
      assert.equal(options.transaction.id, 'transacción simulada');
      queries.push(sql);
    }
  };
  await migrateHelpAdmin(database);
  await migrateHelpAdmin(database);
  assert.equal(queries.length, 6);
  const sql = queries.slice(0, 3).join('\n');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS entradas_ayuda/);
  assert.match(sql, /PRIMARY KEY/);
  assert.match(sql, /DEFAULT TRUE/);
  assert.match(sql, /chk_entradas_ayuda_contenido/);
  assert.match(sql, /chk_entradas_ayuda_orden/);
  assert.match(sql, /chk_entradas_ayuda_modulo/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_entradas_ayuda_admin/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_entradas_ayuda_activas/);
  assert.doesNotMatch(sql, /\b(DROP TABLE|DELETE FROM|TRUNCATE)\b/i);
  for (const modulo of HELP_MODULES) assert.ok(sql.includes(`'${modulo}'`));
});

test('Swagger documenta únicamente tres operaciones administrativas con el mismo catálogo', () => {
  const schemas = swaggerDocs.components.schemas;
  assert.deepEqual(schemas.ModuloAyuda.enum, HELP_MODULES);
  assert.equal(schemas.DatosEntradaAyuda.additionalProperties, false);
  assert.ok(schemas.EntradaAyuda.properties.createdAt);
  assert.ok(schemas.EntradaAyuda.properties.updatedAt);
  const admin = swaggerDocs.paths['/api/help/admin'];
  const update = swaggerDocs.paths['/api/help/admin/{id}'];
  assert.ok(admin.get && admin.post && update.put);
  assert.equal(admin.delete, undefined);
  assert.equal(update.delete, undefined);
  assert.ok(swaggerDocs.paths['/api/help'].get);
  for (const operation of [admin.get, admin.post, update.put]) {
    assert.deepEqual(operation.security, [{ bearerAuth: [] }]);
    assert.ok(operation.responses['401']);
    assert.ok(operation.responses['403']);
  }
});

test('rutas reales exigen JWT y Rectoría; GET, POST y PUT mantienen contratos y no hay DELETE', async () => {
  const { rows, calls } = setupStore();
  const app = express();
  app.use(express.json());
  app.use('/api/help', helpRoutes);
  const priorError = console.error;
  console.error = () => {};
  app.use(errorHandler);
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const url = `http://127.0.0.1:${server.address().port}/api/help`;
  const rector = jwt.sign({ id: 7, role: 'Rector' }, process.env.JWT_SECRET);
  const rectoria = jwt.sign({ id: 8, roleGroup: 'Rectoria' }, process.env.JWT_SECRET);
  const nonRector = jwt.sign({ id: 9, role: 'Director', roleGroup: 'Direccion' }, process.env.JWT_SECRET);
  const request = (path, method, token, body) => fetch(`${url}${path}`, {
    method,
    headers: { ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
      'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  try {
    for (const [path, method] of [['/admin', 'GET'], ['/admin', 'POST'], ['/admin/1', 'PUT']]) {
      assert.equal((await request(path, method)).status, 401);
      assert.equal((await request(path, method, 'token-inválido')).status, 401);
      assert.equal((await request(path, method, nonRector)).status, 403);
    }
    assert.equal((await request('/admin', 'POST', nonRector,
      { ...entryData(), roleGroup: 'Rectoria' })).status, 403);
    assert.deepEqual((await (await request('/admin', 'GET', rector)).json()).data, []);
    const created = await request('/admin', 'POST', rector, entryData({ activo: false }));
    assert.equal(created.status, 201);
    const saved = (await created.json()).data;
    assert.equal(saved.activo, false);
    assert.ok(saved.createdAt && saved.updatedAt);
    assert.equal(rows.length, 1);
    const listed = await request('/admin', 'GET', rectoria);
    assert.equal(listed.status, 200);
    assert.equal((await listed.json()).data[0].activo, false);
    const updated = await request(`/admin/${saved.id}`, 'PUT', rectoria, { activo: true });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).data.activo, true);
    const deactivated = await request(`/admin/${saved.id}`, 'PUT', rector, { activo: false });
    assert.equal(deactivated.status, 200);
    assert.equal((await deactivated.json()).data.activo, false);
    assert.equal(rows[0].pregunta, entryData().pregunta);
    assert.equal((await request('/admin/no', 'PUT', rector, { activo: false })).status, 400);
    assert.equal((await request('/admin/999', 'PUT', rector, { activo: false })).status, 404);
    assert.equal((await request('/admin', 'POST', rector, entryData({ modulo: 'otro' }))).status, 400);
    assert.equal((await request(`/admin/${saved.id}`, 'PUT', rector, {})).status, 400);
    assert.equal((await request(`/admin/${saved.id}`, 'DELETE', rector)).status, 404);
    const publicRead = await request('?modulo=dashboard', 'GET', rector);
    assert.equal(publicRead.status, 200);
    stub(models.EntradaAyuda, 'findAll', async () => { throw new Error('detalle interno de SQL'); });
    const serverError = await request('/admin', 'GET', rector);
    assert.equal(serverError.status, 500);
    assert.doesNotMatch(JSON.stringify(await serverError.json()), /detalle interno de SQL/);
    assert.equal(rows.length, 1);
    assert.equal(calls.destroy, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    console.error = priorError;
  }
});
