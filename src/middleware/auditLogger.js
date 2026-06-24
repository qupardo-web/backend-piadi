const auditService = require('../services/auditService');

const auditLogger = (meta = {}) => (req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode >= 400) {
      return;
    }
    const type = meta.type === 'carga' ? 'carga' : 'session';
    const user = req.user || {};
    const username = req.body && typeof req.body.username === 'string' ? req.body.username : null;

    const payload = {
      action: meta.action || null,
      module: meta.module || null,
      entity: meta.entity || null,
      method: req.method,
      path: req.originalUrl,
      userId: user.id || null,
      role: user.role || null
    };

    if (type === 'carga') {
      payload.plantilla = req.params && req.params.id ? String(req.params.id) : null;
      payload.archivo = req.file && req.file.originalname ? req.file.originalname : null;
    } else {
      payload.detalles = JSON.stringify({
        usuario: user.email || username || null,
        module: meta.module || null,
        method: req.method,
        path: req.originalUrl
      });
    }

    Promise.resolve(auditService.record(type, payload)).catch(() => {});
  });
  next();
};

module.exports = auditLogger;
