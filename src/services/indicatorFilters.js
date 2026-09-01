const GROUP_BY_DIMENSIONS = [
  // Campos de Educación Continua
  'year',
  'area',
  'tipo',
  'modalidad',
  'programa',
  'sexo',
  'rangoEdad',
  'region',
  'nivelDeEstudio',
  'tipoParticipante',
  'sectorEconomico',
  'cohorte',
  'jornada',
  'periodo',

  // Campos de Vinculación con el Medio (VcM)
  'sector',
  'tipoConvenio',
  'areaVinculada',
  'contraparte',
  'responsableEcas',
  'lineaVcM',
  'tipoActividad',
  'comuna',
  'publicoObjetivo',
  'plataformaFoco',
  'tipoArticulacion',
  'especialidadTP',
  'colegioLiceoTP',
  'institucion',
  'internosExternos'
];

class FilterError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.statusCode = 400;
    this.code = code;
    this.details = details;
  }
}

const normalizeArrayParam = (value) => {
  if (value === undefined || value === null || value === '') {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeArrayParam(item));
  }
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v !== '');
};

const normalizeNumber = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
};

const SEMESTER_ALIASES = {
  '1': ['1', 'Primer semestre', 'Primer Semestre', '1er semestre'],
  '2': ['2', 'Segundo semestre', 'Segundo Semestre', '2do semestre']
};

const normalizeSemester = (value) => {
  const token = String(value).trim();
  if (SEMESTER_ALIASES[token]) {
    return [...SEMESTER_ALIASES[token]];
  }
  return [token];
};

const normalizeGroupBy = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const g = String(value).trim();
  if (g === 'anio') return 'year';
  return g === 'ageRange' ? 'rangoEdad' : g;
};

const isFourDigitYear = (value) => /^\d{4}$/.test(String(value));

const uniq = (arr) => [...new Set(arr)];

const parseIndicatorFilters = (query = {}) => {
  const filters = {
    department: query.department ? String(query.department).trim() : null,
    year: null,
    fromYear: null,
    toYear: null,
    semesters: [],
    semesterLabels: [],
    months: [],
    area: normalizeArrayParam(query.area),
    tipo: normalizeArrayParam(query.tipo),
    modalidad: normalizeArrayParam(query.modalidad),
    sexo: normalizeArrayParam(query.sexo),
    rangoEdad: uniq([...normalizeArrayParam(query.ageRange), ...normalizeArrayParam(query.rangoEdad)]),
    minAge: normalizeNumber(query.minAge),
    maxAge: normalizeNumber(query.maxAge),
    groupBy: normalizeGroupBy(query.groupBy),
    
    // Vinculación con el Medio
    sector: normalizeArrayParam(query.sector),
    tipoConvenio: normalizeArrayParam(query.tipoConvenio),
    areaVinculada: normalizeArrayParam(query.areaVinculada),
    contraparte: normalizeArrayParam(query.contraparte),
    responsableEcas: normalizeArrayParam(query.responsableEcas),
    lineaVcM: normalizeArrayParam(query.lineaVcM),
    tipoActividad: normalizeArrayParam(query.tipoActividad),
    comuna: normalizeArrayParam(query.comuna),
    publicoObjetivo: normalizeArrayParam(query.publicoObjetivo),
    plataformaFoco: normalizeArrayParam(query.plataformaFoco),
    tipoArticulacion: normalizeArrayParam(query.tipoArticulacion),
    especialidadTP: normalizeArrayParam(query.especialidadTP),
    colegioLiceoTP: normalizeArrayParam(query.colegioLiceoTP),
    institucion: normalizeArrayParam(query.institucion),
    internosExternos: normalizeArrayParam(query.internosExternos),
    // Educación Continua adicionales
    programa: normalizeArrayParam(query.programa),
    nivelDeEstudio: normalizeArrayParam(query.nivelDeEstudio),
    tipoParticipante: normalizeArrayParam(query.tipoParticipante),
    sectorEconomico: normalizeArrayParam(query.sectorEconomico),
    cohorte: normalizeArrayParam(query.cohorte),
    jornada: normalizeArrayParam(query.jornada),
    periodo: normalizeArrayParam(query.periodo),
    region: normalizeArrayParam(query.region)
  };

  if (query.year !== undefined && query.year !== '') {
    if (!isFourDigitYear(query.year)) {
      throw new FilterError('INVALID_YEAR', 'El parámetro "year" debe ser un año numérico de 4 dígitos', { year: query.year });
    }
    filters.year = Number(query.year);
  } else {
    if (query.fromYear !== undefined && query.fromYear !== '') {
      if (!isFourDigitYear(query.fromYear)) {
        throw new FilterError('INVALID_YEAR', 'El parámetro "fromYear" debe ser un año numérico de 4 dígitos', { fromYear: query.fromYear });
      }
      filters.fromYear = Number(query.fromYear);
    }
    if (query.toYear !== undefined && query.toYear !== '') {
      if (!isFourDigitYear(query.toYear)) {
        throw new FilterError('INVALID_YEAR', 'El parámetro "toYear" debe ser un año numérico de 4 dígitos', { toYear: query.toYear });
      }
      filters.toYear = Number(query.toYear);
    }
    if (filters.fromYear !== null && filters.toYear !== null && filters.fromYear > filters.toYear) {
      throw new FilterError('INVALID_YEAR_RANGE', 'El rango de años es inválido: "fromYear" no puede ser mayor que "toYear"', {
        fromYear: filters.fromYear,
        toYear: filters.toYear
      });
    }
  }

  const semesterTokens = uniq([...normalizeArrayParam(query.semester), ...normalizeArrayParam(query.semesters)]);
  filters.semesterLabels = semesterTokens;
  filters.semesters = uniq(semesterTokens.flatMap((t) => normalizeSemester(t)));

  const monthTokens = uniq([...normalizeArrayParam(query.month), ...normalizeArrayParam(query.startMonth)]);
  for (const token of monthTokens) {
    const n = Number(token);
    if (!Number.isInteger(n) || n < 1 || n > 12) {
      throw new FilterError('INVALID_MONTH', 'El parámetro de mes debe ser un número entero entre 1 y 12', { month: token });
    }
    filters.months.push(n);
  }
  filters.months = uniq(filters.months);

  if (filters.groupBy !== null && !GROUP_BY_DIMENSIONS.includes(filters.groupBy)) {
    throw new FilterError('INVALID_GROUP_BY', 'El parámetro "groupBy" no es una dimensión válida', {
      groupBy: filters.groupBy,
      allowed: GROUP_BY_DIMENSIONS
    });
  }

  return filters;
};

const validateIndicatorFilters = (filters) => {
  if (filters.groupBy !== null && !GROUP_BY_DIMENSIONS.includes(filters.groupBy)) {
    throw new FilterError('INVALID_GROUP_BY', 'El parámetro "groupBy" no es una dimensión válida', { groupBy: filters.groupBy });
  }
  return true;
};

const buildFilterMeta = (filters) => {
  const meta = {};
  if (filters.year !== null) meta.year = filters.year;
  if (filters.fromYear !== null) meta.fromYear = filters.fromYear;
  if (filters.toYear !== null) meta.toYear = filters.toYear;
  if (filters.semesterLabels.length) meta.semesters = filters.semesterLabels;
  if (filters.months.length) meta.startMonths = filters.months;
  if (filters.area.length) meta.area = filters.area;
  if (filters.tipo.length) meta.tipo = filters.tipo;
  if (filters.modalidad.length) meta.modalidad = filters.modalidad;
  if (filters.sexo.length) meta.sexo = filters.sexo;
  if (filters.rangoEdad.length) meta.rangoEdad = filters.rangoEdad;
  if (filters.minAge !== null) meta.minAge = filters.minAge;
  if (filters.maxAge !== null) meta.maxAge = filters.maxAge;
  if (filters.internosExternos.length) meta.internosExternos = filters.internosExternos;
  if (filters.sector.length) meta.sector = filters.sector;
  if (filters.region.length) meta.region = filters.region;
  if (filters.comuna.length) meta.comuna = filters.comuna;
  if (filters.lineaVcM.length) meta.lineaVcM = filters.lineaVcM;
  if (filters.tipoConvenio.length) meta.tipoConvenio = filters.tipoConvenio;
  if (filters.areaVinculada.length) meta.areaVinculada = filters.areaVinculada;
  if (filters.contraparte.length) meta.contraparte = filters.contraparte;
  if (filters.responsableEcas.length) meta.responsableEcas = filters.responsableEcas;
  if (filters.tipoActividad.length) meta.tipoActividad = filters.tipoActividad;
  if (filters.publicoObjetivo.length) meta.publicoObjetivo = filters.publicoObjetivo;
  if (filters.plataformaFoco.length) meta.plataformaFoco = filters.plataformaFoco;
  if (filters.tipoArticulacion.length) meta.tipoArticulacion = filters.tipoArticulacion;
  if (filters.especialidadTP.length) meta.especialidadTP = filters.especialidadTP;
  if (filters.colegioLiceoTP.length) meta.colegioLiceoTP = filters.colegioLiceoTP;
  if (filters.institucion.length) meta.institucion = filters.institucion;
  if (filters.programa.length) meta.programa = filters.programa;
  if (filters.nivelDeEstudio.length) meta.nivelDeEstudio = filters.nivelDeEstudio;
  if (filters.tipoParticipante.length) meta.tipoParticipante = filters.tipoParticipante;
  if (filters.sectorEconomico.length) meta.sectorEconomico = filters.sectorEconomico;
  if (filters.cohorte.length) meta.cohorte = filters.cohorte;
  if (filters.jornada.length) meta.jornada = filters.jornada;
  if (filters.periodo.length) meta.periodo = filters.periodo;
  
  return meta;
};

module.exports = {
  FilterError,
  GROUP_BY_DIMENSIONS,
  parseIndicatorFilters,
  validateIndicatorFilters,
  normalizeSemester,
  normalizeArrayParam,
  normalizeNumber,
  buildFilterMeta
};
