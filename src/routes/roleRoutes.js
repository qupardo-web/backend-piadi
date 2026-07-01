const express = require('express');
const router = express.Router();
const roleController = require('../controllers/roleController');

/**
 * @openapi
 * /api/roles:
 *   get:
 *     tags: [Roles]
 *     summary: Obtiene el listado de roles del sistema
 *     responses:
 *       200:
 *         description: Lista de roles disponible.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Role'
 */
router.get('/', roleController.getRoles);

/**
 * @openapi
 * /api/roles/{id}:
 *   get:
 *     tags: [Roles]
 *     summary: Obtiene un rol específico por ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Datos del rol.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Role'
 *       404:
 *         description: Rol no encontrado.
 */
router.get('/:id', roleController.getRoleById);

module.exports = router;
