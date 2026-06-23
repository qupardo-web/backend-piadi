const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

/**
 * @openapi
 * /api/dashboard/summary:
 *   get:
 *     summary: Resumen de indicadores agrupados por departamento para la Landing Page
 *     parameters:
 *       - in: query
 *         name: year
 *         required: false
 *         schema:
 *           type: integer
 *       - in: query
 *         name: department
 *         required: false
 *         schema:
 *           type: string
 *       - in: query
 *         name: sortBy
 *         required: false
 *         schema:
 *           type: string
 *           enum: [name, department, value]
 *       - in: query
 *         name: order
 *         required: false
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *     responses:
 *       200:
 *         description: Resumen de tarjetas por departamento.
 */
router.get('/dashboard/summary', dashboardController.getSummary);

module.exports = router;
