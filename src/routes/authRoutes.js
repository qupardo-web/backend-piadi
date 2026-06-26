const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/authMiddleware');

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Iniciar sesión y obtener token JWT
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 example: director.educacion@ecas.cl
 *                 description: Correo electrónico del usuario
 *               password:
 *                 type: string
 *                 example: mi_password_segura
 *                 description: Contraseña del usuario
 *     responses:
 *       200:
 *         description: Autenticación exitosa, retorna el token JWT.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   description: Token JWT para autenticar peticiones subsiguientes.
 *       400:
 *         description: El formato del correo es inválido o faltan campos obligatorios.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: El formato del correo es inválido o faltan campos obligatorios
 *       401:
 *         description: Usuario o contraseña incorrectos.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Usuario o contraseña incorrectos
 */
router.post('/login', authController.login);
router.post('/logout', authenticateToken, authController.logout);

module.exports = router;
