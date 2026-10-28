const { EntradaAyuda } = require('../models');

const HELP_SEEDS = [
  // 1. Dashboard
  {
    modulo: 'dashboard',
    orden: 1,
    pregunta: '¿Qué información se visualiza en el Dashboard principal?',
    respuesta: 'El Dashboard presenta una vista ejecutiva con los indicadores clave de desempeño (KPIs) institucionales y el estado de cumplimiento de las metas anuales y semestrales.'
  },
  {
    modulo: 'dashboard',
    orden: 2,
    pregunta: '¿Con qué frecuencia se actualizan los indicadores del Dashboard?',
    respuesta: 'Los indicadores se recalculan y refrescan automáticamente en la vista materializada de forma inmediata tras cada carga masiva de datos departamentales confirmada.'
  },
  {
    modulo: 'dashboard',
    orden: 3,
    pregunta: '¿Cómo se interpretan los estados semafóricos de las metas?',
    respuesta: 'El estado verde indica meta cumplida o superada, amarillo representa un avance en rango de atención preventivo, y rojo señala un cumplimiento bajo el umbral esperado.'
  },

  // 2. Educación Continua
  {
    modulo: 'educacion_continua',
    orden: 1,
    pregunta: '¿Qué registros deben cargarse en Educación Continua?',
    respuesta: 'Se debe cargar la planilla Excel multipágina que incluye programas, participantes externos, matrículas, resultados académicos y estados financieros.'
  },
  {
    modulo: 'educacion_continua',
    orden: 2,
    pregunta: '¿Cómo se identifican los participantes externos?',
    respuesta: 'Los participantes externos se identifican mediante su RUT chileno validado bajo el algoritmo Módulo 11 o identificador institucional para participantes extranjeros.'
  },
  {
    modulo: 'educacion_continua',
    orden: 3,
    pregunta: '¿Qué hacer si un programa no registra ingresos financieros?',
    respuesta: 'En la hoja de estados financieros se debe registrar valor 0 en los montos correspondientes; no se deben dejar celdas en blanco ni caracteres no numéricos.'
  },

  // 3. Vinculación con el Medio
  {
    modulo: 'vinculacion_medio',
    orden: 1,
    pregunta: '¿Qué hojas componen la plantilla de Vinculación con el Medio (VcM)?',
    respuesta: 'La plantilla contiene cuatro hojas relacionales: Convenios Institucionales, Actividades de Vinculación, Desglose de Participaciones y Articulaciones Técnico-Profesionales.'
  },
  {
    modulo: 'vinculacion_medio',
    orden: 2,
    pregunta: '¿Cuál es la regla de cuadratura para los participantes en actividades de VcM?',
    respuesta: 'La base de datos exige mediante triggers que el total de participantes sea estrictamente igual a la suma de participantes internos más participantes externos, y que la suma por género sea idéntica al total.'
  },
  {
    modulo: 'vinculacion_medio',
    orden: 3,
    pregunta: '¿Se pueden registrar actividades sin un convenio asociado?',
    respuesta: 'Sí, el campo de convenio es opcional en la tabla de actividades, permitiendo registrar iniciativas institucionales propias no vinculadas a un convenio marco.'
  },

  // 4. Innovación
  {
    modulo: 'innovacion',
    orden: 1,
    pregunta: '¿Qué tipos de iniciativas se gestionan en el módulo de Innovación?',
    respuesta: 'Se gestionan proyectos de innovación y desarrollo (I+D), fuentes de financiamiento presupuestario y las secciones académicas del curso de emprendimiento.'
  },
  {
    modulo: 'innovacion',
    orden: 2,
    pregunta: '¿Cómo se registran los montos de financiamiento en proyectos de innovación?',
    respuesta: 'Los montos adjudicados y ejecutados deben registrarse en pesos chilenos (CLP) como valores enteros o decimales positivos, sin signos de moneda ni separadores de miles.'
  },
  {
    modulo: 'innovacion',
    orden: 3,
    pregunta: '¿Qué relación existe entre la hoja de Proyectos y la de Financiamientos?',
    respuesta: 'Cada registro en la hoja de financiamientos debe hacer referencia al identificador único del proyecto correspondiente para asegurar la integridad referencial.'
  },

  // 5. Admisión
  {
    modulo: 'admision',
    orden: 1,
    pregunta: '¿Cuáles son las plantillas de carga disponibles para Admisión?',
    respuesta: 'Se dispone de tres variantes: Plantilla Combinada de Admisión, Plantilla de Matrícula por Asignatura y Plantilla de Caracterización Estudiantil.'
  },
  {
    modulo: 'admision',
    orden: 2,
    pregunta: '¿Cómo valida el sistema los identificadores estudiantiles?',
    respuesta: 'El pipeline ETL valida matemáticamente el dígito verificador del RUT con Módulo 11 y normaliza el código de cliente estudiantil (codCli) en el catálogo maestro.'
  },
  {
    modulo: 'admision',
    orden: 3,
    pregunta: '¿Qué ocurre si un estudiante registra asignaturas duplicadas en el mismo período?',
    respuesta: 'El sistema detecta la duplicidad por clave compuesta (alumno, asignatura, año y período) actualizando el registro mediante UPSERT o rechazando duplicados dentro del mismo archivo.'
  },

  // 6. Desarrollo Curricular
  {
    modulo: 'desarrollo_curricular',
    orden: 1,
    pregunta: '¿Qué información integra la planilla de Desarrollo Curricular?',
    respuesta: 'Integra tres hojas de cálculo: Rendimiento por Asignatura (calificaciones y asistencia), Prácticas Laborales/Profesionales y Titulación por Cohorte.'
  },
  {
    modulo: 'desarrollo_curricular',
    orden: 2,
    pregunta: '¿Qué restricciones de dominio aplican sobre las actas de rendimiento?',
    respuesta: 'Las calificaciones deben encontrarse en la escala chilena de 1,0 a 7,0 y el porcentaje de asistencia registrado debe situarse entre 0% y 100%.'
  },
  {
    modulo: 'desarrollo_curricular',
    orden: 3,
    pregunta: '¿Cómo se asegura la consistencia en los registros de titulación?',
    respuesta: 'El motor relacional verifica que el año de titulación sea mayor o igual al año de cohorte de ingreso del estudiante y que los semestres cursados sean positivos.'
  },

  // 7. Metas
  {
    modulo: 'metas',
    orden: 1,
    pregunta: '¿Quiénes pueden crear y administrar metas institucionales?',
    respuesta: 'La creación, ponderación y gestión de estados de las metas institucionales corresponde a los usuarios con rol de Rectoría y Aseguramiento de la Calidad.'
  },
  {
    modulo: 'metas',
    orden: 2,
    pregunta: '¿Cuál es la diferencia entre una meta en estado BORRADOR y ACTIVA?',
    respuesta: 'En estado BORRADOR la meta puede guardar métricas tentativas sin cálculo de indicadores. Al pasar a ACTIVA se exige el cumplimiento estricto de indicadores y suma de 100% en ponderaciones.'
  },
  {
    modulo: 'metas',
    orden: 3,
    pregunta: '¿Cómo se mide el progreso de una meta?',
    respuesta: 'El progreso se calcula automáticamente cruzando el valor objetivo de cada métrica con el valor actual precalculado en la vista materializada de indicadores.'
  },

  // 8. Carga de Datos
  {
    modulo: 'carga_datos',
    orden: 1,
    pregunta: '¿Cómo se cargan las planillas departamentales en el sistema?',
    respuesta: 'Los encargados autorizados descargan la plantilla oficial desde el repositorio, completan los registros y la suben a través del formulario de carga departamental.'
  },
  {
    modulo: 'carga_datos',
    orden: 2,
    pregunta: '¿Qué sucede si una fila de la planilla contiene datos inválidos?',
    respuesta: 'Bajo el principio de atomicidad transaccional (ACID), el sistema rechaza el archivo completo con un ROLLBACK total y entrega un diagnóstico indicando hoja, fila y causa exacta.'
  },
  {
    modulo: 'carga_datos',
    orden: 3,
    pregunta: '¿Dónde se puede consultar el historial de cargas ejecutadas?',
    respuesta: 'En el módulo de Auditoría de Cargas, donde se registra de forma inmutable el usuario, fecha, archivo procesado, total de filas y estado de la operación.'
  },

  // 9. Repositorio
  {
    modulo: 'repositorio',
    orden: 1,
    pregunta: '¿Qué es el Repositorio de Plantillas?',
    respuesta: 'Es el catálogo centralizado donde los directores y encargados de cada unidad pueden descargar las versiones oficiales y vigentes de los formatos Excel de carga.'
  },
  {
    modulo: 'repositorio',
    orden: 2,
    pregunta: '¿Quién puede modificar la estructura de las plantillas?',
    respuesta: 'La estructura de columnas y validaciones está gobernada en el catálogo de metadatos y solo puede ser modificada por el administrador del sistema.'
  },
  {
    modulo: 'repositorio',
    orden: 3,
    pregunta: '¿Por qué no se deben alterar los nombres de las columnas en el Excel?',
    respuesta: 'Porque el pipeline ETL utiliza el catálogo de campos_plantilla para asociar cada columna con la tabla de destino; alterar los encabezados provocará el rechazo de la carga.'
  },

  // 10. Reportes
  {
    modulo: 'reportes',
    orden: 1,
    pregunta: '¿Qué tipo de reportes se pueden generar en la plataforma?',
    respuesta: 'Se pueden generar reportes ejecutivos consolidados por departamento, período lectivo o reportes personalizados seleccionando indicadores y desagregaciones específicas.'
  },
  {
    modulo: 'reportes',
    orden: 2,
    pregunta: '¿En qué formatos se pueden descargar los reportes?',
    respuesta: 'Los reportes pueden exportarse directamente en libros de cálculo Microsoft Excel (.xlsx) estructurados con resúmenes ejecutivos y tablas detalladas.'
  },
  {
    modulo: 'reportes',
    orden: 3,
    pregunta: '¿Los reportes reflejan los datos en tiempo real?',
    respuesta: 'Sí, los reportes leen directamente las vistas analíticas consolidadas, reflejando el estado más actualizado de los datos tras cada carga confirmada.'
  },

  // 11. Auditoría
  {
    modulo: 'auditoria',
    orden: 1,
    pregunta: '¿Qué eventos registra la bitácora de auditoría?',
    respuesta: 'Registra de manera inmutable cada intento de carga masiva (exitoso o rechazado en audit_cargas), inicios de sesión y accesos al sistema en audit_sesiones.'
  },
  {
    modulo: 'auditoria',
    orden: 2,
    pregunta: '¿Quiénes tienen acceso a consultar los registros de auditoría?',
    respuesta: 'El acceso a las bitácoras completas de auditoría está restringido a Rectoría y a la Dirección de Aseguramiento de la Calidad para fines de acreditación.'
  },
  {
    modulo: 'auditoria',
    orden: 3,
    pregunta: '¿Se pueden eliminar o modificar los registros de auditoría?',
    respuesta: 'No, por diseño de seguridad institucional y cumplimiento de las normativas de la CNA y leyes de protección de datos, las tablas de auditoría son de solo inserción (inmutables).'
  }
];

const seedHelpEntries = async (database) => {
  let createdCount = 0;
  for (const item of HELP_SEEDS) {
    const [entry, created] = await EntradaAyuda.findOrCreate({
      where: {
        modulo: item.modulo,
        orden: item.orden
      },
      defaults: {
        pregunta: item.pregunta,
        respuesta: item.respuesta,
        modulo: item.modulo,
        orden: item.orden,
        activo: true
      }
    });
    if (created) {
      createdCount++;
    }
  }
  return { total: HELP_SEEDS.length, created: createdCount };
};

module.exports = { HELP_SEEDS, seedHelpEntries };
