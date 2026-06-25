const { Department, IndicatorDefinition } = require('../models');

const DEPARTMENT_SEED = {
  key: 'educacion_continua',
  name: 'Educación Continua',
  description: 'Gestión de programas de formación continua, postgrados y educación permanente para profesionales.',
  enabled: true,
  hasData: false,
  order: 1
};

const KPI_SEED = [
  { key: 'oferta_programada', name: 'Oferta programada', description: 'Cantidad de programas programados en el período.', unit: 'cursos', format: 'number', formulaKey: 'COUNT_PROGRAMMED_OFFER', enabled: true },
  { key: 'cursos_dictados', name: 'Cursos efectivamente dictados', description: 'Cantidad de cursos efectivamente dictados en el período.', unit: 'cursos', format: 'number', formulaKey: 'COUNT_COURSES_DICTATED', enabled: true },
  { key: 'tasa_ejecucion', name: 'Tasa de ejecución', description: 'Cursos dictados sobre la oferta programada.', unit: '%', format: 'percentage', formulaKey: 'EXECUTION_RATE', enabled: true },
  { key: 'matricula_por_programa', name: 'Matrícula en programas', description: 'Total de matrículas asociadas a programas.', unit: 'personas', format: 'number', formulaKey: 'ENROLLMENT_TOTAL', enabled: true },
  { key: 'tasa_aprobacion', name: 'Tasa de aprobación', description: 'Aprobados sobre la matrícula total.', unit: '%', format: 'percentage', formulaKey: 'APPROVAL_RATE', enabled: true },
  { key: 'ingresos_generados', name: 'Ingresos generados', description: 'Suma de ingresos netos asociados a programas.', unit: 'CLP', format: 'currency', formulaKey: 'REVENUE_SUM', enabled: true },
  { key: 'ticket_promedio', name: 'Ticket promedio', description: 'Ingresos netos sobre la matrícula total.', unit: 'CLP', format: 'currency', formulaKey: 'AVERAGE_TICKET', enabled: true },
  { key: 'participantes_unicos', name: 'Participantes únicos', description: 'Cantidad de participantes distintos.', unit: 'personas', format: 'number', formulaKey: 'UNIQUE_PARTICIPANTS', enabled: true },
  { key: 'perfil_participante', name: 'Perfil de participante', description: 'Distribución de participantes por dimensión.', unit: 'personas', format: 'number', formulaKey: 'PARTICIPANT_PROFILE', enabled: true },
  { key: 'recurrencia_formativa', name: 'Recurrencia formativa', description: 'Participantes con más de un curso.', unit: 'personas', format: 'number', formulaKey: 'TRAINING_RECURRENCE', enabled: true }
];

async function seedIndicators() {
  await Department.findOrCreate({ where: { key: DEPARTMENT_SEED.key }, defaults: DEPARTMENT_SEED });
  for (const kpi of KPI_SEED) {
    await IndicatorDefinition.findOrCreate({
      where: { departmentId: DEPARTMENT_SEED.key, key: kpi.key },
      defaults: { ...kpi, departmentId: DEPARTMENT_SEED.key }
    });
  }
}

module.exports = { seedIndicators };
