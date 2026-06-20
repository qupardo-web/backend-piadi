const express = require('express');
const router = express.Router();
const plantillaController = require('../controllers/plantillaController');

/**
 * @openapi
 * /api/plantillas:
 *   get:
 *     tags: [Plantillas]
 *     summary: Obtiene la lista de plantillas
 *     responses:
 *       200:
 *         description: Lista de plantillas obtenida con éxito.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Plantilla'
 */
router.get('/', plantillaController.getPlantillas);

/**
 * @openapi
 * /api/plantillas/{id}:
 *   get:
 *     tags: [Plantillas]
 *     summary: Obtiene una plantilla por ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Plantilla encontrada.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Plantilla'
 *       404:
 *         description: Plantilla no encontrada.
 */
router.get('/:id', plantillaController.getPlantilla);

/**
 * @openapi
 * /api/plantillas:
 *   post:
 *     tags: [Plantillas]
 *     summary: Crea una nueva plantilla
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - roleId
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               roleId:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Plantilla creada con éxito.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Plantilla'
 *       400:
 *         description: Faltan campos obligatorios.
 */
router.post('/', plantillaController.createPlantilla);

/**
 * @openapi
 * /api/plantillas/{id}:
 *   put:
 *     tags: [Plantillas]
 *     summary: Actualiza una plantilla existente
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               roleId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Plantilla actualizada con éxito.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Plantilla'
 *       404:
 *         description: Plantilla no encontrada.
 */
router.put('/:id', plantillaController.updatePlantilla);

/**
 * @openapi
 * /api/plantillas/{id}:
 *   delete:
 *     tags: [Plantillas]
 *     summary: Elimina una plantilla por ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Plantilla eliminada.
 *       404:
 *         description: Plantilla no encontrada.
 */
router.delete('/:id', plantillaController.deletePlantilla);

module.exports = router;