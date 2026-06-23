const express = require('express');
const router = express.Router();
const auditController = require('../controllers/auditController');

/**
 * @openapi
 * /api/audit-logs:
 *   get:
 *     summary: Historial de auditoría paginado (items vacíos si no hay persistencia conectada)
 *     parameters:
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *       - in: query
 *         name: fromDate
 *         required: false
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: toDate
 *         required: false
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: userId
 *         required: false
 *         schema:
 *           type: string
 *       - in: query
 *         name: role
 *         required: false
 *         schema:
 *           type: string
 *       - in: query
 *         name: action
 *         required: false
 *         schema:
 *           type: string
 *       - in: query
 *         name: module
 *         required: false
 *         schema:
 *           type: string
 *       - in: query
 *         name: entity
 *         required: false
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         required: false
 *         schema:
 *           type: string
 *       - in: query
 *         name: sortBy
 *         required: false
 *         schema:
 *           type: string
 *       - in: query
 *         name: order
 *         required: false
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *     responses:
 *       200:
 *         description: Página de registros de auditoría con paginación válida.
 */
router.get('/audit-logs', auditController.getAuditLogs);

module.exports = router;
