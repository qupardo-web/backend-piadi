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
  { key: 'cursos_dictados', name: 'Cursos efectivamente dictados', description: 'Cantidad de cursos efectivamente dictados en el período.', unit: 'cursos', format: 'number', formulaKey: 'COUNT_COURSES_DICTATED', enabled: true },
  { key: 'tasa_ejecucion', name: 'Tasa de ejecución', description: 'Cursos dictados sobre la oferta programada.', unit: '%', format: 'percentage', formulaKey: 'EXECUTION_RATE', enabled: true },
  { key: 'matricula_por_programa', name: 'Matrícula en programas', description: 'Total de matrículas o participantes asociados a programas cargados.', unit: 'personas', format: 'number', formulaKey: 'ENROLLMENT_TOTAL', enabled: true },
  { key: 'ingresos_generados', name: 'Ingresos generados', description: 'Suma de ingresos asociados a cursos o programas cargados.', unit: 'CLP', format: 'currency', formulaKey: 'REVENUE_SUM', enabled: true }
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
