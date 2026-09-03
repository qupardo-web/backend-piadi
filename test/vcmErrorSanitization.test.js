process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createCargarArchivo } = require('../src/controllers/plantillaController');
const errorHandler = require('../src/middleware/errorHandler');
const auditLogger = require('../src/middleware/auditLogger');
const auditService = require('../src/services/auditService');
const { Plantilla } = require('../src/models');

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; }
});

test('una validación VCM responde 422, conserva el contrato público y elimina el temporal', async () => {
  const removed = [];
  const handler = createCargarArchivo({
    validateFile: async () => ({
      valido: false,
      errores: [{
        mensaje: "La columna 'nombre' es obligatoria en la hoja 'Convenios'",
        hoja: 'Convenios',
        fila: 3,
        campo: 'nombre',
        celda: 'B3'
      }]
    }),
    processUpload: async () => assert.fail('No debe procesar un archivo inválido'),
    removeFile: async (path) => removed.push(path)
  });
  const res = response();

  await handler(
    { params: { id: '2' }, file: { path: 'uploads/temporal-vcm.xlsx' } },
    res,
    assert.fail
  );

  assert.equal(res.statusCode, 422);
  assert.equal(res.body.success, false);
  assert.equal(res.body.errorType, undefined);
  assert.deepEqual(res.body.errores[0], {
    message: "La columna 'nombre' es obligatoria en la hoja 'Convenios'",
    hoja: 'Convenios',
    fila: 3,
    columna: 'nombre',
    celda: 'B3',
    valor: '',
    esperado: ''
  });
  assert.deepEqual(removed, ['uploads/temporal-vcm.xlsx']);
});

test('una carga exitosa conserva su respuesta y elimina el temporal después de procesarlo', async () => {
  const removed = [];
  const handler = createCargarArchivo({
    validateFile: async () => ({ valido: true, errores: [], campos: ['campo'], workbook: 'workbook' }),
    processUpload: async (workbook, campos) => ({ success: true, workbook, campos }),
    removeFile: async (path) => removed.push(path)
  });
  const res = response();

  await handler(
    { params: { id: '2' }, file: { path: 'uploads/carga-exitosa.xlsx' } },
    res,
    assert.fail
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.deepEqual(removed, ['uploads/carga-exitosa.xlsx']);
});

test('una carga sin archivo se trata como validación 422', async () => {
  let propagatedError;
  const handler = createCargarArchivo();
  await handler(
    { params: { id: '2' } },
    response(),
    (err) => { propagatedError = err; }
  );

  const originalConsoleError = console.error;
  console.error = () => {};
  const res = response();
  try {
    errorHandler(propagatedError, { method: 'POST', originalUrl: '/api/plantillas/2/cargar' }, res, () => {});
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(res.statusCode, 422);
  assert.deepEqual(res.body, {
    error: 'Debe enviar un archivo Excel',
    success: false
  });
});

test('un fallo inesperado se registra en backend y el cliente recibe un 500 sanitizado', async () => {
  const technicalError = new Error('Sequelize error: SELECT * FROM audit_cargas; path C:\\secret\\db.js');
  technicalError.stack = 'STACK_INTERNO_NO_PUBLICO';
  let propagatedError;
  const removed = [];
  const handler = createCargarArchivo({
    validateFile: async () => ({ valido: true, errores: [], campos: [], workbook: {} }),
    processUpload: async () => { throw technicalError; },
    removeFile: async (path) => removed.push(path)
  });

  await handler(
    { params: { id: '2' }, file: { path: 'uploads/carga-fallida.xlsx' } },
    response(),
    (err) => { propagatedError = err; }
  );

  const originalConsoleError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  const res = response();
  try {
    errorHandler(propagatedError, { method: 'POST', originalUrl: '/api/plantillas/2/cargar' }, res, () => {});
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    error: 'Error interno, contacte al administrador',
    success: false
  });
  const publicResponse = JSON.stringify(res.body);
  for (const forbidden of ['STACK_INTERNO', 'SELECT', 'Sequelize', 'audit_cargas', 'secret', 'errorType']) {
    assert.equal(publicResponse.includes(forbidden), false, `La respuesta expone ${forbidden}`);
  }
  const logContext = logs.find((entry) => entry[0] === '[errorHandler]')?.[1];
  assert.match(logContext.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(logContext.operation, 'POST /api/plantillas/2/cargar');
  assert.equal(logContext.message, technicalError.message);
  assert.equal(logContext.stack, technicalError.stack);
  assert.deepEqual(removed, ['uploads/carga-fallida.xlsx']);
});

test('los errores de validación Sequelize se publican como 422 sin nombres internos', () => {
  const err = {
    name: 'SequelizeValidationError',
    message: 'Validation error',
    errors: [{
      message: 'Validation notEmpty on nombre failed',
      path: 'Nombre',
      hoja: 'Convenios',
      fila: 4,
      celda: 'C4'
    }]
  };
  const originalConsoleError = console.error;
  console.error = () => {};
  const res = response();
  try {
    errorHandler(err, {}, res, () => {});
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(res.statusCode, 422);
  assert.equal(res.body.errorType, undefined);
  assert.equal(res.body.errores[0].hoja, 'Convenios');
  assert.equal(res.body.errores[0].fila, 4);
  assert.equal(res.body.errores[0].columna, 'Nombre');
  assert.equal(res.body.errores[0].celda, 'C4');
  assert.match(res.body.errores[0].message, /no puede estar vacío/);
  assert.equal(JSON.stringify(res.body).includes('Sequelize'), false);
});

test('un error de clave foránea no expone tabla, constraint ni detalle SQL', () => {
  const err = {
    name: 'SequelizeForeignKeyConstraintError',
    message: 'insert or update violates foreign key constraint fk_secret',
    table: 'audit_cargas',
    parent: { detail: 'Key (usuarioId)=(999) is not present in table "users".' }
  };
  const originalConsoleError = console.error;
  console.error = () => {};
  const res = response();
  try {
    errorHandler(err, {}, res, () => {});
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, {
    error: 'No se puede completar la operación porque existen datos relacionados.',
    success: false
  });
  const publicResponse = JSON.stringify(res.body);
  for (const forbidden of ['audit_cargas', 'fk_secret', 'usuarioId', 'users', 'Sequelize', 'errorType']) {
    assert.equal(publicResponse.includes(forbidden), false, `La respuesta expone ${forbidden}`);
  }
});

test('la auditoría ignora cargas fallidas y conserva el registro de cargas exitosas', async () => {
  const originalRecord = auditService.record;
  const originalFindByPk = Plantilla.findByPk;
  const records = [];
  auditService.record = async (type, payload) => records.push({ type, payload });
  Plantilla.findByPk = async () => ({ name: 'Vinculación Con El Medio' });

  try {
    const failedResponse = new EventEmitter();
    failedResponse.statusCode = 422;
    auditLogger({ type: 'carga', action: 'UPLOAD_TEMPLATE' })(
      { method: 'POST', originalUrl: '/api/plantillas/2/cargar', params: { id: '2' }, user: { id: 1, role: 'Rector' } },
      failedResponse,
      () => {}
    );
    failedResponse.emit('finish');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(records.length, 0);

    const successResponse = new EventEmitter();
    successResponse.statusCode = 200;
    auditLogger({ type: 'carga', action: 'UPLOAD_TEMPLATE' })(
      {
        method: 'POST',
        originalUrl: '/api/plantillas/2/cargar',
        params: { id: '2' },
        user: { id: 1, role: 'Rector' },
        file: { originalname: 'vcm.xlsx' }
      },
      successResponse,
      () => {}
    );
    successResponse.emit('finish');
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(records.length, 1);
    assert.equal(records[0].type, 'carga');
    assert.equal(records[0].payload.plantilla, 'Vinculación Con El Medio');
    assert.equal(records[0].payload.archivo, 'vcm.xlsx');
  } finally {
    auditService.record = originalRecord;
    Plantilla.findByPk = originalFindByPk;
  }
});
