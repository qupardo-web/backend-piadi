const express = require('express');
const landingController = require('../controllers/landingController');

const router = express.Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     LandingDepartment:
 *       type: object
 *       nullable: true
 *       properties:
 *         key: { type: string, example: educacion_continua }
 *         name: { type: string, nullable: true, example: Educación Continua }
 *     LandingMetaMetric:
 *       type: object
 *       properties:
 *         indicatorKey: { type: string }
 *         currentValue: { type: number, nullable: true }
 *         targetValue: { type: number }
 *         weight: { type: number, description: Ponderación en escala 0 a 100. }
 *         behavior: { type: string }
 *         valueType: { type: string }
 *         progress: { type: number }
 *         weightedProgress: { type: number }
 *         hasData: { type: boolean }
 *     LandingMeta:
 *       type: object
 *       properties:
 *         id: { type: integer, example: 1 }
 *         department: { $ref: '#/components/schemas/LandingDepartment' }
 *         anio: { type: integer, example: 2026 }
 *         periodo: { type: string, example: Anual }
 *         totalProgress: { type: number, example: 64 }
 *         elapsedProgress: { type: number, example: 50 }
 *         status:
 *           type: string
 *           enum: [cumplida, en_progreso, en_riesgo, no_cumplida]
 *         metrics:
 *           type: array
 *           items: { $ref: '#/components/schemas/LandingMetaMetric' }
 */

/**
 * @openapi
 * /api/landing/metas:
 *   get:
 *     tags: [Landing]
 *     summary: Lista metas preparadas para visualización en la Landing Page
 *     description: Reutiliza el motor de progreso de metas. Las metas institucionales se identifican con department null.
 *     responses:
 *       200:
 *         description: Metas con departamento, progreso ponderado, estado y desglose de métricas.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, data]
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/LandingMeta' }
 *       400: { description: Una meta contiene un periodo o valor inválido. }
 *       500: { description: Error interno al obtener las metas. }
 */
router.get('/metas', landingController.getMetas);

module.exports = router;
