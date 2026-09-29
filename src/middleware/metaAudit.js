const auditService = require('../services/auditService');
const { isRectoria } = require('./rectoriaAuthorization');

const META_FIELDS = [
  'departmentId', 'anio', 'periodo', 'nombre', 'fechaInicio', 'fechaLimite',
  'prioridad', 'comportamiento', 'indicatorKey', 'valorMeta'
];
const METRIC_FIELDS = [
  'indicatorKey', 'weight', 'behavior', 'targetValue', 'valueType', 'lowerLimit', 'upperLimit'
];

const toPlain = (value) => {
  if (!value) return {};
  if (typeof value.toJSON === 'function') return value.toJSON();
  if (typeof value.get === 'function') return value.get({ plain: true });
  return value;
};

const normalizeValue = (value) => value instanceof Date
  ? value.toISOString()
  : (value === undefined ? null : value);

const pickFields = (source, fields) => fields.reduce((result, field) => {
  if (Object.prototype.hasOwnProperty.call(source, field)) {
    result[field] = normalizeValue(source[field]);
  }
  return result;
}, {});

const safeMetricSnapshot = (metrics = []) => metrics
  .map((metric) => pickFields(toPlain(metric), METRIC_FIELDS))
  .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

const safeMetaSnapshot = (meta, { includeMetrics = false } = {}) => {
  const plain = toPlain(meta);
  const snapshot = pickFields(plain, META_FIELDS);
  if (includeMetrics && Array.isArray(plain.metrics)) {
    snapshot.metrics = safeMetricSnapshot(plain.metrics);
  }
  return snapshot;
};

const buildChanges = (before, after) => {
  const previous = safeMetaSnapshot(before, { includeMetrics: true });
  const current = safeMetaSnapshot(after, { includeMetrics: true });
  const keys = new Set([...Object.keys(previous), ...Object.keys(current)]);
  const changes = {};

  for (const field of keys) {
    if (JSON.stringify(previous[field] ?? null) !== JSON.stringify(current[field] ?? null)) {
      changes[field] = { before: previous[field] ?? null, after: current[field] ?? null };
    }
  }
  return changes;
};

const resolveAuditAction = (operation, req, before) => {
  if (operation === 'CREATE') return 'META_CREATED';
  if (operation === 'DELETE') return 'META_DELETED';
  if (isRectoria(req.user) && before.departmentId !== null && before.departmentId !== undefined) {
    return 'UPDATE_DEPARTMENTAL_META';
  }
  return 'META_UPDATED';
};

const buildAuditDetails = (operation, req, context) => {
  const before = toPlain(context.before);
  const after = toPlain(context.after);
  const reference = operation === 'DELETE' ? before : after;
  const hasReferenceField = (field) => Object.prototype.hasOwnProperty.call(reference, field);
  const details = {
    metaId: hasReferenceField('id') ? reference.id : (before.id ?? null),
    metaName: hasReferenceField('nombre') ? reference.nombre : (before.nombre ?? null),
    departmentId: hasReferenceField('departmentId') ? reference.departmentId : (before.departmentId ?? null),
    roleGroup: req.user.roleGroup || null,
    method: req.method,
    path: req.originalUrl
  };

  if (operation === 'CREATE') {
    details.metricCount = Array.isArray(after.metrics) ? after.metrics.length : 0;
  } else if (operation === 'UPDATE') {
    details.changes = buildChanges(before, after);
  } else if (operation === 'DELETE') {
    details.reference = pickFields(before, ['nombre', 'anio', 'periodo']);
  }
  return details;
};

const persistAudit = (req, operation, context) => {
  const before = toPlain(context.before);
  return auditService.record('session', {
    userId: req.user.id,
    role: req.user.role || req.user.roleGroup || null,
    action: resolveAuditAction(operation, req, before),
    entity: 'Meta',
    detalles: JSON.stringify(buildAuditDetails(operation, req, context))
  });
};

const auditMetaOperation = (operation) => function auditMetaOperationMiddleware(req, res, next) {
  res.on('finish', () => {
    if (res.statusCode >= 400 || !res.locals?.metaAudit) return;
    Promise.resolve()
      .then(() => persistAudit(req, operation, res.locals.metaAudit))
      .catch((error) => console.warn(`[metaAudit] No se pudo registrar ${operation}: ${error.message}`));
  });
  next();
};

// Se conserva para compatibilidad con las pruebas y el contrato previo de PIADI-218.
// Las rutas usan auditMetaOperation para emitir un solo evento por operación.
const auditRectoriaDepartmentalMetaUpdate = (req, res, next) => {
  const isDepartmentalUpdate = isRectoria(req.user)
    && req.meta
    && req.meta.departmentId !== null
    && req.meta.departmentId !== undefined;

  if (isDepartmentalUpdate) {
    res.on('finish', () => {
      if (res.statusCode >= 400) return;
      const details = JSON.stringify({
        metaId: req.meta.id,
        metaName: req.meta.nombre || null,
        departmentId: req.meta.departmentId,
        method: req.method,
        path: req.originalUrl
      });
      Promise.resolve(auditService.record('session', {
        userId: req.user.id,
        role: req.user.role || req.user.roleGroup || null,
        action: 'UPDATE_DEPARTMENTAL_META',
        entity: 'Meta',
        detalles: details
      })).catch(() => {});
    });
  }
  next();
};

module.exports = {
  auditMetaOperation,
  auditRectoriaDepartmentalMetaUpdate,
  safeMetaSnapshot,
  buildChanges,
  buildAuditDetails
};
