const indicatorService = require('./indicatorService');
const { parseIndicatorFilters, buildFilterMeta } = require('./indicatorFilters');

const ALLOWED_SORT = ['name', 'department', 'value'];

class ServiceError extends Error {
  constructor(statusCode, code, message, details = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

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

const resolveYearLabel = (filters) => {
  if (filters.year !== null) return filters.year;
  if (filters.toYear !== null) return filters.toYear;
  if (filters.fromYear !== null) return filters.fromYear;
  return new Date().getFullYear();
};

const emptySummary = (yearLabel, filterMeta, sourceConnected) => ({
  data: {
    year: yearLabel,
    departments: [],
    meta: { totalDepartments: 0, departmentsWithIndicators: 0, totalCards: 0, sourceConnected },
    filters: filterMeta
  }
});

const buildCards = async (departmentKey, query) => {
  const kpis = await indicatorService.getEnabledKpis(departmentKey);
  const cards = [];
  for (const kpi of kpis) {
    const { data } = await indicatorService.getIndicatorValue(kpi.key, { ...query, department: departmentKey });
    cards.push({
      indicatorKey: kpi.key,
      title: kpi.name,
      value: data.value,
      formattedValue: data.formattedValue,
      unit: kpi.unit,
      format: kpi.format,
      hasData: data.hasData
    });
  }
  return cards;
};

const getSummary = async (query = {}) => {
  const filters = parseIndicatorFilters(query);
  const sortBy = validateSortBy(query.sortBy);
  const order = validateOrder(query.order);
  const yearLabel = resolveYearLabel(filters);
  const filterMeta = buildFilterMeta(filters);

  const sourceConnected = await indicatorService.isSourceConnected();
  if (!sourceConnected) {
    return emptySummary(yearLabel, filterMeta, false);
  }

  const { data: catalog } = await indicatorService.listDepartments();
  const targets = filters.department
    ? catalog.filter((dept) => dept.key === filters.department)
    : catalog.filter((dept) => dept.enabled !== false);

  let departments = [];
  for (const dept of targets) {
    const cards = await buildCards(dept.key, query);
    departments.push({
      departmentId: dept.key,
      name: dept.name,
      hasIndicators: cards.length > 0,
      cards
    });
  }

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
      year: yearLabel,
      departments,
      meta: {
        totalDepartments: departments.length,
        departmentsWithIndicators,
        totalCards,
        sourceConnected: true
      },
      filters: filterMeta
    }
  };
};

module.exports = {
  ServiceError,
  getSummary
};
