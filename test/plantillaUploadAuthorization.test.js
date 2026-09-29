process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const models = require('../src/models');
const plantillaService = require('../src/services/plantillaService');
const plantillaController = require('../src/controllers/plantillaController');
const { authenticateToken, JWT_SECRET } = require('../src/middleware/authMiddleware');
const {
  authorizePlantillaUpload,
  authorizePlantillaAdministration
} = require('../src/middleware/plantillaUploadAuthorization');

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

const runMiddleware = (middleware, req) => new Promise((resolve) => {
  middleware(req, {}, (error) => resolve(error));
});

const user = ({
  id = 1,
  roleId = 10,
  departmentId = 'admision',
  role = 'Admisión',
  roleGroup = 'Direccion'
} = {}) => ({
  id,
  roleId,
  departmentId,
  role: { name: role, group: roleGroup },
  department: departmentId ? { key: departmentId } : null
});

const plantilla = ({ id = 20, roleId = 10, departmentId = 'admision', name = 'Admisión' } = {}) => ({
  id,
  roleId,
  departmentId,
  name
});

const setup = ({ currentUser = user(), currentPlantilla = plantilla() } = {}) => {
  stub(models.User, 'findByPk', async () => currentUser);
  stub(plantillaService, 'getPlantillaForAuthorization', async () => currentPlantilla);
};

test('usuario vigente del mismo departamento y rol puede cargar', async () => {
  setup();
  const req = { user: { id: 1, departmentId: 'falso' }, params: { id: '20' } };
  assert.equal(await runMiddleware(authorizePlantillaUpload, req), undefined);
  assert.equal(req.plantilla.id, 20);
  assert.equal(req.user.departmentId, 'admision');
});

test('usuario de otro departamento recibe 403 sin filtrar el propietario', async () => {
  setup({ currentUser: user({ departmentId: 'innovacion' }) });
  const error = await runMiddleware(authorizePlantillaUpload, { user: { id: 1 }, params: { id: '20' } });
  assert.equal(error.statusCode, 403);
  assert.equal(error.message, 'No tienes permisos para cargar esta plantilla');
  assert.doesNotMatch(error.message, /admision|innovacion/i);
});

test('mismo departamento sin el rol de escritura recibe 403', async () => {
  setup({ currentUser: user({ roleId: 99 }) });
  const error = await runMiddleware(authorizePlantillaUpload, { user: { id: 1 }, params: { id: '20' } });
  assert.equal(error.statusCode, 403);
});

test('Rector conserva acceso global', async () => {
  setup({ currentUser: user({ roleId: 1, departmentId: null, role: 'Rector' }) });
  assert.equal(await runMiddleware(authorizePlantillaUpload, { user: { id: 1 }, params: { id: '20' } }), undefined);
});

test('roleGroup Rectoria conserva acceso global', async () => {
  setup({ currentUser: user({ roleId: 2, departmentId: null, role: 'Vicerrectoría', roleGroup: 'Rectoria' }) });
  assert.equal(await runMiddleware(authorizePlantillaUpload, { user: { id: 1 }, params: { id: '20' } }), undefined);
});

test('usuario sin departmentId recibe 403 salvo excepción global', async () => {
  setup({ currentUser: user({ departmentId: null }) });
  const error = await runMiddleware(authorizePlantillaUpload, { user: { id: 1 }, params: { id: '20' } });
  assert.equal(error.statusCode, 403);
});

test('usuario eliminado después de emitir el JWT recibe 401', async () => {
  setup({ currentUser: null });
  const error = await runMiddleware(authorizePlantillaUpload, { user: { id: 1 }, params: { id: '20' } });
  assert.equal(error.statusCode, 401);
});

test('plantilla inexistente recibe 404', async () => {
  setup({ currentPlantilla: null });
  const error = await runMiddleware(authorizePlantillaUpload, { user: { id: 1 }, params: { id: '999' } });
  assert.equal(error.statusCode, 404);
});

test('sin JWT recibe 401 y un JWT inválido también', async () => {
  let error = await runMiddleware(authenticateToken, { headers: {} });
  assert.equal(error.statusCode, 401);
  error = await runMiddleware(authenticateToken, { headers: { authorization: 'Bearer inválido' } });
  assert.equal(error.statusCode, 401);
});

test('VCM mantiene permiso propio y rechaza otra área', async () => {
  setup({
    currentUser: user({ roleId: 30, departmentId: 'vinculacion_medio', role: 'Vinculación Con El Medio' }),
    currentPlantilla: plantilla({ roleId: 30, departmentId: 'vinculacion_medio', name: 'Vinculación Con El Medio' })
  });
  assert.equal(await runMiddleware(authorizePlantillaUpload, { user: { id: 1 }, params: { id: '20' } }), undefined);

  models.User.findByPk = async () => user({ roleId: 40, departmentId: 'educacion_continua', role: 'Educación Continua' });
  const error = await runMiddleware(authorizePlantillaUpload, { user: { id: 1 }, params: { id: '20' } });
  assert.equal(error.statusCode, 403);
});

for (const area of [
  { label: 'Admisión', departmentId: 'admision', roleId: 10 },
  { label: 'Innovación', departmentId: 'innovacion', roleId: 11 },
  { label: 'Educación Continua', departmentId: 'educacion_continua', roleId: 12 }
]) {
  test(`${area.label}: usuario propio permitido y otra área bloqueada`, async () => {
    setup({
      currentUser: user({ roleId: area.roleId, departmentId: area.departmentId, role: area.label }),
      currentPlantilla: plantilla({ roleId: area.roleId, departmentId: area.departmentId, name: area.label })
    });
    assert.equal(await runMiddleware(authorizePlantillaUpload, { user: { id: 1 }, params: { id: '20' } }), undefined);

    models.User.findByPk = async () => user({ roleId: 99, departmentId: 'otra_area', role: 'Otra área' });
    const error = await runMiddleware(authorizePlantillaUpload, { user: { id: 1 }, params: { id: '20' } });
    assert.equal(error.statusCode, 403);
  });
}

test('/cargar y /template autorizan antes de recibir el archivo y no existe ruta duplicada', () => {
  const router = require('../src/routes/plantillaCargaRoutes');
  const cargar = router.stack.filter((layer) => layer.route?.path === '/:id/cargar');
  const template = router.stack.filter((layer) => layer.route?.path === '/:id/template');
  assert.equal(cargar.length, 1);
  assert.equal(template.length, 1);
  for (const route of [cargar[0], template[0]]) {
    assert.equal(route.route.stack[0].handle, authenticateToken);
    assert.equal(route.route.stack[1].handle, authorizePlantillaUpload);
  }
});

test('Swagger documenta seguridad y respuestas 401/403/404 en ambas operaciones', () => {
  const { swaggerDocs } = require('../src/config/swagger');
  for (const path of ['/api/plantillas/{id}/cargar', '/api/plantillas/{id}/template']) {
    const operation = swaggerDocs.paths[path].post;
    assert.deepEqual(operation.security, [{ bearerAuth: [] }]);
    assert.ok(operation.responses['401']);
    assert.ok(operation.responses['403']);
    assert.ok(operation.responses['404']);
  }
});

test('/template permite propietario y bloquea otro departamento', async () => {
  setup();
  assert.equal(await runMiddleware(authorizePlantillaUpload, { user: { id: 1 }, params: { id: '20' } }), undefined);
  models.User.findByPk = async () => user({ departmentId: 'innovacion' });
  const error = await runMiddleware(authorizePlantillaUpload, { user: { id: 1 }, params: { id: '20' } });
  assert.equal(error.statusCode, 403);
});

test('/template reutiliza req.plantilla en el controller', async () => {
  const resolved = plantilla();
  let receivedResolved;
  stub(plantillaService, 'guardarArchivoTemplate', async (id, buffer, name, authorizedPlantilla) => {
    receivedResolved = authorizedPlantilla;
    return { id, name: resolved.name, archivoNombre: name };
  });
  const res = { json(body) { this.body = body; return this; } };
  await plantillaController.subirTemplate({
    params: { id: '20' },
    plantilla: resolved,
    file: { buffer: Buffer.from('xlsx'), originalname: 'plantilla.xlsx' }
  }, res, assert.fail);
  assert.equal(receivedResolved, resolved);
});

test('un 403 corta el flujo antes de validación y persistencia', async () => {
  setup({ currentUser: user({ departmentId: 'innovacion' }) });
  let validationCalls = 0;
  let persistenceCalls = 0;
  const req = { user: { id: 1 }, params: { id: '20' } };
  const error = await new Promise((resolve) => {
    authorizePlantillaUpload(req, {}, async (authorizationError) => {
      if (authorizationError) return resolve(authorizationError);
      validationCalls += 1;
      persistenceCalls += 1;
      return resolve();
    });
  });
  assert.equal(error.statusCode, 403);
  assert.equal(validationCalls, 0);
  assert.equal(persistenceCalls, 0);
});

test('solo Rectoría puede crear, cambiar propiedad o eliminar plantillas', async () => {
  setup({ currentUser: user() });
  let error = await runMiddleware(authorizePlantillaAdministration, { user: { id: 1 } });
  assert.equal(error.statusCode, 403);

  models.User.findByPk = async () => user({ departmentId: null, role: 'Rector' });
  error = await runMiddleware(authorizePlantillaAdministration, { user: { id: 1 } });
  assert.equal(error, undefined);
});

test('las rutas que pueden cambiar la propiedad exigen autenticación y administración', () => {
  const router = require('../src/routes/plantillaRoutes');
  for (const [method, path] of [['post', '/'], ['put', '/:id'], ['delete', '/:id']]) {
    const layer = router.stack.find((item) => item.route?.path === path && item.route.methods[method]);
    assert.ok(layer);
    assert.equal(layer.route.stack[0].handle, authenticateToken);
    assert.equal(layer.route.stack[1].handle, authorizePlantillaAdministration);
  }
});

test('authenticateToken conserva JWT válido antes de autorización', async () => {
  const token = jwt.sign({ id: 1, role: 'Admisión', roleGroup: 'Direccion', departmentId: 'admision' }, JWT_SECRET);
  const req = { headers: { authorization: `Bearer ${token}` } };
  assert.equal(await runMiddleware(authenticateToken, req), undefined);
  assert.equal(req.user.id, 1);
});
