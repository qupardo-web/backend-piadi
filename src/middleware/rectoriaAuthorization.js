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

module.exports = {
  isRectoria,
  requireRectoria,
  requireRectoriaForInstitutionalCreation
};
