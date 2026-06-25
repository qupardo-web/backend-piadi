const { Op } = require('sequelize');
const { sequelize } = require('../models');

const ALLOWED_SORT = ['createdAt', 'fecha', 'timestamp', 'userId', 'action', 'module'];
const ALLOWED_TYPE = ['session', 'carga', 'all'];
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

const MODEL_BY_TYPE = { session: 'AuditSesion', carga: 'AuditCarga' };

class ServiceError extends Error {
  constructor(statusCode, code, message, details = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

const getModel = (type) => {
  const name = MODEL_BY_TYPE[type];
  if (!name) {
    return null;
  }
  return sequelize.models[name] || null;
};

const attributesOf = (model) => Object.keys(model.rawAttributes);
const pickAttr = (model, candidates) => {
  const attrs = attributesOf(model);
  return candidates.find((c) => attrs.includes(c)) || null;
};

const toIntOrNull = (value) => (Number.isInteger(value) ? value : (/^\d+$/.test(String(value)) ? Number(value) : null));

const parsePage = (rawPage) => {
  if (rawPage === undefined || rawPage === '') return DEFAULT_PAGE;
  if (!/^\d+$/.test(String(rawPage)) || Number(rawPage) < 1) {
    throw new ServiceError(400, 'INVALID_PAGE', 'El parámetro "page" debe ser un número entero positivo', { page: rawPage });
  }
  return Number(rawPage);
};

const parseLimit = (rawLimit) => {
  if (rawLimit === undefined || rawLimit === '') return DEFAULT_LIMIT;
  if (!/^\d+$/.test(String(rawLimit)) || Number(rawLimit) < 1 || Number(rawLimit) > MAX_LIMIT) {
    throw new ServiceError(400, 'INVALID_LIMIT', 'El parámetro "limit" debe ser un número entero positivo de máximo 100', { limit: rawLimit, max: MAX_LIMIT });
  }
  return Number(rawLimit);
};

const parseDateRange = (fromDate, toDate) => {
  const range = { fromDate: null, toDate: null };
  if (fromDate !== undefined && fromDate !== '') {
    const parsed = new Date(fromDate);
    if (Number.isNaN(parsed.getTime())) {
      throw new ServiceError(400, 'INVALID_DATE_RANGE', 'El rango de fechas es inválido: "fromDate" debe ser una fecha válida', { fromDate });
    }
    range.fromDate = parsed;
  }
  if (toDate !== undefined && toDate !== '') {
    const parsed = new Date(toDate);
    if (Number.isNaN(parsed.getTime())) {
      throw new ServiceError(400, 'INVALID_DATE_RANGE', 'El rango de fechas es inválido: "toDate" debe ser una fecha válida', { toDate });
    }
    range.toDate = parsed;
  }
  if (range.fromDate && range.toDate && range.fromDate > range.toDate) {
    throw new ServiceError(400, 'INVALID_DATE_RANGE', 'El rango de fechas es inválido: "fromDate" no puede ser posterior a "toDate"', { fromDate, toDate });
  }
  return range;
};

const validateSortBy = (sortBy) => {
  if (sortBy === undefined || sortBy === '') return 'createdAt';
  if (!ALLOWED_SORT.includes(sortBy)) {
    throw new ServiceError(400, 'INVALID_SORT_FIELD', 'El campo de ordenamiento "sortBy" no está permitido', { sortBy, allowed: ALLOWED_SORT });
  }
  return sortBy;
};

const validateOrder = (order) => {
  if (order === undefined || order === '') return 'desc';
  if (order !== 'asc' && order !== 'desc') {
    throw new ServiceError(400, 'INVALID_ORDER', 'El parámetro "order" debe ser "asc" o "desc"', { order });
  }
  return order;
};

const validateType = (rawType) => {
  if (rawType === undefined || rawType === '') return 'all';
  if (!ALLOWED_TYPE.includes(rawType)) {
    throw new ServiceError(400, 'INVALID_AUDIT_TYPE', 'El parámetro "type" debe ser "session", "carga" o "all"', { type: rawType });
  }
  return rawType;
};

const persist = async (model, payload) => {
  if (!model) {
    return { persisted: false, reason: 'model-not-found' };
  }
  try {
    const attrs = attributesOf(model);
    const filtered = {};
    for (const [field, value] of Object.entries(payload)) {
      if (attrs.includes(field) && value !== undefined) {
        filtered[field] = value;
      }
    }
    await model.create(filtered);
    return { persisted: true };
  } catch (err) {
    console.warn(`[auditService] No se pudo persistir auditoría: ${err.message}`);
    return { persisted: false, reason: 'persist-error' };
  }
};

const recordSession = async (payload = {}) => persist(getModel('session'), {
  usuarioId: toIntOrNull(payload.userId),
  rol: payload.role || null,
  accion: payload.action || 'UNKNOWN_ACTION',
  entidad: payload.entity || payload.module || 'Sesión',
  detalles: payload.detalles || (payload.module || payload.path ? JSON.stringify({ module: payload.module || null, method: payload.method || null, path: payload.path || null }) : null)
});

const recordCarga = async (payload = {}) => persist(getModel('carga'), {
  usuarioId: toIntOrNull(payload.userId),
  rol: payload.role || null,
  accion: payload.action || 'UNKNOWN_ACTION',
  entidad: payload.entity || payload.module || 'Carga',
  plantilla: payload.plantilla || null,
  archivo: payload.archivo || null
});

const record = async (type, payload = {}) => (type === 'carga' ? recordCarga(payload) : recordSession(payload));

const buildWhere = (model, filters, range) => {
  const where = {};
  const userIdAttr = pickAttr(model, ['usuarioId', 'userId', 'idUsuario']);
  const actionAttr = pickAttr(model, ['accion', 'action']);
  const moduleAttr = pickAttr(model, ['modulo', 'module', 'entidad']);
  const dateAttr = pickAttr(model, ['fecha', 'createdAt', 'timestamp']);

  if (filters.userId && userIdAttr) {
    const uid = toIntOrNull(filters.userId);
    if (uid !== null) where[userIdAttr] = uid;
  }
  if (filters.action && actionAttr) where[actionAttr] = filters.action;
  if (filters.module && moduleAttr) where[moduleAttr] = filters.module;
  if (dateAttr && (range.fromDate || range.toDate)) {
    where[dateAttr] = {};
    if (range.fromDate) where[dateAttr][Op.gte] = range.fromDate;
    if (range.toDate) where[dateAttr][Op.lte] = range.toDate;
  }
  return where;
};

const normalizeRow = (model, row, type) => {
  const plain = typeof row.toJSON === 'function' ? row.toJSON() : row;
  const actionAttr = pickAttr(model, ['accion', 'action']);
  const moduleAttr = pickAttr(model, ['modulo', 'module', 'entidad']);
  const dateAttr = pickAttr(model, ['fecha', 'createdAt', 'timestamp']);
  const idAttr = model.primaryKeyAttribute || 'id';
  return {
    id: plain[idAttr] !== undefined ? plain[idAttr] : null,
    type,
    action: actionAttr ? plain[actionAttr] : null,
    module: moduleAttr ? plain[moduleAttr] : null,
    createdAt: dateAttr ? plain[dateAttr] : null,
    usuarioNombre: plain.usuario?.name || null,
    usuarioEmail: plain.usuario?.email || null,
    detail: plain
  };
};

const sortKey = (item, sortBy) => {
  if (sortBy === 'userId') return item.detail && (item.detail.usuarioId ?? item.detail.userId);
  if (sortBy === 'action') return item.action;
  if (sortBy === 'module') return item.module;
  return item.createdAt;
};

const query = async (params = {}) => {
  const page = parsePage(params.page);
  const limit = parseLimit(params.limit);
  const sortBy = validateSortBy(params.sortBy);
  const order = validateOrder(params.order);
  const range = parseDateRange(params.fromDate, params.toDate);
  const type = validateType(params.type);

  const filters = { userId: params.userId, action: params.action, module: params.module };
  const types = type === 'all' ? ['session', 'carga'] : [type];
  const active = types.map((t) => ({ type: t, model: getModel(t) })).filter((e) => e.model);

  if (active.length === 0) {
    return {
      data: {
        items: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
        sourceConnected: false,
        message: 'Auditoría preparada. Los modelos AuditSesion y AuditCarga aún no están disponibles.'
      }
    };
  }

  const userModel = sequelize.models['User'] || null;
  const userInclude = userModel
    ? [{ model: userModel, as: 'usuario', attributes: ['name', 'email'], required: false }]
    : [];

  let rows = [];
  for (const entry of active) {
    const found = await entry.model.findAll({
      where: buildWhere(entry.model, filters, range),
      include: userInclude
    });
    rows = rows.concat(found.map((r) => normalizeRow(entry.model, r, entry.type)));
  }

  const dir = order === 'asc' ? 1 : -1;
  rows.sort((a, b) => {
    const av = sortKey(a, sortBy);
    const bv = sortKey(b, sortBy);
    if (av === bv) return 0;
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    return av > bv ? dir : -dir;
  });

  const total = rows.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;

  return {
    data: {
      items: rows.slice(start, start + limit),
      pagination: { page, limit, total, totalPages },
      sourceConnected: true
    }
  };
};

module.exports = {
  ServiceError,
  recordSession,
  recordCarga,
  record,
  query
};
