const reporteService = require('../services/reporteService');
const reporteGeneracionService = require('../services/reporteGeneracionService');

const sendSuccess = (res, data, status = 200) => res.status(status).json({ success: true, data });

const listReportes = async (req, res, next) => {
  try {
    const reportes = await reporteService.listReportes(req.user, req.query);
    sendSuccess(res, reportes);
  } catch (err) {
    next(err);
  }
};

const getReporte = async (req, res, next) => {
  try {
    const reporte = await reporteService.getReporteById(req.user, req.params.id);
    sendSuccess(res, reporte);
  } catch (err) {
    next(err);
  }
};

const createReporte = async (req, res, next) => {
  try {
    const reporte = await reporteService.createReporte(req.user, req.body);
    sendSuccess(res, reporte, 201);
  } catch (err) {
    next(err);
  }
};

const updateReporte = async (req, res, next) => {
  try {
    const reporte = await reporteService.updateReporte(req.user, req.params.id, req.body);
    sendSuccess(res, reporte);
  } catch (err) {
    next(err);
  }
};

const deleteReporte = async (req, res, next) => {
  try {
    await reporteService.deleteReporte(req.user, req.params.id);
    sendSuccess(res, { eliminado: true });
  } catch (err) {
    next(err);
  }
};

const listTipos = (req, res) => sendSuccess(res, reporteService.listTipos());
const listFormatos = (req, res) => sendSuccess(res, reporteService.listFormatos());

const listAreas = async (req, res, next) => {
  try {
    const areas = await reporteService.listAreas();
    sendSuccess(res, areas);
  } catch (err) {
    next(err);
  }
};

const generarReporte = async (req, res, next) => {
  try {
    const ejecucion = await reporteGeneracionService.generarEjecucion(req.user, req.params.id);
    sendSuccess(res, ejecucion, 201);
  } catch (err) {
    next(err);
  }
};

const listEjecuciones = async (req, res, next) => {
  try {
    const ejecuciones = await reporteGeneracionService.listEjecuciones(req.user, req.params.id);
    sendSuccess(res, ejecuciones);
  } catch (err) {
    next(err);
  }
};

const descargarEjecucion = async (req, res, next) => {
  try {
    const ejecucion = await reporteGeneracionService.obtenerEjecucionDescarga(req.user, req.params.id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${ejecucion.archivoNombre || 'reporte.xlsx'}"`);
    res.send(ejecucion.archivo);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listReportes,
  getReporte,
  createReporte,
  updateReporte,
  deleteReporte,
  listTipos,
  listFormatos,
  listAreas,
  generarReporte,
  listEjecuciones,
  descargarEjecucion
};
