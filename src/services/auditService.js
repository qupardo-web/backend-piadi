const ALLOWED_SORT = ['createdAt', 'timestamp', 'userId', 'role', 'action', 'module', 'entity'];
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

class ServiceError extends Error {
  constructor(statusCode, code, message, details = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

const parsePage = (rawPage) => {
  if (rawPage === undefined || rawPage === '') {
    return DEFAULT_PAGE;
  }
  if (!/^\d+$/.test(String(rawPage)) || Number(rawPage) < 1) {
    throw new ServiceError(400, 'INVALID_PAGE', 'El parámetro "page" debe ser un número entero positivo', {
      page: rawPage
    });
  }
  return Number(rawPage);
};

const parseLimit = (rawLimit) => {
  if (rawLimit === undefined || rawLimit === '') {
    return DEFAULT_LIMIT;
  }
  if (!/^\d+$/.test(String(rawLimit)) || Number(rawLimit) < 1 || Number(rawLimit) > MAX_LIMIT) {
    throw new ServiceError(400, 'INVALID_LIMIT', 'El parámetro "limit" debe ser un número entero positivo de máximo 100', {
      limit: rawLimit,
      max: MAX_LIMIT
    });
  }
  return Number(rawLimit);
};

const parseDateRange = (fromDate, toDate) => {
  const range = { fromDate: null, toDate: null };
  if (fromDate !== undefined && fromDate !== '') {
    const parsed = new Date(fromDate);
    if (Number.isNaN(parsed.getTime())) {
      throw new ServiceError(400, 'INVALID_DATE_RANGE', 'El rango de fechas es inválido: "fromDate" debe ser una fecha válida', {
        fromDate
      });
    }
    range.fromDate = parsed.toISOString();
  }
  if (toDate !== undefined && toDate !== '') {
    const parsed = new Date(toDate);
    if (Number.isNaN(parsed.getTime())) {
      throw new ServiceError(400, 'INVALID_DATE_RANGE', 'El rango de fechas es inválido: "toDate" debe ser una fecha válida', {
        toDate
      });
    }
    range.toDate = parsed.toISOString();
  }
  if (range.fromDate && range.toDate && new Date(range.fromDate) > new Date(range.toDate)) {
    throw new ServiceError(400, 'INVALID_DATE_RANGE', 'El rango de fechas es inválido: "fromDate" no puede ser posterior a "toDate"', {
      fromDate,
      toDate
    });
  }
  return range;
};

const validateSortBy = (sortBy) => {
  if (sortBy === undefined || sortBy === '') {
    return 'createdAt';
  }
  if (!ALLOWED_SORT.includes(sortBy)) {
    throw new ServiceError(400, 'INVALID_SORT_FIELD', 'El campo de ordenamiento "sortBy" no está permitido', {
      sortBy,
      allowed: ALLOWED_SORT
    });
  }
  return sortBy;
};

const validateOrder = (order) => {
  if (order === undefined || order === '') {
    return 'desc';
  }
  if (order !== 'asc' && order !== 'desc') {
    throw new ServiceError(400, 'INVALID_ORDER', 'El parámetro "order" debe ser "asc" o "desc"', { order });
  }
  return order;
};

const record = (entry) => ({
  persisted: false,
  sourceConnected: false,
  entry: entry || null
});

const query = (params = {}) => {
  const page = parsePage(params.page);
  const limit = parseLimit(params.limit);
  validateSortBy(params.sortBy);
  validateOrder(params.order);
  parseDateRange(params.fromDate, params.toDate);
  return {
    data: {
      items: [],
      pagination: {
        page,
        limit,
        total: 0,
        totalPages: 0
      },
      sourceConnected: false,
      message: 'No hay registros de auditoría disponibles porque aún no existe persistencia conectada.'
    }
  };
};

module.exports = {
  ServiceError,
  record,
  query
};
