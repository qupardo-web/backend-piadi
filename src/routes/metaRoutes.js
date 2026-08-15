const express = require('express');
const metaController = require('../controllers/metaController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { requireMetaOwnership } = require('../middleware/metaOwnership');

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
 *     MetaInput:
 *       type: object
 *       required: [anio, periodo, metrics]
 *       properties:
 *         departmentId:
 *           type: string
 *           nullable: true
 *           example: educacion-continua
 *         anio: { type: integer, minimum: 1900, example: 2026 }
 *         periodo: { type: string, example: Anual }
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
 *       404: { description: Departamento o indicador inexistente. }
 */
router.post('/', authenticateToken, metaController.create);

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
router.put('/:id', authenticateToken, requireMetaOwnership, metaController.update);
router.delete('/:id', authenticateToken, requireMetaOwnership, metaController.remove);

module.exports = router;
