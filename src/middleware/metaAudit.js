const auditService = require('../services/auditService');
const { isRectoria } = require('./rectoriaAuthorization');

const auditRectoriaDepartmentalMetaUpdate = (req, res, next) => {
  const isDepartmentalUpdate = isRectoria(req.user)
    && req.meta
    && req.meta.departmentId !== null
    && req.meta.departmentId !== undefined;

  if (isDepartmentalUpdate) {
    res.on('finish', () => {
      if (res.statusCode >= 400) return;
      const details = JSON.stringify({
        metaId: req.meta.id,
        departmentId: req.meta.departmentId,
        method: req.method,
        path: req.originalUrl
      });
      Promise.resolve(auditService.record('session', {
        userId: req.user.id,
        role: req.user.role || req.user.roleGroup || null,
        action: 'UPDATE_DEPARTMENTAL_META',
        entity: 'Meta',
        detalles: details
      })).catch(() => {});
    });
  }
  next();
};

module.exports = { auditRectoriaDepartmentalMetaUpdate };
