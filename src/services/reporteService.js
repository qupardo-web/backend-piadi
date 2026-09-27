const { Op } = require('sequelize');
const { Reporte, Role, Department, IndicatorDefinition } = require('../models');
const indicatorService = require('./indicatorService');
const { politicaReportes } = require('./reportesPolitica');
const { ValidationError, NotFoundError, ForbiddenError } = require('../utils/errors');

const TIPOS = ['PREDEFINIDO', 'PERSONALIZADO'];
const FORMATOS = ['XLSX', 'PDF'];

const listTipos = () => TIPOS;
const listFormatos = () => FORMATOS;

const listAreas = async () => {
  const { data } = await indicatorService.listDepartments();
  return data;
};

// ── Validadores ────────────────────────────────────────────────────────────

const validarNombreReporte = (nombre) => {
  const limpio = String(nombre ?? '').trim();
  if (!limpio) {
    throw new ValidationError('El nombre del reporte es obligatorio');
  }
  if (limpio.length > 150) {
    throw new ValidationError('El nombre del reporte no puede superar los 150 caracteres');
  }
  return limpio;
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

const validarIdReporte = (id) => {
  if (!/^\d+$/.test(String(id))) {
    throw new ValidationError('El id del reporte debe ser numérico');
  }
  return Number(id);
};

// Interpreta un valor booleano de forma estricta (booleano o "true"/"false").
const parsearActivo = (valor) => {
  if (typeof valor === 'boolean') return valor;
  if (typeof valor === 'string') {
    const normalizado = valor.trim().toLowerCase();
    if (normalizado === 'true') return true;
    if (normalizado === 'false') return false;
  }
  throw new ValidationError('El campo activo debe ser booleano (true/false)');
};

// Valida que el área exista y esté dentro del alcance del usuario.
const validarAreaReporte = async (departmentId, politica) => {
  if (departmentId === undefined) return undefined;
  if (departmentId === null) return null;
  if (politica && politica.areas !== null && !politica.areas.includes(departmentId)) {
    throw new ForbiddenError('No puedes asignar un área fuera de tu alcance');
  }
  const area = await Department.findOne({ where: { key: departmentId } });
  if (!area) {
    throw new ValidationError(`El área "${departmentId}" no existe`);
  }
  return departmentId;
};

// Valida que el rol exista.
const validarRoleIdReporte = async (roleId) => {
  if (roleId === null) return null;
  const role = await Role.findByPk(roleId);
  if (!role) {
    throw new ValidationError(`El rol ${roleId} no existe`);
  }
  return roleId;
};

// Valida existencia de los indicadores y que pertenezcan al alcance (área) del usuario.
const validarIndicadoresReporte = async (indicadores, politica) => {
  if (!Array.isArray(indicadores)) {
    throw new ValidationError('indicadores debe ser un arreglo');
  }
  if (indicadores.length === 0) {
    return [];
  }
  const encontrados = await IndicatorDefinition.findAll({
    where: { key: { [Op.in]: indicadores } },
    attributes: ['key', 'departmentId']
  });
  const existentes = new Set(encontrados.map((indicador) => indicador.key));
  const faltantes = indicadores.filter((key) => !existentes.has(key));
  if (faltantes.length > 0) {
    throw new ValidationError(`Indicadores inexistentes: ${faltantes.join(', ')}`);
  }
  if (politica && politica.areas !== null) {
    const fueraDeAlcance = encontrados
      .filter((indicador) => !politica.areas.includes(indicador.departmentId))
      .map((indicador) => indicador.key);
    if (fueraDeAlcance.length > 0) {
      throw new ForbiddenError(`No puedes incluir indicadores de otras áreas: ${fueraDeAlcance.join(', ')}`);
    }
  }
  return indicadores;
};

const construirDatosReporte = async (data, { politica, parcial = false } = {}) => {
  const campos = {};

  if (data.nombre !== undefined) {
    campos.nombre = validarNombreReporte(data.nombre);
  } else if (!parcial) {
    throw new ValidationError('El nombre del reporte es obligatorio');
  }

  if (data.formato !== undefined) campos.formato = validarFormatoReporte(data.formato);
  if (data.tipo !== undefined) campos.tipo = validarTipoReporte(data.tipo);
  if (data.indicadores !== undefined) campos.indicadores = await validarIndicadoresReporte(data.indicadores, politica);
  if (data.filtros !== undefined) campos.filtros = validarFiltrosReporte(data.filtros);
  if (data.departmentId !== undefined) campos.departmentId = await validarAreaReporte(data.departmentId, politica);

  if (data.descripcion !== undefined) campos.descripcion = data.descripcion;
  if (data.roleId !== undefined) campos.roleId = await validarRoleIdReporte(data.roleId);
  if (data.activo !== undefined) campos.activo = parsearActivo(data.activo);

  return campos;
};

// ── Alcance ────────────────────────────────────────────────────────────────

const esDeArea = (politica) => politica.lectura === 'area';

const enAlcanceLectura = (reporte, politica, user) => {
  if (politica.lectura === 'todos') return true;
  if (politica.lectura === 'area') return politica.areas.includes(reporte.departmentId);
  return Number(reporte.createdBy) === Number(user.id);
};

const esPropietario = (reporte, user) => Number(reporte.createdBy) === Number(user.id);

const includeRelaciones = [
  { model: Role, as: 'role' },
  { model: Department, as: 'area' }
];

// ── CRUD ───────────────────────────────────────────────────────────────────

const listReportes = async (user, { tipo, activo } = {}) => {
  const politica = politicaReportes(user);
  const where = {};
  if (tipo) where.tipo = validarTipoReporte(tipo);
  if (activo !== undefined) where.activo = parsearActivo(activo);

  if (politica.lectura === 'area') where.departmentId = { [Op.in]: politica.areas };
  else if (politica.lectura === 'propios') where.createdBy = user.id;

  return Reporte.findAll({ where, include: includeRelaciones, order: [['createdAt', 'DESC']] });
};

const getReporteById = async (user, id) => {
  const reporte = await Reporte.findByPk(validarIdReporte(id), { include: includeRelaciones });
  if (!reporte) {
    throw new NotFoundError('Reporte no encontrado');
  }
  const politica = politicaReportes(user);
  if (!enAlcanceLectura(reporte, politica, user)) {
    throw new ForbiddenError('No tienes acceso a este reporte');
  }
  return reporte;
};

const createReporte = async (user, data) => {
  const politica = politicaReportes(user);
  if (politica.escritura === 'ninguno') {
    throw new ForbiddenError('Tu rol no puede gestionar reportes');
  }

  const campos = await construirDatosReporte(data, { politica });

  if (campos.tipo === 'PREDEFINIDO' && !politica.predefinidos) {
    throw new ForbiddenError('Solo Rectoría puede crear reportes predefinidos');
  }

  campos.createdBy = user.id;
  if (campos.tipo === 'PREDEFINIDO') {
    campos.departmentId = null;
  } else if (esDeArea(politica)) {
    campos.departmentId = user.departmentId;
  } else if (campos.departmentId === undefined) {
    campos.departmentId = null;
  }

  return Reporte.create(campos);
};

const updateReporte = async (user, id, data) => {
  const politica = politicaReportes(user);
  if (politica.escritura === 'ninguno') {
    throw new ForbiddenError('Tu rol no puede gestionar reportes');
  }

  const reporte = await Reporte.findByPk(validarIdReporte(id));
  if (!reporte) {
    throw new NotFoundError('Reporte no encontrado');
  }
  if (politica.escritura === 'propios' && !esPropietario(reporte, user)) {
    throw new ForbiddenError('Solo puedes editar tus propios reportes');
  }

  const campos = await construirDatosReporte(data, { politica, parcial: true });
  if (Object.keys(campos).length === 0) {
    throw new ValidationError('No se enviaron campos válidos para actualizar');
  }
  if (campos.tipo === 'PREDEFINIDO' && !politica.predefinidos) {
    throw new ForbiddenError('Solo Rectoría puede crear reportes predefinidos');
  }
  const tipoFinal = campos.tipo ?? reporte.tipo;
  if (tipoFinal === 'PREDEFINIDO') {
    campos.departmentId = null;
  } else if (esDeArea(politica)) {
    campos.departmentId = user.departmentId;
  }

  await reporte.update(campos);
  return reporte;
};

const deleteReporte = async (user, id) => {
  const politica = politicaReportes(user);
  if (politica.escritura === 'ninguno') {
    throw new ForbiddenError('Tu rol no puede gestionar reportes');
  }

  const reporte = await Reporte.findByPk(validarIdReporte(id));
  if (!reporte) {
    throw new NotFoundError('Reporte no encontrado');
  }
  if (politica.escritura === 'propios' && !esPropietario(reporte, user)) {
    throw new ForbiddenError('Solo puedes eliminar tus propios reportes');
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
