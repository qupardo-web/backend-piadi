const express = require('express');
const router = express.Router();
const indicatorController = require('../controllers/indicatorController');

/**
 * @openapi
 * /api/departments:
 *   get:
 *     summary: Lista los departamentos desde base de datos
 *     responses:
 *       200:
 *         description: Departamentos disponibles.
 *   post:
 *     summary: Crea un departamento
 *     responses:
 *       201:
 *         description: Departamento creado.
 */
router.get('/departments', indicatorController.listDepartments);
router.post('/departments', indicatorController.createDepartment);

/**
 * @openapi
 * /api/departments/{departmentId}:
 *   put:
 *     summary: Actualiza un departamento por su key
 *     parameters:
 *       - in: path
 *         name: departmentId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Departamento actualizado.
 *   delete:
 *     summary: Elimina un departamento por su key
 *     parameters:
 *       - in: path
 *         name: departmentId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Departamento eliminado.
 */
router.put('/departments/:departmentId', indicatorController.updateDepartment);
router.delete('/departments/:departmentId', indicatorController.deleteDepartment);

/**
 * @openapi
 * /api/departments/{departmentId}/kpis:
 *   get:
 *     summary: Lista las definiciones de KPI de un departamento (desde base de datos)
 *     parameters:
 *       - in: path
 *         name: departmentId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: KPIs del departamento.
 *   post:
 *     summary: Crea una definición de KPI para un departamento
 *     parameters:
 *       - in: path
 *         name: departmentId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       201:
 *         description: KPI creado.
 */
router.get('/departments/:departmentId/kpis', indicatorController.listDepartmentKpis);
router.post('/departments/:departmentId/kpis', indicatorController.createKpi);

/**
 * @openapi
 * /api/departments/{departmentId}/kpis/{indicatorKey}:
 *   put:
 *     summary: Actualiza una definición de KPI
 *     parameters:
 *       - in: path
 *         name: departmentId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: indicatorKey
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: KPI actualizado.
 *   delete:
 *     summary: Elimina una definición de KPI
 *     parameters:
 *       - in: path
 *         name: departmentId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: indicatorKey
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: KPI eliminado.
 */
router.put('/departments/:departmentId/kpis/:indicatorKey', indicatorController.updateKpi);
router.delete('/departments/:departmentId/kpis/:indicatorKey', indicatorController.deleteKpi);

/**
 * @openapi
 * /api/indicators/{indicatorKey}/values:
 *   get:
 *     summary: Valor calculado bajo demanda de un indicador para un departamento y año
 *     parameters:
 *       - in: path
 *         name: indicatorKey
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: department
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: year
 *         required: false
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Valor del indicador (hasData false si faltan datos).
 */
router.get('/indicators/:indicatorKey/values', indicatorController.getIndicatorValue);

/**
 * @openapi
 * /api/indicators/{indicatorKey}/series:
 *   get:
 *     summary: Serie histórica calculada para los años disponibles en la carga real
 *     parameters:
 *       - in: path
 *         name: indicatorKey
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: department
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Serie histórica del indicador.
 */
router.get('/indicators/:indicatorKey/series', indicatorController.getIndicatorSeries);

module.exports = router;
