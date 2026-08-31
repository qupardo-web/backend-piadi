const express = require('express');
const router = express.Router();
const indicatorController = require('../controllers/indicatorController');
const { authenticateToken } = require('../middleware/authMiddleware');

/**
 * @openapi
 * /api/departments:
 *   get:
 *     tags: [Departamentos]
 *     summary: Lista los departamentos desde base de datos
 *     responses:
 *       200:
 *         description: Departamentos disponibles.
 *   post:
 *     tags: [Departamentos]
 *     summary: Crea un departamento
 *     responses:
 *       201:
 *         description: Departamento creado.
 */
router.get('/departments', authenticateToken, indicatorController.listDepartments);
router.post('/departments', indicatorController.createDepartment);

/**
 * @openapi
 * /api/departments/{departmentKey}:
 *   put:
 *     tags: [Departamentos]
 *     summary: Actualiza un departamento por su key
 *     parameters:
 *       - in: path
 *         name: departmentKey
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Departamento actualizado.
 *   delete:
 *     tags: [Departamentos]
 *     summary: Elimina un departamento por su key
 *     parameters:
 *       - in: path
 *         name: departmentKey
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Departamento eliminado.
 */
router.put('/departments/:departmentKey', indicatorController.updateDepartment);
router.delete('/departments/:departmentKey', indicatorController.deleteDepartment);

/**
 * @openapi
 * /api/departments/{departmentKey}/filters:
 *   get:
 *     tags: [Departamentos]
 *     summary: Valores disponibles de filtros del dashboard (DISTINCT desde PostgreSQL)
 *     parameters:
 *       - in: path
 *         name: departmentKey
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
router.get('/departments/:departmentKey/filters', authenticateToken, indicatorController.getDepartmentFilters);

/**
 * @openapi
 * /api/departments/{departmentKey}/kpis:
 *   get:
 *     tags: [Departamentos]
 *     summary: Lista las definiciones de KPI de un departamento (desde base de datos)
 *     parameters:
 *       - in: path
 *         name: departmentKey
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: KPIs del departamento.
 *   post:
 *     tags: [Departamentos]
 *     summary: Crea una definición de KPI para un departamento
 *     parameters:
 *       - in: path
 *         name: departmentKey
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       201:
 *         description: KPI creado.
 */
router.get('/departments/:departmentKey/kpis', authenticateToken, indicatorController.listDepartmentKpis);
router.post('/departments/:departmentKey/kpis', indicatorController.createKpi);

/**
 * @openapi
 * /api/departments/{departmentKey}/kpis/{indicatorKey}:
 *   put:
 *     tags: [Departamentos]
 *     summary: Actualiza una definición de KPI
 *     parameters:
 *       - in: path
 *         name: departmentKey
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: indicatorKey
 *         required: true
 *         description: Clave del indicador. VCM incluye total_convenios, convenios_activos y actividades_realizadas.
 *         schema: { type: string, example: total_convenios }
 *     responses:
 *       200:
 *         description: KPI actualizado.
 *   delete:
 *     tags: [Departamentos]
 *     summary: Elimina una definición de KPI
 *     parameters:
 *       - in: path
 *         name: departmentKey
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
router.put('/departments/:departmentKey/kpis/:indicatorKey', indicatorController.updateKpi);
router.delete('/departments/:departmentKey/kpis/:indicatorKey', indicatorController.deleteKpi);

/**
 * @openapi
 * /api/indicators/{indicatorKey}/values:
 *   get:
 *     tags: [Indicadores]
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
 *         description: En VCM se aplica a tipoConvenio o tipoActividad según el indicador.
 *         schema: { type: string }
 *       - in: query
 *         name: sector
 *         description: Sector del convenio o actividad VCM.
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
router.get('/indicators/:indicatorKey/values', authenticateToken, indicatorController.getIndicatorValue);

/**
 * @openapi
 * /api/indicators/{indicatorKey}/series:
 *   get:
 *     tags: [Indicadores]
 *     summary: Serie por año o segmentada por groupBy, con filtros globales
 *     parameters:
 *       - in: path
 *         name: indicatorKey
 *         required: true
 *         description: Clave del indicador. Para este contrato VCM use convenios_activos.
 *         schema: { type: string, example: convenios_activos }
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
 *         name: startMonth
 *         schema: { type: integer }
 *       - in: query
 *         name: area
 *         schema: { type: string }
 *       - in: query
 *         name: tipo
 *         description: En VCM se aplica a tipoConvenio o tipoActividad según el indicador.
 *         schema: { type: string }
 *       - in: query
 *         name: sector
 *         schema: { type: string }
 *       - in: query
 *         name: modalidad
 *         schema: { type: string }
 *       - in: query
 *         name: groupBy
 *         schema:
 *           type: string
 *           description: anio es alias externo de year; tipo se resuelve según la entidad VCM.
 *           enum: [year, anio, area, tipo, modalidad, programa, sexo, rangoEdad, sector]
 *     responses:
 *       200:
 *         description: Serie simple (points) o segmentada (series) según groupBy.
 */
router.get('/indicators/:indicatorKey/series', authenticateToken, indicatorController.getIndicatorSeries);

/**
 * @openapi
 * /api/indicators/{indicatorKey}/breakdown:
 *   get:
 *     tags: [Indicadores]
 *     summary: Distribución del indicador por una dimensión (groupBy)
 *     parameters:
 *       - in: path
 *         name: indicatorKey
 *         required: true
 *         description: Clave del indicador. Para este contrato VCM use actividades_realizadas.
 *         schema: { type: string, example: actividades_realizadas }
 *       - in: query
 *         name: department
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: groupBy
 *         required: true
 *         schema:
 *           type: string
 *           description: anio es alias de year; para actividades VCM tipo representa tipoActividad.
 *           enum: [year, anio, area, tipo, modalidad, programa, sexo, rangoEdad, region, nivelDeEstudio, tipoParticipante, sectorEconomico, sector]
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *       - in: query
 *         name: tipo
 *         description: En actividades VCM filtra tipoActividad.
 *         schema: { type: string }
 *       - in: query
 *         name: sector
 *         schema: { type: string }
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
router.get('/indicators/:indicatorKey/breakdown', authenticateToken, indicatorController.getIndicatorBreakdown);

/**
 * @openapi
 * /api/indicators/{indicatorKey}/detail:
 *   get:
 *     tags: [Indicadores]
 *     summary: Obtiene el detalle (título y descripción) de un indicador desde la base de datos
 *     parameters:
 *       - in: path
 *         name: indicatorKey
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Detalle del indicador.
 */
router.get('/indicators/:indicatorKey/detail', indicatorController.getIndicatorDetail);

module.exports = router;
