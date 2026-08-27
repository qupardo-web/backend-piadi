process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const models = require('../src/models');
const indicatorService = require('../src/services/indicatorService');
const indicatorController = require('../src/controllers/indicatorController');
const indicatorRoutes = require('../src/routes/indicatorRoutes');

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

const response = () => ({
  statusCode: 0,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; }
});

test('registra GET /indicators/:indicatorKey/detail', () => {
  const route = indicatorRoutes.stack.find((layer) => layer.route?.path === '/indicators/:indicatorKey/detail');
  assert.equal(route.route.methods.get, true);
});

test('indicatorController.getIndicatorDetail responde 200 con el detalle del kpi', async () => {
  stub(indicatorService, 'getIndicatorDetail', async (key) => ({
    data: {
      key,
      name: 'Tasa de aprobación',
      title: 'Tasa de aprobación',
      description: 'Aprobados sobre la matrícula total.',
      unit: '%',
      format: 'percentage',
      formulaKey: 'APPROVAL_RATE',
      departmentId: 'educacion_continua',
      enabled: true
    }
  }));

  const res = response();
  await indicatorController.getIndicatorDetail({ params: { indicatorKey: 'tasa_aprobacion' } }, res, assert.fail);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.key, 'tasa_aprobacion');
  assert.equal(res.body.data.title, 'Tasa de aprobación');
  assert.equal(res.body.data.description, 'Aprobados sobre la matrícula total.');
});

test('indicatorController.getIndicatorDetail propaga 404 si el indicador no existe', async () => {
  stub(indicatorService, 'getIndicatorDetail', async () => {
    throw new indicatorService.ServiceError(404, 'KPI_NOT_FOUND', 'El indicador solicitado no existe');
  });

  const res = response();
  await indicatorController.getIndicatorDetail({ params: { indicatorKey: 'non-existent' } }, res, assert.fail);
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.error.code, 'KPI_NOT_FOUND');
});
