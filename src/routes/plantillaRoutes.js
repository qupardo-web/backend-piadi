const express = require('express');
const router = express.Router();
const plantillaController = require('../controllers/plantillaController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { authorizePlantillaAdministration } = require('../middleware/plantillaUploadAuthorization');

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
 *               allOf:
 *                 - $ref: '#/components/schemas/Plantilla'
 *                 - type: object
 *                   required: [hojas]
 *                   properties:
 *                     hojas:
 *                       type: array
 *                       description: Requisitos Excel configurados en CampoPlantilla. Si no hay campos configurados, se devuelve un arreglo vacío.
 *                       items:
 *                         type: object
 *                         required: [nombre, campos]
 *                         properties:
 *                           nombre:
 *                             type: string
 *                             description: Nombre exacto de la hoja Excel.
 *                           campos:
 *                             type: array
 *                             items:
 *                               type: object
 *                               required: [columna, requerido]
 *                               properties:
 *                                 columna:
 *                                   type: string
 *                                   description: Nombre exacto de la cabecera Excel.
 *                                 requerido:
 *                                   type: boolean
 *                                   description: Indica si la columna es obligatoria.
 *                       example:
 *                         - nombre: Proyectos Innovación
 *                           campos:
 *                             - columna: ID Proyecto
 *                               requerido: true
 *                             - columna: N° estudiantes
 *                               requerido: true
 *                         - nombre: Financiamiento
 *                           campos:
 *                             - columna: Monto adjudicado CLP
 *                               requerido: true
 *                         - nombre: Secciones Cursos
 *                           campos:
 *                             - columna: ID Sección
 *                               requerido: true
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
 *     description: Operación administrativa exclusiva de Rectoría.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - roleId
 *               - departmentId
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               roleId:
 *                 type: integer
 *               departmentId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Plantilla creada con éxito.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Plantilla'
 *       400:
 *         description: Faltan campos obligatorios.
 *       401:
 *         description: Token ausente, inválido o usuario no vigente.
 *       403:
 *         description: Solo Rectoría puede administrar plantillas.
 */
router.post('/', authenticateToken, authorizePlantillaAdministration, plantillaController.createPlantilla);

/**
 * @openapi
 * /api/plantillas/{id}:
 *   put:
 *     tags: [Plantillas]
 *     summary: Actualiza una plantilla existente
 *     description: Operación administrativa exclusiva de Rectoría.
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
 *               departmentId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Plantilla actualizada con éxito.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Plantilla'
 *       404:
 *         description: Plantilla no encontrada.
 *       401:
 *         description: Token ausente, inválido o usuario no vigente.
 *       403:
 *         description: Solo Rectoría puede administrar plantillas.
 */
router.put('/:id', authenticateToken, authorizePlantillaAdministration, plantillaController.updatePlantilla);

/**
 * @openapi
 * /api/plantillas/{id}:
 *   delete:
 *     tags: [Plantillas]
 *     summary: Elimina una plantilla por ID
 *     description: Operación administrativa exclusiva de Rectoría.
 *     security:
 *       - bearerAuth: []
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
 *       401:
 *         description: Token ausente, inválido o usuario no vigente.
 *       403:
 *         description: Solo Rectoría puede administrar plantillas.
 */
router.delete('/:id', authenticateToken, authorizePlantillaAdministration, plantillaController.deletePlantilla);

/**
 * @openapi
 * /api/plantillas/{id}/descargar:
 *   get:
 *     tags: [Plantillas]
 *     summary: Descarga el archivo Excel asociado a una plantilla, incluidas VCM e Innovación
 *     description: Para Innovación, use el id de la plantilla Innovación registrada. El XLSX contiene las hojas Proyectos Innovación, Financiamiento y Secciones Cursos, con los participantes agregados en la hoja de proyectos.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Archivo Excel (.xlsx) devuelto con éxito.
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Plantilla o archivo no encontrado.
 */
router.get('/:id/descargar', plantillaController.descargarExcel);

module.exports = router;
