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
    throw new ServiceError(400, 'INVALID_YEAR', 'El parámetro "year" debe ser un año numérico de 4 dígitos', { year: rawYear });
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

const emptySummary = (year, sourceConnected) => ({
  data: {
    year,
    departments: [],
    meta: { totalDepartments: 0, departmentsWithIndicators: 0, totalCards: 0, sourceConnected }
  }
});

const buildCards = async (departmentKey, year) => {
  const kpis = await indicatorService.getEnabledKpis(departmentKey);
  const cards = [];
  for (const kpi of kpis) {
    const { data } = await indicatorService.getIndicatorValue(kpi.key, {
      department: departmentKey,
      year: String(year)
    });
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
  const year = parseYear(query.year);
  const sortBy = validateSortBy(query.sortBy);
  const order = validateOrder(query.order);
  const resolvedYear = year !== null ? year : new Date().getFullYear();

  const sourceConnected = await indicatorService.isSourceConnected();
  if (!sourceConnected) {
    return emptySummary(resolvedYear, false);
  }

  const { data: catalog } = await indicatorService.listDepartments();
  const filtered = query.department
    ? catalog.filter((dept) => dept.key === String(query.department).trim())
    : catalog;

  let departments = [];
  for (const dept of filtered) {
    const cards = await buildCards(dept.key, resolvedYear);
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
      year: resolvedYear,
      departments,
      meta: {
        totalDepartments: departments.length,
        departmentsWithIndicators,
        totalCards,
        sourceConnected: true
      }
    }
  };
};

module.exports = {
  ServiceError,
  getSummary
};
