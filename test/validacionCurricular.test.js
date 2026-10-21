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
const { obtenerValidador, defaultValidation, curricularValidation } = require('../src/services/carga/validadores');
const { createAdmisionFields, VARIANTE_COMBINADA } = require('../src/config/plantillaAdmision');

const headers = {
  'Rendimiento Academico': ['CODCLI', 'RAMOEQUIV', 'ASIGNATURA', 'AÑO', 'PERIODO', 'SECCION', 'ESTADO_ASIGNATURA', 'NOTA'],
  Practicas: ['CODCLI', 'TIPO_PRACTICA', 'AÑO', 'PERIODO', 'ESTADO', 'FECHA'],
  Titulacion: ['CODCLI', 'COHORTE', 'AÑO_TITULACION', 'SEMESTRES_CURSADOS', 'TIEMPO_NORMATIVO']
};
const tables = {
  'Rendimiento Academico': 'RendimientoAsignatura',
  Practicas: 'Practica',
  Titulacion: 'Titulacion'
};
const destinations = {
  CODCLI: 'codCli', RAMOEQUIV: 'ramoEquiv', ASIGNATURA: 'asignatura',
  'AÑO': 'anio', PERIODO: 'periodo', SECCION: 'seccion',
  ESTADO_ASIGNATURA: 'estadoAsignatura', NOTA: 'notaFinal',
  TIPO_PRACTICA: 'tipoPractica', ESTADO: 'estado', FECHA: '__fechaSinDestino',
  COHORTE: 'cohorte', AÑO_TITULACION: 'anioTitulacion',
  SEMESTRES_CURSADOS: 'semestresCursados', TIEMPO_NORMATIVO: 'tiempoNormativo'
};

const fields = () => Object.entries(headers).flatMap(([sheet, columns]) => columns.map((column) => ({
  plantillaId: 302,
  hoja_origen: sheet,
  columna_excel: column,
  tabla_destino: tables[sheet],
  columna_destino: destinations[column],
  tipo_dato: ['AÑO', 'PERIODO', 'SECCION', 'COHORTE', 'AÑO_TITULACION', 'SEMESTRES_CURSADOS', 'TIEMPO_NORMATIVO', 'NOTA'].includes(column)
    ? 'number' : column === 'FECHA' ? 'date' : 'string',
  requerido: true
})));

const rendimiento = (overrides = {}) => ({
  CODCLI: 'CLI-FICTICIO', RAMOEQUIV: 'RAMO-FICTICIO', ASIGNATURA: 'Asignatura ficticia',
  'AÑO': 2026, PERIODO: 1, SECCION: 1, ESTADO_ASIGNATURA: 'APROBADO', NOTA: 7,
  ...overrides
});
const practica = (overrides = {}) => ({
  CODCLI: 'CLI-FICTICIO', TIPO_PRACTICA: 'Práctica ficticia', 'AÑO': 2026,
  PERIODO: 1, ESTADO: 'INSCRITA', FECHA: '20-10-2026', ...overrides
});
const titulacion = (overrides = {}) => ({
  CODCLI: 'CLI-FICTICIO', COHORTE: 2021, AÑO_TITULACION: 2026,
  SEMESTRES_CURSADOS: 10, TIEMPO_NORMATIVO: 8, ...overrides
});

const resolved = (sheet, rows) => ({
  nombreReal: sheet,
  filas: rows,
  columnas: headers[sheet],
  campos: fields().filter((field) => field.hoja_origen === sheet),
  resolverColumna: (column) => headers[sheet].includes(column) ? column : null
});
const allResolved = ({ rendimientos = [rendimiento()], practicas = [practica()], titulaciones = [titulacion()] } = {}) =>
  new Map([
    ['Rendimiento Academico', resolved('Rendimiento Academico', rendimientos)],
    ['Practicas', resolved('Practicas', practicas)],
    ['Titulacion', resolved('Titulacion', titulaciones)]
  ]);

const referenceModels = ({ students = [{ codCli: 'CLI-FICTICIO', rut: 12345678 }],
  subjects = [{ ramoEquiv: 'RAMO-FICTICIO', nombre: 'Asignatura ficticia' }],
  enrollments = [{ codCli: 'CLI-FICTICIO', ramoEquiv: 'RAMO-FICTICIO', anio: 2026, periodo: 1 }] } = {}) => {
  const calls = { students: 0, subjects: 0, enrollments: 0 };
  return {
    calls,
    models: {
      Alumno: { async findAll() { calls.students++; return students; } },
      Asignatura: { async findAll() { calls.subjects++; return subjects; } },
      MatriculaPorAsignatura: { async findAll() { calls.enrollments++; return enrollments; } }
    }
  };
};

const value = (column, input, sheet = 'Rendimiento Academico') => {
  const campo = { columna_excel: column, tabla_destino: tables[sheet] };
  const normalized = curricularValidation.normalizarValor({ valor: input, campo });
  const type = curricularValidation.validarValor({ valor: normalized, campo }) || { valido: true, valor: normalized };
  return { normalized, type, semantic: type.valido
    ? curricularValidation.validarSemantica({ valor: type.valor, campo, hoja: sheet, fila: 2, celda: 'A2', serializarValor: String })
    : [] };
};

test('selección curricular exige las tres hojas y tablas correctas; no captura otros módulos', () => {
  assert.equal(obtenerValidador({ campos: fields() }), curricularValidation);
  assert.equal(obtenerValidador({ campos: createAdmisionFields(1, VARIANTE_COMBINADA) }).nombre, 'admision');
  assert.equal(obtenerValidador({ campos: fields().filter((field) => field.hoja_origen !== 'Titulacion') }), defaultValidation);
  assert.equal(obtenerValidador({ campos: [{ tabla_destino: 'Convenio', columna_excel: 'Nombre' }] }), defaultValidation);
});

test('plantilla curricular reconoce exactamente las tres hojas y detecta hojas ambiguas', () => {
  const names = Object.keys(headers);
  const prepared = curricularValidation.prepare({ workbook: { SheetNames: names }, nombresHojas: names });
  assert.deepEqual([...prepared.resoluciones.values()].map((item) => item.nombre), names);
  assert.equal(prepared.errores.length, 0);
  const ambiguous = curricularValidation.prepare({
    workbook: { SheetNames: [...names, 'practicas '] }, nombresHojas: names
  });
  assert.equal(ambiguous.resoluciones.get('Practicas').nombre, null);
  assert.equal(ambiguous.errores.length, 1);
});

test('NOTA acepta 1.0 y 7.0, punto y coma decimal no ambiguos', () => {
  for (const input of [1, 7, '1.0', '7,0', '6,5']) {
    const result = value('NOTA', input);
    assert.equal(result.type.valido, true, String(input));
    assert.deepEqual(result.semantic, []);
  }
  for (const input of [0.9, 7.1, 'texto', Infinity, '1,000', '1.000', '6,55']) {
    const result = value('NOTA', input);
    assert.equal(result.type?.valido === false || result.semantic.length > 0, true, String(input));
  }
});

test('estados curriculares aceptan solo los dominios explícitos', () => {
  assert.deepEqual(value('ESTADO_ASIGNATURA', ' aprobado ').semantic, []);
  assert.deepEqual(value('ESTADO', ' aprobada ', 'Practicas').semantic, []);
  assert.deepEqual(value('ESTADO', 'INSCRITA', 'Practicas').semantic, []);
  assert.equal(value('ESTADO_ASIGNATURA', 'PENDIENTE').semantic.length, 1);
  assert.equal(value('ESTADO', 'REPROBADA', 'Practicas').semantic.length, 1);
});

test('año, período, sección y duraciones siguen restricciones curriculares', () => {
  for (const [column, input, sheet] of [
    ['AÑO', 1989, 'Practicas'], ['AÑO', 2101, 'Practicas'], ['PERIODO', 3, 'Practicas'],
    ['SECCION', 0, 'Rendimiento Academico'], ['COHORTE', 1989, 'Titulacion'],
    ['SEMESTRES_CURSADOS', 0, 'Titulacion'], ['TIEMPO_NORMATIVO', -1, 'Titulacion']
  ]) assert.equal(value(column, input, sheet).semantic.length, 1, `${column}: ${input}`);
  assert.equal(value('PERIODO', 1.5, 'Practicas').type.valido, false);
  assert.deepEqual(value('PERIODO', 2, 'Practicas').semantic, []);
});

test('FECHA valida texto DD-MM-YYYY, ISO y fechas imposibles sin asignar destino', () => {
  assert.equal(value('FECHA', '20-10-2026', 'Practicas').type.valido, true);
  assert.equal(value('FECHA', '2026-10-20', 'Practicas').type.valido, true);
  assert.equal(value('FECHA', '31-02-2026', 'Practicas').type.valido, false);
  assert.equal(value('FECHA', 'texto', 'Practicas').type.valido, false);
  assert.equal(destinations.FECHA, '__fechaSinDestino');
});

test('referencias se resuelven en tres lotes de sólo lectura', async () => {
  const references = referenceModels();
  const result = await curricularValidation.validateSpecific({ hojasResueltas: allResolved(), models: references.models });
  assert.deepEqual(references.calls, { students: 1, subjects: 1, enrollments: 1 });
  assert.equal(result.errores.filter((error) => error.codigo?.startsWith('CURRICULAR_CODCLI')).length, 0);
  assert.equal(result.errores.filter((error) => error.codigo?.includes('RAMOEQUIV') || error.codigo?.includes('MATRICULA')).length, 0);
  assert.ok(result.errores.some((error) => error.codigo === 'CURRICULAR_PERIODO_TITULACION_NO_DEFINIDO'));
  assert.equal(result.advertencias.length, 0);
});

test('CODCLI inexistente, ambiguo y sin RUT válido producen errores por fila', async () => {
  for (const [students, code] of [
    [[], 'CURRICULAR_CODCLI_INEXISTENTE'],
    [[{ codCli: 'CLI-FICTICIO', rut: 12345678 }, { codCli: 'CLI-FICTICIO', rut: 87654321 }], 'CURRICULAR_CODCLI_AMBIGUO'],
    [[{ codCli: 'CLI-FICTICIO', rut: null }], 'CURRICULAR_CODCLI_SIN_RUT']
  ]) {
    const result = await curricularValidation.validateSpecific({
      hojasResueltas: allResolved(), models: referenceModels({ students }).models
    });
    const finding = result.errores.find((error) => error.codigo === code);
    assert.equal(finding.hoja, 'Rendimiento Academico');
    assert.equal(finding.fila, 2);
    assert.equal(finding.campo, 'CODCLI');
    assert.equal(finding.celda, 'A2');
  }
});

test('RAMOEQUIV y matrícula se verifican por estudiante, asignatura, año y período', async () => {
  const unknown = await curricularValidation.validateSpecific({
    hojasResueltas: allResolved(), models: referenceModels({ subjects: [] }).models
  });
  assert.ok(unknown.errores.some((error) => error.codigo === 'CURRICULAR_RAMOEQUIV_INEXISTENTE'));
  const unenrolled = await curricularValidation.validateSpecific({
    hojasResueltas: allResolved(), models: referenceModels({ enrollments: [] }).models
  });
  assert.ok(unenrolled.errores.some((error) => error.codigo === 'CURRICULAR_MATRICULA_ASIGNATURA_INEXISTENTE'));
  const wrongPeriod = await curricularValidation.validateSpecific({
    hojasResueltas: allResolved(), models: referenceModels({ enrollments: [
      { codCli: 'CLI-FICTICIO', ramoEquiv: 'RAMO-FICTICIO', anio: 2026, periodo: 2 }
    ] }).models
  });
  assert.ok(wrongPeriod.errores.some((error) => error.codigo === 'CURRICULAR_MATRICULA_ASIGNATURA_INEXISTENTE'));
});

test('titulación anterior a cohorte informa celda y no inventa PERIODO', async () => {
  const result = await curricularValidation.validateSpecific({
    hojasResueltas: allResolved({ titulaciones: [titulacion({ COHORTE: 2026, AÑO_TITULACION: 2025 })] }),
    models: referenceModels().models
  });
  const finding = result.errores.find((error) => error.codigo === 'CURRICULAR_TITULACION_ANTERIOR_COHORTE');
  assert.equal(finding.celda, 'C2');
  assert.ok(result.errores.some((error) => error.codigo === 'CURRICULAR_PERIODO_TITULACION_NO_DEFINIDO'));
});

test('duplicados de rendimiento obedecen índice único; prácticas solo advierten sin política', async () => {
  const duplicate = curricularValidation.validarHoja({
    nombreEsperado: 'Rendimiento Academico', nombreReal: 'Rendimiento Academico',
    filas: [rendimiento(), rendimiento({ SECCION: 2, NOTA: 5 })],
    resolverColumna: (column) => column
  });
  assert.equal(duplicate.length, 1);
  assert.equal(duplicate[0].codigo, 'CURRICULAR_RENDIMIENTO_CONFLICTO');
  assert.equal(duplicate[0].fila, 3);
  const result = await curricularValidation.validateSpecific({
    hojasResueltas: allResolved({ practicas: [practica(), practica()] }), models: referenceModels().models
  });
  assert.equal(result.advertencias.length, 1);
  assert.equal(result.advertencias[0].codigo, 'CURRICULAR_PRACTICA_DUPLICADO');
});

test('si la consulta referencial falla no se presenta como referencia válida', async () => {
  const refs = referenceModels();
  refs.models.Alumno.findAll = async () => { throw new Error('sin PostgreSQL'); };
  const result = await curricularValidation.validateSpecific({ hojasResueltas: allResolved(), models: refs.models });
  assert.ok(result.errores.some((error) => error.codigo === 'CURRICULAR_REFERENCIAS_NO_VERIFICADAS'));
});

test('validarArchivo usa el validador curricular y detecta columna requerida faltante', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'piadi-302-'));
  const filename = path.join(directory, 'curricular-sintetico.xlsx');
  const originalFindAll = models.CampoPlantilla.findAll;
  try {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([rendimiento()], { header: headers['Rendimiento Academico'] }), 'Rendimiento Academico');
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([practica()], { header: headers.Practicas }), 'Practicas');
    const title = XLSX.utils.aoa_to_sheet([
      headers.Titulacion.filter((column) => column !== 'COHORTE'),
      ['CLI-FICTICIO', 2026, 10, 8]
    ]);
    XLSX.utils.book_append_sheet(book, title, 'Titulacion');
    XLSX.writeFile(book, filename);
    models.CampoPlantilla.findAll = async () => fields();
    const result = await validarArchivo(filename, 302);
    assert.equal(result.valido, false);
    assert.ok(result.errores.some((error) => error.hoja === 'Titulacion' && error.campo === 'COHORTE'));
    assert.ok(result.errores.some((error) => error.codigo === 'CURRICULAR_PERIODO_TITULACION_NO_DEFINIDO'));
  } finally {
    models.CampoPlantilla.findAll = originalFindAll;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
