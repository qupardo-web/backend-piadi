const PROGRAM_GROUP_BY = ['year', 'area', 'tipo', 'modalidad'];
const PROGRAM_GROUP_BY_EXT = ['year', 'area', 'tipo', 'modalidad', 'programa'];

const INDICATORS = {
  oferta_programada: { kind: 'program', formulaKey: 'COUNT_PROGRAMMED_OFFER', allowedGroupBy: PROGRAM_GROUP_BY },
  cursos_dictados: { kind: 'program', formulaKey: 'COUNT_COURSES_DICTATED', allowedGroupBy: PROGRAM_GROUP_BY },
  tasa_ejecucion: { kind: 'program', formulaKey: 'EXECUTION_RATE', allowedGroupBy: PROGRAM_GROUP_BY },
  matricula_por_programa: { kind: 'program', formulaKey: 'ENROLLMENT_TOTAL', allowedGroupBy: PROGRAM_GROUP_BY_EXT },
  tasa_aprobacion: { kind: 'program', formulaKey: 'APPROVAL_RATE', allowedGroupBy: PROGRAM_GROUP_BY_EXT },
  ingresos_generados: { kind: 'program', formulaKey: 'REVENUE_SUM', allowedGroupBy: PROGRAM_GROUP_BY_EXT },
  ticket_promedio: { kind: 'program', formulaKey: 'AVERAGE_TICKET', allowedGroupBy: PROGRAM_GROUP_BY_EXT },
  participantes_unicos: { kind: 'participant', formulaKey: 'UNIQUE_PARTICIPANTS', allowedGroupBy: ['year', 'sexo', 'rangoEdad', 'area', 'tipo', 'modalidad'] },
  perfil_participante: { kind: 'participant', formulaKey: 'PARTICIPANT_PROFILE', allowedGroupBy: ['sexo', 'rangoEdad', 'region', 'nivelDeEstudio', 'tipoParticipante', 'sectorEconomico'] },
  recurrencia_formativa: { kind: 'participant', formulaKey: 'TRAINING_RECURRENCE', allowedGroupBy: ['year', 'sexo', 'rangoEdad', 'area', 'tipo', 'modalidad'] }
};

const PARTICIPANT_FORMULAS = ['UNIQUE_PARTICIPANTS', 'PARTICIPANT_PROFILE', 'TRAINING_RECURRENCE'];

const getIndicatorConfig = (indicatorKey, definition = null) => {
  if (INDICATORS[indicatorKey]) {
    return INDICATORS[indicatorKey];
  }
  if (definition && definition.formulaKey) {
    return {
      kind: PARTICIPANT_FORMULAS.includes(definition.formulaKey) ? 'participant' : 'program',
      formulaKey: definition.formulaKey,
      allowedGroupBy: []
    };
  }
  return null;
};

module.exports = { INDICATORS, getIndicatorConfig };
