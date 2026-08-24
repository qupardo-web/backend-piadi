const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const plantillaService = require('../src/services/plantillaService');
const { authenticateToken, JWT_SECRET } = require('../src/middleware/authMiddleware');
const {
  requireVcmUploadRole,
  VCM_TEMPLATE_NAME,
  VCM_ROLE
} = require('../src/middleware/vcmUploadAuthorization');

const originalGetPlantillaById = plantillaService.getPlantillaById;

test.afterEach(() => {
  plantillaService.getPlantillaById = originalGetPlantillaById;
});

const runMiddleware = (middleware, req) => new Promise((resolve) => {
  middleware(req, {}, (error) => resolve(error));
});

const tokenFor = (role, roleGroup = 'Direccion', options = {}) => jwt.sign(
  { id: 1, role, roleGroup },
  JWT_SECRET,
  options
);

test('la carga VCM sin JWT es rechazada con 401', async () => {
  const error = await runMiddleware(authenticateToken, { headers: {} });
  assert.equal(error.statusCode, 401);
});

test('un JWT VCM válido supera autenticación y autorización de carga VCM', async () => {
  const req = { headers: { authorization: `Bearer ${tokenFor(VCM_ROLE)}` }, params: { id: '2' } };
  assert.equal(await runMiddleware(authenticateToken, req), undefined);

  plantillaService.getPlantillaById = async () => ({ id: 2, name: VCM_TEMPLATE_NAME });
  assert.equal(await runMiddleware(requireVcmUploadRole, req), undefined);
});

test('otro departamento recibe 403 al llamar directamente a la carga VCM', async () => {
  const req = { user: { id: 2, role: 'Educación Continua', roleGroup: 'Direccion' }, params: { id: '2' } };
  plantillaService.getPlantillaById = async () => ({ id: 2, name: VCM_TEMPLATE_NAME });

  const error = await runMiddleware(requireVcmUploadRole, req);
  assert.equal(error.statusCode, 403);
});

test('otro rol recibe 403 al llamar directamente a la carga VCM', async () => {
  const req = { user: { id: 4, role: 'Innovación', roleGroup: 'Direccion' }, params: { id: '2' } };
  plantillaService.getPlantillaById = async () => ({ id: 2, name: VCM_TEMPLATE_NAME });

  const error = await runMiddleware(requireVcmUploadRole, req);
  assert.equal(error.statusCode, 403);
});

test('una plantilla que no es VCM conserva la autorización previa', async () => {
  const req = { user: { id: 2, role: 'Educación Continua', roleGroup: 'Direccion' }, params: { id: '1' } };
  plantillaService.getPlantillaById = async () => ({ id: 1, name: 'Educación Continua' });

  assert.equal(await runMiddleware(requireVcmUploadRole, req), undefined);
});

test('un JWT inválido es rechazado con 401', async () => {
  const error = await runMiddleware(authenticateToken, {
    headers: { authorization: 'Bearer token-invalido' }
  });
  assert.equal(error.statusCode, 401);
});

test('un JWT expirado es rechazado con 401', async () => {
  const expiredToken = tokenFor(VCM_ROLE, 'Direccion', { expiresIn: -1 });
  const error = await runMiddleware(authenticateToken, {
    headers: { authorization: `Bearer ${expiredToken}` }
  });
  assert.equal(error.statusCode, 401);
});

test('un JWT de Rectoría supera autenticación y autorización de carga VCM', async () => {
  const req = {
    headers: { authorization: `Bearer ${tokenFor('Rector', 'Rectoria')}` },
    params: { id: '2' }
  };
  assert.equal(await runMiddleware(authenticateToken, req), undefined);

  plantillaService.getPlantillaById = async () => ({ id: 2, name: VCM_TEMPLATE_NAME });

  assert.equal(await runMiddleware(requireVcmUploadRole, req), undefined);
});

test('el grupo Rectoria permite cargar VCM independientemente del rol', async () => {
  const req = { user: { id: 5, role: 'Vicerrectoria de Calidad', roleGroup: 'Rectoria' }, params: { id: '2' } };
  plantillaService.getPlantillaById = async () => ({ id: 2, name: VCM_TEMPLATE_NAME });

  assert.equal(await runMiddleware(requireVcmUploadRole, req), undefined);
});
