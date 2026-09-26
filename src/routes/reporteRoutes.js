const express = require('express');
const reporteController = require('../controllers/reporteController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { requireReportesGestion } = require('../middleware/reportesAuthorization');

const router = express.Router();

// Catálogos (deben ir antes de /:id)
router.get('/tipos', authenticateToken, reporteController.listTipos);
router.get('/formatos', authenticateToken, reporteController.listFormatos);
router.get('/areas', authenticateToken, reporteController.listAreas);

// CRUD
router.get('/', authenticateToken, reporteController.listReportes);
router.post('/', authenticateToken, requireReportesGestion, reporteController.createReporte);
router.get('/:id', authenticateToken, reporteController.getReporte);
router.put('/:id', authenticateToken, requireReportesGestion, reporteController.updateReporte);
router.delete('/:id', authenticateToken, requireReportesGestion, reporteController.deleteReporte);

module.exports = router;
