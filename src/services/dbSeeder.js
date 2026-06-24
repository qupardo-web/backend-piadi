const { User, Role, Plantilla, CampoPlantilla } = require('../models');

async function seedDatabase() {
  try {
    // 1. Seed Roles first
    const roleCount = await Role.count();
    let roleMap = {};

    if (roleCount === 0) {
      console.log('No roles found in database. Seeding default roles...');
      
      const rolesToSeed = [
        { name: 'Director Académico', group: 'Direccion', description: 'Dirección académica general' },
        { name: 'Director de Administración', group: 'Direccion', description: 'Dirección de administración y finanzas' },
        { name: 'Rector', group: 'Rectoria', description: 'Máxima autoridad institucional' },
        { name: 'Analista de Calidad', group: 'Calidad', description: 'Aseguramiento interno de calidad' }
      ];

      for (const roleData of rolesToSeed) {
        const createdRole = await Role.create(roleData);
        roleMap[roleData.name] = createdRole.id;
      }
      console.log('Roles seeded successfully.');
    } else {
      console.log('Roles table already contains data. Fetching roles map...');
      const existingRoles = await Role.findAll();
      existingRoles.forEach(r => {
        roleMap[r.name] = r.id;
      });
    }

    // 2. Seed Users
    const userCount = await User.count();
    if (userCount === 0) {
      console.log('No users found in database. Seeding default users...');

      // Seed 1: Ezequiel Araya (Director Académico - group: Direccion)
      await User.create({
        email: 'director.educacion@ecas.cl',
        username: 'director.educacion@ecas.cl',
        name: 'Ezequiel Araya',
        password: 'admin123',
        roleId: roleMap['Director Académico']
      });

      // Seed 2: Rector (group: Rectoria)
      await User.create({
        email: 'rectoria@ecas.cl',
        username: 'rectoria@ecas.cl',
        name: 'Rectoría ECAS',
        password: 'admin123',
        roleId: roleMap['Rector']
      });

      // Seed 3: Analista de Calidad (group: Calidad)
      await User.create({
        email: 'calidad@ecas.cl',
        username: 'calidad@ecas.cl',
        name: 'Aseguramiento de Calidad',
        password: 'admin123',
        roleId: roleMap['Analista de Calidad']
      });

      // Seed 4: Admin (generic username fallback for testing - mapping to Director de Administración)
      await User.create({
        email: 'admin@ecas.cl',
        username: 'admin',
        name: 'Administrador Demo',
        password: 'admin123',
        roleId: roleMap['Director de Administración']
      });

      console.log('Default users seeded successfully.');
    } else {
      console.log('Users table already contains data. Skipping seeding.');
    }

    // 3. Seed Plantillas
    const plantillaCount = await Plantilla.count();
    let plantillaMap = {};

    if (plantillaCount === 0) {
      console.log('No plantillas found. Seeding default plantillas...');

      const plantillasToSeed = [
        { 
          name: 'Educación Continua', 
          description: 'Plantilla para carga de programas de educación continua', 
          roleId: roleMap['Director Académico'],
          archivoData: null,
          archivoNombre: null
        }
      ];

      for (const data of plantillasToSeed) {
        const created = await Plantilla.create(data);
        plantillaMap[data.name] = created.id;
      }
      console.log('Plantillas seeded successfully.');
    } else {
      console.log('Plantillas table already contains data. Skipping seeding.');
    }

    // 4. Seed CamposPlantilla
    const campoCount = await CampoPlantilla.count();
    if (campoCount === 0) {
      console.log('No campos plantilla found. Seeding default campos...');

      const camposToSeed = [
        // ═══════════════════════════════════════════════════════
        // ORDEN 1 — Hoja Base Programas → Programa
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

        // ═══════════════════════════════════════════════════════
        // ORDEN 1 — Hoja Participantes Detalle → AlumnoExterno
        // ═══════════════════════════════════════════════════════
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
        // ═══════════════════════════════════════════════════════
        // ORDEN 2 — Hoja Base Programas → ResultadosPrograma (lookup: Programa.idPrograma)
        // ═══════════════════════════════════════════════════════
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'ID Programa', columna_excel: 'ID Programa', hoja_origen: 'Base Programas', tabla_destino: 'ResultadosPrograma', columna_destino: 'idPrograma', tipo_dato: 'string', requerido: true, orden_insercion: 2, campo_lookup_tabla: 'Programa', campo_lookup_columna_db: 'idPrograma', campo_lookup_retorno: 'idPrograma' },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Matrícula',  columna_excel: 'Matrícula',  hoja_origen: 'Base Programas', tabla_destino: 'ResultadosPrograma', columna_destino: 'matricula',      tipo_dato: 'number', requerido: false, orden_insercion: 2 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Aprobados',  columna_excel: 'Aprobados',  hoja_origen: 'Base Programas', tabla_destino: 'ResultadosPrograma', columna_destino: 'aprobados',      tipo_dato: 'number', requerido: false, orden_insercion: 2 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Reprobados', columna_excel: 'Reprobados', hoja_origen: 'Base Programas', tabla_destino: 'ResultadosPrograma', columna_destino: 'reprobados',     tipo_dato: 'number', requerido: false, orden_insercion: 2 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Tasa Aprobación', columna_excel: 'Tasa Aprobación', hoja_origen: 'Base Programas', tabla_destino: 'ResultadosPrograma', columna_destino: 'tasaAprobacion', tipo_dato: 'string', requerido: false, orden_insercion: 2 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Estado',     columna_excel: 'Estado',     hoja_origen: 'Base Programas', tabla_destino: 'ResultadosPrograma', columna_destino: 'estado',          tipo_dato: 'string', requerido: false, orden_insercion: 2 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Ejecutado',  columna_excel: 'Ejecutado',  hoja_origen: 'Base Programas', tabla_destino: 'ResultadosPrograma', columna_destino: 'ejecutado',       tipo_dato: 'string', requerido: false, orden_insercion: 2 },

        // ═══════════════════════════════════════════════════════
        // ORDEN 2 — Hoja Base Programas → EstadoFinancieroPrograma (lookup: Programa.idPrograma)
        // ═══════════════════════════════════════════════════════
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'ID Programa',        columna_excel: 'ID Programa',        hoja_origen: 'Base Programas',       tabla_destino: 'EstadoFinancieroPrograma', columna_destino: 'idPrograma',       tipo_dato: 'string', requerido: true,  orden_insercion: 2, campo_lookup_tabla: 'Programa', campo_lookup_columna_db: 'idPrograma', campo_lookup_retorno: 'idPrograma' },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Valor Lista CLP',    columna_excel: 'Valor Lista CLP',    hoja_origen: 'Base Programas',       tabla_destino: 'EstadoFinancieroPrograma', columna_destino: 'valorListaCLP',     tipo_dato: 'string', requerido: false, orden_insercion: 2 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Descuento Promedio', columna_excel: 'Descuento Promedio', hoja_origen: 'Base Programas',       tabla_destino: 'EstadoFinancieroPrograma', columna_destino: 'descuentoPromedio', tipo_dato: 'string', requerido: false, orden_insercion: 2 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Ingresos Brutos CLP',columna_excel: 'Ingresos Brutos CLP', hoja_origen: 'Base Programas',       tabla_destino: 'EstadoFinancieroPrograma', columna_destino: 'ingresosBrutosCLP', tipo_dato: 'string', requerido: false, orden_insercion: 2 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Ingresos Netos CLP', columna_excel: 'Ingresos Netos CLP', hoja_origen: 'Base Programas',       tabla_destino: 'EstadoFinancieroPrograma', columna_destino: 'ingresosNetosCLP',  tipo_dato: 'string', requerido: false, orden_insercion: 2 },

        // ═══════════════════════════════════════════════════════
        // ORDEN 2 — Hoja Participantes Detalle → MatriculaPrograma
        //   (lookups: Programa.idPrograma, AlumnoExterno.idParticipante)
        // ═══════════════════════════════════════════════════════
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'ID Inscripción',     columna_excel: 'ID Inscripción',     hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'idInscripcion',      tipo_dato: 'string', requerido: true,  orden_insercion: 2 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'ID Programa',        columna_excel: 'ID Programa',        hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'idPrograma',          tipo_dato: 'string', requerido: true,  orden_insercion: 2, campo_lookup_tabla: 'Programa', campo_lookup_columna_db: 'idPrograma', campo_lookup_retorno: 'idPrograma' },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'ID Participante',    columna_excel: 'ID Participante',    hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'idParticipante',      tipo_dato: 'string', requerido: true,  orden_insercion: 2, campo_lookup_tabla: 'AlumnoExterno', campo_lookup_columna_db: 'idParticipante', campo_lookup_retorno: 'idParticipante' },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Nombre Completo',     columna_excel: 'Nombre Completo',     hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'nombreCompleto',      tipo_dato: 'string', requerido: false, orden_insercion: 2 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Edad',               columna_excel: 'Edad',               hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'edadAlumno',          tipo_dato: 'number', requerido: false, orden_insercion: 2 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Rango Edad',         columna_excel: 'Rango Edad',         hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'rangoEdadAlumno',     tipo_dato: 'string', requerido: false, orden_insercion: 2 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'N° cursos del participante', columna_excel: 'N° cursos del participante', hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'nCursos',      tipo_dato: 'number', requerido: false, orden_insercion: 2 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Tiene más cursos',    columna_excel: 'Tiene más cursos',    hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'tieneMasCursos',     tipo_dato: 'string', requerido: false, orden_insercion: 2 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Año',                columna_excel: 'Año',                hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'anio',               tipo_dato: 'number', requerido: true,  orden_insercion: 2 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Semestre',           columna_excel: 'Semestre',           hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'semestre',           tipo_dato: 'string', requerido: true,  orden_insercion: 2 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Mes inicio',         columna_excel: 'Mes inicio',         hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'mesInicio',          tipo_dato: 'string', requerido: false, orden_insercion: 2 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Fecha matrícula',    columna_excel: 'Fecha matrícula',    hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'fechaMatricula',     tipo_dato: 'string', requerido: false, orden_insercion: 2 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Valor lista CLP',    columna_excel: 'Valor lista CLP',    hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'valorListaCLP',      tipo_dato: 'string', requerido: false, orden_insercion: 2 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Descuento aplicado', columna_excel: 'Descuento aplicado', hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'descuentoAplicado',  tipo_dato: 'string', requerido: false, orden_insercion: 2 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Monto pagado CLP',   columna_excel: 'Monto pagado CLP',   hoja_origen: 'Participantes Detalle', tabla_destino: 'MatriculaPrograma', columna_destino: 'montoPagadoCLP',    tipo_dato: 'string', requerido: false, orden_insercion: 2 },

        // ═══════════════════════════════════════════════════════
        // ORDEN 3 — Hoja Participantes Detalle → EstadoMatricula
        //   (lookup: MatriculaPrograma.idInscripcion)
        // ═══════════════════════════════════════════════════════
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'ID Inscripción',   columna_excel: 'ID Inscripción',   hoja_origen: 'Participantes Detalle', tabla_destino: 'EstadoMatricula', columna_destino: 'idInscripcion',    tipo_dato: 'string', requerido: true,  orden_insercion: 3, campo_lookup_tabla: 'MatriculaPrograma', campo_lookup_columna_db: 'idInscripcion', campo_lookup_retorno: 'idInscripcion' },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Estado académico', columna_excel: 'Estado académico', hoja_origen: 'Participantes Detalle', tabla_destino: 'EstadoMatricula', columna_destino: 'estadoAcademico',  tipo_dato: 'string', requerido: false, orden_insercion: 3 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Aprobó',           columna_excel: 'Aprobó',           hoja_origen: 'Participantes Detalle', tabla_destino: 'EstadoMatricula', columna_destino: 'aprobo',            tipo_dato: 'string', requerido: false, orden_insercion: 3 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Nota final',       columna_excel: 'Nota final',       hoja_origen: 'Participantes Detalle', tabla_destino: 'EstadoMatricula', columna_destino: 'notaFinal',         tipo_dato: 'string', requerido: false, orden_insercion: 3 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Asistencia %',     columna_excel: 'Asistencia %',     hoja_origen: 'Participantes Detalle', tabla_destino: 'EstadoMatricula', columna_destino: 'asistencia',        tipo_dato: 'string', requerido: false, orden_insercion: 3 },
      ];

      for (const data of camposToSeed) {
        await CampoPlantilla.create(data);
      }
      console.log('Campos plantilla seeded successfully.');
    } else {
      console.log('Campos plantilla table already contains data. Skipping seeding.');
    }
  } catch (error) {
    console.error('Error seeding database:', error);
  }
}

module.exports = { seedDatabase };
