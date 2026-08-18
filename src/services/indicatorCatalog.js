const PROGRAM_GROUP_BY = ['year', 'area', 'tipo', 'modalidad'];
const PROGRAM_GROUP_BY_EXT = ['year', 'area', 'tipo', 'modalidad', 'programa'];

const VCM_CONVENIO_GROUP_BY = ['year', 'sector', 'region', 'comuna', 'estado'];
const VCM_ACTIVIDAD_GROUP_BY = ['year', 'modalidad', 'region', 'comuna', 'sector', 'lineaVcM'];
const VCM_PARTICIPACION_GROUP_BY = ['year', 'region', 'comuna', 'internosExternos', 'tipoParticipante'];
const VCM_ARTICULACION_GROUP_BY = ['year', 'region', 'comuna', 'especialidadTP', 'nivel', 'tipoArticulacion', 'estado'];
const VCM_PROYECTO_GROUP_BY = ['year'];

const INDICATORS = {
  // Educación Continua
  oferta_programada: { kind: 'program', formulaKey: 'COUNT_PROGRAMMED_OFFER', allowedGroupBy: PROGRAM_GROUP_BY },
  cursos_dictados: { kind: 'program', formulaKey: 'COUNT_COURSES_DICTATED', allowedGroupBy: PROGRAM_GROUP_BY },
  tasa_ejecucion: { kind: 'program', formulaKey: 'EXECUTION_RATE', allowedGroupBy: PROGRAM_GROUP_BY },
  matricula_por_programa: { kind: 'program', formulaKey: 'ENROLLMENT_TOTAL', allowedGroupBy: PROGRAM_GROUP_BY_EXT },
  tasa_aprobacion: { kind: 'program', formulaKey: 'APPROVAL_RATE', allowedGroupBy: PROGRAM_GROUP_BY_EXT },
  ingresos_generados: { kind: 'program', formulaKey: 'REVENUE_SUM', allowedGroupBy: PROGRAM_GROUP_BY_EXT },
  ticket_promedio: { kind: 'program', formulaKey: 'AVERAGE_TICKET', allowedGroupBy: PROGRAM_GROUP_BY_EXT },
  participantes_unicos: { kind: 'participant', formulaKey: 'UNIQUE_PARTICIPANTS', allowedGroupBy: ['year', 'sexo', 'rangoEdad', 'area', 'tipo', 'modalidad'] },
  perfil_participante: { kind: 'participant', formulaKey: 'PARTICIPANT_PROFILE', allowedGroupBy: ['sexo', 'rangoEdad', 'region', 'nivelDeEstudio', 'tipoParticipante', 'sectorEconomico'] },
  recurrencia_formativa: { kind: 'participant', formulaKey: 'TRAINING_RECURRENCE', allowedGroupBy: ['year', 'sexo', 'rangoEdad', 'area', 'tipo', 'modalidad'] },

  // Vinculación con el Medio (VCM)
  total_convenios: { kind: 'vcm_convenio', formulaKey: 'COUNT_CONVENIOS', allowedGroupBy: VCM_CONVENIO_GROUP_BY },
  convenios_por_sector: { kind: 'vcm_convenio', formulaKey: 'CONVENIOS_BY_SECTOR', allowedGroupBy: VCM_CONVENIO_GROUP_BY },
  convenios_activos: { kind: 'vcm_convenio', formulaKey: 'COUNT_ACTIVE_CONVENIOS', allowedGroupBy: VCM_CONVENIO_GROUP_BY },
  actividades_realizadas: { kind: 'vcm_actividad', formulaKey: 'COUNT_ACTIVITIES', allowedGroupBy: VCM_ACTIVIDAD_GROUP_BY },
  participaciones: { kind: 'vcm_participacion', formulaKey: 'PARTICIPACIONES_SUM', allowedGroupBy: VCM_PARTICIPACION_GROUP_BY },
  articulaciones_tp: { kind: 'vcm_articulacion', formulaKey: 'COUNT_ARTICULACIONES', allowedGroupBy: VCM_ARTICULACION_GROUP_BY },
  proyectos_vcm: { kind: 'vcm_proyecto', formulaKey: 'COUNT_PROJECTS', allowedGroupBy: VCM_PROYECTO_GROUP_BY },
  financiamiento_vcm: { kind: 'vcm_proyecto', formulaKey: 'FINANCING_SUM', allowedGroupBy: VCM_PROYECTO_GROUP_BY }
};

const PARTICIPANT_FORMULAS = ['UNIQUE_PARTICIPANTS', 'PARTICIPANT_PROFILE', 'TRAINING_RECURRENCE'];
const VCM_FORMULAS_MAP = {
  COUNT_CONVENIOS: 'vcm_convenio',
  CONVENIOS_BY_SECTOR: 'vcm_convenio',
  COUNT_ACTIVE_CONVENIOS: 'vcm_convenio',
  COUNT_ACTIVITIES: 'vcm_actividad',
  PARTICIPACIONES_SUM: 'vcm_participacion',
  COUNT_ARTICULACIONES: 'vcm_articulacion',
  COUNT_PROJECTS: 'vcm_proyecto',
  FINANCING_SUM: 'vcm_proyecto'
};

const getIndicatorConfig = (indicatorKey, definition = null) => {
  if (INDICATORS[indicatorKey]) {
    return INDICATORS[indicatorKey];
  }
  if (definition && definition.formulaKey) {
    let kind = 'program';
    if (PARTICIPANT_FORMULAS.includes(definition.formulaKey)) {
      kind = 'participant';
    } else if (VCM_FORMULAS_MAP[definition.formulaKey]) {
      kind = VCM_FORMULAS_MAP[definition.formulaKey];
    }
    return {
      kind,
      formulaKey: definition.formulaKey,
      allowedGroupBy: []
    };
  }
  return null;
};

module.exports = { INDICATORS, getIndicatorConfig };
