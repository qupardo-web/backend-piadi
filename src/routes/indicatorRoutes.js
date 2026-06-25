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
 * /api/departments/{departmentId}/filters:
 *   get:
 *     summary: Valores disponibles de filtros del dashboard (DISTINCT desde PostgreSQL)
 *     parameters:
 *       - in: path
 *         name: departmentId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: fromYear
 *         schema: { type: integer }
 *       - in: query
 *         name: toYear
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
 *     responses:
 *       200:
 *         description: Listas de valores para poblar los selects del frontend.
 */
router.get('/departments/:departmentId/filters', indicatorController.getDepartmentFilters);

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
 *     summary: Valor calculado bajo demanda de un indicador, con filtros globales
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
 *         schema: { type: integer }
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
 *         name: semesters
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
 *     responses:
 *       200:
 *         description: Valor del indicador (hasData false si faltan datos).
 */
router.get('/indicators/:indicatorKey/values', indicatorController.getIndicatorValue);

/**
 * @openapi
 * /api/indicators/{indicatorKey}/series:
 *   get:
 *     summary: Serie por año o segmentada por groupBy, con filtros globales
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
 *         name: groupBy
 *         schema:
 *           type: string
 *           enum: [year, area, tipo, modalidad, programa, sexo, rangoEdad]
 *     responses:
 *       200:
 *         description: Serie simple (points) o segmentada (series) según groupBy.
 */
router.get('/indicators/:indicatorKey/series', indicatorController.getIndicatorSeries);

/**
 * @openapi
 * /api/indicators/{indicatorKey}/breakdown:
 *   get:
 *     summary: Distribución del indicador por una dimensión (groupBy)
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
 *         name: groupBy
 *         required: true
 *         schema:
 *           type: string
 *           enum: [year, area, tipo, modalidad, programa, sexo, rangoEdad, region, nivelDeEstudio, tipoParticipante, sectorEconomico]
 *       - in: query
 *         name: fromYear
 *         schema: { type: integer }
 *       - in: query
 *         name: toYear
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Items de distribución { label, value }.
 */
router.get('/indicators/:indicatorKey/breakdown', indicatorController.getIndicatorBreakdown);

module.exports = router;
