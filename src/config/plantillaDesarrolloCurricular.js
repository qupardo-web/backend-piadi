const { buildStyledTemplateBuffer } = require('../utils/excelTemplateBuilder');

const DESARROLLO_CURRICULAR_TEMPLATE_NAME = 'Desarrollo Curricular';
const DESARROLLO_CURRICULAR_TEMPLATE_FILENAME = 'plantilla-desarrollo-curricular.xlsx';
const RENDIMIENTO_SHEET = 'Rendimiento';
const PRACTICAS_SHEET = 'Practicas';
const TITULACION_SHEET = 'Titulacion';

// Encabezados en el archivo Excel (en mayúsculas)
const rendimientoHeaders = [
  'CODCLI',
  'RAMOEQUIV',
  'ASIGNATURA',
  'AÑO',
  'PERIODO',
  'SECCION',
  'ESTADO_ASIGNATURA',
  'NOTA'
];

const practicasHeaders = [
  'CODCLI',
  'TIPO_PRACTICA',
  'AÑO',
  'PERIODO',
  'ESTADO',
  'FECHA'
];

const titulacionHeaders = [
  'CODCLI',
  'COHORTE',
  'AÑO TITULACION',
  'SEMESTRES_CURSADOS',
  'TIEMPO_NORMATIVO'
];

// Helper para instanciar campos de plantilla
const toCampo = (plantillaId, sheet, table, order, [column, destination, type, required = true, lookupConfig = null]) => {
  const campo = {
    plantillaId,
    nombre_campo: column,
    columna_excel: column,
    hoja_origen: sheet,
    tabla_destino: table,
    columna_destino: destination,
    tipo_dato: type,
    requerido: Boolean(required),
    orden_insercion: order
  };
  if (lookupConfig) {
    Object.assign(campo, lookupConfig);
  }
  return campo;
};

// Generador de buffer Excel con estilo azul y títulos en mayúsculas
const createDesarrolloCurricularTemplateBuffer = () => buildStyledTemplateBuffer([
  { name: RENDIMIENTO_SHEET, headers: rendimientoHeaders },
  { name: PRACTICAS_SHEET, headers: practicasHeaders },
  { name: TITULACION_SHEET, headers: titulacionHeaders }
]);

const createDesarrolloCurricularPlantilla = (roleId) => ({
  name: DESARROLLO_CURRICULAR_TEMPLATE_NAME,
  description: 'Plantilla para carga de rendimiento académico, prácticas y titulación de desarrollo curricular',
  roleId,
  departmentId: 'desarrollo_curricular',
  variante: null,
  archivoData: createDesarrolloCurricularTemplateBuffer(),
  archivoNombre: DESARROLLO_CURRICULAR_TEMPLATE_FILENAME
});

const createDesarrolloCurricularFields = (plantillaId) => {
  const fields = [];

  // 1. Hoja Rendimiento -> Asignatura (orden 1)
  fields.push(
    toCampo(plantillaId, RENDIMIENTO_SHEET, 'Asignatura', 1, [
      'RAMOEQUIV', 'ramoEquiv', 'string', true
    ]),
    toCampo(plantillaId, RENDIMIENTO_SHEET, 'Asignatura', 1, [
      'ASIGNATURA', 'nombre', 'string', false
    ])
  );

  // 2. Hoja Rendimiento -> RendimientoAsignatura (orden 2)
  fields.push(
    toCampo(plantillaId, RENDIMIENTO_SHEET, 'RendimientoAsignatura', 2, [
      'CODCLI', 'rut', 'string', true, {
        campo_lookup_tabla: 'Alumno',
        campo_lookup_columna_db: 'codCli',
        campo_lookup_retorno: 'rut'
      }
    ]),
    toCampo(plantillaId, RENDIMIENTO_SHEET, 'RendimientoAsignatura', 2, [
      'CODCLI', 'codCli', 'string', false
    ]),
    toCampo(plantillaId, RENDIMIENTO_SHEET, 'RendimientoAsignatura', 2, [
      'RAMOEQUIV', 'ramoEquiv', 'string', true, {
        campo_lookup_tabla: 'Asignatura',
        campo_lookup_columna_db: 'ramoEquiv',
        campo_lookup_retorno: 'ramoEquiv'
      }
    ]),
    toCampo(plantillaId, RENDIMIENTO_SHEET, 'RendimientoAsignatura', 2, [
      'AÑO', 'anio', 'number', true
    ]),
    toCampo(plantillaId, RENDIMIENTO_SHEET, 'RendimientoAsignatura', 2, [
      'PERIODO', 'periodo', 'number', true
    ]),
    toCampo(plantillaId, RENDIMIENTO_SHEET, 'RendimientoAsignatura', 2, [
      'SECCION', 'seccion', 'number', false
    ]),
    toCampo(plantillaId, RENDIMIENTO_SHEET, 'RendimientoAsignatura', 2, [
      'ESTADO_ASIGNATURA', 'estadoAsignatura', 'string', true
    ]),
    toCampo(plantillaId, RENDIMIENTO_SHEET, 'RendimientoAsignatura', 2, [
      'NOTA', 'notaFinal', 'number', false
    ])
  );

  // 3. Hoja Practicas -> Practica (orden 3)
  fields.push(
    toCampo(plantillaId, PRACTICAS_SHEET, 'Practica', 3, [
      'CODCLI', 'rut', 'string', true, {
        campo_lookup_tabla: 'Alumno',
        campo_lookup_columna_db: 'codCli',
        campo_lookup_retorno: 'rut'
      }
    ]),
    toCampo(plantillaId, PRACTICAS_SHEET, 'Practica', 3, [
      'CODCLI', 'codCli', 'string', false
    ]),
    toCampo(plantillaId, PRACTICAS_SHEET, 'Practica', 3, [
      'TIPO_PRACTICA', 'tipoPractica', 'string', true
    ]),
    toCampo(plantillaId, PRACTICAS_SHEET, 'Practica', 3, [
      'AÑO', 'anio', 'number', true
    ]),
    toCampo(plantillaId, PRACTICAS_SHEET, 'Practica', 3, [
      'PERIODO', 'periodo', 'number', true
    ]),
    toCampo(plantillaId, PRACTICAS_SHEET, 'Practica', 3, [
      'ESTADO', 'estado', 'string', true
    ]),
    toCampo(plantillaId, PRACTICAS_SHEET, 'Practica', 3, [
      'FECHA', 'fechaInicio', 'date', false
    ])
  );

  // 4. Hoja Titulacion -> Titulacion (orden 4)
  fields.push(
    toCampo(plantillaId, TITULACION_SHEET, 'Titulacion', 4, [
      'CODCLI', 'rut', 'string', true, {
        campo_lookup_tabla: 'Alumno',
        campo_lookup_columna_db: 'codCli',
        campo_lookup_retorno: 'rut'
      }
    ]),
    toCampo(plantillaId, TITULACION_SHEET, 'Titulacion', 4, [
      'CODCLI', 'codCli', 'string', false
    ]),
    toCampo(plantillaId, TITULACION_SHEET, 'Titulacion', 4, [
      'COHORTE', 'cohorte', 'number', true
    ]),
    toCampo(plantillaId, TITULACION_SHEET, 'Titulacion', 4, [
      'AÑO TITULACION', 'anioTitulacion', 'number', true
    ]),
    toCampo(plantillaId, TITULACION_SHEET, 'Titulacion', 4, [
      'SEMESTRES_CURSADOS', 'semestresCursados', 'number', false
    ]),
    toCampo(plantillaId, TITULACION_SHEET, 'Titulacion', 4, [
      'TIEMPO_NORMATIVO', 'tiempoNormativo', 'number', false
    ])
  );

  return fields;
};

module.exports = {
  DESARROLLO_CURRICULAR_TEMPLATE_NAME,
  DESARROLLO_CURRICULAR_TEMPLATE_FILENAME,
  RENDIMIENTO_SHEET,
  PRACTICAS_SHEET,
  TITULACION_SHEET,
  rendimientoHeaders,
  practicasHeaders,
  titulacionHeaders,
  createDesarrolloCurricularTemplateBuffer,
  createDesarrolloCurricularPlantilla,
  createDesarrolloCurricularFields
};
