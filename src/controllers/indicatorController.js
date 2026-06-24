const indicatorService = require('../services/indicatorService');

const sendSuccess = (res, result, status = 200) => res.status(status).json({ success: true, data: result.data });

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

const listDepartments = async (req, res) => {
  try {
    sendSuccess(res, await indicatorService.listDepartments());
  } catch (err) {
    sendError(res, err);
  }
};

const createDepartment = async (req, res) => {
  try {
    sendSuccess(res, await indicatorService.createDepartment(req.body), 201);
  } catch (err) {
    sendError(res, err);
  }
};

const updateDepartment = async (req, res) => {
  try {
    sendSuccess(res, await indicatorService.updateDepartment(req.params.departmentId, req.body));
  } catch (err) {
    sendError(res, err);
  }
};

const deleteDepartment = async (req, res) => {
  try {
    sendSuccess(res, await indicatorService.deleteDepartment(req.params.departmentId));
  } catch (err) {
    sendError(res, err);
  }
};

const listDepartmentKpis = async (req, res) => {
  try {
    sendSuccess(res, await indicatorService.getDepartmentKpis(req.params.departmentId));
  } catch (err) {
    sendError(res, err);
  }
};

const createKpi = async (req, res) => {
  try {
    sendSuccess(res, await indicatorService.createKpi(req.params.departmentId, req.body), 201);
  } catch (err) {
    sendError(res, err);
  }
};

const updateKpi = async (req, res) => {
  try {
    sendSuccess(res, await indicatorService.updateKpi(req.params.departmentId, req.params.indicatorKey, req.body));
  } catch (err) {
    sendError(res, err);
  }
};

const deleteKpi = async (req, res) => {
  try {
    sendSuccess(res, await indicatorService.deleteKpi(req.params.departmentId, req.params.indicatorKey));
  } catch (err) {
    sendError(res, err);
  }
};

const getIndicatorValue = async (req, res) => {
  try {
    sendSuccess(res, await indicatorService.getIndicatorValue(req.params.indicatorKey, req.query));
  } catch (err) {
    sendError(res, err);
  }
};

const getIndicatorSeries = async (req, res) => {
  try {
    sendSuccess(res, await indicatorService.getIndicatorSeries(req.params.indicatorKey, req.query));
  } catch (err) {
    sendError(res, err);
  }
};

module.exports = {
  listDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  listDepartmentKpis,
  createKpi,
  updateKpi,
  deleteKpi,
  getIndicatorValue,
  getIndicatorSeries
};
