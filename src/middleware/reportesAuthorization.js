const { UnauthorizedError, ForbiddenError } = require('../utils/errors');

// ── Política de acceso a Reportes (fuente única) ───────────────────────────
// Roles y grupos reconocidos por la institución.
const ROL_RECTOR = 'Rector';
const GRUPO_RECTORIA = 'Rectoria';
const ROL_CALIDAD = 'Vicerrectoria de Calidad';
const GRUPO_CALIDAD = 'Calidad';
const GRUPO_DIRECCION = 'Direccion';

const esRectoria = (user) => Boolean(user) &&
  (user.role === ROL_RECTOR || user.roleGroup === GRUPO_RECTORIA);

const esCalidad = (user) => Boolean(user) &&
  (user.role === ROL_CALIDAD || user.roleGroup === GRUPO_CALIDAD);

// Una Dirección es un rol del grupo 'Direccion' adscrito a un departamento (área).
// El departmentId filtra a las direcciones reales (excluye vicerrectorías sin área).
const esDireccion = (user) => Boolean(user) &&
  user.roleGroup === GRUPO_DIRECCION && Boolean(user.departmentId);

/**
 * Capacidades de un usuario sobre Reportes.
 * @returns {{
 *   lectura: 'todos'|'area'|'propios',
 *   escritura: 'todos'|'propios'|'ninguno',
 *   predefinidos: boolean,
 *   areas: string[]|null   // null = todas las áreas
 * }}
 */
const politicaReportes = (user) => {
  if (esRectoria(user)) {
    return { lectura: 'todos', escritura: 'todos', predefinidos: true, areas: null };
  }
  if (esCalidad(user)) {
    return { lectura: 'todos', escritura: 'ninguno', predefinidos: false, areas: null };
  }
  if (esDireccion(user)) {
    return { lectura: 'area', escritura: 'propios', predefinidos: false, areas: [user.departmentId] };
  }
  return { lectura: 'propios', escritura: 'ninguno', predefinidos: false, areas: [] };
};

// Guard para rutas de escritura (crear/editar/eliminar).
const requireReportesGestion = (req, res, next) => {
  if (!req.user) {
    return next(new UnauthorizedError('Usuario no autenticado'));
  }
  const { escritura } = politicaReportes(req.user);
  if (escritura === 'ninguno') {
    return next(new ForbiddenError('Tu rol no puede gestionar reportes'));
  }
  return next();
};

module.exports = {
  ROL_RECTOR,
  GRUPO_RECTORIA,
  ROL_CALIDAD,
  GRUPO_CALIDAD,
  GRUPO_DIRECCION,
  esRectoria,
  esCalidad,
  esDireccion,
  politicaReportes,
  requireReportesGestion
};
