const XLSX = require('xlsx');

const INNOVACION_TEMPLATE_NAME = 'Innovación';
const INNOVACION_TEMPLATE_FILENAME = 'plantilla-innovacion.xlsx';
const PROYECTOS_SHEET = 'Proyectos Innovación';
const FINANCIAMIENTO_SHEET = 'Financiamiento';
const SECCIONES_SHEET = 'Secciones Cursos';

const projectFields = [
  ['ID Proyecto', 'idProyecto', 'string'],
  ['Tipo proyecto', 'tipoProyecto', 'string'],
  ['Año inicio', 'anioInicio', 'number'],
  ['Año término', 'anioTermino', 'number'],
  ['Semestre inicio', 'semestreInicio', 'string'],
  ['Nombre del proyecto', 'nombreProyecto', 'string'],
  ['Área temática', 'areaTematica', 'string'],
  ['Curso/Línea', 'cursoLinea', 'string'],
  ['Estado', 'estado', 'string'],
  ['Responsable/Docente', 'responsableDocente', 'string'],
  ['Unidad responsable', 'unidadResponsable', 'string'],
  ['Socio/contraparte', 'socioContraparte', 'string'],
  ['Resultado principal', 'resultadoPrincipal', 'string'],
  ['Evidencia principal', 'evidenciaPrincipal', 'string'],
  ['N° estudiantes', 'nEstudiantes', 'number'],
  ['N° docentes', 'nDocentes', 'number'],
  ['N° funcionarios', 'nFuncionarios', 'number'],
  ['Fecha inicio', 'fechaInicio', 'string'],
  ['Fecha cierre estimada', 'fechaCierreEstimada', 'string'],
  ['Observación', 'observacion', 'string']
];

const financingFields = [
  ['ID Proyecto', 'idProyecto', 'string'],
  ['Nombre proyecto', 'nombreProyecto', 'string'],
  ['Fuente', 'fuenteFinanciamiento', 'string'],
  ['Tipo financiamiento', 'financiamientoExterno', 'string'],
  ['Monto adjudicado CLP', 'montoAdjudicado', 'number'],
  ['Monto ejecutado estimado CLP', 'montoEjecutadoEstimado', 'number'],
  ['Estado financiero', 'estadoFinanciero', 'string'],
  ['Observación', 'observacion', 'string']
];

const sectionFields = [
  ['ID Sección', 'idSeccion', 'string'],
  ['Año', 'anio', 'number'],
  ['Semestre', 'semestre', 'string'],
  ['Curso', 'curso', 'string'],
  ['Carrera/Programa', 'carreraPrograma', 'string'],
  ['Jornada', 'jornada', 'string'],
  ['N° Estudiantes', 'nEstudiantes', 'number'],
  ['N° Grupos/Proyectos', 'nProyectos', 'number'],
  ['Docente', 'docente', 'string'],
  ['Modalidad', 'modalidad', 'string'],
  ['Observación', 'observacion', 'string']
];

const createInnovationTemplateBuffer = () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([projectFields.map(([column]) => column)]),
    PROYECTOS_SHEET
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([financingFields.map(([column]) => column)]),
    FINANCIAMIENTO_SHEET
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([sectionFields.map(([column]) => column)]),
    SECCIONES_SHEET
  );
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

const createInnovationPlantilla = (roleId) => ({
  name: INNOVACION_TEMPLATE_NAME,
  description: 'Plantilla para carga de proyectos, financiamiento y secciones de cursos de innovación',
  roleId,
  archivoData: createInnovationTemplateBuffer(),
  archivoNombre: INNOVACION_TEMPLATE_FILENAME
});

const toCampo = (plantillaId, sheet, table, order, [column, destination, type]) => ({
  plantillaId,
  nombre_campo: column,
  columna_excel: column,
  hoja_origen: sheet,
  tabla_destino: table,
  columna_destino: destination,
  tipo_dato: type,
  requerido: true,
  orden_insercion: order
});

const createInnovationFields = (plantillaId) => {
  const fields = [
    ...projectFields.map((field) => toCampo(plantillaId, PROYECTOS_SHEET, 'Proyecto', 1, field)),
    ...financingFields.map((field) => toCampo(plantillaId, FINANCIAMIENTO_SHEET, 'Financiamiento', 2, field)),
    ...sectionFields.map((field) => toCampo(plantillaId, SECCIONES_SHEET, 'Seccion', 1, field))
  ];

  const projectLookup = fields.find((field) =>
    field.tabla_destino === 'Financiamiento' && field.columna_destino === 'idProyecto'
  );
  Object.assign(projectLookup, {
    campo_lookup_tabla: 'Proyecto',
    campo_lookup_columna_db: 'idProyecto',
    campo_lookup_retorno: 'idProyecto'
  });

  return fields;
};

module.exports = {
  INNOVACION_TEMPLATE_NAME,
  INNOVACION_TEMPLATE_FILENAME,
  PROYECTOS_SHEET,
  FINANCIAMIENTO_SHEET,
  SECCIONES_SHEET,
  projectFields,
  financingFields,
  sectionFields,
  createInnovationTemplateBuffer,
  createInnovationPlantilla,
  createInnovationFields
};
