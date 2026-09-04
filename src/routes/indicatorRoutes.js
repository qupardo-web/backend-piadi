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
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Departamento creado.
 */
router.get('/departments', authenticateToken, indicatorController.listDepartments);
router.post('/departments', authenticateToken, indicatorController.createDepartment);

/**
 * @openapi
 * /api/departments/{departmentKey}:
 *   put:
 *     tags: [Departamentos]
 *     summary: Actualiza un departamento por su key
 *     security:
 *       - bearerAuth: []
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
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: departmentKey
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Departamento eliminado.
 */
router.put('/departments/:departmentKey', authenticateToken, indicatorController.updateDepartment);
router.delete('/departments/:departmentKey', authenticateToken, indicatorController.deleteDepartment);

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
 *     security:
 *       - bearerAuth: []
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
router.post('/departments/:departmentKey/kpis', authenticateToken, indicatorController.createKpi);

/**
 * @openapi
 * /api/departments/{departmentKey}/kpis/{indicatorKey}:
 *   put:
 *     tags: [Departamentos]
 *     summary: Actualiza una definición de KPI
 *     security:
 *       - bearerAuth: []
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
 *     security:
 *       - bearerAuth: []
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
router.put('/departments/:departmentKey/kpis/:indicatorKey', authenticateToken, indicatorController.updateKpi);
router.delete('/departments/:departmentKey/kpis/:indicatorKey', authenticateToken, indicatorController.deleteKpi);

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
 *         description: Innovación admite proyectos_activos, total_proyectos, proyectos_finalizados, financiamiento_obtenido, secciones_curso y docentes_involucrados.
 *         schema:
 *           type: string
 *           example: proyectos_activos
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
 *         description: En Innovación filtra Proyecto.areaTematica.
 *         schema: { type: string }
 *       - in: query
 *         name: tipo
 *         description: En Innovación se aplica a tipoProyecto; en VCM depende del indicador.
 *         schema: { type: string }
 *       - in: query
 *         name: estado
 *         description: Estado del proyecto de Innovación.
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
 *         description: Clave del indicador. Innovación admite series de proyectos, secciones_curso, docentes_involucrados y financiamiento_obtenido.
 *         schema: { type: string, example: docentes_involucrados }
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
 *         description: En Innovación filtra Proyecto.areaTematica y es alias público de groupBy=areaTematica.
 *         schema: { type: string }
 *       - in: query
 *         name: tipo
 *         description: En Innovación se aplica a tipoProyecto; en VCM depende del indicador.
 *         schema: { type: string }
 *       - in: query
 *         name: estado
 *         description: Estado del proyecto de Innovación.
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
 *           description: anio es alias externo de year. En Innovación, area es alias contextual de areaTematica; financiamiento anual usa Proyecto.anioInicio.
 *           enum: [year, anio, area, areaTematica, semestre, tipo, modalidad, programa, sexo, rangoEdad, sector, fuente]
 *     responses:
 *       200:
 *         description: Serie simple (points) o segmentada (series) según groupBy. Si existe una única meta aplicable, incluye targetLine.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     targetLine:
 *                       type: object
 *                       description: Campo opcional; se omite cuando no existe una meta aplicable.
 *                       properties:
 *                         value: { type: number, example: 100 }
 *                         label: { type: string, example: Meta }
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
 *         description: Clave del indicador. Innovación admite proyectos, financiamiento_obtenido, secciones_curso y docentes_involucrados.
 *         schema: { type: string, example: secciones_curso }
 *       - in: query
 *         name: department
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: groupBy
 *         required: true
 *         schema:
 *           type: string
 *           description: anio es alias de year; area es alias contextual de areaTematica para proyectos de Innovación; secciones_curso admite semestre; financiamiento_obtenido admite fuente y year usando Proyecto.anioInicio.
 *           enum: [year, anio, area, areaTematica, semestre, tipo, modalidad, programa, sexo, rangoEdad, region, nivelDeEstudio, tipoParticipante, sectorEconomico, sector, fuente]
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *       - in: query
 *         name: tipo
 *         description: En Innovación se aplica a tipoProyecto; en VCM depende del indicador.
 *         schema: { type: string }
 *       - in: query
 *         name: estado
 *         description: Estado del proyecto de Innovación.
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
 *         description: Items de distribución { label, value }. La información de meta es opcional.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     metaTarget:
 *                       type: number
 *                       description: Objetivo de la MetaMetric aplicable; se omite si no existe.
 *                       example: 100
 *                     metaStatus:
 *                       type: string
 *                       description: Estado calculado por el motor de progreso; se omite si no existe meta aplicable.
 *                       enum: [cumplida, en_progreso, en_riesgo, no_cumplida]
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
