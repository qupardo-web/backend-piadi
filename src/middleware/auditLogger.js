const auditService = require('../services/auditService');

const auditLogger = (meta = {}) => (req, res, next) => {
  try {
    auditService.record({
      action: meta.action || null,
      module: meta.module || null,
      entity: meta.entity || null,
      method: req.method,
      path: req.originalUrl,
      userId: req.headers['x-user-id'] || null,
      role: req.headers['x-mock-role'] || null,
      timestamp: new Date().toISOString()
    });
  } catch {
    next();
    return;
  }
  next();
};

module.exports = auditLogger;
