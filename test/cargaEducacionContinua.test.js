process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const XLSX = require('xlsx');
const models = require('../src/models');
const plantillaService = require('../src/services/plantillaService');
const { procesarCarga } = require('../src/services/carga/cargaService');

const originales = [];
const temporales = [];

const stub = (object, key, value) => {
  originales.push([object, key, object[key]]);
  object[key] = value;
};

const campo = (hoja, columnaExcel, tabla, columnaDestino, orden, tipo = 'string', requerido = false, lookup = {}) => ({
  plantillaId: 3,
  nombre_campo: columnaExcel,
  columna_excel: columnaExcel,
  hoja_origen: hoja,
  tabla_destino: tabla,
  columna_destino: columnaDestino,
  tipo_dato: tipo,
  requerido,
  orden_insercion: orden,
  campo_lookup_tabla: lookup.tabla || null,
  campo_lookup_columna_db: lookup.columna || null,
  campo_lookup_retorno: lookup.retorno || null
});

const camposEducacionContinua = [
  // Orden 1 - Base Programas -> Programa
  campo('Base Programas', 'ID Programa', 'Programa', 'idPrograma', 1, 'string', true),
  campo('Base Programas', 'Nombre Programa', 'Programa', 'nombrePrograma', 1, 'string', true),
  campo('Base Programas', 'Tipo Programa', 'Programa', 'tipoPrograma', 1, 'string', true),
  campo('Base Programas', 'Año', 'Programa', 'anio', 1, 'number', true),
  campo('Base Programas', 'Semestre', 'Programa', 'semestre', 1, 'string', true),
  campo('Base Programas', 'Mes Inicio', 'Programa', 'mesInicio', 1, 'number', true),
  campo('Base Programas', 'Fecha Inicio', 'Programa', 'fechaInicio', 1, 'string', true),
  campo('Base Programas', 'Fecha Término', 'Programa', 'fechaTermino', 1, 'string', true),
  campo('Base Programas', 'Horas Cronológicas', 'Programa', 'horasCronologicas', 1, 'number', true),
  campo('Base Programas', 'Modalidad', 'Programa', 'modalidad', 1, 'string', true),
  campo('Base Programas', 'Formato', 'Programa', 'formato', 1, 'string', true),
  campo('Base Programas', 'Cupos Programados', 'Programa', 'cuposProgramados', 1, 'number', true),

  // Orden 2 - Base Programas -> ResultadosPrograma
  campo('Base Programas', 'ID Programa', 'ResultadosPrograma', 'idPrograma', 2, 'string', true, {
    tabla: 'Programa', columna: 'idPrograma', retorno: 'idPrograma'
  }),
  campo('Base Programas', 'Matrícula', 'ResultadosPrograma', 'matricula', 2, 'number', false),
  campo('Base Programas', 'Aprobados', 'ResultadosPrograma', 'aprobados', 2, 'number', false),
  campo('Base Programas', 'Reprobados', 'ResultadosPrograma', 'reprobados', 2, 'number', false),
  campo('Base Programas', 'Tasa Aprobación', 'ResultadosPrograma', 'tasaAprobacion', 2, 'number', false),
  campo('Base Programas', 'Estado', 'ResultadosPrograma', 'estado', 2, 'string', false),
  campo('Base Programas', 'Ejecutado', 'ResultadosPrograma', 'ejecutado', 2, 'string', false),

  // Orden 2 - Base Programas -> EstadoFinancieroPrograma
  campo('Base Programas', 'ID Programa', 'EstadoFinancieroPrograma', 'idPrograma', 2, 'string', true, {
    tabla: 'Programa', columna: 'idPrograma', retorno: 'idPrograma'
  }),
  campo('Base Programas', 'Valor Lista CLP', 'EstadoFinancieroPrograma', 'valorListaCLP', 2, 'number', false),
  campo('Base Programas', 'Descuento Promedio', 'EstadoFinancieroPrograma', 'descuentoPromedio', 2, 'number', false),
  campo('Base Programas', 'Ingresos Brutos CLP', 'EstadoFinancieroPrograma', 'ingresosBrutosCLP', 2, 'number', false),
  campo('Base Programas', 'Ingresos Netos CLP', 'EstadoFinancieroPrograma', 'ingresosNetosCLP', 2, 'number', false)
];

const hojasEducacionContinua = {
  'Base Programas': [
    [
      'ID Programa', 'Nombre Programa', 'Tipo Programa', 'Año', 'Semestre', 'Mes Inicio',
      'Fecha Inicio', 'Fecha Término', 'Horas Cronológicas', 'Modalidad', 'Formato', 'Cupos Programados',
      'Matrícula', 'Aprobados', 'Reprobados', 'Tasa Aprobación', 'Estado', 'Ejecutado',
      'Valor Lista CLP', 'Descuento Promedio', 'Ingresos Brutos CLP', 'Ingresos Netos CLP'
    ],
    [
      'PROG-001', 'Diplomado en Data Science', 'Diplomado', 2026, '1', 3,
      '2026-03-01', '2026-07-30', 120, 'Online', 'Sincrónico', 30,
      25, 20, 5, '80,00', 'Finalizado', 'Sí',
      '$1.500.000', '10%', '$37.500.000', '$33.750.000'
    ],
    [
      'PROG-002', 'Curso Excel Avanzado', 'Curso', 2026, '1', 4,
      '2026-04-01', '2026-05-30', 40, 'Presencial', 'Vespertino', 20,
      15, 14, 1, '93,33', 'Finalizado', 'Sí',
      '$200.000', '5%', '$3.000.000', '$2.850.000'
    ]
  ]
};

const crearExcelTemporal = (hojas) => {
  const wb = XLSX.utils.book_new();
  for (const [nombre, filas] of Object.entries(hojas)) {
    const ws = XLSX.utils.aoa_to_sheet(filas);
    XLSX.utils.book_append_sheet(wb, ws, nombre);
  }
  const ruta = path.join(os.tmpdir(), `test-ec-${Date.now()}-${Math.random().toString(16).slice(2)}.xlsx`);
  XLSX.writeFile(wb, ruta);
  temporales.push(ruta);
  return ruta;
};

test.afterEach(async () => {
  while (originales.length) {
    const [object, key, value] = originales.pop();
    object[key] = value;
  }
  while (temporales.length) {
    const file = temporales.pop();
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch (_) {}
  }
});

test('Carga Educación Continua: EstadoFinancieroPrograma procesa múltiples registros y sanitiza tipos numéricos y moneda', async (t) => {
  stub(plantillaService, 'obtenerPlantillaPorId', async () => ({
    id: 3,
    nombre: 'Plantilla Educación Continua',
    departmentId: 'educacion_continua',
    campos: camposEducacionContinua
  }));

  const mockTransaction = {
    commit: async () => {},
    rollback: async () => {}
  };

  stub(models.sequelize, 'transaction', async () => mockTransaction);
  stub(models.sequelize, 'query', async () => []);

  const bulkCreateCalls = {};
  for (const modelName of ['Programa', 'ResultadosPrograma', 'EstadoFinancieroPrograma']) {
    bulkCreateCalls[modelName] = [];
    if (models[modelName]) {
      stub(models[modelName], 'bulkCreate', async (rows) => {
        bulkCreateCalls[modelName].push(...rows);
        return rows.map((r, i) => ({ ...r, dataValues: { ...r, id: i + 1 } }));
      });
      stub(models[modelName], 'findAll', async () => []);
    }
  }

  const filePath = crearExcelTemporal(hojasEducacionContinua);
  const workbook = XLSX.readFile(filePath);

  const resultado = await procesarCarga(workbook, camposEducacionContinua);

  assert.equal(resultado.success, true);

  // Verificar que se insertaron 2 registros en Programa
  assert.equal(bulkCreateCalls.Programa.length, 2);
  assert.equal(bulkCreateCalls.Programa[0].idPrograma, 'PROG-001');
  assert.equal(bulkCreateCalls.Programa[1].idPrograma, 'PROG-002');

  // Verificar que se insertaron 2 registros en ResultadosPrograma y la tasa se convirtió a número
  assert.equal(bulkCreateCalls.ResultadosPrograma.length, 2);
  assert.equal(bulkCreateCalls.ResultadosPrograma[0].idPrograma, 'PROG-001');
  assert.equal(bulkCreateCalls.ResultadosPrograma[0].tasaAprobacion, 80.0);
  assert.equal(bulkCreateCalls.ResultadosPrograma[1].idPrograma, 'PROG-002');
  assert.equal(bulkCreateCalls.ResultadosPrograma[1].tasaAprobacion, 93.33);

  // Verificar que se insertaron 2 registros en EstadoFinancieroPrograma (no se colapsaron en 1)
  assert.equal(bulkCreateCalls.EstadoFinancieroPrograma.length, 2);

  const est1 = bulkCreateCalls.EstadoFinancieroPrograma.find(e => e.idPrograma === 'PROG-001');
  assert.ok(est1, 'Debe existir EstadoFinancieroPrograma para PROG-001');
  assert.equal(est1.valorListaCLP, 1500000);
  assert.equal(est1.descuentoPromedio, 10);
  assert.equal(est1.ingresosBrutosCLP, 37500000);
  assert.equal(est1.ingresosNetosCLP, 33750000);

  const est2 = bulkCreateCalls.EstadoFinancieroPrograma.find(e => e.idPrograma === 'PROG-002');
  assert.ok(est2, 'Debe existir EstadoFinancieroPrograma para PROG-002');
  assert.equal(est2.valorListaCLP, 200000);
  assert.equal(est2.descuentoPromedio, 5);
  assert.equal(est2.ingresosBrutosCLP, 3000000);
  assert.equal(est2.ingresosNetosCLP, 2850000);
});

test('Carga Educación Continua completa: procesa Base Programas y Participantes Detalle con 6 tablas y lookups en cascada', async (t) => {
  const camposCompletos = [
    ...camposEducacionContinua,
    // Orden 1 - Participantes Detalle -> AlumnoExterno
    campo('Participantes Detalle', 'ID Participante', 'AlumnoExterno', 'idParticipante', 1, 'string', true),
    campo('Participantes Detalle', 'RUT', 'AlumnoExterno', 'rut', 1, 'string', true),
    campo('Participantes Detalle', 'Nombre', 'AlumnoExterno', 'nombre', 1, 'string', true),
    campo('Participantes Detalle', 'Apellido Paterno', 'AlumnoExterno', 'apellidoPaterno', 1, 'string', true),

    // Orden 2 - Participantes Detalle -> MatriculaPrograma
    campo('Participantes Detalle', 'ID Inscripción', 'MatriculaPrograma', 'idInscripcion', 2, 'string', true),
    campo('Participantes Detalle', 'ID Programa', 'MatriculaPrograma', 'idPrograma', 2, 'string', true, {
      tabla: 'Programa', columna: 'idPrograma', retorno: 'idPrograma'
    }),
    campo('Participantes Detalle', 'ID Participante', 'MatriculaPrograma', 'idParticipante', 2, 'string', true, {
      tabla: 'AlumnoExterno', columna: 'idParticipante', retorno: 'idParticipante'
    }),
    campo('Participantes Detalle', 'Año', 'MatriculaPrograma', 'anio', 2, 'string', true),
    campo('Participantes Detalle', 'Semestre', 'MatriculaPrograma', 'semestre', 2, 'string', true),
    campo('Participantes Detalle', 'Mes inicio', 'MatriculaPrograma', 'mesInicio', 2, 'number', true),
    campo('Participantes Detalle', 'Edad', 'MatriculaPrograma', 'edadAlumno', 2, 'number', true),
    campo('Participantes Detalle', 'Rango Edad', 'MatriculaPrograma', 'rangoEdadAlumno', 2, 'string', true),
    campo('Participantes Detalle', 'Fecha matrícula', 'MatriculaPrograma', 'fechaMatricula', 2, 'string', true),

    // Orden 3 - Participantes Detalle -> EstadoMatricula
    campo('Participantes Detalle', 'ID Inscripción', 'EstadoMatricula', 'idInscripcion', 3, 'string', true, {
      tabla: 'MatriculaPrograma', columna: 'idInscripcion', retorno: 'idInscripcion'
    }),
    campo('Participantes Detalle', 'Estado académico', 'EstadoMatricula', 'estadoAcademico', 3, 'string', false),
    campo('Participantes Detalle', 'Aprobó', 'EstadoMatricula', 'aprobo', 3, 'string', false),
    campo('Participantes Detalle', 'Nota final', 'EstadoMatricula', 'notaFinal', 3, 'number', false),
    campo('Participantes Detalle', 'Asistencia %', 'EstadoMatricula', 'asistencia', 3, 'number', false)
  ];

  const hojasCompletas = {
    ...hojasEducacionContinua,
    'Participantes Detalle': [
      [
        'ID Inscripción', 'ID Programa', 'ID Participante', 'RUT', 'Nombre', 'Apellido Paterno',
        'Año', 'Semestre', 'Mes inicio', 'Edad', 'Rango Edad', 'Fecha matrícula',
        'Estado académico', 'Aprobó', 'Nota final', 'Asistencia %'
      ],
      [
        'INS-001', 'PROG-001', 'PART-001', '12.345.678-9', 'Juan', 'Perez',
        '2026', '1', 3, 30, '30-39', '2026-03-05',
        'Aprobado', 'Sí', '6.5', '95%'
      ],
      [
        'INS-002', 'PROG-001', 'PART-002', '98.765.432-1', 'Maria', 'Gonzalez',
        '2026', '1', 3, 28, '20-29', '2026-03-06',
        'Aprobado', 'Sí', '6.0', '90%'
      ]
    ]
  };

  const mockTransaction = {
    commit: async () => {},
    rollback: async () => {}
  };

  stub(models.sequelize, 'transaction', async () => mockTransaction);
  stub(models.sequelize, 'query', async () => []);

  const bulkCreateCalls = {};
  const allModels = ['Programa', 'ResultadosPrograma', 'EstadoFinancieroPrograma', 'AlumnoExterno', 'MatriculaPrograma', 'EstadoMatricula'];
  for (const modelName of allModels) {
    bulkCreateCalls[modelName] = [];
    if (models[modelName]) {
      stub(models[modelName], 'bulkCreate', async (rows) => {
        bulkCreateCalls[modelName].push(...rows);
        return rows.map((r, i) => ({ ...r, dataValues: { ...r, id: i + 1 } }));
      });
      stub(models[modelName], 'findAll', async () => []);
    }
  }

  const filePath = crearExcelTemporal(hojasCompletas);
  const workbook = XLSX.readFile(filePath);

  const resultado = await procesarCarga(workbook, camposCompletos);

  assert.equal(resultado.success, true);
  assert.equal(bulkCreateCalls.Programa.length, 2);
  assert.equal(bulkCreateCalls.ResultadosPrograma.length, 2);
  assert.equal(bulkCreateCalls.EstadoFinancieroPrograma.length, 2);
  assert.equal(bulkCreateCalls.AlumnoExterno.length, 2);
  assert.equal(bulkCreateCalls.MatriculaPrograma.length, 2);
  assert.equal(bulkCreateCalls.EstadoMatricula.length, 2);

  // Validar campos sanitizados en EstadoMatricula
  assert.equal(bulkCreateCalls.EstadoMatricula[0].asistencia, 95);
  assert.equal(bulkCreateCalls.EstadoMatricula[0].notaFinal, 6.5);
});
