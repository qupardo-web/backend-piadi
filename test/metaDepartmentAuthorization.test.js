process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const models = require('../src/models');
const { requireMetaOwnership } = require('../src/middleware/metaOwnership');
const {
  requireRectoriaForInstitutionalCreation,
  requireMetaDepartmentAccess
} = require('../src/middleware/rectoriaAuthorization');

const originalFindByPk = models.Meta.findByPk;
test.afterEach(() => { models.Meta.findByPk = originalFindByPk; });

const run = (middleware, req) => new Promise((resolve) => middleware(req, {}, resolve));
const userA = { id: 1, role: 'Director', roleGroup: 'Direccion', departmentId: 'a' };
const rector = { id: 9, role: 'Rector', roleGroup: 'Rectoria', departmentId: null };

test('usuario A puede crear en A y no puede crear en B', async () => {
  assert.equal(await run(requireMetaDepartmentAccess, { user: userA, body: { departmentId: 'a' } }), undefined);
  assert.equal((await run(requireMetaDepartmentAccess, { user: userA, body: { departmentId: 'b' } })).statusCode, 403);
});

test('usuario A no actualiza ni elimina una meta de B aunque sea propietario', async () => {
  models.Meta.findByPk = async () => ({ id: 3, creatorId: 1, departmentId: 'b' });
  for (const body of [{ nombre: 'Cambio' }, {}]) {
    const req = { params: { id: '3' }, user: userA, body };
    assert.equal(await run(requireMetaOwnership, req), undefined);
    assert.equal((await run(requireMetaDepartmentAccess, req)).statusCode, 403);
  }
});

test('usuario A no puede trasladar su meta de A a B', async () => {
  const error = await run(requireMetaDepartmentAccess, {
    user: userA,
    meta: { id: 3, creatorId: 1, departmentId: 'a' },
    body: { departmentId: 'b' }
  });
  assert.equal(error.statusCode, 403);
});

test('Rectoría conserva acceso global y exclusivo a metas institucionales', async () => {
  assert.equal(await run(requireMetaDepartmentAccess, { user: rector, body: { departmentId: 'b' } }), undefined);
  assert.equal(await run(requireMetaDepartmentAccess, { user: rector, meta: { departmentId: null }, body: {} }), undefined);
  assert.equal(await run(requireRectoriaForInstitutionalCreation, { user: rector, body: { departmentId: null } }), undefined);
  assert.equal((await run(requireRectoriaForInstitutionalCreation, { user: userA, body: { departmentId: null } })).statusCode, 403);
});
