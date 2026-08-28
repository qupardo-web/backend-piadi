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
    sendSuccess(res, await indicatorService.updateDepartment(req.params.departmentKey, req.body));
  } catch (err) {
    sendError(res, err);
  }
};

const deleteDepartment = async (req, res) => {
  try {
    sendSuccess(res, await indicatorService.deleteDepartment(req.params.departmentKey));
  } catch (err) {
    sendError(res, err);
  }
};

const listDepartmentKpis = async (req, res) => {
  try {
    sendSuccess(res, await indicatorService.getDepartmentKpis(req.params.departmentKey));
  } catch (err) {
    sendError(res, err);
  }
};

const createKpi = async (req, res) => {
  try {
    sendSuccess(res, await indicatorService.createKpi(req.params.departmentKey, req.body), 201);
  } catch (err) {
    sendError(res, err);
  }
};

const updateKpi = async (req, res) => {
  try {
    sendSuccess(res, await indicatorService.updateKpi(req.params.departmentKey, req.params.indicatorKey, req.body));
  } catch (err) {
    sendError(res, err);
  }
};

const deleteKpi = async (req, res) => {
  try {
    sendSuccess(res, await indicatorService.deleteKpi(req.params.departmentKey, req.params.indicatorKey));
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

const getIndicatorBreakdown = async (req, res) => {
  try {
    sendSuccess(res, await indicatorService.getIndicatorBreakdown(req.params.indicatorKey, req.query));
  } catch (err) {
    sendError(res, err);
  }
};

const getDepartmentFilters = async (req, res) => {
  try {
    sendSuccess(res, await indicatorService.getDepartmentFilters(req.params.departmentKey, req.query));
  } catch (err) {
    sendError(res, err);
  }
};

const getIndicatorDetail = async (req, res) => {
  try {
    const result = await indicatorService.getIndicatorDetail(req.params.indicatorKey);
    res.status(200).json(result);
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
  getDepartmentFilters,
  getIndicatorValue,
  getIndicatorDetail,
  getIndicatorSeries,
  getIndicatorBreakdown
};
