process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const models = require('../src/models');
const authController = require('../src/controllers/authController');
const auditService = require('../src/services/auditService');
const { authenticateToken, JWT_SECRET } = require('../src/middleware/authMiddleware');

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

test('User declara una relación departamental nullable y persistida', () => {
  const attribute = models.User.rawAttributes.departmentId;

  assert.equal(attribute.allowNull, true);
  assert.equal(attribute.references.model, 'departments');
  assert.equal(attribute.references.key, 'key');
  assert.equal(models.User.associations.department.target, models.Department);
  assert.equal(models.User.associations.department.foreignKey, 'departmentId');
  assert.equal(models.User.associations.department.targetKey, 'key');
});

test('login carga el departamento persistido y lo firma en el JWT', async () => {
  let findOptions;
  stub(models.User, 'findOne', async (options) => {
    findOptions = options;
    return {
      id: 7,
      email: 'usuario@ecas.cl',
      name: 'Usuario Departamental',
      role: { name: 'Rol existente', group: 'Direccion' },
      department: { key: 'departamento_persistido' },
      comparePassword: async () => true
    };
  });
  stub(auditService, 'recordSession', async () => undefined);

  const req = {
    body: { username: 'usuario@ecas.cl', password: 'password-valida' },
    method: 'POST',
    originalUrl: '/api/auth/login'
  };
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };

  await authController.login(req, res, assert.fail);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(findOptions.include.map((include) => include.as), ['role', 'department']);
  const decoded = jwt.verify(res.body.token, JWT_SECRET);
  assert.equal(decoded.departmentId, 'departamento_persistido');

  const authenticatedRequest = {
    headers: { authorization: `Bearer ${res.body.token}` }
  };
  const authError = await new Promise((resolve) => {
    authenticateToken(authenticatedRequest, {}, resolve);
  });
  assert.equal(authError, undefined);
  assert.equal(authenticatedRequest.user.departmentId, 'departamento_persistido');
});

test('login no infiere el departamento desde el nombre del rol', async () => {
  stub(models.User, 'findOne', async () => ({
    id: 8,
    email: 'vcm@ecas.cl',
    name: 'Usuario sin departamento',
    role: { name: 'Vinculación Con El Medio', group: 'Direccion' },
    department: null,
    comparePassword: async () => true
  }));
  stub(auditService, 'recordSession', async () => undefined);

  const req = {
    body: { username: 'vcm@ecas.cl', password: 'password-valida' },
    method: 'POST',
    originalUrl: '/api/auth/login'
  };
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };

  await authController.login(req, res, assert.fail);

  const decoded = jwt.verify(res.body.token, JWT_SECRET);
  assert.equal(decoded.role, 'Vinculación Con El Medio');
  assert.equal(decoded.departmentId, null);
});
