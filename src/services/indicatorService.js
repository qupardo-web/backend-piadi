const provider = require('./indicatorProvider');
const formulaService = require('./indicatorFormulaService');
const { parseIndicatorFilters, buildFilterMeta } = require('./indicatorFilters');
const { getIndicatorConfig } = require('./indicatorCatalog');

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

const aggregateProgram = (rows) => ({
  ofertaProgramada: rows.length,
  cursosDictados: rows.filter((r) => r.dictado).length,
  matriculaSum: rows.reduce((s, r) => s + (r.matricula || 0), 0),
  aprobadosSum: rows.reduce((s, r) => s + (r.aprobados || 0), 0),
  ingresosNetosSum: rows.reduce((s, r) => s + (r.ingresosNetos || 0), 0)
});

const aggregateParticipant = (rows) => {
  const unicos = new Set(rows.map((r) => r.idParticipante));
  const recurrentes = new Set(rows.filter((r) => r.recurrente).map((r) => r.idParticipante));
  return { participantesUnicos: unicos.size, participantesRecurrentes: recurrentes.size };
};

const aggregateVcmConvenio = (rows) => ({
  conveniosCount: rows.length,
  conveniosActivosCount: rows.filter((r) => r.activo).length
});

const aggregateVcmActividad = (rows) => ({
  actividadesCount: rows.length
});

const aggregateVcmParticipacion = (rows) => ({
  participantesSum: rows.reduce((sum, r) => sum + (r.totalPersonas || 0), 0)
});

const aggregateVcmArticulacion = (rows) => ({
  articulacionesCount: rows.length
});

const aggregateVcmProyecto = (rows) => ({
  proyectosCount: rows.length,
  financiamientoSum: rows.reduce((sum, r) => sum + (r.montoFinanciado || 0), 0)
});

const aggregate = (config, rows) => {
  if (config.kind === 'participant') return aggregateParticipant(rows);
  if (config.kind === 'vcm_convenio') return aggregateVcmConvenio(rows);
  if (config.kind === 'vcm_actividad') return aggregateVcmActividad(rows);
  if (config.kind === 'vcm_participacion') return aggregateVcmParticipacion(rows);
  if (config.kind === 'vcm_articulacion') return aggregateVcmArticulacion(rows);
  if (config.kind === 'vcm_proyecto') return aggregateVcmProyecto(rows);
  return aggregateProgram(rows);
};

const getRows = (config, filters) => {
  if (config.kind === 'participant') return provider.getParticipantRows(filters);
  if (config.kind === 'vcm_convenio') return provider.getVcmConvenioRows(filters);
  if (config.kind === 'vcm_actividad') return provider.getVcmActividadRows(filters);
  if (config.kind === 'vcm_participacion') return provider.getVcmParticipacionRows(filters);
  if (config.kind === 'vcm_articulacion') return provider.getVcmArticulacionRows(filters);
  if (config.kind === 'vcm_proyecto') return provider.getVcmProyectoRows(filters);
  return provider.getProgramRows(filters);
};

const computeFromRows = (config, definition, rows) => {
  if (!rows || rows.length === 0) {
    return { value: null, hasData: false };
  }
  const metrics = aggregate(config, rows);
  const result = formulaService.apply(definition.formulaKey, metrics);
  const hasData = result.hasData && result.value !== null && result.value !== undefined;
  return { value: hasData ? result.value : null, hasData };
};

const groupRowsBy = (rows, dimension) => {
  const groups = new Map();
  rows.forEach((row) => {
    const raw = dimension === 'year' ? row.anio : row[dimension];
    const label = raw === null || raw === undefined || raw === '' ? 'Sin dato' : raw;
    if (!groups.has(label)) {
      groups.set(label, []);
    }
    groups.get(label).push(row);
  });
  return groups;
};

const validateGroupBy = (config, groupBy) => {
  if (!groupBy) {
    return null;
  }
  if (!config.allowedGroupBy.includes(groupBy)) {
    throw new ServiceError(400, 'INVALID_GROUP_BY', 'El groupBy solicitado no aplica para este indicador.', {
      groupBy,
      allowed: config.allowedGroupBy
    });
  }
  return groupBy;
};

const resolveConfig = async (departmentKey, indicatorKey) => {
  const definition = await requireKpi(departmentKey, indicatorKey);
  const config = getIndicatorConfig(indicatorKey, definition);
  if (!config) {
    throw new ServiceError(404, 'KPI_NOT_FOUND', 'El indicador solicitado no tiene configuración de cálculo', {
      departmentKey,
      indicatorKey
    });
  }
  return { definition, config };
};

const getIndicatorValue = async (indicatorKey, query = {}) => {
  const key = ensureIndicatorKey(indicatorKey);
  const filters = parseIndicatorFilters(query);
  const departmentId = ensureDepartment(filters.department);
  await requireDepartment(departmentId);
  const { definition, config } = await resolveConfig(departmentId, key);

  const rows = await getRows(config, filters);
  const { value, hasData } = computeFromRows(config, definition, rows);

  const data = {
    indicatorKey: key,
    department: departmentId,
    value,
    formattedValue: hasData ? formatValue(value, definition.format) : null,
    unit: definition.unit,
    format: definition.format,
    hasData,
    filters: buildFilterMeta(filters),
    meta: { source: 'postgresql', formulaKey: definition.formulaKey }
  };
  if (!hasData) {
    data.message = 'No existen datos suficientes para calcular este indicador.';
  }
  return { data };
};

const getIndicatorSeries = async (indicatorKey, query = {}) => {
  const key = ensureIndicatorKey(indicatorKey);
  const filters = parseIndicatorFilters(query);
  const departmentId = ensureDepartment(filters.department);
  await requireDepartment(departmentId);
  const { definition, config } = await resolveConfig(departmentId, key);
  const groupBy = validateGroupBy(config, filters.groupBy);

  const rows = await getRows(config, filters);

  if (!groupBy || groupBy === 'year') {
    const byYear = groupRowsBy(rows, 'year');
    const points = [];
    [...byYear.keys()]
      .sort((a, b) => Number(a) - Number(b))
      .forEach((year) => {
        const { value, hasData } = computeFromRows(config, definition, byYear.get(year));
        if (hasData) {
          points.push({ year: Number(year), value });
        }
      });
    return {
      data: {
        indicatorKey: key,
        department: departmentId,
        groupBy: null,
        points,
        hasData: points.length > 0,
        filters: buildFilterMeta(filters),
        meta: { source: 'postgresql', formulaKey: definition.formulaKey }
      }
    };
  }

  const bySegment = groupRowsBy(rows, groupBy);
  const series = [];
  [...bySegment.keys()].sort().forEach((label) => {
    const segmentRows = bySegment.get(label);
    const byYear = groupRowsBy(segmentRows, 'year');
    const points = [];
    [...byYear.keys()]
      .sort((a, b) => Number(a) - Number(b))
      .forEach((year) => {
        const { value, hasData } = computeFromRows(config, definition, byYear.get(year));
        if (hasData) {
          points.push({ year: Number(year), value });
        }
      });
    if (points.length > 0) {
      series.push({ label: String(label), points });
    }
  });

  return {
    data: {
      indicatorKey: key,
      department: departmentId,
      groupBy,
      series,
      hasData: series.length > 0,
      filters: buildFilterMeta(filters),
      meta: { source: 'postgresql', formulaKey: definition.formulaKey }
    }
  };
};

const getIndicatorBreakdown = async (indicatorKey, query = {}) => {
  const key = ensureIndicatorKey(indicatorKey);
  const filters = parseIndicatorFilters(query);
  const departmentId = ensureDepartment(filters.department);
  await requireDepartment(departmentId);
  const { definition, config } = await resolveConfig(departmentId, key);

  if (!filters.groupBy) {
    throw new ServiceError(400, 'INVALID_GROUP_BY', 'El parámetro "groupBy" es obligatorio para breakdown.', {
      allowed: config.allowedGroupBy
    });
  }
  const groupBy = validateGroupBy(config, filters.groupBy);

  const rows = await getRows(config, filters);

  // Custom handler for VCM participaciones grouped by sex
  if (config.kind === 'vcm_participacion' && groupBy === 'sexo') {
    const totalMujeres = rows.reduce((sum, r) => sum + (r.mujeres || 0), 0);
    const totalHombres = rows.reduce((sum, r) => sum + (r.hombres || 0), 0);
    const totalNoInforma = rows.reduce((sum, r) => sum + (r.noInforma || 0), 0);
    
    const items = [];
    if (totalMujeres > 0) items.push({ label: 'mujeres', value: totalMujeres });
    if (totalHombres > 0) items.push({ label: 'hombres', value: totalHombres });
    if (totalNoInforma > 0) items.push({ label: 'noInforma', value: totalNoInforma });
    items.sort((a, b) => b.value - a.value);

    return {
      data: {
        indicatorKey: key,
        department: departmentId,
        groupBy,
        items,
        hasData: items.length > 0,
        filters: buildFilterMeta(filters),
        meta: { source: 'postgresql', formulaKey: definition.formulaKey }
      }
    };
  }

  const groups = groupRowsBy(rows, groupBy);
  const items = [];
  [...groups.keys()].forEach((label) => {
    const { value, hasData } = computeFromRows(config, definition, groups.get(label));
    if (hasData) {
      items.push({ label: String(label), value });
    }
  });
  items.sort((a, b) => b.value - a.value);

  return {
    data: {
      indicatorKey: key,
      department: departmentId,
      groupBy,
      items,
      hasData: items.length > 0,
      filters: buildFilterMeta(filters),
      meta: { source: 'postgresql', formulaKey: definition.formulaKey }
    }
  };
};

const getDepartmentFilters = async (departmentKey, query = {}) => {
  const key = ensureDepartment(departmentKey);
  await requireDepartment(key);
  const filters = parseIndicatorFilters({ ...query, department: key });
  const options = await provider.getFilterOptions(key, filters);
  return { data: { department: key, filters: options } };
};

const listDepartments = async () => ({ data: await provider.getDepartments() });

const createDepartment = async (body = {}) => {
  const key = ensureField(body.key, 'key');
  const name = ensureField(body.name, 'name');
  const existing = await provider.getDepartmentByKey(key);
  if (existing) {
    throw new ServiceError(409, 'DEPARTMENT_EXISTS', 'Ya existe un departamento con esa clave', { departmentKey: key });
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

const updateDepartment = async (departmentKey, body = {}) => {
  const key = ensureDepartment(departmentKey);
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

const deleteDepartment = async (departmentKey) => {
  const key = ensureDepartment(departmentKey);
  const ok = await provider.deleteDepartment(key);
  if (!ok) {
    throw new ServiceError(404, 'DEPARTMENT_NOT_FOUND', 'El departamento solicitado no existe', { departmentKey: key });
  }
  return { data: { departmentKey: key, deleted: true } };
};

const getDepartmentKpis = async (departmentKey) => {
  const key = ensureDepartment(departmentKey);
  await requireDepartment(key);
  const kpis = await provider.getKpisByDepartment(key);
  return { data: { departmentKey: key, kpis, hasIndicators: kpis.length > 0 } };
};

const createKpi = async (departmentKey, body = {}) => {
  const key = ensureDepartment(departmentKey);
  await requireDepartment(key);
  const indicatorKey = ensureField(body.key, 'key');
  const name = ensureField(body.name, 'name');
  const existing = await provider.getKpi(key, indicatorKey);
  if (existing) {
    throw new ServiceError(409, 'KPI_EXISTS', 'Ya existe un indicador con esa clave en el departamento', {
      departmentKey: key,
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

const updateKpi = async (departmentKey, indicatorKey, body = {}) => {
  const key = ensureDepartment(departmentKey);
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

const deleteKpi = async (departmentKey, indicatorKey) => {
  const key = ensureDepartment(departmentKey);
  await requireDepartment(key);
  const ind = ensureIndicatorKey(indicatorKey);
  const ok = await provider.deleteKpi(key, ind);
  if (!ok) {
    throw new ServiceError(404, 'KPI_NOT_FOUND', 'El indicador solicitado no existe para este departamento', {
      departmentKey: key,
      indicatorKey: ind
    });
  }
  return { data: { departmentKey: key, indicatorKey: ind, deleted: true } };
};

const getEnabledKpis = async (departmentKey) => {
  const kpis = await provider.getKpisByDepartment(departmentKey);
  return kpis.filter((kpi) => kpi.enabled !== false);
};

const getIndicatorDetail = async (indicatorKey) => {
  const key = ensureIndicatorKey(indicatorKey);
  const kpi = await provider.getKpi('institucional', key);
  if (!kpi) {
    throw new ServiceError(404, 'KPI_NOT_FOUND', 'El indicador solicitado no existe', { indicatorKey: key });
  }
  return {
    data: {
      key: kpi.key,
      name: kpi.name,
      title: kpi.name,
      description: kpi.description,
      unit: kpi.unit,
      format: kpi.format,
      formulaKey: kpi.formulaKey,
      departmentId: kpi.departmentId,
      enabled: kpi.enabled
    }
  };
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
  getIndicatorDetail,
  getDepartmentFilters,
  getIndicatorValue,
  getIndicatorSeries,
  getIndicatorBreakdown
};
