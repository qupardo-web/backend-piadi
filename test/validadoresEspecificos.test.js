process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgres://test:test@127.0.0.1:5432/piadi_test';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  obtenerValidador,
  defaultValidation,
  admisionValidation
} = require('../src/services/carga/validadores');
const {
  createAdmisionFields,
  VARIANTE_COMBINADA
} = require('../src/config/plantillaAdmision');
const { createCargarArchivo } = require('../src/controllers/plantillaController');

test('registry selecciona admisionValidation para su configuración estable', () => {
  const validador = obtenerValidador({
    campos: createAdmisionFields(1, VARIANTE_COMBINADA)
  });
  assert.equal(validador, admisionValidation);
});

test('registry selecciona defaultValidation para otras plantillas', () => {
  const validador = obtenerValidador({
    campos: [{ tabla_destino: 'Convenio', columna_destino: 'nombre' }]
  });
  assert.equal(validador, defaultValidation);
});

test('el motor genérico no contiene términos de negocio de Admisión', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/services/carga/validacionService.js'),
    'utf8'
  );
  const terminosEspecificos = [
    'Admision', 'CODCLI', 'RUT', 'FECHANAC', 'ESTACAD', 'Esstudiantes',
    'Caracterizacion', 'Matricula', 'RAMOEQUIV', 'PERIODO'
  ];
  for (const termino of terminosEspecificos) {
    assert.equal(source.includes(termino), false, `${termino} no debe estar en el motor genérico`);
  }
});

test('el controller expone advertencias y metadata sin conocer claves específicas', async () => {
  let response;
  const handler = createCargarArchivo({
    validateFile: async () => ({
      valido: true,
      errores: [],
      advertencias: [{ codigo: 'WARNING_FIXTURE' }],
      metadata: { fixtureContext: [{ id: 1 }] },
      campos: [],
      workbook: {}
    }),
    processUpload: async () => ({ success: true }),
    removeFile: async () => {}
  });

  await handler(
    { params: { id: '1' }, file: { path: 'fixture.xlsx', originalname: 'fixture.xlsx' } },
    { json(payload) { response = payload; return this; } },
    (error) => { throw error; }
  );

  assert.deepEqual(response.advertencias, [{ codigo: 'WARNING_FIXTURE' }]);
  assert.deepEqual(response.fixtureContext, [{ id: 1 }]);
});
