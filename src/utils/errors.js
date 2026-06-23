/**
 * Clase base para errores operativos conocidos de la aplicación.
 */
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error 400 - Solicitud Incorrecta (Ej: datos de entrada inválidos, campos faltantes)
 */
class ValidationError extends AppError {
  constructor(message = 'Los datos enviados son inválidos') {
    super(message, 400);
  }
}

/**
 * Error 401 - No Autorizado (Ej: credenciales incorrectas, token expirado)
 */
class UnauthorizedError extends AppError {
  constructor(message = 'No autorizado para acceder a este recurso') {
    super(message, 401);
  }
}

/**
 * Error 403 - Prohibido (Ej: el usuario está autenticado pero no tiene permisos/roles)
 */
class ForbiddenError extends AppError {
  constructor(message = 'No tienes permisos para realizar esta acción') {
    super(message, 403);
  }
}

/**
 * Error 404 - No Encontrado (Ej: plantilla o recurso inexistente)
 */
class NotFoundError extends AppError {
  constructor(message = 'El recurso solicitado no fue encontrado') {
    super(message, 404);
  }
}

/**
 * Error 409 - Conflicto (Ej: intento de duplicar datos únicos)
 */
class ConflictError extends AppError {
  constructor(message = 'El recurso ya existe o hay un conflicto con los datos actuales') {
    super(message, 409);
  }
}

module.exports = {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError
};
