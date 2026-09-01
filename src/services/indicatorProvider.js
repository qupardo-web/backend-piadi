const { Op } = require('sequelize');
const {
  sequelize,
  Department,
  IndicatorDefinition,
  Programa,
  ResultadosPrograma,
  EstadoFinancieroPrograma,
  MatriculaPrograma,
  AlumnoExterno,
  Convenio,
  Actividad,
  Participacion,
  ArticulacionTP,
  Proyecto,
  Financiamiento
} = require('../models');

const SUPPORTED_DATA_DEPARTMENTS = ['educacion_continua', 'vinculacion_medio'];
const DICTATED_VALUES = ['si', 'sí', 'true', '1', 'x', 'ejecutado', 'dictado', 'realizado', 'finalizado'];
const TRUTHY_VALUES = ['si', 'sí', 'true', '1', 'x', 'verdadero'];

const buildCaseInsensitiveEquals = (value) => ({
  [Op.iLike]: value
});

const buildCaseInsensitiveIn = (values) => {
  if (!values || values.length === 0) return null;
  if (values.length === 1) return buildCaseInsensitiveEquals(values[0]);
  return {
    [Op.or]: values.map((v) => buildCaseInsensitiveEquals(v))
  };
};

const isDictado = (ejecutado) => {
  if (ejecutado === null || ejecutado === undefined) {
    return false;
  }
  return DICTATED_VALUES.includes(String(ejecutado).trim().toLowerCase());
};

const isTruthyFlag = (value) => {
  if (value === null || value === undefined) {
    return false;
  }
  return TRUTHY_VALUES.includes(String(value).trim().toLowerCase());
};

const isConnected = async () => {
  try {
    await sequelize.authenticate();
    return true;
  } catch {
    return false;
  }
};

const yearRange = (from, to) => {
  const list = [];
  for (let y = from; y <= to; y += 1) {
    list.push(y);
  }
  return list;
};

// --- Filtros Educación Continua ---
const buildProgramaWhere = (filters = {}) => {
  const where = {};
  if (filters.year !== null && filters.year !== undefined) {
    where.anio = filters.year;
  } else if (filters.fromYear !== null || filters.toYear !== null) {
    const from = filters.fromYear !== null ? filters.fromYear : filters.toYear;
    const to = filters.toYear !== null ? filters.toYear : filters.fromYear;
    where.anio = { [Op.between]: [from, to] };
  }
  if (filters.semesters && filters.semesters.length) where.semestre = buildCaseInsensitiveIn(filters.semesters);
  if (filters.months && filters.months.length) where.mesInicio = { [Op.in]: filters.months.map(String) };
  if (filters.area && filters.area.length) where.area = buildCaseInsensitiveIn(filters.area);
  if (filters.tipo && filters.tipo.length) where.tipo = buildCaseInsensitiveIn(filters.tipo);
  if (filters.modalidad && filters.modalidad.length) where.modalidad = buildCaseInsensitiveIn(filters.modalidad);
  return where;
};

const buildProgramaSubWhere = (filters = {}) => {
  const where = {};
  if (filters.area && filters.area.length) where.area = buildCaseInsensitiveIn(filters.area);
  if (filters.tipo && filters.tipo.length) where.tipo = buildCaseInsensitiveIn(filters.tipo);
  if (filters.modalidad && filters.modalidad.length) where.modalidad = buildCaseInsensitiveIn(filters.modalidad);
  return where;
};

const buildMatriculaWhere = (filters = {}) => {
  const where = {};
  if (filters.year !== null && filters.year !== undefined) {
    where.anio = String(filters.year);
  } else if (filters.fromYear !== null || filters.toYear !== null) {
    const from = filters.fromYear !== null ? filters.fromYear : filters.toYear;
    const to = filters.toYear !== null ? filters.toYear : filters.fromYear;
    where.anio = { [Op.in]: yearRange(from, to).map(String) };
  }
  if (filters.semesters && filters.semesters.length) where.semestre = buildCaseInsensitiveIn(filters.semesters);
  if (filters.months && filters.months.length) where.mesInicio = { [Op.in]: filters.months.map(Number) };
  if (filters.rangoEdad && filters.rangoEdad.length) where.rangoEdadAlumno = buildCaseInsensitiveIn(filters.rangoEdad);
  if (filters.minAge !== null && filters.minAge !== undefined) {
    where.edadAlumno = { ...(where.edadAlumno || {}), [Op.gte]: filters.minAge };
  }
  if (filters.maxAge !== null && filters.maxAge !== undefined) {
    where.edadAlumno = { ...(where.edadAlumno || {}), [Op.lte]: filters.maxAge };
  }
  return where;
};

const buildAlumnoWhere = (filters = {}) => {
  const where = {};
  if (filters.sexo && filters.sexo.length) where.sexo = buildCaseInsensitiveIn(filters.sexo);
  return where;
};

// --- Filtros Genéricos VCM ---
const buildVcmCommonWhere = (filters = {}, yearField = 'anio') => {
  const where = {};
  if (filters.year !== null && filters.year !== undefined) {
    where[yearField] = filters.year;
  } else if (filters.fromYear !== null || filters.toYear !== null) {
    const from = filters.fromYear !== null ? filters.fromYear : filters.toYear;
    const to = filters.toYear !== null ? filters.toYear : filters.fromYear;
    where[yearField] = { [Op.between]: [from, to] };
  }
  return where;
};

// --- Providers Educación Continua ---
const getProgramRows = async (filters = {}) => {
  if (String(filters.department || '').toLowerCase() !== 'educacion_continua') {
    return [];
  }
  const programas = await Programa.findAll({
    where: buildProgramaWhere(filters),
    attributes: ['idPrograma', 'anio', 'area', 'tipo', 'modalidad', 'programa'],
    include: [
      { model: ResultadosPrograma, attributes: ['ejecutado', 'matricula', 'aprobados'], required: false },
      { model: EstadoFinancieroPrograma, attributes: ['ingresosNetosCLP'], required: false }
    ]
  });

  return programas.map((p) => {
    const r = p.ResultadosPrograma || null;
    const f = p.EstadoFinancieroPrograma || null;
    return {
      idPrograma: p.idPrograma,
      anio: Number(p.anio),
      area: p.area,
      tipo: p.tipo,
      modalidad: p.modalidad,
      programa: p.programa,
      dictado: r ? isDictado(r.ejecutado) : false,
      matricula: r && r.matricula != null ? Number(r.matricula) : 0,
      aprobados: r && r.aprobados != null ? Number(r.aprobados) : 0,
      ingresosNetos: f && f.ingresosNetosCLP != null ? Number(f.ingresosNetosCLP) : 0
    };
  });
};

const getParticipantRows = async (filters = {}) => {
  if (String(filters.department || '').toLowerCase() !== 'educacion_continua') {
    return [];
  }
  const programaSub = buildProgramaSubWhere(filters);
  const alumnoWhere = buildAlumnoWhere(filters);
  const programaHasFilter = Object.keys(programaSub).length > 0;
  const alumnoHasFilter = Object.keys(alumnoWhere).length > 0;

  const matriculas = await MatriculaPrograma.findAll({
    where: buildMatriculaWhere(filters),
    attributes: ['idInscripcion', 'idParticipante', 'anio', 'semestre', 'rangoEdadAlumno', 'nCursos', 'tieneMasCursos'],
    include: [
      {
        model: Programa,
        as: 'programa',
        attributes: ['area', 'tipo', 'modalidad', 'programa'],
        required: programaHasFilter,
        where: programaHasFilter ? programaSub : undefined
      },
      {
        model: AlumnoExterno,
        as: 'participante',
        attributes: ['sexo', 'region', 'nivelDeEstudio', 'tipoParticipante', 'sectorEconomico'],
        required: alumnoHasFilter,
        where: alumnoHasFilter ? alumnoWhere : undefined
      }
    ]
  });

  return matriculas.map((m) => {
    const prog = m.programa || {};
    const al = m.participante || {};
    return {
      idParticipante: m.idParticipante,
      anio: Number(m.anio),
      rangoEdad: m.rangoEdadAlumno,
      recurrente: (m.nCursos != null && Number(m.nCursos) > 1) || isTruthyFlag(m.tieneMasCursos),
      area: prog.area,
      tipo: prog.tipo,
      modalidad: prog.modalidad,
      programa: prog.programa,
      sexo: al.sexo,
      region: al.region,
      nivelDeEstudio: al.nivelDeEstudio,
      tipoParticipante: al.tipoParticipante,
      sectorEconomico: al.sectorEconomico
    };
  });
};

// --- Providers Vinculación con el Medio (VCM) ---
const getVcmConvenioRows = async (filters = {}) => {
  if (String(filters.department || '').toLowerCase() !== 'vinculacion_medio') {
    return [];
  }
  const where = buildVcmCommonWhere(filters, 'anioFirma');
  if (filters.region && filters.region.length) where.region = buildCaseInsensitiveIn(filters.region);
  if (filters.comuna && filters.comuna.length) where.comuna = buildCaseInsensitiveIn(filters.comuna);
  if (filters.sector && filters.sector.length) where.sector = buildCaseInsensitiveIn(filters.sector);
  const tiposConvenio = filters.tipoConvenio && filters.tipoConvenio.length ? filters.tipoConvenio : filters.tipo;
  if (tiposConvenio && tiposConvenio.length) where.tipoConvenio = buildCaseInsensitiveIn(tiposConvenio);
  if (filters.areaVinculada && filters.areaVinculada.length) {
    where.areaVinculada = buildCaseInsensitiveIn(filters.areaVinculada);
  }

  const convenios = await Convenio.findAll({ where });
  return convenios.map(c => ({
    idConvenio: c.idConvenio,
    anio: c.anioFirma,
    sector: c.sector,
    region: c.region,
    comuna: c.comuna,
    estado: c.estado,
    activo: c.estado && (c.estado.toLowerCase() === 'activo' || c.estado.toLowerCase() === 'vigente'),
    tipoConvenio: c.tipoConvenio,
    areaVinculada: c.areaVinculada,
    contraparte: c.contraparte,
    responsableEcas: c.responsableEcas
  }));
};

const getVcmActividadRows = async (filters = {}) => {
  if (String(filters.department || '').toLowerCase() !== 'vinculacion_medio') {
    return [];
  }
  const where = buildVcmCommonWhere(filters, 'anio');
  if (filters.modalidad && filters.modalidad.length) where.modalidad = buildCaseInsensitiveIn(filters.modalidad);
  if (filters.region && filters.region.length) where.region = buildCaseInsensitiveIn(filters.region);
  if (filters.comuna && filters.comuna.length) where.comuna = buildCaseInsensitiveIn(filters.comuna);
  if (filters.sector && filters.sector.length) where.sector = buildCaseInsensitiveIn(filters.sector);
  const tiposActividad = filters.tipoActividad && filters.tipoActividad.length ? filters.tipoActividad : filters.tipo;
  if (tiposActividad && tiposActividad.length) where.tipoActividad = buildCaseInsensitiveIn(tiposActividad);

  const actividades = await Actividad.findAll({ where });
  return actividades.map(a => ({
    idActividad: a.idActividad,
    anio: a.anio,
    modalidad: a.modalidad,
    region: a.region,
    comuna: a.comuna,
    sector: a.sector,
    lineaVcM: a.lineaVcM,
    tipoActividad: a.tipoActividad
  }));
};

const getVcmParticipacionRows = async (filters = {}) => {
  if (String(filters.department || '').toLowerCase() !== 'vinculacion_medio') {
    return [];
  }
  const where = buildVcmCommonWhere(filters, 'anio');
  if (filters.region && filters.region.length) where.region = buildCaseInsensitiveIn(filters.region);
  if (filters.comuna && filters.comuna.length) where.comuna = buildCaseInsensitiveIn(filters.comuna);

  const participaciones = await Participacion.findAll({ where });
  return participaciones.map(p => ({
    idParticipacion: p.idParticipacion,
    anio: p.anio,
    region: p.region,
    comuna: p.comuna,
    totalPersonas: p.totalPersonas,
    internosExternos: p.internosExternos,
    tipoParticipante: p.tipoParticipante,
    institucion: p.institucion,
    mujeres: p.mujeres,
    hombres: p.hombres,
    noInforma: p.noInforma
  }));
};

const getVcmArticulacionRows = async (filters = {}) => {
  if (String(filters.department || '').toLowerCase() !== 'vinculacion_medio') {
    return [];
  }
  const where = buildVcmCommonWhere(filters, 'anio');
  if (filters.region && filters.region.length) where.region = buildCaseInsensitiveIn(filters.region);
  if (filters.comuna && filters.comuna.length) where.comuna = buildCaseInsensitiveIn(filters.comuna);

  const articulaciones = await ArticulacionTP.findAll({ where });
  return articulaciones.map(a => ({
    idArticulacion: a.idArticulacion,
    anio: a.anio,
    region: a.region,
    comuna: a.comuna,
    especialidadTP: a.especialidadTP,
    nivel: a.nivel,
    tipoArticulacion: a.tipoArticulacion,
    estado: a.estado,
    plataformaFoco: a.plataformaFoco,
    colegioLiceoTP: a.colegioLiceoTP
  }));
};

const getVcmProyectoRows = async (filters = {}) => {
  if (String(filters.department || '').toLowerCase() !== 'vinculacion_medio') {
    return [];
  }
  const where = buildVcmCommonWhere(filters, 'anioInicio');

  const proyectos = await Proyecto.findAll({
    where,
    include: [{ model: Financiamiento }]
  });

  return proyectos.map(p => {
    const f = p.Financiamiento || null; // Access via model name association since no alias is defined
    return {
      idProyecto: p.idProyecto,
      anio: p.anioInicio,
      estado: p.estado,
      vigente: String(p.estado || '').trim().toLowerCase() === 'en curso',
      montoFinanciado: f ? Number(f.montoAdjudicado || 0) : 0
    };
  });
};

const distinctValues = (rows, key) => {
  const set = new Set();
  rows.forEach((r) => {
    if (r[key] !== null && r[key] !== undefined && r[key] !== '') {
      set.add(r[key]);
    }
  });
  return [...set];
};

const distinctTextValues = (rows, key) => {
  const values = new Map();
  rows.forEach((row) => {
    if (typeof row[key] !== 'string') return;
    const value = row[key].trim();
    if (value === '') return;
    const normalized = value.toLocaleLowerCase('es');
    if (!values.has(normalized)) values.set(normalized, value);
  });
  return [...values.values()].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
};

const toMonthValue = (v) => (/^\d+$/.test(String(v)) ? Number(v) : v);

const getFilterOptions = async (department, filters = {}) => {
  const empty = { years: [], semesters: [], startMonths: [], areas: [], tipos: [], modalidades: [], sexos: [], rangosEdad: [] };
  const deptKey = String(department || '').toLowerCase();
  
  if (!SUPPORTED_DATA_DEPARTMENTS.includes(deptKey)) {
    return empty;
  }

  if (deptKey === 'educacion_continua') {
    const programas = await Programa.findAll({
      where: buildProgramaWhere(filters),
      attributes: ['anio', 'semestre', 'mesInicio', 'area', 'tipo', 'modalidad'],
      raw: true
    });
    const participantRows = await getParticipantRows(filters);

    return {
      years: distinctValues(programas, 'anio').map(Number).sort((a, b) => a - b),
      semesters: distinctValues(programas, 'semestre').sort(),
      startMonths: distinctValues(programas, 'mesInicio').map(toMonthValue).sort((a, b) => (Number(a) || 0) - (Number(b) || 0)),
      areas: distinctValues(programas, 'area').sort(),
      tipos: distinctValues(programas, 'tipo').sort(),
      modalidades: distinctValues(programas, 'modalidad').sort(),
      sexos: distinctValues(participantRows, 'sexo').sort(),
      rangosEdad: distinctValues(participantRows, 'rangoEdad').sort()
    };
  } else if (deptKey === 'vinculacion_medio') {
    // VCM Options
    const convenios = await getVcmConvenioRows(filters);
    const actividades = await getVcmActividadRows(filters);
    const participaciones = await getVcmParticipacionRows(filters);
    const articulaciones = await getVcmArticulacionRows(filters);

    const years = new Set([
      ...convenios.map(c => Number(c.anio)),
      ...actividades.map(a => Number(a.anio)),
      ...participaciones.map(p => Number(p.anio)),
      ...articulaciones.map(ar => Number(ar.anio))
    ]);

    return {
      years: [...years].sort((a, b) => a - b),
      semesters: [],
      startMonths: [],
      areas: distinctTextValues(convenios, 'areaVinculada'),
      tipos: [],
      modalidades: distinctValues(actividades, 'modalidad').sort(),
      sexos: [],
      rangosEdad: [],
      // Extra filters for VCM
      regiones: [...new Set([
        ...convenios.map(c => c.region),
        ...actividades.map(a => a.region),
        ...participaciones.map(p => p.region),
        ...articulaciones.map(ar => ar.region)
      ].filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'es')),
      comunas: [...new Set([
        ...convenios.map(c => c.comuna),
        ...actividades.map(a => a.comuna),
        ...participaciones.map(p => p.comuna),
        ...articulaciones.map(ar => ar.comuna)
      ].filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'es')),
      sectores: distinctValues(convenios, 'sector').sort()
    };
  }

  return empty;
};

const getDepartments = async () => {
  const rows = await Department.findAll({ order: [['order', 'ASC'], ['name', 'ASC']] });
  return rows.map((row) => row.toJSON());
};

const getDepartmentByKey = async (key) => {
  const row = await Department.findOne({ where: { key } });
  return row ? row.toJSON() : null;
};

const createDepartment = async (payload) => {
  const row = await Department.create(payload);
  return row.toJSON();
};

const updateDepartment = async (key, payload) => {
  const row = await Department.findOne({ where: { key } });
  if (!row) {
    return null;
  }
  await row.update(payload);
  return row.toJSON();
};

const deleteDepartment = async (key) => {
  const row = await Department.findOne({ where: { key } });
  if (!row) {
    return false;
  }
  await IndicatorDefinition.destroy({ where: { departmentId: key } });
  await row.destroy();
  return true;
};

const getKpisByDepartment = async (departmentId) => {
  const where = departmentId === 'institucional' ? {} : { departmentId };
  const rows = await IndicatorDefinition.findAll({ where, order: [['id', 'ASC']] });
  return rows.map((row) => row.toJSON());
};

const getKpi = async (departmentId, indicatorKey) => {
  const where = departmentId === 'institucional' ? { key: indicatorKey } : { departmentId, key: indicatorKey };
  const row = await IndicatorDefinition.findOne({ where });
  return row ? row.toJSON() : null;
};

const createKpi = async (departmentId, payload) => {
  const row = await IndicatorDefinition.create({ ...payload, departmentId });
  return row.toJSON();
};

const updateKpi = async (departmentId, indicatorKey, payload) => {
  const row = await IndicatorDefinition.findOne({ where: { departmentId, key: indicatorKey } });
  if (!row) {
    return null;
  }
  await row.update(payload);
  return row.toJSON();
};

const deleteKpi = async (departmentId, indicatorKey) => {
  const row = await IndicatorDefinition.findOne({ where: { departmentId, key: indicatorKey } });
  if (!row) {
    return false;
  }
  await row.destroy();
  return true;
};

module.exports = {
  isConnected,
  getProgramRows,
  getParticipantRows,
  getVcmConvenioRows,
  getVcmActividadRows,
  getVcmParticipacionRows,
  getVcmArticulacionRows,
  getVcmProyectoRows,
  getFilterOptions,
  getDepartments,
  getDepartmentByKey,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getKpisByDepartment,
  getKpi,
  createKpi,
  updateKpi,
  deleteKpi
};
