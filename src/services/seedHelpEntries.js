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
    pregunta: '¿Cómo se vincula un participante externo con su matrícula?',
    respuesta: 'La relación se establece mediante el campo ID Participante y el RUT del alumno externo en las hojas de detalle correspondientes de la plantilla.'
  },
  {
    modulo: 'educacion_continua',
    orden: 3,
    pregunta: '¿Qué validación se aplica a los estados financieros de programas?',
    respuesta: 'Se verifica que los montos de ingresos, egresos y márgenes sean numéricos válidos y que el código del programa exista previamente en la base de datos.'
  },

  // 3. Vinculación con el Medio
  {
    modulo: 'vinculacion_medio',
    orden: 1,
    pregunta: '¿Cuáles son las entidades principales del módulo de VcM?',
    respuesta: 'El módulo administra proyectos, actividades, convenios institucionales, participaciones de beneficiarios y financiamientos asociados.'
  },
  {
    modulo: 'vinculacion_medio',
    orden: 2,
    pregunta: '¿Cómo se registran las participaciones en actividades de VcM?',
    respuesta: 'Se desglosan por cantidad de asistentes clasificados por género, tipo de beneficiario (interno o externo) y ubicación geográfica de la actividad.'
  },
  {
    modulo: 'vinculacion_medio',
    orden: 3,
    pregunta: '¿Es obligatorio asociar una actividad a un convenio marco?',
    respuesta: 'No es estrictamente obligatorio, pero cuando la actividad deriva de una alianza formal debe seleccionarse el convenio institucional correspondiente.'
  },

  // 4. Innovación
  {
    modulo: 'innovacion',
    orden: 1,
    pregunta: '¿Qué tipo de iniciativas se gestionan en Innovación?',
    respuesta: 'Se registran proyectos de innovación docente, desarrollo tecnológico, transferencia y aplicaciones pedagógicas impulsadas por la comunidad académica.'
  },
  {
    modulo: 'innovacion',
    orden: 2,
    pregunta: '¿Cómo se estructuran los financiamientos de proyectos de innovación?',
    respuesta: 'Cada proyecto puede asociar fuentes de financiamiento internas o externas (como Corfo o Sercotec), detallando montos adjudicados y su estado de ejecución.'
  },
  {
    modulo: 'innovacion',
    orden: 3,
    pregunta: '¿Qué métricas evalúan el impacto de un proyecto de innovación?',
    respuesta: 'Se evalúa la cantidad de docentes y estudiantes involucrados, prototipos generados y publicaciones o transferencias efectivas logradas.'
  },

  // 5. Admisión
  {
    modulo: 'admision',
    orden: 1,
    pregunta: '¿Qué información contempla la plantilla de Admisión?',
    respuesta: 'Incluye la nómina de postulantes y matriculados oficiales con datos demográficos, colegio de procedencia, tipo de ingreso y caracterización del estudiante.'
  },
  {
    modulo: 'admision',
    orden: 2,
    pregunta: '¿Cómo se valida el formato del RUT de los postulantes?',
    respuesta: 'El sistema valida automáticamente el algoritmo módulo 11 del RUT chileno antes de permitir la persistencia definitiva de los registros.'
  },
  {
    modulo: 'admision',
    orden: 3,
    pregunta: '¿Se pueden realizar cargas parciales de matrícula?',
    respuesta: 'Sí, la plantilla admite variantes de matrícula nueva y caracterización socioeconómica mediante procesos transaccionales independientes.'
  },

  // 6. Desarrollo Curricular
  {
    modulo: 'desarrollo_curricular',
    orden: 1,
    pregunta: '¿Qué dimensiones cubre el módulo de Desarrollo Curricular?',
    respuesta: 'Monitorea el rendimiento académico por asignatura, el seguimiento de prácticas tempranas y profesionales, y los tiempos de titulación oportuna.'
  },
  {
    modulo: 'desarrollo_curricular',
    orden: 2,
    pregunta: '¿Cómo se identifica una asignatura crítica?',
    respuesta: 'El sistema cataloga como crítica cualquier asignatura cuya tasa de reprobación supere el 30% en un periodo lectivo determinado.'
  },
  {
    modulo: 'desarrollo_curricular',
    orden: 3,
    pregunta: '¿Cómo se calcula el indicador de titulación oportuna?',
    respuesta: 'Compara los semestres reales cursados por el egresado frente a la duración formal normada de la carrera en el plan de estudios correspondiente.'
  },

  // 7. Metas
  {
    modulo: 'metas',
    orden: 1,
    pregunta: '¿Cuáles son los estados del ciclo de vida de una Meta?',
    respuesta: 'Una meta puede encontrarse en BORRADOR (edición preliminar), ACTIVA (publicada y en seguimiento de avance) o CERRADA (finalizada con snapshot congelado).'
  },
  {
    modulo: 'metas',
    orden: 2,
    pregunta: '¿Quién puede definir o modificar metas institucionales y departamentales?',
    respuesta: 'Rectoría puede gestionar metas globales e institucionales; las direcciones departamentales solo pueden definir metas vinculadas estrictamente a su departamento.'
  },
  {
    modulo: 'metas',
    orden: 3,
    pregunta: '¿Qué ocurre al cerrar una meta formalmente?',
    respuesta: 'Se congela el resultado y progreso definitivo en un snapshot inmutable, bloqueando cualquier alteración posterior de sus métricas o ponderadores.'
  },

  // 8. Carga de Datos
  {
    modulo: 'carga_datos',
    orden: 1,
    pregunta: '¿Qué formato de archivo se exige para la carga masiva?',
    respuesta: 'Se debe utilizar el formato Excel (.xlsx) oficial descargado directamente desde el módulo de plantillas institucionales.'
  },
  {
    modulo: 'carga_datos',
    orden: 2,
    pregunta: '¿Qué sucede si una fila contiene errores de validación?',
    respuesta: 'El proceso utiliza transacciones atómicas; si una fila no cumple las reglas de negocio o tipos de datos, la carga completa se revierte sin alterar la base de datos.'
  },
  {
    modulo: 'carga_datos',
    orden: 3,
    pregunta: '¿Existe un límite de tamaño para el archivo de carga?',
    respuesta: 'El tamaño máximo predeterminado por el servidor es de 10 MB por archivo subido.'
  },

  // 9. Repositorio
  {
    modulo: 'repositorio',
    orden: 1,
    pregunta: '¿Qué documentos se almacenan en el Repositorio?',
    respuesta: 'Conserva las versiones históricas de las plantillas oficiales de cada departamento y las evidencias adjuntas a proyectos y convenios institucionales.'
  },
  {
    modulo: 'repositorio',
    orden: 2,
    pregunta: '¿Quién puede actualizar las plantillas maestras en el Repositorio?',
    respuesta: 'Únicamente el usuario con rol de Rectoría cuenta con autorización para sustituir o crear nuevas estructuras de plantillas maestras.'
  },
  {
    modulo: 'repositorio',
    orden: 3,
    pregunta: '¿Cómo se garantiza la trazabilidad de los archivos cargados?',
    respuesta: 'Cada archivo subido genera un registro con firma hash, fecha, usuario responsable y relación con la auditoría de carga respectiva.'
  },

  // 10. Reportes
  {
    modulo: 'reportes',
    orden: 1,
    pregunta: '¿Qué formatos de exportación soporta el generador de reportes?',
    respuesta: 'El sistema permite exportar tablas consolidadas y resúmenes ejecutivos en hojas de cálculo Excel (.xlsx) y formatos analíticos tabulares.'
  },
  {
    modulo: 'reportes',
    orden: 2,
    pregunta: '¿Se pueden aplicar filtros combinados por año y carrera?',
    respuesta: 'Sí, el motor de reportes permite filtrar simultáneamente por año lectivo, semestre, departamento y dimensiones demográficas habilitadas.'
  },
  {
    modulo: 'reportes',
    orden: 3,
    pregunta: '¿Los reportes reflejan datos en tiempo real?',
    respuesta: 'Sí, consultan directamente la base de datos transaccional y las vistas materializadas sincronizadas al momento de generar la consulta.'
  },

  // 11. Auditoría
  {
    modulo: 'auditoria',
    orden: 1,
    pregunta: '¿Qué eventos son registrados por el sistema de Auditoría?',
    respuesta: 'Se auditan inicios de sesión, cargas masivas de datos, cambios de estado en metas, creaciones de plantillas y modificaciones en el Centro de Ayuda.'
  },
  {
    modulo: 'auditoria',
    orden: 2,
    pregunta: '¿Pueden modificarse o borrarse los registros del log de auditoría?',
    respuesta: 'No, las tablas de auditoría son de solo adición (append-only) y no ofrecen endpoints de actualización ni eliminación por motivos de seguridad institucional.'
  },
  {
    modulo: 'auditoria',
    orden: 3,
    pregunta: '¿Quién tiene permisos para consultar el módulo de Auditoría?',
    respuesta: 'El acceso al registro de auditoría está reservado exclusivamente para la Rectoría y los equipos designados de Aseguramiento de la Calidad.'
  }
];

const seedHelpEntries = async (database) => {
  const model = (database && database.models && database.models.EntradaAyuda) || EntradaAyuda;
  if (!model) return [];

  const created = [];
  for (const entry of HELP_SEEDS) {
    const [row] = await model.findOrCreate({
      where: {
        modulo: entry.modulo,
        orden: entry.orden
      },
      defaults: {
        modulo: entry.modulo,
        orden: entry.orden,
        pregunta: entry.pregunta,
        respuesta: entry.respuesta,
        activo: true
      }
    });
    created.push(row);
  }
  return created;
};

module.exports = { seedHelpEntries, HELP_SEEDS };
