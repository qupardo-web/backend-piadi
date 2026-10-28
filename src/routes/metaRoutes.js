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
 *     DraftMetricInput:
 *       type: object
 *       additionalProperties: false
 *       description: Campos parciales de edición; los numéricos también admiten cadena vacía. No generan filas MetaMetric ni progreso.
 *       properties:
 *         indicatorKey: { type: string, nullable: true }
 *         weight: { type: number, nullable: true }
 *         behavior: { type: string, nullable: true }
 *         targetValue: { type: number, nullable: true }
 *         valueType: { type: string, nullable: true }
 *         lowerLimit: { type: number, nullable: true }
 *         upperLimit: { type: number, nullable: true }
 *     MetaInput:
 *       type: object
 *       required: [anio, periodo, nombre, fechaInicio, fechaLimite, metrics]
 *       properties:
 *         lifecycleStatus: { type: string, enum: [ACTIVA], default: ACTIVA }
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
 *     MetaDraftInput:
 *       type: object
 *       required: [lifecycleStatus, anio, periodo, nombre, fechaInicio, fechaLimite]
 *       properties:
 *         lifecycleStatus: { type: string, enum: [BORRADOR] }
 *         departmentId: { type: string, nullable: true }
 *         anio: { type: integer, minimum: 1900 }
 *         periodo: { type: string }
 *         nombre: { type: string }
 *         fechaInicio: { type: string, format: date-time }
 *         fechaLimite: { type: string, format: date-time }
 *         draftMetrics:
 *           type: array
 *           description: Puede estar vacío o contener métricas incompletas; no exige suma de pesos.
 *           items: { $ref: '#/components/schemas/DraftMetricInput' }
 *     MetaUpdateInput:
 *       type: object
 *       description: El PUT actualiza parcialmente campos generales. Para ACTIVA exige metrics completos y reemplaza sus filas; para BORRADOR admite draftMetrics. BORRADOR a ACTIVA requiere metrics completos y limpia draftMetrics. ACTIVA a BORRADOR se rechaza.
 *       properties:
 *         lifecycleStatus: { type: string, enum: [BORRADOR, ACTIVA] }
 *         departmentId: { type: string, nullable: true }
 *         anio: { type: integer, minimum: 1900 }
 *         periodo: { type: string }
 *         nombre: { type: string }
 *         fechaInicio: { type: string, format: date-time }
 *         fechaLimite: { type: string, format: date-time }
 *         prioridad: { type: string, nullable: true }
 *         comportamiento: { type: string, nullable: true }
 *         metrics:
 *           type: array
 *           items: { $ref: '#/components/schemas/MetaMetricInput' }
 *         draftMetrics:
 *           type: array
 *           items: { $ref: '#/components/schemas/DraftMetricInput' }
 *     Meta:
 *       type: object
 *       properties:
 *         id: { type: integer, example: 1 }
 *         indicatorKey: { type: string, nullable: true }
 *         departmentId: { type: string, nullable: true }
 *         anio: { type: integer }
 *         valorMeta: { type: number, nullable: true }
 *         periodo: { type: string }
 *         nombre: { type: string }
 *         fechaInicio: { type: string, format: date-time }
 *         fechaLimite: { type: string, format: date-time }
 *         lifecycleStatus: { type: string, enum: [BORRADOR, ACTIVA, CERRADA] }
 *         closedAt: { type: string, format: date-time, nullable: true }
 *         finalSnapshot: { $ref: '#/components/schemas/MetaFinalSnapshot' }
 *         draftMetrics:
 *           type: array
 *           nullable: true
 *           items: { $ref: '#/components/schemas/DraftMetricInput' }
 *         metrics:
 *           type: array
 *           items: { $ref: '#/components/schemas/MetaMetricInput' }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
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
 *         calculationIssue: { type: string, nullable: true }
 *     MetaFinalSnapshot:
 *       type: object
 *       nullable: true
 *       description: Resultado final inmutable, capturado al cerrar; no se recalcula al consultar.
 *       required: [version, totalProgress, elapsedProgress, status, metrics]
 *       properties:
 *         version: { type: integer, enum: [1] }
 *         totalProgress: { type: number }
 *         elapsedProgress: { type: number }
 *         status: { type: string, enum: [cumplida, en_progreso, en_riesgo, no_cumplida] }
 *         metrics:
 *           type: array
 *           items: { $ref: '#/components/schemas/MetaMetricProgress' }
 *     MetaProgress:
 *       type: object
 *       properties:
 *         lifecycleStatus: { type: string, enum: [BORRADOR, ACTIVA, CERRADA] }
 *         closedAt: { type: string, format: date-time, nullable: true }
 *         finalSnapshot: { $ref: '#/components/schemas/MetaFinalSnapshot' }
 *         draftMetrics:
 *           type: array
 *           nullable: true
 *           items: { $ref: '#/components/schemas/DraftMetricInput' }
 *         totalProgress: { type: number, nullable: true, example: 64 }
 *         elapsedProgress: { type: number, nullable: true, example: 50 }
 *         status:
 *           type: string
 *           nullable: true
 *           enum: [cumplida, en_progreso, en_riesgo, no_cumplida]
 *           description: Estado de cumplimiento; en BORRADOR es null, al igual que ambos progresos; en CERRADA procede del snapshot.
 *         metrics:
 *           type: array
 *           items: { $ref: '#/components/schemas/MetaMetricProgress' }
 */

/**
 * @openapi
 * /api/metas:
 *   post:
 *     tags: [Metas]
 *     summary: Crea una meta ACTIVA o un BORRADOR
 *     description: Sin lifecycleStatus se mantiene ACTIVA y se exigen métricas completas con pesos exactamente 100. BORRADOR admite draftMetrics parciales, sin valorMeta ni filas MetaMetric.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - { $ref: '#/components/schemas/MetaInput' }
 *               - { $ref: '#/components/schemas/MetaDraftInput' }
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
 *       400: { description: Payload, estado, draftMetrics o suma de pesos inválida. }
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
 *     summary: Lista metas con estado de ciclo de vida y cumplimiento cuando corresponda
 *     description: Incluye BORRADOR solo para su creador y Rectoría; las metas ACTIVAS conservan la lectura existente. Un BORRADOR tiene status, totalProgress y elapsedProgress nulos.
 *     security: [{ bearerAuth: [] }]
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
 *         description: Filtra el estado de cumplimiento, no lifecycleStatus.
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
 *       401: { description: Token ausente, inválido o expirado. }
 */
router.get('/', authenticateToken, metaController.listWithProgress);

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
 *     summary: Obtiene el progreso de una meta ACTIVA, CERRADA o un BORRADOR sin cálculo
 *     description: Los BORRADOR solo son visibles para su creador y Rectoría; su status y progresos son null. En CERRADA se devuelve el snapshot persistido sin recalcular indicadores.
 *     security: [{ bearerAuth: [] }]
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
 *       401: { description: Token ausente, inválido o expirado. }
 *       404: { description: Meta o indicador inexistente, o BORRADOR ajeno. }
 */
router.get('/:id/progress', authenticateToken, metaController.getProgress);

/**
 * @openapi
 * /api/metas/{id}/cerrar:
 *   post:
 *     tags: [Metas]
 *     summary: Cierra definitivamente una meta ACTIVA y conserva su resultado final
 *     description: Permite el cierre manual anticipado sin cambiar fechaLimite. No admite payload; el servidor calcula y guarda un único snapshot. Repetir el cierre devuelve el resultado original sin recalcular ni auditar de nuevo.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Meta cerrada o resultado previo de un cierre repetido.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/MetaProgress' }
 *       400: { description: ID o solicitud inválida. }
 *       401: { description: Token ausente o inválido. }
 *       403: { description: El usuario no puede administrar la meta. }
 *       404: { description: Meta inexistente. }
 *       409: { description: Solo una meta ACTIVA puede cerrarse. }
 */
router.post('/:id/cerrar', authenticateToken, requireMetaOwnership, requireMetaDepartmentAccess, metaController.close);

/**
 * @openapi
 * /api/metas/{id}:
 *   get:
 *     tags: [Metas]
 *     summary: Obtiene una meta con lifecycleStatus, métricas completas y datos parciales del BORRADOR
 *     description: Un BORRADOR solo es visible para su creador y Rectoría. Una CERRADA devuelve su resultado final sin recalcularlo.
 *     security: [{ bearerAuth: [] }]
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
 *       404: { description: Meta inexistente o BORRADOR ajeno. }
 *       401: { description: Token ausente, inválido o expirado. }
 *   put:
 *     tags: [Metas]
 *     summary: Edita BORRADOR o actualiza/activa una meta con métricas completas
 *     description: BORRADOR a ACTIVA exige metrics completos cuya suma de weight sea 100 y limpia draftMetrics en una transacción. Una meta ACTIVA mantiene el reemplazo completo de metrics; ACTIVA a BORRADOR se rechaza. CERRADA se obtiene únicamente con POST /api/metas/{id}/cerrar y después no admite PUT.
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
 *           schema: { $ref: '#/components/schemas/MetaUpdateInput' }
 *     responses:
 *       200: { description: Meta actualizada. }
 *       400: { description: Payload, transición o suma de pesos inválida. }
 *       401: { description: Token ausente o inválido. }
 *       403: { description: El usuario no es creador ni pertenece a Rectoría. }
 *       404: { description: Meta, departamento o indicador inexistente. }
 *       409: { description: La meta está CERRADA o la transición no está permitida. }
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
 *       409: { description: Una meta CERRADA no puede eliminarse. }
 */
router.get('/:id', authenticateToken, metaController.getById);
router.put('/:id', authenticateToken, requireMetaOwnership, requireMetaDepartmentAccess, auditMetaOperation('UPDATE'), metaController.update);
router.delete('/:id', authenticateToken, requireMetaOwnership, requireMetaDepartmentAccess, auditMetaOperation('DELETE'), metaController.remove);

module.exports = router;
