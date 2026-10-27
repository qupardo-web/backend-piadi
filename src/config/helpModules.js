// Catálogo técnico provisional; requiere validación institucional antes de ampliarlo.
const HELP_MODULES = Object.freeze([
  'dashboard',
  'educacion_continua',
  'vinculacion_medio',
  'innovacion',
  'admision',
  'desarrollo_curricular',
  'metas',
  'carga_datos',
  'repositorio',
  'reportes',
  'auditoria'
]);

const allowedModules = new Set(HELP_MODULES);
const isHelpModule = (value) => allowedModules.has(value);

module.exports = { HELP_MODULES, isHelpModule };
