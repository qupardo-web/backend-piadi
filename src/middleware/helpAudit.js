const auditService = require('../services/auditService');

const auditHelpChange = (action) => (req, res, next) => {
  res.on('finish', () => {
    const entry = res.locals.helpAuditEntry;
    if (res.statusCode >= 400 || !entry) return;

    Promise.resolve().then(() => auditService.record('session', {
      userId: req.user.id,
      role: req.user.role || req.user.roleGroup || null,
      action,
      entity: 'EntradaAyuda',
      detalles: JSON.stringify({
        entryId: entry.id,
        module: entry.modulo,
        roleGroup: req.user.roleGroup || null,
        changedFields: Object.keys(req.body || {}).sort()
      })
    })).catch((error) => console.warn('[helpAudit] No se pudo registrar el cambio:', error));
  });
  next();
};

module.exports = { auditHelpChange };
