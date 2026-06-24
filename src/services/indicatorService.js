const provider = require('./indicatorProvider');
const formulaService = require('./indicatorFormulaService');

class ServiceError extends Error {
  constructor(statusCode, code, message, details = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

const ensureDepartment = (department) => {
  if (department === undefined || department === null || String(department).trim() === '') {
    throw new ServiceError(400, 'MISSING_DEPARTMENT', 'El parámetro "department" es obligatorio', {});
  }
  return String(department).trim();
};

const ensureIndicatorKey = (indicatorKey) => {
  if (indicatorKey === undefined || indicatorKey === null || String(indicatorKey).trim() === '') {
    throw new ServiceError(400, 'MISSING_INDICATOR_KEY', 'El parámetro "indicatorKey" es obligatorio', {});
  }
  return String(indicatorKey).trim();
};

const ensureField = (value, field) => {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new ServiceError(400, 'VALIDATION_ERROR', `El campo "${field}" es obligatorio`, { field });
  }
  return String(value).trim();
};

const parseYear = (rawYear) => {
  if (rawYear === undefined || rawYear === null || rawYear === '') {
    return null;
  }
  if (!/^\d{4}$/.test(String(rawYear))) {
    throw new ServiceError(400, 'INVALID_YEAR', 'El parámetro "year" debe ser un año numérico de 4 dígitos', { year: rawYear });
  }
  return Number(rawYear);
};

const formatValue = (value, format) => {
  if (value === null || value === undefined) {
    return null;
  }
  if (format === 'percentage') {
    return `${value}%`;
  }
  if (format === 'currency') {
    return `$${Number(value).toLocaleString('es-CL')}`;
  }
  if (format === 'number') {
    return Number(value).toLocaleString('es-CL');
  }
  return String(value);
};

const isSourceConnected = () => provider.isConnected();

const requireDepartment = async (key) => {
  const dept = await provider.getDepartmentByKey(key);
  if (!dept) {
    throw new ServiceError(404, 'DEPARTMENT_NOT_FOUND', 'El departamento solicitado no existe', { departmentId: key });
  }
  return dept;
};

const requireKpi = async (departmentKey, indicatorKey) => {
  const kpi = await provider.getKpi(departmentKey, indicatorKey);
  if (!kpi) {
    throw new ServiceError(404, 'KPI_NOT_FOUND', 'El indicador solicitado no existe para este departamento', {
      departmentId: departmentKey,
      indicatorKey
    });
  }
  return kpi;
};

const listDepartments = async () => ({ data: await provider.getDepartments() });

const createDepartment = async (body = {}) => {
  const key = ensureField(body.key, 'key');
  const name = ensureField(body.name, 'name');
  const existing = await provider.getDepartmentByKey(key);
  if (existing) {
    throw new ServiceError(409, 'DEPARTMENT_EXISTS', 'Ya existe un departamento con esa clave', { departmentId: key });
  }
  const data = await provider.createDepartment({
    key,
    name,
    description: body.description ?? null,
    enabled: body.enabled !== undefined ? Boolean(body.enabled) : true,
    hasData: body.hasData !== undefined ? Boolean(body.hasData) : false,
    order: body.order !== undefined ? Number(body.order) : 0
  });
  return { data };
};

const updateDepartment = async (departmentId, body = {}) => {
  const key = ensureDepartment(departmentId);
  await requireDepartment(key);
  const updatable = {};
  if (body.name !== undefined) updatable.name = String(body.name).trim();
  if (body.description !== undefined) updatable.description = body.description;
  if (body.enabled !== undefined) updatable.enabled = Boolean(body.enabled);
  if (body.hasData !== undefined) updatable.hasData = Boolean(body.hasData);
  if (body.order !== undefined) updatable.order = Number(body.order);
  const data = await provider.updateDepartment(key, updatable);
  return { data };
};

const deleteDepartment = async (departmentId) => {
  const key = ensureDepartment(departmentId);
  const ok = await provider.deleteDepartment(key);
  if (!ok) {
    throw new ServiceError(404, 'DEPARTMENT_NOT_FOUND', 'El departamento solicitado no existe', { departmentId: key });
  }
  return { data: { departmentId: key, deleted: true } };
};

const getDepartmentKpis = async (departmentId) => {
  const key = ensureDepartment(departmentId);
  await requireDepartment(key);
  const kpis = await provider.getKpisByDepartment(key);
  return { data: { departmentId: key, kpis, hasIndicators: kpis.length > 0 } };
};

const createKpi = async (departmentId, body = {}) => {
  const key = ensureDepartment(departmentId);
  await requireDepartment(key);
  const indicatorKey = ensureField(body.key, 'key');
  const name = ensureField(body.name, 'name');
  const existing = await provider.getKpi(key, indicatorKey);
  if (existing) {
    throw new ServiceError(409, 'KPI_EXISTS', 'Ya existe un indicador con esa clave en el departamento', {
      departmentId: key,
      indicatorKey
    });
  }
  const data = await provider.createKpi(key, {
    key: indicatorKey,
    name,
    description: body.description ?? null,
    unit: body.unit ?? null,
    format: body.format ?? null,
    formulaKey: body.formulaKey ?? null,
    enabled: body.enabled !== undefined ? Boolean(body.enabled) : true
  });
  return { data };
};

const updateKpi = async (departmentId, indicatorKey, body = {}) => {
  const key = ensureDepartment(departmentId);
  await requireDepartment(key);
  const ind = ensureIndicatorKey(indicatorKey);
  await requireKpi(key, ind);
  const updatable = {};
  if (body.name !== undefined) updatable.name = String(body.name).trim();
  if (body.description !== undefined) updatable.description = body.description;
  if (body.unit !== undefined) updatable.unit = body.unit;
  if (body.format !== undefined) updatable.format = body.format;
  if (body.formulaKey !== undefined) updatable.formulaKey = body.formulaKey;
  if (body.enabled !== undefined) updatable.enabled = Boolean(body.enabled);
  const data = await provider.updateKpi(key, ind, updatable);
  return { data };
};

const deleteKpi = async (departmentId, indicatorKey) => {
  const key = ensureDepartment(departmentId);
  await requireDepartment(key);
  const ind = ensureIndicatorKey(indicatorKey);
  const ok = await provider.deleteKpi(key, ind);
  if (!ok) {
    throw new ServiceError(404, 'KPI_NOT_FOUND', 'El indicador solicitado no existe para este departamento', {
      departmentId: key,
      indicatorKey: ind
    });
  }
  return { data: { departmentId: key, indicatorKey: ind, deleted: true } };
};

const getEnabledKpis = async (departmentKey) => {
  const kpis = await provider.getKpisByDepartment(departmentKey);
  return kpis.filter((kpi) => kpi.enabled !== false);
};

const computeIndicator = async (definition, departmentId, year) => {
  const input = await provider.getIndicatorInputData({
    department: departmentId,
    indicatorKey: definition.key,
    formulaKey: definition.formulaKey,
    year
  });
  const result = formulaService.apply(definition.formulaKey, input || {});
  const hasData = result.hasData && result.value !== null && result.value !== undefined;
  return { value: hasData ? result.value : null, hasData };
};

const getIndicatorValue = async (indicatorKey, query = {}) => {
  const key = ensureIndicatorKey(indicatorKey);
  const departmentId = ensureDepartment(query.department);
  const year = parseYear(query.year);
  const resolvedYear = year !== null ? year : new Date().getFullYear();

  await requireDepartment(departmentId);
  const definition = await requireKpi(departmentId, key);
  const { value, hasData } = await computeIndicator(definition, departmentId, resolvedYear);

  const data = {
    departmentId,
    indicatorKey: key,
    year: resolvedYear,
    value,
    formattedValue: hasData ? formatValue(value, definition.format) : null,
    unit: definition.unit,
    format: definition.format,
    hasData
  };
  if (!hasData) {
    data.message = 'No existen datos suficientes para calcular este indicador.';
  }
  return { data };
};

const getIndicatorSeries = async (indicatorKey, query = {}) => {
  const key = ensureIndicatorKey(indicatorKey);
  const departmentId = ensureDepartment(query.department);

  await requireDepartment(departmentId);
  const definition = await requireKpi(departmentId, key);
  const years = await provider.getAvailableYears({
    department: departmentId,
    indicatorKey: key,
    formulaKey: definition.formulaKey
  });

  const points = [];
  for (const year of years) {
    const { value, hasData } = await computeIndicator(definition, departmentId, year);
    if (hasData) {
      points.push({ year, value, formattedValue: formatValue(value, definition.format) });
    }
  }

  const data = { departmentId, indicatorKey: key, points, hasData: points.length > 0 };
  if (points.length === 0) {
    data.message = 'No existen datos suficientes para construir la serie histórica.';
  }
  return { data };
};

module.exports = {
  ServiceError,
  parseYear,
  formatValue,
  isSourceConnected,
  listDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getDepartmentKpis,
  createKpi,
  updateKpi,
  deleteKpi,
  getEnabledKpis,
  getIndicatorValue,
  getIndicatorSeries
};
