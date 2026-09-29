process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const models = require('../src/models');
const plantillaService = require('../src/services/plantillaService');
const {
  SECCIONES_SHEET,
  sectionFields,
  createInnovationFields
} = require('../src/config/plantillaInnovacion');

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

const plantillaData = {
  id: 3,
  name: 'Innovación',
  description: 'Plantilla para carga de proyectos, financiamiento y secciones de cursos de innovación',
  roleId: 5,
  archivoNombre: 'plantilla-innovacion.xlsx',
  createdAt: '2026-09-03T00:00:00.000Z',
  updatedAt: '2026-09-03T00:00:00.000Z',
  role: {
    id: 5,
    name: 'Dirección de Desarrollo e Innovación',
    group: 'Direccion',
    description: 'Gestión de Innovación'
  }
};

const plantillaInstance = () => ({
  toJSON: () => ({ ...plantillaData, role: { ...plantillaData.role } })
});

test('detalle conserva el contrato y agrega requisitos agrupados desde CampoPlantilla', async () => {
  let query;
  stub(models.Plantilla, 'findByPk', async () => plantillaInstance());
  stub(models.CampoPlantilla, 'findAll', async (options) => {
    query = options;
    return [
      { id: 1, hoja_origen: 'Proyectos Innovación', columna_excel: 'ID Proyecto', requerido: true },
      {
        id: 2,
        hoja_origen: 'Proyectos Innovación',
        columna_excel: 'N° estudiantes',
        columna_destino: 'nEstudiantes',
        tabla_destino: 'Proyecto',
        tipo_dato: 'number',
        requerido: true
      },
      { id: 3, hoja_origen: 'Financiamiento', columna_excel: 'Monto adjudicado CLP', requerido: false },
      { id: 4, hoja_origen: 'Secciones Cursos', columna_excel: 'ID Sección', requerido: true }
    ];
  });

  const result = await plantillaService.getPlantillaById('3');

  for (const [key, value] of Object.entries(plantillaData)) {
    assert.deepEqual(result[key], value);
  }
  assert.deepEqual(result.hojas, [
    {
      nombre: 'Proyectos Innovación',
      campos: [
        { columna: 'ID Proyecto', requerido: true },
        { columna: 'N° estudiantes', requerido: true }
      ]
    },
    {
      nombre: 'Financiamiento',
      campos: [{ columna: 'Monto adjudicado CLP', requerido: false }]
    },
    {
      nombre: 'Secciones Cursos',
      campos: [{ columna: 'ID Sección', requerido: true }]
    }
  ]);
  assert.deepEqual(query, {
    where: { plantillaId: '3' },
    attributes: ['id', 'hoja_origen', 'columna_excel', 'requerido'],
    order: [['id', 'ASC']]
  });
  assert.equal(JSON.stringify(result.hojas).includes('nEstudiantes'), false);
  assert.equal(JSON.stringify(result.hojas).includes('tabla_destino'), false);
  assert.equal(JSON.stringify(result.hojas).includes('tipo_dato'), false);
});

test('plantilla sin campos devuelve hojas como arreglo vacío', async () => {
  stub(models.Plantilla, 'findByPk', async () => plantillaInstance());
  stub(models.CampoPlantilla, 'findAll', async () => []);

  const result = await plantillaService.getPlantillaById(3);

  assert.deepEqual(result.hojas, []);
});

test('duplicados públicos equivalentes se proyectan una sola vez', async () => {
  stub(models.Plantilla, 'findByPk', async () => plantillaInstance());
  stub(models.CampoPlantilla, 'findAll', async () => [
    { id: 1, hoja_origen: 'Base Programas', columna_excel: 'ID Programa', requerido: true },
    { id: 2, hoja_origen: 'Base Programas', columna_excel: 'ID Programa', requerido: true }
  ]);

  const result = await plantillaService.getPlantillaById(3);

  assert.deepEqual(result.hojas[0].campos, [{ columna: 'ID Programa', requerido: true }]);
});

test('configuraciones contradictorias no se eliminan silenciosamente', async () => {
  stub(models.Plantilla, 'findByPk', async () => plantillaInstance());
  stub(models.CampoPlantilla, 'findAll', async () => [
    { id: 1, hoja_origen: 'Proyectos Innovación', columna_excel: 'ID Proyecto', requerido: true },
    { id: 2, hoja_origen: 'Proyectos Innovación', columna_excel: 'ID Proyecto', requerido: false }
  ]);

  const result = await plantillaService.getPlantillaById(3);

  assert.deepEqual(result.hojas[0].campos, [
    { columna: 'ID Proyecto', requerido: true },
    { columna: 'ID Proyecto', requerido: false }
  ]);
});

test('la respuesta cambia con la configuración obtenida desde CampoPlantilla', async () => {
  let fields = [{ id: 1, hoja_origen: 'Hoja A', columna_excel: 'Columna A', requerido: true }];
  stub(models.Plantilla, 'findByPk', async () => plantillaInstance());
  stub(models.CampoPlantilla, 'findAll', async () => fields);

  const first = await plantillaService.getPlantillaById(3);
  fields = [{ id: 2, hoja_origen: 'Hoja B', columna_excel: 'Columna B', requerido: false }];
  const second = await plantillaService.getPlantillaById(3);

  assert.deepEqual(first.hojas, [{ nombre: 'Hoja A', campos: [{ columna: 'Columna A', requerido: true }] }]);
  assert.deepEqual(second.hojas, [{ nombre: 'Hoja B', campos: [{ columna: 'Columna B', requerido: false }] }]);
});

test('plantilla inexistente conserva el error actual y no consulta campos', async () => {
  let fieldQueries = 0;
  stub(models.Plantilla, 'findByPk', async () => null);
  stub(models.CampoPlantilla, 'findAll', async () => { fieldQueries += 1; return []; });

  await assert.rejects(
    plantillaService.getPlantillaById(999),
    { message: 'Plantilla no encontrada' }
  );
  assert.equal(fieldQueries, 0);
});

test('Swagger documenta hojas, campos, columna, requerido y el ejemplo de Innovación', () => {
  const { swaggerDocs } = require('../src/config/swagger');
  const operation = swaggerDocs.paths['/api/plantillas/{id}'].get;
  const documentation = JSON.stringify(operation);

  assert.match(documentation, /hojas/);
  assert.match(documentation, /campos/);
  assert.match(documentation, /columna/);
  assert.match(documentation, /requerido/);
  assert.match(documentation, /Proyectos Innovación/);
  assert.match(documentation, /N° estudiantes/);
  assert.match(documentation, /Financiamiento/);
  assert.match(documentation, /Secciones Cursos/);
  assert.match(documentation, /ID Sección/);
});

test('detalle proyecta automáticamente los 11 requisitos de Secciones Cursos', async () => {
  stub(models.Plantilla, 'findByPk', async () => plantillaInstance());
  stub(models.CampoPlantilla, 'findAll', async () => createInnovationFields(3).map((field, index) => ({
    id: index + 1,
    ...field
  })));

  const result = await plantillaService.getPlantillaById(3);
  const sections = result.hojas.find(({ nombre }) => nombre === SECCIONES_SHEET);

  assert.deepEqual(sections, {
    nombre: SECCIONES_SHEET,
    campos: sectionFields.map(([column]) => ({ columna: column, requerido: true }))
  });
});
