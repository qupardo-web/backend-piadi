const { AppError } = require('../utils/errors');

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
  return msg;
};

/**
 * Middleware centralizado de manejo de errores para Express.
 * Intercepta errores operativos, de Sequelize y de servidor genéricos.
 */
const errorHandler = (err, req, res, next) => {
  // 1. Logs de error detallados en consola para desarrollo
  console.error('--- ERROR DETECTADO ---');
  console.error(err);
  console.error('----------------------');

  let statusCode = err.statusCode || err.status || 500;
  let errorMessage = err.message || 'Error interno del servidor';

  // 2. Manejo de error de formato JSON inválido (body-parser de Express)
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    statusCode = 400;
    errorMessage = 'El cuerpo de la solicitud (body) no tiene un formato JSON válido.';
  }

  // 2. Manejo de Errores específicos de Sequelize (Base de Datos)
  
  // A. Error de Validación de Sequelize (Restricciones del modelo en JS)
  if (err.name === 'SequelizeValidationError') {
    statusCode = 400;
    errorMessage = err.errors.map(translateValidationError).join('. ');
  }

  // B. Error de Restricción Única de Sequelize (Duplicados en BD)
  if (err.name === 'SequelizeUniqueConstraintError') {
    statusCode = 409;
    // Intentar dar un mensaje descriptivo o usar uno amigable por defecto
    const camposDuplicados = err.errors.map(e => e.path).join(', ');
    errorMessage = `El registro ya existe. Conflicto de unicidad en campo(s): ${camposDuplicados}`;
  }

  // C. Error de Clave Foránea de Sequelize (Relación rota en BD)
  if (err.name === 'SequelizeForeignKeyConstraintError') {
    statusCode = 400;
    let detail = err.parent ? err.parent.detail : '';
    if (detail) {
      detail = detail
        .replace(/Key \((.*?)\)=\((.*?)\) is not present in table "(.*?)"\./g, 'La clave ($1)=($2) no existe en la tabla "$3".')
        .replace(/Key \((.*?)\)=\((.*?)\) is still referenced from table "(.*?)"\./g, 'La clave ($1)=($2) todavía está referenciada por la tabla "$3".');
    }
    const tabla = err.table ? ` en la tabla "${err.table}"` : '';
    errorMessage = `Error de integridad referencial${tabla}. ${detail ? `Detalle: ${detail}` : 'El registro al que intentas hacer referencia no existe.'}`;
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
    errorMessage = 'No se pudo establecer conexión o comunicación con la base de datos.';
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
    statusCode = 400;
    errorMessage = `Error al subir archivo: ${err.message}`;
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
        message: errItem.message || msg,
        hoja: errItem.hoja || 'General',
        fila: errItem.fila || '',
        celda: errItem.celda || ''
      };
    });
  }

  if (err.name === 'SequelizeBulkRecordError' || err.name === 'AggregateError') {
    statusCode = 400;
    const errorsList = [];

    const collectErrors = (e) => {
      if (!e) return;
      if (e.name === 'SequelizeValidationError' && e.errors) {
        e.errors.forEach(errItem => {
          const translatedMsg = translateValidationError(errItem);
          errorsList.push({
            message: errItem.message || translatedMsg,
            hoja: errItem.hoja || 'General',
            fila: errItem.fila || '',
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
        errorsList.push({
          message: e.message.replace('Validation error:', '').trim(),
          hoja: e.hoja || 'General',
          fila: e.fila || '',
          celda: e.celda || ''
        });
      } else if (e.message) {
        errorsList.push({
          message: e.message,
          hoja: e.hoja || 'General',
          fila: e.fila || '',
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

  // 3. Respuesta compatible con el Frontend (Retorna llave "error")
  const jsonResponse = {
    error: errorMessage,
    success: false, // Extra para utilidades del frontend
    errorType: err.name || 'InternalServerError' // Extra informativo
  };

  if (errorsResponse) {
    jsonResponse.errores = errorsResponse;
  }

  res.status(statusCode).json(jsonResponse);
};

module.exports = errorHandler;
