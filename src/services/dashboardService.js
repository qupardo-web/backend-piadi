const indicatorService = require('./indicatorService');

const ALLOWED_SORT = ['name', 'department', 'value'];

class ServiceError extends Error {
  constructor(statusCode, code, message, details = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

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

const validateSortBy = (sortBy) => {
  if (sortBy === undefined || sortBy === '') {
    return null;
  }
  if (!ALLOWED_SORT.includes(sortBy)) {
    throw new ServiceError(400, 'INVALID_SORT_FIELD', 'El campo de ordenamiento "sortBy" no está permitido', {
      sortBy,
      allowed: ALLOWED_SORT
    });
  }
  return sortBy;
};

const validateOrder = (order) => {
  if (order === undefined || order === '') {
    return 'asc';
  }
  if (order !== 'asc' && order !== 'desc') {
    throw new ServiceError(400, 'INVALID_ORDER', 'El parámetro "order" debe ser "asc" o "desc"', { order });
  }
  return order;
};

const buildCards = (departmentId, year) => {
  const definitions = indicatorService.getKpiDefinitions(departmentId);
  return definitions.map((definition) => {
    const { data } = indicatorService.getIndicatorValue(definition.key, {
      department: departmentId,
      year: String(year)
    });
    return {
      indicatorKey: definition.key,
      title: definition.name,
      value: data.value,
      formattedValue: data.formattedValue,
      unit: definition.unit,
      format: definition.format,
      hasData: data.hasData
    };
  });
};

const resolveTargets = (departmentParam) => {
  const catalog = indicatorService.getDepartmentCatalog();
  if (departmentParam !== undefined && String(departmentParam).trim() !== '') {
    const id = String(departmentParam).trim();
    return catalog.filter((dept) => dept.id === id);
  }
  return catalog.filter((dept) => indicatorService.getKpiDefinitions(dept.id).length > 0);
};

const getSummary = (query = {}) => {
  const year = parseYear(query.year);
  const sortBy = validateSortBy(query.sortBy);
  const order = validateOrder(query.order);
  const resolvedYear = year !== null ? year : new Date().getFullYear();

  let departments = resolveTargets(query.department).map((dept) => {
    const cards = buildCards(dept.id, resolvedYear);
    return {
      departmentId: dept.id,
      name: dept.name,
      hasIndicators: cards.length > 0,
      cards
    };
  });

  if (sortBy === 'name' || sortBy === 'department') {
    departments = departments.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    if (order === 'desc') {
      departments.reverse();
    }
  }

  const totalCards = departments.reduce((sum, dept) => sum + dept.cards.length, 0);
  const departmentsWithIndicators = departments.filter((dept) => dept.hasIndicators).length;

  return {
    data: {
      year: resolvedYear,
      departments,
      meta: {
        totalDepartments: departments.length,
        departmentsWithIndicators,
        totalCards,
        sourceConnected: indicatorService.isSourceConnected()
      }
    }
  };
};

module.exports = {
  ServiceError,
  getSummary
};
