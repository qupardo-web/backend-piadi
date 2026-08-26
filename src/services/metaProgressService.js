const { Meta, MetaMetric, IndicatorDefinition, sequelize } = require('../models');
const indicatorService = require('./indicatorService');
const { ValidationError, NotFoundError } = require('../utils/errors');

const STATUSES = ['cumplida', 'en_progreso', 'en_riesgo', 'no_cumplida'];
const TARGET_LIMIT_BEHAVIOR = 'no-debe-superar';
const TARGET_GROWTH_BEHAVIORS = new Set(['debe-alcanzar-o-superar', 'debe-superar']);
const RANGE_BEHAVIOR = 'debe-mantenerse-en-rango';

const asPlain = (value) => (value && typeof value.toJSON === 'function' ? value.toJSON() : value);

const finiteNumber = (value, field) => {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`El valor ${field} no es numérico`);
  }
  return number;
};

const buildIndicatorQuery = (meta, metric) => {
  const year = finiteNumber(meta.anio, 'Meta.anio');
  if (!Number.isInteger(year) || year < 1900) {
    throw new ValidationError('El año de la meta no es válido');
  }
  const indicator = asPlain(metric.indicator) || {};
  const department = meta.departmentId || indicator.departmentId;
  if (!department) {
    throw new ValidationError(`No se puede determinar el departamento del indicador ${metric.indicatorKey}`);
  }

  const query = { department, year };
  const period = String(meta.periodo || '').trim().toLowerCase();
  if (period === 'anual') return query;
  if (period === 'semestre 1') return { ...query, semester: '1' };
  if (period === 'semestre 2') return { ...query, semester: '2' };
  throw new ValidationError(`El periodo de la meta no es válido: ${meta.periodo}`);
};

const getPeriodBounds = (meta) => {
  const year = finiteNumber(meta.anio, 'Meta.anio');
  const period = String(meta.periodo || '').trim().toLowerCase();
  if (period === 'anual') {
    return [Date.UTC(year, 0, 1), Date.UTC(year + 1, 0, 1)];
  }
  if (period === 'semestre 1') {
    return [Date.UTC(year, 0, 1), Date.UTC(year, 6, 1)];
  }
  if (period === 'semestre 2') {
    return [Date.UTC(year, 6, 1), Date.UTC(year + 1, 0, 1)];
  }
  throw new ValidationError(`El periodo de la meta no es válido: ${meta.periodo}`);
};

const elapsedPercentage = (meta, now = new Date()) => {
  const [start, end] = getPeriodBounds(meta);
  const current = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (current <= start) return 0;
  if (current >= end) return 100;
  return ((current - start) / (end - start)) * 100;
};

const normalizeBehavior = (behavior) => String(behavior || '').trim().toLowerCase();

const evaluateMetricRisk = (metric, elapsedProgress) => {
  const behavior = normalizeBehavior(metric && metric.behavior);
  const recognized = behavior === TARGET_LIMIT_BEHAVIOR
    || TARGET_GROWTH_BEHAVIORS.has(behavior)
    || behavior === RANGE_BEHAVIOR;
  if (!metric || metric.hasData === false || metric.currentValue === null || metric.currentValue === undefined) {
    return { recognized, atRisk: false };
  }

  const currentValue = Number(metric.currentValue);
  if (!Number.isFinite(currentValue)) return { recognized: false, atRisk: false };

  if (behavior === TARGET_LIMIT_BEHAVIOR) {
    const targetValue = Number(metric.targetValue);
    if (!Number.isFinite(targetValue) || targetValue === 0) return { recognized: true, atRisk: false };
    return {
      recognized: true,
      atRisk: currentValue >= targetValue || (elapsedProgress >= 75 && currentValue >= targetValue * 0.75)
    };
  }

  if (TARGET_GROWTH_BEHAVIORS.has(behavior)) {
    const targetValue = Number(metric.targetValue);
    if (!Number.isFinite(targetValue) || targetValue === 0) return { recognized: true, atRisk: false };
    const progressRatio = (currentValue / targetValue) * 100;
    return { recognized: true, atRisk: elapsedProgress >= 50 && progressRatio <= 25 };
  }

  if (behavior === RANGE_BEHAVIOR) {
    const lowerLimit = Number(metric.lowerLimit);
    const upperLimit = Number(metric.upperLimit);
    const validRange = metric.lowerLimit !== null && metric.lowerLimit !== undefined
      && metric.upperLimit !== null && metric.upperLimit !== undefined
      && Number.isFinite(lowerLimit) && Number.isFinite(upperLimit) && upperLimit > lowerLimit;
    if (!validRange) return { recognized: true, atRisk: false };
    if (currentValue < lowerLimit || currentValue > upperLimit) return { recognized: true, atRisk: true };
    const criticalWidth = (upperLimit - lowerLimit) * 0.25;
    const nearBoundary = currentValue <= lowerLimit + criticalWidth || currentValue >= upperLimit - criticalWidth;
    return { recognized: true, atRisk: elapsedProgress >= 75 && nearBoundary };
  }

  return { recognized: false, atRisk: false };
};

const determineStatus = (meta, totalProgress, now = new Date(), metrics = []) => {
  const elapsedProgress = elapsedPercentage(meta, now);
  const evaluations = metrics.map((metric) => evaluateMetricRisk(metric, elapsedProgress));
  if (evaluations.some((evaluation) => evaluation.atRisk)) return 'en_riesgo';
  if (totalProgress >= 100) return 'cumplida';
  if (elapsedProgress >= 100) return 'no_cumplida';
  if (evaluations.length > 0 && evaluations.every((evaluation) => evaluation.recognized)) return 'en_progreso';
  return totalProgress < elapsedProgress ? 'en_riesgo' : 'en_progreso';
};

const createIndicatorResolver = () => {
  const pending = new Map();
  return (indicatorKey, query, meta) => {
    const cacheKey = JSON.stringify([indicatorKey, query]);
    if (!pending.has(cacheKey)) {
      const getDBValue = async () => {
        if (process.env.NODE_ENV === 'test') {
          return indicatorService.getIndicatorValue(indicatorKey, query);
        }
        try {
          const year = meta.anio;
          const period = String(meta.periodo || '').trim().toLowerCase();
          let start = `${year}-01-01`;
          let end = `${year}-12-31`;
          if (period === 'semestre 1') {
            start = `${year}-01-01`;
            end = `${year}-06-30`;
          } else if (period === 'semestre 2') {
            start = `${year}-07-01`;
            end = `${year}-12-31`;
          }

          const result = await sequelize.query(
            `SELECT get_indicator_value_for_period(:indicatorKey, CAST(:start AS DATE), CAST(:end AS DATE)) AS value`,
            {
              replacements: { indicatorKey, start, end },
              type: sequelize.QueryTypes.SELECT
            }
          );
          const value = result && result[0] ? Number(result[0].value) : 0;
          return { data: { value, hasData: true } };
        } catch (err) {
          console.warn(`Fallback to JS indicator calculation for ${indicatorKey}:`, err.message);
          return indicatorService.getIndicatorValue(indicatorKey, query);
        }
      };
      pending.set(cacheKey, getDBValue());
    }
    return pending.get(cacheKey);
  };
};

const calculateMetric = async (meta, rawMetric, resolveIndicator) => {
  const metric = asPlain(rawMetric);
  const targetValue = finiteNumber(metric.targetValue, 'MetaMetric.targetValue');
  const weight = finiteNumber(metric.weight, 'MetaMetric.weight');
  const query = buildIndicatorQuery(meta, metric);
  const result = await resolveIndicator(metric.indicatorKey, query, meta);
  const indicatorData = result && result.data;

  if (!indicatorData || indicatorData.hasData === false) {
    return {
      metricId: metric.id,
      indicatorKey: metric.indicatorKey,
      currentValue: null,
      targetValue,
      weight,
      behavior: metric.behavior,
      valueType: metric.valueType,
      lowerLimit: metric.lowerLimit === null || metric.lowerLimit === undefined ? null : finiteNumber(metric.lowerLimit, 'MetaMetric.lowerLimit'),
      upperLimit: metric.upperLimit === null || metric.upperLimit === undefined ? null : finiteNumber(metric.upperLimit, 'MetaMetric.upperLimit'),
      progress: 0,
      weightedProgress: 0,
      hasData: false
    };
  }

  const currentValue = finiteNumber(indicatorData.value, `indicatorService(${metric.indicatorKey}).value`);
  const validTarget = targetValue !== 0;
  const progress = validTarget ? (currentValue / targetValue) * 100 : 0;
  const weightedProgress = validTarget ? (currentValue / targetValue) * weight : 0;
  return {
    metricId: metric.id,
    indicatorKey: metric.indicatorKey,
    currentValue,
    targetValue,
    weight,
    behavior: metric.behavior,
    valueType: metric.valueType,
    lowerLimit: metric.lowerLimit === null || metric.lowerLimit === undefined ? null : finiteNumber(metric.lowerLimit, 'MetaMetric.lowerLimit'),
    upperLimit: metric.upperLimit === null || metric.upperLimit === undefined ? null : finiteNumber(metric.upperLimit, 'MetaMetric.upperLimit'),
    progress,
    weightedProgress,
    hasData: true,
    ...(validTarget ? {} : { calculationIssue: 'target_value_zero' })
  };
};

const calculateProgress = async (rawMeta, options = {}) => {
  const meta = asPlain(rawMeta);
  const metrics = Array.isArray(meta.metrics) ? meta.metrics : [];
  const resolveIndicator = options.resolveIndicator || createIndicatorResolver();
  const metricProgress = await Promise.all(metrics.map((metric) => calculateMetric(meta, metric, resolveIndicator)));
  const totalProgress = metricProgress.reduce((sum, metric) => sum + metric.weightedProgress, 0);
  const elapsedProgress = elapsedPercentage(meta, options.now || new Date());
  return {
    totalProgress,
    elapsedProgress,
    status: determineStatus(meta, totalProgress, options.now || new Date(), metricProgress),
    metrics: metricProgress
  };
};

const progressInclude = [{
  model: MetaMetric,
  as: 'metrics',
  include: [{ model: IndicatorDefinition, as: 'indicator', attributes: ['key', 'departmentId'] }]
}];

const getMetaProgress = async (id, options = {}) => {
  const parsedId = Number(id);
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new ValidationError('El id de la meta debe ser un entero positivo');
  }
  const meta = await Meta.findByPk(parsedId, { include: progressInclude });
  if (!meta) throw new NotFoundError('La meta solicitada no existe');
  const plainMeta = asPlain(meta);
  return { ...plainMeta, ...(await calculateProgress(plainMeta, options)) };
};

const listMetasWithProgress = async (filters = {}, options = {}) => {
  const where = {};
  if (filters.departmentId !== undefined && filters.departmentId !== '') {
    where.departmentId = filters.departmentId;
  }
  if (filters.status !== undefined && filters.status !== '' && !STATUSES.includes(filters.status)) {
    throw new ValidationError(`status debe ser uno de: ${STATUSES.join(', ')}`);
  }
  const metas = await Meta.findAll({ where, include: progressInclude });
  const resolveIndicator = createIndicatorResolver();
  const enriched = await Promise.all(metas.map(async (meta) => {
    const plainMeta = asPlain(meta);
    return { ...plainMeta, ...(await calculateProgress(plainMeta, { ...options, resolveIndicator })) };
  }));
  return filters.status ? enriched.filter((meta) => meta.status === filters.status) : enriched;
};

module.exports = {
  STATUSES,
  buildIndicatorQuery,
  elapsedPercentage,
  evaluateMetricRisk,
  determineStatus,
  calculateProgress,
  getMetaProgress,
  listMetasWithProgress
};
