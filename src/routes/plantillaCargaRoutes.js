const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

// Configuración de multer en memoria para recibir binarios directos
const storageMemoria = multer.memoryStorage();
const uploadMemoria = multer({ storage: storageMemoria });

const plantillaController = require('../controllers/plantillaController');
const auditLogger = require('../middleware/auditLogger');
const { authenticateToken } = require('../middleware/authMiddleware');
const { requireVcmUploadRole } = require('../middleware/vcmUploadAuthorization');

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
 *       422:
 *         description: Error de validación del archivo.
 */
router.post('/:id/cargar', authenticateToken, requireVcmUploadRole, upload.single('archivo'), auditLogger({ type: 'carga', action: 'UPLOAD_TEMPLATE', module: 'Carga de Datos', entity: 'Plantilla' }), plantillaController.cargarArchivo);

/**
 * @openapi
 * /api/plantillas/{id}/template:
 *   post:
 *     tags: [Plantillas]
 *     summary: Sube y guarda el archivo Excel de la plantilla directamente en la base de datos
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
 *         description: Archivo guardado con éxito.
 *       400:
 *         description: Petición inválida.
 *       404:
 *         description: Plantilla no encontrada.
 */
router.post('/:id/template', uploadMemoria.single('archivo'), plantillaController.subirTemplate);

/**
 * @openapi
 * /api/plantillas/{id}/template:
 *   post:
 *     tags: [Plantillas]
 *     summary: Sube y guarda el archivo Excel de la plantilla directamente en la base de datos
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
 *         description: Archivo guardado con éxito.
 *       400:
 *         description: Petición inválida.
 *       404:
 *         description: Plantilla no encontrada.
 */
router.post('/:id/template', uploadMemoria.single('archivo'), plantillaController.subirTemplate);

module.exports = router;
