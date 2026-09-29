const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const dashboardRoutes = require('../src/routes/dashboardRoutes');
const indicatorRoutes = require('../src/routes/indicatorRoutes');
const { authenticateToken, JWT_SECRET } = require('../src/middleware/authMiddleware');

const protectedRoutes = [
  [dashboardRoutes, '/dashboard/summary'],
  [indicatorRoutes, '/departments'],
  [indicatorRoutes, '/departments/:departmentKey/filters'],
  [indicatorRoutes, '/departments/:departmentKey/kpis'],
  [indicatorRoutes, '/indicators/:indicatorKey/values'],
  [indicatorRoutes, '/indicators/:indicatorKey/series'],
  [indicatorRoutes, '/indicators/:indicatorKey/breakdown']
];

const findGetRoute = (router, path) => router.stack.find(
  (layer) => layer.route?.path === path && layer.route.methods.get
);

const protectedMutations = [
  ['post', '/departments'],
  ['put', '/departments/:departmentKey'],
  ['delete', '/departments/:departmentKey'],
  ['post', '/departments/:departmentKey/kpis'],
  ['put', '/departments/:departmentKey/kpis/:indicatorKey'],
  ['delete', '/departments/:departmentKey/kpis/:indicatorKey']
];

const findRoute = (router, method, path) => router.stack.find(
  (layer) => layer.route?.path === path && layer.route.methods[method]
);

const runMiddleware = (middleware, req) => new Promise((resolve) => {
  middleware(req, {}, (error) => resolve(error));
});

const tokenFor = (role, roleGroup = 'Direccion', options = {}) => jwt.sign(
  { id: 1, role, roleGroup },
  JWT_SECRET,
  options
);

test('todos los endpoints de lectura del dashboard exigen authenticateToken', () => {
  for (const [router, path] of protectedRoutes) {
    const layer = findGetRoute(router, path);
    assert.ok(layer, `No se encontró GET ${path}`);
    assert.equal(layer.route.stack[0].handle, authenticateToken, `${path} no comienza con authenticateToken`);
  }
});

test('todas las mutaciones de departamentos y KPIs exigen JWT antes del controller', async () => {
  for (const [method, path] of protectedMutations) {
    const layer = findRoute(indicatorRoutes, method, path);
    assert.ok(layer, `No se encontró ${method.toUpperCase()} ${path}`);
    assert.equal(layer.route.stack[0].handle, authenticateToken);

    const withoutToken = await runMiddleware(layer.route.stack[0].handle, { headers: {} });
    assert.equal(withoutToken.statusCode, 401);

    const invalidToken = await runMiddleware(layer.route.stack[0].handle, {
      headers: { authorization: 'Bearer token-invalido' }
    });
    assert.equal(invalidToken.statusCode, 401);

    const req = { headers: { authorization: `Bearer ${tokenFor('Innovación')}` } };
    assert.equal(await runMiddleware(layer.route.stack[0].handle, req), undefined);
    assert.equal(req.user.role, 'Innovación');
    assert.equal(layer.route.stack[1].handle.name.length > 0, true);
  }
});

for (const [role, roleGroup] of [
  ['Educación Continua', 'Direccion'],
  ['Vinculación Con El Medio', 'Direccion'],
  ['Rector', 'Rectoria'],
  ['Vicerrectoria de Calidad', 'Calidad'],
  ['Innovación', 'Direccion']
]) {
  test(`un usuario autenticado con rol ${role} conserva acceso transversal`, async () => {
    const req = {
      headers: { authorization: `Bearer ${tokenFor(role, roleGroup)}` },
      query: { department: 'vinculacion_con_el_medio' }
    };

    assert.equal(await runMiddleware(authenticateToken, req), undefined);
    assert.equal(req.user.role, role);
    assert.equal(req.user.roleGroup, roleGroup);
  });
}

test('una consulta de otro departamento no altera la autorización JWT', async () => {
  const req = {
    headers: { authorization: `Bearer ${tokenFor('Educación Continua')}` },
    params: { departmentKey: 'vinculacion_con_el_medio' },
    query: { department: 'vinculacion_con_el_medio' }
  };

  assert.equal(await runMiddleware(authenticateToken, req), undefined);
  assert.equal(req.user.role, 'Educación Continua');
});

test('una lectura sin JWT es rechazada con 401', async () => {
  const error = await runMiddleware(authenticateToken, { headers: {} });
  assert.equal(error.statusCode, 401);
});

test('una lectura con JWT inválido es rechazada con 401', async () => {
  const error = await runMiddleware(authenticateToken, {
    headers: { authorization: 'Bearer token-invalido' }
  });
  assert.equal(error.statusCode, 401);
});

test('una lectura con JWT expirado es rechazada con 401', async () => {
  const error = await runMiddleware(authenticateToken, {
    headers: { authorization: `Bearer ${tokenFor('Vinculación Con El Medio', 'Direccion', { expiresIn: -1 })}` }
  });
  assert.equal(error.statusCode, 401);
});
