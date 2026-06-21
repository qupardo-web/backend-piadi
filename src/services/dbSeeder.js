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
        { name: 'Educación Continua', description: 'Plantilla para carga de programas de educación continua', roleId: roleMap['Director Académico'] }
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
        // ── Hoja BaseProgramas → tabla programas ──
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'ID Programa', columna_excel: 'ID Programa', hoja_origen: 'Base Programas', tabla_destino: 'programas', columna_destino: 'codigo', tipo_dato: 'string', requerido: true, orden_insercion: 1 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Año', columna_excel: 'Año', hoja_origen: 'Base Programas', tabla_destino: 'programas', columna_destino: 'anio', tipo_dato: 'number', requerido: true, orden_insercion: 1 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Semestre', columna_excel: 'Semestre', hoja_origen: 'Base Programas', tabla_destino: 'programas', columna_destino: 'semestre', tipo_dato: 'number', requerido: true, orden_insercion: 1 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Mes Inicio', columna_excel: 'Mes Inicio', hoja_origen: 'Base Programas', tabla_destino: 'programas', columna_destino: 'mes_inicio', tipo_dato: 'string', requerido: false, orden_insercion: 1 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Área', columna_excel: 'Área', hoja_origen: 'Base Programas', tabla_destino: 'programas', columna_destino: 'area', tipo_dato: 'string', requerido: true, orden_insercion: 1 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Programa', columna_excel: 'Programa', hoja_origen: 'Base Programas', tabla_destino: 'programas', columna_destino: 'nombre', tipo_dato: 'string', requerido: true, orden_insercion: 1 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Tipo', columna_excel: 'Tipo', hoja_origen: 'Base Programas', tabla_destino: 'programas', columna_destino: 'tipo', tipo_dato: 'string', requerido: true, orden_insercion: 1 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Modalidad', columna_excel: 'Modalidad', hoja_origen: 'Base Programas', tabla_destino: 'programas', columna_destino: 'modalidad', tipo_dato: 'string', requerido: true, orden_insercion: 1 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Horas', columna_excel: 'Horas', hoja_origen: 'Base Programas', tabla_destino: 'programas', columna_destino: 'horas', tipo_dato: 'number', requerido: true, orden_insercion: 1 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Cupos Programados', columna_excel: 'Cupos Programados', hoja_origen: 'Base Programas', tabla_destino: 'programas', columna_destino: 'cupos_programados', tipo_dato: 'number', requerido: true, orden_insercion: 1 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Estado', columna_excel: 'Estado', hoja_origen: 'Base Programas', tabla_destino: 'programas', columna_destino: 'estado', tipo_dato: 'string', requerido: true, orden_insercion: 1 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Ejecutado', columna_excel: 'Ejecutado', hoja_origen: 'Base Programas', tabla_destino: 'programas', columna_destino: 'ejecutado', tipo_dato: 'boolean', requerido: false, orden_insercion: 1 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Sector Principal', columna_excel: 'Sector Principal', hoja_origen: 'Base Programas', tabla_destino: 'programas', columna_destino: 'sector_principal', tipo_dato: 'string', requerido: false, orden_insercion: 1 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Región Principal', columna_excel: 'Región Principal', hoja_origen: 'Base Programas', tabla_destino: 'programas', columna_destino: 'region_principal', tipo_dato: 'string', requerido: false, orden_insercion: 1 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Empresa/Convenio', columna_excel: 'Empresa/Convenio', hoja_origen: 'Base Programas', tabla_destino: 'programas', columna_destino: 'empresa_convenio', tipo_dato: 'string', requerido: false, orden_insercion: 1 },

        // ── Hoja BaseProgramas → tabla resultados_programa (con lookup por codigo) ──
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'ID Programa', columna_excel: 'ID Programa', hoja_origen: 'Base Programas', tabla_destino: 'resultados_programa', columna_destino: 'programaId', tipo_dato: 'string', requerido: true, orden_insercion: 2, campo_lookup_tabla: 'programas', campo_lookup_columna_db: 'codigo', campo_lookup_retorno: 'id' },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Matrícula', columna_excel: 'Matrícula', hoja_origen: 'Base Programas', tabla_destino: 'resultados_programa', columna_destino: 'matricula', tipo_dato: 'number', requerido: false, orden_insercion: 2 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Aprobados', columna_excel: 'Aprobados', hoja_origen: 'Base Programas', tabla_destino: 'resultados_programa', columna_destino: 'aprobados', tipo_dato: 'number', requerido: false, orden_insercion: 2 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Reprobados', columna_excel: 'Reprobados', hoja_origen: 'Base Programas', tabla_destino: 'resultados_programa', columna_destino: 'reprobados', tipo_dato: 'number', requerido: false, orden_insercion: 2 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Tasa Aprobación', columna_excel: 'Tasa Aprobación', hoja_origen: 'Base Programas', tabla_destino: 'resultados_programa', columna_destino: 'tasa_aprobacion', tipo_dato: 'number', requerido: false, orden_insercion: 2 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Estado', columna_excel: 'Estado', hoja_origen: 'Base Programas', tabla_destino: 'resultados_programa', columna_destino: 'estado', tipo_dato: 'string', requerido: false, orden_insercion: 2 },

        // ── Hoja BaseProgramas → tabla estado_financiero_programa (con lookup por codigo) ──
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'ID Programa', columna_excel: 'ID Programa', hoja_origen: 'Base Programas', tabla_destino: 'estado_financiero_programa', columna_destino: 'programaId', tipo_dato: 'string', requerido: true, orden_insercion: 2, campo_lookup_tabla: 'programas', campo_lookup_columna_db: 'codigo', campo_lookup_retorno: 'id' },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Valor Lista CLP', columna_excel: 'Valor Lista CLP', hoja_origen: 'Base Programas', tabla_destino: 'estado_financiero_programa', columna_destino: 'valor_lista_clp', tipo_dato: 'number', requerido: false, orden_insercion: 2 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Descuento Promedio', columna_excel: 'Descuento Promedio', hoja_origen: 'Base Programas', tabla_destino: 'estado_financiero_programa', columna_destino: 'descuento_promedio', tipo_dato: 'number', requerido: false, orden_insercion: 2 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Ingresos Brutos CLP', columna_excel: 'Ingresos Brutos CLP', hoja_origen: 'Base Programas', tabla_destino: 'estado_financiero_programa', columna_destino: 'ingresos_brutos_clp', tipo_dato: 'number', requerido: false, orden_insercion: 2 },
        { plantillaId: plantillaMap['Educación Continua'], nombre_campo: 'Ingresos Netos CLP', columna_excel: 'Ingresos Netos CLP', hoja_origen: 'Base Programas', tabla_destino: 'estado_financiero_programa', columna_destino: 'ingresos_netos_clp', tipo_dato: 'number', requerido: false, orden_insercion: 2 },
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
