process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/piadi_test';
process.env.JWT_SECRET ||= 'test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const models = require('../src/models');
const helpService = require('../src/services/helpService');
const auditService = require('../src/services/auditService');
const helpRoutes = require('../src/routes/helpRoutes');
const errorHandler = require('../src/middleware/errorHandler');
const { swaggerDocs } = require('../src/config/swagger');
const { HELP_MODULES } = require('../src/config/helpModules');

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

const entry = (id, overrides = {}) => ({
  id, modulo: 'desarrollo_curricular', pregunta: `Pregunta ${id}`,
  respuesta: `Respuesta ${id}`, orden: 1, activo: true,
  createdAt: new Date('2026-10-25T00:00:00Z'),
  updatedAt: new Date('2026-10-25T00:00:00Z'),
  ...overrides
});

const setupStore = () => {
  const rows = [
    entry(7, { orden: 2 }),
    entry(4),
    entry(8, { activo: false, orden: 0 }),
    entry(9, { modulo: 'dashboard', orden: 0 }),
    entry(3)
  ];
  const calls = { findAll: [], create: 0, update: 0 };
  stub(models.EntradaAyuda, 'findAll', async (options) => {
    calls.findAll.push(options);
    const matching = options.where
      ? rows.filter((row) => row.modulo === options.where.modulo && row.activo === options.where.activo)
      : rows;
    return [...matching].sort((left, right) => {
      if (!options.where) {
        const byModule = left.modulo.localeCompare(right.modulo);
        if (byModule) return byModule;
      }
      return left.orden - right.orden || left.id - right.id;
    });
  });
  stub(models.EntradaAyuda, 'create', async (data) => {
    calls.create++;
    const created = entry(10, data);
    rows.push(created);
    return created;
  });
  stub(models.EntradaAyuda, 'findByPk', async (id) => {
    const row = rows.find((candidate) => candidate.id === id);
    if (!row) return null;
    return {
      ...row,
      async update(fields) {
        calls.update++;
        Object.assign(row, fields);
        Object.assign(this, fields);
      }
    };
  });
  return { rows, calls };
};

const withServer = async (callback) => {
  const app = express();
  app.use(express.json());
  app.use('/api/help', helpRoutes);
  const previousError = console.error;
  console.error = () => {};
  app.use(errorHandler);
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/help`;
  const token = (user) => jwt.sign(user, process.env.JWT_SECRET);
  const request = (path, { method = 'GET', user, rawToken, body } = {}) => fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(user ? { Authorization: `Bearer ${token(user)}` } : {}),
      ...(rawToken ? { Authorization: `Bearer ${rawToken}` } : {}),
      'Content-Type': 'application/json'
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  try {
    await callback({ request });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    console.error = previousError;
  }
};

const director = { id: 9, role: 'Director', departmentId: 'innovacion' };
const rector = { id: 7, role: 'Rector' };
const calidad = { id: 8, roleGroup: 'Calidad' };

test('servicio reutiliza el catálogo y filtra activas con orden estable en una sola consulta', async () => {
  const { calls } = setupStore();
  const rows = await helpService.listActiveByModule(' desarrollo_curricular ');
  assert.deepEqual(rows.map((row) => row.id), [3, 4, 7]);
  assert.deepEqual(calls.findAll, [{
    where: { modulo: 'desarrollo_curricular', activo: true },
    order: [['orden', 'ASC'], ['id', 'ASC']]
  }]);
  assert.deepEqual(await helpService.listActiveByModule('auditoria'), []);
});

test('valores ausentes, vacíos, desconocidos, repetidos y estructurados fallan antes de consultar el modelo', async () => {
  const { calls } = setupStore();
  for (const value of [undefined, null, '', '   ', 'otro', 'Desarrollo_Curricular',
    ['dashboard', 'dashboard'], ['dashboard'], { valor: 'dashboard' }, 1]) {
    await assert.rejects(helpService.listActiveByModule(value), { statusCode: 400 });
  }
  assert.equal(calls.findAll.length, 0);
  assert.deepEqual(HELP_MODULES.includes('desarrollo_curricular'), true);
});

test('GET público exige JWT y permite Rectoría, otro departamento y rol de solo lectura', async () => {
  const { calls } = setupStore();
  await withServer(async ({ request }) => {
    const path = '/?modulo=desarrollo_curricular';
    assert.equal((await request(path)).status, 401);
    assert.equal((await request(path, { rawToken: 'token-inválido' })).status, 401);
    for (const user of [rector, director, calidad]) {
      const response = await request(path, { user });
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.success, true);
      assert.deepEqual(payload.data.map((row) => row.id), [3, 4, 7]);
      assert.ok(payload.data.every((row) => row.modulo === 'desarrollo_curricular' && row.activo === true));
      assert.ok(payload.data[0].createdAt && payload.data[0].updatedAt);
    }
    assert.ok(calls.findAll.every((call) => call.where.activo === true));
  });
});

test('GET filtra módulo, devuelve 200 con arreglo vacío y no acepta filtro de inactivas', async () => {
  setupStore();
  await withServer(async ({ request }) => {
    const dashboard = await request('/?modulo=dashboard', { user: director });
    assert.equal(dashboard.status, 200);
    assert.deepEqual((await dashboard.json()).data.map((row) => row.id), [9]);
    const empty = await request('/?modulo=auditoria', { user: director });
    assert.equal(empty.status, 200);
    assert.deepEqual(await empty.json(), { success: true, data: [] });
    const requestedInactive = await request('/?modulo=desarrollo_curricular&activo=false', { user: director });
    assert.equal(requestedInactive.status, 200);
    assert.deepEqual((await requestedInactive.json()).data.map((row) => row.id), [3, 4, 7]);
  });
});

test('query inválida obtiene 400, conserva espacios exteriores y distingue mayúsculas', async () => {
  const { calls } = setupStore();
  await withServer(async ({ request }) => {
    for (const path of ['/', '/?modulo=', '/?modulo=desconocido', '/?modulo=Dashboard',
      '/?modulo=dashboard&modulo=dashboard', '/?modulo[]=dashboard',
      '/?modulo[valor]=dashboard']) {
      assert.equal((await request(path, { user: director })).status, 400, path);
    }
    assert.equal(calls.findAll.length, 0);
    const trimmed = await request('/?modulo=%20desarrollo_curricular%20', { user: director });
    assert.equal(trimmed.status, 200);
    assert.deepEqual((await trimmed.json()).data.map((row) => row.id), [3, 4, 7]);
  });
});

test('errores internos responden 500 sin exponer detalles técnicos', async () => {
  setupStore();
  stub(models.EntradaAyuda, 'findAll', async () => { throw new Error('detalle secreto de PostgreSQL'); });
  await withServer(async ({ request }) => {
    const response = await request('/?modulo=dashboard', { user: director });
    assert.equal(response.status, 500);
    assert.doesNotMatch(JSON.stringify(await response.json()), /detalle secreto de PostgreSQL/);
  });
});

test('GET, POST y PUT administrativos conservan Rectoría y su comportamiento', async () => {
  const { rows, calls } = setupStore();
  stub(auditService, 'record', async () => ({ persisted: true }));
  await withServer(async ({ request }) => {
    for (const [path, method] of [['/admin', 'GET'], ['/admin', 'POST'], ['/admin/3', 'PUT']]) {
      assert.equal((await request(path, { method })).status, 401);
      assert.equal((await request(path, { method, user: director })).status, 403);
    }
    const listed = await request('/admin', { user: rector });
    assert.equal(listed.status, 200);
    assert.equal((await listed.json()).data.length, 5);
    const created = await request('/admin', { method: 'POST', user: rector,
      body: { modulo: 'metas', pregunta: 'Pregunta nueva', respuesta: 'Respuesta nueva', orden: 1 } });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).data.activo, true);
    const updated = await request('/admin/3', { method: 'PUT', user: rector, body: { activo: false } });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).data.activo, false);
    assert.equal(rows.find((row) => row.id === 3).activo, false);
    assert.equal(calls.create, 1);
    assert.equal(calls.update, 1);
  });
});

test('Swagger publica un único GET de lectura con esquema y seguridad existentes', () => {
  const read = swaggerDocs.paths['/api/help'].get;
  assert.deepEqual(read.tags, ['Centro de Ayuda']);
  assert.deepEqual(read.security, [{ bearerAuth: [] }]);
  assert.equal(read.parameters[0].name, 'modulo');
  assert.equal(read.parameters[0].required, true);
  assert.equal(read.parameters[0].schema.$ref, '#/components/schemas/ModuloAyuda');
  assert.deepEqual(swaggerDocs.components.schemas.ModuloAyuda.enum, HELP_MODULES);
  assert.equal(read.responses['200'].content['application/json'].schema.properties.data.items.$ref,
    '#/components/schemas/EntradaAyuda');
  for (const status of ['200', '400', '401', '500']) assert.ok(read.responses[status]);
  assert.equal(read.responses['400'].description, 'Módulo ausente, repetido o no permitido.');
  assert.equal(read.responses['403'], undefined);
  assert.equal(swaggerDocs.paths['/api/help'].post, undefined);
  assert.ok(swaggerDocs.paths['/api/help/admin'].get);
  assert.ok(swaggerDocs.paths['/api/help/admin'].post);
  assert.ok(swaggerDocs.paths['/api/help/admin/{id}'].put);
});
