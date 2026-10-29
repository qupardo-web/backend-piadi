const provider = require('./indicatorProvider');
const formulaService = require('./indicatorFormulaService');
const { parseIndicatorFilters, buildFilterMeta } = require('./indicatorFilters');
const { getIndicatorConfig, DIMENSION_LABELS } = require('./indicatorCatalog');
const cacheService = require('./cacheService');

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
  proyectosCount: rows.filter((r) => r.vigente).length,
  financiamientoSum: rows.reduce((sum, r) => sum + (r.montoFinanciado || 0), 0)
});

const aggregateInnovationProject = (rows, active = false) => ({
  proyectosCount: rows.length,
  proyectosActivosCount: active ? rows.length : 0,
  docentesSum: rows.reduce((sum, row) => sum + (row.nDocentes || 0), 0)
});

const aggregateInnovationFinancing = (rows) => ({
  financiamientoSum: rows.reduce((sum, row) => sum + (row.montoAdjudicado || 0), 0)
});

const aggregateExternalFinancingProjects = (rows) => ({
  proyectosExternosCount: new Set(
    rows.map((row) => row.idProyecto).filter((id) => id !== null && id !== undefined)
  ).size
});

const aggregateInnovationSection = (rows) => ({
  seccionesCount: rows.length
});

const aggregateAdmissionEnrollment = (rows) => ({
  admissionUniqueCount: new Set(
    rows.map((row) => row.codCli).filter((value) => value !== null && value !== undefined && value !== '')
  ).size
});

const aggregateAdmissionCharacterization = (rows) => ({
  admissionUniqueCount: new Set(
    rows
      .map((row) => row.codCli || row.rut)
      .filter((value) => value !== null && value !== undefined && value !== '')
  ).size
});

const curricularState = (value) => String(value || '').trim().toUpperCase();

const aggregateCurricularRendimiento = (rows) => {
  // La clave natural del modelo identifica una evaluación, no cada JOIN o fila repetida.
  const evaluations = new Map();
  rows.forEach((row) => {
    const state = curricularState(row.estadoAsignatura);
    if (!['APROBADO', 'REPROBADO'].includes(state)) return;
    const key = `${row.rut}|${row.ramoEquiv}|${row.anio}|${row.periodo}`;
    if (!evaluations.has(key)) evaluations.set(key, { ...row, state });
  });
  const byCourse = new Map();
  for (const row of evaluations.values()) {
    const course = byCourse.get(row.ramoEquiv) || { evaluables: 0, reprobados: 0 };
    course.evaluables += 1;
    if (row.state === 'REPROBADO') course.reprobados += 1;
    byCourse.set(row.ramoEquiv, course);
  }
  return {
    evaluablesCount: evaluations.size,
    aprobadosCount: [...evaluations.values()].filter((row) => row.state === 'APROBADO').length,
    reprobadosCount: [...evaluations.values()].filter((row) => row.state === 'REPROBADO').length,
    // Criterio operativo pendiente de ratificación académica: cantidad de
    // ramos cuya reprobación es estrictamente superior al 30 % del grupo.
    asignaturasCriticasCount: [...byCourse.values()]
      .filter((course) => course.evaluables > 0 && course.reprobados / course.evaluables > 0.30).length
  };
};

const aggregateCurricularPractica = (rows) => {
  const registered = rows.filter((row) => ['INSCRITA', 'APROBADA'].includes(curricularState(row.estado)));
  return {
    // Criterio operativo pendiente de ratificación académica: una práctica
    // aprobada también fue una inscripción; cada estudiante cuenta una vez.
    practicasRegistradasCount: registered.length,
    practicasInscritasCount: new Set(registered
      .map((row) => row.rut).filter((rut) => rut !== null && rut !== undefined)).size,
    practicasAprobadasCount: new Set(rows
      .filter((row) => curricularState(row.estado) === 'APROBADA')
      .map((row) => row.rut).filter((rut) => rut !== null && rut !== undefined)).size
  };
};

const aggregateCurricularTitulacion = (rows) => {
  const byStudent = new Map();
  rows.forEach((row) => {
    if (row.rut === null || row.rut === undefined) return;
    const previous = byStudent.get(row.rut);
    if (!previous || (previous.semestresCursados == null && row.semestresCursados != null)) {
      byStudent.set(row.rut, row);
    }
  });
  const times = [...byStudent.values()]
    .map((row) => Number(row.semestresCursados))
    .filter((value) => Number.isFinite(value) && value > 0);
  return {
    tituladosCount: byStudent.size,
    semestresSum: times.reduce((sum, value) => sum + value, 0),
    semestresCount: times.length
  };
};

// (A) Primera matrícula dentro del año: cada alumno cuenta una sola vez, en el
// primer semestre en que aparece ese año (Otoño=1, Primavera=2). Reasigna el
// periodo de cada fila a esa primera matrícula para que el agrupamiento por
// 'periodo' no recuente al alumno cuando continúa al semestre siguiente.
const admissionFirstPeriodByYear = (rows) => {
  const first = new Map();
  rows.forEach((row) => {
    const cod = row.codCli;
    if (cod === null || cod === undefined || cod === '') return;
    const key = `${cod}|${row.anio}`;
    const periodo = Number(row.periodo);
    if (!first.has(key) || periodo < first.get(key)) first.set(key, periodo);
  });
  return rows.map((row) => {
    const cod = row.codCli;
    if (cod === null || cod === undefined || cod === '') return row;
    const periodo = first.get(`${cod}|${row.anio}`);
    return periodo === undefined ? row : { ...row, periodo };
  });
};

const admissionNeedsNuevoAntiguo = (definition, filters, groupBy) =>
  definition.formulaKey === 'COUNT_ADMISSION_NEW_VS_OLD'
  || groupBy === 'nuevoAntiguo'
  || Boolean(filters.nuevoAntiguo && filters.nuevoAntiguo.length);

const admissionUsesFirstPeriod = (definition, filters, groupBy) =>
  definition.formulaKey === 'COUNT_ADMISSION_ENROLLMENT_TOTAL'
  && ((filters.periodo && filters.periodo.length > 0) || groupBy === 'periodo');

// Ajusta los filtros que recibe el provider de admisión: el historial de
// primera matrícula (nuevoAntiguo) sólo se consulta cuando el indicador lo usa,
// y en modo primera-matrícula el provider trae ambos semestres para que el
// servicio deduplique en memoria (un alumno por año, en su primer semestre).
const admissionFetchFilters = (config, definition, filters, groupBy) => {
  if (config.kind !== 'admission_enrollment') return filters;
  return {
    ...filters,
    needsNuevoAntiguo: admissionNeedsNuevoAntiguo(definition, filters, groupBy),
    ...(admissionUsesFirstPeriod(definition, filters, groupBy) ? { primeraMatricula: true } : {})
  };
};

const applyAdmissionFirstPeriod = (rows, filters) => {
  const remapped = admissionFirstPeriodByYear(rows);
  if (!filters.periodo || !filters.periodo.length) return remapped;
  return remapped.filter((row) => filters.periodo.includes(Number(row.periodo)));
};

const aggregate = (config, rows) => {
  if (config.kind === 'participant') return aggregateParticipant(rows);
  if (config.kind === 'vcm_convenio') return aggregateVcmConvenio(rows);
  if (config.kind === 'vcm_actividad') return aggregateVcmActividad(rows);
  if (config.kind === 'vcm_participacion') return aggregateVcmParticipacion(rows);
  if (config.kind === 'vcm_articulacion') return aggregateVcmArticulacion(rows);
  if (config.kind === 'vcm_proyecto' || config.kind === 'vcm_active_project') return aggregateVcmProyecto(rows);
  if (config.kind === 'innovation_active_project') return aggregateInnovationProject(rows, true);
  if (config.kind === 'innovation_project') return aggregateInnovationProject(rows);
  if (config.kind === 'innovation_finalized_project') return aggregateInnovationProject(rows);
  if (config.kind === 'innovation_financing') return aggregateInnovationFinancing(rows);
  if (config.kind === 'innovation_external_financing_projects') return aggregateExternalFinancingProjects(rows);
  if (config.kind === 'innovation_section') return aggregateInnovationSection(rows);
  if (config.kind === 'admission_enrollment') return aggregateAdmissionEnrollment(rows);
  if (config.kind === 'admission_characterization') return aggregateAdmissionCharacterization(rows);
  if (config.kind === 'curricular_rendimiento') return aggregateCurricularRendimiento(rows);
  if (config.kind === 'curricular_practica') return aggregateCurricularPractica(rows);
  if (config.kind === 'curricular_titulacion') return aggregateCurricularTitulacion(rows);
  return aggregateProgram(rows);
};

const hasTemporalFilter = (filters) => filters.year !== null && filters.year !== undefined
  || filters.fromYear !== null && filters.fromYear !== undefined
  || filters.toYear !== null && filters.toYear !== undefined;

const getRows = (config, filters, { historical = false } = {}) => {
  if (config.kind === 'participant') return provider.getParticipantRows(filters);
  if (config.kind === 'vcm_convenio') return provider.getVcmConvenioRows(filters);
  if (config.kind === 'vcm_actividad') return provider.getVcmActividadRows(filters);
  if (config.kind === 'vcm_participacion') return provider.getVcmParticipacionRows(filters);
  if (config.kind === 'vcm_articulacion') return provider.getVcmArticulacionRows(filters);
  if (config.kind === 'vcm_proyecto') return provider.getVcmProyectoRows(filters);
  if (config.kind === 'vcm_active_project') {
    return provider.getVcmProyectoRows(filters, { intervalActivity: historical || hasTemporalFilter(filters) });
  }
  if (config.kind === 'innovation_active_project') return provider.getInnovationProjectRows(filters, { activeDuringYear: true });
  if (config.kind === 'innovation_project') return provider.getInnovationProjectRows(filters);
  if (config.kind === 'innovation_finalized_project') return provider.getInnovationProjectRows(filters, { finalizedInYear: true });
  if (config.kind === 'innovation_financing') return provider.getInnovationFinancingRows(filters);
  if (config.kind === 'innovation_external_financing_projects') return provider.getInnovationFinancingRows(filters);
  if (config.kind === 'innovation_section') return provider.getInnovationSectionRows(filters);
  if (config.kind === 'admission_enrollment') return provider.getAdmissionEnrollmentRows(filters);
  if (config.kind === 'admission_characterization') return provider.getAdmissionCharacterizationRows(filters);
  if (config.kind === 'curricular_rendimiento') return provider.getCurricularRendimientoRows(filters);
  if (config.kind === 'curricular_practica') return provider.getCurricularPracticaRows(filters);
  if (config.kind === 'curricular_titulacion') return provider.getCurricularTitulacionRows(filters);
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

const VCM_SEX_COUNTERS = ['mujeres', 'hombres', 'noInforma'];

// Las participaciones almacenan tres contadores, no una persona ni un sexo por fila.
// Estas filas de medida sólo existen en memoria y conservan las demás dimensiones.
const splitVcmParticipationBySex = (rows) => rows.flatMap((row) =>
  VCM_SEX_COUNTERS.flatMap((sexo) => {
    const count = Number(row[sexo] ?? 0);
    return count > 0 ? [{ ...row, sexo, totalPersonas: count }] : [];
  }));

const groupRowsBy = (rows, dimension) => {
  const groups = new Map();
  rows.forEach((row) => {
    const rawYear = Number(row.anio);
    const raw = dimension === 'year' && Number.isFinite(rawYear) ? rawYear : row[dimension];
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
  let resolvedGroupBy = groupBy;
  if (groupBy === 'tipo' && config.kind === 'vcm_actividad') resolvedGroupBy = 'tipoActividad';
  if (groupBy === 'tipo' && config.kind === 'vcm_convenio') resolvedGroupBy = 'tipoConvenio';
  if (groupBy === 'area' && [
    'innovation_project',
    'innovation_active_project',
    'innovation_finalized_project'
  ].includes(config.kind)) resolvedGroupBy = 'areaTematica';
  if (!config.allowedGroupBy.includes(resolvedGroupBy)) {
    throw new ServiceError(400, 'INVALID_GROUP_BY', 'El groupBy solicitado no aplica para este indicador.', {
      groupBy,
      allowed: config.allowedGroupBy
    });
  }
  return resolvedGroupBy;
};

const matrixDimension = (dimension, row) => dimension === 'year' ? Number(row.anio) : row[dimension];
const matrixCategory = (dimension, value) => {
  const missing = value === null || value === undefined || value === '' ||
    (typeof value === 'number' && !Number.isFinite(value));
  return missing
    ? { id: `${dimension}:null`, label: 'Sin dato', value: null }
    : { id: `${dimension}:${typeof value}:${String(value)}`, label: String(value), value };
};
const sortMatrixCategories = (dimension, left, right) => {
  if (left.value === null) return right.value === null ? 0 : 1;
  if (right.value === null) return -1;
  if (dimension === 'year' || dimension === 'periodo') return Number(left.value) - Number(right.value);
  return left.label.localeCompare(right.label, 'es', { numeric: true });
};
const matrixLimit = (name, fallback) => {
  const configured = Number(process.env[name]);
  return Number.isSafeInteger(configured) && configured > 0 ? configured : fallback;
};

const buildBidimensionalMatrix = async ({ config, definition, filters, rowDimension, colDimension }) => {
  const admissionDimension = [rowDimension, colDimension].includes('periodo') ? 'periodo' : rowDimension;
  const fetchFilters = admissionFetchFilters(config, definition, filters, admissionDimension);
  if (config.kind === 'admission_enrollment' && [rowDimension, colDimension].includes('nuevoAntiguo')) {
    fetchFilters.needsNuevoAntiguo = true;
  }
  let rows = await getRows(config, fetchFilters, { historical: colDimension === 'year' || rowDimension === 'year' });
  if (fetchFilters.primeraMatricula) rows = applyAdmissionFirstPeriod(rows, filters);
  const sourceRows = rows;
  if (config.kind === 'vcm_participacion' && [rowDimension, colDimension].includes('sexo')) {
    rows = splitVcmParticipationBySex(rows);
  }

  const rowGroups = new Map();
  const colGroups = new Map();
  const intersections = new Map();
  for (const record of rows) {
    const rowCategory = matrixCategory(rowDimension, matrixDimension(rowDimension, record));
    const colCategory = matrixCategory(colDimension, matrixDimension(colDimension, record));
    if (!rowGroups.has(rowCategory.id)) rowGroups.set(rowCategory.id, { ...rowCategory, rows: [] });
    if (!colGroups.has(colCategory.id)) colGroups.set(colCategory.id, { ...colCategory, rows: [] });
    rowGroups.get(rowCategory.id).rows.push(record);
    colGroups.get(colCategory.id).rows.push(record);
    if (!intersections.has(rowCategory.id)) intersections.set(rowCategory.id, new Map());
    const byColumn = intersections.get(rowCategory.id);
    if (!byColumn.has(colCategory.id)) byColumn.set(colCategory.id, []);
    byColumn.get(colCategory.id).push(record);
  }

  const maxRows = matrixLimit('INDICATOR_MATRIX_MAX_ROWS', 50);
  const maxColumns = matrixLimit('INDICATOR_MATRIX_MAX_COLUMNS', 20);
  if (rowGroups.size > maxRows || colGroups.size > maxColumns) {
    throw new ServiceError(400, 'MATRIX_LIMIT_EXCEEDED', 'La matriz supera el límite de categorías permitido', {
      rows: rowGroups.size, columns: colGroups.size, maxRows, maxColumns
    });
  }

  const orderedRows = [...rowGroups.values()].sort((a, b) => sortMatrixCategories(rowDimension, a, b));
  const orderedColumns = [...colGroups.values()].sort((a, b) => sortMatrixCategories(colDimension, a, b));
  const columns = orderedColumns.map((category) => category.id);
  const columnLabels = Object.create(null);
  const columnTotals = Object.create(null);
  for (const category of orderedColumns) {
    columnLabels[category.id] = category.label;
    columnTotals[category.id] = computeFromRows(config, definition, category.rows).value;
  }
  const matrix = orderedRows.map((category) => {
    const values = Object.create(null);
    for (const column of orderedColumns) {
      values[column.id] = computeFromRows(
        config, definition, intersections.get(category.id).get(column.id) || []
      ).value;
    }
    return {
      row: category.label,
      rowKey: category.id,
      values,
      total: computeFromRows(config, definition, category.rows).value
    };
  });
  return {
    isBidimensional: true,
    rowDimension,
    colDimension,
    columns,
    columnLabels,
    matrix,
    totals: { columns: columnTotals, general: computeFromRows(config, definition, sourceRows).value },
    matrixFilters: buildFilterMeta(filters)
  };
};

// El cubo conserva los mismos IDs tipados y fórmulas que la matriz 2D. Cada
// marginal se calcula desde sus filas fuente: sumar celdas no sería correcto
// para DISTINCT, tasas o promedios.
const buildTridimensionalMatrix = async ({ config, definition, filters, rowDimension, colDimension, depthDimension }) => {
  const dimensions = [rowDimension, colDimension, depthDimension];
  // El provider de participaciones VcM entrega contadores por sexo, no una
  // propiedad sexo por fila. Su adaptación ponderada pertenece a otro cambio.
  if (config.kind === 'vcm_participacion' && dimensions.includes('sexo')) {
    throw new ServiceError(400, 'UNSUPPORTED_GROUP_DIMENSION',
      'El cubo por sexo no está disponible para participaciones VcM');
  }
  const admissionDimension = dimensions.includes('periodo') ? 'periodo' : rowDimension;
  const fetchFilters = admissionFetchFilters(config, definition, filters, admissionDimension);
  if (config.kind === 'admission_enrollment' && dimensions.includes('nuevoAntiguo')) {
    fetchFilters.needsNuevoAntiguo = true;
  }
  let rows = await getRows(config, fetchFilters, { historical: dimensions.includes('year') });
  if (fetchFilters.primeraMatricula) rows = applyAdmissionFirstPeriod(rows, filters);

  const rowGroups = new Map();
  const colGroups = new Map();
  const depthGroups = new Map();
  const intersections = new Map();
  for (const record of rows) {
    const categories = dimensions.map((dimension) =>
      matrixCategory(dimension, matrixDimension(dimension, record)));
    const [row, col, depth] = categories;
    for (const [groups, category] of [[rowGroups, row], [colGroups, col], [depthGroups, depth]]) {
      if (!groups.has(category.id)) groups.set(category.id, { ...category, rows: [] });
      groups.get(category.id).rows.push(record);
    }
    if (!intersections.has(row.id)) intersections.set(row.id, new Map());
    const byColumn = intersections.get(row.id);
    if (!byColumn.has(col.id)) byColumn.set(col.id, { rows: [], byDepth: new Map() });
    const cell = byColumn.get(col.id);
    cell.rows.push(record);
    if (!cell.byDepth.has(depth.id)) cell.byDepth.set(depth.id, []);
    cell.byDepth.get(depth.id).push(record);
  }

  const maxRows = matrixLimit('INDICATOR_MATRIX_MAX_ROWS', 50);
  const maxColumns = matrixLimit('INDICATOR_MATRIX_MAX_COLUMNS', 20);
  const maxDepth = matrixLimit('INDICATOR_CUBE_MAX_DEPTH', 10);
  const maxIntersections = matrixLimit('INDICATOR_CUBE_MAX_INTERSECTIONS', 10000);
  const possibleIntersections = rowGroups.size * colGroups.size * depthGroups.size;
  if (rowGroups.size > maxRows || colGroups.size > maxColumns
    || depthGroups.size > maxDepth || possibleIntersections > maxIntersections) {
    throw new ServiceError(400, 'MATRIX_LIMIT_EXCEEDED', 'El cubo supera el límite de categorías permitido', {
      rows: rowGroups.size, columns: colGroups.size, depth: depthGroups.size,
      intersections: possibleIntersections, maxRows, maxColumns, maxDepth, maxIntersections
    });
  }

  const orderedRows = [...rowGroups.values()].sort((a, b) => sortMatrixCategories(rowDimension, a, b));
  const orderedColumns = [...colGroups.values()].sort((a, b) => sortMatrixCategories(colDimension, a, b));
  const orderedDepths = [...depthGroups.values()].sort((a, b) => sortMatrixCategories(depthDimension, a, b));
  const columns = orderedColumns.map((category) => category.id);
  const depths = orderedDepths.map((category) => category.id);
  const columnLabels = Object.fromEntries(orderedColumns.map((category) => [category.id, category.label]));
  const depthLabels = Object.fromEntries(orderedDepths.map((category) => [category.id, category.label]));
  const cube = orderedRows.map((category) => {
    const values = Object.create(null);
    for (const column of orderedColumns) {
      const cell = intersections.get(category.id)?.get(column.id);
      const depthValues = Object.create(null);
      for (const depth of orderedDepths) {
        depthValues[depth.id] = computeFromRows(config, definition, cell?.byDepth.get(depth.id) || []).value;
      }
      values[column.id] = {
        total: computeFromRows(config, definition, cell?.rows || []).value,
        depthValues
      };
    }
    return {
      row: category.label,
      rowKey: category.id,
      values,
      total: computeFromRows(config, definition, category.rows).value
    };
  });
  return {
    isTridimensional: true,
    rowDimension, colDimension, depthDimension,
    columns, columnLabels, depths, depthLabels, cube,
    totals: {
      columns: Object.fromEntries(orderedColumns.map((category) =>
        [category.id, computeFromRows(config, definition, category.rows).value])),
      general: computeFromRows(config, definition, rows).value
    },
    matrixFilters: buildFilterMeta(filters)
  };
};

const getRequestedYearRange = (filters) => {
  if (filters.year !== null && filters.year !== undefined) return [filters.year];
  const hasFrom = filters.fromYear !== null && filters.fromYear !== undefined;
  const hasTo = filters.toYear !== null && filters.toYear !== undefined;
  if (!hasFrom && !hasTo) return null;
  const from = hasFrom ? filters.fromYear : filters.toYear;
  const to = hasTo ? filters.toYear : filters.fromYear;
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
};

const buildYearAxis = (filters, rows = []) => {
  const requested = getRequestedYearRange(filters);
  if (requested) return requested;
  const observed = rows
    .map((row) => Number(row.anio))
    .filter(Number.isFinite);
  if (!observed.length) return [];
  const from = Math.min(...observed);
  const to = Math.max(...observed);
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
};

const buildIntervalYearAxis = (filters, rows = []) => {
  const requested = getRequestedYearRange(filters);
  if (requested) return requested;
  const starts = rows.map((row) => Number(row.anioInicio)).filter(Number.isFinite);
  const ends = rows.map((row) => Number(row.anioTermino)).filter(Number.isFinite);
  if (!starts.length || !ends.length) return [];
  const from = Math.min(...starts);
  const to = Math.min(new Date().getFullYear(), Math.max(...ends));
  if (from > to) return [];
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
};

const expandActiveRowsByYear = (rows, selectedYears) => {
  if (!selectedYears.length) return [];
  const firstYear = selectedYears[0];
  const lastYear = selectedYears[selectedYears.length - 1];
  return rows.flatMap((row) => {
    const from = Math.max(Number(row.anioInicio), firstYear);
    const to = Math.min(Number(row.anioTermino), lastYear);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) return [];
    return Array.from({ length: to - from + 1 }, (_, index) => ({ ...row, anio: from + index }));
  });
};

const buildAnnualPoints = (config, definition, rows, filters, yearAxis = null) => {
  const byYear = groupRowsBy(rows, 'year');
  const years = yearAxis || buildYearAxis(filters, rows);
  return years.map((year) => {
    const bucket = byYear.get(year);
    if (!bucket || !bucket.length) {
      return { year: Number(year), value: config.kind.startsWith('curricular_') ? null : 0 };
    }
    const { value, hasData } = computeFromRows(config, definition, bucket);
    return { year: Number(year), value: hasData ? value : null };
  });
};

const getHistoricalInnovationFilters = async (config, filters) => {
  if (hasTemporalFilter(filters) || ![
    'innovation_active_project',
    'innovation_finalized_project'
  ].includes(config.kind)) return filters;
  const range = await provider.getInnovationYearRange(filters, {
    activeDuringYear: config.kind === 'innovation_active_project',
    finalizedInYear: config.kind === 'innovation_finalized_project'
  });
  return range ? { ...filters, fromYear: range.from, toYear: range.to } : filters;
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

const getIndicatorValue = async (indicatorKey, query = {}, options = {}) => {
  const key = ensureIndicatorKey(indicatorKey);
  const filters = parseIndicatorFilters(query);
  const departmentId = ensureDepartment(filters.department);
  await requireDepartment(departmentId);

  const cacheKey = `kpi:${departmentId}:val:${key}:${JSON.stringify(query)}`;
  const calculateValue = async () => {
    const { definition, config } = await resolveConfig(departmentId, key);

    const fetchFilters = admissionFetchFilters(config, definition, filters, null);
    let rows = await getRows(config, fetchFilters);
    if (fetchFilters.primeraMatricula) {
      rows = applyAdmissionFirstPeriod(rows, filters);
    }
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
  return options.bypassCache ? calculateValue() : cacheService.wrap(cacheKey, calculateValue);
};

const getIndicatorSeries = async (indicatorKey, query = {}) => {
  const key = ensureIndicatorKey(indicatorKey);
  const filters = parseIndicatorFilters(query);
  const departmentId = ensureDepartment(filters.department);
  await requireDepartment(departmentId);

  const cacheKey = `kpi:${departmentId}:series:${key}:${JSON.stringify(query)}`;
    return cacheService.wrap(cacheKey, async () => {
      const { definition, config } = await resolveConfig(departmentId, key);
      const groupBy = validateGroupBy(config, filters.groupBy);

      const historicalFilters = await getHistoricalInnovationFilters(config, filters);
      const fetchFilters = admissionFetchFilters(config, definition, historicalFilters, groupBy);
      let rows = await getRows(config, fetchFilters, { historical: true });
      if (fetchFilters.primeraMatricula) {
        rows = applyAdmissionFirstPeriod(rows, filters);
      }
      let yearAxis = null;
      if (config.kind === 'innovation_active_project' || config.kind === 'vcm_active_project') {
        yearAxis = config.kind === 'vcm_active_project'
          ? buildIntervalYearAxis(historicalFilters, rows)
          : buildYearAxis(historicalFilters, rows.flatMap((row) => [
            { anio: row.anioInicio }, { anio: Math.min(row.anioTermino, new Date().getFullYear()) }
          ]));
        rows = expandActiveRowsByYear(rows, yearAxis);
      }
      const metaContext = await require('./metaIndicatorIntegrationService').getIndicatorMetaContext(key, query);

      if (!groupBy || groupBy === 'year') {
        const points = buildAnnualPoints(config, definition, rows, historicalFilters, yearAxis);
        return {
          data: {
            indicatorKey: key,
            department: departmentId,
            groupBy: null,
            points,
            hasData: points.some((point) => point.value !== null),
            filters: buildFilterMeta(filters),
            meta: { source: 'postgresql', formulaKey: definition.formulaKey },
            ...(metaContext ? { targetLine: metaContext.targetLine } : {})
          }
        };
      }

    const sharedYearAxis = yearAxis || buildYearAxis(historicalFilters, rows);
    const segmentRows = config.kind === 'vcm_participacion' && groupBy === 'sexo'
      ? splitVcmParticipationBySex(rows)
      : rows;
    const bySegment = groupRowsBy(segmentRows, groupBy);
    const series = [];
    [...bySegment.keys()].sort().forEach((label) => {
      const rowsForSegment = bySegment.get(label);
      const points = buildAnnualPoints(config, definition, rowsForSegment, historicalFilters, sharedYearAxis);
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
        meta: { source: 'postgresql', formulaKey: definition.formulaKey },
        ...(metaContext ? { targetLine: metaContext.targetLine } : {})
      }
    };
  });
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
  const requestedGroupBy = filters.groupBy;
  const groupBy = validateGroupBy(config, filters.groupBy);
  const cacheKey = `kpi:${departmentId}:breakdown:${key}:${JSON.stringify(query)}`;
  return cacheService.wrap(cacheKey, async () => {
    const historicalFilters = groupBy === 'year'
      ? await getHistoricalInnovationFilters(config, filters)
      : filters;
    const fetchFilters = admissionFetchFilters(config, definition, historicalFilters, groupBy);
    let rows = await getRows(config, fetchFilters, { historical: groupBy === 'year' });
    if (fetchFilters.primeraMatricula) {
      rows = applyAdmissionFirstPeriod(rows, filters);
    }
    let yearAxis = null;
    if (groupBy === 'year' && (config.kind === 'innovation_active_project' || config.kind === 'vcm_active_project')) {
      yearAxis = config.kind === 'vcm_active_project'
        ? buildIntervalYearAxis(historicalFilters, rows)
        : buildYearAxis(historicalFilters, rows.flatMap((row) => [
          { anio: row.anioInicio }, { anio: Math.min(row.anioTermino, new Date().getFullYear()) }
        ]));
      rows = expandActiveRowsByYear(rows, yearAxis);
    }
    const metaContext = await require('./metaIndicatorIntegrationService').getIndicatorMetaContext(key, query);

    // Conserva el contrato del breakdown y comparte la medida con series y matriz.
    if (config.kind === 'vcm_participacion' && groupBy === 'sexo') {
      const groups = groupRowsBy(splitVcmParticipationBySex(rows), 'sexo');
      const items = VCM_SEX_COUNTERS.filter((sexo) => groups.has(sexo))
        .map((sexo) => ({
          label: sexo,
          value: computeFromRows(config, definition, groups.get(sexo)).value
        }));
      items.sort((a, b) => b.value - a.value);

      return {
        data: {
          indicatorKey: key,
          department: departmentId,
          groupBy: requestedGroupBy,
          items,
          hasData: items.length > 0,
          filters: buildFilterMeta(filters),
          meta: { source: 'postgresql', formulaKey: definition.formulaKey }
        }
      };
    }

    let items;
    if (groupBy === 'year') {
      items = buildAnnualPoints(config, definition, rows, historicalFilters, yearAxis)
        .map((point) => ({ label: String(point.year), value: point.value }));
      items.sort((a, b) => (b.value ?? Number.NEGATIVE_INFINITY) - (a.value ?? Number.NEGATIVE_INFINITY));
    } else {
      const groups = groupRowsBy(rows, groupBy);
      items = [];
      [...groups.keys()].forEach((label) => {
        const { value, hasData } = computeFromRows(config, definition, groups.get(label));
        if (hasData) items.push({ label: String(label), value });
      });
      items.sort((a, b) => b.value - a.value);
    }

    return {
      data: {
        indicatorKey: key,
        department: departmentId,
        groupBy: requestedGroupBy,
        items,
        hasData: items.length > 0,
        filters: buildFilterMeta(filters),
        meta: { source: 'postgresql', formulaKey: definition.formulaKey },
        ...(metaContext ? {
          metaTarget: metaContext.metaTarget,
          metaStatus: metaContext.metaStatus
        } : {})
      }
    };
  });
};

const getDepartmentFilters = async (departmentKey, query = {}) => {
  const key = ensureDepartment(departmentKey);
  await requireDepartment(key);
  const cacheKey = `filters:${key}:${JSON.stringify(query)}`;
  return cacheService.wrap(cacheKey, async () => {
    const filters = parseIndicatorFilters({ ...query, department: key });
    const options = await provider.getFilterOptions(key, filters);
    return { data: { department: key, filters: options } };
  });
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
  cacheService.invalidateDepartment(key);
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
  cacheService.invalidateDepartment(key);
  return { data };
};

const deleteDepartment = async (departmentKey) => {
  const key = ensureDepartment(departmentKey);
  const ok = await provider.deleteDepartment(key);
  if (!ok) {
    throw new ServiceError(404, 'DEPARTMENT_NOT_FOUND', 'El departamento solicitado no existe', { departmentKey: key });
  }
  cacheService.invalidateDepartment(key);
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
  cacheService.invalidateDepartment(key);
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
  cacheService.invalidateDepartment(key);
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
  cacheService.invalidateDepartment(key);
  return { data: { departmentKey: key, indicatorKey: ind, deleted: true } };
};

const getEnabledKpis = async (departmentKey) => {
  const kpis = await provider.getKpisByDepartment(departmentKey);
  return kpis.filter((kpi) => kpi.enabled !== false);
};

/**
 * Vista detallada de un indicador: metadatos + serie por año + tabla + comparación.
 * Fuente del endpoint GET /api/indicators/:key/detail.
 *
 * Sin groupBy efectivo -> serie por año. Un default opcional del catálogo activa el desagregado.
 * Acepta year/fromYear/toYear y groupBy (debe estar en allowedGroupBy del indicador).
 */
const getIndicatorDetailView = async (indicatorKey, query = {}) => {
  const key = ensureIndicatorKey(indicatorKey);
  const kpi = await provider.getKpi('institucional', key);
  if (!kpi) {
    throw new ServiceError(404, 'KPI_NOT_FOUND', 'El indicador solicitado no existe', { indicatorKey: key });
  }

  const department = kpi.departmentId;
  const cacheKey = `kpi:${department}:detail:${key}:${JSON.stringify(query)}`;
  return cacheService.wrap(cacheKey, async () => {
    const hasSplitBy = Object.prototype.hasOwnProperty.call(query, 'splitBy');
    const hasSplitBy2 = Object.prototype.hasOwnProperty.call(query, 'splitBy2');
    const { splitBy: _omitSplitBy, splitBy2: _omitSplitBy2, ...detailQuery } = query;
    const baseQuery = { ...detailQuery, department };
    const config = getIndicatorConfig(key, kpi) || { allowedGroupBy: [] };
    const requestedGroupBy = Object.prototype.hasOwnProperty.call(query, 'groupBy')
      ? query.groupBy
      : (config.defaultGroupBy ?? null);
    if (hasSplitBy2 && !hasSplitBy) {
      throw new ServiceError(400, 'MISSING_COLUMN_DIMENSION', 'splitBy2 requiere splitBy');
    }
    if (hasSplitBy) {
      const dimensions = [['groupBy', requestedGroupBy], ['splitBy', query.splitBy]];
      if (hasSplitBy2) dimensions.push(['splitBy2', query.splitBy2]);
      for (const [name, value] of dimensions) {
        if (typeof value !== 'string' || !value.trim() || value.includes(',')) {
          const code = name === 'groupBy'
            ? (value === null || value === '' ? 'MISSING_ROW_DIMENSION' : 'INVALID_GROUP_BY')
            : (name === 'splitBy' ? 'INVALID_SPLIT_BY' : 'INVALID_SPLIT_BY2');
          throw new ServiceError(400, code,
          `El parámetro ${name} debe contener una sola dimensión válida`);
        }
      }
    }
    const groupBy = validateGroupBy(config, requestedGroupBy);
    let splitBy = null;
    let splitBy2 = null;
    if (hasSplitBy) {
      try {
        splitBy = validateGroupBy(config, query.splitBy === 'anio' ? 'year' : query.splitBy);
      } catch (error) {
        if (error.code !== 'INVALID_GROUP_BY') throw error;
        throw new ServiceError(400, 'INVALID_SPLIT_BY', 'El splitBy solicitado no aplica para este indicador', {
          splitBy: query.splitBy, allowed: config.allowedGroupBy
        });
      }
      if (groupBy === splitBy) {
        throw new ServiceError(400, 'DUPLICATE_GROUP_DIMENSIONS', 'groupBy y splitBy deben ser diferentes');
      }
    }
    if (hasSplitBy2) {
      try {
        splitBy2 = validateGroupBy(config, query.splitBy2 === 'anio' ? 'year' : query.splitBy2);
      } catch (error) {
        if (error.code !== 'INVALID_GROUP_BY') throw error;
        throw new ServiceError(400, 'INVALID_SPLIT_BY2', 'El splitBy2 solicitado no aplica para este indicador', {
          splitBy2: query.splitBy2, allowed: config.allowedGroupBy
        });
      }
      if (splitBy2 === groupBy || splitBy2 === splitBy) {
        throw new ServiceError(400, 'DUPLICATE_GROUP_DIMENSIONS', 'Las tres dimensiones deben ser diferentes');
      }
    }
    const requestedFilters = parseIndicatorFilters(baseQuery);

    // Un año puntual define la referencia, pero no recorta la historia. Un rango
    // explícito sí limita el eje solicitado. Se eliminan todos los aliases para
    // impedir que uno de ellos sobreviva y reduzca accidentalmente la serie.
    const {
      groupBy: _omitGroupBy,
      year: _omitYear,
      anio: _omitAnio,
      'año': _omitAnioUnicode,
      ...annualQueryBase
    } = baseQuery;
    const annualQuery = requestedFilters.year !== null
      ? (() => {
        const { fromYear: _omitFrom, toYear: _omitTo, ...withoutRange } = annualQueryBase;
        return withoutRange;
      })()
      : annualQueryBase;
    const annualSeries = await module.exports.getIndicatorSeries(key, annualQuery);
    const annualPoints = annualSeries.data.points || [];
    const years = annualPoints.map((point) => Number(point.year)).filter((year) => Number.isFinite(year));
    const period = years.length
      ? { from: Math.min(...years), to: Math.max(...years) }
      : { from: null, to: null };

    // Año de referencia: cualquier alias explícito, o el más reciente de la serie.
    const refYear = requestedFilters.year !== null
      ? requestedFilters.year
      : (annualPoints.length ? Number(annualPoints[annualPoints.length - 1].year) : null);

    let total = null;
    let hasData = false;
    if (refYear !== null) {
      const {
        year: _totalYear,
        anio: _totalAnio,
        'año': _totalAnioUnicode,
        fromYear: _totalFrom,
        toYear: _totalTo,
        groupBy: _totalGroupBy,
        ...nonTemporalQuery
      } = baseQuery;
      const valueResult = await module.exports.getIndicatorValue(key, {
        ...nonTemporalQuery,
        year: refYear
      });
      total = valueResult.data.value;
      hasData = valueResult.data.hasData;
    }

    let comparison = null;
    const current = annualPoints.find((point) => Number(point.year) === refYear);
    const previous = annualPoints.find((point) => Number(point.year) === refYear - 1);
    if (current && previous && current.value !== null && previous.value !== null) {
      comparison = {
        previousYear: previous.year,
        previousValue: previous.value,
        diff: current.value - previous.value
      };
    }

    let table;
    let series;
    if (groupBy && groupBy !== 'year') {
      const breakdownResult = await module.exports.getIndicatorBreakdown(key, { ...baseQuery, groupBy });
      table = (breakdownResult.data.items || []).map((item) => ({ label: item.label, value: item.value }));
      const seriesResult = await module.exports.getIndicatorSeries(key, { ...baseQuery, groupBy });
      series = seriesResult.data.series || [];
    } else {
      table = annualPoints.map((point) => ({ year: point.year, value: point.value }));
      series = annualPoints;
    }

    const matrixResult = hasSplitBy2
      ? await buildTridimensionalMatrix({
        config, definition: kpi, filters: requestedFilters,
        rowDimension: groupBy, colDimension: splitBy, depthDimension: splitBy2
      })
      : (hasSplitBy ? await buildBidimensionalMatrix({
        config, definition: kpi, filters: requestedFilters, rowDimension: groupBy, colDimension: splitBy
      }) : null);
    return {
      data: {
        indicatorKey: key,
        department,
        title: kpi.name,
        description: kpi.description,
        unit: kpi.unit,
        format: kpi.format,
        total,
        formattedTotal: hasData ? formatValue(total, kpi.format) : null,
        hasData,
        disaggregated: Boolean(groupBy && groupBy !== 'year'),
        groupBy,
        allowedGroupBy: Array.isArray(config.allowedGroupBy) ? config.allowedGroupBy : [],
        dimensionLabels: Object.fromEntries(
          (Array.isArray(config.allowedGroupBy) ? config.allowedGroupBy : [])
            .filter((dim) => DIMENSION_LABELS[dim])
            .map((dim) => [dim, DIMENSION_LABELS[dim]])
        ),
        period,
        comparison,
        table,
        series,
        filters: buildFilterMeta(requestedFilters),
        meta: { source: 'postgresql', formulaKey: kpi.formulaKey },
        ...(matrixResult || {})
      }
    };
  });
};

const getIndicatorDetail = async (indicatorKey, query = {}) => {
  const result = await getIndicatorDetailView(indicatorKey, query);
  return result.data;
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
  getIndicatorDetailView,
  getDepartmentFilters,
  getIndicatorValue,
  getIndicatorSeries,
  getIndicatorBreakdown,
  getIndicatorDetailView
};
