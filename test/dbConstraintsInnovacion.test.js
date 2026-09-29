process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sequelize, Proyecto, Financiamiento } = require('../src/models');
const { initDbConstraints } = require('../src/services/dbConstraints');

test('PIADI-273: Restricciones de integridad y triggers para Innovación', async (t) => {
  // Inicializar constraints y triggers en PostgreSQL
  await initDbConstraints();

  // Limpiar datos de prueba antes de cada test
  const cleanDb = async () => {
    await Financiamiento.destroy({ where: {} });
    await Proyecto.destroy({ where: {} });
  };

  await cleanDb();

  await t.test('1. Permite insertar un proyecto válido con fechas, años y participantes coherentes', async () => {
    await cleanDb();
    const proyecto = await Proyecto.create({
      idProyecto: 'PROY-VALID-01',
      nombreProyecto: 'Proyecto de Prueba Válido',
      areaTematica: 'Tecnología',
      cursoLinea: 'Innovación Aplicada',
      estado: 'En Curso',
      unidadResponsable: 'Dirección de Desarrollo e Innovación',
      responsableDocente: 'Carlos Perez',
      socioContraparte: 'CORFO',
      anioInicio: 2025,
      anioTermino: 2026,
      semestreInicio: '1',
      fechaInicio: '2025-03-01',
      fechaCierreEstimada: '2026-12-15',
      tipoProyecto: 'Institucional',
      resultadoPrincipal: 'Prototipo funcional',
      nEstudiantes: 10,
      nFuncionarios: 2,
      nDocentes: 3,
      evidenciaPrincipal: 'informe.pdf',
      observacion: 'Sin observaciones'
    });

    assert.ok(proyecto);
    assert.strictEqual(proyecto.idProyecto, 'PROY-VALID-01');
  });

  await t.test('2. Rechaza proyecto con fechaCierreEstimada anterior a fechaInicio', async () => {
    await cleanDb();
    await assert.rejects(
      async () => {
        await sequelize.query(`
          INSERT INTO proyectos (
            "idProyecto", "nombreProyecto", "areaTematica", "cursoLinea", "estado",
            "unidadResponsable", "responsableDocente", "socioContraparte", "anioInicio", "anioTermino",
            "semestreInicio", "fechaInicio", "fechaCierreEstimada", "tipoProyecto", "resultadoPrincipal",
            "nEstudiantes", "nFuncionarios", "nDocentes", "evidenciaPrincipal", "observacion",
            "createdAt", "updatedAt"
          ) VALUES (
            'PROY-INVALID-DATE', 'Proyecto Invalido Fecha', 'Tecnologia', 'Linea A', 'En Curso',
            'Direccion Innovacion', 'Docente A', 'Contraparte A', 2025, 2025,
            '1', '2025-12-01', '2025-01-01', 'Institucional', 'Resultado',
            5, 1, 1, 'doc.pdf', 'Obs',
            NOW(), NOW()
          );
        `);
      },
      (err) => {
        assert.ok(
          err.message.includes('chk_proyectos_fechas') ||
          err.message.includes('fecha de cierre estimada') ||
          err.message.includes('anterior a la fecha de inicio'),
          `Error esperado de fechas pero se recibió: ${err.message}`
        );
        return true;
      }
    );
  });

  await t.test('3. Rechaza proyecto con anioTermino menor a anioInicio', async () => {
    await cleanDb();
    await assert.rejects(
      async () => {
        await sequelize.query(`
          INSERT INTO proyectos (
            "idProyecto", "nombreProyecto", "areaTematica", "cursoLinea", "estado",
            "unidadResponsable", "responsableDocente", "socioContraparte", "anioInicio", "anioTermino",
            "semestreInicio", "fechaInicio", "fechaCierreEstimada", "tipoProyecto", "resultadoPrincipal",
            "nEstudiantes", "nFuncionarios", "nDocentes", "evidenciaPrincipal", "observacion",
            "createdAt", "updatedAt"
          ) VALUES (
            'PROY-INVALID-YEAR', 'Proyecto Invalido Anio', 'Tecnologia', 'Linea A', 'En Curso',
            'Direccion Innovacion', 'Docente A', 'Contraparte A', 2026, 2024,
            '1', '2026-01-01', '2026-12-31', 'Institucional', 'Resultado',
            5, 1, 1, 'doc.pdf', 'Obs',
            NOW(), NOW()
          );
        `);
      },
      (err) => {
        assert.ok(
          err.message.includes('chk_proyectos_anios') ||
          err.message.includes('año de término') ||
          err.message.includes('menor al año de inicio'),
          `Error esperado de año pero se recibió: ${err.message}`
        );
        return true;
      }
    );
  });

  await t.test('4. Rechaza proyecto con participantes negativos', async () => {
    await cleanDb();
    await assert.rejects(
      async () => {
        await sequelize.query(`
          INSERT INTO proyectos (
            "idProyecto", "nombreProyecto", "areaTematica", "cursoLinea", "estado",
            "unidadResponsable", "responsableDocente", "socioContraparte", "anioInicio", "anioTermino",
            "semestreInicio", "fechaInicio", "fechaCierreEstimada", "tipoProyecto", "resultadoPrincipal",
            "nEstudiantes", "nFuncionarios", "nDocentes", "evidenciaPrincipal", "observacion",
            "createdAt", "updatedAt"
          ) VALUES (
            'PROY-INVALID-PARTS', 'Proyecto Invalido Participantes', 'Tecnologia', 'Linea A', 'En Curso',
            'Direccion Innovacion', 'Docente A', 'Contraparte A', 2025, 2025,
            '1', '2025-01-01', '2025-12-31', 'Institucional', 'Resultado',
            -5, 1, 1, 'doc.pdf', 'Obs',
            NOW(), NOW()
          );
        `);
      },
      (err) => {
        assert.ok(
          err.message.includes('chk_proyectos_participantes') ||
          err.message.includes('participantes no pueden ser negativas'),
          `Error esperado de participantes pero se recibió: ${err.message}`
        );
        return true;
      }
    );
  });

  await t.test('5. Rechaza proyecto con tipoProyecto inválido', async () => {
    await cleanDb();
    await assert.rejects(
      async () => {
        await sequelize.query(`
          INSERT INTO proyectos (
            "idProyecto", "nombreProyecto", "areaTematica", "cursoLinea", "estado",
            "unidadResponsable", "responsableDocente", "socioContraparte", "anioInicio", "anioTermino",
            "semestreInicio", "fechaInicio", "fechaCierreEstimada", "tipoProyecto", "resultadoPrincipal",
            "nEstudiantes", "nFuncionarios", "nDocentes", "evidenciaPrincipal", "observacion",
            "createdAt", "updatedAt"
          ) VALUES (
            'PROY-INVALID-TIPO', 'Proyecto Invalido Tipo', 'Tecnologia', 'Linea A', 'En Curso',
            'Direccion Innovacion', 'Docente A', 'Contraparte A', 2025, 2025,
            '1', '2025-01-01', '2025-12-31', 'TipoNoPermitido', 'Resultado',
            5, 1, 1, 'doc.pdf', 'Obs',
            NOW(), NOW()
          );
        `);
      },
      (err) => {
        assert.ok(
          err.message.includes('chk_proyectos_tipo'),
          `Error esperado chk_proyectos_tipo pero se recibió: ${err.message}`
        );
        return true;
      }
    );
  });

  await t.test('6. Rechaza financiamiento para un proyecto inexistente (Violación FK / Trigger)', async () => {
    await cleanDb();
    await assert.rejects(
      async () => {
        await sequelize.query(`
          INSERT INTO financiamientos (
            "idProyecto", "nombreProyecto", "montoAdjudicado", "montoEjecutadoEstimado",
            "estadoFinanciero", "financiamientoExterno", "fuenteFinanciamiento", "observacion",
            "createdAt", "updatedAt"
          ) VALUES (
            'PROY-NO-EXISTE', 'Proyecto Fantasma', 10000000, 5000000,
            'Al día', 'Sí', 'CORFO', 'Obs',
            NOW(), NOW()
          );
        `);
      },
      (err) => {
        assert.ok(
          err.message.includes('fk_financiamientos_proyecto') ||
          err.message.includes('no existe en la tabla proyectos') ||
          err.message.includes('foreign key constraint'),
          `Error esperado FK pero se recibió: ${err.message}`
        );
        return true;
      }
    );
  });

  await t.test('7. Rechaza financiamiento con montos negativos', async () => {
    await cleanDb();
    await Proyecto.create({
      idProyecto: 'PROY-MONTO-NEG',
      nombreProyecto: 'Proyecto Base',
      areaTematica: 'Tecnología',
      cursoLinea: 'Linea A',
      estado: 'En Curso',
      unidadResponsable: 'DII',
      responsableDocente: 'Docente A',
      socioContraparte: 'CORFO',
      anioInicio: 2025,
      anioTermino: 2025,
      semestreInicio: '1',
      fechaInicio: '2025-01-01',
      fechaCierreEstimada: '2025-12-31',
      tipoProyecto: 'Estudiantil',
      resultadoPrincipal: 'Resultado A',
      nEstudiantes: 2,
      nFuncionarios: 0,
      nDocentes: 1,
      evidenciaPrincipal: 'doc.pdf',
      observacion: 'Obs'
    });

    await assert.rejects(
      async () => {
        await sequelize.query(`
          INSERT INTO financiamientos (
            "idProyecto", "nombreProyecto", "montoAdjudicado", "montoEjecutadoEstimado",
            "estadoFinanciero", "financiamientoExterno", "fuenteFinanciamiento", "observacion",
            "createdAt", "updatedAt"
          ) VALUES (
            'PROY-MONTO-NEG', 'Proyecto Base', -500000, 100000,
            'Al día', 'Sí', 'CORFO', 'Obs',
            NOW(), NOW()
          );
        `);
      },
      (err) => {
        assert.ok(
          err.message.includes('chk_financiamientos_montos') ||
          err.message.includes('monto adjudicado') ||
          err.message.includes('no puede ser negativo'),
          `Error esperado de monto negativo pero se recibió: ${err.message}`
        );
        return true;
      }
    );
  });

  await t.test('8. Permite insertar financiamiento válido vinculado a proyecto existente', async () => {
    await cleanDb();
    await Proyecto.create({
      idProyecto: 'PROY-OK-01',
      nombreProyecto: 'Proyecto Base OK',
      areaTematica: 'Finanzas',
      cursoLinea: 'Linea B',
      estado: 'En Curso',
      unidadResponsable: 'DII',
      responsableDocente: 'Docente B',
      socioContraparte: 'FONDEF',
      anioInicio: 2025,
      anioTermino: 2026,
      semestreInicio: '1',
      fechaInicio: '2025-03-01',
      fechaCierreEstimada: '2026-11-30',
      tipoProyecto: 'Institucional',
      resultadoPrincipal: 'Resultado OK',
      nEstudiantes: 5,
      nFuncionarios: 1,
      nDocentes: 2,
      evidenciaPrincipal: 'evidencia.pdf',
      observacion: 'Obs'
    });

    const financiamiento = await Financiamiento.create({
      idProyecto: 'PROY-OK-01',
      nombreProyecto: 'Proyecto Base OK',
      montoAdjudicado: 15000000,
      montoEjecutadoEstimado: 7500000,
      estadoFinanciero: 'Al día',
      financiamientoExterno: 'Sí',
      fuenteFinanciamiento: 'FONDEF',
      observacion: 'Convenio activo'
    });

    assert.ok(financiamiento);
    assert.strictEqual(financiamiento.idProyecto, 'PROY-OK-01');
    assert.strictEqual(financiamiento.montoAdjudicado, 15000000);
  });

  await cleanDb();
});
