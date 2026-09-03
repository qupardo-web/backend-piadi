const { User, Role, Plantilla, CampoPlantilla, Proyecto, Financiamiento } = require('../models');

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
      { name: 'Dirección de Desarrollo e Innovación', group: 'Direccion', description: 'Dirección de desarrollo e innovación' },
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

    // 2. Seed Users
    const userCount = await User.count();
    if (userCount === 0) {
      console.log('No users found in database. Seeding default users...');

      await User.create({
        email: 'educacioncontinua@ecas.cl',
        username: 'educacioncontinua@ecas.cl',
        name: 'Paola Sanchez',
        password: 'admin123',
        roleId: roleMap['Educación Continua']
      });

      await User.create({
        email: 'rectoria@ecas.cl',
        username: 'rectoria@ecas.cl',
        name: 'Pablo Marquez',
        password: 'admin123',
        roleId: roleMap['Rector']
      });

      await User.create({
        email: 'calidad@ecas.cl',
        username: 'calidad@ecas.cl',
        name: 'Vicerrectoria de Calidad',
        password: 'admin123',
        roleId: roleMap['Vicerrectoria de Calidad']
      });

      console.log('Default users seeded successfully.');
    } else {
      console.log('Users table already contains data. Skipping seeding.');
    }

    // 3. Seed Plantillas (findOrCreate to support incremental updates)
    let plantillaMap = {};
    const plantillasToSeed = [
      { 
        name: 'Educación Continua', 
        description: 'Plantilla para carga de programas de educación continua', 
        roleId: roleMap['Educación Continua'],
        archivoData: null,
        archivoNombre: null
      },
      { 
        name: 'Vinculación Con El Medio', 
        description: 'Plantilla para carga de convenios, actividades y articulaciones de VCM', 
        roleId: roleMap['Dirección de Vinculación con el Medio'] || roleMap['Vinculación Con El Medio'],
        archivoData: null,
        archivoNombre: null
      },
      { 
        name: 'Innovación', 
        description: 'Plantilla para carga de proyectos y financiamiento de innovación', 
        roleId: roleMap['Dirección de Desarrollo e Innovación'] || roleMap['Innovación'],
        archivoData: null,
        archivoNombre: null
      }
    ];

    for (const data of plantillasToSeed) {
      const [created] = await Plantilla.findOrCreate({
        where: { name: data.name },
        defaults: data
      });
      plantillaMap[data.name] = created.id;
    }
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
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Tasa Aprobación', columna_excel: 'Tasa Aprobación', hoja_origen: 'Base Programas', tabla_destino: 'ResultadosPrograma', columna_destino: 'tasaAprobacion', tipo_dato: 'string', requerido: false, orden_insercion: 2 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Estado',     columna_excel: 'Estado',     hoja_origen: 'Base Programas', tabla_destino: 'ResultadosPrograma', columna_destino: 'estado',          tipo_dato: 'string', requerido: false, orden_insercion: 2 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Ejecutado',  columna_excel: 'Ejecutado',  hoja_origen: 'Base Programas', tabla_destino: 'ResultadosPrograma', columna_destino: 'ejecutado',       tipo_dato: 'string', requerido: false, orden_insercion: 2 },

      // EDUCACIÓN CONTINUA - ORDEN 2 — Hoja Base Programas → EstadoFinancieroPrograma
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'ID Programa',        columna_excel: 'ID Programa',        hoja_origen: 'Base Programas',       tabla_destino: 'EstadoFinancieroPrograma', columna_destino: 'idPrograma',       tipo_dato: 'string', requerido: true,  orden_insercion: 2, campo_lookup_tabla: 'Programa', campo_lookup_columna_db: 'idPrograma', campo_lookup_retorno: 'idPrograma' },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Valor Lista CLP',    columna_excel: 'Valor Lista CLP',    hoja_origen: 'Base Programas',       tabla_destino: 'EstadoFinancieroPrograma', columna_destino: 'valorListaCLP',     tipo_dato: 'string', requerido: false, orden_insercion: 2 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Descuento Promedio', columna_excel: 'Descuento Promedio', hoja_origen: 'Base Programas',       tabla_destino: 'EstadoFinancieroPrograma', columna_destino: 'descuentoPromedio', tipo_dato: 'string', requerido: false, orden_insercion: 2 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Ingresos Brutos CLP',columna_excel: 'Ingresos Brutos CLP', hoja_origen: 'Base Programas',       tabla_destino: 'EstadoFinancieroPrograma', columna_destino: 'ingresosBrutosCLP', tipo_dato: 'string', requerido: false, orden_insercion: 2 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Ingresos Netos CLP', columna_excel: 'Ingresos Netos CLP', hoja_origen: 'Base Programas',       tabla_destino: 'EstadoFinancieroPrograma', columna_destino: 'ingresosNetosCLP',  tipo_dato: 'string', requerido: false, orden_insercion: 2 },

      // EDUCACIÓN CONTINUA - ORDEN 2 — Hoja Participantes Detalle → MatriculaPrograma
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'ID Inscripción',     columna_excel: 'ID Inscripción',     hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'idInscripcion',      tipo_dato: 'string', requerido: true,  orden_insercion: 2 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'ID Programa',        columna_excel: 'ID Programa',        hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'idPrograma',          tipo_dato: 'string', requerido: true,  orden_insercion: 2, campo_lookup_tabla: 'Programa', campo_lookup_columna_db: 'idPrograma', campo_lookup_retorno: 'idPrograma' },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'ID Participante',    columna_excel: 'ID Participante',    hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'idParticipante',      tipo_dato: 'string', requerido: true,  orden_insercion: 2, campo_lookup_tabla: 'AlumnoExterno', campo_lookup_columna_db: 'idParticipante', campo_lookup_retorno: 'idParticipante' },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Nombre Completo',     columna_excel: 'Nombre Completo',     hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'nombreCompleto',      tipo_dato: 'string', requerido: false, orden_insercion: 2 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Edad',               columna_excel: 'Edad',               hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'edadAlumno',          tipo_dato: 'number', requerido: false, orden_insercion: 2 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Rango Edad',         columna_excel: 'Rango Edad',         hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'rangoEdadAlumno',     tipo_dato: 'string', requerido: false, orden_insercion: 2 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'N° cursos del participant', columna_excel: 'N° cursos del participante', hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'nCursos',      tipo_dato: 'number', requerido: false, orden_insercion: 2 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'ID Participante',   columna_excel: 'ID Participante',   hoja_origen: 'Participantes Detalle', tabla_destino: 'AlumnoExterno', columna_destino: 'idParticipante',     tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'RUT',               columna_excel: 'RUT',               hoja_origen: 'Participantes Detalle', tabla_destino: 'AlumnoExterno', columna_destino: 'rut',                tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Nombre',            columna_excel: 'Nombre',            hoja_origen: 'Participantes Detalle', tabla_destino: 'AlumnoExterno', columna_destino: 'nombre',             tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Sexo',              columna_excel: 'Sexo',              hoja_origen: 'Participantes Detalle', tabla_destino: 'AlumnoExterno', columna_destino: 'sexo',               tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Fecha nacimiento',  columna_excel: 'Fecha nacimiento',  hoja_origen: 'Participantes Detalle', tabla_destino: 'AlumnoExterno', columna_destino: 'fechaNacimiento',    tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Email',             columna_excel: 'Email',             hoja_origen: 'Participantes Detalle', tabla_destino: 'AlumnoExterno', columna_destino: 'email',              tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Teléfono',          columna_excel: 'Teléfono',          hoja_origen: 'Participantes Detalle', tabla_destino: 'AlumnoExterno', columna_destino: 'telefono',           tipo_dato: 'string', requerido: false, orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Región',            columna_excel: 'Región',            hoja_origen: 'Participantes Detalle', tabla_destino: 'AlumnoExterno', columna_destino: 'region',             tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Comuna',            columna_excel: 'Comuna',            hoja_origen: 'Participantes Detalle', tabla_destino: 'AlumnoExterno', columna_destino: 'comuna',             tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Nivel de estudio',  columna_excel: 'Nivel de estudio',  hoja_origen: 'Participantes Detalle', tabla_destino: 'AlumnoExterno', columna_destino: 'nivelDeEstudio',     tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Profesión / Ocupación', columna_excel: 'Profesión / Ocupación', hoja_origen: 'Participantes Detalle', tabla_destino: 'AlumnoExterno', columna_destino: 'profesionUOcupacion', tipo_dato: 'string', requerido: true, orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Tipo participante', columna_excel: 'Tipo participante', hoja_origen: 'Participantes Detalle', tabla_destino: 'AlumnoExterno', columna_destino: 'tipoParticipante',   tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Empresa / Institución', columna_excel: 'Empresa / Institución', hoja_origen: 'Participantes Detalle', tabla_destino: 'AlumnoExterno', columna_destino: 'empresaOInstitucion', tipo_dato: 'string', requerido: false, orden_insercion: 1 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Sector económico',  columna_excel: 'Sector económico',  hoja_origen: 'Participantes Detalle', tabla_destino: 'AlumnoExterno', columna_destino: 'sectorEconomico',    tipo_dato: 'string', requerido: false, orden_insercion: 1 },

      // EDUCACIÓN CONTINUA - ORDEN 2 — Hoja Participantes Detalle → MatriculaPrograma (lookup: Programa, AlumnoExterno)
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'ID Inscripción',   columna_excel: 'ID Inscripción',   hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'idInscripcion',     tipo_dato: 'string', requerido: true,  orden_insercion: 2 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'ID Programa',      columna_excel: 'ID Programa',      hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'idPrograma',        tipo_dato: 'string', requerido: true,  orden_insercion: 2, campo_lookup_tabla: 'Programa', campo_lookup_columna_db: 'idPrograma', campo_lookup_retorno: 'idPrograma' },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'ID Participante',  columna_excel: 'ID Participante',  hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'idParticipante',    tipo_dato: 'string', requerido: true,  orden_insercion: 2, campo_lookup_tabla: 'AlumnoExterno', campo_lookup_columna_db: 'idParticipante', campo_lookup_retorno: 'idParticipante' },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Año',               columna_excel: 'Año',               hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'anio',              tipo_dato: 'number', requerido: true,  orden_insercion: 2 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Semestre',          columna_excel: 'Semestre',          hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'semestre',          tipo_dato: 'string', requerido: true,  orden_insercion: 2 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Edad alumno',       columna_excel: 'Edad al momento de la matrícula', hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'edadAlumno', tipo_dato: 'number', requerido: true, orden_insercion: 2 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Rango de edad',     columna_excel: 'Rango de edad',     hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'rangoEdadAlumno',  tipo_dato: 'string', requerido: true,  orden_insercion: 2 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'N° Cursos alumno',  columna_excel: 'N° cursos alumno',  hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'nCursos',          tipo_dato: 'number', requerido: true,  orden_insercion: 2 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Tiene más cursos',  columna_excel: 'Tiene más cursos',  hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'tieneMasCursos',   tipo_dato: 'string', requerido: true,  orden_insercion: 2 },

      // EDUCACIÓN CONTINUA - ORDEN 3 — Hoja Participantes Detalle → EstadoMatricula (lookup: MatriculaPrograma)
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'ID Inscripción',   columna_excel: 'ID Inscripción',   hoja_origen: 'Participantes Detalle', tabla_destino: 'EstadoMatricula', columna_destino: 'idInscripcion',       tipo_dato: 'string', requerido: true,  orden_insercion: 3, campo_lookup_tabla: 'MatriculaPrograma', campo_lookup_columna_db: 'idInscripcion', campo_lookup_retorno: 'idInscripcion' },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Estado académico', columna_excel: 'Estado académico', hoja_origen: 'Participantes Detalle', tabla_destino: 'EstadoMatricula', columna_destino: 'estadoAcademico',   tipo_dato: 'string', requerido: true,  orden_insercion: 3 },
      { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Aprobó',           columna_excel: 'Aprobó',           hoja_origen: 'Participantes Detalle', tabla_destino: 'EstadoMatricula', columna_destino: 'aprobo',            tipo_dato: 'string', requerido: true,  orden_insercion: 3 },
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

      // ═══════════════════════════════════════════════════════
      // INNOVACIÓN - ORDEN 1 — Hoja Proyectos → Proyecto
      // ═══════════════════════════════════════════════════════
      { plantillaId: plantillaMap['Innovación'], nombre_campo: 'ID Proyecto',           columna_excel: 'ID Proyecto',           hoja_origen: 'Proyectos', tabla_destino: 'Proyecto', columna_destino: 'idProyecto',          tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Innovación'], nombre_campo: 'Nombre Proyecto',       columna_excel: 'Nombre proyecto',       hoja_origen: 'Proyectos', tabla_destino: 'Proyecto', columna_destino: 'nombreProyecto',      tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Innovación'], nombre_campo: 'Área Temática',         columna_excel: 'Área temática',         hoja_origen: 'Proyectos', tabla_destino: 'Proyecto', columna_destino: 'areaTematica',        tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Innovación'], nombre_campo: 'Curso / Línea',         columna_excel: 'Curso / línea',         hoja_origen: 'Proyectos', tabla_destino: 'Proyecto', columna_destino: 'cursoLinea',          tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Innovación'], nombre_campo: 'Estado',                columna_excel: 'Estado',                hoja_origen: 'Proyectos', tabla_destino: 'Proyecto', columna_destino: 'estado',              tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Innovación'], nombre_campo: 'Unidad Responsable',    columna_excel: 'Unidad responsable',    hoja_origen: 'Proyectos', tabla_destino: 'Proyecto', columna_destino: 'unidadResponsable',   tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Innovación'], nombre_campo: 'Responsable Docente',   columna_excel: 'Responsable docente',   hoja_origen: 'Proyectos', tabla_destino: 'Proyecto', columna_destino: 'responsableDocente',  tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Innovación'], nombre_campo: 'Socio / Contraparte',   columna_excel: 'Socio / contraparte',   hoja_origen: 'Proyectos', tabla_destino: 'Proyecto', columna_destino: 'socioContraparte',    tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Innovación'], nombre_campo: 'Año Inicio',            columna_excel: 'Año inicio',            hoja_origen: 'Proyectos', tabla_destino: 'Proyecto', columna_destino: 'anioInicio',         tipo_dato: 'number', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Innovación'], nombre_campo: 'Año Término',           columna_excel: 'Año término',           hoja_origen: 'Proyectos', tabla_destino: 'Proyecto', columna_destino: 'anioTermino',        tipo_dato: 'number', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Innovación'], nombre_campo: 'Semestre Inicio',       columna_excel: 'Semestre inicio',       hoja_origen: 'Proyectos', tabla_destino: 'Proyecto', columna_destino: 'semestreInicio',      tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Innovación'], nombre_campo: 'Fecha Inicio',          columna_excel: 'Fecha inicio',          hoja_origen: 'Proyectos', tabla_destino: 'Proyecto', columna_destino: 'fechaInicio',         tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Innovación'], nombre_campo: 'Fecha Cierre Estimada', columna_excel: 'Fecha cierre estimada', hoja_origen: 'Proyectos', tabla_destino: 'Proyecto', columna_destino: 'fechaCierreEstimada', tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Innovación'], nombre_campo: 'Tipo Proyecto',        columna_excel: 'Tipo proyecto',        hoja_origen: 'Proyectos', tabla_destino: 'Proyecto', columna_destino: 'tipoProyecto',        tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Innovación'], nombre_campo: 'Resultado Principal',  columna_excel: 'Resultado principal',  hoja_origen: 'Proyectos', tabla_destino: 'Proyecto', columna_destino: 'resultadoPrincipal',  tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Innovación'], nombre_campo: 'N° Estudiantes',        columna_excel: 'N° estudiantes',        hoja_origen: 'Proyectos', tabla_destino: 'Proyecto', columna_destino: 'nEstudiantes',        tipo_dato: 'number', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Innovación'], nombre_campo: 'N° Funcionarios',       columna_excel: 'N° funcionarios',       hoja_origen: 'Proyectos', tabla_destino: 'Proyecto', columna_destino: 'nFuncionarios',       tipo_dato: 'number', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Innovación'], nombre_campo: 'N° Docentes',           columna_excel: 'N° docentes',           hoja_origen: 'Proyectos', tabla_destino: 'Proyecto', columna_destino: 'nDocentes',           tipo_dato: 'number', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Innovación'], nombre_campo: 'Evidencia Principal',   columna_excel: 'Evidencia principal',   hoja_origen: 'Proyectos', tabla_destino: 'Proyecto', columna_destino: 'evidenciaPrincipal',  tipo_dato: 'string', requerido: true,  orden_insercion: 1 },
      { plantillaId: plantillaMap['Innovación'], nombre_campo: 'Observación',            columna_excel: 'Observación',            hoja_origen: 'Proyectos', tabla_destino: 'Proyecto', columna_destino: 'observacion',         tipo_dato: 'string', requerido: true,  orden_insercion: 1 },

      // INNOVACIÓN - ORDEN 2 — Hoja Financiamiento → Financiamiento (lookup: Proyecto)
      { plantillaId: plantillaMap['Innovación'], nombre_campo: 'ID Proyecto',           columna_excel: 'ID Proyecto',           hoja_origen: 'Financiamiento', tabla_destino: 'Financiamiento', columna_destino: 'idProyecto',          tipo_dato: 'string', requerido: true,  orden_insercion: 2, campo_lookup_tabla: 'Proyecto', campo_lookup_columna_db: 'idProyecto', campo_lookup_retorno: 'idProyecto' },
      { plantillaId: plantillaMap['Innovación'], nombre_campo: 'Nombre Proyecto',       columna_excel: 'Nombre proyecto',       hoja_origen: 'Financiamiento', tabla_destino: 'Financiamiento', columna_destino: 'nombreProyecto',      tipo_dato: 'string', requerido: true,  orden_insercion: 2 },
      { plantillaId: plantillaMap['Innovación'], nombre_campo: 'Monto Adjudicado',      columna_excel: 'Monto adjudicado',      hoja_origen: 'Financiamiento', tabla_destino: 'Financiamiento', columna_destino: 'montoAdjudicado',     tipo_dato: 'number', requerido: true,  orden_insercion: 2 },
      { plantillaId: plantillaMap['Innovación'], nombre_campo: 'Monto Ejecutado Estimado', columna_excel: 'Monto ejecutado estimado', hoja_origen: 'Financiamiento', tabla_destino: 'Financiamiento', columna_destino: 'montoEjecutadoEstimado', tipo_dato: 'number', requerido: true, orden_insercion: 2 },
      { plantillaId: plantillaMap['Innovación'], nombre_campo: 'Estado Financiero',    columna_excel: 'Estado financiero',    hoja_origen: 'Financiamiento', tabla_destino: 'Financiamiento', columna_destino: 'estadoFinanciero',     tipo_dato: 'string', requerido: true,  orden_insercion: 2 },
      { plantillaId: plantillaMap['Innovación'], nombre_campo: 'Financiamiento Externo',columna_excel: 'Financiamiento externo',hoja_origen: 'Financiamiento', tabla_destino: 'Financiamiento', columna_destino: 'financiamientoExterno', tipo_dato: 'string', requerido: true,  orden_insercion: 2 },
      { plantillaId: plantillaMap['Innovación'], nombre_campo: 'Fuente Financiamiento', columna_excel: 'Fuente financiamiento', hoja_origen: 'Financiamiento', tabla_destino: 'Financiamiento', columna_destino: 'fuenteFinanciamiento',  tipo_dato: 'string', requerido: true,  orden_insercion: 2 },
      { plantillaId: plantillaMap['Innovación'], nombre_campo: 'Observación',            columna_excel: 'Observación',            hoja_origen: 'Financiamiento', tabla_destino: 'Financiamiento', columna_destino: 'observacion',         tipo_dato: 'string', requerido: true,  orden_insercion: 2 }
    ];

    for (const data of camposToSeed) {
      if (!data.plantillaId) continue;
      await CampoPlantilla.findOrCreate({
        where: { 
          plantillaId: data.plantillaId, 
          nombre_campo: data.nombre_campo, 
          hoja_origen: data.hoja_origen,
          tabla_destino: data.tabla_destino,
          columna_destino: data.columna_destino
        },
        defaults: data
      });
    }
    console.log('Campos plantilla ensured in database.');

    // Auto-generar y guardar el binario Excel para plantillas sin archivoData
    const XLSX = require('xlsx');
    for (const [plantillaName, plantillaId] of Object.entries(plantillaMap)) {
      const p = await Plantilla.findByPk(plantillaId);
      if (p && !p.archivoData) {
        const camposDePlantilla = camposToSeed.filter(c => c.plantillaId === plantillaId);
        if (camposDePlantilla.length > 0) {
          const wb = XLSX.utils.book_new();
          const sheets = {};
          for (const c of camposDePlantilla) {
            if (!sheets[c.hoja_origen]) {
              sheets[c.hoja_origen] = [];
            }
            if (!sheets[c.hoja_origen].includes(c.columna_excel)) {
              sheets[c.hoja_origen].push(c.columna_excel);
            }
          }
          for (const [sheetName, headers] of Object.entries(sheets)) {
            const ws = XLSX.utils.aoa_to_sheet([headers]);
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
          }
          const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
          const fileName = `Plantilla_${plantillaName.replace(/\s+/g, '_')}.xlsx`;
          await p.update({
            archivoData: buffer,
            archivoNombre: fileName
          });
          console.log(`Plantilla binaria generada para ${plantillaName}.`);
        }
      }
    }

    // 5. Seed transactional mock data (removed - user will upload/test)
    console.log('Skipping transactional mock data seeding.');
  } catch (error) {
    console.error('Error seeding database:', error);
  }
}

module.exports = { seedDatabase };
