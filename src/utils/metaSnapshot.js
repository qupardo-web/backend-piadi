const { ValidationError } = require('./errors');

const FINAL_STATUSES = new Set(['cumplida', 'en_progreso', 'en_riesgo', 'no_cumplida']);
const METRIC_FIELDS = [
  'metricId', 'indicatorKey', 'currentValue', 'targetValue', 'weight', 'behavior',
  'valueType', 'lowerLimit', 'upperLimit', 'progress', 'weightedProgress', 'hasData'
];

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const validateFinalSnapshot = (snapshot) => {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)
    || snapshot.version !== 1 || !isFiniteNumber(snapshot.totalProgress)
    || !isFiniteNumber(snapshot.elapsedProgress) || snapshot.elapsedProgress < 0
    || snapshot.elapsedProgress > 100 || !FINAL_STATUSES.has(snapshot.status)
    || !Array.isArray(snapshot.metrics) || snapshot.metrics.length === 0) {
    throw new ValidationError('El resultado final de la meta no es válido');
  }
  for (const metric of snapshot.metrics) {
    if (!metric || typeof metric !== 'object' || Array.isArray(metric)
      || !Number.isInteger(metric.metricId) || metric.metricId <= 0
      || typeof metric.indicatorKey !== 'string' || !metric.indicatorKey.trim()
      || typeof metric.behavior !== 'string' || !metric.behavior.trim()
      || typeof metric.valueType !== 'string' || !metric.valueType.trim()
      || typeof metric.hasData !== 'boolean'
      || !['targetValue', 'weight', 'progress', 'weightedProgress'].every((field) => isFiniteNumber(metric[field]))
      || !['lowerLimit', 'upperLimit'].every((field) => metric[field] === null || isFiniteNumber(metric[field]))
      || (metric.hasData ? !isFiniteNumber(metric.currentValue) : metric.currentValue !== null)
      || (metric.calculationIssue !== undefined && typeof metric.calculationIssue !== 'string')) {
      throw new ValidationError('Una métrica del resultado final no es válida');
    }
  }
  const weight = snapshot.metrics.reduce((sum, metric) => sum + metric.weight, 0);
  if (Math.abs(weight - 100) > 0.000001) {
    throw new ValidationError('Las ponderaciones del resultado final deben sumar 100');
  }
  const weightedProgress = snapshot.metrics.reduce((sum, metric) => sum + metric.weightedProgress, 0);
  if (Math.abs(weightedProgress - snapshot.totalProgress) > 0.000001) {
    throw new ValidationError('El progreso total no coincide con sus métricas finales');
  }
  return snapshot;
};

const buildFinalSnapshot = (progress) => {
  const snapshot = {
    version: 1,
    totalProgress: progress.totalProgress,
    elapsedProgress: progress.elapsedProgress,
    status: progress.status,
    metrics: (progress.metrics || []).map((metric) => ({
      ...Object.fromEntries(METRIC_FIELDS.map((field) => [field, metric[field]])),
      ...(metric.calculationIssue === undefined ? {} : { calculationIssue: metric.calculationIssue })
    }))
  };
  validateFinalSnapshot(snapshot);
  return JSON.parse(JSON.stringify(snapshot));
};

const readFinalSnapshot = (snapshot) => {
  validateFinalSnapshot(snapshot);
  const frozen = JSON.parse(JSON.stringify(snapshot));
  return {
    totalProgress: frozen.totalProgress,
    elapsedProgress: frozen.elapsedProgress,
    status: frozen.status,
    metrics: frozen.metrics
  };
};

module.exports = { validateFinalSnapshot, buildFinalSnapshot, readFinalSnapshot };
