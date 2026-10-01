const XLSX = require('xlsx');

const EDUCACION_CONTINUA_TEMPLATE_NAME = 'Educación Continua';
const EDUCACION_CONTINUA_TEMPLATE_FILENAME = 'plantilla-educacion-continua.xlsx';

const baseProgramasHeaders = [
  'ID Programa', 'Año', 'Semestre', 'Mes Inicio', 'Área', 'Programa', 'Tipo',
  'Modalidad', 'Horas', 'Cupos Programados', 'Sector Principal', 'Región Principal',
  'Empresa/Convenio', 'Matrícula', 'Aprobados', 'Reprobados', 'Tasa Aprobación',
  'Estado', 'Ejecutado', 'Valor Lista CLP', 'Descuento Promedio', 'Ingresos Brutos CLP', 'Ingresos Netos CLP'
];

const participantesDetalleHeaders = [
  'ID Inscripción', 'ID Programa', 'ID Participante', 'RUT', 'Nombre', 'Apellido Paterno',
  'Apellido Materno', 'Sexo', 'Región', 'Comuna', 'Nacionalidad', 'Nivel de estudio',
  'Carrera cursada / profesión', 'Ocupación', 'Trabaja actualmente', 'Lugar de trabajo',
  'Cargo', 'Sector económico', 'Tipo participante', 'Nombre Completo', 'Edad',
  'Rango Edad', 'N° cursos del participante', 'Tiene más cursos', 'Año', 'Semestre',
  'Mes inicio', 'Fecha matrícula', 'Valor lista CLP', 'Descuento aplicado', 'Monto pagado CLP',
  'Estado académico', 'Aprobó', 'Nota final', 'Asistencia %'
];

const createEducacionContinuaTemplateBuffer = () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([baseProgramasHeaders]),
    'Base Programas'
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([participantesDetalleHeaders]),
    'Participantes Detalle'
  );
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

const createEducacionContinuaPlantilla = (roleId) => ({
  name: EDUCACION_CONTINUA_TEMPLATE_NAME,
  description: 'Plantilla para carga de programas de educación continua y participantes',
  roleId,
  departmentId: 'educacion_continua',
  variante: null,
  archivoData: createEducacionContinuaTemplateBuffer(),
  archivoNombre: EDUCACION_CONTINUA_TEMPLATE_FILENAME
});

module.exports = {
  EDUCACION_CONTINUA_TEMPLATE_NAME,
  EDUCACION_CONTINUA_TEMPLATE_FILENAME,
  baseProgramasHeaders,
  participantesDetalleHeaders,
  createEducacionContinuaTemplateBuffer,
  createEducacionContinuaPlantilla
};
