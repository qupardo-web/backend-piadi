const round2 = (n) => Math.round(n * 100) / 100;

const COUNT_PROGRAMMED_OFFER = (m = {}) => ({ value: m.ofertaProgramada || 0, hasData: true });

const COUNT_COURSES_DICTATED = (m = {}) => ({ value: m.cursosDictados || 0, hasData: true });

const EXECUTION_RATE = (m = {}) => {
  if (!m.ofertaProgramada) {
    return { value: null, hasData: false };
  }
  return { value: round2((m.cursosDictados / m.ofertaProgramada) * 100), hasData: true };
};

const ENROLLMENT_TOTAL = (m = {}) => ({ value: m.matriculaSum || 0, hasData: true });

const APPROVAL_RATE = (m = {}) => {
  if (!m.matriculaSum) {
    return { value: null, hasData: false };
  }
  return { value: round2((m.aprobadosSum / m.matriculaSum) * 100), hasData: true };
};

const REVENUE_SUM = (m = {}) => ({ value: m.ingresosNetosSum || 0, hasData: true });

const AVERAGE_TICKET = (m = {}) => {
  if (!m.matriculaSum) {
    return { value: null, hasData: false };
  }
  return { value: Math.round(m.ingresosNetosSum / m.matriculaSum), hasData: true };
};

const UNIQUE_PARTICIPANTS = (m = {}) => ({ value: m.participantesUnicos || 0, hasData: true });

const PARTICIPANT_PROFILE = (m = {}) => ({ value: m.participantesUnicos || 0, hasData: true });

const TRAINING_RECURRENCE = (m = {}) => ({ value: m.participantesRecurrentes || 0, hasData: true });

const formulaRegistry = {
  COUNT_PROGRAMMED_OFFER,
  COUNT_COURSES_DICTATED,
  EXECUTION_RATE,
  ENROLLMENT_TOTAL,
  APPROVAL_RATE,
  REVENUE_SUM,
  AVERAGE_TICKET,
  UNIQUE_PARTICIPANTS,
  PARTICIPANT_PROFILE,
  TRAINING_RECURRENCE
};

const apply = (formulaKey, metrics) => {
  const formula = formulaRegistry[formulaKey];
  if (!formula) {
    return { value: null, hasData: false };
  }
  return formula(metrics || {});
};

module.exports = {
  formulaRegistry,
  apply
};
