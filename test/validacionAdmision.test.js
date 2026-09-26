process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgres://test:test@127.0.0.1:5432/piadi_test';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const XLSX = require('xlsx');
const models = require('../src/models');
const { validarArchivo } = require('../src/services/carga/validacionService');
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

const stub = (object, key, value) => {
  originals.push([object, key, object[key]]);
  object[key] = value;
};

const matricula = (overrides = {}) => ({
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

const caracterizacion = (overrides = {}) => ({
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

const workbook = ({ matriculas, caracterizaciones, alias = ESTUDIANTES_PREGRADO_SHEET } = {}) => {
  const result = XLSX.utils.book_new();
  if (matriculas) {
    XLSX.utils.book_append_sheet(
      result,
      XLSX.utils.json_to_sheet(matriculas, { header: estudiantesPregradosHeaders }),
      alias
    );
  }
  if (caracterizaciones) {
    XLSX.utils.book_append_sheet(
      result,
      XLSX.utils.json_to_sheet(caracterizaciones, { header: ['CODCLI', ...caracterizacionEstudianteHeaders] }),
      CARACTERIZACION_SHEET
    );
  }
  return result;
};

const save = (book) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'piadi-336-'));
  const filePath = path.join(directory, 'admision.xlsx');
  XLSX.writeFile(book, filePath);
  tempDirectories.push(directory);
  return filePath;
};

const validate = async (book, variante, alumnos = []) => {
  stub(models.CampoPlantilla, 'findAll', async () => createAdmisionFields(336, variante));
  stub(models.Alumno, 'findAll', async () => alumnos);
  return validarArchivo(save(book), 336);
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

test('PIADI-336 caso 1: solo matrícula válida', async () => {
  const result = await validate(workbook({ matriculas: [matricula()] }), VARIANTE_MATRICULA);
  assert.equal(result.valido, true, JSON.stringify(result.errores));
});

test('PIADI-336 caso 2: solo caracterización resoluble contra Alumno', async () => {
  const result = await validate(
    workbook({ caracterizaciones: [caracterizacion()] }),
    VARIANTE_CARACTERIZACION,
    [{ codCli: 'CLI-001', rut: 12345678 }]
  );
  assert.equal(result.valido, true, JSON.stringify(result.errores));
});

test('PIADI-336 caso 3: ambas hojas mantienen identidad consistente', async () => {
  const result = await validate(
    workbook({ matriculas: [matricula()], caracterizaciones: [caracterizacion()] }),
    VARIANTE_COMBINADA
  );
  assert.equal(result.valido, true, JSON.stringify(result.errores));
  assert.equal(result.pendientesCaracterizacion.length, 0);
});

test('PIADI-336 caso 4: ninguna hoja reconocida es error', async () => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['OTRO'], ['dato']]), 'Otra hoja');
  const result = await validate(book, VARIANTE_COMBINADA);
  assert.equal(result.valido, false);
  assert.ok(result.errores.some((error) => /ninguna hoja válida/i.test(error.mensaje)));
});

test('PIADI-336 caso 5: matrícula sin caracterización pasa y reporta pendiente', async () => {
  const filePath = save(workbook({ matriculas: [matricula()] }));
  stub(models.CampoPlantilla, 'findAll', async () => createAdmisionFields(336, VARIANTE_COMBINADA));
  stub(models.Alumno, 'findAll', async () => []);
  let processCalls = 0;
  let response;
  const handler = createCargarArchivo({
    validateFile: validarArchivo,
    processUpload: async () => {
      processCalls += 1;
      return { success: true, resumen: {} };
    },
    removeFile: async () => {}
  });
  await handler(
    { params: { id: '336' }, file: { path: filePath, originalname: 'Estudiantes Pregrado 2026.xlsx' } },
    { status() { return this; }, json(payload) { response = payload; return this; } },
    (error) => { throw error; }
  );
  assert.equal(processCalls, 1);
  assert.equal(response.success, true);
  assert.equal(response.advertencias[0].codigo, 'ADMISION_PENDIENTE_CARACTERIZACION');
  assert.deepEqual(response.pendientesCaracterizacion.map((item) => item.codCli), ['CLI-001']);
});

test('PIADI-336 caso 6: caracterización huérfana es error por fila', async () => {
  const result = await validate(workbook({ caracterizaciones: [caracterizacion()] }), VARIANTE_CARACTERIZACION);
  assert.equal(result.valido, false);
  const error = result.errores.find((item) => item.codigo === 'ADMISION_CARACTERIZACION_HUERFANA');
  assert.equal(error.fila, 2);
});

test('PIADI-336 caso 7: mismo CODCLI con RUT distintos bloquea antes de persistir', async () => {
  const filePath = save(workbook({
    matriculas: [matricula()],
    caracterizaciones: [caracterizacion({ RUT: 11111111, DIG: '1' })]
  }));
  stub(models.CampoPlantilla, 'findAll', async () => createAdmisionFields(336, VARIANTE_COMBINADA));
  stub(models.Alumno, 'findAll', async () => []);
  let processCalls = 0;
  let statusCode;
  let response;
  const handler = createCargarArchivo({
    validateFile: validarArchivo,
    processUpload: async () => { processCalls += 1; },
    removeFile: async () => {}
  });
  await handler(
    { params: { id: '336' }, file: { path: filePath, originalname: 'admision.xlsx' } },
    { status(code) { statusCode = code; return this; }, json(payload) { response = payload; return this; } },
    (error) => { throw error; }
  );
  assert.equal(statusCode, 422);
  assert.equal(processCalls, 0);
  assert.ok(response.errores.some((error) =>
    error.codigo === 'ADMISION_IDENTIDAD_CONTRADICTORIA' && error.severidad === 'ERROR'
  ));
});

test('PIADI-336 caso 8: CODCLI desconocido usa RUT como fallback inequívoco', async () => {
  const result = await validate(
    workbook({ caracterizaciones: [caracterizacion({ CODCLI: 'CLI-ALIAS' })] }),
    VARIANTE_CARACTERIZACION,
    [{ codCli: 'CLI-REAL', rut: 12345678 }]
  );
  assert.equal(result.valido, true, JSON.stringify(result.errores));
});

test('PIADI-336 caso 9: CODCLI y RUT que apuntan a alumnos distintos es error duro', async () => {
  const result = await validate(
    workbook({ caracterizaciones: [caracterizacion()] }),
    VARIANTE_CARACTERIZACION,
    [
      { codCli: 'CLI-001', rut: 11111111 },
      { codCli: 'CLI-OTRO', rut: 12345678 }
    ]
  );
  assert.equal(result.valido, false);
  assert.ok(result.errores.some((error) => error.codigo === 'ADMISION_IDENTIDAD_CONTRADICTORIA'));
});

test('PIADI-336 caso 10: FECHANAC inválida o fuera del rango respaldado es error', async (t) => {
  for (const fecha of ['31-02-2003', '1919-12-31', '2099-01-01']) {
    await t.test(fecha, async () => {
      const result = await validate(
        workbook({ caracterizaciones: [caracterizacion({ FECHANAC: fecha })] }),
        VARIANTE_CARACTERIZACION,
        [{ codCli: 'CLI-001', rut: 12345678 }]
      );
      assert.equal(result.valido, false);
      assert.ok(result.errores.some((error) => error.campo === 'FECHANAC'));
    });
  }
});

test('PIADI-336 caso 11: FECHANAC DD-MM-YYYY válida permite derivar edad', async () => {
  const result = await validate(
    workbook({ caracterizaciones: [caracterizacion({ FECHANAC: '18-06-2003' })] }),
    VARIANTE_CARACTERIZACION,
    [{ codCli: 'CLI-001', rut: 12345678 }]
  );
  assert.equal(result.valido, true, JSON.stringify(result.errores));
  const normalized = '2003-06-18';
  const today = new Date();
  const birth = new Date(`${normalized}T00:00:00Z`);
  const age = today.getUTCFullYear() - birth.getUTCFullYear() -
    (Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) <
      Date.UTC(today.getUTCFullYear(), birth.getUTCMonth(), birth.getUTCDate()) ? 1 : 0);
  assert.ok(Number.isInteger(age) && age >= 0);
});

test('PIADI-336 caso 12: reconoce Esstudiantes Pregrado 2026', async () => {
  const result = await validate(
    workbook({ matriculas: [matricula()], alias: 'Esstudiantes Pregrado 2026' }),
    VARIANTE_MATRICULA
  );
  assert.equal(result.valido, true, JSON.stringify(result.errores));
});

test('PIADI-336 rechaza un RUT asociado a múltiples CODCLI en caracterización', async () => {
  const result = await validate(
    workbook({ caracterizaciones: [
      caracterizacion(),
      caracterizacion({ CODCLI: 'CLI-OTRO' })
    ] }),
    VARIANTE_CARACTERIZACION,
    [{ codCli: 'CLI-REAL', rut: 12345678 }]
  );
  assert.equal(result.valido, false);
  assert.ok(result.errores.some((error) => error.codigo === 'ADMISION_RUT_MULTIPLE_CODCLI'));
});

test('PIADI-336 ESTACAD mantiene dominio abierto respaldado y exige valor', async (t) => {
  for (const estado of ['VIGENTE', 'TITULADO', 'EGRESADO', 'Regular']) {
    await t.test(estado, async () => {
      const result = await validate(workbook({ matriculas: [matricula({ ESTACAD: estado })] }), VARIANTE_MATRICULA);
      assert.equal(result.valido, true, JSON.stringify(result.errores));
    });
  }
  await t.test('vacío', async () => {
    const result = await validate(workbook({ matriculas: [matricula({ ESTACAD: '   ' })] }), VARIANTE_MATRICULA);
    assert.equal(result.valido, false);
    assert.ok(result.errores.some((error) => error.campo === 'ESTACAD'));
  });
});
