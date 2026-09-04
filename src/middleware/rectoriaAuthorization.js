const { UnauthorizedError, ForbiddenError } = require('../utils/errors');

const isRectoria = (user) => Boolean(user)
  && (user.role === 'Rector' || user.roleGroup === 'Rectoria');

const isMetaReadOnlyUser = (user) => Boolean(user)
  && user.roleGroup === 'Calidad';

const resolveUserDepartmentId = (user) => {
  if (!user) return null;
  if (user.departmentId) return user.departmentId;
  const roleLower = (user.role || '').toLowerCase();
  if (roleLower.includes('innovación') || roleLower.includes('innovacion')) {
    return 'innovacion';
  }
  if (roleLower.includes('vinculación') || roleLower.includes('vinculacion') || roleLower.includes('vcm')) {
    return 'vinculacion_medio';
  }
  if (roleLower.includes('continua') || roleLower.includes('académico') || roleLower.includes('academico')) {
    return 'educacion_continua';
  }
  return null;
};

const canManageMeta = (user, meta) => {
  if (isRectoria(user)) return true;
  if (!user || !meta || isMetaReadOnlyUser(user)) return false;
  const userDepartmentId = resolveUserDepartmentId(user);
  return Boolean(userDepartmentId)
    && userDepartmentId === meta.departmentId
    && Number(user.id) === Number(meta.creatorId);
};

const requireRectoria = (req, res, next) => {
  if (!req.user) {
    return next(new UnauthorizedError('Usuario no autenticado'));
  }
  if (!isRectoria(req.user)) {
    return next(new ForbiddenError('Solo Rectoría puede acceder a este recurso'));
  }
  return next();
};

const requireRectoriaForInstitutionalCreation = (req, res, next) => {
  const departmentId = req.body && req.body.departmentId;
  if (departmentId !== null && departmentId !== undefined) {
    return next();
  }
  return requireRectoria(req, res, next);
};

const requireMetaDepartmentAccess = (req, res, next) => {
  if (!req.user) {
    return next(new UnauthorizedError('Usuario no autenticado'));
  }
  if (isRectoria(req.user)) {
    return next();
  }
  if (isMetaReadOnlyUser(req.user)) {
    return next(new ForbiddenError('Tu rol tiene acceso de solo lectura a las metas'));
  }

  const userDepartmentId = resolveUserDepartmentId(req.user);
  const hasRequestedDepartment = Object.prototype.hasOwnProperty.call(req.body || {}, 'departmentId');
  const requestedDepartmentId = hasRequestedDepartment ? req.body.departmentId : undefined;
  const currentDepartmentId = req.meta ? req.meta.departmentId : requestedDepartmentId;

  if (!userDepartmentId || currentDepartmentId !== userDepartmentId) {
    return next(new ForbiddenError('Solo puedes operar metas de tu departamento'));
  }
  if (hasRequestedDepartment && requestedDepartmentId !== userDepartmentId) {
    return next(new ForbiddenError('No puedes trasladar una meta a otro departamento'));
  }
  return next();
};

module.exports = {
  isRectoria,
  isMetaReadOnlyUser,
  canManageMeta,
  requireRectoria,
  requireRectoriaForInstitutionalCreation,
  requireMetaDepartmentAccess
};
