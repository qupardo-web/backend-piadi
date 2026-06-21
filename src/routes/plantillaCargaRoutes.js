const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const plantillaController = require('../controllers/plantillaController');

/**
 * @openapi
 * /api/plantillas/{id}/cargar:
 *   post:
 *     tags: [Plantillas]
 *     summary: Carga un archivo Excel y procesa los datos según la plantilla
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               archivo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Carga exitosa.
 *       400:
 *         description: Error de validación del archivo.
 */
router.post('/:id/cargar', upload.single('archivo'), plantillaController.cargarArchivo);

module.exports = router;
