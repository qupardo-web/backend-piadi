process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  sequelize,
  Alumno,
  Asignatura,
  RendimientoAsignatura,
  Practica,
  Titulacion
} = require('../src/models');
const { initDbConstraints } = require('../src/services/dbConstraints');

test('PIADI-301: Restricciones de integridad, triggers y FKs para Desarrollo Curricular', async (t) => {
  let isDbAvailable = false;
  try {
    await sequelize.authenticate();
    await initDbConstraints();
    isDbAvailable = true;
  } catch (err) {
    console.warn('[SKIP-DB] Base de datos no disponible o sin conexión. Se probarán validaciones a nivel de modelo Sequelize.', err.message);
  }

  const cleanDb = async () => {
    if (!isDbAvailable) return;
    await RendimientoAsignatura.destroy({ where: {} }).catch(() => {});
    await Practica.destroy({ where: {} }).catch(() => {});
    await Titulacion.destroy({ where: {} }).catch(() => {});
    await Alumno.destroy({ where: { codCli: ['CLI-CURR-01', 'CLI-CURR-02'] } }).catch(() => {});
    await Asignatura.destroy({ where: { ramoEquiv: ['AUD-101', 'CON-202'] } }).catch(() => {});
  };

  const ensureBaseline = async () => {
    if (!isDbAvailable) return;
    await Alumno.findOrCreate({
      where: { rut: 18123456 },
      defaults: {
        codCli: 'CLI-CURR-01',
        rut: 18123456,
        digitoVerificador: '3',
        nombre: 'Andrea',
        apellidoPat: 'Soto',
        apellidoMat: 'Vargas',
        mail: 'andrea.soto@test.cl'
      }
    });

    await Asignatura.findOrCreate({
      where: { ramoEquiv: 'AUD-101' },
      defaults: {
        ramoEquiv: 'AUD-101',
        nombre: 'Auditoría Financiera I'
      }
    });
  };

  await cleanDb();

  await t.test('1. Permite registrar datos válidos de Rendimiento, Práctica y Titulación', async () => {
    if (!isDbAvailable) return;
    await cleanDb();
    await ensureBaseline();

    const rend = await RendimientoAsignatura.create({
      rut: 18123456,
      codCli: 'CLI-CURR-01',
      ramoEquiv: 'AUD-101',
      seccion: 1,
      anio: 2026,
      periodo: 1,
      notaFinal: 6.2,
      estadoAsignatura: 'APROBADO',
      asistencia: 92.5
    });
    assert.ok(rend);
    assert.strictEqual(Number(rend.notaFinal), 6.2);
    assert.strictEqual(rend.estadoAsignatura, 'APROBADO');

    const prac = await Practica.create({
      rut: 18123456,
      codCli: 'CLI-CURR-01',
      anio: 2026,
      periodo: 1,
      tipoPractica: 'Práctica Profesional I',
      estado: 'APROBADA',
      fechaInicio: '2026-01-05',
      fechaTermino: '2026-03-20',
      horas: 360,
      empresa: 'PwC Chile'
    });
    assert.ok(prac);
    assert.strictEqual(prac.horas, 360);

    const tit = await Titulacion.create({
      rut: 18123456,
      codCli: 'CLI-CURR-01',
      anioTitulacion: 2026,
      periodo: 1,
      cohorte: 2022,
      tiempoNormativo: 8.0,
      semestresCursados: 9.0,
      fechaTitulacion: '2026-04-10',
      distincion: 'Distinción Máxima'
    });
    assert.ok(tit);
    assert.strictEqual(tit.cohorte, 2022);
  });

  await t.test('2. RendimientoAsignatura: Rechaza notaFinal fuera de rango (1.0 a 7.0)', async () => {
    const invalidRendLow = RendimientoAsignatura.build({
      rut: 18123456,
      ramoEquiv: 'AUD-101',
      anio: 2026,
      periodo: 1,
      notaFinal: 0.5,
      estadoAsignatura: 'REPROBADO'
    });
    await assert.rejects(
      async () => invalidRendLow.validate(),
      (err) => {
        assert.ok(err.message.includes('notaFinal') || err.message.includes('min') || err.name === 'SequelizeValidationError');
        return true;
      }
    );

    const invalidRendHigh = RendimientoAsignatura.build({
      rut: 18123456,
      ramoEquiv: 'AUD-101',
      anio: 2026,
      periodo: 1,
      notaFinal: 8.5,
      estadoAsignatura: 'APROBADO'
    });
    await assert.rejects(
      async () => invalidRendHigh.validate(),
      (err) => {
        assert.ok(err.message.includes('notaFinal') || err.message.includes('max') || err.name === 'SequelizeValidationError');
        return true;
      }
    );

    if (isDbAvailable) {
      await ensureBaseline();
      await assert.rejects(
        async () => {
          await sequelize.query(`
            INSERT INTO rendimiento_asignatura (
              rut, "codCli", "ramoEquiv", seccion, anio, periodo, "notaFinal", "estadoAsignatura", "createdAt", "updatedAt"
            ) VALUES (
              18123456, 'CLI-CURR-01', 'AUD-101', 1, 2026, 1, 9.5, 'APROBADO', NOW(), NOW()
            );
          `);
        },
        (err) => {
          assert.ok(
            err.message.includes('chk_rendimiento_nota') ||
            err.message.includes('nota final') ||
            err.message.includes('check constraint')
          );
          return true;
        }
      );
    }
  });

  await t.test('3. RendimientoAsignatura: Rechaza asistencia fuera de rango (0.0 a 100.0)', async () => {
    const invalidAsist = RendimientoAsignatura.build({
      rut: 18123456,
      ramoEquiv: 'AUD-101',
      anio: 2026,
      periodo: 1,
      asistencia: 110.0,
      estadoAsignatura: 'APROBADO'
    });
    await assert.rejects(
      async () => invalidAsist.validate(),
      (err) => {
        assert.ok(err.message.includes('asistencia') || err.name === 'SequelizeValidationError');
        return true;
      }
    );

    if (isDbAvailable) {
      await ensureBaseline();
      await assert.rejects(
        async () => {
          await sequelize.query(`
            INSERT INTO rendimiento_asignatura (
              rut, "codCli", "ramoEquiv", seccion, anio, periodo, asistencia, "estadoAsignatura", "createdAt", "updatedAt"
            ) VALUES (
              18123456, 'CLI-CURR-01', 'AUD-101', 1, 2026, 1, 150.0, 'APROBADO', NOW(), NOW()
            );
          `);
        },
        (err) => {
          assert.ok(
            err.message.includes('chk_rendimiento_asistencia') ||
            err.message.includes('asistencia') ||
            err.message.includes('check constraint')
          );
          return true;
        }
      );
    }
  });

  await t.test('4. RendimientoAsignatura: Rechaza estado inválido (distinto de APROBADO o REPROBADO)', async () => {
    if (!isDbAvailable) return;
    await ensureBaseline();
    await assert.rejects(
      async () => {
        await sequelize.query(`
          INSERT INTO rendimiento_asignatura (
            rut, "codCli", "ramoEquiv", seccion, anio, periodo, "estadoAsignatura", "createdAt", "updatedAt"
          ) VALUES (
            18123456, 'CLI-CURR-01', 'AUD-101', 1, 2026, 1, 'ESTADO_INVALIDO', NOW(), NOW()
          );
        `);
      },
      (err) => {
        assert.ok(
          err.message.includes('chk_rendimiento_estado') ||
          err.message.includes('estado de la asignatura') ||
          err.message.includes('inválido')
        );
        return true;
      }
    );
  });

  await t.test('5. RendimientoAsignatura: Rechaza alumno o asignatura inexistente (FK / Trigger)', async () => {
    if (!isDbAvailable) return;
    await ensureBaseline();

    await assert.rejects(
      async () => {
        await sequelize.query(`
          INSERT INTO rendimiento_asignatura (
            rut, "codCli", "ramoEquiv", seccion, anio, periodo, "estadoAsignatura", "createdAt", "updatedAt"
          ) VALUES (
            99999999, 'CLI-NO-EXISTE', 'AUD-101', 1, 2026, 1, 'APROBADO', NOW(), NOW()
          );
        `);
      },
      (err) => {
        assert.ok(
          err.message.includes('fk_rendimiento_alumno') ||
          err.message.includes('no existe en la tabla alumnos') ||
          err.message.includes('foreign key')
        );
        return true;
      }
    );

    await assert.rejects(
      async () => {
        await sequelize.query(`
          INSERT INTO rendimiento_asignatura (
            rut, "codCli", "ramoEquiv", seccion, anio, periodo, "estadoAsignatura", "createdAt", "updatedAt"
          ) VALUES (
            18123456, 'CLI-CURR-01', 'RAMO-INEXISTENTE-999', 1, 2026, 1, 'APROBADO', NOW(), NOW()
          );
        `);
      },
      (err) => {
        assert.ok(
          err.message.includes('fk_rendimiento_asignatura') ||
          err.message.includes('no existe en la tabla asignaturas') ||
          err.message.includes('foreign key')
        );
        return true;
      }
    );
  });

  await t.test('6. Practicas: Rechaza fechaTermino anterior a fechaInicio', async () => {
    if (!isDbAvailable) return;
    await ensureBaseline();

    await assert.rejects(
      async () => {
        await sequelize.query(`
          INSERT INTO practicas (
            rut, "codCli", anio, periodo, "tipoPractica", estado, "fechaInicio", "fechaTermino", horas, "createdAt", "updatedAt"
          ) VALUES (
            18123456, 'CLI-CURR-01', 2026, 1, 'Práctica I', 'INSCRITA', '2026-06-01', '2026-05-01', 100, NOW(), NOW()
          );
        `);
      },
      (err) => {
        assert.ok(
          err.message.includes('chk_practicas_fechas') ||
          err.message.includes('fecha de término') ||
          err.message.includes('anterior')
        );
        return true;
      }
    );
  });

  await t.test('7. Practicas: Rechaza horas negativas y alumno inexistente', async () => {
    const invalidPracHoras = Practica.build({
      rut: 18123456,
      anio: 2026,
      periodo: 1,
      tipoPractica: 'Práctica',
      estado: 'INSCRITA',
      horas: -50
    });
    await assert.rejects(
      async () => invalidPracHoras.validate(),
      (err) => {
        assert.ok(err.message.includes('horas') || err.name === 'SequelizeValidationError');
        return true;
      }
    );

    if (isDbAvailable) {
      await assert.rejects(
        async () => {
          await sequelize.query(`
            INSERT INTO practicas (
              rut, "codCli", anio, periodo, "tipoPractica", estado, horas, "createdAt", "updatedAt"
            ) VALUES (
              99999999, 'CLI-NO-EXISTE', 2026, 1, 'Práctica I', 'INSCRITA', 100, NOW(), NOW()
            );
          `);
        },
        (err) => {
          assert.ok(
            err.message.includes('fk_practicas_alumno') ||
            err.message.includes('no existe en la tabla alumnos') ||
            err.message.includes('foreign key')
          );
          return true;
        }
      );
    }
  });

  await t.test('8. Titulacion: Rechaza anioTitulacion menor a cohorte', async () => {
    if (!isDbAvailable) return;
    await ensureBaseline();

    await assert.rejects(
      async () => {
        await sequelize.query(`
          INSERT INTO titulacion (
            rut, "codCli", "anioTitulacion", periodo, cohorte, "tiempoNormativo", "semestresCursados", "createdAt", "updatedAt"
          ) VALUES (
            18123456, 'CLI-CURR-01', 2020, 1, 2024, 8.0, 9.0, NOW(), NOW()
          );
        `);
      },
      (err) => {
        assert.ok(
          err.message.includes('chk_titulacion_anio_cohorte') ||
          err.message.includes('anterior a la cohorte') ||
          err.message.includes('check constraint')
        );
        return true;
      }
    );
  });

  await t.test('9. Titulacion: Rechaza semestresCursados o tiempoNormativo <= 0', async () => {
    const invalidTitSem = Titulacion.build({
      rut: 18123456,
      anioTitulacion: 2026,
      periodo: 1,
      cohorte: 2022,
      semestresCursados: 0
    });
    await assert.rejects(
      async () => invalidTitSem.validate(),
      (err) => {
        assert.ok(err.message.includes('semestresCursados') || err.name === 'SequelizeValidationError');
        return true;
      }
    );

    if (isDbAvailable) {
      await ensureBaseline();
      await assert.rejects(
        async () => {
          await sequelize.query(`
            INSERT INTO titulacion (
              rut, "codCli", "anioTitulacion", periodo, cohorte, "tiempoNormativo", "semestresCursados", "createdAt", "updatedAt"
            ) VALUES (
              18123456, 'CLI-CURR-01', 2026, 1, 2022, -2.0, 9.0, NOW(), NOW()
            );
          `);
        },
        (err) => {
          assert.ok(
            err.message.includes('chk_titulacion_tiempo_normativo') ||
            err.message.includes('tiempo normativo') ||
            err.message.includes('check constraint')
          );
          return true;
        }
      );
    }
  });

  await cleanDb();
});
