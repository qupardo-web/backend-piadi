process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/piadi_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_for_piadi_448';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const {
  resolveUserDepartmentId,
  requireMetaDepartmentAccess
} = require('../src/middleware/rectoriaAuthorization');
const authController = require('../src/controllers/authController');
const { User, Role, Department } = require('../src/models');
const { JWT_SECRET } = require('../src/middleware/authMiddleware');

const runMiddleware = (middleware, req) => new Promise((resolve) => middleware(req, {}, resolve));

const createMockResponse = () => ({
  statusCode: 200,
  data: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.data = payload;
    return this;
  }
});

test('resolveUserDepartmentId resuelve departmentId directo sin inspeccionar el nombre del rol', () => {
  // 1. departmentId directo
  assert.equal(
    resolveUserDepartmentId({ id: 1, departmentId: 'innovacion', role: 'Cualquier Rol' }),
    'innovacion'
  );

  // 2. Objeto department asociado con key
  assert.equal(
    resolveUserDepartmentId({ id: 2, department: { key: 'vinculacion_medio' }, role: 'Otro Rol' }),
    'vinculacion_medio'
  );

  // 3. Objeto department asociado con id
  assert.equal(
    resolveUserDepartmentId({ id: 3, department: { id: 'admision' } }),
    'admision'
  );

  // 4. department como string
  assert.equal(
    resolveUserDepartmentId({ id: 4, department: 'desarrollo_curricular' }),
    'desarrollo_curricular'
  );

  // 5. departmentId definido en el objeto role
  assert.equal(
    resolveUserDepartmentId({ id: 5, role: { name: 'Director', departmentId: 'educacion_continua' } }),
    'educacion_continua'
  );

  // 6. Usuario nulo o indefinido devuelve null
  assert.equal(resolveUserDepartmentId(null), null);
  assert.equal(resolveUserDepartmentId(undefined), null);

  // 7. ROLES RENOMBRADOS O ANTIGUOS SIN departmentId YA NO DEDUCEN POR TEXTO (PIADI-448)
  assert.equal(
    resolveUserDepartmentId({ id: 6, role: 'Dirección de Innovación', departmentId: null }),
    null
  );
  assert.equal(
    resolveUserDepartmentId({ id: 7, role: 'Vinculación Con El Medio', departmentId: null }),
    null
  );
  assert.equal(
    resolveUserDepartmentId({ id: 8, role: 'Educación Continua', departmentId: null }),
    null
  );
  assert.equal(
    resolveUserDepartmentId({ id: 9, role: 'Director Académico', departmentId: null }),
    null
  );
});

test('requireMetaDepartmentAccess autoriza por departmentId incluso si el rol fue renombrado', async () => {
  // Patrocinador renombra el rol a 'Líder de Transferencia Tecnológica', pero departmentId sigue siendo 'innovacion'
  const userRenamed = {
    id: 10,
    role: 'Líder de Transferencia Tecnológica',
    roleGroup: 'Direccion',
    departmentId: 'innovacion'
  };

  // Creación en su propio departamento permitida
  const reqOwn = { user: userRenamed, body: { departmentId: 'innovacion' } };
  assert.equal(await runMiddleware(requireMetaDepartmentAccess, reqOwn), undefined);

  // Intento de operar en otro departamento rechazado con 403
  const reqOther = { user: userRenamed, body: { departmentId: 'vinculacion_medio' } };
  const errorOther = await runMiddleware(requireMetaDepartmentAccess, reqOther);
  assert.equal(errorOther.statusCode, 403);
  assert.equal(errorOther.message, 'Solo puedes operar metas de tu departamento');
});

test('requireMetaDepartmentAccess prioriza departmentId sobre el texto del rol ante discrepancias', async () => {
  // Usuario tiene rol llamado 'Innovación' pero pertenece administrativamente a 'desarrollo_curricular'
  const userDiscrepancy = {
    id: 11,
    role: 'Innovación',
    roleGroup: 'Direccion',
    departmentId: 'desarrollo_curricular'
  };

  // Permitido en desarrollo_curricular
  const reqValid = { user: userDiscrepancy, body: { departmentId: 'desarrollo_curricular' } };
  assert.equal(await runMiddleware(requireMetaDepartmentAccess, reqValid), undefined);

  // Rechazado en innovacion a pesar de llamarse así el rol
  const reqInvalid = { user: userDiscrepancy, body: { departmentId: 'innovacion' } };
  const err = await runMiddleware(requireMetaDepartmentAccess, reqInvalid);
  assert.equal(err.statusCode, 403);
  assert.equal(err.message, 'Solo puedes operar metas de tu departamento');
});

test('requireMetaDepartmentAccess rechaza con 403 a usuarios departamentales sin departmentId', async () => {
  const userNoDept = {
    id: 12,
    role: 'Coordinador de Vinculación',
    roleGroup: 'Direccion',
    departmentId: null
  };

  const req = { user: userNoDept, body: { departmentId: 'vinculacion_medio' } };
  const err = await runMiddleware(requireMetaDepartmentAccess, req);
  assert.equal(err.statusCode, 403);
  assert.equal(err.message, 'Solo puedes operar metas de tu departamento');
});

test('authController.login emite token con departmentId sin depender de heurísticas sobre el nombre del rol', async () => {
  const originalFindOne = User.findOne;

  try {
    // Caso 1: Usuario con departmentId explícito y rol con nombre arbitrario
    User.findOne = async () => ({
      id: 20,
      email: 'test@ecas.cl',
      username: 'test@ecas.cl',
      name: 'Usuario Test',
      departmentId: 'innovacion',
      department: { key: 'innovacion' },
      role: { name: 'Cargo Renombrado', group: 'Direccion' },
      comparePassword: async () => true
    });

    const req1 = {
      body: { username: 'test@ecas.cl', password: 'password123' },
      method: 'POST',
      originalUrl: '/api/auth/login'
    };
    const res1 = createMockResponse();

    await authController.login(req1, res1, (err) => { if (err) throw err; });

    assert.equal(res1.statusCode, 200);
    assert.ok(res1.data.token);
    const decoded1 = jwt.verify(res1.data.token, JWT_SECRET);
    assert.equal(decoded1.departmentId, 'innovacion');
    assert.equal(decoded1.role, 'Cargo Renombrado');

    // Caso 2: Usuario sin departmentId pero cuyo rol contiene palabras clave (ej: Innovación)
    // Con PIADI-448 ya no debe inferir departmentId a partir del texto del rol
    User.findOne = async () => ({
      id: 21,
      email: 'sin_dept@ecas.cl',
      username: 'sin_dept@ecas.cl',
      name: 'Usuario Sin Dept',
      departmentId: null,
      department: null,
      role: { name: 'Asistente de Innovación y Vinculación', group: 'Direccion' },
      comparePassword: async () => true
    });

    const req2 = {
      body: { username: 'sin_dept@ecas.cl', password: 'password123' },
      method: 'POST',
      originalUrl: '/api/auth/login'
    };
    const res2 = createMockResponse();

    await authController.login(req2, res2, (err) => { if (err) throw err; });

    assert.equal(res2.statusCode, 200);
    const decoded2 = jwt.verify(res2.data.token, JWT_SECRET);
    assert.equal(decoded2.departmentId, null);
  } finally {
    User.findOne = originalFindOne;
  }
});
