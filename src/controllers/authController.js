const jwt = require('jsonwebtoken');
const { User, Role } = require('../models');
const { JWT_SECRET } = require('../middleware/authMiddleware');
const { ValidationError, UnauthorizedError } = require('../utils/errors');

/**
 * Controller to handle user login authentication.
 */
const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    // Validate presence of username and password
    if (!username || !password) {
      throw new ValidationError('El formato del correo es inválido o faltan campos obligatorios');
    }

    // Validate email format (allowing 'admin' as a special dev username case)
    if (username !== 'admin') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(username)) {
        throw new ValidationError('El formato del correo es inválido o faltan campos obligatorios');
      }
    }

    // Find the user by username or email
    const { Op } = require('sequelize');
    const user = await User.findOne({
      where: {
        [Op.or]: [
          { email: username },
          { username: username }
        ]
      },
      include: [{ model: Role, as: 'role' }]
    });

    if (!user) {
      throw new UnauthorizedError('Usuario o contraseña incorrectos');
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw new UnauthorizedError('Usuario o contraseña incorrectos');
    }

    // Generate JWT token
    const payload = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role ? user.role.name : null,
      roleGroup: user.role ? user.role.group : null
    };

    // Sign the token with an expiration of 2 hours
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '2h' });

    return res.status(200).json({ token });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login
};
