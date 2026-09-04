const metaService = require('../services/metaService');
const metaProgressService = require('../services/metaProgressService');

const META_PUBLIC_FIELDS = [
  'id', 'indicatorKey', 'departmentId', 'anio', 'valorMeta', 'periodo', 'nombre',
  'fechaInicio', 'fechaLimite', 'prioridad', 'comportamiento', 'inicio', 'limite',
  'totalProgress', 'elapsedProgress', 'status'
];
const METRIC_PUBLIC_FIELDS = [
  'id', 'metricId', 'indicatorKey', 'weight', 'behavior', 'targetValue', 'valueType',
  'lowerLimit', 'upperLimit', 'currentValue', 'progress', 'weightedProgress',
  'hasData', 'calculationIssue'
];

const toPlain = (value) => {
  if (!value) return {};
  if (typeof value.toJSON === 'function') return value.toJSON();
  if (typeof value.get === 'function') return value.get({ plain: true });
  return value;
};

const pickPublicFields = (source, fields) => fields.reduce((result, field) => {
  if (Object.prototype.hasOwnProperty.call(source, field)) result[field] = source[field];
  return result;
}, {});

const serializeMeta = (value) => {
  const meta = toPlain(value);
  const result = pickPublicFields(meta, META_PUBLIC_FIELDS);
  result.metrics = Array.isArray(meta.metrics)
    ? meta.metrics.map((metric) => pickPublicFields(toPlain(metric), METRIC_PUBLIC_FIELDS))
    : [];
  return result;
};

const setAuditContext = (res, context) => {
  res.locals = res.locals || {};
  res.locals.metaAudit = context;
};

const create = async (req, res, next) => {
  try {
    const meta = await metaService.create(req.body, req.user.id);
    setAuditContext(res, { after: meta });
    res.status(201).json({ success: true, data: meta });
  } catch (error) {
    next(error);
  }
};

const getById = async (req, res, next) => {
  try {
    const meta = await metaService.getById(req.params.id);
    res.status(200).json({ success: true, data: serializeMeta(meta) });
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const meta = await metaService.update(req.params.id, req.body);
    setAuditContext(res, { before: req.meta, after: meta });
    res.status(200).json({ success: true, data: meta });
  } catch (error) {
    next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    const deletedMeta = req.meta;
    await metaService.remove(req.params.id);
    setAuditContext(res, { before: deletedMeta });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

const getProgress = async (req, res, next) => {
  try {
    const meta = await metaProgressService.getMetaProgress(req.params.id);
    res.status(200).json({ success: true, data: serializeMeta(meta) });
  } catch (error) {
    next(error);
  }
};

const listWithProgress = async (req, res, next) => {
  try {
    const metas = await metaProgressService.listMetasWithProgress(req.query);
    res.status(200).json({ success: true, data: metas.map(serializeMeta) });
  } catch (error) {
    next(error);
  }
};

const listInstitutional = async (req, res, next) => {
  try {
    const metas = await metaProgressService.listInstitutionalMetasWithProgress();
    res.status(200).json({ success: true, data: metas });
  } catch (error) {
    next(error);
  }
};

const getInstitutionalProgress = async (req, res, next) => {
  try {
    const progress = await metaProgressService.getInstitutionalProgress();
    res.status(200).json({ success: true, data: progress });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  create,
  getById,
  update,
  remove,
  getProgress,
  listWithProgress,
  listInstitutional,
  getInstitutionalProgress
};

module.exports.serializeMeta = serializeMeta;
