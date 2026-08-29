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

const originales = [];
const temporales = [];

const stub = (object, key, value) => {
  originales.push([object, key, object[key]]);
  object[key] = value;
};

const campo = (hoja, columnaExcel, tabla, columnaDestino, orden, lookup = {}) => ({
  plantillaId: 2,
  nombre_campo: columnaExcel,
  columna_excel: columnaExcel,
  hoja_origen: hoja,
  tabla_destino: tabla,
  columna_destino: columnaDestino,
  tipo_dato: 'string',
  requerido: true,
  orden_insercion: orden,
  campo_lookup_tabla: lookup.tabla || null,
  campo_lookup_columna_db: lookup.columna || null,
  campo_lookup_retorno: lookup.retorno || null
});

const camposVcm = [
  campo('Convenios', 'ID Convenio', 'Convenio', 'idConvenio', 1),
  campo('Actividades VcM', 'ID Actividad', 'Actividad', 'idActividad', 2),
  campo('Actividades VcM', 'Convenio asociado', 'Actividad', 'idConvenio', 2, {
    tabla: 'Convenio', columna: 'idConvenio', retorno: 'idConvenio'
  }),
  campo('Participacion detalle', 'ID Participación', 'Participacion', 'idParticipacion', 3),
  campo('Participacion detalle', 'ID Actividad', 'Participacion', 'idActividad', 3, {
    tabla: 'Actividad', columna: 'idActividad', retorno: 'idActividad'
  })
];

const hojasVcm = {
  Convenios: [
    ['ID Convenio'],
    ['CON-A'],
    ['CON-B']
  ],
  'Actividades VcM': [
    ['ID Actividad', 'Convenio asociado'],
    ['ACT-A1', 'CON-A'],
    ['ACT-A2', 'CON-A'],
    ['ACT-B1', 'CON-B']
  ],
  'Participacion detalle': [
    ['ID Participación', 'ID Actividad'],
    ['PAR-1', 'ACT-A1'],
    ['PAR-2', 'ACT-A1'],
    ['PAR-3', 'ACT-A2'],
    ['PAR-4', 'ACT-B1'],
    ['PAR-5', 'ACT-B1']
  ]
};

const crearWorkbook = () => {
  const workbook = XLSX.utils.book_new();
  for (const [nombre, filas] of Object.entries(hojasVcm)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(filas), nombre);
  }
  return workbook;
};

const guardarWorkbookTemporal = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'piadi-240-'));
  const filePath = path.join(dir, 'plantilla-vcm.xlsx');
  XLSX.writeFile(crearWorkbook(), filePath);
  temporales.push(dir);
  return filePath;
};

const prepararPersistencia = ({ fallaEn } = {}) => {
  const transaction = {
    commitCalls: 0,
    rollbackCalls: 0,
    async commit() { this.commitCalls += 1; },
    async rollback() { this.rollbackCalls += 1; }
  };
  const insertados = { Convenio: [], Actividad: [], Participacion: [] };
  const operaciones = [];

  stub(models.sequelize, 'transaction', async () => transaction);
  stub(models.sequelize, 'query', async () => []);
  stub(models.CampoPlantilla, 'findAll', async () => camposVcm);

  for (const nombre of Object.keys(insertados)) {
    const Model = models[nombre];
    stub(Model, 'build', (registro) => ({
      ...registro,
      async validate() {}
    }));
    stub(Model, 'findAll', async (options) => {
      operaciones.push({ tipo: 'findAll', modelo: nombre, transaction: options.transaction });
      return insertados[nombre];
    });
    stub(Model, 'bulkCreate', async (registros, options) => {
      operaciones.push({ tipo: 'bulkCreate', modelo: nombre, registros, transaction: options.transaction });
      if (fallaEn === nombre) throw new Error(`Fallo controlado en ${nombre}`);
      const creados = registros.map((registro) => ({ ...registro, dataValues: { ...registro } }));
      insertados[nombre].push(...creados);
      return creados;
    });
  }

  return { transaction, insertados, operaciones };
};

test.afterEach(() => {
  while (originales.length) {
    const [object, key, value] = originales.pop();
    object[key] = value;
  }
  while (temporales.length) {
    fs.rmSync(temporales.pop(), { recursive: true, force: true });
  }
});

test('POST /cargar procesa XLSX VCM con 2 convenios, 3 actividades, 5 participaciones y lookups', async () => {
  const persistencia = prepararPersistencia();
  const req = { params: { id: '2' }, file: { path: guardarWorkbookTemporal() } };
  let respuesta;
  const res = { json(payload) { respuesta = payload; return this; } };

  await plantillaController.cargarArchivo(req, res, (error) => { throw error; });

  assert.equal(respuesta.success, true);
  assert.deepEqual(respuesta.resumen, { Convenio: 2, Actividad: 3, Participacion: 5 });
  assert.equal(persistencia.insertados.Convenio.length, 2);
  assert.equal(persistencia.insertados.Actividad.length, 3);
  assert.equal(persistencia.insertados.Participacion.length, 5);
  assert.deepEqual(persistencia.insertados.Actividad.map((fila) => fila.idConvenio), ['CON-A', 'CON-A', 'CON-B']);
  assert.deepEqual(persistencia.insertados.Participacion.map((fila) => fila.idActividad), ['ACT-A1', 'ACT-A1', 'ACT-A2', 'ACT-B1', 'ACT-B1']);
  assert.equal(persistencia.transaction.commitCalls, 1);
  assert.equal(persistencia.transaction.rollbackCalls, 0);
  assert.ok(persistencia.operaciones.every((operacion) => operacion.transaction === persistencia.transaction));
});

test('rollback revierte la carga completa cuando falla Participacion', async () => {
  const persistencia = prepararPersistencia({ fallaEn: 'Participacion' });

  await assert.rejects(
    procesarCarga(crearWorkbook(), camposVcm),
    /Fallo controlado en Participacion/
  );

  assert.equal(persistencia.insertados.Convenio.length, 2);
  assert.equal(persistencia.insertados.Actividad.length, 3);
  assert.equal(persistencia.transaction.commitCalls, 0);
  assert.equal(persistencia.transaction.rollbackCalls, 1);
  assert.ok(persistencia.operaciones.every((operacion) => operacion.transaction === persistencia.transaction));
});

test('GET /descargar retorna el buffer y headers del XLSX de la plantilla VCM', async () => {
  const archivoData = XLSX.write(crearWorkbook(), { type: 'buffer', bookType: 'xlsx' });
  let idConsultado;
  stub(plantillaService, 'getPlantillaWithArchivo', async (id) => {
    idConsultado = id;
    return {
      id: 2,
      name: 'Vinculación Con El Medio',
      archivoNombre: 'plantilla-vcm.xlsx',
      archivoData
    };
  });

  const headers = {};
  let contenido;
  const req = { params: { id: '2' } };
  const res = {
    setHeader(nombre, valor) { headers[nombre] = valor; },
    send(valor) { contenido = valor; return this; }
  };

  await plantillaController.descargarExcel(req, res, (error) => { throw error; });

  assert.equal(idConsultado, '2');
  assert.equal(headers['Content-Type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(headers['Content-Disposition'], 'attachment; filename=plantilla-vcm.xlsx');
  assert.strictEqual(contenido, archivoData);
});
