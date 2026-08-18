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

const VCM_DEPARTMENT_SEED = {
  key: 'vinculacion_medio',
  name: 'Vinculación con el Medio',
  description: 'Gestión de convenios, actividades, participaciones y articulaciones técnico-profesionales.',
  enabled: true,
  hasData: false,
  order: 2
};

const VCM_KPI_SEED = [
  { key: 'total_convenios', name: 'Total de convenios', description: 'Cantidad total de convenios registrados.', unit: 'convenios', format: 'number', formulaKey: 'COUNT_CONVENIOS', enabled: true },
  { key: 'convenios_por_sector', name: 'Convenios por sector', description: 'Distribución de convenios según sector (público, privado, social).', unit: 'convenios', format: 'number', formulaKey: 'CONVENIOS_BY_SECTOR', enabled: true },
  { key: 'convenios_activos', name: 'Convenios vigentes', description: 'Cantidad de convenios con estado activo/vigente.', unit: 'convenios', format: 'number', formulaKey: 'COUNT_ACTIVE_CONVENIOS', enabled: true },
  { key: 'actividades_realizadas', name: 'Actividades realizadas', description: 'Cantidad de actividades de vinculación ejecutadas.', unit: 'actividades', format: 'number', formulaKey: 'COUNT_ACTIVITIES', enabled: true },
  { key: 'participaciones', name: 'Total de participaciones', description: 'Suma total de personas participantes en las actividades de VCM.', unit: 'personas', format: 'number', formulaKey: 'PARTICIPACIONES_SUM', enabled: true },
  { key: 'articulaciones_tp', name: 'Articulaciones técnico-profesionales', description: 'Cantidad de articulaciones con colegios y liceos TP.', unit: 'articulaciones', format: 'number', formulaKey: 'COUNT_ARTICULACIONES', enabled: true },
  { key: 'proyectos_vcm', name: 'Proyectos ejecutados', description: 'Cantidad total de proyectos de VCM.', unit: 'proyectos', format: 'number', formulaKey: 'COUNT_PROJECTS', enabled: true },
  { key: 'financiamiento_vcm', name: 'Financiamiento total', description: 'Suma de financiamiento neto para proyectos de VCM.', unit: 'CLP', format: 'currency', formulaKey: 'FINANCING_SUM', enabled: true }
];

async function seedIndicators() {
  // 1. Seed Educación Continua
  await Department.findOrCreate({ where: { key: DEPARTMENT_SEED.key }, defaults: DEPARTMENT_SEED });
  for (const kpi of KPI_SEED) {
    await IndicatorDefinition.findOrCreate({
      where: { departmentId: DEPARTMENT_SEED.key, key: kpi.key },
      defaults: { ...kpi, departmentId: DEPARTMENT_SEED.key }
    });
  }

  // 2. Seed Vinculación con el Medio (VCM)
  await Department.findOrCreate({ where: { key: VCM_DEPARTMENT_SEED.key }, defaults: VCM_DEPARTMENT_SEED });
  for (const kpi of VCM_KPI_SEED) {
    await IndicatorDefinition.findOrCreate({
      where: { departmentId: VCM_DEPARTMENT_SEED.key, key: kpi.key },
      defaults: { ...kpi, departmentId: VCM_DEPARTMENT_SEED.key }
    });
  }
}

module.exports = { seedIndicators };
