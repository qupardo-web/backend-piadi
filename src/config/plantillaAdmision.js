const XLSX = require('xlsx');

// Nombres de hojas
const ESTUDIANTES_PREGRADO_SHEET = 'Estudiantes Pregrados';
const CARACTERIZACION_SHEET = 'Caracterización Estudiante';

// Nombres y archivos de las 3 plantillas
const ADMISION_COMBINADA_NAME = 'Plantilla Admisión - Completa';
const ADMISION_COMBINADA_FILENAME = 'plantilla-admision-combinada.xlsx';

const ADMISION_MATRICULA_NAME = 'Plantilla Admisión - Solo Matrícula';
const ADMISION_MATRICULA_FILENAME = 'plantilla-admision-matricula.xlsx';

const ADMISION_CARACTERIZACION_NAME = 'Plantilla Admisión - Solo Caracterización';
const ADMISION_CARACTERIZACION_FILENAME = 'plantilla-admision-caracterizacion.xlsx';

// Variantes
const VARIANTE_COMBINADA = 'combinada';
const VARIANTE_MATRICULA = 'matricula';
const VARIANTE_CARACTERIZACION = 'caracterizacion';

const ADMISION_TABLE_ORDER = Object.freeze({
  Alumno: 1,
  Asignatura: 2,
  MatriculaPorAsignatura: 3,
  CaracterizacionEstudiante: 4
});

const decodificarEntidadesHtml = (value) => {
  if (typeof value !== 'string') return value;
  const namedEntities = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"'
  };
  return value
    .replace(/&#(x?[0-9a-f]+);/gi, (_, code) => {
      const radix = code.toLowerCase().startsWith('x') ? 16 : 10;
      const numericCode = parseInt(radix === 16 ? code.slice(1) : code, radix);
      return Number.isInteger(numericCode) && numericCode >= 0 && numericCode <= 0x10FFFF
        ? String.fromCodePoint(numericCode)
        : _;
    })
    .replace(/&(amp|apos|gt|lt|nbsp|quot);/gi, (_, entity) => namedEntities[entity.toLowerCase()]);
};

const normalizarNombreHoja = (value) => String(decodificarEntidadesHtml(value) || '')
  .trim()
  .toLocaleLowerCase('es')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ');

const esHojaMatriculaAdmision = (sheetName) => {
  const normalized = normalizarNombreHoja(sheetName);
  return /^(?:estudiantes|esstudiantes)(?: pregrados?)?(?:[\s_-]+(?:19|20)\d{2})?$/.test(normalized);
};

const esHojaCaracterizacionAdmision = (sheetName) =>
  normalizarNombreHoja(sheetName) === normalizarNombreHoja(CARACTERIZACION_SHEET);

const resolverHojaAdmision = (workbook, expectedName) => {
  const expectedNormalized = normalizarNombreHoja(expectedName);
  const isEnrollment = expectedNormalized === normalizarNombreHoja(ESTUDIANTES_PREGRADO_SHEET);
  const isCharacterization = expectedNormalized === normalizarNombreHoja(CARACTERIZACION_SHEET);

  if (!isEnrollment && !isCharacterization) return { nombre: null, ambiguas: [] };

  const matches = workbook.SheetNames.filter((sheetName) =>
    isEnrollment ? esHojaMatriculaAdmision(sheetName) : esHojaCaracterizacionAdmision(sheetName)
  );

  if (matches.length === 0 && isEnrollment && workbook.SheetNames.length === 1) {
    const onlySheet = workbook.SheetNames[0];
    const sourceName = workbook.__piadiSourceName;
    if (/^sheet\d*$/i.test(onlySheet) && esHojaMatriculaAdmision(sourceName)) {
      return { nombre: onlySheet, ambiguas: [] };
    }
  }

  return matches.length === 1
    ? { nombre: matches[0], ambiguas: [] }
    : { nombre: null, ambiguas: matches };
};

const esConfiguracionAdmision = (campos) => {
  if (!Array.isArray(campos) || campos.length === 0) return false;
  const tables = new Set(campos.map((campo) => campo.tabla_destino));
  return [...tables].every((table) => Object.hasOwn(ADMISION_TABLE_ORDER, table)) &&
    [...tables].some((table) => table === 'MatriculaPorAsignatura' || table === 'CaracterizacionEstudiante');
};

// Encabezados en el archivo Excel
const estudiantesPregradosHeaders = [
  'Número',
  'RUT',
  'DIG',
  'CODCLI',
  'PATERNO',
  'MATERNO',
  'NOMBRE',
  'SECCION',
  'ASIGNATURA',
  'MAIL',
  'FONOACT',
  'FONOEMERG',
  'AÑO',
  'PERIODO',
  'RAMOEQUIV',
  'ESTACAD',
  'FONOPROC',
  'AL_FONO',
  'CELULAR',
  'CELULARACT'
];

const caracterizacionEstudianteHeaders = [
  'RUT',
  'DIG',
  'SEXO',
  'FECHANAC',
  'REGION',
  'COMUNA',
  'TIPOCOLEGIO',
  'VIAACCESO',
  'NSE',
  'SITUACIONFAMILIAR',
  'BENEFICIOS'
];

// Definición de campos para mapeo a tablas de base de datos
// Formato: [columna_excel, columna_destino, tipo_dato, requerido, lookupConfig]
const alumnoFields = [
  ['CODCLI', 'codCli', 'string', true],
  ['RUT', 'rut', 'number', true],
  ['DIG', 'digitoVerificador', 'string', true],
  ['NOMBRE', 'nombre', 'string', true],
  ['PATERNO', 'apellidoPat', 'string', true],
  ['MATERNO', 'apellidoMat', 'string', true],
  ['MAIL', 'mail', 'string', false],
  ['FONOACT', 'fonoAct', 'string', false],
  ['FONOEMERG', 'fonoEmergencia', 'string', false],
  ['FONOPROC', 'fonoProc', 'string', false],
  ['AL_FONO', 'alFono', 'string', false],
  ['CELULAR', 'celular', 'string', false],
  ['CELULARACT', 'celularAct', 'string', false]
];

const asignaturaFields = [
  ['RAMOEQUIV', 'ramoEquiv', 'string', true],
  ['ASIGNATURA', 'nombre', 'string', true]
];

const matriculaFields = [
  ['CODCLI', 'codCli', 'string', true, {
    campo_lookup_tabla: 'Alumno',
    campo_lookup_columna_db: 'codCli',
    campo_lookup_retorno: 'codCli'
  }],
  ['RAMOEQUIV', 'ramoEquiv', 'string', true, {
    campo_lookup_tabla: 'Asignatura',
    campo_lookup_columna_db: 'ramoEquiv',
    campo_lookup_retorno: 'ramoEquiv'
  }],
  ['AÑO', 'anio', 'number', true],
  ['PERIODO', 'periodo', 'number', true],
  ['SECCION', 'seccion', 'number', true],
  ['ESTACAD', 'estadoCad', 'string', true]
];

const caracterizacionFields = [
  ['RUT', 'rut', 'number', true, {
    campo_lookup_tabla: 'Alumno',
    campo_lookup_columna_db: 'rut',
    campo_lookup_retorno: 'rut'
  }],
  ['DIG', 'dig', 'string', false],
  ['SEXO', 'sexo', 'string', false],
  ['FECHANAC', 'fechaNacimiento', 'date', false],
  ['REGION', 'region', 'string', false],
  ['COMUNA', 'comuna', 'string', false],
  ['TIPOCOLEGIO', 'tipoColegio', 'string', false],
  ['VIAACCESO', 'viaAcceso', 'string', false],
  ['NSE', 'nivelSocioeconomico', 'string', false],
  ['SITUACIONFAMILIAR', 'situacionFamiliar', 'string', false],
  ['BENEFICIOS', 'beneficios', 'string', false]
];

// Generación de buffers Excel XLSX
const createAdmisionCombinadaBuffer = () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([estudiantesPregradosHeaders]),
    ESTUDIANTES_PREGRADO_SHEET
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([caracterizacionEstudianteHeaders]),
    CARACTERIZACION_SHEET
  );
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

const createAdmisionMatriculaBuffer = () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([estudiantesPregradosHeaders]),
    ESTUDIANTES_PREGRADO_SHEET
  );
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

const createAdmisionCaracterizacionBuffer = () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([caracterizacionEstudianteHeaders]),
    CARACTERIZACION_SHEET
  );
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

// Generación de registros para tabla plantillas
const createAdmisionCombinadaPlantilla = (roleId) => ({
  name: ADMISION_COMBINADA_NAME,
  description: 'Plantilla para carga completa de estudiantes, matrículas y caracterización de admisión',
  roleId,
  variante: VARIANTE_COMBINADA,
  archivoData: createAdmisionCombinadaBuffer(),
  archivoNombre: ADMISION_COMBINADA_FILENAME
});

const createAdmisionMatriculaPlantilla = (roleId) => ({
  name: ADMISION_MATRICULA_NAME,
  description: 'Plantilla para carga de estudiantes y matrículas por asignatura de admisión',
  roleId,
  variante: VARIANTE_MATRICULA,
  archivoData: createAdmisionMatriculaBuffer(),
  archivoNombre: ADMISION_MATRICULA_FILENAME
});

const createAdmisionCaracterizacionPlantilla = (roleId) => ({
  name: ADMISION_CARACTERIZACION_NAME,
  description: 'Plantilla para carga de caracterización socioeconómica y personal de estudiantes',
  roleId,
  variante: VARIANTE_CARACTERIZACION,
  archivoData: createAdmisionCaracterizacionBuffer(),
  archivoNombre: ADMISION_CARACTERIZACION_FILENAME
});

const createAllAdmisionPlantillas = (roleId) => [
  createAdmisionCombinadaPlantilla(roleId),
  createAdmisionMatriculaPlantilla(roleId),
  createAdmisionCaracterizacionPlantilla(roleId)
];

// Helper para convertir definición a estructura de CampoPlantilla
const toCampo = (plantillaId, sheet, table, order, [column, destination, type, requerido, lookupConfig = {}]) => ({
  plantillaId,
  nombre_campo: column,
  columna_excel: column,
  hoja_origen: sheet,
  tabla_destino: table,
  columna_destino: destination,
  tipo_dato: type,
  requerido: Boolean(requerido),
  orden_insercion: order,
  campo_lookup_tabla: lookupConfig.campo_lookup_tabla || null,
  campo_lookup_columna_db: lookupConfig.campo_lookup_columna_db || null,
  campo_lookup_retorno: lookupConfig.campo_lookup_retorno || null
});

// Generación de campos para tabla campos_plantilla según variante
const createAdmisionFields = (plantillaId, variante = VARIANTE_COMBINADA) => {
  const fields = [];

  if (variante === VARIANTE_COMBINADA || variante === VARIANTE_MATRICULA) {
    for (const field of alumnoFields) {
      fields.push(toCampo(plantillaId, ESTUDIANTES_PREGRADO_SHEET, 'Alumno', 1, field));
    }
    for (const field of asignaturaFields) {
      fields.push(toCampo(plantillaId, ESTUDIANTES_PREGRADO_SHEET, 'Asignatura', 1, field));
    }
    for (const field of matriculaFields) {
      fields.push(toCampo(plantillaId, ESTUDIANTES_PREGRADO_SHEET, 'MatriculaPorAsignatura', 2, field));
    }
  }

  if (variante === VARIANTE_COMBINADA || variante === VARIANTE_CARACTERIZACION) {
    for (const field of caracterizacionFields) {
      fields.push(toCampo(plantillaId, CARACTERIZACION_SHEET, 'CaracterizacionEstudiante', 2, field));
    }
  }

  return fields;
};

module.exports = {
  ESTUDIANTES_PREGRADO_SHEET,
  CARACTERIZACION_SHEET,
  ADMISION_COMBINADA_NAME,
  ADMISION_COMBINADA_FILENAME,
  ADMISION_MATRICULA_NAME,
  ADMISION_MATRICULA_FILENAME,
  ADMISION_CARACTERIZACION_NAME,
  ADMISION_CARACTERIZACION_FILENAME,
  VARIANTE_COMBINADA,
  VARIANTE_MATRICULA,
  VARIANTE_CARACTERIZACION,
  ADMISION_TABLE_ORDER,
  decodificarEntidadesHtml,
  normalizarNombreHoja,
  esHojaMatriculaAdmision,
  esHojaCaracterizacionAdmision,
  resolverHojaAdmision,
  esConfiguracionAdmision,
  estudiantesPregradosHeaders,
  caracterizacionEstudianteHeaders,
  alumnoFields,
  asignaturaFields,
  matriculaFields,
  caracterizacionFields,
  createAdmisionCombinadaBuffer,
  createAdmisionMatriculaBuffer,
  createAdmisionCaracterizacionBuffer,
  createAdmisionCombinadaPlantilla,
  createAdmisionMatriculaPlantilla,
  createAdmisionCaracterizacionPlantilla,
  createAllAdmisionPlantillas,
  createAdmisionFields
};
