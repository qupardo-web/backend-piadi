const { UnauthorizedError, ForbiddenError } = require('../utils/errors');

const isRectoria = (user) => Boolean(user)
  && (user.role === 'Rector' || user.roleGroup === 'Rectoria');

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

  const userDepartmentId = req.user.departmentId;
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
  requireRectoria,
  requireRectoriaForInstitutionalCreation,
  requireMetaDepartmentAccess
};
