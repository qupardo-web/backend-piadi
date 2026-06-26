const { Op } = require('sequelize');
const {
  sequelize,
  Department,
  IndicatorDefinition,
  Programa,
  ResultadosPrograma,
  EstadoFinancieroPrograma,
  MatriculaPrograma,
  AlumnoExterno
} = require('../models');

const SUPPORTED_DATA_DEPARTMENT = 'educacion_continua';
const DICTATED_VALUES = ['si', 'sí', 'true', '1', 'x', 'ejecutado', 'dictado', 'realizado', 'finalizado'];
const TRUTHY_VALUES = ['si', 'sí', 'true', '1', 'x', 'verdadero'];

/**
 * Construye condición case-insensitive para un único valor
 * @param {string} value Valor a comparar
 * @returns {Object} Condición Sequelize con Op.iLike
 */
const buildCaseInsensitiveEquals = (value) => ({
  [Op.iLike]: value
});

/**
 * Construye condición case-insensitive para múltiples valores
 * @param {Array} values Array de valores
 * @returns {Object} Condición Sequelize con Op.or de Op.iLike
 */
const buildCaseInsensitiveIn = (values) => {
  if (!values || values.length === 0) return null;
  if (values.length === 1) return buildCaseInsensitiveEquals(values[0]);
  return {
    [Op.or]: values.map((v) => buildCaseInsensitiveEquals(v))
  };
};

const isDictado = (ejecutado) => {
  if (ejecutado === null || ejecutado === undefined) {
    return false;
  }
  return DICTATED_VALUES.includes(String(ejecutado).trim().toLowerCase());
};

const isTruthyFlag = (value) => {
  if (value === null || value === undefined) {
    return false;
  }
  return TRUTHY_VALUES.includes(String(value).trim().toLowerCase());
};

const isConnected = async () => {
  try {
    await sequelize.authenticate();
    return true;
  } catch {
    return false;
  }
};

const yearRange = (from, to) => {
  const list = [];
  for (let y = from; y <= to; y += 1) {
    list.push(y);
  }
  return list;
};

const buildProgramaWhere = (filters = {}) => {
  const where = {};
  if (filters.year !== null && filters.year !== undefined) {
    where.anio = filters.year;
  } else if (filters.fromYear !== null || filters.toYear !== null) {
    const from = filters.fromYear !== null ? filters.fromYear : filters.toYear;
    const to = filters.toYear !== null ? filters.toYear : filters.fromYear;
    where.anio = { [Op.between]: [from, to] };
  }
  if (filters.semesters && filters.semesters.length) where.semestre = buildCaseInsensitiveIn(filters.semesters);
  if (filters.months && filters.months.length) where.mesInicio = { [Op.in]: filters.months.map(String) };
  if (filters.area && filters.area.length) where.area = buildCaseInsensitiveIn(filters.area);
  if (filters.tipo && filters.tipo.length) where.tipo = buildCaseInsensitiveIn(filters.tipo);
  if (filters.modalidad && filters.modalidad.length) where.modalidad = buildCaseInsensitiveIn(filters.modalidad);
  return where;
};

const buildProgramaSubWhere = (filters = {}) => {
  const where = {};
  if (filters.area && filters.area.length) where.area = buildCaseInsensitiveIn(filters.area);
  if (filters.tipo && filters.tipo.length) where.tipo = buildCaseInsensitiveIn(filters.tipo);
  if (filters.modalidad && filters.modalidad.length) where.modalidad = buildCaseInsensitiveIn(filters.modalidad);
  return where;
};

const buildMatriculaWhere = (filters = {}) => {
  const where = {};
  if (filters.year !== null && filters.year !== undefined) {
    where.anio = String(filters.year);
  } else if (filters.fromYear !== null || filters.toYear !== null) {
    const from = filters.fromYear !== null ? filters.fromYear : filters.toYear;
    const to = filters.toYear !== null ? filters.toYear : filters.fromYear;
    where.anio = { [Op.in]: yearRange(from, to).map(String) };
  }
  if (filters.semesters && filters.semesters.length) where.semestre = buildCaseInsensitiveIn(filters.semesters);
  if (filters.months && filters.months.length) where.mesInicio = { [Op.in]: filters.months.map(Number) };
  if (filters.rangoEdad && filters.rangoEdad.length) where.rangoEdadAlumno = buildCaseInsensitiveIn(filters.rangoEdad);
  if (filters.minAge !== null && filters.minAge !== undefined) {
    where.edadAlumno = { ...(where.edadAlumno || {}), [Op.gte]: filters.minAge };
  }
  if (filters.maxAge !== null && filters.maxAge !== undefined) {
    where.edadAlumno = { ...(where.edadAlumno || {}), [Op.lte]: filters.maxAge };
  }
  return where;
};

const buildAlumnoWhere = (filters = {}) => {
  const where = {};
  if (filters.sexo && filters.sexo.length) where.sexo = buildCaseInsensitiveIn(filters.sexo);
  return where;
};

const getProgramRows = async (filters = {}) => {
  if (String(filters.department || '').toLowerCase() !== SUPPORTED_DATA_DEPARTMENT) {
    return [];
  }
  const programas = await Programa.findAll({
    where: buildProgramaWhere(filters),
    attributes: ['idPrograma', 'anio', 'area', 'tipo', 'modalidad', 'programa'],
    include: [
      { model: ResultadosPrograma, attributes: ['ejecutado', 'matricula', 'aprobados'], required: false },
      { model: EstadoFinancieroPrograma, attributes: ['ingresosNetosCLP'], required: false }
    ]
  });

  return programas.map((p) => {
    const r = p.ResultadosPrograma || null;
    const f = p.EstadoFinancieroPrograma || null;
    return {
      idPrograma: p.idPrograma,
      anio: Number(p.anio),
      area: p.area,
      tipo: p.tipo,
      modalidad: p.modalidad,
      programa: p.programa,
      dictado: r ? isDictado(r.ejecutado) : false,
      matricula: r && r.matricula != null ? Number(r.matricula) : 0,
      aprobados: r && r.aprobados != null ? Number(r.aprobados) : 0,
      ingresosNetos: f && f.ingresosNetosCLP != null ? Number(f.ingresosNetosCLP) : 0
    };
  });
};

const getParticipantRows = async (filters = {}) => {
  if (String(filters.department || '').toLowerCase() !== SUPPORTED_DATA_DEPARTMENT) {
    return [];
  }
  const programaSub = buildProgramaSubWhere(filters);
  const alumnoWhere = buildAlumnoWhere(filters);
  const programaHasFilter = Object.keys(programaSub).length > 0;
  const alumnoHasFilter = Object.keys(alumnoWhere).length > 0;

  const matriculas = await MatriculaPrograma.findAll({
    where: buildMatriculaWhere(filters),
    attributes: ['idInscripcion', 'idParticipante', 'anio', 'semestre', 'rangoEdadAlumno', 'nCursos', 'tieneMasCursos'],
    include: [
      {
        model: Programa,
        as: 'programa',
        attributes: ['area', 'tipo', 'modalidad', 'programa'],
        required: programaHasFilter,
        where: programaHasFilter ? programaSub : undefined
      },
      {
        model: AlumnoExterno,
        as: 'participante',
        attributes: ['sexo', 'region', 'nivelDeEstudio', 'tipoParticipante', 'sectorEconomico'],
        required: alumnoHasFilter,
        where: alumnoHasFilter ? alumnoWhere : undefined
      }
    ]
  });

  return matriculas.map((m) => {
    const prog = m.programa || {};
    const al = m.participante || {};
    return {
      idParticipante: m.idParticipante,
      anio: Number(m.anio),
      rangoEdad: m.rangoEdadAlumno,
      recurrente: (m.nCursos != null && Number(m.nCursos) > 1) || isTruthyFlag(m.tieneMasCursos),
      area: prog.area,
      tipo: prog.tipo,
      modalidad: prog.modalidad,
      programa: prog.programa,
      sexo: al.sexo,
      region: al.region,
      nivelDeEstudio: al.nivelDeEstudio,
      tipoParticipante: al.tipoParticipante,
      sectorEconomico: al.sectorEconomico
    };
  });
};

const distinctValues = (rows, key) => {
  const set = new Set();
  rows.forEach((r) => {
    if (r[key] !== null && r[key] !== undefined && r[key] !== '') {
      set.add(r[key]);
    }
  });
  return [...set];
};

const toMonthValue = (v) => (/^\d+$/.test(String(v)) ? Number(v) : v);

const getFilterOptions = async (department, filters = {}) => {
  const empty = { years: [], semesters: [], startMonths: [], areas: [], tipos: [], modalidades: [], sexos: [], rangosEdad: [] };
  if (String(department || '').toLowerCase() !== SUPPORTED_DATA_DEPARTMENT) {
    return empty;
  }

  const programas = await Programa.findAll({
    where: buildProgramaWhere(filters),
    attributes: ['anio', 'semestre', 'mesInicio', 'area', 'tipo', 'modalidad'],
    raw: true
  });

  const participantRows = await getParticipantRows(filters);

  return {
    years: distinctValues(programas, 'anio').map(Number).sort((a, b) => a - b),
    semesters: distinctValues(programas, 'semestre').sort(),
    startMonths: distinctValues(programas, 'mesInicio').map(toMonthValue).sort((a, b) => (Number(a) || 0) - (Number(b) || 0)),
    areas: distinctValues(programas, 'area').sort(),
    tipos: distinctValues(programas, 'tipo').sort(),
    modalidades: distinctValues(programas, 'modalidad').sort(),
    sexos: distinctValues(participantRows, 'sexo').sort(),
    rangosEdad: distinctValues(participantRows, 'rangoEdad').sort()
  };
};

const getDepartments = async () => {
  const rows = await Department.findAll({ order: [['order', 'ASC'], ['name', 'ASC']] });
  return rows.map((row) => row.toJSON());
};

const getDepartmentByKey = async (key) => {
  const row = await Department.findOne({ where: { key } });
  return row ? row.toJSON() : null;
};

const createDepartment = async (payload) => {
  const row = await Department.create(payload);
  return row.toJSON();
};

const updateDepartment = async (key, payload) => {
  const row = await Department.findOne({ where: { key } });
  if (!row) {
    return null;
  }
  await row.update(payload);
  return row.toJSON();
};

const deleteDepartment = async (key) => {
  const row = await Department.findOne({ where: { key } });
  if (!row) {
    return false;
  }
  await IndicatorDefinition.destroy({ where: { departmentId: key } });
  await row.destroy();
  return true;
};

const getKpisByDepartment = async (departmentId) => {
  const rows = await IndicatorDefinition.findAll({ where: { departmentId }, order: [['id', 'ASC']] });
  return rows.map((row) => row.toJSON());
};

const getKpi = async (departmentId, indicatorKey) => {
  const row = await IndicatorDefinition.findOne({ where: { departmentId, key: indicatorKey } });
  return row ? row.toJSON() : null;
};

const createKpi = async (departmentId, payload) => {
  const row = await IndicatorDefinition.create({ ...payload, departmentId });
  return row.toJSON();
};

const updateKpi = async (departmentId, indicatorKey, payload) => {
  const row = await IndicatorDefinition.findOne({ where: { departmentId, key: indicatorKey } });
  if (!row) {
    return null;
  }
  await row.update(payload);
  return row.toJSON();
};

const deleteKpi = async (departmentId, indicatorKey) => {
  const row = await IndicatorDefinition.findOne({ where: { departmentId, key: indicatorKey } });
  if (!row) {
    return false;
  }
  await row.destroy();
  return true;
};

module.exports = {
  isConnected,
  getProgramRows,
  getParticipantRows,
  getFilterOptions,
  getDepartments,
  getDepartmentByKey,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getKpisByDepartment,
  getKpi,
  createKpi,
  updateKpi,
  deleteKpi
};
