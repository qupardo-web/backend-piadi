process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const XLSX = require('xlsx');
const models = require('../src/models');
const { validarArchivo } = require('../src/services/carga/validacionService');
const { procesarCarga } = require('../src/services/carga/cargaService');
const { createCargarArchivo } = require('../src/controllers/plantillaController');
const {
  ESTUDIANTES_PREGRADO_SHEET,
  CARACTERIZACION_SHEET,
  VARIANTE_COMBINADA,
  VARIANTE_MATRICULA,
  VARIANTE_CARACTERIZACION,
  estudiantesPregradosHeaders,
  caracterizacionEstudianteHeaders,
  createAdmisionFields
} = require('../src/config/plantillaAdmision');

const originals = [];
const tempDirectories = [];
const mockExcelPath = process.env.PIADI_ADMISION_MOCK_TEST_FILE || '';
const originalExcelPath = process.env.PIADI_ADMISION_REAL_TEST_FILE || '';

const stub = (object, key, value) => {
  originals.push([object, key, object[key]]);
  object[key] = value;
};

const matriculaRecord = (overrides = {}) => ({
  Número: 1,
  RUT: 12345678,
  DIG: '5',
  CODCLI: 'CLI-001',
  PATERNO: 'Pérez',
  MATERNO: 'González',
  NOMBRE: 'Juan',
  SECCION: 1,
  ASIGNATURA: 'Contabilidad I',
  MAIL: 'juan@example.cl',
  FONOACT: '+56911111111',
  FONOEMERG: null,
  AÑO: 2026,
  PERIODO: 1,
  RAMOEQUIV: 'CONT-101',
  ESTACAD: 'VIGENTE',
  FONOPROC: null,
  AL_FONO: null,
  CELULAR: null,
  CELULARACT: null,
  ...overrides
});

const caracterizacionRecord = (overrides = {}) => ({
  CODCLI: 'CLI-001',
  RUT: 12345678,
  DIG: '5',
  SEXO: 'M',
  FECHANAC: '18-06-2003',
  REGION: 'METROPOLITANA',
  COMUNA: 'SANTIAGO',
  TIPOCOLEGIO: 'MUNICIPAL',
  VIAACCESO: 'PAES',
  NSE: 'QUINTIL 3',
  SITUACIONFAMILIAR: 'VIVE CON PADRES',
  BENEFICIOS: 'GRATUIDAD',
  ...overrides
});

const createWorkbook = ({ matricula, caracterizacion, matriculaSheet = ESTUDIANTES_PREGRADO_SHEET } = {}) => {
  const workbook = XLSX.utils.book_new();
  if (matricula) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(matricula, {
      header: estudiantesPregradosHeaders
    }), matriculaSheet);
  }
  if (caracterizacion) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(caracterizacion, {
      header: ['CODCLI', ...caracterizacionEstudianteHeaders]
    }), CARACTERIZACION_SHEET);
  }
  return workbook;
};

const saveWorkbook = (workbook) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'piadi-330-'));
  const filePath = path.join(directory, 'admision.xlsx');
  XLSX.writeFile(workbook, filePath);
  tempDirectories.push(directory);
  return filePath;
};

const saveHtmlXls = (records) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'piadi-330-html-'));
  const filePath = path.join(directory, 'upload-temporal.xls');
  const headers = estudiantesPregradosHeaders.map((header) => {
    if (header === 'Número') return 'N&#250;mero';
    if (header === 'AÑO') return 'A&#209;O';
    return header;
  });
  const cell = (value) => value === null || value === undefined
    ? ''
    : String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/Ó/g, '&#211;');
  const rows = records.map((record) =>
    `<tr>${estudiantesPregradosHeaders.map((header) => `<td>${cell(record[header])}</td>`).join('')}</tr>`
  ).join('');
  const html = `<form method="post"></form><table><tr>${headers.map((header) => `<td>${header}</td>`).join('')}</tr>${rows}</table>`;
  fs.writeFileSync(filePath, html, 'utf8');
  tempDirectories.push(directory);
  return filePath;
};

const validate = async (workbook, variante = VARIANTE_COMBINADA) => {
  const fields = createAdmisionFields(330, variante);
  stub(models.CampoPlantilla, 'findAll', async () => fields);
  return validarArchivo(saveWorkbook(workbook), 330);
};

const createInstance = (record) => {
  const instance = { ...record, dataValues: { ...record } };
  instance.update = async (changes) => {
    Object.assign(instance, changes);
    Object.assign(instance.dataValues, changes);
    return instance;
  };
  return instance;
};

const preparePersistence = ({ seed = {}, failOn = null } = {}) => {
  const stores = Object.fromEntries(
    ['Alumno', 'Asignatura', 'MatriculaPorAsignatura', 'CaracterizacionEstudiante']
      .map((table) => [table, (seed[table] || []).map(createInstance)])
  );
  const operations = [];
  const transaction = {
    commits: 0,
    rollbacks: 0,
    async commit() { this.commits += 1; },
    async rollback() { this.rollbacks += 1; }
  };
  stub(models.sequelize, 'transaction', async () => transaction);
  stub(models.sequelize, 'query', async () => []);

  for (const table of Object.keys(stores)) {
    const Model = models[table];
    stub(Model, 'findAll', async (options) => {
      operations.push({ type: 'findAll', table, transaction: options.transaction });
      return stores[table];
    });
    stub(Model, 'bulkCreate', async (records, options) => {
      operations.push({ type: 'bulkCreate', table, records, transaction: options.transaction });
      if (failOn === table) throw new Error(`Fallo controlado en ${table}`);
      const created = records.map(createInstance);
      stores[table].push(...created);
      return created;
    });
  }
  return { stores, operations, transaction };
};

test.afterEach(() => {
  while (originals.length) {
    const [object, key, value] = originals.pop();
    object[key] = value;
  }
  while (tempDirectories.length) {
    fs.rmSync(tempDirectories.pop(), { recursive: true, force: true });
  }
});

test('1-3. reconoce aliases de matrícula y Caracterización Estudiante', async (t) => {
  for (const alias of [
    'Estudiantes Pregrado',
    'Estudiantes Pregrados',
    'Estudiantes',
    'Esstudiantes',
    'Estudiantes Pregrado 2026',
    'Esstudiantes pregrado 2026'
  ]) {
    await t.test(alias, async () => {
      const result = await validate(createWorkbook({ matricula: [matriculaRecord()], matriculaSheet: alias }), VARIANTE_MATRICULA);
      assert.equal(result.valido, true, JSON.stringify(result.errores));
    });
  }
  await t.test('Caracterización Estudiante', async () => {
    const result = await validate(createWorkbook({ caracterizacion: [caracterizacionRecord()] }), VARIANTE_CARACTERIZACION);
    assert.equal(result.valido, true, JSON.stringify(result.errores));
  });
});

test('4-7. admite solo matrícula, solo caracterización o ambas y rechaza ninguna', async (t) => {
  await t.test('solo matrícula en combinada', async () => {
    const result = await validate(createWorkbook({ matricula: [matriculaRecord()] }));
    assert.equal(result.valido, true, JSON.stringify(result.errores));
  });
  await t.test('solo caracterización en combinada', async () => {
    const result = await validate(createWorkbook({ caracterizacion: [caracterizacionRecord()] }));
    assert.equal(result.valido, true, JSON.stringify(result.errores));
  });
  await t.test('ambas hojas', async () => {
    const result = await validate(createWorkbook({ matricula: [matriculaRecord()], caracterizacion: [caracterizacionRecord()] }));
    assert.equal(result.valido, true, JSON.stringify(result.errores));
  });
  await t.test('ninguna hoja', async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Otro'], ['dato']]), 'Otra hoja');
    const result = await validate(workbook);
    assert.equal(result.valido, false);
    assert.match(result.errores[0].mensaje, /ninguna hoja válida/i);
  });
  await t.test('aliases ambiguos se rechazan', async () => {
    const workbook = createWorkbook({ matricula: [matriculaRecord()], matriculaSheet: 'Estudiantes' });
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([matriculaRecord()], { header: estudiantesPregradosHeaders }),
      'Estudiantes 2026'
    );
    const result = await validate(workbook, VARIANTE_MATRICULA);
    assert.equal(result.valido, false);
    assert.ok(result.errores.some((error) => /varias hojas compatibles/i.test(error.mensaje)));
  });
});

test('8-12. crea/reutiliza padres, resuelve fallback RUT y rechaza identidades inconsistentes', async (t) => {
  await t.test('Alumno nuevo y orden determinista', async () => {
    const state = preparePersistence();
    const result = await procesarCarga(createWorkbook({ matricula: [matriculaRecord()] }), createAdmisionFields(330, VARIANTE_MATRICULA));
    assert.deepEqual(result.resumen, { Alumno: 1, Asignatura: 1, MatriculaPorAsignatura: 1 });
    assert.deepEqual(state.operations.filter((operation) => operation.type === 'bulkCreate').map((operation) => operation.table), [
      'Alumno', 'Asignatura', 'MatriculaPorAsignatura'
    ]);
  });
  await t.test('Alumno y Asignatura existentes', async () => {
    const state = preparePersistence({ seed: {
      Alumno: [{ ...matriculaRecord(), codCli: 'CLI-001', rut: 12345678 }],
      Asignatura: [{ ramoEquiv: 'CONT-101', nombre: 'Contabilidad I' }]
    } });
    const result = await procesarCarga(createWorkbook({ matricula: [matriculaRecord()] }), createAdmisionFields(330, VARIANTE_MATRICULA));
    assert.equal(result.resumen.Alumno, 0);
    assert.equal(result.resumen.Asignatura, 0);
    assert.equal(state.stores.Alumno.length, 1);
    assert.equal(state.stores.Asignatura.length, 1);
  });
  await t.test('fallback por RUT', async () => {
    const state = preparePersistence({ seed: {
      Alumno: [{ codCli: 'CLI-REAL', rut: 12345678, digitoVerificador: '5', nombre: 'Juan', apellidoPat: 'Pérez', apellidoMat: 'González' }]
    } });
    await procesarCarga(createWorkbook({ matricula: [matriculaRecord({ CODCLI: 'CLI-ALIAS' })] }), createAdmisionFields(330, VARIANTE_MATRICULA));
    assert.equal(state.stores.MatriculaPorAsignatura[0].codCli, 'CLI-REAL');
  });
  await t.test('inconsistencia CODCLI/RUT', async () => {
    preparePersistence({ seed: {
      Alumno: [{ codCli: 'CLI-001', rut: 87654321 }]
    } });
    await assert.rejects(
      procesarCarga(createWorkbook({ matricula: [matriculaRecord()] }), createAdmisionFields(330, VARIANTE_MATRICULA)),
      /Inconsistencia CODCLI\/RUT/
    );
  });
  await t.test('caracterización contrasta CODCLI y RUT', async () => {
    preparePersistence({ seed: {
      Alumno: [
        { codCli: 'CLI-001', rut: 12345678 },
        { codCli: 'CLI-OTRO', rut: 87654321 }
      ]
    } });
    await assert.rejects(
      procesarCarga(
        createWorkbook({ caracterizacion: [caracterizacionRecord({ CODCLI: 'CLI-OTRO' })] }),
        createAdmisionFields(330, VARIANTE_CARACTERIZACION)
      ),
      /Inconsistencia CODCLI\/RUT|identifican alumnos distintos/
    );
  });
});

test('13-17. normaliza períodos 1/2, rechaza 3/4 y soporta fechas reales/serial Excel', async (t) => {
  for (const value of [1, '2', 'primer semestre', 'semestre 2']) {
    await t.test(`periodo ${value}`, async () => {
      const result = await validate(createWorkbook({ matricula: [matriculaRecord({ PERIODO: value })] }), VARIANTE_MATRICULA);
      assert.equal(result.valido, true, JSON.stringify(result.errores));
    });
  }
  for (const value of [3, 4]) {
    await t.test(`rechaza ${value}`, async () => {
      const result = await validate(createWorkbook({ matricula: [matriculaRecord({ PERIODO: value })] }), VARIANTE_MATRICULA);
      assert.equal(result.valido, false);
      assert.ok(result.errores.some((error) => /semestre 1 o 2/i.test(error.mensaje)));
    });
  }
  await t.test('DD-MM-YYYY y serial Excel', async () => {
    let result = await validate(createWorkbook({ caracterizacion: [caracterizacionRecord()] }), VARIANTE_CARACTERIZACION);
    assert.equal(result.valido, true, JSON.stringify(result.errores));
    result = await validate(createWorkbook({ caracterizacion: [caracterizacionRecord({ FECHANAC: 45000 })] }), VARIANTE_CARACTERIZACION);
    assert.equal(result.valido, true, JSON.stringify(result.errores));
  });
});

test('18-21. matrícula y caracterización son idempotentes y los conflictos no se descartan', async (t) => {
  await t.test('duplicado exacto dentro del archivo se ignora', async () => {
    const state = preparePersistence();
    const result = await procesarCarga(
      createWorkbook({ matricula: [matriculaRecord(), matriculaRecord()] }),
      createAdmisionFields(330, VARIANTE_MATRICULA)
    );
    assert.equal(result.resumen.MatriculaPorAsignatura, 1);
    assert.equal(state.stores.MatriculaPorAsignatura.length, 1);
  });
  await t.test('matrícula existente y recarga exacta', async () => {
    const state = preparePersistence({ seed: {
      Alumno: [{ codCli: 'CLI-001', rut: 12345678 }],
      Asignatura: [{ ramoEquiv: 'CONT-101', nombre: 'Contabilidad I' }],
      MatriculaPorAsignatura: [{ codCli: 'CLI-001', ramoEquiv: 'CONT-101', anio: 2026, periodo: 1, seccion: 1, estadoCad: 'VIGENTE' }]
    } });
    const workbook = createWorkbook({ matricula: [matriculaRecord()] });
    const fields = createAdmisionFields(330, VARIANTE_MATRICULA);
    let result = await procesarCarga(workbook, fields);
    assert.equal(result.resumen.MatriculaPorAsignatura, 0);
    result = await procesarCarga(workbook, fields);
    assert.equal(result.resumen.MatriculaPorAsignatura, 0);
    assert.equal(state.stores.MatriculaPorAsignatura.length, 1);
  });
  await t.test('caracterización existente se actualiza y luego se ignora', async () => {
    const state = preparePersistence({ seed: {
      Alumno: [{ codCli: 'CLI-001', rut: 12345678 }],
      CaracterizacionEstudiante: [{ ...caracterizacionRecord(), rut: 12345678, region: 'ANTIGUA', fechaNacimiento: '2003-06-18' }]
    } });
    const workbook = createWorkbook({ caracterizacion: [caracterizacionRecord()] });
    const fields = createAdmisionFields(330, VARIANTE_CARACTERIZACION);
    let result = await procesarCarga(workbook, fields);
    assert.equal(result.resumen.CaracterizacionEstudiante, 1);
    assert.equal(state.stores.CaracterizacionEstudiante[0].region, 'METROPOLITANA');
    result = await procesarCarga(workbook, fields);
    assert.equal(result.resumen.CaracterizacionEstudiante, 0);
    assert.equal(state.stores.CaracterizacionEstudiante.length, 1);
  });
  await t.test('misma PK con distinta sección', async () => {
    const workbook = createWorkbook({ matricula: [matriculaRecord(), matriculaRecord({ SECCION: 2 })] });
    const validation = await validate(workbook, VARIANTE_MATRICULA);
    assert.equal(validation.valido, false);
    assert.ok(validation.errores.some((error) => /Conflicto de matrícula/.test(error.mensaje)));
  });
});

test('22. rollback abarca toda la carga', async () => {
  const state = preparePersistence({ failOn: 'CaracterizacionEstudiante' });
  await assert.rejects(
    procesarCarga(
      createWorkbook({ matricula: [matriculaRecord()], caracterizacion: [caracterizacionRecord()] }),
      createAdmisionFields(330, VARIANTE_COMBINADA)
    ),
    /Fallo controlado/
  );
  assert.equal(state.transaction.commits, 0);
  assert.equal(state.transaction.rollbacks, 1);
  assert.ok(state.operations.every((operation) => operation.transaction === state.transaction));
});

test('23. plantilla inexistente produce error controlado y nunca success true', async () => {
  stub(models.CampoPlantilla, 'findAll', async () => []);
  const result = await validarArchivo(
    saveWorkbook(createWorkbook({ matricula: [matriculaRecord()] })),
    999999
  );
  assert.equal(result.valido, false);
  assert.match(result.errores[0].mensaje, /no existe o no tiene campos/i);
});

test('24. procesa el HTML institucional con extensión .xls y nombre original histórico', async () => {
  const filePath = saveHtmlXls([
    matriculaRecord({ ASIGNATURA: 'GESTIÓN I' }),
    matriculaRecord({ RAMOEQUIV: 'GEST-102', ASIGNATURA: 'GESTIÓN II', PERIODO: 2 })
  ]);
  const signature = fs.readFileSync(filePath).subarray(0, 5).toString('utf8');
  assert.equal(signature, '<form');

  const state = preparePersistence();
  stub(models.CampoPlantilla, 'findAll', async () => createAdmisionFields(330, VARIANTE_MATRICULA));
  const responses = [];
  const handler = createCargarArchivo({
    validateFile: validarArchivo,
    processUpload: procesarCarga,
    removeFile: async () => {}
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await handler(
      {
        params: { id: '330' },
        file: { path: filePath, originalname: 'Esstudiantes pregrado 2026.xls' }
      },
      {
        status() { return this; },
        json(payload) { responses.push(payload); return this; }
      },
      (error) => { throw error; }
    );
  }

  assert.deepEqual(responses.map((response) => response.resumen), [
    { Alumno: 1, Asignatura: 2, MatriculaPorAsignatura: 2 },
    { Alumno: 0, Asignatura: 0, MatriculaPorAsignatura: 0 }
  ]);
  assert.equal(state.stores.Alumno.length, 1);
  assert.equal(state.stores.Asignatura.length, 2);
  assert.equal(state.stores.MatriculaPorAsignatura.length, 2);
  assert.equal(state.stores.Asignatura[0].nombre, 'GESTIÓN I');
});

test('mock previo conserva evidencia de sus 50 conflictos de matrícula', {
  skip: !mockExcelPath || !fs.existsSync(mockExcelPath)
}, async () => {
  stub(models.CampoPlantilla, 'findAll', async () => createAdmisionFields(330, VARIANTE_COMBINADA));
  const result = await validarArchivo(mockExcelPath, 330);
  assert.equal(result.valido, false);
  assert.equal(result.errores.filter((error) => /Conflicto de matrícula/.test(error.mensaje)).length, 50);
  assert.ok(!result.errores.some((error) => /no existe en el archivo/.test(error.mensaje)));
});

test('archivo original se reconoce sin conflictos PK y reporta solo sus 8 errores de datos', {
  skip: !originalExcelPath || !fs.existsSync(originalExcelPath)
}, async () => {
  stub(models.CampoPlantilla, 'findAll', async () => createAdmisionFields(330, VARIANTE_MATRICULA));
  const result = await validarArchivo(originalExcelPath, 330);
  assert.equal(result.valido, false);
  assert.equal(result.errores.length, 8);
  assert.equal(result.errores.filter((error) => error.campo === 'MAIL').length, 5);
  assert.equal(result.errores.filter((error) => error.campo === 'MATERNO').length, 3);
  assert.equal(result.errores.filter((error) => /Conflicto de matrícula/.test(error.mensaje)).length, 0);
  assert.ok(!result.errores.some((error) => /hoja .* no existe|ninguna hoja válida/i.test(error.mensaje)));
});

test('POST original devuelve 422 antes de persistir por sus 8 errores de datos', {
  skip: !originalExcelPath || !fs.existsSync(originalExcelPath)
}, async () => {
  stub(models.CampoPlantilla, 'findAll', async () => createAdmisionFields(330, VARIANTE_MATRICULA));
  let processCalls = 0;
  const statusCodes = [];
  const responses = [];
  const handler = createCargarArchivo({
    validateFile: validarArchivo,
    processUpload: async () => { processCalls += 1; },
    removeFile: async () => {}
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await handler(
      {
        params: { id: '330' },
        file: { path: originalExcelPath, originalname: 'Esstudiantes pregrado 2026.xls' }
      },
      {
        status(code) { statusCodes.push(code); return this; },
        json(payload) { responses.push(payload); return this; }
      },
      (error) => { throw error; }
    );
  }
  assert.deepEqual(statusCodes, [422, 422]);
  assert.ok(responses.every((response) => response.success === false));
  assert.ok(responses.every((response) => response.errores.length === 8));
  assert.ok(responses.every((response) =>
    response.errores.every((error) => !/Conflicto de matrícula/.test(error.message))
  ));
  assert.equal(processCalls, 0);
});
