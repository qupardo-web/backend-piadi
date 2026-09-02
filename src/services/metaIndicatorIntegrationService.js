const metaProgressService = require('./metaProgressService');
const { parseIndicatorFilters } = require('./indicatorFilters');

const round2 = (value) => Math.round(value * 100) / 100;

const matchesPeriod = (meta, filters) => {
  const year = Number(meta.anio);
  if (filters.year !== null && year !== filters.year) return false;
  if (filters.fromYear !== null && year < filters.fromYear) return false;
  if (filters.toYear !== null && year > filters.toYear) return false;

  if (filters.semesterLabels.length) {
    const requestedPeriods = new Set();
    filters.semesterLabels.forEach((rawValue) => {
      const value = String(rawValue).trim().toLowerCase();
      if (value === '1' || value.includes('primer')) requestedPeriods.add('semestre 1');
      if (value === '2' || value.includes('segundo')) requestedPeriods.add('semestre 2');
    });
    if (!requestedPeriods.has(String(meta.periodo || '').trim().toLowerCase())) return false;
  }

  return true;
};

const listRelevantMetas = async (query = {}) => {
  const filters = parseIndicatorFilters(query);
  const progressFilters = filters.department ? { departmentId: filters.department } : {};
  const metas = await metaProgressService.listMetasWithProgress(progressFilters);
  return metas.filter((meta) => matchesPeriod(meta, filters));
};

const getDashboardMetaSummary = async (query = {}) => {
  const metas = await listRelevantMetas(query);
  const total = metas.length;
  const progressSum = metas.reduce((sum, meta) => sum + Number(meta.totalProgress || 0), 0);
  return {
    total,
    cumplidas: metas.filter((meta) => meta.status === 'cumplida').length,
    enRiesgo: metas.filter((meta) => meta.status === 'en_riesgo').length,
    cumplimientoGlobal: total ? round2(progressSum / total) : 0
  };
};

const getIndicatorMetaContext = async (indicatorKey, query = {}) => {
  const metas = await listRelevantMetas(query);
  const matches = metas.flatMap((meta) => (meta.metrics || [])
    .filter((metric) => metric.indicatorKey === indicatorKey)
    .map((metric) => ({ meta, metric })));

  if (matches.length !== 1) return null;
  const [{ meta, metric }] = matches;
  return {
    targetLine: { value: Number(metric.targetValue), label: 'Meta' },
    metaTarget: Number(metric.targetValue),
    metaStatus: meta.status
  };
};

module.exports = {
  getDashboardMetaSummary,
  getIndicatorMetaContext
};
