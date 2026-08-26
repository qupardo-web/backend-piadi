const { Op } = require('sequelize');
const { sequelize, Meta, MetaMetric, IndicatorDefinition, Department } = require('../models');
const { ValidationError, NotFoundError } = require('../utils/errors');

const WEIGHT_SCALE = 10000;
const EXPECTED_WEIGHT_UNITS = 100 * WEIGHT_SCALE;
const META_FIELDS = ['departmentId', 'anio', 'periodo', 'nombre', 'fechaInicio', 'fechaLimite', 'prioridad', 'comportamiento'];

const requireNonEmptyString = (value, field) => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError(`El campo ${field} es obligatorio y debe ser un texto no vacío`);
  }
  return value.trim();
};

const requireFiniteNumber = (value, field) => {
  if (typeof value !== 'number') {
    throw new ValidationError(`El campo ${field} es obligatorio y debe ser numérico`);
  }
  if (!Number.isFinite(value)) {
    throw new ValidationError(`El campo ${field} debe ser un número finito`);
  }
  return value;
};

const normalizeMetrics = (metrics) => {
  if (!Array.isArray(metrics) || metrics.length === 0) {
    throw new ValidationError('metrics debe contener al menos una métrica');
  }

  const normalized = metrics.map((metric, index) => {
    if (!metric || typeof metric !== 'object' || Array.isArray(metric)) {
      throw new ValidationError(`metrics[${index}] debe ser un objeto`);
    }
    const weight = requireFiniteNumber(metric.weight, `metrics[${index}].weight`);
    if (weight < 0 || weight > 100) {
      throw new ValidationError(`metrics[${index}].weight debe estar entre 0 y 100`);
    }
    const roundedWeight = Math.round(weight * 100) / 100;
    if (Math.abs(weight - roundedWeight) > Number.EPSILON) {
      throw new ValidationError(`metrics[${index}].weight admite como máximo 2 decimales`);
    }

    const targetValue = requireFiniteNumber(metric.targetValue, `metrics[${index}].targetValue`);
    if (Math.abs(targetValue * 100 - Math.round(targetValue * 100)) > Number.EPSILON) {
      throw new ValidationError(`metrics[${index}].targetValue admite como máximo 2 decimales`);
    }

    let lowerLimit = null;
    if (metric.lowerLimit !== undefined && metric.lowerLimit !== null && metric.lowerLimit !== '') {
      lowerLimit = requireFiniteNumber(metric.lowerLimit, `metrics[${index}].lowerLimit`);
      if (Math.abs(lowerLimit * 100 - Math.round(lowerLimit * 100)) > Number.EPSILON) {
        throw new ValidationError(`metrics[${index}].lowerLimit admite como máximo 2 decimales`);
      }
    }

    let upperLimit = null;
    if (metric.upperLimit !== undefined && metric.upperLimit !== null && metric.upperLimit !== '') {
      upperLimit = requireFiniteNumber(metric.upperLimit, `metrics[${index}].upperLimit`);
      if (Math.abs(upperLimit * 100 - Math.round(upperLimit * 100)) > Number.EPSILON) {
        throw new ValidationError(`metrics[${index}].upperLimit admite como máximo 2 decimales`);
      }
    }

    const behavior = requireNonEmptyString(metric.behavior, `metrics[${index}].behavior`);
    if (behavior.toLowerCase() === 'debe-mantenerse-en-rango'
      && (lowerLimit === null || upperLimit === null || upperLimit <= lowerLimit)) {
      throw new ValidationError(`metrics[${index}] requiere lowerLimit y upperLimit válidos para debe-mantenerse-en-rango`);
    }

    return {
      indicatorKey: requireNonEmptyString(metric.indicatorKey, `metrics[${index}].indicatorKey`),
      weight: roundedWeight,
      behavior,
      targetValue,
      valueType: requireNonEmptyString(metric.valueType, `metrics[${index}].valueType`),
      lowerLimit,
      upperLimit
    };
  });

  const totalUnits = normalized.reduce((sum, metric) => sum + Math.round(metric.weight * WEIGHT_SCALE), 0);
  if (totalUnits !== EXPECTED_WEIGHT_UNITS) {
    throw new ValidationError('La suma de metrics[].weight debe ser exactamente 100');
  }
  return normalized;
};

const validateIndicators = async (metrics, transaction) => {
  const keys = [...new Set(metrics.map((metric) => metric.indicatorKey))];
  const indicators = await IndicatorDefinition.findAll({
    attributes: ['key'],
    where: { key: { [Op.in]: keys } },
    transaction
  });
  const existing = new Set(indicators.map((indicator) => indicator.key));
  const missing = keys.filter((key) => !existing.has(key));
  if (missing.length) {
    throw new NotFoundError(`No existen los siguientes indicadores: ${missing.join(', ')}`);
  }
};

const normalizeMetaFields = async (payload, transaction, { partial = false } = {}) => {
  const data = {};
  if (!partial || payload.anio !== undefined) {
    const anio = requireFiniteNumber(payload.anio, 'anio');
    if (!Number.isInteger(anio) || anio < 1900) {
      throw new ValidationError('anio debe ser un entero mayor o igual a 1900');
    }
    data.anio = anio;
  }
  if (!partial || payload.periodo !== undefined) {
    data.periodo = requireNonEmptyString(payload.periodo ?? 'Anual', 'periodo');
  }
  if (!partial || payload.departmentId !== undefined) {
    data.departmentId = payload.departmentId === null || payload.departmentId === undefined
      ? null
      : requireNonEmptyString(payload.departmentId, 'departmentId');
    if (data.departmentId !== null) {
      const department = await Department.findOne({ where: { key: data.departmentId }, transaction });
      if (!department) {
        throw new NotFoundError('El departamento indicado no existe');
      }
    }
  }
  
  if (!partial || payload.nombre !== undefined) {
    data.nombre = payload.nombre === null || payload.nombre === undefined ? null : String(payload.nombre).trim();
  }
  if (!partial || payload.inicio !== undefined || payload.fechaInicio !== undefined) {
    const val = payload.inicio !== undefined ? payload.inicio : payload.fechaInicio;
    data.fechaInicio = val === null || val === undefined || val === '' ? null : val;
  }
  if (!partial || payload.limite !== undefined || payload.fechaLimite !== undefined) {
    const val = payload.limite !== undefined ? payload.limite : payload.fechaLimite;
    data.fechaLimite = val === null || val === undefined || val === '' ? null : val;
  }
  if (!partial || payload.prioridad !== undefined) {
    data.prioridad = payload.prioridad === null || payload.prioridad === undefined ? null : String(payload.prioridad).trim();
  }
  if (!partial || payload.comportamiento !== undefined) {
    data.comportamiento = payload.comportamiento === null || payload.comportamiento === undefined ? null : String(payload.comportamiento).trim();
  }
  
  return data;
};

const detailInclude = [{ model: MetaMetric, as: 'metrics' }];

const normalizeMetaId = (id) => {
  const parsed = Number(id);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError('El id de la meta debe ser un entero positivo');
  }
  return parsed;
};

const getById = async (id, options = {}) => {
  const meta = await Meta.findByPk(normalizeMetaId(id), { include: detailInclude, transaction: options.transaction });
  if (!meta) {
    throw new NotFoundError('La meta solicitada no existe');
  }
  return meta;
};

const create = async (payload, creatorId) => sequelize.transaction(async (transaction) => {
  const metrics = normalizeMetrics(payload.metrics);
  await validateIndicators(metrics, transaction);
  const metaFields = await normalizeMetaFields(payload, transaction);
  const firstMetric = metrics[0];
  const meta = await Meta.create({
    ...metaFields,
    creatorId,
    indicatorKey: firstMetric.indicatorKey,
    valorMeta: firstMetric.targetValue
  }, { transaction });
  await MetaMetric.bulkCreate(metrics.map((metric) => ({ ...metric, metaId: meta.id })), { transaction, validate: true });
  return getById(meta.id, { transaction });
});

const update = async (id, payload) => sequelize.transaction(async (transaction) => {
  const meta = await Meta.findByPk(normalizeMetaId(id), { transaction, lock: transaction.LOCK.UPDATE });
  if (!meta) {
    throw new NotFoundError('La meta solicitada no existe');
  }
  const metrics = normalizeMetrics(payload.metrics);
  await validateIndicators(metrics, transaction);
  const metaFields = await normalizeMetaFields(payload, transaction, { partial: true });
  const firstMetric = metrics[0];
  await meta.update({
    ...META_FIELDS.reduce((result, field) => {
      if (metaFields[field] !== undefined) result[field] = metaFields[field];
      return result;
    }, {}),
    indicatorKey: firstMetric.indicatorKey,
    valorMeta: firstMetric.targetValue
  }, { transaction });
  await MetaMetric.destroy({ where: { metaId: meta.id }, transaction });
  await MetaMetric.bulkCreate(metrics.map((metric) => ({ ...metric, metaId: meta.id })), { transaction, validate: true });
  return getById(meta.id, { transaction });
});

const remove = async (id) => sequelize.transaction(async (transaction) => {
  const meta = await Meta.findByPk(normalizeMetaId(id), { transaction, lock: transaction.LOCK.UPDATE });
  if (!meta) {
    throw new NotFoundError('La meta solicitada no existe');
  }
  await meta.destroy({ transaction });
});

module.exports = {
  create,
  getById,
  update,
  remove,
  normalizeMetrics
};
