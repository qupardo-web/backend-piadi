const { AppError } = require('../utils/errors');

const INTERNAL_ERROR_MESSAGE = 'Error interno, contacte al administrador';

const translateValidationError = (e) => {
  let msg = e.message;
  if (!msg) return msg;

  if (msg.includes('cannot be null')) {
    const campo = e.path || 'requerido';
    return `El campo ${campo} no puede ser nulo o estar vacío`;
  }
  if (msg.includes('Validation notEmpty on') && msg.includes('failed')) {
    const campo = e.path || 'requerido';
    return `El campo ${campo} no puede estar vacío`;
  }
  if (msg.includes('Validation is on') && msg.includes('failed')) {
    const campo = e.path || 'requerido';
    return `El formato o valor del campo ${campo} no es válido`;
  }
  if (msg.includes('Validation isEmail on') && msg.includes('failed')) {
    return `El formato del correo electrónico ingresado no es válido`;
  }
  if (msg.includes('Validation min on') && msg.includes('failed')) {
    const minVal = e.validatorArgs && e.validatorArgs[0] !== undefined ? e.validatorArgs[0] : '';
    return `El valor del campo ${e.path} debe ser mayor o igual a ${minVal}`;
  }
  if (msg.includes('Validation max on') && msg.includes('failed')) {
    const maxVal = e.validatorArgs && e.validatorArgs[0] !== undefined ? e.validatorArgs[0] : '';
    return `El valor del campo ${e.path} debe ser menor o igual a ${maxVal}`;
  }
  if (/sql|sequelize|constraint|query|stack| at |\\|\//i.test(msg)) {
    return `El valor del campo ${e.path || 'indicado'} no es válido`;
  }
  return msg;
};

/**
 * Middleware centralizado de manejo de errores para Express.
 * Intercepta errores operativos, de Sequelize y de servidor genéricos.
 */
const errorHandler = (err, req, res, next) => {
  // Log técnico sin incluir headers, tokens, body ni parámetros de la solicitud.
  console.error('[errorHandler]', {
    timestamp: new Date().toISOString(),
    operation: `${req.method || 'UNKNOWN'} ${req.originalUrl || req.path || 'UNKNOWN'}`,
    name: err.name || 'Error',
    message: err.message || '',
    stack: err.stack || ''
  });

  const declaredStatus = Number(err.statusCode || err.status);
  let statusCode = Number.isInteger(declaredStatus) && declaredStatus >= 400 && declaredStatus < 500
    ? declaredStatus
    : 500;
  let errorMessage = err instanceof AppError || statusCode < 500
    ? err.message
    : INTERNAL_ERROR_MESSAGE;

  // 2. Manejo de error de formato JSON inválido (body-parser de Express)
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    statusCode = 400;
    errorMessage = 'El cuerpo de la solicitud (body) no tiene un formato JSON válido.';
  }

  // 2. Manejo de Errores específicos de Sequelize (Base de Datos)
  
  // A. Error de Validación de Sequelize (Restricciones del modelo en JS)
  if (err.name === 'SequelizeValidationError') {
    statusCode = 422;
    errorMessage = err.errors.map(translateValidationError).join('. ');
  }

  // B. Error de Restricción Única de Sequelize (Duplicados en BD)
  if (err.name === 'SequelizeUniqueConstraintError') {
    statusCode = 409;
    errorMessage = 'El registro ya existe y no puede duplicarse.';
  }

  // C. Error de Clave Foránea de Sequelize (Relación rota en BD)
  if (err.name === 'SequelizeForeignKeyConstraintError') {
    statusCode = 409;
    errorMessage = 'No se puede completar la operación porque existen datos relacionados.';
  }

  // D. Error de conexión con la Base de Datos (Ampliado)
  const dbErrors = [
    'SequelizeConnectionRefusedError',
    'SequelizeConnectionError',
    'SequelizeTimeoutError',
    'SequelizeHostNotReachableError',
    'SequelizeHostNotFoundError',
    'SequelizeInvalidConnectionError'
  ];
  if (dbErrors.includes(err.name)) {
    statusCode = 500;
    errorMessage = INTERNAL_ERROR_MESSAGE;
  }

  // E. Errores de Autenticación de JWT nativos
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    errorMessage = 'El token de seguridad es inválido o está malformado.';
  }
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    errorMessage = 'Tu sesión ha expirado. Por favor, inicia sesión de nuevo.';
  }

  // F. Errores de Carga de Archivos (MulterError)
  if (err.name === 'MulterError') {
    statusCode = 422;
    errorMessage = 'No se pudo validar el archivo enviado.';
    if (err.code === 'LIMIT_FILE_SIZE') {
      errorMessage = 'Error al subir archivo: El tamaño del archivo excede el límite permitido.';
    } else if (err.code === 'LIMIT_UNEXPECTED_FIELD') {
      errorMessage = 'Error al subir archivo: Campo de carga inesperado en el formulario (debe ser "archivo").';
    }
  }

  // E. Error de Carga Masiva / Validación Múltiple de Sequelize (BulkRecordError / AggregateError)
  let errorsResponse = null;

  if (err.name === 'SequelizeValidationError') {
    errorsResponse = err.errors.map(errItem => {
      const msg = translateValidationError(errItem);
      return {
        message: msg,
        hoja: errItem.hoja || 'General',
        fila: errItem.fila || '',
        columna: errItem.columna || errItem.path || '',
        celda: errItem.celda || ''
      };
    });
  }

  if (err.name === 'SequelizeBulkRecordError' || err.name === 'AggregateError') {
    statusCode = 422;
    const errorsList = [];

    const collectErrors = (e) => {
      if (!e) return;
      if (e.name === 'SequelizeValidationError' && e.errors) {
        e.errors.forEach(errItem => {
          const translatedMsg = translateValidationError(errItem);
          errorsList.push({
            message: translatedMsg,
            hoja: errItem.hoja || 'General',
            fila: errItem.fila || '',
            columna: errItem.columna || errItem.path || '',
            celda: errItem.celda || ''
          });
        });
      } else if (e.errors) {
        if (Array.isArray(e.errors)) {
          e.errors.forEach(sub => collectErrors(sub));
        } else {
          collectErrors(e.errors);
        }
      } else if (e.message && e.message.includes('Validation error:')) {
        const message = translateValidationError({ ...e, message: e.message.replace('Validation error:', '').trim() });
        errorsList.push({
          message,
          hoja: e.hoja || 'General',
          fila: e.fila || '',
          columna: e.columna || e.path || '',
          celda: e.celda || ''
        });
      } else if (e.message) {
        errorsList.push({
          message: 'Uno de los registros contiene datos inválidos.',
          hoja: e.hoja || 'General',
          fila: e.fila || '',
          columna: e.columna || '',
          celda: e.celda || ''
        });
      }
    };

    collectErrors(err);

    // Keep unique errors by message
    const uniqueMap = new Map();
    for (const item of errorsList) {
      if (!uniqueMap.has(item.message)) {
        uniqueMap.set(item.message, item);
      }
    }
    const uniqueErrorsList = [...uniqueMap.values()];

    if (uniqueErrorsList.length > 0) {
      errorMessage = `Error de validación en carga: ${uniqueErrorsList.map(x => x.message).join('. ')}`;
      errorsResponse = uniqueErrorsList;
    } else {
      errorMessage = 'Error de validación en los registros de la carga.';
    }
  }

  if (statusCode >= 500) {
    statusCode = 500;
    errorMessage = INTERNAL_ERROR_MESSAGE;
    errorsResponse = null;
  }

  // 3. Respuesta pública compatible con el Frontend
  const jsonResponse = {
    error: errorMessage,
    success: false
  };

  if (errorsResponse) {
    jsonResponse.errores = errorsResponse;
  }

  res.status(statusCode).json(jsonResponse);
};

module.exports = errorHandler;
module.exports.INTERNAL_ERROR_MESSAGE = INTERNAL_ERROR_MESSAGE;
