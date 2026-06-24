const {
  sequelize,
  Department,
  IndicatorDefinition,
  Programa,
  ResultadosPrograma,
  EstadoFinancieroPrograma,
  MatriculaPrograma
} = require('../models');

const SUPPORTED_DATA_DEPARTMENT = 'educacion_continua';
const DICTATED_VALUES = ['si', 'sí', 'true', '1', 'x', 'ejecutado', 'dictado', 'realizado', 'finalizado'];

const isDictado = (ejecutado) => {
  if (ejecutado === null || ejecutado === undefined) {
    return false;
  }
  return DICTATED_VALUES.includes(String(ejecutado).trim().toLowerCase());
};

const isConnected = async () => {
  try {
    await sequelize.authenticate();
    return true;
  } catch {
    return false;
  }
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

const getIndicatorInputData = async ({ department, year } = {}) => {
  if (department !== SUPPORTED_DATA_DEPARTMENT) {
    return null;
  }

  const cursosProgramados = await Programa.count({ where: { anio: Number(year) } });

  const resultados = await ResultadosPrograma.findAll({
    include: [{ model: Programa, required: true, where: { anio: Number(year) }, attributes: [] }],
    attributes: ['ejecutado']
  });
  const cursosDictados = resultados.length === 0 ? null : resultados.filter((r) => isDictado(r.ejecutado)).length;

  const matriculaCount = await MatriculaPrograma.count({ where: { anio: String(year) } });
  const matriculas = matriculaCount === 0 ? null : matriculaCount;

  const financieros = await EstadoFinancieroPrograma.findAll({
    include: [{ model: Programa, required: true, where: { anio: Number(year) }, attributes: [] }],
    attributes: ['ingresosNetosCLP']
  });
  const ingresosNetosCLP = financieros.length === 0
    ? null
    : financieros.reduce((acc, r) => acc + (Number(r.ingresosNetosCLP) || 0), 0);

  return { cursosProgramados, cursosDictados, matriculas, ingresosNetosCLP };
};

const getAvailableYears = async ({ department } = {}) => {
  if (department !== SUPPORTED_DATA_DEPARTMENT) {
    return [];
  }
  const rows = await Programa.findAll({
    attributes: [[sequelize.fn('DISTINCT', sequelize.col('anio')), 'anio']],
    raw: true
  });
  return rows
    .map((r) => Number(r.anio))
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);
};

module.exports = {
  isConnected,
  getDepartments,
  getDepartmentByKey,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getKpisByDepartment,
  getKpi,
  createKpi,
  updateKpi,
  deleteKpi,
  getIndicatorInputData,
  getAvailableYears
};
