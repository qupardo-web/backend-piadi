const { UnauthorizedError, ForbiddenError } = require('../utils/errors');
const { politicaReportes } = require('../services/reportePolitica');

// Guard para rutas de escritura de reportes (crear/editar/eliminar).
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
  requireReportesGestion
};
