const auditService = require('../services/auditService');

const sendError = (res, err) => {
  if (err && err.statusCode && err.code) {
    return res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details || {} }
    });
  }
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Error interno al procesar la consulta', details: {} }
  });
};

const getAuditLogs = (req, res) => {
  try {
    const result = auditService.query(req.query);
    res.status(200).json({ success: true, data: result.data });
  } catch (err) {
    sendError(res, err);
  }
};

module.exports = {
  getAuditLogs
};
