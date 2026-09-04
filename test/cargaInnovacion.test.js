process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const XLSX = require('xlsx');
const models = require('../src/models');
const plantillaService = require('../src/services/plantillaService');
const plantillaController = require('../src/controllers/plantillaController');
const { procesarCarga } = require('../src/services/carga/cargaService');
const { validarArchivo } = require('../src/services/carga/validacionService');
const { seedDatabase } = require('../src/services/dbSeeder');
const indicatorService = require('../src/services/indicatorService');
const metaIndicatorIntegrationService = require('../src/services/metaIndicatorIntegrationService');
const {
  INNOVACION_TEMPLATE_NAME,
  INNOVACION_TEMPLATE_FILENAME,
  PROYECTOS_SHEET,
  FINANCIAMIENTO_SHEET,
  SECCIONES_SHEET,
  projectFields,
  financingFields,
  sectionFields,
  createInnovationTemplateBuffer,
  createInnovationFields
} = require('../src/config/plantillaInnovacion');

const TEMPLATE_ID = 3;
const originals = [];
const temporaryDirs = [];

const stub = (object, key, value) => {
  originals.push([object, key, object[key]]);
  object[key] = value;
};

const projectRows = [
  {
    'ID Proyecto': 'INN-TEST-001',
    'Tipo proyecto': 'Estudiantil',
    'Año inicio': 2025,
    'Año término': 2025,
    'Semestre inicio': '1',
    'Nombre del proyecto': 'Proyecto A',
    'Área temática': 'Transformación digital',
    'Curso/Línea': 'Innovación aplicada',
    Estado: 'En Curso',
    'Responsable/Docente': 'Ana Pérez',
    'Unidad responsable': 'Dirección de Innovación',
    'Socio/contraparte': 'CORFO',
    'Resultado principal': 'Prototipo validado',
    'Evidencia principal': 'informe-a.pdf',
    'N° estudiantes': 4,
    'N° docentes': 1,
    'N° funcionarios': 0,
    'Fecha inicio': '01-03-2025',
    'Fecha cierre estimada': '15-12-2025',
    Observación: 'Proyecto de prueba A'
  },
  {
    'ID Proyecto': 'INN-TEST-002',
    'Tipo proyecto': 'Institucional',
    'Año inicio': 2025,
    'Año término': 2026,
    'Semestre inicio': '2',
    'Nombre del proyecto': 'Proyecto B',
    'Área temática': 'Procesos',
    'Curso/Línea': 'Innovación institucional',
    Estado: 'En Curso',
    'Responsable/Docente': 'Luis Soto',
    'Unidad responsable': 'Dirección de Innovación',
    'Socio/contraparte': 'ECAS',
    'Resultado principal': 'Proceso implementado',
    'Evidencia principal': 'informe-b.pdf',
    'N° estudiantes': 6,
    'N° docentes': 2,
    'N° funcionarios': 1,
    'Fecha inicio': '01-08-2025',
    'Fecha cierre estimada': '30-06-2026',
    Observación: 'Proyecto de prueba B'
  }
];

const financingRows = [
  {
    'ID Proyecto': 'INN-TEST-001',
    'Nombre proyecto': 'Proyecto A',
    Fuente: 'CORFO',
    'Tipo financiamiento': 'Fondo concursable externo',
    'Monto adjudicado CLP': 10000000,
    'Monto ejecutado estimado CLP': 8000000,
    'Estado financiero': 'En ejecución',
    Observación: 'Financiamiento A'
  },
  {
    'ID Proyecto': 'INN-TEST-002',
    'Nombre proyecto': 'Proyecto B',
    Fuente: 'Recursos internos',
    'Tipo financiamiento': 'Recursos internos',
    'Monto adjudicado CLP': 5000000,
    'Monto ejecutado estimado CLP': 4500000,
    'Estado financiero': 'En ejecución',
    Observación: 'Financiamiento B'
  }
];

const sectionRows = [
  {
    'ID Sección': 'SEC-TEST-001', Año: 2026, Semestre: 'Otoño',
    Curso: 'Emprendimiento e Innovación', 'Carrera/Programa': 'Contador Auditor',
    Jornada: 'Diurna', 'N° Estudiantes': 25, 'N° Grupos/Proyectos': 5,
    Docente: 'Docente Uno', Modalidad: 'Presencial', Observación: 'Prueba'
  },
  {
    'ID Sección': 'SEC-TEST-002', Año: 2026, Semestre: 'Otoño',
    Curso: 'Emprendimiento e Innovación', 'Carrera/Programa': 'Contador Auditor',
    Jornada: 'Vespertina', 'N° Estudiantes': 20, 'N° Grupos/Proyectos': 4,
    Docente: 'Docente Dos', Modalidad: 'Híbrida', Observación: 'Prueba'
  },
  {
    'ID Sección': 'SEC-TEST-003', Año: 2026, Semestre: 'Primavera',
    Curso: 'Emprendimiento e Innovación', 'Carrera/Programa': 'Contador Auditor',
    Jornada: 'Diurna', 'N° Estudiantes': 30, 'N° Grupos/Proyectos': 6,
    Docente: 'Docente Tres', Modalidad: 'Presencial', Observación: 'Prueba'
  }
];

const createLoadWorkbook = () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(projectRows), PROYECTOS_SHEET);
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(financingRows), FINANCIAMIENTO_SHEET);
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sectionRows), SECCIONES_SHEET);
  return workbook;
};

const saveTemporaryWorkbook = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'piadi-268-innovacion-'));
  const filePath = path.join(directory, `carga-${process.pid}-${Date.now()}.xlsx`);
  XLSX.writeFile(createLoadWorkbook(), filePath);
  temporaryDirs.push(directory);
  return filePath;
};

const preparePersistence = ({ failOn } = {}) => {
  const transaction = {
    commitCalls: 0,
    rollbackCalls: 0,
    async commit() { this.commitCalls += 1; },
    async rollback() { this.rollbackCalls += 1; }
  };
  const inserted = { Proyecto: [], Financiamiento: [], Seccion: [] };
  const operations = [];

  stub(models.sequelize, 'transaction', async () => transaction);
  stub(models.sequelize, 'query', async () => []);
  stub(models.CampoPlantilla, 'findAll', async () => createInnovationFields(TEMPLATE_ID));

  for (const modelName of Object.keys(inserted)) {
    const Model = models[modelName];
    stub(Model, 'build', (record) => ({ ...record, async validate() {} }));
    stub(Model, 'findAll', async (options) => {
      operations.push({ type: 'findAll', model: modelName, transaction: options.transaction });
      return inserted[modelName];
    });
    stub(Model, 'bulkCreate', async (records, options) => {
      operations.push({ type: 'bulkCreate', model: modelName, records, transaction: options.transaction });
      if (failOn === modelName) throw new Error(`Fallo controlado en ${modelName}`);
      const created = records.map((record) => ({ ...record, dataValues: { ...record } }));
      inserted[modelName].push(...created);
      return created;
    });
  }

  return { transaction, inserted, operations };
};

const processWorkbook = async (options) => {
  const persistence = preparePersistence(options);
  const result = await procesarCarga(createLoadWorkbook(), createInnovationFields(TEMPLATE_ID));
  return { ...persistence, result };
};

const downloadTemplate = async () => {
  const archivoData = createInnovationTemplateBuffer();
  stub(plantillaService, 'getPlantillaWithArchivo', async () => ({
    id: TEMPLATE_ID,
    name: INNOVACION_TEMPLATE_NAME,
    archivoNombre: INNOVACION_TEMPLATE_FILENAME,
    archivoData
  }));

  const headers = {};
  let body;
  await plantillaController.descargarExcel(
    { params: { id: String(TEMPLATE_ID) } },
    {
      setHeader(name, value) { headers[name] = value; },
      send(value) { body = value; return this; }
    },
    (error) => { throw error; }
  );
  return { headers, body };
};

test.afterEach(() => {
  while (originals.length) {
    const [object, key, value] = originals.pop();
    object[key] = value;
  }
  while (temporaryDirs.length) {
    fs.rmSync(temporaryDirs.pop(), { recursive: true, force: true });
  }
});

test('1. Plantilla Innovación queda configurada por el seeder con archivo y campos reales', async () => {
  const plantillas = [];
  const seededFields = [];
  const updatedTemplates = [];
  let nextRoleId = 1;
  let nextPlantillaId = 1;

  stub(models.Role, 'findOrCreate', async () => [{ id: nextRoleId++ }]);
  stub(models.User, 'count', async () => 1);
  stub(models.Plantilla, 'findOrCreate', async (options) => {
    plantillas.push(options.defaults);
    return [{
      id: nextPlantillaId++,
      async update(values) { updatedTemplates.push(values); }
    }];
  });
  stub(models.CampoPlantilla, 'findOrCreate', async (options) => {
    seededFields.push(options.defaults);
    return [{ id: seededFields.length }];
  });

  await seedDatabase();

  const plantilla = plantillas.find(({ name }) => name === INNOVACION_TEMPLATE_NAME);
  const fields = seededFields.filter(({ plantillaId }) => plantillaId === TEMPLATE_ID);
  const lookup = fields.find((field) => field.tabla_destino === 'Financiamiento' && field.columna_destino === 'idProyecto');

  assert.equal(plantilla.name, INNOVACION_TEMPLATE_NAME);
  assert.ok(Number.isInteger(plantilla.roleId));
  assert.equal(plantilla.archivoNombre, 'plantilla-innovacion.xlsx');
  assert.ok(Buffer.isBuffer(plantilla.archivoData));
  const sectionConfig = fields.filter(({ tabla_destino }) => tabla_destino === 'Seccion');
  assert.equal(fields.length, projectFields.length + financingFields.length + sectionFields.length);
  assert.ok(fields.every((field) => field.requerido));
  assert.equal(sectionConfig.length, 11);
  assert.ok(sectionConfig.every((field) => field.hoja_origen === SECCIONES_SHEET && field.orden_insercion === 1));
  assert.ok(updatedTemplates.some(({ archivoData }) => Buffer.isBuffer(archivoData)));
  assert.deepEqual(
    [lookup.campo_lookup_tabla, lookup.campo_lookup_columna_db, lookup.campo_lookup_retorno],
    ['Proyecto', 'idProyecto', 'idProyecto']
  );
});

test('1.1 el seeder actualiza la plantilla existente y no duplica CampoPlantilla', async () => {
  const roles = new Map();
  const templates = new Map();
  const fields = new Map();
  let nextRoleId = 1;
  let nextTemplateId = 1;

  stub(models.Role, 'findOrCreate', async ({ where }) => {
    if (!roles.has(where.name)) roles.set(where.name, { id: nextRoleId++ });
    return [roles.get(where.name)];
  });
  stub(models.User, 'count', async () => 1);
  stub(models.Plantilla, 'findOrCreate', async ({ where, defaults }) => {
    if (!templates.has(where.name)) {
      templates.set(where.name, {
        id: nextTemplateId++,
        values: { ...defaults },
        async update(values) { Object.assign(this.values, values); }
      });
    }
    return [templates.get(where.name)];
  });
  stub(models.CampoPlantilla, 'findOrCreate', async ({ where, defaults }) => {
    const key = JSON.stringify(where);
    if (!fields.has(key)) fields.set(key, { ...defaults });
    return [fields.get(key)];
  });

  await seedDatabase();
  await seedDatabase();

  const innovation = templates.get(INNOVACION_TEMPLATE_NAME);
  const innovationFields = [...fields.values()].filter(({ plantillaId }) => plantillaId === innovation.id);
  assert.equal(templates.has(INNOVACION_TEMPLATE_NAME), true);
  assert.equal(innovationFields.length, projectFields.length + financingFields.length + sectionFields.length);
  assert.equal(innovationFields.filter(({ tabla_destino }) => tabla_destino === 'Seccion').length, 11);
  assert.deepEqual(XLSX.read(innovation.values.archivoData, { type: 'buffer' }).SheetNames, [
    PROYECTOS_SHEET, FINANCIAMIENTO_SHEET, SECCIONES_SHEET
  ]);
});

test('2. genera y valida un XLSX temporal con proyectos, financiamientos y secciones', async () => {
  const filePath = saveTemporaryWorkbook();
  stub(models.CampoPlantilla, 'findAll', async () => createInnovationFields(TEMPLATE_ID));
  try {
    const { valido, errores, workbook } = await validarArchivo(filePath, TEMPLATE_ID);
    assert.equal(valido, true, JSON.stringify(errores));
    assert.equal(XLSX.utils.sheet_to_json(workbook.Sheets[PROYECTOS_SHEET]).length, 2);
    assert.equal(XLSX.utils.sheet_to_json(workbook.Sheets[FINANCIAMIENTO_SHEET]).length, 2);
    assert.equal(XLSX.utils.sheet_to_json(workbook.Sheets[SECCIONES_SHEET]).length, 3);
  } finally {
    fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
    temporaryDirs.splice(temporaryDirs.indexOf(path.dirname(filePath)), 1);
  }
  assert.equal(fs.existsSync(filePath), false);
});

test('3. POST /cargar procesa proyectos, financiamientos y 3 secciones', async () => {
  const persistence = preparePersistence();
  const filePath = saveTemporaryWorkbook();
  let response;

  await plantillaController.cargarArchivo(
    { params: { id: String(TEMPLATE_ID) }, file: { path: filePath } },
    { json(payload) { response = payload; return this; } },
    (error) => { throw error; }
  );

  assert.equal(response.success, true);
  assert.deepEqual(response.resumen, { Proyecto: 2, Seccion: 3, Financiamiento: 2 });
  assert.equal(persistence.inserted.Proyecto.length, 2);
  assert.equal(persistence.inserted.Seccion.length, 3);
});

test('4. conserva los contadores de participantes leídos desde Excel', async () => {
  const { inserted } = await processWorkbook();
  assert.deepEqual(
    inserted.Proyecto.map(({ nEstudiantes, nDocentes, nFuncionarios }) => ({ nEstudiantes, nDocentes, nFuncionarios })),
    [
      { nEstudiantes: 4, nDocentes: 1, nFuncionarios: 0 },
      { nEstudiantes: 6, nDocentes: 2, nFuncionarios: 1 }
    ]
  );
});

test('5. procesa dos filas de Financiamiento sin intercambiar sus valores', async () => {
  const { inserted } = await processWorkbook();
  assert.deepEqual(inserted.Financiamiento.map((row) => row.fuenteFinanciamiento), ['CORFO', 'Recursos internos']);
  assert.deepEqual(inserted.Financiamiento.map((row) => row.montoAdjudicado), [10000000, 5000000]);
  assert.deepEqual(inserted.Financiamiento.map((row) => row.financiamientoExterno), ['Fondo concursable externo', 'Recursos internos']);
});

test('6. resuelve el lookup Proyecto-Financiamiento mediante ID Proyecto', async () => {
  const { inserted } = await processWorkbook();
  assert.deepEqual(inserted.Proyecto.map((row) => row.idProyecto), ['INN-TEST-001', 'INN-TEST-002']);
  assert.deepEqual(inserted.Financiamiento.map((row) => row.idProyecto), ['INN-TEST-001', 'INN-TEST-002']);
});

test('6.1 mapea encabezados y números de Secciones Cursos al modelo Seccion', async () => {
  const { inserted } = await processWorkbook();
  assert.deepEqual(inserted.Seccion[0], {
    idSeccion: 'SEC-TEST-001',
    anio: 2026,
    semestre: 'Otoño',
    curso: 'Emprendimiento e Innovación',
    carreraPrograma: 'Contador Auditor',
    jornada: 'Diurna',
    nEstudiantes: 25,
    nProyectos: 5,
    docente: 'Docente Uno',
    modalidad: 'Presencial',
    observacion: 'Prueba',
    dataValues: {
      idSeccion: 'SEC-TEST-001', anio: 2026, semestre: 'Otoño',
      curso: 'Emprendimiento e Innovación', carreraPrograma: 'Contador Auditor',
      jornada: 'Diurna', nEstudiantes: 25, nProyectos: 5,
      docente: 'Docente Uno', modalidad: 'Presencial', observacion: 'Prueba'
    }
  });
});

test('7. hace rollback total cuando falla Financiamiento', async () => {
  const persistence = preparePersistence({ failOn: 'Financiamiento' });
  await assert.rejects(
    procesarCarga(createLoadWorkbook(), createInnovationFields(TEMPLATE_ID)),
    /Fallo controlado en Financiamiento/
  );

  assert.equal(persistence.transaction.commitCalls, 0);
  assert.equal(persistence.transaction.rollbackCalls, 1);
  assert.ok(persistence.operations.every((operation) => operation.transaction === persistence.transaction));
});

test('8. hace commit y procesa Proyecto antes de Financiamiento', async () => {
  const { transaction, operations } = await processWorkbook();
  const bulkModels = operations.filter((operation) => operation.type === 'bulkCreate').map((operation) => operation.model);

  assert.deepEqual(bulkModels, ['Proyecto', 'Seccion', 'Financiamiento']);
  assert.equal(transaction.commitCalls, 1);
  assert.equal(transaction.rollbackCalls, 0);
  assert.ok(operations.every((operation) => operation.transaction === transaction));
});

test('9. GET /descargar retorna el XLSX funcional y sus headers', async () => {
  const { headers, body } = await downloadTemplate();
  assert.equal(headers['Content-Type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(headers['Content-Disposition'], 'attachment; filename=plantilla-innovacion.xlsx');
  assert.ok(Buffer.isBuffer(body));
  assert.ok(body.length > 0);
});

test('10. el XLSX descargado contiene las tres hojas de Innovación', async () => {
  const { body } = await downloadTemplate();
  const workbook = XLSX.read(body, { type: 'buffer' });
  assert.deepEqual(workbook.SheetNames, [PROYECTOS_SHEET, FINANCIAMIENTO_SHEET, SECCIONES_SHEET]);
});

test('10.1 Secciones Cursos conserva exactamente los 11 encabezados oficiales', async () => {
  const { body } = await downloadTemplate();
  const workbook = XLSX.read(body, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[SECCIONES_SHEET], { header: 1 });
  assert.deepEqual(rows[0], sectionFields.map(([column]) => column));
});

test('11. la hoja descargada de proyectos contiene las columnas de participantes', async () => {
  const { body } = await downloadTemplate();
  const workbook = XLSX.read(body, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[PROYECTOS_SHEET], { header: 1 });
  assert.ok(rows[0].includes('N° estudiantes'));
  assert.ok(rows[0].includes('N° docentes'));
  assert.ok(rows[0].includes('N° funcionarios'));
});

test('12. Swagger documenta las hojas y participantes agregados de Innovación', () => {
  const { swaggerDocs } = require('../src/config/swagger');
  const post = swaggerDocs.paths['/api/plantillas/{id}/cargar'].post;
  const download = swaggerDocs.paths['/api/plantillas/{id}/descargar'].get;

  assert.match(post.description, /Proyectos Innovación/);
  assert.match(post.description, /Financiamiento/);
  assert.match(post.description, /Secciones Cursos/);
  assert.match(post.description, /N° estudiantes/);
  assert.doesNotMatch(post.description, /hoja Participantes[^.]*existe/i);
  assert.match(download.description, /Innovación/);
  assert.match(download.description, /Proyectos Innovación/);
  assert.match(download.description, /Secciones Cursos/);
});

test('12.1 la carga alimenta el breakdown secciones_curso por semestre', async () => {
  const { inserted } = await processWorkbook();
  stub(models.Department, 'findOne', async () => ({ toJSON: () => ({ key: 'innovacion' }) }));
  stub(models.IndicatorDefinition, 'findOne', async () => ({
    toJSON: () => ({
      key: 'secciones_curso', departmentId: 'innovacion', name: 'Secciones del curso de innovación',
      formulaKey: 'COUNT_INNOVATION_SECTIONS', unit: 'secciones', format: 'number', enabled: true
    })
  }));
  stub(models.Seccion, 'findAll', async () => [
    ...inserted.Seccion,
    { idSeccion: 'OTRA', anio: 2026, semestre: 'Otoño', curso: 'Otra asignatura' }
  ].filter(({ curso }) => curso.toLocaleLowerCase('es') === 'emprendimiento e innovación'.toLocaleLowerCase('es')));
  stub(metaIndicatorIntegrationService, 'getIndicatorMetaContext', async () => null);

  const { data } = await indicatorService.getIndicatorBreakdown('secciones_curso', {
    department: 'innovacion', year: '2026', groupBy: 'semestre'
  });
  assert.deepEqual(data.items, [
    { label: 'Otoño', value: 2 },
    { label: 'Primavera', value: 1 }
  ]);
});

test('13. el XLSX temporal de carga se elimina incluso al completar el endpoint', async () => {
  preparePersistence();
  const filePath = saveTemporaryWorkbook();

  await plantillaController.cargarArchivo(
    { params: { id: String(TEMPLATE_ID) }, file: { path: filePath } },
    { json() { return this; } },
    (error) => { throw error; }
  );

  assert.equal(fs.existsSync(filePath), false);
});
