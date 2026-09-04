process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const XLSX = require('xlsx');
const models = require('../src/models');
const { validarArchivo } = require('../src/services/carga/validacionService');
const {
  PROYECTOS_SHEET,
  FINANCIAMIENTO_SHEET,
  SECCIONES_SHEET,
  projectFields,
  financingFields,
  sectionFields,
  createInnovationFields
} = require('../src/config/plantillaInnovacion');

const TEMPLATE_ID = 3;
const originalFindAll = models.CampoPlantilla.findAll;

const projectValues = {
  'ID Proyecto': 'INN-VAL-001',
  'Tipo proyecto': 'Institucional',
  'Año inicio': 2026,
  'Año término': 2026,
  'Semestre inicio': '1',
  'Nombre del proyecto': 'Proyecto validación PIADI-274',
  'Área temática': 'Innovación institucional',
  'Curso/Línea': 'Transformación digital',
  Estado: 'En Curso',
  'Responsable/Docente': 'Ana Pérez',
  'Unidad responsable': 'Dirección de Innovación',
  'Socio/contraparte': 'CORFO',
  'Financiamiento Externo': 'Fondo concursable externo',
  'Resultado principal': 'Prototipo validado',
  'Evidencia principal': 'informe-validacion.pdf',
  'N° estudiantes': 4,
  'N° docentes': 1,
  'N° funcionarios': 0,
  'Fecha inicio': '01-03-2026',
  'Fecha cierre estimada': '15-12-2026',
  Observación: 'Datos válidos para certificar el motor'
};

const financingValues = {
  'ID Proyecto': 'INN-VAL-001',
  'Nombre proyecto': 'Proyecto validación PIADI-274',
  Fuente: 'CORFO',
  'Tipo financiamiento': 'Fondo concursable externo',
  'Monto adjudicado CLP': 10000000,
  'Monto ejecutado estimado CLP': 5000000,
  'Estado financiero': 'En ejecución',
  Observación: 'Financiamiento válido'
};

const sectionValues = {
  'ID Sección': 'SEC-INN-001',
  'Año': 2026,
  'Semestre': '1',
  'Curso': 'Emprendimiento e Innovación',
  'Carrera/Programa': 'Ingeniería Comercial',
  'Jornada': 'Diurna',
  'N° Estudiantes': 25,
  'N° Grupos/Proyectos': 5,
  'Docente': 'Prof. Juan Pérez',
  'Modalidad': 'Presencial',
  'Observación': 'Sección regular'
};

const sheetRows = (fields, values) => {
  const headers = fields.map(([column]) => column);
  return [headers, headers.map((header) => values[header])];
};

const validSheets = () => ({
  [PROYECTOS_SHEET]: sheetRows(projectFields, projectValues),
  [FINANCIAMIENTO_SHEET]: sheetRows(financingFields, financingValues),
  [SECCIONES_SHEET]: sheetRows(sectionFields, sectionValues)
});

const removeColumn = (rows, column) => {
  const index = rows[0].indexOf(column);
  assert.notEqual(index, -1, `La columna ${column} debe existir en el fixture base`);
  return rows.map((row) => row.filter((_, currentIndex) => currentIndex !== index));
};

const setCell = (rows, column, value) => {
  const index = rows[0].indexOf(column);
  assert.notEqual(index, -1, `La columna ${column} debe existir en el fixture base`);
  rows[1][index] = value;
};

const validateSheets = async (sheets) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'piadi-274-'));
  const filePath = path.join(directory, `validacion-innovacion-${process.pid}-${Date.now()}.xlsx`);
  const workbook = XLSX.utils.book_new();

  try {
    for (const [sheetName, rows] of Object.entries(sheets)) {
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), sheetName);
    }
    XLSX.writeFile(workbook, filePath);
    const result = await validarArchivo(filePath, TEMPLATE_ID);
    return { result, filePath };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
};

const findError = (result, sheet, field) => result.errores.find((error) =>
  error.hoja === sheet && (field === undefined || error.campo === field)
);

test.beforeEach(() => {
  models.CampoPlantilla.findAll = async () => createInnovationFields(TEMPLATE_ID);
});

test.after(() => {
  models.CampoPlantilla.findAll = originalFindAll;
});

test('1. archivo correcto de Innovación valida las tres hojas sin errores', async () => {
  const { result, filePath } = await validateSheets(validSheets());
  assert.equal(result.valido, true);
  assert.deepEqual(result.errores, []);
  assert.deepEqual(Object.keys(result.hojasEsperadas), [PROYECTOS_SHEET, FINANCIAMIENTO_SHEET, SECCIONES_SHEET]);
  assert.equal(fs.existsSync(filePath), false);
});

test('2. detecta que falta la hoja Proyectos Innovación', async () => {
  const sheets = validSheets();
  delete sheets[PROYECTOS_SHEET];
  const { result } = await validateSheets(sheets);
  const error = findError(result, PROYECTOS_SHEET);

  assert.equal(result.valido, false);
  assert.equal(error.hoja, PROYECTOS_SHEET);
  assert.match(error.mensaje, /no existe en el archivo/);
  assert.equal(error.campo, undefined);
});

test('3. detecta que falta la hoja Financiamiento', async () => {
  const sheets = validSheets();
  delete sheets[FINANCIAMIENTO_SHEET];
  const { result } = await validateSheets(sheets);
  const error = findError(result, FINANCIAMIENTO_SHEET);

  assert.equal(result.valido, false);
  assert.equal(error.hoja, FINANCIAMIENTO_SHEET);
  assert.match(error.mensaje, /no existe en el archivo/);
  assert.equal(error.campo, undefined);
});

test('3.1 detecta que falta la hoja Secciones cursos', async () => {
  const sheets = validSheets();
  delete sheets[SECCIONES_SHEET];
  const { result } = await validateSheets(sheets);
  const error = findError(result, SECCIONES_SHEET);

  assert.equal(result.valido, false);
  assert.equal(error.hoja, SECCIONES_SHEET);
  assert.match(error.mensaje, /no existe en el archivo/);
  assert.equal(error.campo, undefined);
});

test('4. detecta una columna requerida faltante en Proyectos Innovación', async () => {
  const sheets = validSheets();
  sheets[PROYECTOS_SHEET] = removeColumn(sheets[PROYECTOS_SHEET], 'ID Proyecto');
  const { result } = await validateSheets(sheets);
  const error = findError(result, PROYECTOS_SHEET, 'ID Proyecto');

  assert.equal(result.valido, false);
  assert.equal(error.hoja, PROYECTOS_SHEET);
  assert.equal(error.campo, 'ID Proyecto');
  assert.match(error.mensaje, /columna requerida ID Proyecto no existe/);
});

test('5. detecta una celda requerida vacía e informa hoja, campo y fila', async () => {
  const sheets = validSheets();
  setCell(sheets[PROYECTOS_SHEET], 'ID Proyecto', '   ');
  const { result } = await validateSheets(sheets);
  const error = findError(result, PROYECTOS_SHEET, 'ID Proyecto');

  assert.equal(result.valido, false);
  assert.equal(error.hoja, PROYECTOS_SHEET);
  assert.equal(error.campo, 'ID Proyecto');
  assert.equal(error.fila, 2);
  assert.match(error.mensaje, /está vacío/);
});

test('6. detecta tipo incorrecto en N° estudiantes', async () => {
  const sheets = validSheets();
  setCell(sheets[PROYECTOS_SHEET], 'N° estudiantes', 'texto-invalido');
  const { result } = await validateSheets(sheets);
  const error = findError(result, PROYECTOS_SHEET, 'N° estudiantes');

  assert.equal(result.valido, false);
  assert.equal(error.fila, 2);
  assert.match(error.mensaje, /N° estudiantes/);
  assert.match(error.mensaje, /número entero|number/);
});

test('7. detecta tipo incorrecto en Monto adjudicado CLP', async () => {
  const sheets = validSheets();
  setCell(sheets[FINANCIAMIENTO_SHEET], 'Monto adjudicado CLP', 'texto-invalido');
  const { result } = await validateSheets(sheets);
  const error = findError(result, FINANCIAMIENTO_SHEET, 'Monto adjudicado CLP');

  assert.equal(result.valido, false);
  assert.equal(error.fila, 2);
  assert.match(error.mensaje, /Monto adjudicado CLP/);
  assert.match(error.mensaje, /número entero|number/);
});

test('8. acepta cero en los tres contadores requeridos de participantes', async () => {
  const sheets = validSheets();
  setCell(sheets[PROYECTOS_SHEET], 'N° estudiantes', 0);
  setCell(sheets[PROYECTOS_SHEET], 'N° docentes', 0);
  setCell(sheets[PROYECTOS_SHEET], 'N° funcionarios', 0);
  const { result } = await validateSheets(sheets);

  assert.equal(result.valido, true);
  assert.equal(result.errores.some((error) => ['N° estudiantes', 'N° docentes', 'N° funcionarios'].includes(error.campo)), false);
});

test('9. los errores usan el encabezado Excel y no el campo backend', async () => {
  const sheets = validSheets();
  setCell(sheets[PROYECTOS_SHEET], 'N° estudiantes', 'texto-invalido');
  const { result } = await validateSheets(sheets);
  const error = findError(result, PROYECTOS_SHEET, 'N° estudiantes');

  assert.equal(error.campo, 'N° estudiantes');
  assert.match(error.mensaje, /N° estudiantes/);
  assert.doesNotMatch(error.mensaje, /nEstudiantes/);
});

test('10. detecta una columna requerida faltante en Financiamiento', async () => {
  const sheets = validSheets();
  sheets[FINANCIAMIENTO_SHEET] = removeColumn(sheets[FINANCIAMIENTO_SHEET], 'Monto adjudicado CLP');
  const { result } = await validateSheets(sheets);
  const error = findError(result, FINANCIAMIENTO_SHEET, 'Monto adjudicado CLP');

  assert.equal(result.valido, false);
  assert.equal(error.hoja, FINANCIAMIENTO_SHEET);
  assert.equal(error.campo, 'Monto adjudicado CLP');
  assert.match(error.mensaje, /columna requerida Monto adjudicado CLP no existe/);
});

test('11. detecta una columna requerida faltante en Secciones Cursos', async () => {
  const sheets = validSheets();
  sheets[SECCIONES_SHEET] = removeColumn(sheets[SECCIONES_SHEET], 'ID Sección');
  const { result } = await validateSheets(sheets);
  const error = findError(result, SECCIONES_SHEET, 'ID Sección');

  assert.equal(result.valido, false);
  assert.equal(error.hoja, SECCIONES_SHEET);
  assert.equal(error.campo, 'ID Sección');
  assert.match(error.mensaje, /columna requerida ID Sección no existe/);
});

test('12. valida como enteros Año, N° Estudiantes y N° Grupos/Proyectos', async () => {
  for (const column of ['Año', 'N° Estudiantes', 'N° Grupos/Proyectos']) {
    const sheets = validSheets();
    setCell(sheets[SECCIONES_SHEET], column, 'texto-invalido');
    const { result } = await validateSheets(sheets);
    const error = findError(result, SECCIONES_SHEET, column);
    assert.equal(result.valido, false);
    assert.match(error.mensaje, /número entero|number/);
  }
});
