const jwt = require('jsonwebtoken');
const { UnauthorizedError, ForbiddenError } = require('../utils/errors');

const JWT_SECRET = process.env.JWT_SECRET || 'secret-secreto-super-seguro';

/**
 * Middleware to authenticate requests using JWT.
 * Expects the header: Authorization: Bearer <TOKEN>
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const bearerMatch = typeof authHeader === 'string'
    ? authHeader.match(/^Bearer\s+(\S+)$/i)
    : null;
  const token = bearerMatch && bearerMatch[1];

  if (!token) {
    return next(new UnauthorizedError('Token de autenticación no proporcionado'));
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return next(new UnauthorizedError('Token inválido o expirado'));
    }
    
    // Attach decoded user information to the request
    req.user = decoded;
    next();
  });
};

const authorizeRoles = (...allowedRolesOrGroups) => {
  const allowed = new Set(allowedRolesOrGroups);

  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Usuario no autenticado'));
    }

    const hasRole = allowed.has(req.user.role);
    const hasGroup = allowed.has(req.user.roleGroup);

    if (!hasRole && !hasGroup) {
      return next(new ForbiddenError('Acceso denegado: permisos insuficientes'));
    }

    next();
  };
};

module.exports = {
  authenticateToken,
  authorizeRoles,
  JWT_SECRET
};
