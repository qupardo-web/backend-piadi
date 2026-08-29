process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const XLSX = require('xlsx');
const { DataTypes } = require('sequelize');
const models = require('../src/models');
const { validarArchivo } = require('../src/services/carga/validacionService');

const MODEL_NAME = 'Piadi246ValidationFixture';
const originalFindAll = models.CampoPlantilla.findAll;

if (!models.sequelize.models[MODEL_NAME]) {
  models.sequelize.define(MODEL_NAME, {
    idConvenio: DataTypes.STRING,
    anioFirma: DataTypes.INTEGER,
    idActividad: DataTypes.STRING,
    horas: DataTypes.INTEGER,
    observacion: DataTypes.STRING,
    idParticipacion: DataTypes.STRING,
    totalPersonas: DataTypes.INTEGER,
    idArticulacion: DataTypes.STRING
  }, { timestamps: false });
}

const campo = (hoja, columnaExcel, columnaDestino, tipoDato, requerido = true) => ({
  plantillaId: 2,
  nombre_campo: columnaExcel,
  columna_excel: columnaExcel,
  hoja_origen: hoja,
  tabla_destino: MODEL_NAME,
  columna_destino: columnaDestino,
  tipo_dato: tipoDato,
  requerido,
  orden_insercion: 1
});

const configuracionVcm = [
  campo('Convenios', 'ID Convenio', 'idConvenio', 'string'),
  campo('Convenios', 'Año firma', 'anioFirma', 'number'),
  campo('Actividades VcM', 'ID Actividad', 'idActividad', 'string'),
  campo('Actividades VcM', 'Horas', 'horas', 'number'),
  campo('Actividades VcM', 'Observación', 'observacion', 'string', false),
  campo('Participacion detalle', 'ID Participación', 'idParticipacion', 'string'),
  campo('Participacion detalle', 'Total personas', 'totalPersonas', 'number'),
  campo('Articulaciones TP', 'ID Articulación', 'idArticulacion', 'string')
];

const hojasValidas = () => ({
  Convenios: [['ID Convenio', 'Año firma'], ['CON-1', 2026]],
  'Actividades VcM': [['ID Actividad', 'Horas', 'Observación'], ['ACT-1', 8, null]],
  'Participacion detalle': [['ID Participación', 'Total personas'], ['PAR-1', 5]],
  'Articulaciones TP': [['ID Articulación'], ['ART-1']]
});

const crearXlsxTemporal = (hojas) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'piadi-246-'));
  const filePath = path.join(dir, 'vcm.xlsx');
  const workbook = XLSX.utils.book_new();
  for (const [nombre, filas] of Object.entries(hojas)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(filas), nombre);
  }
  XLSX.writeFile(workbook, filePath);
  return { dir, filePath };
};

const validarHojas = async (hojas) => {
  const temporal = crearXlsxTemporal(hojas);
  try {
    return await validarArchivo(temporal.filePath, 2);
  } finally {
    fs.rmSync(temporal.dir, { recursive: true, force: true });
  }
};

test.beforeEach(() => {
  models.CampoPlantilla.findAll = async () => configuracionVcm;
});

test.after(() => {
  models.CampoPlantilla.findAll = originalFindAll;
});

test('archivo VCM correcto acepta tipos string y number sin errores', async () => {
  const resultado = await validarHojas(hojasValidas());
  assert.equal(resultado.valido, true);
  assert.deepEqual(resultado.errores, []);
});

test('detecta una hoja requerida faltante e identifica la hoja', async () => {
  const hojas = hojasValidas();
  delete hojas['Participacion detalle'];
  const resultado = await validarHojas(hojas);
  assert.equal(resultado.valido, false);
  assert.ok(resultado.errores.some((error) => error.hoja === 'Participacion detalle'));
});

test('detecta una columna requerida faltante con hoja y columna Excel', async () => {
  const hojas = hojasValidas();
  hojas.Convenios = [['ID Convenio'], ['CON-1']];
  const resultado = await validarHojas(hojas);
  assert.equal(resultado.valido, false);
  assert.ok(resultado.errores.some((error) => error.hoja === 'Convenios' && error.campo === 'Año firma'));
});

test('detecta una celda obligatoria con espacios sin duplicar error de tipo', async () => {
  const hojas = hojasValidas();
  hojas['Actividades VcM'][1][1] = '   ';
  const resultado = await validarHojas(hojas);
  const erroresHoras = resultado.errores.filter((error) => error.hoja === 'Actividades VcM' && error.campo === 'Horas');
  assert.equal(resultado.valido, false);
  assert.equal(erroresHoras.length, 1);
  assert.match(erroresHoras[0].mensaje, /está vacío/);
});

test('rechaza texto en un campo number e informa hoja, columna y fila', async () => {
  const hojas = hojasValidas();
  hojas['Actividades VcM'][1][1] = 'texto';
  const resultado = await validarHojas(hojas);
  const error = resultado.errores.find((item) => item.hoja === 'Actividades VcM' && item.campo === 'Horas');
  assert.equal(resultado.valido, false);
  assert.equal(error.fila, 2);
  assert.match(error.mensaje, /tipo number/);
});

test('acepta una cadena numérica no vacía para un campo number', async () => {
  const hojas = hojasValidas();
  hojas['Actividades VcM'][1][1] = '12.5';
  const resultado = await validarHojas(hojas);
  assert.equal(resultado.valido, true);
});

test('un campo string opcional vacío no genera error de tipo', async () => {
  const resultado = await validarHojas(hojasValidas());
  assert.equal(resultado.errores.some((error) => error.campo === 'Observación'), false);
});
