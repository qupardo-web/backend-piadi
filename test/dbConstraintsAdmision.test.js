process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sequelize, Alumno, Asignatura, MatriculaPorAsignatura, CaracterizacionEstudiante } = require('../src/models');
const { initDbConstraints } = require('../src/services/dbConstraints');

test('PIADI-335: Restricciones de integridad, triggers y FKs para Admisión', async (t) => {
  // Inicializar constraints y triggers en PostgreSQL
  await initDbConstraints();

  const cleanDb = async () => {
    await MatriculaPorAsignatura.destroy({ where: {} });
    await CaracterizacionEstudiante.destroy({ where: {} });
    await Alumno.destroy({ where: {} });
    await Asignatura.destroy({ where: {} });
  };

  await cleanDb();

  await t.test('1. Permite insertar Alumno, Asignatura, Matricula y Caracterización válidos', async () => {
    await cleanDb();

    const alumno = await Alumno.create({
      codCli: 'CLI-TEST-001',
      rut: 18123456,
      digitoVerificador: '0',
      nombre: 'Juan',
      apellidoPat: 'Pérez',
      apellidoMat: 'González',
      mail: 'juan.perez@test.cl',
      fonoAct: '+56911223344'
    });
    assert.ok(alumno);
    assert.strictEqual(alumno.codCli, 'CLI-TEST-001');

    const asignatura = await Asignatura.create({
      ramoEquiv: 'CONT-101',
      nombre: 'Contabilidad I'
    });
    assert.ok(asignatura);
    assert.strictEqual(asignatura.ramoEquiv, 'CONT-101');

    const matricula = await MatriculaPorAsignatura.create({
      codCli: 'CLI-TEST-001',
      ramoEquiv: 'CONT-101',
      seccion: 1,
      anio: 2026,
      periodo: 1,
      estadoCad: 'Regular'
    });
    assert.ok(matricula);
    assert.strictEqual(matricula.codCli, 'CLI-TEST-001');

    const caracterizacion = await CaracterizacionEstudiante.create({
      rut: 18123456,
      dig: '0',
      sexo: 'Masculino',
      fechaNacimiento: '2000-05-15',
      region: 'Metropolitana',
      comuna: 'Santiago',
      tipoColegio: 'Particular Subvencionado',
      viaAcceso: 'PSU / PAES',
      nivelSocioeconomico: 'C3',
      situacionFamiliar: 'Vive con padres',
      beneficios: 'Gratuidad'
    });
    assert.ok(caracterizacion);
    assert.strictEqual(caracterizacion.rut, 18123456);
  });

  await t.test('2. Rechaza Alumno con RUT menor o igual a cero', async () => {
    await cleanDb();
    await assert.rejects(
      async () => {
        await sequelize.query(`
          INSERT INTO alumnos (
            "codCli", "rut", "digitoVerificador", "nombre", "apellidoPat", "apellidoMat", "createdAt", "updatedAt"
          ) VALUES (
            'CLI-RUT-NEG', -100, 'K', 'Carlos', 'Gomez', 'Silva', NOW(), NOW()
          );
        `);
      },
      (err) => {
        assert.ok(
          err.message.includes('chk_alumnos_rut') ||
          err.message.includes('positivo') ||
          err.message.includes('check constraint'),
          `Error esperado de RUT negativo pero se recibió: ${err.message}`
        );
        return true;
      }
    );
  });

  await t.test('3. Rechaza Alumno con dígito verificador inválido', async () => {
    await cleanDb();
    await assert.rejects(
      async () => {
        await sequelize.query(`
          INSERT INTO alumnos (
            "codCli", "rut", "digitoVerificador", "nombre", "apellidoPat", "apellidoMat", "createdAt", "updatedAt"
          ) VALUES (
            'CLI-DIG-INV', 19876543, 'Z', 'Carlos', 'Gomez', 'Silva', NOW(), NOW()
          );
        `);
      },
      (err) => {
        assert.ok(
          err.message.includes('chk_alumnos_dig') ||
          err.message.includes('digitoVerificador'),
          `Error esperado de dígito verificador inválido pero se recibió: ${err.message}`
        );
        return true;
      }
    );
  });

  await t.test('4. Rechaza Alumno con nombre o apellidos vacíos', async () => {
    await cleanDb();
    await assert.rejects(
      async () => {
        await sequelize.query(`
          INSERT INTO alumnos (
            "codCli", "rut", "digitoVerificador", "nombre", "apellidoPat", "apellidoMat", "createdAt", "updatedAt"
          ) VALUES (
            'CLI-NOM-EMPTY', 19876544, '1', '   ', 'Gomez', 'Silva', NOW(), NOW()
          );
        `);
      },
      (err) => {
        assert.ok(
          err.message.includes('chk_alumnos_nombres') ||
          err.message.includes('no pueden estar vacíos'),
          `Error esperado de nombre vacío pero se recibió: ${err.message}`
        );
        return true;
      }
    );
  });

  await t.test('5. Rechaza Matrícula para un estudiante inexistente (Violación FK / Trigger)', async () => {
    await cleanDb();
    await Asignatura.create({ ramoEquiv: 'MAT-101', nombre: 'Matemática I' });

    await assert.rejects(
      async () => {
        await sequelize.query(`
          INSERT INTO matriculas_por_asignatura (
            "codCli", "ramoEquiv", "seccion", "anio", "periodo", "estadoCad", "createdAt", "updatedAt"
          ) VALUES (
            'CLI-NO-EXISTE', 'MAT-101', 1, 2026, 1, 'Regular', NOW(), NOW()
          );
        `);
      },
      (err) => {
        assert.ok(
          err.message.includes('fk_matricula_alumnos') ||
          err.message.includes('no existe en la tabla alumnos') ||
          err.message.includes('foreign key constraint'),
          `Error esperado FK codCli pero se recibió: ${err.message}`
        );
        return true;
      }
    );
  });

  await t.test('6. Rechaza Matrícula para una asignatura inexistente (Violación FK / Trigger)', async () => {
    await cleanDb();
    await Alumno.create({
      codCli: 'CLI-OK-01',
      rut: 15444333,
      digitoVerificador: '2',
      nombre: 'María',
      apellidoPat: 'Soto',
      apellidoMat: 'Pardo'
    });

    await assert.rejects(
      async () => {
        await sequelize.query(`
          INSERT INTO matriculas_por_asignatura (
            "codCli", "ramoEquiv", "seccion", "anio", "periodo", "estadoCad", "createdAt", "updatedAt"
          ) VALUES (
            'CLI-OK-01', 'RAMO-FANTASMA', 1, 2026, 1, 'Regular', NOW(), NOW()
          );
        `);
      },
      (err) => {
        assert.ok(
          err.message.includes('fk_matricula_asignaturas') ||
          err.message.includes('no existe en la tabla asignaturas') ||
          err.message.includes('foreign key constraint'),
          `Error esperado FK ramoEquiv pero se recibió: ${err.message}`
        );
        return true;
      }
    );
  });

  await t.test('7. Rechaza Matrícula con sección menor a 1 o año fuera de rango', async () => {
    await cleanDb();
    await Alumno.create({
      codCli: 'CLI-OK-02',
      rut: 16555444,
      digitoVerificador: '3',
      nombre: 'Pedro',
      apellidoPat: 'Rios',
      apellidoMat: 'Lara'
    });
    await Asignatura.create({ ramoEquiv: 'AUD-201', nombre: 'Auditoría I' });

    // Sección 0
    await assert.rejects(
      async () => {
        await sequelize.query(`
          INSERT INTO matriculas_por_asignatura (
            "codCli", "ramoEquiv", "seccion", "anio", "periodo", "estadoCad", "createdAt", "updatedAt"
          ) VALUES (
            'CLI-OK-02', 'AUD-201', 0, 2026, 1, 'Regular', NOW(), NOW()
          );
        `);
      },
      (err) => {
        assert.ok(
          err.message.includes('chk_matricula_seccion') ||
          err.message.includes('sección'),
          `Error esperado sección inválida pero se recibió: ${err.message}`
        );
        return true;
      }
    );

    // Año fuera de rango
    await assert.rejects(
      async () => {
        await sequelize.query(`
          INSERT INTO matriculas_por_asignatura (
            "codCli", "ramoEquiv", "seccion", "anio", "periodo", "estadoCad", "createdAt", "updatedAt"
          ) VALUES (
            'CLI-OK-02', 'AUD-201', 1, 1850, 1, 'Regular', NOW(), NOW()
          );
        `);
      },
      (err) => {
        assert.ok(
          err.message.includes('chk_matricula_anio') ||
          err.message.includes('año de matrícula'),
          `Error esperado año inválido pero se recibió: ${err.message}`
        );
        return true;
      }
    );
  });

  await t.test('8. Rechaza Caracterización para un RUT inexistente en Alumnos (Violación FK / Trigger)', async () => {
    await cleanDb();
    await assert.rejects(
      async () => {
        await sequelize.query(`
          INSERT INTO caracterizacion_estudiante (
            "rut", "dig", "sexo", "fechaNacimiento", "createdAt", "updatedAt"
          ) VALUES (
            99999999, '9', 'Femenino', '2001-02-02', NOW(), NOW()
          );
        `);
      },
      (err) => {
        assert.ok(
          err.message.includes('fk_caracterizacion_alumnos') ||
          err.message.includes('no existe en la tabla alumnos') ||
          err.message.includes('foreign key constraint'),
          `Error esperado FK RUT pero se recibió: ${err.message}`
        );
        return true;
      }
    );
  });

  await t.test('8b. Rechaza período de matrícula distinto de semestre 1 o 2', async () => {
    await cleanDb();
    await Alumno.create({
      codCli: 'CLI-PERIODO-03',
      rut: 16555444,
      digitoVerificador: '3',
      nombre: 'Diego',
      apellidoPat: 'Silva',
      apellidoMat: 'Mora'
    });
    await Asignatura.create({ ramoEquiv: 'AUD-302', nombre: 'Auditoría II' });

    await assert.rejects(
      async () => sequelize.query(`
        INSERT INTO matriculas_por_asignatura (
          "codCli", "ramoEquiv", "seccion", "anio", "periodo", "estadoCad", "createdAt", "updatedAt"
        ) VALUES (
          'CLI-PERIODO-03', 'AUD-302', 1, 2026, 3, 'Regular', NOW(), NOW()
        );
      `),
      (err) => {
        assert.ok(
          err.message.includes('chk_matricula_periodo') || err.message.includes('período'),
          `Error esperado período inválido pero se recibió: ${err.message}`
        );
        return true;
      }
    );
  });

  await t.test('9. Rechaza Caracterización con fecha de nacimiento futura', async () => {
    await cleanDb();
    await Alumno.create({
      codCli: 'CLI-OK-03',
      rut: 17666555,
      digitoVerificador: '4',
      nombre: 'Lucía',
      apellidoPat: 'Castro',
      apellidoMat: 'Vera'
    });

    await assert.rejects(
      async () => {
        await sequelize.query(`
          INSERT INTO caracterizacion_estudiante (
            "rut", "dig", "sexo", "fechaNacimiento", "createdAt", "updatedAt"
          ) VALUES (
            17666555, '4', 'Femenino', '2099-01-01', NOW(), NOW()
          );
        `);
      },
      (err) => {
        assert.ok(
          err.message.includes('chk_caracterizacion_fecha_nac') ||
          err.message.includes('futura'),
          `Error esperado fecha futura pero se recibió: ${err.message}`
        );
        return true;
      }
    );
  });

  await cleanDb();
});
