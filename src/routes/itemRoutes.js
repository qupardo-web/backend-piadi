const express = require('express');
const router = express.Router();
const itemController = require('../controllers/itemController');

/**
 * @openapi
 * /api/status:
 *   get:
 *     summary: Retorna el estado del backend y la base de datos
 *     responses:
 *       200:
 *         description: Estado del backend y base de datos activos.
 */
router.get('/status', itemController.getStatus);

/**
 * @openapi
 * /api/items:
 *   get:
 *     summary: Obtiene la lista de elementos en PostgreSQL
 *     responses:
 *       200:
 *         description: Lista de elementos obtenida con éxito.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Item'
 */
router.get('/items', itemController.getItems);

/**
 * @openapi
 * /api/items:
 *   post:
 *     summary: Crea un nuevo elemento en PostgreSQL
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Elemento creado con éxito.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Item'
 */
router.post('/items', itemController.createItem);

/**
 * @openapi
 * /api/items/{id}:
 *   delete:
 *     summary: Elimina un elemento por ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Elemento eliminado.
 */
router.delete('/items/:id', itemController.deleteItem);

module.exports = router;
