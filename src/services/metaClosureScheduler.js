const { closeExpiredMetas } = require('./metaClosureService');

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;
let timer = null;
let running = false;

const startMetaClosureScheduler = ({ enabled, intervalMs, ensureReady = async () => true,
  runClosure = closeExpiredMetas } = {}) => {
  if (timer || (process.env.NODE_ENV === 'test' && enabled !== true)
    || enabled === false || process.env.META_CLOSURE_ENABLED === 'false') return false;

  const configured = intervalMs ?? Number(process.env.META_CLOSURE_INTERVAL_MS || DEFAULT_INTERVAL_MS);
  const period = Number.isInteger(configured) && configured >= 1000 && configured <= 24 * 60 * 60 * 1000
    ? configured : DEFAULT_INTERVAL_MS;
  if (period !== configured) {
    console.warn('[metaClosure] Intervalo inválido; se utilizarán 15 minutos');
  }
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      if (await ensureReady()) await runClosure();
    } catch (error) {
      console.warn(`[metaClosure] Revisión automática fallida: ${error.name}`);
    } finally {
      running = false;
    }
  };
  timer = setInterval(tick, period);
  timer.unref?.();
  void tick();
  return true;
};

const stopMetaClosureScheduler = () => {
  if (!timer) return false;
  clearInterval(timer);
  timer = null;
  return true;
};

module.exports = { startMetaClosureScheduler, stopMetaClosureScheduler, DEFAULT_INTERVAL_MS };
