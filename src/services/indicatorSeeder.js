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
  { key: 'proyectos_vcm', name: 'Proyectos vigentes', description: 'Cantidad de proyectos de VCM con estado En Curso.', unit: 'proyectos', format: 'number', formulaKey: 'COUNT_PROJECTS', enabled: true },
  { key: 'financiamiento_vcm', name: 'Financiamiento total', description: 'Suma de financiamiento neto para proyectos de VCM.', unit: 'CLP', format: 'currency', formulaKey: 'FINANCING_SUM', enabled: true }
];

const INSTITUCIONAL_DEPARTMENT_SEED = {
  key: 'institucional',
  name: 'Institucional',
  description: 'Metas e indicadores a nivel de toda la institución (Rectoría).',
  enabled: true,
  hasData: false,
  order: 3
};

const INNOVACION_DEPARTMENT_SEED = {
  key: 'innovacion',
  name: 'Innovación',
  description: 'Dirección de innovación, desarrollo y transferencia de conocimiento.',
  enabled: true,
  hasData: true,
  order: 4
};

const INNOVACION_KPI_SEED = [
  { key: 'proyectos_innovacion', name: 'Proyectos de innovación', description: 'Cantidad de proyectos de innovación adjudicados o desarrollados.', unit: 'proyectos', format: 'number', formulaKey: 'COUNT_INNOVATION_PROJECTS', enabled: false },
  { key: 'patentes_solicitadas', name: 'Patentes solicitadas', description: 'Cantidad de patentes, registros de propiedad intelectual o marcas solicitadas.', unit: 'registros', format: 'number', formulaKey: 'COUNT_PATENTS', enabled: false },
  { key: 'proyectos_activos', name: 'Proyectos activos', description: 'Cantidad de proyectos de innovación activos durante el año consultado.', unit: 'proyectos', format: 'number', formulaKey: 'COUNT_ACTIVE_INNOVATION_PROJECTS', enabled: true },
  { key: 'total_proyectos', name: 'Total de proyectos', description: 'Cantidad de proyectos de innovación iniciados en el período.', unit: 'proyectos', format: 'number', formulaKey: 'COUNT_ALL_INNOVATION_PROJECTS', enabled: true },
  { key: 'financiamiento_obtenido', name: 'Financiamiento obtenido', description: 'Monto externo adjudicado a proyectos de innovación.', unit: 'CLP', format: 'currency', formulaKey: 'SUM_INNOVATION_FINANCING', enabled: true },
  { key: 'proyectos_con_financiamiento_externo', name: 'Proyectos con financiamiento externo', description: 'Cantidad de proyectos de Innovación que cuentan con financiamiento externo.', unit: 'proyectos', format: 'number', formulaKey: 'COUNT_EXTERNAL_FINANCED_PROJECTS', enabled: true },
  { key: 'proyectos_finalizados', name: 'Innovaciones implementadas', description: 'Cantidad de proyectos de innovación finalizados en el año consultado.', unit: 'proyectos', format: 'number', formulaKey: 'COUNT_FINALIZED_INNOVATION_PROJECTS', enabled: true },
  { key: 'secciones_curso', name: 'Secciones del curso de innovación', description: 'Cantidad de secciones del curso Emprendimiento e Innovación, agrupables por año y semestre.', unit: 'secciones', format: 'number', formulaKey: 'COUNT_INNOVATION_SECTIONS', enabled: true },
  { key: 'docentes_involucrados', name: 'Docentes involucrados', description: 'Cantidad de docentes involucrados en proyectos de innovación iniciados en el período.', unit: 'docentes', format: 'number', formulaKey: 'SUM_INNOVATION_TEACHERS', enabled: true }
];

const CURRICULAR_DEPARTMENT_SEED = {
  key: 'desarrollo_curricular',
  name: 'Desarrollo Curricular',
  description: 'Dirección de desarrollo curricular y rediseño de planes de estudio.',
  enabled: true,
  hasData: false,
  order: 5
};

const CURRICULAR_KPI_SEED = [
  { key: 'programas_actualizados', name: 'Programas de estudio actualizados', description: 'Porcentaje o cantidad de programas de estudio actualizados o rediseñados.', unit: 'programas', format: 'number', formulaKey: 'COUNT_CURRICULUM_UPDATED', enabled: true },
  { key: 'innovaciones_pedagogicas', name: 'Innovaciones pedagógicas', description: 'Cantidad de innovaciones pedagógicas o metodologías activas implementadas en el aula.', unit: 'innovaciones', format: 'number', formulaKey: 'COUNT_PEDAGOGICAL_INNOVATIONS', enabled: true }
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
  const proyectosVigentes = VCM_KPI_SEED.find((kpi) => kpi.key === 'proyectos_vcm');
  await IndicatorDefinition.update(
    { name: proyectosVigentes.name, description: proyectosVigentes.description },
    { where: { departmentId: VCM_DEPARTMENT_SEED.key, key: proyectosVigentes.key } }
  );

  // 3. Seed Institucional
  await Department.findOrCreate({ where: { key: INSTITUCIONAL_DEPARTMENT_SEED.key }, defaults: INSTITUCIONAL_DEPARTMENT_SEED });

  // 4. Seed Innovación
  await Department.findOrCreate({ where: { key: INNOVACION_DEPARTMENT_SEED.key }, defaults: INNOVACION_DEPARTMENT_SEED });
  await Department.update(
    { hasData: true },
    { where: { key: INNOVACION_DEPARTMENT_SEED.key } }
  );
  for (const kpi of INNOVACION_KPI_SEED) {
    await IndicatorDefinition.findOrCreate({
      where: { departmentId: INNOVACION_DEPARTMENT_SEED.key, key: kpi.key },
      defaults: { ...kpi, departmentId: INNOVACION_DEPARTMENT_SEED.key }
    });
  }
  await IndicatorDefinition.update(
    { enabled: false },
    {
      where: {
        departmentId: INNOVACION_DEPARTMENT_SEED.key,
        key: ['proyectos_innovacion', 'patentes_solicitadas']
      }
    }
  );

  // 5. Seed Desarrollo Curricular
  await Department.findOrCreate({ where: { key: CURRICULAR_DEPARTMENT_SEED.key }, defaults: CURRICULAR_DEPARTMENT_SEED });
  for (const kpi of CURRICULAR_KPI_SEED) {
    await IndicatorDefinition.findOrCreate({
      where: { departmentId: CURRICULAR_DEPARTMENT_SEED.key, key: kpi.key },
      defaults: { ...kpi, departmentId: CURRICULAR_DEPARTMENT_SEED.key }
    });
  }
}

module.exports = { seedIndicators };
