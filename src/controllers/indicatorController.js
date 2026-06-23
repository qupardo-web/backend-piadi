const indicatorService = require('../services/indicatorService');

const sendSuccess = (res, result) => res.status(200).json({ success: true, data: result.data });

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

const listDepartments = (req, res) => {
  try {
    sendSuccess(res, indicatorService.listDepartments());
  } catch (err) {
    sendError(res, err);
  }
};

const listDepartmentKpis = (req, res) => {
  try {
    sendSuccess(res, indicatorService.getDepartmentKpis(req.params.departmentId));
  } catch (err) {
    sendError(res, err);
  }
};

const getIndicatorValue = (req, res) => {
  try {
    sendSuccess(res, indicatorService.getIndicatorValue(req.params.indicatorKey, req.query));
  } catch (err) {
    sendError(res, err);
  }
};

const getIndicatorSeries = (req, res) => {
  try {
    sendSuccess(res, indicatorService.getIndicatorSeries(req.params.indicatorKey, req.query));
  } catch (err) {
    sendError(res, err);
  }
};

module.exports = {
  listDepartments,
  listDepartmentKpis,
  getIndicatorValue,
  getIndicatorSeries
};
