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

module.exports = router;
