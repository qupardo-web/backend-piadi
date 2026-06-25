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
 *         name: fromYear
 *         schema: { type: integer }
 *       - in: query
 *         name: toYear
 *         schema: { type: integer }
 *       - in: query
 *         name: semester
 *         schema: { type: string }
 *       - in: query
 *         name: startMonth
 *         schema: { type: integer }
 *       - in: query
 *         name: area
 *         schema: { type: string }
 *       - in: query
 *         name: tipo
 *         schema: { type: string }
 *       - in: query
 *         name: modalidad
 *         schema: { type: string }
 *       - in: query
 *         name: sexo
 *         schema: { type: string }
 *       - in: query
 *         name: ageRange
 *         schema: { type: string }
 *       - in: query
 *         name: minAge
 *         schema: { type: integer }
 *       - in: query
 *         name: maxAge
 *         schema: { type: integer }
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
