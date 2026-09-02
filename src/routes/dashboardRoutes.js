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
 *         description: Filtra el resumen por departamento; use innovacion para obtener solo sus KPIs.
 *         schema:
 *           type: string
 *           enum: [educacion_continua, vinculacion_medio, innovacion]
 *           example: innovacion
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
 *         description: Resumen genérico de tarjetas por departamento. Innovación incluye proyectos_activos, financiamiento_obtenido y proyectos_finalizados (innovaciones implementadas).
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
 *                     metas:
 *                       type: object
 *                       description: Resumen aditivo de metas calculadas en el mismo alcance del dashboard.
 *                       properties:
 *                         total: { type: integer, example: 5 }
 *                         cumplidas: { type: integer, example: 2 }
 *                         enRiesgo: { type: integer, example: 1 }
 *                         cumplimientoGlobal: { type: number, example: 64 }
 *                     departments:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           departmentId: { type: string, example: innovacion }
 *                           name: { type: string, example: Innovación }
 *                           hasIndicators: { type: boolean, example: true }
 *                           cards:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 indicatorKey:
 *                                   type: string
 *                                   enum: [convenios_activos, actividades_realizadas, proyectos_vcm, proyectos_activos, financiamiento_obtenido, proyectos_finalizados]
 *                                 title: { type: string, example: Innovaciones implementadas }
 *                                 value: { type: number, example: 3 }
 *                                 formattedValue: { type: string, example: "3" }
 *                                 unit: { type: string, example: proyectos }
 *                                 format: { type: string, example: number }
 *                                 hasData: { type: boolean, example: true }
 */
router.get('/dashboard/summary', authenticateToken, dashboardController.getSummary);

module.exports = router;
