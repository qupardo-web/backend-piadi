const express = require('express');
const router = express.Router();
const indicatorController = require('../controllers/indicatorController');

/**
 * @openapi
 * /api/departments:
 *   get:
 *     summary: Lista el catálogo de departamentos y su disponibilidad de datos
 *     responses:
 *       200:
 *         description: Departamentos para la central de dashboards (enabled y hasData por departamento).
 */
router.get('/departments', indicatorController.listDepartments);

/**
 * @openapi
 * /api/departments/{departmentId}/kpis:
 *   get:
 *     summary: Lista las definiciones de KPI asociadas a un departamento
 *     parameters:
 *       - in: path
 *         name: departmentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: KPIs del departamento (lista vacía con mensaje si no tiene indicadores).
 */
router.get('/departments/:departmentId/kpis', indicatorController.listDepartmentKpis);

/**
 * @openapi
 * /api/indicators/{indicatorKey}/values:
 *   get:
 *     summary: Valor de un indicador para un departamento (hasData false si no hay fuente conectada)
 *     parameters:
 *       - in: path
 *         name: indicatorKey
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: department
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: year
 *         required: false
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Valor del indicador.
 */
router.get('/indicators/:indicatorKey/values', indicatorController.getIndicatorValue);

/**
 * @openapi
 * /api/indicators/{indicatorKey}/series:
 *   get:
 *     summary: Serie histórica de un indicador (si existe información por año)
 *     parameters:
 *       - in: path
 *         name: indicatorKey
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: department
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Serie histórica o hasData false si no existe por año.
 */
router.get('/indicators/:indicatorKey/series', indicatorController.getIndicatorSeries);

module.exports = router;
