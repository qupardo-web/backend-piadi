process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const models = require('../src/models');
const authController = require('../src/controllers/authController');
const auditService = require('../src/services/auditService');

const originalFindOne = models.User.findOne;
const originalRecordSession = auditService.recordSession;
const originalExpiration = process.env.JWT_EXPIRATION;

test.before(() => {
  models.User.findOne = async () => ({
    id: 7,
    email: 'usuario@ecas.cl',
    name: 'Usuario',
    role: { name: 'Rol existente', group: 'Direccion' },
    department: { key: 'departamento-a' },
    comparePassword: async () => true
  });
  auditService.recordSession = async () => undefined;
});

test.after(() => {
  models.User.findOne = originalFindOne;
  auditService.recordSession = originalRecordSession;
  if (originalExpiration === undefined) delete process.env.JWT_EXPIRATION;
  else process.env.JWT_EXPIRATION = originalExpiration;
});

const login = async () => {
  const res = {
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  await authController.login({
    body: { username: 'usuario@ecas.cl', password: 'password-valida' },
    method: 'POST',
    originalUrl: '/api/auth/login'
  }, res, assert.fail);
  return jwt.decode(res.body.token);
};

test('sin JWT_EXPIRATION conserva dos horas por defecto', async () => {
  delete process.env.JWT_EXPIRATION;
  const decoded = await login();
  assert.equal(authController.getJwtExpiration(), '2h');
  assert.equal(decoded.exp - decoded.iat, 2 * 60 * 60);
});

test('JWT_EXPIRATION permite configurar la duración sin cambiar código', async () => {
  process.env.JWT_EXPIRATION = '30m';
  const decoded = await login();
  assert.equal(authController.getJwtExpiration(), '30m');
  assert.equal(decoded.exp - decoded.iat, 30 * 60);
});
