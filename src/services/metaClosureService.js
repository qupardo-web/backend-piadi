const { Op } = require('sequelize');
const { Meta, MetaMetric, IndicatorDefinition, AuditSesion, sequelize } = require('../models');
const { ValidationError, ForbiddenError, NotFoundError, ConflictError } = require('../utils/errors');
const { canManageMeta } = require('../middleware/rectoriaAuthorization');
const { calculateProgress, createIndicatorResolver } = require('./metaProgressService');
const { buildFinalSnapshot } = require('../utils/metaSnapshot');
const cacheService = require('./cacheService');

const asPlain = (value) => (value && typeof value.toJSON === 'function' ? value.toJSON() : value);

const closeMeta = async (id, { actor = null, source = 'manual', now = null, resolveIndicator = null } = {}) => {
  const metaId = Number(id);
  if (!Number.isInteger(metaId) || metaId <= 0) {
    throw new ValidationError('El id de la meta debe ser un entero positivo');
  }
  if (source !== 'manual' && source !== 'automatic') {
    throw new ValidationError('El origen del cierre no es válido');
  }

  const outcome = await sequelize.transaction(async (transaction) => {
    const meta = await Meta.findByPk(metaId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!meta) throw new NotFoundError('La meta solicitada no existe');
    const plainMeta = asPlain(meta);
    if (source === 'manual' && !canManageMeta(actor, plainMeta)) {
      throw new ForbiddenError('No puedes cerrar esta meta');
    }
    if (plainMeta.lifecycleStatus === 'CERRADA') {
      return { meta: plainMeta, justClosed: false };
    }
    if (plainMeta.lifecycleStatus !== 'ACTIVA') {
      if (source === 'automatic') return { meta: plainMeta, justClosed: false };
      throw new ConflictError('Solo una meta ACTIVA puede cerrarse');
    }

    const currentTime = now || new Date((await sequelize.query(
      'SELECT CURRENT_TIMESTAMP AS "currentTime"',
      { type: sequelize.QueryTypes.SELECT, transaction }
    ))[0].currentTime);
    if (!(currentTime instanceof Date) || Number.isNaN(currentTime.getTime())) {
      throw new Error('No se pudo determinar la hora del cierre');
    }
    if (source === 'automatic' && (!plainMeta.fechaLimite || new Date(plainMeta.fechaLimite) >= currentTime)) {
      return { meta: plainMeta, justClosed: false };
    }

    const metrics = await MetaMetric.findAll({
      where: { metaId },
      include: [{ model: IndicatorDefinition, as: 'indicator', attributes: ['key', 'departmentId'] }],
      transaction
    });
    const finalProgress = await calculateProgress(
      { ...plainMeta, metrics },
      { now: currentTime, resolveIndicator: resolveIndicator || createIndicatorResolver({ fresh: true }) }
    );
    const finalSnapshot = buildFinalSnapshot(finalProgress);
    await meta.update({ lifecycleStatus: 'CERRADA', closedAt: currentTime, finalSnapshot }, { transaction });
    await AuditSesion.create({
      usuarioId: source === 'manual' ? actor.id : null,
      rol: source === 'manual' ? (actor.role || actor.roleGroup || null) : 'Sistema',
      accion: 'META_CLOSED',
      entidad: 'Meta',
      detalles: JSON.stringify({
        metaId, closedAt: currentTime.toISOString(), source,
        totalProgress: finalSnapshot.totalProgress, status: finalSnapshot.status,
        metricCount: finalSnapshot.metrics.length
      })
    }, { transaction });
    const departments = [plainMeta.departmentId, ...metrics.map((metric) => asPlain(metric.indicator)?.departmentId)]
      .filter(Boolean);
    return {
      meta: { ...plainMeta, lifecycleStatus: 'CERRADA', closedAt: currentTime, finalSnapshot },
      justClosed: true, departments
    };
  });
  if (outcome.justClosed) {
    cacheService.invalidateMetas();
    [...new Set(outcome.departments)].forEach((departmentId) => cacheService.invalidateDepartment(departmentId));
  }
  return outcome;
};

const closeExpiredMetas = async ({ now = null, batchSize = 25, maxPerRun = Number.MAX_SAFE_INTEGER,
  resolveIndicator = null } = {}) => {
  if (!Number.isInteger(batchSize) || batchSize < 1 || !Number.isSafeInteger(maxPerRun) || maxPerRun < 1) {
    throw new ValidationError('La configuración del cierre automático no es válida');
  }
  const scanTime = now || new Date((await sequelize.query(
    'SELECT CURRENT_TIMESTAMP AS "currentTime"', { type: sequelize.QueryTypes.SELECT }
  ))[0].currentTime);
  if (!(scanTime instanceof Date) || Number.isNaN(scanTime.getTime())) {
    throw new ValidationError('La hora de revisión no es válida');
  }
  const summary = { examined: 0, closed: 0, failed: 0 };
  let cursor = null;
  while (summary.examined < maxPerRun) {
    const where = { lifecycleStatus: 'ACTIVA', fechaLimite: { [Op.lt]: scanTime } };
    if (cursor) {
      where[Op.or] = [
        { fechaLimite: { [Op.gt]: cursor.fechaLimite } },
        { fechaLimite: cursor.fechaLimite, id: { [Op.gt]: cursor.id } }
      ];
    }
    const rows = await Meta.findAll({
      where, attributes: ['id', 'fechaLimite'], order: [['fechaLimite', 'ASC'], ['id', 'ASC']],
      limit: Math.min(batchSize, maxPerRun - summary.examined)
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      cursor = { id: row.id, fechaLimite: row.fechaLimite };
      summary.examined++;
      try {
        const result = await closeMeta(row.id, {
          source: 'automatic', ...(now ? { now } : {}), ...(resolveIndicator ? { resolveIndicator } : {})
        });
        if (result.justClosed) summary.closed++;
      } catch (error) {
        summary.failed++;
        console.warn(`[metaClosure] Falló el cierre automático de la meta ${row.id}: ${error.name}`);
      }
    }
  }
  return summary;
};

module.exports = { closeMeta, closeExpiredMetas };
