const dataProvider = require('./indicatorDataProvider');

class ServiceError extends Error {
  constructor(statusCode, code, message, details = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

const DEPARTMENTS = [
  {
    id: 'admision',
    name: 'Admisión',
    description: 'Gestión de procesos de admisión y matrícula de nuevos estudiantes.',
    enabled: false
  },
  {
    id: 'relaciones_estudiantiles',
    name: 'Relaciones Estudiantiles',
    description: 'Apoyo y seguimiento a la experiencia y el bienestar de los estudiantes.',
    enabled: false
  },
  {
    id: 'desarrollo_curricular',
    name: 'Desarrollo Curricular',
    description: 'Diseño, actualización y aseguramiento de la calidad de los planes de estudio.',
    enabled: false
  },
  {
    id: 'innovacion',
    name: 'Innovación',
    description: 'Iniciativas de innovación académica y transformación educativa.',
    enabled: false
  },
  {
    id: 'educacion_continua',
    name: 'Educación Continua',
    description: 'Gestión de programas de formación continua, postgrados y educación permanente para profesionales.',
    enabled: true
  },
  {
    id: 'vinculacion_medio',
    name: 'Vinculación con el Medio',
    description: 'Vinculación con el medio, convenios y proyectos con el entorno.',
    enabled: false
  }
];

const KPI_DEFINITIONS = {
  educacion_continua: [
    { key: 'cursos_dictados', name: 'Cursos efectivamente dictados', unit: 'cursos', format: 'number' },
    { key: 'tasa_ejecucion', name: 'Tasa de ejecución', unit: '%', format: 'percentage' },
    { key: 'matricula_por_programa', name: 'Matrícula en programas', unit: 'personas', format: 'number' },
    { key: 'ingresos_generados', name: 'Ingresos generados', unit: 'CLP', format: 'currency' }
  ]
};

const findDepartment = (id) => DEPARTMENTS.find((dept) => dept.id === id) || null;

const getDepartmentCatalog = () => DEPARTMENTS.map((dept) => ({ ...dept }));

const getKpiDefinitions = (departmentId) => (KPI_DEFINITIONS[departmentId] || []).map((kpi) => ({ ...kpi }));

const findKpiDefinition = (departmentId, key) =>
  getKpiDefinitions(departmentId).find((kpi) => kpi.key === key) || null;

const isSourceConnected = () => dataProvider.isConnected() === true;

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

const parseYear = (rawYear) => {
  if (rawYear === undefined || rawYear === null || rawYear === '') {
    return null;
  }
  if (!/^\d{4}$/.test(String(rawYear))) {
    throw new ServiceError(400, 'INVALID_YEAR', 'El parámetro "year" debe ser un año numérico de 4 dígitos', {
      year: rawYear
    });
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

const listDepartments = () => {
  const connected = isSourceConnected();
  const data = DEPARTMENTS.map((dept) => {
    const meta = connected && dept.enabled ? dataProvider.getDepartmentMeta(dept.id) : null;
    return {
      id: dept.id,
      name: dept.name,
      description: dept.description,
      hasData: Boolean(meta && meta.hasData),
      enabled: dept.enabled,
      lastUpdated: meta && meta.lastUpdated ? meta.lastUpdated : null
    };
  });
  return { data };
};

const getDepartmentKpis = (departmentId) => {
  const id = ensureDepartment(departmentId);
  const department = findDepartment(id);
  const kpis = getKpiDefinitions(id);
  if (!department || kpis.length === 0) {
    return {
      data: {
        departmentId: id,
        kpis: [],
        hasIndicators: false,
        message: 'No hay indicadores definidos para este departamento.'
      }
    };
  }
  return {
    data: {
      departmentId: id,
      kpis,
      hasIndicators: true
    }
  };
};

const getIndicatorValue = (indicatorKey, query = {}) => {
  const key = ensureIndicatorKey(indicatorKey);
  const departmentId = ensureDepartment(query.department);
  const year = parseYear(query.year);
  const resolvedYear = year !== null ? year : new Date().getFullYear();
  const definition = findKpiDefinition(departmentId, key);
  const unit = definition ? definition.unit : null;
  const format = definition ? definition.format : null;

  const providerValue = isSourceConnected()
    ? dataProvider.getIndicatorValue(departmentId, key, resolvedYear)
    : null;

  if (providerValue && providerValue.value !== null && providerValue.value !== undefined) {
    return {
      data: {
        departmentId,
        indicatorKey: key,
        year: resolvedYear,
        value: providerValue.value,
        formattedValue: formatValue(providerValue.value, format),
        unit,
        format,
        hasData: true,
        source: providerValue.source || 'Carga de datos'
      }
    };
  }

  return {
    data: {
      departmentId,
      indicatorKey: key,
      year: resolvedYear,
      value: null,
      formattedValue: null,
      unit,
      format,
      hasData: false,
      message: 'Indicador sin datos disponibles porque aún no existe conexión con la carga/base de datos.'
    }
  };
};

const getIndicatorSeries = (indicatorKey, query = {}) => {
  const key = ensureIndicatorKey(indicatorKey);
  const departmentId = ensureDepartment(query.department);
  const points = isSourceConnected() ? dataProvider.getIndicatorSeries(departmentId, key) : [];

  if (Array.isArray(points) && points.length > 0) {
    return {
      data: {
        departmentId,
        indicatorKey: key,
        points,
        hasData: true
      }
    };
  }

  return {
    data: {
      departmentId,
      indicatorKey: key,
      points: [],
      hasData: false,
      message: 'Serie histórica no disponible porque aún no existe conexión con la carga/base de datos.'
    }
  };
};

module.exports = {
  ServiceError,
  parseYear,
  formatValue,
  getDepartmentCatalog,
  getKpiDefinitions,
  findKpiDefinition,
  isSourceConnected,
  listDepartments,
  getDepartmentKpis,
  getIndicatorValue,
  getIndicatorSeries
};
