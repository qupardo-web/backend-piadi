const { Op } = require('sequelize');
const { Department } = require('../models');
const metaProgressService = require('./metaProgressService');

const mapMetric = (metric) => ({
  indicatorKey: metric.indicatorKey,
  currentValue: metric.currentValue,
  targetValue: metric.targetValue,
  weight: metric.weight,
  behavior: metric.behavior,
  valueType: metric.valueType,
  progress: metric.progress,
  weightedProgress: metric.weightedProgress,
  hasData: metric.hasData
});

const getLandingMetas = async () => {
  const metas = await metaProgressService.listMetasWithProgress();
  const departmentKeys = [...new Set(metas.map((meta) => meta.departmentId).filter(Boolean))];
  const departments = departmentKeys.length
    ? await Department.findAll({
      where: { key: { [Op.in]: departmentKeys } },
      attributes: ['key', 'name'],
      raw: true
    })
    : [];
  const departmentsByKey = new Map(departments.map((department) => [department.key, department]));

  return metas.map((meta) => ({
    id: meta.id,
    department: meta.departmentId
      ? departmentsByKey.get(meta.departmentId) || { key: meta.departmentId, name: null }
      : null,
    anio: meta.anio,
    periodo: meta.periodo,
    totalProgress: meta.totalProgress,
    elapsedProgress: meta.elapsedProgress,
    status: meta.status,
    metrics: (meta.metrics || []).map(mapMetric)
  }));
};

module.exports = { getLandingMetas };
