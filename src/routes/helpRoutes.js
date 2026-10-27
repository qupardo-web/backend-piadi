const express = require('express');
const { authenticateToken } = require('../middleware/authMiddleware');
const { requireRectoria } = require('../middleware/rectoriaAuthorization');
const helpController = require('../controllers/helpController');

const router = express.Router();

/**
 * @openapi
 * /api/help/admin:
 *   get:
 *     tags: [Centro de Ayuda]
 *     summary: Lista todas las entradas de ayuda para Rectoría
 *     description: Incluye entradas activas e inactivas; ordena por módulo, orden e id.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Listado administrativo; puede estar vacío.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/EntradaAyuda' }
 *       401: { description: Token ausente o inválido. }
 *       403: { description: Usuario ajeno a Rectoría. }
 *       500: { description: Error interno. }
 *   post:
 *     tags: [Centro de Ayuda]
 *     summary: Crea una entrada de ayuda
 *     description: El catálogo de módulos es técnico y provisional. Solo se admite texto plano.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - { $ref: '#/components/schemas/DatosEntradaAyuda' }
 *               - { type: object, required: [modulo, pregunta, respuesta, orden] }
 *           example:
 *             modulo: desarrollo_curricular
 *             pregunta: ¿Cómo se consulta la tasa de aprobación?
 *             respuesta: Selecciona el período y revisa el indicador correspondiente.
 *             orden: 1
 *             activo: true
 *     responses:
 *       201:
 *         description: Entrada creada.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/EntradaAyuda' }
 *       400: { description: Cuerpo, módulo o campos inválidos. }
 *       401: { description: Token ausente o inválido. }
 *       403: { description: Usuario ajeno a Rectoría. }
 *       500: { description: Error interno. }
 */
router.get('/admin', authenticateToken, requireRectoria, helpController.listAdmin);
router.post('/admin', authenticateToken, requireRectoria, helpController.createEntry);

/**
 * @openapi
 * /api/help/admin/{id}:
 *   put:
 *     tags: [Centro de Ayuda]
 *     summary: Actualiza parcialmente una entrada de ayuda
 *     description: Los campos omitidos se conservan. activo permite desactivar y reactivar sin borrar.
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
 *           schema: { $ref: '#/components/schemas/DatosEntradaAyuda' }
 *           example: { activo: false }
 *     responses:
 *       200:
 *         description: Entrada actualizada.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/EntradaAyuda' }
 *       400: { description: ID, cuerpo, módulo o campos inválidos. }
 *       401: { description: Token ausente o inválido. }
 *       403: { description: Usuario ajeno a Rectoría. }
 *       404: { description: Entrada inexistente. }
 *       500: { description: Error interno. }
 */
router.put('/admin/:id', authenticateToken, requireRectoria, helpController.updateEntry);

/**
 * @openapi
 * /api/help:
 *   get:
 *     tags: [Centro de Ayuda]
 *     summary: Consulta las entradas activas de un módulo
 *     description: Solo devuelve entradas con activo=true del módulo solicitado, ordenadas por orden e id ascendentes.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: modulo
 *         required: true
 *         description: Identificador del módulo; se aceptan espacios exteriores, pero no se cambian mayúsculas.
 *         schema: { $ref: '#/components/schemas/ModuloAyuda' }
 *         example: desarrollo_curricular
 *     responses:
 *       200:
 *         description: Entradas activas del módulo; arreglo vacío si no existen.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/EntradaAyuda' }
 *       400: { description: 'Módulo ausente, repetido o no permitido.' }
 *       401: { description: Token ausente o inválido. }
 *       500: { description: Error interno. }
 */
router.get('/', authenticateToken, helpController.listActiveByModule);

module.exports = router;
