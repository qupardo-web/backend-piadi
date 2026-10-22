const round2 = (n) => Math.round(n * 100) / 100;

// --- Fórmulas de Educación Continua ---
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

// --- Fórmulas de Vinculación con el Medio (VCM) ---
const COUNT_CONVENIOS = (m = {}) => ({ value: m.conveniosCount || 0, hasData: true });
const CONVENIOS_BY_SECTOR = (m = {}) => ({ value: m.conveniosCount || 0, hasData: true });
const COUNT_ACTIVE_CONVENIOS = (m = {}) => ({ value: m.conveniosActivosCount || 0, hasData: true });
const COUNT_ACTIVITIES = (m = {}) => ({ value: m.actividadesCount || 0, hasData: true });
const PARTICIPACIONES_SUM = (m = {}) => ({ value: m.participantesSum || 0, hasData: true });
const COUNT_ARTICULACIONES = (m = {}) => ({ value: m.articulacionesCount || 0, hasData: true });
const COUNT_PROJECTS = (m = {}) => ({ value: m.proyectosCount || 0, hasData: true });
const FINANCING_SUM = (m = {}) => ({ value: m.financiamientoSum || 0, hasData: true });

// --- Fórmulas de Innovación ---
const COUNT_ACTIVE_INNOVATION_PROJECTS = (m = {}) => ({ value: m.proyectosActivosCount || 0, hasData: true });
const COUNT_ALL_INNOVATION_PROJECTS = (m = {}) => ({ value: m.proyectosCount || 0, hasData: true });
const COUNT_FINALIZED_INNOVATION_PROJECTS = (m = {}) => ({ value: m.proyectosCount || 0, hasData: true });
const SUM_INNOVATION_FINANCING = (m = {}) => ({ value: m.financiamientoSum || 0, hasData: true });
const COUNT_EXTERNAL_FINANCED_PROJECTS = (m = {}) => ({ value: m.proyectosExternosCount || 0, hasData: true });
const COUNT_INNOVATION_SECTIONS = (m = {}) => ({ value: m.seccionesCount || 0, hasData: true });
const SUM_INNOVATION_TEACHERS = (m = {}) => ({ value: m.docentesSum || 0, hasData: true });

// --- Fórmulas de Admisión ---
// Los providers conservan el detalle necesario para breakdown y la agregación
// común garantiza que una persona se cuente una sola vez en cada grupo.
const ADMISSION_UNIQUE_COUNT = (m = {}) => ({ value: m.admissionUniqueCount || 0, hasData: true });

// Desarrollo Curricular: las tasas se calculan a partir de conteos del grupo,
// nunca promediando porcentajes de asignaturas o períodos.
const curricularRate = (numerator, denominator) => denominator > 0
  ? { value: round2((numerator / denominator) * 100), hasData: true }
  : { value: null, hasData: false };
const APPROVAL_RATE_BY_COURSE = (m = {}) => curricularRate(m.aprobadosCount, m.evaluablesCount);
const FAILURE_RATE_BY_COURSE = (m = {}) => curricularRate(m.reprobadosCount, m.evaluablesCount);
const CRITICAL_COURSES = (m = {}) => m.evaluablesCount > 0
  ? { value: m.asignaturasCriticasCount || 0, hasData: true }
  : { value: null, hasData: false };
const COUNT_ENROLLED_INTERNSHIPS = (m = {}) => m.practicasRegistradasCount > 0
  ? { value: m.practicasInscritasCount || 0, hasData: true }
  : { value: null, hasData: false };
const COUNT_APPROVED_INTERNSHIPS = (m = {}) => m.practicasRegistradasCount > 0
  ? { value: m.practicasAprobadasCount || 0, hasData: true }
  : { value: null, hasData: false };
const COUNT_GRADUATES_BY_YEAR = (m = {}) => ({ value: m.tituladosCount || 0, hasData: true });
const AVERAGE_GRADUATION_TIME = (m = {}) => m.semestresCount > 0
  ? { value: round2(m.semestresSum / m.semestresCount), hasData: true }
  : { value: null, hasData: false };
// El modelo Titulacion sólo almacena titulados: no contiene el universo de
// ingresantes de una cohorte, imprescindible como denominador de la tasa.
const GRADUATION_RATE_BY_COHORT = () => ({ value: null, hasData: false });

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
  TRAINING_RECURRENCE,
  // VCM
  COUNT_CONVENIOS,
  CONVENIOS_BY_SECTOR,
  COUNT_ACTIVE_CONVENIOS,
  COUNT_ACTIVITIES,
  PARTICIPACIONES_SUM,
  COUNT_ARTICULACIONES,
  COUNT_PROJECTS,
  FINANCING_SUM,
  COUNT_ACTIVE_INNOVATION_PROJECTS,
  COUNT_ALL_INNOVATION_PROJECTS,
  COUNT_FINALIZED_INNOVATION_PROJECTS,
  SUM_INNOVATION_FINANCING,
  COUNT_EXTERNAL_FINANCED_PROJECTS,
  COUNT_INNOVATION_SECTIONS,
  SUM_INNOVATION_TEACHERS,
  COUNT_ADMISSION_ENROLLMENT_TOTAL: ADMISSION_UNIQUE_COUNT,
  COUNT_ADMISSION_NEW_VS_OLD: ADMISSION_UNIQUE_COUNT,
  COUNT_ADMISSION_BY_COURSE: ADMISSION_UNIQUE_COUNT,
  COUNT_ADMISSION_BY_SECTION: ADMISSION_UNIQUE_COUNT,
  COUNT_ADMISSION_BY_ACADEMIC_STATUS: ADMISSION_UNIQUE_COUNT,
  DISTRIBUTION_ADMISSION_SOCIOECONOMIC: ADMISSION_UNIQUE_COUNT,
  DISTRIBUTION_ADMISSION_FAMILY_SITUATION: ADMISSION_UNIQUE_COUNT,
  DISTRIBUTION_ADMISSION_GEOGRAPHY: ADMISSION_UNIQUE_COUNT,
  DISTRIBUTION_ADMISSION_SCHOOL_TYPE: ADMISSION_UNIQUE_COUNT,
  DISTRIBUTION_ADMISSION_ACCESS_ROUTE: ADMISSION_UNIQUE_COUNT,
  DISTRIBUTION_ADMISSION_BENEFITS: ADMISSION_UNIQUE_COUNT,
  DISTRIBUTION_ADMISSION_GENDER: ADMISSION_UNIQUE_COUNT,
  DISTRIBUTION_ADMISSION_AGE_RANGE: ADMISSION_UNIQUE_COUNT,
  APPROVAL_RATE_BY_COURSE,
  FAILURE_RATE_BY_COURSE,
  CRITICAL_COURSES,
  COUNT_ENROLLED_INTERNSHIPS,
  COUNT_APPROVED_INTERNSHIPS,
  GRADUATION_RATE_BY_COHORT,
  COUNT_GRADUATES_BY_YEAR,
  AVERAGE_GRADUATION_TIME
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
