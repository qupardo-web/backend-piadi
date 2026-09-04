const express = require('express');
const metaController = require('../controllers/metaController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { requireMetaOwnership } = require('../middleware/metaOwnership');
const {
  requireRectoria,
  requireRectoriaForInstitutionalCreation,
  requireMetaDepartmentAccess
} = require('../middleware/rectoriaAuthorization');
const { auditMetaOperation } = require('../middleware/metaAudit');

const router = express.Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     MetaMetricInput:
 *       type: object
 *       required: [indicatorKey, weight, behavior, targetValue, valueType]
 *       properties:
 *         indicatorKey: { type: string, example: participantes-unicos }
 *         weight: { type: number, minimum: 0, maximum: 100, example: 60 }
 *         behavior: { type: string, example: increasing }
 *         targetValue: { type: number, example: 100 }
 *         valueType: { type: string, example: number }
 *         lowerLimit: { type: number, nullable: true, example: 40 }
 *         upperLimit: { type: number, nullable: true, example: 80 }
 *     MetaInput:
 *       type: object
 *       required: [anio, periodo, nombre, fechaInicio, fechaLimite, metrics]
 *       properties:
 *         departmentId:
 *           type: string
 *           nullable: true
 *           example: educacion-continua
 *         anio: { type: integer, minimum: 1900, example: 2026 }
 *         periodo: { type: string, example: Anual }
 *         nombre: { type: string, example: Aumentar participación institucional }
 *         fechaInicio: { type: string, format: date-time }
 *         fechaLimite: { type: string, format: date-time }
 *         metrics:
 *           type: array
 *           minItems: 1
 *           description: La suma de weight de todas las métricas debe ser exactamente 100.
 *           items: { $ref: '#/components/schemas/MetaMetricInput' }
 *     Meta:
 *       allOf:
 *         - $ref: '#/components/schemas/MetaInput'
 *         - type: object
 *           properties:
 *             id: { type: integer, example: 1 }
 *             creatorId: { type: integer, example: 2 }
 *             createdAt: { type: string, format: date-time }
 *             updatedAt: { type: string, format: date-time }
 *     MetaMetricProgress:
 *       type: object
 *       properties:
 *         metricId: { type: integer }
 *         indicatorKey: { type: string }
 *         currentValue: { type: number, nullable: true }
 *         targetValue: { type: number }
 *         weight: { type: number, description: Ponderación en escala 0 a 100. }
 *         behavior: { type: string }
 *         valueType: { type: string }
 *         lowerLimit: { type: number, nullable: true }
 *         upperLimit: { type: number, nullable: true }
 *         progress: { type: number, description: Cumplimiento no ponderado de la métrica. }
 *         weightedProgress: { type: number, description: Aporte ponderado al progreso total. }
 *         hasData: { type: boolean }
 *     MetaProgress:
 *       type: object
 *       properties:
 *         totalProgress: { type: number, example: 64 }
 *         elapsedProgress: { type: number, example: 50 }
 *         status:
 *           type: string
 *           enum: [cumplida, en_progreso, en_riesgo, no_cumplida]
 *         metrics:
 *           type: array
 *           items: { $ref: '#/components/schemas/MetaMetricProgress' }
 */

/**
 * @openapi
 * /api/metas:
 *   post:
 *     tags: [Metas]
 *     summary: Crea una meta con una o más métricas
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/MetaInput' }
 *     responses:
 *       201:
 *         description: Meta creada.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/Meta' }
 *       400: { description: Payload o suma de pesos inválida. }
 *       401: { description: Token ausente o inválido. }
 *       403: { description: Solo Rectoría puede crear una meta institucional. }
 *       404: { description: Departamento o indicador inexistente. }
 */
router.post('/', authenticateToken, requireRectoriaForInstitutionalCreation, requireMetaDepartmentAccess, auditMetaOperation('CREATE'), metaController.create);

/**
 * @openapi
 * /api/metas:
 *   get:
 *     tags: [Metas]
 *     summary: Lista metas enriquecidas con progreso ponderado y estado calculado
 *     parameters:
 *       - in: query
 *         name: departmentId
 *         schema: { type: string }
 *         description: Filtra metas en base de datos por departamento.
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [cumplida, en_progreso, en_riesgo, no_cumplida]
 *         description: Filtra después de calcular el estado dinámico.
 *     responses:
 *       200:
 *         description: Listado de metas con progreso.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/MetaProgress' }
 *       400: { description: Filtro status inválido o periodo de meta no reconocido. }
 */
router.get('/', metaController.listWithProgress);

/**
 * @openapi
 * /api/metas/institucional/progress:
 *   get:
 *     tags: [Metas]
 *     summary: Obtiene el cumplimiento global de las metas institucionales
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Promedio del progreso ponderado de las metas institucionales. }
 *       401: { description: Token ausente o inválido. }
 *       403: { description: El usuario no pertenece a Rectoría. }
 */
router.get('/institucional/progress', authenticateToken, requireRectoria, metaController.getInstitutionalProgress);

/**
 * @openapi
 * /api/metas/institucional:
 *   get:
 *     tags: [Metas]
 *     summary: Lista metas institucionales con progreso y breakdown por métrica
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Metas cuyo departmentId es null. }
 *       401: { description: Token ausente o inválido. }
 *       403: { description: El usuario no pertenece a Rectoría. }
 */
router.get('/institucional', authenticateToken, requireRectoria, metaController.listInstitutional);

/**
 * @openapi
 * /api/metas/{id}/progress:
 *   get:
 *     tags: [Metas]
 *     summary: Obtiene el detalle de progreso ponderado de una meta
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Meta con progreso total, estado y breakdown por métrica.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/MetaProgress' }
 *       400: { description: ID o periodo inválido. }
 *       404: { description: Meta o indicador inexistente. }
 */
router.get('/:id/progress', metaController.getProgress);

/**
 * @openapi
 * /api/metas/{id}:
 *   get:
 *     tags: [Metas]
 *     summary: Obtiene una meta con todas sus métricas
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Detalle de la meta.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/Meta' }
 *       404: { description: Meta inexistente. }
 *   put:
 *     tags: [Metas]
 *     summary: Actualiza una meta y reemplaza completamente sus métricas
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/MetaInput' }
 *     responses:
 *       200: { description: Meta actualizada. }
 *       400: { description: Payload o suma de pesos inválida. }
 *       401: { description: Token ausente o inválido. }
 *       403: { description: El usuario no es creador ni pertenece a Rectoría. }
 *       404: { description: Meta, departamento o indicador inexistente. }
 *   delete:
 *     tags: [Metas]
 *     summary: Elimina una meta y sus métricas asociadas
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       204: { description: Meta eliminada. }
 *       401: { description: Token ausente o inválido. }
 *       403: { description: El usuario no es creador ni pertenece a Rectoría. }
 *       404: { description: Meta inexistente. }
 */
router.get('/:id', metaController.getById);
router.put('/:id', authenticateToken, requireMetaOwnership, requireMetaDepartmentAccess, auditMetaOperation('UPDATE'), metaController.update);
router.delete('/:id', authenticateToken, requireMetaOwnership, requireMetaDepartmentAccess, auditMetaOperation('DELETE'), metaController.remove);

module.exports = router;
