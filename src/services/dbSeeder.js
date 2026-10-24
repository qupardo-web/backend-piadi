const { Op } = require('sequelize');
const {
  User,
  Role,
  Department,
  Plantilla,
  CampoPlantilla,
  Alumno,
  Asignatura,
  RendimientoAsignatura,
  Practica,
  Titulacion
} = require('../models');
const {
  createEducacionContinuaPlantilla
} = require('../config/plantillaEducacionContinua');
const {
  createVcmPlantilla
} = require('../config/plantillaVcm');
const {
  INNOVACION_TEMPLATE_NAME,
  createInnovationPlantilla,
  createInnovationFields
} = require('../config/plantillaInnovacion');
const {
  ADMISION_COMBINADA_NAME,
  ADMISION_MATRICULA_NAME,
  ADMISION_CARACTERIZACION_NAME,
  VARIANTE_COMBINADA,
  VARIANTE_MATRICULA,
  VARIANTE_CARACTERIZACION,
  createAllAdmisionPlantillas,
  createAdmisionFields
} = require('../config/plantillaAdmision');
const {
  DESARROLLO_CURRICULAR_TEMPLATE_NAME,
  createDesarrolloCurricularPlantilla,
  createDesarrolloCurricularFields
} = require('../config/plantillaDesarrolloCurricular');

async function seedDatabase() {
  try {
    // 1. Seed Roles first
    let roleMap = {};

    const rolesToSeed = [
      { name: 'Rector', group: 'Rectoria', description: 'Máxima autoridad institucional y administrador general.' },
      { name: 'Vicerrectoria de Calidad', group: 'Calidad', description: 'Aseguramiento interno de calidad' },
      { name: 'Vicerrectoria Académica', group: 'Direccion', description: 'Dirección académica general' },
      { name: 'Admisión', group: 'Direccion', description: 'Dirección de admisión y registro.' },
      { name: 'Relaciones Estudiantiles', group: 'Direccion', description: 'Dirección de relaciones estudiantiles.' },
      { name: 'Desarrollo Curricular', group: 'Direccion', description: 'Dirección de desarrollo curricular.' },
      { name: 'Vicerrectoria de Desarrollo Institucional', group: 'Direccion', description: 'Vicerrectoría de desarrollo institucional' },
      { name: 'Innovación', group: 'Direccion', description: 'Dirección de innovación y desarrollo' },
      { name: 'Educación Continua', group: 'Direccion', description: 'Dirección de educación continua' },
      { name: 'Vinculación Con El Medio', group: 'Direccion', description: 'Dirección de vinculación con el medio' },
      { name: 'Dirección de Vinculación con el Medio', group: 'Direccion', description: 'Dirección de vinculación con el medio' },
      { name: 'Director Académico', group: 'Direccion', description: 'Dirección académica' },
      { name: 'Director de Administración', group: 'Direccion', description: 'Dirección de administración' }
    ];

    for (const roleData of rolesToSeed) {
      const [role] = await Role.findOrCreate({
        where: { name: roleData.name },
        defaults: roleData
      });
      roleMap[roleData.name] = role.id;
    }
    console.log('Roles ensured in database.');

    // 1.5 Seed Departments (required for User.departmentId foreign key constraint)
    const departmentsToSeed = [
      { key: 'educacion_continua', name: 'Educación Continua', description: 'Dirección de Educación Continua', enabled: true, order: 1 },
      { key: 'vinculacion_medio', name: 'Vinculación con el Medio', description: 'Dirección de Vinculación con el Medio', enabled: true, order: 2 },
      { key: 'institucional', name: 'Institucional', description: 'Metas institucionales', enabled: true, order: 3 },
      { key: 'innovacion', name: 'Innovación', description: 'Dirección de Innovación', enabled: true, order: 4 },
      { key: 'desarrollo_curricular', name: 'Desarrollo Curricular', description: 'Dirección de Desarrollo Curricular', enabled: true, order: 5 },
      { key: 'admision', name: 'Admisión', description: 'Dirección de Admisión y Registro Académico', enabled: true, order: 6 }
    ];

    for (const deptData of departmentsToSeed) {
      await Department.findOrCreate({
        where: { key: deptData.key },
        defaults: deptData
      });
    }
    console.log('Departments ensured in database.');

    // 2. Seed Users
    const usersToSeed = [
      {
        email: 'educacioncontinua@ecas.cl',
        username: 'educacioncontinua@ecas.cl',
        name: 'Paola Sanchez',
        password: 'admin123',
        roleId: roleMap['Educación Continua'],
        departmentId: 'educacion_continua'
      },
      {
        email: 'rectoria@ecas.cl',
        username: 'rectoria@ecas.cl',
        name: 'Pablo Marquez',
        password: 'admin123',
        roleId: roleMap['Rector'],
        departmentId: null
      },
      {
        email: 'calidad@ecas.cl',
        username: 'calidad@ecas.cl',
        name: 'Vicerrectoria de Calidad',
        password: 'admin123',
        roleId: roleMap['Vicerrectoria de Calidad'],
        departmentId: null
      },
      {
        email: 'innovacion@ecas.cl',
        username: 'innovacion@ecas.cl',
        name: 'Dirección de Innovación',
        password: 'admin123',
        roleId: roleMap['Innovación'],
        departmentId: 'innovacion'
      },
      {
        email: 'vcm@ecas.cl',
        username: 'vcm@ecas.cl',
        name: 'Dirección de Vinculación con el Medio',
        password: 'admin123',
        roleId: roleMap['Vinculación Con El Medio'],
        departmentId: 'vinculacion_medio'
      },
      {
        email: 'admision@ecas.cl',
        username: 'admision@ecas.cl',
        name: 'Dirección de Admisión',
        password: 'admin123',
        roleId: roleMap['Admisión'],
        departmentId: 'admision'
      },
      {
        email: 'desarrollocurricular@ecas.cl',
        username: 'desarrollocurricular@ecas.cl',
        name: 'Dirección de Desarrollo Curricular',
        password: 'admin123',
        roleId: roleMap['Desarrollo Curricular'],
        departmentId: 'desarrollo_curricular'
      }
    ];

    for (const userData of usersToSeed) {
      if (!userData.roleId) continue;
      const [user, created] = await User.findOrCreate({
        where: { email: userData.email },
        defaults: userData
      });
      if (!created) {
        const updateFields = {};
        if (user.roleId !== userData.roleId) updateFields.roleId = userData.roleId;
        if (userData.departmentId && user.departmentId !== userData.departmentId) updateFields.departmentId = userData.departmentId;
        if (Object.keys(updateFields).length > 0) {
          await user.update(updateFields);
        }
      }
    }
    console.log('Default users ensured successfully.');

    // 3. Seed Plantillas (findOrCreate to support incremental updates)
    await Plantilla.sequelize.query(`
      ALTER TABLE plantillas ADD COLUMN IF NOT EXISTS "variante" VARCHAR(50);
    `);

    let plantillaMap = {};
    const plantillasToSeed = [
      createEducacionContinuaPlantilla(roleMap['Educación Continua']),
      createVcmPlantilla(roleMap['Vinculación Con El Medio']),
      createInnovationPlantilla(roleMap[INNOVACION_TEMPLATE_NAME]),
      createDesarrolloCurricularPlantilla(roleMap['Desarrollo Curricular']),
      ...createAllAdmisionPlantillas(roleMap['Admisión'])
    ];

    for (const data of plantillasToSeed) {
      if (data.archivoData && typeof data.archivoData.then === 'function') {
        data.archivoData = await data.archivoData;
      }

      const whereClause = (data.roleId && data.variante)
        ? { roleId: data.roleId, variante: data.variante }
        : { name: data.name };

      const [created] = await Plantilla.findOrCreate({
        where: whereClause,
        defaults: data
      });
      plantillaMap[data.name] = created.id;

      const updateData = {};
      if (created.name !== data.name) updateData.name = data.name;
      if (created.roleId !== data.roleId) updateData.roleId = data.roleId;
      if (created.departmentId !== data.departmentId) updateData.departmentId = data.departmentId;
      if (data.variante !== undefined && created.variante !== data.variante) updateData.variante = data.variante;
      if (data.description && created.description !== data.description) updateData.description = data.description;
      if (data.archivoNombre && created.archivoNombre !== data.archivoNombre) updateData.archivoNombre = data.archivoNombre;
      if (data.archivoData) {
        updateData.archivoData = data.archivoData;
      }
      if (Object.keys(updateData).length > 0) {
        await created.update(updateData);
      }
    }

    // Clean up any obsolete plantillas for Admisión role that don't match the current 3 IDs
    const admisionRoleId = roleMap['Admisión'];
    if (admisionRoleId) {
      const validAdmisionIds = [
        plantillaMap[ADMISION_COMBINADA_NAME],
        plantillaMap[ADMISION_MATRICULA_NAME],
        plantillaMap[ADMISION_CARACTERIZACION_NAME]
      ].filter(Boolean);

      const obsoletePlantillas = await Plantilla.findAll({
        where: {
          roleId: admisionRoleId,
          id: { [Op.notIn]: validAdmisionIds }
        }
      });

      for (const obsolete of obsoletePlantillas) {
        await CampoPlantilla.destroy({ where: { plantillaId: obsolete.id } });
        await obsolete.destroy();
      }
    }

    plantillaMap['Admisión'] = plantillaMap[ADMISION_COMBINADA_NAME];
    console.log('Plantillas ensured in database.');

    // 4. Seed CamposPlantilla (findOrCreate to support incremental updates)
    const camposToSeed = [
      // ═══════════════════════════════════════════════════════
      // EDUCACIÓN CONTINUA - ORDEN 1 — Hoja Base Programas → Programa
      // ═══════════════════════════════════════════════════════
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'ID Programa',            columna_excel: 'ID Programa',            hoja_origen: 'Base Programas',         tabla_destino: 'Programa', columna_destino: 'idPrograma',       tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Año',                    columna_excel: 'Año',                    hoja_origen: 'Base Programas',         tabla_destino: 'Programa', columna_destino: 'anio',             tipo_dato: 'number', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Semestre',               columna_excel: 'Semestre',               hoja_origen: 'Base Programas',         tabla_destino: 'Programa', columna_destino: 'semestre',          tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Mes Inicio',             columna_excel: 'Mes Inicio',             hoja_origen: 'Base Programas',         tabla_destino: 'Programa', columna_destino: 'mesInicio',         tipo_dato: 'number', requerido: false, orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Área',                   columna_excel: 'Área',                   hoja_origen: 'Base Programas',         tabla_destino: 'Programa', columna_destino: 'area',             tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Programa',               columna_excel: 'Programa',               hoja_origen: 'Base Programas',         tabla_destino: 'Programa', columna_destino: 'programa',          tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Tipo',                   columna_excel: 'Tipo',                   hoja_origen: 'Base Programas',         tabla_destino: 'Programa', columna_destino: 'tipo',             tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Modalidad',              columna_excel: 'Modalidad',              hoja_origen: 'Base Programas',         tabla_destino: 'Programa', columna_destino: 'modalidad',         tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Horas',                  columna_excel: 'Horas',                  hoja_origen: 'Base Programas',         tabla_destino: 'Programa', columna_destino: 'horas',            tipo_dato: 'number', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Cupos Programados',      columna_excel: 'Cupos Programados',      hoja_origen: 'Base Programas',         tabla_destino: 'Programa', columna_destino: 'cuposProgramados',  tipo_dato: 'number', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Sector Principal',       columna_excel: 'Sector Principal',       hoja_origen: 'Base Programas',         tabla_destino: 'Programa', columna_destino: 'sectorPrincipal',   tipo_dato: 'string', requerido: false, orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Región Principal',       columna_excel: 'Región Principal',       hoja_origen: 'Base Programas',         tabla_destino: 'Programa', columna_destino: 'regionPrincipal',   tipo_dato: 'string', requerido: false, orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Empresa/Convenio',       columna_excel: 'Empresa/Convenio',       hoja_origen: 'Base Programas',         tabla_destino: 'Programa', columna_destino: 'empresaConvenio',   tipo_dato: 'string', requerido: false, orden_insercion: 1 },

      // EDUCACIÓN CONTINUA - ORDEN 1 — Hoja Participantes Detalle → AlumnoExterno
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'ID Participante',        columna_excel: 'ID Participante',        hoja_origen: 'Participantes Detalle',  tabla_destino: 'AlumnoExterno', columna_destino: 'idParticipante',      tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'RUT',                    columna_excel: 'RUT',                    hoja_origen: 'Participantes Detalle',  tabla_destino: 'AlumnoExterno', columna_destino: 'rut',                tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Nombre',                 columna_excel: 'Nombre',                 hoja_origen: 'Participantes Detalle',  tabla_destino: 'AlumnoExterno', columna_destino: 'nombre',              tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Apellido Paterno',       columna_excel: 'Apellido Paterno',       hoja_origen: 'Participantes Detalle',  tabla_destino: 'AlumnoExterno', columna_destino: 'apellidoPaterno',      tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Apellido Materno',       columna_excel: 'Apellido Materno',       hoja_origen: 'Participantes Detalle',  tabla_destino: 'AlumnoExterno', columna_destino: 'apellidoMaterno',      tipo_dato: 'string', requerido: false, orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Sexo',                   columna_excel: 'Sexo',                   hoja_origen: 'Participantes Detalle',  tabla_destino: 'AlumnoExterno', columna_destino: 'sexo',               tipo_dato: 'string', requerido: false, orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Región',                 columna_excel: 'Región',                 hoja_origen: 'Participantes Detalle',  tabla_destino: 'AlumnoExterno', columna_destino: 'region',              tipo_dato: 'string', requerido: false, orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Comuna',                 columna_excel: 'Comuna',                 hoja_origen: 'Participantes Detalle',  tabla_destino: 'AlumnoExterno', columna_destino: 'comuna',              tipo_dato: 'string', requerido: false, orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Nacionalidad',           columna_excel: 'Nacionalidad',           hoja_origen: 'Participantes Detalle',  tabla_destino: 'AlumnoExterno', columna_destino: 'nacionalidad',        tipo_dato: 'string', requerido: false, orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Nivel de estudio',       columna_excel: 'Nivel de estudio',       hoja_origen: 'Participantes Detalle',  tabla_destino: 'AlumnoExterno', columna_destino: 'nivelDeEstudio',       tipo_dato: 'string', requerido: false, orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Carrera cursada / profesión', columna_excel: 'Carrera cursada / profesión', hoja_origen: 'Participantes Detalle', tabla_destino: 'AlumnoExterno', columna_destino: 'carreraCursada',  tipo_dato: 'string', requerido: false, orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Ocupación',              columna_excel: 'Ocupación',              hoja_origen: 'Participantes Detalle',  tabla_destino: 'AlumnoExterno', columna_destino: 'ocupacion',           tipo_dato: 'string', requerido: false, orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Trabaja actualmente',    columna_excel: 'Trabaja actualmente',    hoja_origen: 'Participantes Detalle',  tabla_destino: 'AlumnoExterno', columna_destino: 'trabajaActualmente',   tipo_dato: 'string', requerido: false, orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Lugar de trabajo',       columna_excel: 'Lugar de trabajo',       hoja_origen: 'Participantes Detalle',  tabla_destino: 'AlumnoExterno', columna_destino: 'lugarDeTrabajo',       tipo_dato: 'string', requerido: false, orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Cargo',                  columna_excel: 'Cargo',                  hoja_origen: 'Participantes Detalle',  tabla_destino: 'AlumnoExterno', columna_destino: 'cargo',               tipo_dato: 'string', requerido: false, orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Sector económico',       columna_excel: 'Sector económico',       hoja_origen: 'Participantes Detalle',  tabla_destino: 'AlumnoExterno', columna_destino: 'sectorEconomico',      tipo_dato: 'string', requerido: false, orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Tipo participante',      columna_excel: 'Tipo participante',      hoja_origen: 'Participantes Detalle',  tabla_destino: 'AlumnoExterno', columna_destino: 'tipoParticipante',     tipo_dato: 'string', requerido: false, orden_insercion: 1 },

      // EDUCACIÓN CONTINUA - ORDEN 2 — Hoja Base Programas → ResultadosPrograma
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'ID Programa', columna_excel: 'ID Programa', hoja_origen: 'Base Programas', tabla_destino: 'ResultadosPrograma', columna_destino: 'idPrograma', tipo_dato: 'string', requerido: true, orden_insercion: 2, campo_lookup_tabla: 'Programa', campo_lookup_columna_db: 'idPrograma', campo_lookup_retorno: 'idPrograma' },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Matrícula',  columna_excel: 'Matrícula',  hoja_origen: 'Base Programas', tabla_destino: 'ResultadosPrograma', columna_destino: 'matricula',      tipo_dato: 'number', requerido: false, orden_insercion: 2 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Aprobados',  columna_excel: 'Aprobados',  hoja_origen: 'Base Programas', tabla_destino: 'ResultadosPrograma', columna_destino: 'aprobados',      tipo_dato: 'number', requerido: false, orden_insercion: 2 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Reprobados', columna_excel: 'Reprobados', hoja_origen: 'Base Programas', tabla_destino: 'ResultadosPrograma', columna_destino: 'reprobados',     tipo_dato: 'number', requerido: false, orden_insercion: 2 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Tasa Aprobación', columna_excel: 'Tasa Aprobación', hoja_origen: 'Base Programas', tabla_destino: 'ResultadosPrograma', columna_destino: 'tasaAprobacion', tipo_dato: 'number', requerido: false, orden_insercion: 2 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Estado',     columna_excel: 'Estado',     hoja_origen: 'Base Programas', tabla_destino: 'ResultadosPrograma', columna_destino: 'estado',          tipo_dato: 'string', requerido: false, orden_insercion: 2 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Ejecutado',  columna_excel: 'Ejecutado',  hoja_origen: 'Base Programas', tabla_destino: 'ResultadosPrograma', columna_destino: 'ejecutado',       tipo_dato: 'string', requerido: false, orden_insercion: 2 },

      // EDUCACIÓN CONTINUA - ORDEN 2 — Hoja Base Programas → EstadoFinancieroPrograma
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'ID Programa',        columna_excel: 'ID Programa',        hoja_origen: 'Base Programas',       tabla_destino: 'EstadoFinancieroPrograma', columna_destino: 'idPrograma',       tipo_dato: 'string', requerido: true,  orden_insercion: 2, campo_lookup_tabla: 'Programa', campo_lookup_columna_db: 'idPrograma', campo_lookup_retorno: 'idPrograma' },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Valor Lista CLP',    columna_excel: 'Valor Lista CLP',    hoja_origen: 'Base Programas',       tabla_destino: 'EstadoFinancieroPrograma', columna_destino: 'valorListaCLP',     tipo_dato: 'number', requerido: false, orden_insercion: 2 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Descuento Promedio', columna_excel: 'Descuento Promedio', hoja_origen: 'Base Programas',       tabla_destino: 'EstadoFinancieroPrograma', columna_destino: 'descuentoPromedio', tipo_dato: 'number', requerido: false, orden_insercion: 2 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Ingresos Brutos CLP',columna_excel: 'Ingresos Brutos CLP', hoja_origen: 'Base Programas',       tabla_destino: 'EstadoFinancieroPrograma', columna_destino: 'ingresosBrutosCLP', tipo_dato: 'number', requerido: false, orden_insercion: 2 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Ingresos Netos CLP', columna_excel: 'Ingresos Netos CLP', hoja_origen: 'Base Programas',       tabla_destino: 'EstadoFinancieroPrograma', columna_destino: 'ingresosNetosCLP',  tipo_dato: 'number', requerido: false, orden_insercion: 2 },

      // EDUCACIÓN CONTINUA - ORDEN 2 — Hoja Participantes Detalle → MatriculaPrograma
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'ID Inscripción',     columna_excel: 'ID Inscripción',     hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'idInscripcion',      tipo_dato: 'string', requerido: true,  orden_insercion: 2 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'ID Programa',        columna_excel: 'ID Programa',        hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'idPrograma',          tipo_dato: 'string', requerido: true,  orden_insercion: 2, campo_lookup_tabla: 'Programa', campo_lookup_columna_db: 'idPrograma', campo_lookup_retorno: 'idPrograma' },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'ID Participante',    columna_excel: 'ID Participante',    hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'idParticipante',      tipo_dato: 'string', requerido: true,  orden_insercion: 2, campo_lookup_tabla: 'AlumnoExterno', campo_lookup_columna_db: 'idParticipante', campo_lookup_retorno: 'idParticipante' },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Nombre Completo',     columna_excel: 'Nombre Completo',     hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'nombreCompleto',      tipo_dato: 'string', requerido: false, orden_insercion: 2 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Edad',               columna_excel: 'Edad',               hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'edadAlumno',          tipo_dato: 'number', requerido: false, orden_insercion: 2 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Rango Edad',         columna_excel: 'Rango Edad',         hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'rangoEdadAlumno',     tipo_dato: 'string', requerido: false, orden_insercion: 2 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'N° cursos del participant', columna_excel: 'N° cursos del participante', hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'nCursos',      tipo_dato: 'number', requerido: false, orden_insercion: 2 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Tiene más cursos',    columna_excel: 'Tiene más cursos',    hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'tieneMasCursos',     tipo_dato: 'string', requerido: false, orden_insercion: 2 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Año',                columna_excel: 'Año',                hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'anio',               tipo_dato: 'number', requerido: true,  orden_insercion: 2 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Semestre',           columna_excel: 'Semestre',           hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'semestre',           tipo_dato: 'string', requerido: true,  orden_insercion: 2 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Mes inicio',         columna_excel: 'Mes inicio',         hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'mesInicio',          tipo_dato: 'string', requerido: false, orden_insercion: 2 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Fecha matrícula',    columna_excel: 'Fecha matrícula',    hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'fechaMatricula',     tipo_dato: 'string', requerido: false, orden_insercion: 2 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Valor lista CLP',    columna_excel: 'Valor lista CLP',    hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'valorListaCLP',      tipo_dato: 'string', requerido: false, orden_insercion: 2 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Descuento aplicado', columna_excel: 'Descuento aplicado', hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'descuentoAplicado',  tipo_dato: 'string', requerido: false, orden_insercion: 2 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Monto pagado CLP',   columna_excel: 'Monto pagado CLP',   hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'montoPagadoCLP',    tipo_dato: 'string', requerido: false, orden_insercion: 2 },

      // EDUCACIÓN CONTINUA - ORDEN 3 — Hoja Participantes Detalle → EstadoMatricula
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'ID Inscripción',   columna_excel: 'ID Inscripción',   hoja_origen: 'Participantes Detalle', tabla_destino: 'EstadoMatricula', columna_destino: 'idInscripcion',    tipo_dato: 'string', requerido: true,  orden_insercion: 3, campo_lookup_tabla: 'MatriculaPrograma', campo_lookup_columna_db: 'idInscripcion', campo_lookup_retorno: 'idInscripcion' },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Estado académico', columna_excel: 'Estado académico', hoja_origen: 'Participantes Detalle', tabla_destino: 'EstadoMatricula', columna_destino: 'estadoAcademico',  tipo_dato: 'string', requerido: false, orden_insercion: 3 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Aprobó',           columna_excel: 'Aprobó',           hoja_origen: 'Participantes Detalle', tabla_destino: 'EstadoMatricula', columna_destino: 'aprobo',            tipo_dato: 'string', requerido: false, orden_insercion: 3 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Nota final',       columna_excel: 'Nota final',       hoja_origen: 'Participantes Detalle', tabla_destino: 'EstadoMatricula', columna_destino: 'notaFinal',         tipo_dato: 'string', requerido: false, orden_insercion: 3 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Asistencia %',     columna_excel: 'Asistencia %',     hoja_origen: 'Participantes Detalle', tabla_destino: 'EstadoMatricula', columna_destino: 'asistencia',        tipo_dato: 'string', requerido: false, orden_insercion: 3 },

      // ═══════════════════════════════════════════════════════
      // VINCULACIÓN CON EL MEDIO (VCM) - ORDEN 1 — Hoja Convenios → Convenio
      // ═══════════════════════════════════════════════════════
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'ID Convenio',       columna_excel: 'ID Convenio',       hoja_origen: 'Convenios',              tabla_destino: 'Convenio', columna_destino: 'idConvenio',       tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Contraparte',       columna_excel: 'Contraparte',       hoja_origen: 'Convenios',              tabla_destino: 'Convenio', columna_destino: 'contraparte',       tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'RUT Contraparte',   columna_excel: 'RUT Contraparte',   hoja_origen: 'Convenios',              tabla_destino: 'Convenio', columna_destino: 'rutContraparte',   tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Sector',             columna_excel: 'Sector',             hoja_origen: 'Convenios',              tabla_destino: 'Convenio', columna_destino: 'sector',            tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Tipo Convenio',     columna_excel: 'Tipo convenio',     hoja_origen: 'Convenios',              tabla_destino: 'Convenio', columna_destino: 'tipoConvenio',     tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Año Firma',         columna_excel: 'Año firma',         hoja_origen: 'Convenios',              tabla_destino: 'Convenio', columna_destino: 'anioFirma',         tipo_dato: 'number', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Fecha de Firma',    columna_excel: 'Fecha firma',        hoja_origen: 'Convenios',              tabla_destino: 'Convenio', columna_destino: 'fechaDeFirma',    tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Fecha de Término',  columna_excel: 'Fecha término',      hoja_origen: 'Convenios',              tabla_destino: 'Convenio', columna_destino: 'fechaDeTermino',  tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Estado',             columna_excel: 'Estado',             hoja_origen: 'Convenios',              tabla_destino: 'Convenio', columna_destino: 'estado',            tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Área Vinculada',   columna_excel: 'Área vinculada',   hoja_origen: 'Convenios',              tabla_destino: 'Convenio', columna_destino: 'areaVinculada',   tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Contacto',           columna_excel: 'Contacto',           hoja_origen: 'Convenios',              tabla_destino: 'Convenio', columna_destino: 'contacto',          tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Región',             columna_excel: 'Región',             hoja_origen: 'Convenios',              tabla_destino: 'Convenio', columna_destino: 'region',            tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Comuna',             columna_excel: 'Comuna',             hoja_origen: 'Convenios',              tabla_destino: 'Convenio', columna_destino: 'comuna',            tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Responsable ECAS',   columna_excel: 'Responsable ECAS',   hoja_origen: 'Convenios',              tabla_destino: 'Convenio', columna_destino: 'responsableEcas',   tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Objetivo',           columna_excel: 'Objetivo / alcance', hoja_origen: 'Convenios',              tabla_destino: 'Convenio', columna_destino: 'objetivo',          tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Evidencia',          columna_excel: 'Evidencia',          hoja_origen: 'Convenios',              tabla_destino: 'Convenio', columna_destino: 'evidencia',         tipo_dato: 'string', requerido: true,  orden_insercion: 1 },

      // VCM - ORDEN 2 — Hoja Actividades → Actividad (lookup: Convenio)
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'ID Actividad',      columna_excel: 'ID Actividad',      hoja_origen: 'Actividades VcM',        tabla_destino: 'Actividad', columna_destino: 'idActividad',      tipo_dato: 'string', requerido: true,  orden_insercion: 2 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Fecha',              columna_excel: 'Fecha',              hoja_origen: 'Actividades VcM',        tabla_destino: 'Actividad', columna_destino: 'fecha',              tipo_dato: 'string', requerido: true,  orden_insercion: 2 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Año',                columna_excel: 'Año',                hoja_origen: 'Actividades VcM',        tabla_destino: 'Actividad', columna_destino: 'anio',               tipo_dato: 'number', requerido: true,  orden_insercion: 2 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Mes',                columna_excel: 'Mes',                hoja_origen: 'Actividades VcM',        tabla_destino: 'Actividad', columna_destino: 'mes',                tipo_dato: 'string', requerido: true,  orden_insercion: 2 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Línea VcM',          columna_excel: 'Línea VcM',          hoja_origen: 'Actividades VcM',        tabla_destino: 'Actividad', columna_destino: 'lineaVcM',          tipo_dato: 'string', requerido: true,  orden_insercion: 2 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Tipo Actividad',     columna_excel: 'Tipo actividad',     hoja_origen: 'Actividades VcM',        tabla_destino: 'Actividad', columna_destino: 'tipoActividad',     tipo_dato: 'string', requerido: true,  orden_insercion: 2 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Nombre Actividad',   columna_excel: 'Nombre actividad',   hoja_origen: 'Actividades VcM',        tabla_destino: 'Actividad', columna_destino: 'nombreActividad',   tipo_dato: 'string', requerido: true,  orden_insercion: 2 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Institución Contraparte', columna_excel: 'Institución / contraparte', hoja_origen: 'Actividades VcM', tabla_destino: 'Actividad', columna_destino: 'institucionContraparte', tipo_dato: 'string', requerido: true,  orden_insercion: 2 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Sector',             columna_excel: 'Sector',             hoja_origen: 'Actividades VcM',        tabla_destino: 'Actividad', columna_destino: 'sector',            tipo_dato: 'string', requerido: true,  orden_insercion: 2 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Responsable',        columna_excel: 'Responsable',        hoja_origen: 'Actividades VcM',        tabla_destino: 'Actividad', columna_destino: 'responsable',       tipo_dato: 'string', requerido: true,  orden_insercion: 2 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Región',             columna_excel: 'Región',             hoja_origen: 'Actividades VcM',        tabla_destino: 'Actividad', columna_destino: 'region',            tipo_dato: 'string', requerido: true,  orden_insercion: 2 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Comuna',             columna_excel: 'Comuna',             hoja_origen: 'Actividades VcM',        tabla_destino: 'Actividad', columna_destino: 'comuna',            tipo_dato: 'string', requerido: true,  orden_insercion: 2 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Modalidad',          columna_excel: 'Modalidad',          hoja_origen: 'Actividades VcM',        tabla_destino: 'Actividad', columna_destino: 'modalidad',          tipo_dato: 'string', requerido: true,  orden_insercion: 2 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Público Objetivo',    columna_excel: 'Público objetivo',    hoja_origen: 'Actividades VcM',        tabla_destino: 'Actividad', columna_destino: 'publicoObjetivo',    tipo_dato: 'string', requerido: true,  orden_insercion: 2 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Participantes Externos', columna_excel: 'Participantes externos', hoja_origen: 'Actividades VcM', tabla_destino: 'Actividad', columna_destino: 'participantesExternos', tipo_dato: 'number', requerido: true,  orden_insercion: 2 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Participantes Internos', columna_excel: 'Participantes internos', hoja_origen: 'Actividades VcM', tabla_destino: 'Actividad', columna_destino: 'participantesInternos', tipo_dato: 'number', requerido: true,  orden_insercion: 2 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Total Participantes', columna_excel: 'Total participantes', hoja_origen: 'Actividades VcM',  tabla_destino: 'Actividad', columna_destino: 'totalParticipantes', tipo_dato: 'number', requerido: true,  orden_insercion: 2 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Horas',              columna_excel: 'Horas',              hoja_origen: 'Actividades VcM',        tabla_destino: 'Actividad', columna_destino: 'horas',              tipo_dato: 'number', requerido: true,  orden_insercion: 2 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'ID Convenio',       columna_excel: 'Convenio asociado',   hoja_origen: 'Actividades VcM',        tabla_destino: 'Actividad', columna_destino: 'idConvenio',       tipo_dato: 'string', requerido: false, orden_insercion: 2, campo_lookup_tabla: 'Convenio', campo_lookup_columna_db: 'idConvenio', campo_lookup_retorno: 'idConvenio' },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Reporta VcM',        columna_excel: 'Reporta a VcM',        hoja_origen: 'Actividades VcM',        tabla_destino: 'Actividad', columna_destino: 'reportaVcM',        tipo_dato: 'string', requerido: true,  orden_insercion: 2 },

      // VCM - ORDEN 3 — Hoja Participaciones → Participacion (lookup: Actividad)
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'ID Participación',  columna_excel: 'ID Participación',  hoja_origen: 'Participacion detalle',  tabla_destino: 'Participacion', columna_destino: 'idParticipacion',tipo_dato: 'string', requerido: true,  orden_insercion: 3 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'ID Actividad',      columna_excel: 'ID Actividad',      hoja_origen: 'Participacion detalle',  tabla_destino: 'Participacion', columna_destino: 'idActividad',    tipo_dato: 'string', requerido: true,  orden_insercion: 3, campo_lookup_tabla: 'Actividad', campo_lookup_columna_db: 'idActividad', campo_lookup_retorno: 'idActividad' },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Año',                columna_excel: 'Año',                hoja_origen: 'Participacion detalle',  tabla_destino: 'Participacion', columna_destino: 'anio',            tipo_dato: 'number', requerido: true,  orden_insercion: 3 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Fecha',              columna_excel: 'Fecha',              hoja_origen: 'Participacion detalle',  tabla_destino: 'Participacion', columna_destino: 'fecha',          tipo_dato: 'string', requerido: true,  orden_insercion: 3 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Tipo Actividad',     columna_excel: 'Tipo actividad',     hoja_origen: 'Participacion detalle',  tabla_destino: 'Participacion', columna_destino: 'tipoActividad',  tipo_dato: 'string', requerido: true,  orden_insercion: 3 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Institución',        columna_excel: 'Institución',        hoja_origen: 'Participacion detalle',  tabla_destino: 'Participacion', columna_destino: 'institucion',     tipo_dato: 'string', requerido: true,  orden_insercion: 3 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Tipo Participante',  columna_excel: 'Tipo participante',  hoja_origen: 'Participacion detalle',  tabla_destino: 'Participacion', columna_destino: 'tipoParticipante',tipo_dato: 'string', requerido: true,  orden_insercion: 3 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Internos/Externos',  columna_excel: 'Interno / Externo',  hoja_origen: 'Participacion detalle',  tabla_destino: 'Participacion', columna_destino: 'internosExternos',tipo_dato: 'string', requerido: true,  orden_insercion: 3 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Mujeres',            columna_excel: 'Mujeres',            hoja_origen: 'Participacion detalle',  tabla_destino: 'Participacion', columna_destino: 'mujeres',        tipo_dato: 'number', requerido: true,  orden_insercion: 3 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Hombres',            columna_excel: 'Hombres',            hoja_origen: 'Participacion detalle',  tabla_destino: 'Participacion', columna_destino: 'hombres',        tipo_dato: 'number', requerido: true,  orden_insercion: 3 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'No Informa',         columna_excel: 'No informa',         hoja_origen: 'Participacion detalle',  tabla_destino: 'Participacion', columna_destino: 'noInforma',       tipo_dato: 'number', requerido: false, orden_insercion: 3 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Total Personas',     columna_excel: 'Total personas',     hoja_origen: 'Participacion detalle',  tabla_destino: 'Participacion', columna_destino: 'totalPersonas',   tipo_dato: 'number', requerido: true,  orden_insercion: 3 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Comuna',             columna_excel: 'Comuna',             hoja_origen: 'Participacion detalle',  tabla_destino: 'Participacion', columna_destino: 'comuna',         tipo_dato: 'string', requerido: true,  orden_insercion: 3 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Región',             columna_excel: 'Región',             hoja_origen: 'Participacion detalle',  tabla_destino: 'Participacion', columna_destino: 'region',         tipo_dato: 'string', requerido: true,  orden_insercion: 3 },

      // VCM - ORDEN 3 — Hoja Articulaciones → ArticulacionTP (lookup: Actividad)
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'ID Articulación',   columna_excel: 'ID Articulación',   hoja_origen: 'Articulaciones TP',      tabla_destino: 'ArticulacionTP', columna_destino: 'idArticulacion',tipo_dato: 'string', requerido: true,  orden_insercion: 3 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Año',                columna_excel: 'Año',                hoja_origen: 'Articulaciones TP',      tabla_destino: 'ArticulacionTP', columna_destino: 'anio',            tipo_dato: 'number', requerido: true,  orden_insercion: 3 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Fecha',              columna_excel: 'Fecha',              hoja_origen: 'Articulaciones TP',      tabla_destino: 'ArticulacionTP', columna_destino: 'fecha',           tipo_dato: 'string', requerido: true,  orden_insercion: 3 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Colegio/Liceo TP',   columna_excel: 'Colegio / Liceo TP', hoja_origen: 'Articulaciones TP',      tabla_destino: 'ArticulacionTP', columna_destino: 'colegioLiceoTP', tipo_dato: 'string', requerido: true,  orden_insercion: 3 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Comuna',             columna_excel: 'Comuna',             hoja_origen: 'Articulaciones TP',      tabla_destino: 'ArticulacionTP', columna_destino: 'comuna',          tipo_dato: 'string', requerido: true,  orden_insercion: 3 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Región',             columna_excel: 'Región',             hoja_origen: 'Articulaciones TP',      tabla_destino: 'ArticulacionTP', columna_destino: 'region',          tipo_dato: 'string', requerido: true,  orden_insercion: 3 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Especialidad TP',   columna_excel: 'Especialidad TP',   hoja_origen: 'Articulaciones TP',      tabla_destino: 'ArticulacionTP', columna_destino: 'especialidadTP', tipo_dato: 'string', requerido: true,  orden_insercion: 3 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Plataforma Foco',   columna_excel: 'Plataforma / foco', hoja_origen: 'Articulaciones TP',      tabla_destino: 'ArticulacionTP', columna_destino: 'plataformaFoco', tipo_dato: 'string', requerido: true,  orden_insercion: 3 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Tipo Articulación',  columna_excel: 'Tipo articulación',  hoja_origen: 'Articulaciones TP',      tabla_destino: 'ArticulacionTP', columna_destino: 'tipoArticulacion',tipo_dato: 'string', requerido: true,  orden_insercion: 3 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Estudiantes TP',    columna_excel: 'Estudiantes TP',    hoja_origen: 'Articulaciones TP',      tabla_destino: 'ArticulacionTP', columna_destino: 'estudiantesTP',   tipo_dato: 'number', requerido: true,  orden_insercion: 3 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Docentes TP',       columna_excel: 'Docentes TP',       hoja_origen: 'Articulaciones TP',      tabla_destino: 'ArticulacionTP', columna_destino: 'docentesTP',      tipo_dato: 'number', requerido: true,  orden_insercion: 3 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Nivel',              columna_excel: 'Nivel',              hoja_origen: 'Articulaciones TP',      tabla_destino: 'ArticulacionTP', columna_destino: 'nivel',          tipo_dato: 'string', requerido: true,  orden_insercion: 3 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Responsable ECAS',   columna_excel: 'Responsable ECAS',   hoja_origen: 'Articulaciones TP',      tabla_destino: 'ArticulacionTP', columna_destino: 'responsableEcas', tipo_dato: 'string', requerido: true,  orden_insercion: 3 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'ID Actividad',      columna_excel: 'ID Actividad asociada', hoja_origen: 'Articulaciones TP',   tabla_destino: 'ArticulacionTP', columna_destino: 'idActividad',   tipo_dato: 'string', requerido: false, orden_insercion: 3, campo_lookup_tabla: 'Actividad', campo_lookup_columna_db: 'idActividad', campo_lookup_retorno: 'idActividad' },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Evidencia',          columna_excel: 'Producto / evidencia', hoja_origen: 'Articulaciones TP',   tabla_destino: 'ArticulacionTP', columna_destino: 'evidencia',         tipo_dato: 'string', requerido: true,  orden_insercion: 3 },
      { plantillaId: plantillaMap['Vinculación Con El Medio'], nombre_campo: 'Estado',             columna_excel: 'Estado',             hoja_origen: 'Articulaciones TP',      tabla_destino: 'ArticulacionTP', columna_destino: 'estado',            tipo_dato: 'string', requerido: true,  orden_insercion: 3 },

      // INNOVACIÓN — Proyecto/Seccion (orden 1) y Financiamiento (orden 2)
      ...createInnovationFields(plantillaMap[INNOVACION_TEMPLATE_NAME]),

      // DESARROLLO CURRICULAR — Rendimiento (orden 1), Prácticas (orden 2), Titulación (orden 3)
      ...createDesarrolloCurricularFields(plantillaMap[DESARROLLO_CURRICULAR_TEMPLATE_NAME]),

      // ADMISIÓN — 3 variantes
      ...createAdmisionFields(plantillaMap[ADMISION_COMBINADA_NAME], VARIANTE_COMBINADA),
      ...createAdmisionFields(plantillaMap[ADMISION_MATRICULA_NAME], VARIANTE_MATRICULA),
      ...createAdmisionFields(plantillaMap[ADMISION_CARACTERIZACION_NAME], VARIANTE_CARACTERIZACION)
    ];

    const seededKeysByPlantilla = new Map();
    for (const data of camposToSeed) {
      if (!data.plantillaId) continue;
      if (!seededKeysByPlantilla.has(data.plantillaId)) {
        seededKeysByPlantilla.set(data.plantillaId, new Set());
      }
      const key = `${data.hoja_origen}__${data.tabla_destino}__${data.columna_destino}__${data.nombre_campo}`;
      seededKeysByPlantilla.get(data.plantillaId).add(key);

      const [campo, created] = await CampoPlantilla.findOrCreate({
        where: { 
          plantillaId: data.plantillaId, 
          nombre_campo: data.nombre_campo, 
          hoja_origen: data.hoja_origen,
          tabla_destino: data.tabla_destino,
          columna_destino: data.columna_destino
        },
        defaults: data
      });
      if (!created && campo && typeof campo.update === 'function') {
        await campo.update(data);
      }
    }

    // Limpieza de campos obsoletos en plantillas sembradas
    for (const [plantillaId, validKeys] of seededKeysByPlantilla.entries()) {
      if (typeof CampoPlantilla.findAll === 'function') {
        const existingFields = await CampoPlantilla.findAll({ where: { plantillaId } });
        for (const ef of existingFields) {
          const key = `${ef.hoja_origen}__${ef.tabla_destino}__${ef.columna_destino}__${ef.nombre_campo}`;
          if (!validKeys.has(key) && typeof ef.destroy === 'function') {
            await ef.destroy();
          }
        }
      }
    }
    console.log('Campos plantilla ensured in database.');

    // 5. Seed VCM transactional mock data (only if empty)
    console.log('Skipping VCM mock data seeding (removed).');

    // 6. Seed Desarrollo Curricular transactional data (only if empty)
    try {
      const existingRendimiento = await RendimientoAsignatura.count();
      const existingPracticas = await Practica.count();
      const existingTitulacion = await Titulacion.count();
      if (existingRendimiento === 0 && existingPracticas === 0 && existingTitulacion === 0) {
        await seedDesarrolloCurricularData();
      }
    } catch (dcSeedError) {
      // Ignore in mocked unit test environments where tables/DB are not active
    }
  } catch (error) {
    console.error('Error seeding database:', error);
  }
}

async function seedDesarrolloCurricularData() {
  const alumnosSeed = [
    { codCli: 'DC-CLI-001', rut: 19100101, digitoVerificador: 'K', nombre: 'Camila', apellidoPat: 'Rojas', apellidoMat: 'Silva', mail: 'camila.rojas@ecas.cl' },
    { codCli: 'DC-CLI-002', rut: 19100102, digitoVerificador: '8', nombre: 'Matías', apellidoPat: 'Fuentes', apellidoMat: 'Pino', mail: 'matias.fuentes@ecas.cl' },
    { codCli: 'DC-CLI-003', rut: 19100103, digitoVerificador: '6', nombre: 'Valentina', apellidoPat: 'Morales', apellidoMat: 'Vega', mail: 'valentina.morales@ecas.cl' },
    { codCli: 'DC-CLI-004', rut: 19100104, digitoVerificador: '4', nombre: 'Sebastián', apellidoPat: 'Castro', apellidoMat: 'Luna', mail: 'sebastian.castro@ecas.cl' },
    { codCli: 'DC-CLI-005', rut: 19100105, digitoVerificador: '2', nombre: 'Francisca', apellidoPat: 'Herrera', apellidoMat: 'Soto', mail: 'francisca.herrera@ecas.cl' },
    { codCli: 'DC-CLI-006', rut: 19100106, digitoVerificador: '0', nombre: 'Diego', apellidoPat: 'Muñoz', apellidoMat: 'Díaz', mail: 'diego.munoz@ecas.cl' }
  ];

  for (const alumno of alumnosSeed) {
    await Alumno.findOrCreate({
      where: { rut: alumno.rut },
      defaults: alumno
    });
  }

  const asignaturasSeed = [
    { ramoEquiv: 'DC-AUD101', nombre: 'Auditoría I' },
    { ramoEquiv: 'DC-CON201', nombre: 'Contabilidad Intermedia' },
    { ramoEquiv: 'DC-FIN301', nombre: 'Finanzas Corporativas' },
    { ramoEquiv: 'DC-GES401', nombre: 'Control de Gestión' }
  ];

  for (const asig of asignaturasSeed) {
    await Asignatura.findOrCreate({
      where: { ramoEquiv: asig.ramoEquiv },
      defaults: asig
    });
  }

  // Semilla en rendimiento_asignatura (10 registros: 2025 S1/S2 y 2026 S1, incluyendo asignatura crítica DC-FIN301 con >30% reprobación)
  const rendimientosSeed = [
    // 2025 - Periodo 1 (5 registros: 3 aprobados, 2 reprobados en DC-FIN301 => DC-FIN301 tiene 66.67% reprobación = crítica)
    { rut: 19100101, codCli: 'DC-CLI-001', ramoEquiv: 'DC-AUD101', seccion: 1, anio: 2025, periodo: 1, notaFinal: 5.8, estadoAsignatura: 'APROBADO', asistencia: 92.0 },
    { rut: 19100102, codCli: 'DC-CLI-002', ramoEquiv: 'DC-AUD101', seccion: 1, anio: 2025, periodo: 1, notaFinal: 5.1, estadoAsignatura: 'APROBADO', asistencia: 88.5 },
    { rut: 19100103, codCli: 'DC-CLI-003', ramoEquiv: 'DC-FIN301', seccion: 1, anio: 2025, periodo: 1, notaFinal: 3.2, estadoAsignatura: 'REPROBADO', asistencia: 75.0 },
    { rut: 19100104, codCli: 'DC-CLI-004', ramoEquiv: 'DC-FIN301', seccion: 1, anio: 2025, periodo: 1, notaFinal: 3.5, estadoAsignatura: 'REPROBADO', asistencia: 70.0 },
    { rut: 19100105, codCli: 'DC-CLI-005', ramoEquiv: 'DC-FIN301', seccion: 1, anio: 2025, periodo: 1, notaFinal: 4.8, estadoAsignatura: 'APROBADO', asistencia: 85.0 },
    // 2025 - Periodo 2 (3 registros: 2 aprobados, 1 reprobado en DC-CON201 => 33.33% reprobación = crítica en S2)
    { rut: 19100101, codCli: 'DC-CLI-001', ramoEquiv: 'DC-CON201', seccion: 2, anio: 2025, periodo: 2, notaFinal: 6.0, estadoAsignatura: 'APROBADO', asistencia: 95.0 },
    { rut: 19100102, codCli: 'DC-CLI-002', ramoEquiv: 'DC-CON201', seccion: 2, anio: 2025, periodo: 2, notaFinal: 5.4, estadoAsignatura: 'APROBADO', asistencia: 90.0 },
    { rut: 19100103, codCli: 'DC-CLI-003', ramoEquiv: 'DC-CON201', seccion: 2, anio: 2025, periodo: 2, notaFinal: 3.6, estadoAsignatura: 'REPROBADO', asistencia: 72.0 },
    // 2026 - Periodo 1 (2 registros: 2 aprobados en DC-GES401 => 100% aprobación, 0 críticas)
    { rut: 19100105, codCli: 'DC-CLI-005', ramoEquiv: 'DC-GES401', seccion: 1, anio: 2026, periodo: 1, notaFinal: 6.3, estadoAsignatura: 'APROBADO', asistencia: 96.0 },
    { rut: 19100106, codCli: 'DC-CLI-006', ramoEquiv: 'DC-GES401', seccion: 1, anio: 2026, periodo: 1, notaFinal: 5.9, estadoAsignatura: 'APROBADO', asistencia: 91.0 }
  ];

  for (const rend of rendimientosSeed) {
    await RendimientoAsignatura.findOrCreate({
      where: {
        rut: rend.rut,
        ramoEquiv: rend.ramoEquiv,
        anio: rend.anio,
        periodo: rend.periodo
      },
      defaults: rend
    });
  }

  // Semilla en practicas (6 registros: 4 en 2025 y 2 en 2026)
  const practicasSeed = [
    { rut: 19100101, codCli: 'DC-CLI-001', anio: 2025, periodo: 1, tipoPractica: 'Práctica Temprana', estado: 'APROBADA', fechaInicio: '2025-03-10', fechaTermino: '2025-06-15', horas: 240, empresa: 'Deloitte' },
    { rut: 19100102, codCli: 'DC-CLI-002', anio: 2025, periodo: 1, tipoPractica: 'Práctica Temprana', estado: 'APROBADA', fechaInicio: '2025-03-12', fechaTermino: '2025-06-20', horas: 240, empresa: 'EY Chile' },
    { rut: 19100103, codCli: 'DC-CLI-003', anio: 2025, periodo: 2, tipoPractica: 'Práctica Profesional', estado: 'APROBADA', fechaInicio: '2025-08-04', fechaTermino: '2025-11-28', horas: 400, empresa: 'KPMG' },
    { rut: 19100104, codCli: 'DC-CLI-004', anio: 2025, periodo: 2, tipoPractica: 'Práctica Profesional', estado: 'EN CURSO', fechaInicio: '2025-08-10', fechaTermino: null, horas: 400, empresa: 'PwC' },
    { rut: 19100105, codCli: 'DC-CLI-005', anio: 2026, periodo: 1, tipoPractica: 'Práctica Profesional', estado: 'APROBADA', fechaInicio: '2026-03-02', fechaTermino: '2026-06-12', horas: 400, empresa: 'BDO' },
    { rut: 19100106, codCli: 'DC-CLI-006', anio: 2026, periodo: 1, tipoPractica: 'Práctica Temprana', estado: 'EN CURSO', fechaInicio: '2026-03-15', fechaTermino: null, horas: 240, empresa: 'Grant Thornton' }
  ];

  for (const prac of practicasSeed) {
    await Practica.findOrCreate({
      where: {
        rut: prac.rut,
        anio: prac.anio,
        periodo: prac.periodo,
        tipoPractica: prac.tipoPractica
      },
      defaults: prac
    });
  }

  // Semilla en titulacion (4 registros: 3 en 2025 y 1 en 2026)
  const titulacionesSeed = [
    { rut: 19100101, codCli: 'DC-CLI-001', anioTitulacion: 2025, periodo: 1, cohorte: 2021, tiempoNormativo: 8.0, semestresCursados: 8.0, fechaTitulacion: '2025-06-20', distincion: 'Distinción Máxima' },
    { rut: 19100102, codCli: 'DC-CLI-002', anioTitulacion: 2025, periodo: 1, cohorte: 2021, tiempoNormativo: 8.0, semestresCursados: 9.0, fechaTitulacion: '2025-06-25', distincion: 'Aprobado' },
    { rut: 19100103, codCli: 'DC-CLI-003', anioTitulacion: 2025, periodo: 2, cohorte: 2021, tiempoNormativo: 8.0, semestresCursados: 8.0, fechaTitulacion: '2025-12-10', distincion: 'Distinción' },
    { rut: 19100105, codCli: 'DC-CLI-005', anioTitulacion: 2026, periodo: 1, cohorte: 2022, tiempoNormativo: 8.0, semestresCursados: 8.0, fechaTitulacion: '2026-06-18', distincion: 'Distinción Máxima' }
  ];

  for (const tit of titulacionesSeed) {
    await Titulacion.findOrCreate({
      where: {
        rut: tit.rut,
        anioTitulacion: tit.anioTitulacion,
        periodo: tit.periodo
      },
      defaults: tit
    });
  }

  await RendimientoAsignatura.sequelize.query('REFRESH MATERIALIZED VIEW v_meta_indicator_values;').catch(() => {});
  console.log('Desarrollo Curricular seed data ensured in database.');
}

module.exports = { seedDatabase, seedDesarrolloCurricularData };

