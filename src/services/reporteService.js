const { Op } = require('sequelize');
const { Reporte, Role, IndicatorDefinition } = require('../models');
const indicatorService = require('./indicatorService');
const { ValidationError, NotFoundError } = require('../utils/errors');

const TIPOS = ['PREDEFINIDO', 'PERSONALIZADO'];
const FORMATOS = ['XLSX', 'PDF'];

const listTipos = () => TIPOS;
const listFormatos = () => FORMATOS;

const listAreas = async () => {
  const { data } = await indicatorService.listDepartments();
  return data;
};

const validarNombreReporte = (nombre) => {
  if (!nombre || !String(nombre).trim()) {
    throw new ValidationError('El nombre del reporte es obligatorio');
  }
  return String(nombre).trim();
};

const validarFormatoReporte = (formato) => {
  if (!FORMATOS.includes(formato)) {
    throw new ValidationError(`Formato inválido. Permitidos: ${FORMATOS.join(', ')}`);
  }
  return formato;
};

const validarTipoReporte = (tipo) => {
  if (!TIPOS.includes(tipo)) {
    throw new ValidationError(`Tipo inválido. Permitidos: ${TIPOS.join(', ')}`);
  }
  return tipo;
};

const validarFiltrosReporte = (filtros) => {
  if (typeof filtros !== 'object' || filtros === null || Array.isArray(filtros)) {
    throw new ValidationError('filtros debe ser un objeto');
  }
  return filtros;
};

const validarIndicadoresReporte = async (indicadores) => {
  if (!Array.isArray(indicadores)) {
    throw new ValidationError('indicadores debe ser un arreglo');
  }
  if (indicadores.length === 0) {
    return [];
  }
  const encontrados = await IndicatorDefinition.findAll({
    where: { key: { [Op.in]: indicadores } },
    attributes: ['key']
  });
  const existentes = new Set(encontrados.map((indicador) => indicador.key));
  const faltantes = indicadores.filter((key) => !existentes.has(key));
  if (faltantes.length > 0) {
    throw new ValidationError(`Indicadores inexistentes: ${faltantes.join(', ')}`);
  }
  return indicadores;
};

const construirDatosReporte = async (data, { parcial = false } = {}) => {
  const campos = {};

  if (data.nombre !== undefined) {
    campos.nombre = validarNombreReporte(data.nombre);
  } else if (!parcial) {
    throw new ValidationError('El nombre del reporte es obligatorio');
  }

  if (data.formato !== undefined) campos.formato = validarFormatoReporte(data.formato);
  if (data.tipo !== undefined) campos.tipo = validarTipoReporte(data.tipo);
  if (data.indicadores !== undefined) campos.indicadores = await validarIndicadoresReporte(data.indicadores);
  if (data.filtros !== undefined) campos.filtros = validarFiltrosReporte(data.filtros);

  if (data.descripcion !== undefined) campos.descripcion = data.descripcion;
  if (data.roleId !== undefined) campos.roleId = data.roleId;
  if (data.periodicidad !== undefined) campos.periodicidad = data.periodicidad;
  if (data.activo !== undefined) campos.activo = Boolean(data.activo);

  return campos;
};

const listReportes = async ({ tipo, roleId, activo } = {}) => {
  const where = {};
  if (tipo) where.tipo = tipo;
  if (roleId !== undefined) where.roleId = roleId;
  if (activo !== undefined) where.activo = Boolean(activo);
  return Reporte.findAll({
    where,
    include: [{ model: Role, as: 'role' }],
    order: [['createdAt', 'DESC']]
  });
};

const getReporteById = async (id) => {
  const reporte = await Reporte.findByPk(id, { include: [{ model: Role, as: 'role' }] });
  if (!reporte) {
    throw new NotFoundError('Reporte no encontrado');
  }
  return reporte;
};

const createReporte = async (data) => {
  const campos = await construirDatosReporte(data);
  return Reporte.create(campos);
};

const updateReporte = async (id, data) => {
  const reporte = await getReporteById(id);
  const campos = await construirDatosReporte(data, { parcial: true });
  await reporte.update(campos);
  return reporte;
};

const deleteReporte = async (id) => {
  const reporte = await Reporte.findByPk(id);
  if (!reporte) {
    throw new NotFoundError('Reporte no encontrado');
  }
  await reporte.destroy();
  return true;
};

module.exports = {
  TIPOS,
  FORMATOS,
  listTipos,
  listFormatos,
  listAreas,
  listReportes,
  getReporteById,
  createReporte,
  updateReporte,
  deleteReporte
};
