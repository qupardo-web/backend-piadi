const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { authenticateToken } = require('../middleware/authMiddleware');

/**
 * @openapi
 * /api/dashboard/summary:
 *   get:
 *     tags: [Indicadores]
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
 *         description: Filtra el resumen por departamento; use vinculacion_medio para obtener solo los KPIs VCM.
 *         schema:
 *           type: string
 *           example: vinculacion_medio
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
 *         description: Resumen genérico de tarjetas por departamento. Para VCM incluye convenios_activos, actividades_realizadas y proyectos_vcm (proyectos con estado En Curso).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     year: { type: integer, example: 2026 }
 *                     departments:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           departmentId: { type: string, example: vinculacion_medio }
 *                           name: { type: string, example: Vinculación con el Medio }
 *                           hasIndicators: { type: boolean, example: true }
 *                           cards:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 indicatorKey:
 *                                   type: string
 *                                   enum: [convenios_activos, actividades_realizadas, proyectos_vcm]
 *                                 title: { type: string, example: Proyectos vigentes }
 *                                 value: { type: number, example: 2 }
 *                                 formattedValue: { type: string, example: "2" }
 *                                 unit: { type: string, example: proyectos }
 *                                 format: { type: string, example: number }
 *                                 hasData: { type: boolean, example: true }
 */
router.get('/dashboard/summary', authenticateToken, dashboardController.getSummary);

module.exports = router;
