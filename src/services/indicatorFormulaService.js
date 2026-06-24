const hasNumber = (value) => value !== null && value !== undefined && !Number.isNaN(Number(value));

const COUNT_COURSES_DICTATED = (data = {}) => {
  if (!hasNumber(data.cursosDictados)) {
    return { value: null, hasData: false };
  }
  return { value: Number(data.cursosDictados), hasData: true };
};

const EXECUTION_RATE = (data = {}) => {
  if (!hasNumber(data.cursosProgramados) || Number(data.cursosProgramados) === 0 || !hasNumber(data.cursosDictados)) {
    return { value: null, hasData: false };
  }
  return { value: Math.round((Number(data.cursosDictados) / Number(data.cursosProgramados)) * 100), hasData: true };
};

const ENROLLMENT_TOTAL = (data = {}) => {
  if (!hasNumber(data.matriculas)) {
    return { value: null, hasData: false };
  }
  return { value: Number(data.matriculas), hasData: true };
};

const REVENUE_SUM = (data = {}) => {
  if (!hasNumber(data.ingresosNetosCLP)) {
    return { value: null, hasData: false };
  }
  return { value: Number(data.ingresosNetosCLP), hasData: true };
};

const formulaRegistry = {
  COUNT_COURSES_DICTATED,
  EXECUTION_RATE,
  ENROLLMENT_TOTAL,
  REVENUE_SUM
};

const apply = (formulaKey, data) => {
  const formula = formulaRegistry[formulaKey];
  if (!formula) {
    return { value: null, hasData: false };
  }
  return formula(data || {});
};

module.exports = {
  formulaRegistry,
  apply
};
