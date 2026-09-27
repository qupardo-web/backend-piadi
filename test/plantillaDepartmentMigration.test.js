process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const models = require('../src/models');
const plantillaService = require('../src/services/plantillaService');
const { createInnovationPlantilla } = require('../src/config/plantillaInnovacion');
const { createAllAdmisionPlantillas } = require('../src/config/plantillaAdmision');
const {
  preparePlantillaDepartmentMigration,
  migratePlantillaDepartments
} = require('../src/migrations/20260926-plantilla-department');

test('Plantilla declara propiedad departamental obligatoria y asociaciones bidireccionales', () => {
  const attribute = models.Plantilla.rawAttributes.departmentId;
  assert.equal(attribute.allowNull, false);
  assert.equal(attribute.references.model, 'departments');
  assert.equal(models.Plantilla.associations.department.target, models.Department);
  assert.equal(models.Plantilla.associations.department.targetKey, 'key');
  assert.equal(models.Department.associations.plantillas.target, models.Plantilla);
});

test('configuraciones de Innovación y Admisión declaran propietario sin inferencia runtime', () => {
  assert.equal(createInnovationPlantilla(11).departmentId, 'innovacion');
  assert.deepEqual(createAllAdmisionPlantillas(12).map((item) => item.departmentId), [
    'admision',
    'admision',
    'admision'
  ]);
});

test('migración agrega, puebla, referencia y vuelve obligatoria la propiedad', async () => {
  const queries = [];
  const database = { query: async (sql) => { queries.push(sql); } };
  await preparePlantillaDepartmentMigration(database);
  await migratePlantillaDepartments(database);
  const sql = queries.join('\n');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "departmentId"/);
  assert.match(sql, /WHEN 'Vinculación Con El Medio' THEN 'vinculacion_medio'/);
  assert.match(sql, /WHEN 'Educación Continua' THEN 'educacion_continua'/);
  assert.match(sql, /WHEN 'Innovación' THEN 'innovacion'/);
  assert.match(sql, /WHEN 'Admisión' THEN 'admision'/);
  assert.match(sql, /fk_plantillas_department/);
  assert.match(sql, /ALTER COLUMN "departmentId" SET NOT NULL/);
});

test('reemplazar el archivo reutiliza req.plantilla y evita otra consulta', async () => {
  let findCalls = 0;
  const originalFindByPk = models.Plantilla.findByPk;
  models.Plantilla.findByPk = async () => { findCalls += 1; };
  const resolved = {
    updateCalls: 0,
    async update(values) {
      this.updateCalls += 1;
      Object.assign(this, values);
    }
  };
  try {
    const result = await plantillaService.guardarArchivoTemplate(1, Buffer.from('xlsx'), 'plantilla.xlsx', resolved);
    assert.equal(result, resolved);
    assert.equal(findCalls, 0);
    assert.equal(resolved.updateCalls, 1);
    assert.equal(resolved.archivoNombre, 'plantilla.xlsx');
  } finally {
    models.Plantilla.findByPk = originalFindByPk;
  }
});

test('consulta de autorización resuelve rol y departamento propietario en una sola lectura', async () => {
  let options;
  const originalFindByPk = models.Plantilla.findByPk;
  models.Plantilla.findByPk = async (id, queryOptions) => {
    options = queryOptions;
    return { id };
  };
  try {
    const result = await plantillaService.getPlantillaForAuthorization(7);
    assert.equal(result.id, 7);
    assert.deepEqual(options.include.map((item) => item.as), ['role', 'department']);
  } finally {
    models.Plantilla.findByPk = originalFindByPk;
  }
});
