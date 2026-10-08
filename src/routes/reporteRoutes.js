const express = require('express');
const reporteController = require('../controllers/reporteController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { requireReportesGestion } = require('../middleware/reporteAuthorization');

const router = express.Router();

/**
 * @openapi
 * /api/reportes:
 *   get:
 *     tags: [Reportes]
 *     summary: Lista los reportes visibles para el usuario (según su alcance)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tipo
 *         schema: { type: string, enum: [PREDEFINIDO, PERSONALIZADO] }
 *       - in: query
 *         name: activo
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: Listado de reportes.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Reporte' }
 *       401:
 *         description: No autenticado.
 */
router.get('/', authenticateToken, reporteController.listReportes);

/**
 * @openapi
 * /api/reportes:
 *   post:
 *     tags: [Reportes]
 *     summary: Crea un reporte (Rectoría o Dirección)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre]
 *             properties:
 *               nombre: { type: string }
 *               descripcion: { type: string }
 *               tipo: { type: string, enum: [PREDEFINIDO, PERSONALIZADO] }
 *               indicadores: { type: array, items: { type: string } }
 *               filtros: { type: object }
 *               departmentId: { type: string }
 *               roleId: { type: integer }
 *               formato: { type: string, enum: [XLSX, PDF] }
 *               activo: { type: boolean }
 *     responses:
 *       201:
 *         description: Reporte creado.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Reporte' }
 *       400:
 *         description: Datos inválidos.
 *       403:
 *         description: El rol no puede gestionar reportes.
 */
router.post('/', authenticateToken, requireReportesGestion, reporteController.createReporte);

/**
 * @openapi
 * /api/reportes/tipos:
 *   get:
 *     tags: [Reportes]
 *     summary: Catálogo de tipos de reporte
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de tipos.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: array, items: { type: string } }
 */
router.get('/tipos', authenticateToken, reporteController.listTipos);

/**
 * @openapi
 * /api/reportes/formatos:
 *   get:
 *     tags: [Reportes]
 *     summary: Catálogo de formatos de salida
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de formatos.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: array, items: { type: string } }
 */
router.get('/formatos', authenticateToken, reporteController.listFormatos);

/**
 * @openapi
 * /api/reportes/areas:
 *   get:
 *     tags: [Reportes]
 *     summary: Catálogo de áreas (departamentos)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de áreas.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: array, items: { type: object } }
 */
router.get('/areas', authenticateToken, reporteController.listAreas);

/**
 * @openapi
 * /api/reportes/{id}/descargar:
 *   get:
 *     tags: [Reportes]
 *     summary: Genera y descarga el Excel del reporte (registra la ejecución)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Archivo Excel.
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema: { type: string, format: binary }
 *       400:
 *         description: El reporte está inactivo.
 *       403:
 *         description: Sin acceso al reporte.
 *       404:
 *         description: Reporte no encontrado.
 */
router.get('/:id/descargar', authenticateToken, reporteController.descargarReporte);

/**
 * @openapi
 * /api/reportes/{id}/ejecuciones:
 *   get:
 *     tags: [Reportes]
 *     summary: Lista las ejecuciones de un reporte
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Listado de ejecuciones.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/ReporteEjecucion' }
 *       404:
 *         description: Reporte no encontrado.
 */
router.get('/:id/ejecuciones', authenticateToken, reporteController.listEjecuciones);

/**
 * @openapi
 * /api/reportes/{id}:
 *   get:
 *     tags: [Reportes]
 *     summary: Obtiene un reporte por ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Reporte encontrado.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Reporte' }
 *       403:
 *         description: El reporte está fuera del alcance del usuario.
 *       404:
 *         description: Reporte no encontrado.
 *   put:
 *     tags: [Reportes]
 *     summary: Actualiza un reporte (parcial)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200:
 *         description: Reporte actualizado.
 *       400:
 *         description: Sin campos válidos para actualizar.
 *       403:
 *         description: El rol no puede gestionar reportes.
 *       404:
 *         description: Reporte no encontrado.
 *   delete:
 *     tags: [Reportes]
 *     summary: Elimina un reporte
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Reporte eliminado.
 *       403:
 *         description: El rol no puede gestionar reportes.
 *       404:
 *         description: Reporte no encontrado.
 */
router.get('/:id', authenticateToken, reporteController.getReporte);
router.put('/:id', authenticateToken, requireReportesGestion, reporteController.updateReporte);
router.delete('/:id', authenticateToken, requireReportesGestion, reporteController.deleteReporte);

module.exports = router;
