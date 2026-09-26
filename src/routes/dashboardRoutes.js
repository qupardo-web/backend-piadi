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
 *         description: Filtra el resumen por departamento; use admision para obtener sus 13 KPIs habilitados.
 *         schema:
 *           type: string
 *           enum: [educacion_continua, vinculacion_medio, innovacion, admision]
 *           example: innovacion
 *       - in: query
 *         name: fromYear
 *         schema: { type: integer }
 *       - in: query
 *         name: toYear
 *         schema: { type: integer }
 *       - in: query
 *         name: semester
 *         description: Alias semestral. Para Admisión acepta 1, 2, Primer semestre, Segundo semestre, 1er semestre, 2do semestre, Semestre 1 y Semestre 2.
 *         schema: { type: string, example: "1" }
 *       - in: query
 *         name: periodo
 *         description: Período académico de Admisión normalizado a semestre 1 o 2.
 *         schema:
 *           type: string
 *           enum: ["1", "2", Primer semestre, Segundo semestre, 1er semestre, 2do semestre, Semestre 1, Semestre 2]
 *           example: "1"
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
 *         description: Resumen genérico de tarjetas por departamento. Admisión expone sus 13 indicadores habilitados y conserva hasData false cuando un indicador no dispone de datos.
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
 *                           departmentId: { type: string, example: admision }
 *                           name: { type: string, example: Admisión }
 *                           hasIndicators: { type: boolean, example: true }
 *                           cards:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 indicatorKey:
 *                                   type: string
 *                                   enum: [convenios_activos, actividades_realizadas, proyectos_vcm, proyectos_activos, financiamiento_obtenido, proyectos_finalizados, matricula_total, nuevos_vs_antiguos, matricula_por_asignatura, matricula_por_seccion, matricula_por_estado_academico, nivel_socioeconomico, situacion_familiar, procedencia_geografica, tipo_colegio, via_acceso, beneficios_becas, distribucion_sexo, rango_etario]
 *                                 title: { type: string, example: Matrícula total por período }
 *                                 value: { type: number, nullable: true, example: 1200 }
 *                                 formattedValue: { type: string, nullable: true, example: "1.200" }
 *                                 unit: { type: string, example: estudiantes }
 *                                 format: { type: string, example: number }
 *                                 hasData: { type: boolean, example: true }
 */
router.get('/dashboard/summary', authenticateToken, dashboardController.getSummary);

module.exports = router;
