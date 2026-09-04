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
  assert.equal(models.User.associations.department.target, models.Department);
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
      department: { key: 'departamento-a' },
      comparePassword: async () => true
    };
  });
  stub(auditService, 'recordSession', async () => undefined);
  const res = {
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };

  await authController.login({
    body: { username: 'usuario@ecas.cl', password: 'password-valida' },
    method: 'POST',
    originalUrl: '/api/auth/login'
  }, res, assert.fail);

  assert.deepEqual(findOptions.include.map((item) => item.as), ['role', 'department']);
  const decoded = jwt.verify(res.body.token, JWT_SECRET);
  assert.equal(decoded.departmentId, 'departamento-a');
  const req = { headers: { authorization: `Bearer ${res.body.token}` } };
  const error = await new Promise((resolve) => authenticateToken(req, {}, resolve));
  assert.equal(error, undefined);
  assert.equal(req.user.departmentId, 'departamento-a');
});
