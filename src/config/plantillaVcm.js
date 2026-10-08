const XLSX = require('xlsx');

const VCM_TEMPLATE_NAME = 'Vinculación Con El Medio';
const VCM_TEMPLATE_FILENAME = 'plantilla-vinculacion-con-el-medio.xlsx';

const conveniosHeaders = [
  'ID Convenio', 'Contraparte', 'RUT Contraparte', 'Sector', 'Tipo convenio',
  'Año firma', 'Fecha firma', 'Fecha término', 'Estado', 'Área vinculada',
  'Contacto', 'Región', 'Comuna', 'Responsable ECAS', 'Objetivo / alcance', 'Evidencia'
];

const actividadesHeaders = [
  'ID Actividad', 'Fecha', 'Año', 'Mes', 'Línea VcM', 'Tipo actividad',
  'Nombre actividad', 'Institución / contraparte', 'Sector', 'Responsable',
  'Región', 'Comuna', 'Modalidad', 'Público objetivo', 'Participantes externos',
  'Participantes internos', 'Total participantes', 'Horas', 'Convenio asociado', 'Reporta a VcM'
];

const participacionHeaders = [
  'ID Participación', 'ID Actividad', 'Año', 'Fecha', 'Tipo actividad',
  'Institución', 'Tipo participante', 'Interno / Externo', 'Mujeres',
  'Hombres', 'No informa', 'Total personas', 'Comuna', 'Región'
];

const articulacionesHeaders = [
  'ID Articulación', 'Año', 'Fecha', 'Colegio / Liceo TP', 'Comuna',
  'Región', 'Especialidad TP', 'Plataforma / foco'
];

const createVcmTemplateBuffer = () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([conveniosHeaders]),
    'Convenios'
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([actividadesHeaders]),
    'Actividades VcM'
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([participacionHeaders]),
    'Participacion detalle'
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([articulacionesHeaders]),
    'Articulaciones TP'
  );
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

const createVcmPlantilla = (roleId) => ({
  name: VCM_TEMPLATE_NAME,
  description: 'Plantilla para carga de convenios, actividades, participaciones y articulaciones de VCM',
  roleId,
  departmentId: 'vinculacion_medio',
  variante: null,
  archivoData: createVcmTemplateBuffer(),
  archivoNombre: VCM_TEMPLATE_FILENAME
});

module.exports = {
  VCM_TEMPLATE_NAME,
  VCM_TEMPLATE_FILENAME,
  conveniosHeaders,
  actividadesHeaders,
  participacionHeaders,
  articulacionesHeaders,
  createVcmTemplateBuffer,
  createVcmPlantilla
};
