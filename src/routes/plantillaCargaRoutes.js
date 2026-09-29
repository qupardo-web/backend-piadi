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
const { authorizePlantillaUpload } = require('../middleware/plantillaUploadAuthorization');

/**
 * @openapi
 * /api/plantillas/{id}/cargar:
 *   post:
 *     tags: [Plantillas]
 *     summary: Carga un archivo Excel y procesa los datos según la plantilla, incluidas VCM e Innovación
 *     description: El id corresponde a una plantilla registrada. Requiere pertenecer al departamento propietario y tener el rol de carga de la plantilla; Rector y el grupo Rectoría poseen acceso global. La plantilla Innovación contiene las hojas Proyectos Innovación, Financiamiento y Secciones Cursos. Sus participantes se registran en Proyectos Innovación mediante N° estudiantes, N° docentes y N° funcionarios; no existe una hoja Participantes.
 *     security:
 *       - bearerAuth: []
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
 *             required: [archivo]
 *     responses:
 *       200:
 *         description: Carga exitosa.
 *       401:
 *         description: Token ausente, inválido o usuario no vigente.
 *       403:
 *         description: El usuario no tiene permisos de carga para la plantilla.
 *       404:
 *         description: Plantilla no encontrada.
 *       422:
 *         description: Error de validación del archivo.
 */
router.post('/:id/cargar', authenticateToken, authorizePlantillaUpload, upload.single('archivo'), auditLogger({ type: 'carga', action: 'UPLOAD_TEMPLATE', module: 'Carga de Datos', entity: 'Plantilla' }), plantillaController.cargarArchivo);

/**
 * @openapi
 * /api/plantillas/{id}/template:
 *   post:
 *     tags: [Plantillas]
 *     summary: Sube y guarda el archivo Excel de la plantilla directamente en la base de datos
 *     description: Requiere los mismos permisos departamentales que la carga de datos. Rector y el grupo Rectoría poseen acceso global.
 *     security:
 *       - bearerAuth: []
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
 *       401:
 *         description: Token ausente, inválido o usuario no vigente.
 *       403:
 *         description: El usuario no tiene permisos para reemplazar esta plantilla.
 *       404:
 *         description: Plantilla no encontrada.
 */
router.post('/:id/template', authenticateToken, authorizePlantillaUpload, uploadMemoria.single('archivo'), auditLogger({ type: 'carga', action: 'REPLACE_TEMPLATE_FILE', module: 'Carga de Datos', entity: 'Plantilla' }), plantillaController.subirTemplate);

module.exports = router;
