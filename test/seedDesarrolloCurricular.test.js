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
const { seedDesarrolloCurricularData } = require('../src/services/dbSeeder');

test('PIADI-289: Datos semilla de Desarrollo Curricular y verificación de consultas de los 8 KPIs', async (t) => {
  let isDbAvailable = false;
  try {
    await sequelize.authenticate();
    await initDbConstraints();
    isDbAvailable = true;
  } catch (err) {
    console.warn('[SKIP-DB] Base de datos no disponible para test de integración PIADI-289:', err.message);
  }

  const cleanAll = async () => {
    if (!isDbAvailable) return;
    await RendimientoAsignatura.destroy({ where: {} }).catch(() => {});
    await Practica.destroy({ where: {} }).catch(() => {});
    await Titulacion.destroy({ where: {} }).catch(() => {});
    await Alumno.destroy({
      where: {
        rut: [19100101, 19100102, 19100103, 19100104, 19100105, 19100106]
      }
    }).catch(() => {});
    await Asignatura.destroy({
      where: {
        ramoEquiv: ['DC-AUD101', 'DC-CON201', 'DC-FIN301', 'DC-GES401']
      }
    }).catch(() => {});
  };

  await cleanAll();

  await t.test('1. Semilla en rendimiento_asignatura, practicas y titulacion se inserta de forma idempotente', async () => {
    assert.strictEqual(typeof seedDesarrolloCurricularData, 'function');
    if (!isDbAvailable) return;

    await seedDesarrolloCurricularData();
    // Segunda ejecución para comprobar idempotencia (findOrCreate)
    await seedDesarrolloCurricularData();

    const rendCount = await RendimientoAsignatura.count();
    const pracCount = await Practica.count();
    const titCount = await Titulacion.count();

    assert.strictEqual(rendCount, 10, 'Deben existir 10 registros semilla en rendimiento_asignatura');
    assert.strictEqual(pracCount, 6, 'Deben existir 6 registros semilla en practicas');
    assert.strictEqual(titCount, 4, 'Deben existir 4 registros semilla en titulacion');
  });

  await t.test('2. Verificación de consultas SQL de los 8 KPIs en v_meta_indicator_values (Anual y Semestral)', async () => {
    if (!isDbAvailable) return;

    const [rows2025Anual] = await sequelize.query(`
      SELECT "indicatorKey", value::float AS val
      FROM v_meta_indicator_values
      WHERE "departmentId" = 'desarrollo_curricular'
        AND anio = 2025
        AND periodo = 'Anual'
      ORDER BY "indicatorKey";
    `);

    const kpi2025Anual = Object.fromEntries(rows2025Anual.map(r => [r.indicatorKey, Number(r.val)]));

    // En 2025 Anual:
    // - rendimiento_asignatura: 8 registros totales (5 APROBADO, 3 REPROBADO)
    //   -> tasa_aprobacion_asignatura = (5/8)*100 = 62.5%
    //   -> tasa_reprobacion_asignatura = (3/8)*100 = 37.5%
    //   -> asignaturas_criticas (>30% reprobación): DC-FIN301 (66.67%) y DC-CON201 (33.33%) = 2
    // - practicas: 4 inscritas, 3 aprobadas
    //   -> practicas_inscritas = 4
    //   -> practicas_aprobadas = 3
    // - titulacion: 3 titulados en 2025 (2 en tiempo normativo <= 8.0, 1 con 9.0 semestres)
    //   -> titulados_por_anio = 3
    //   -> tasa_titulacion_cohorte = (2/3)*100 = 66.67%
    //   -> tiempo_promedio_titulacion = (8 + 9 + 8)/3 = 8.33
    assert.strictEqual(kpi2025Anual.tasa_aprobacion_asignatura, 62.5);
    assert.strictEqual(kpi2025Anual.tasa_reprobacion_asignatura, 37.5);
    assert.strictEqual(kpi2025Anual.asignaturas_criticas, 2);
    assert.strictEqual(kpi2025Anual.practicas_inscritas, 4);
    assert.strictEqual(kpi2025Anual.practicas_aprobadas, 3);
    assert.strictEqual(kpi2025Anual.tasa_titulacion_cohorte, 66.67);
    assert.strictEqual(kpi2025Anual.titulados_por_anio, 3);
    assert.strictEqual(kpi2025Anual.tiempo_promedio_titulacion, 8.33);

    // Verificar 2025 Semestre 1:
    // - rendimiento_asignatura S1: 5 registros (3 APROBADO, 2 REPROBADO en DC-FIN301)
    //   -> tasa_aprobacion_asignatura = 60%
    //   -> tasa_reprobacion_asignatura = 40%
    //   -> asignaturas_criticas = 1 (DC-FIN301)
    // - practicas S1: 2 inscritas, 2 aprobadas
    // - titulacion S1: 2 titulados (1 oportuno, 1 con 9 semestres) -> 50%, promedio 8.5
    const [rows2025S1] = await sequelize.query(`
      SELECT "indicatorKey", value::float AS val
      FROM v_meta_indicator_values
      WHERE "departmentId" = 'desarrollo_curricular'
        AND anio = 2025
        AND periodo = 'Semestre 1'
      ORDER BY "indicatorKey";
    `);
    const kpi2025S1 = Object.fromEntries(rows2025S1.map(r => [r.indicatorKey, Number(r.val)]));

    assert.strictEqual(kpi2025S1.tasa_aprobacion_asignatura, 60);
    assert.strictEqual(kpi2025S1.tasa_reprobacion_asignatura, 40);
    assert.strictEqual(kpi2025S1.asignaturas_criticas, 1);
    assert.strictEqual(kpi2025S1.practicas_inscritas, 2);
    assert.strictEqual(kpi2025S1.practicas_aprobadas, 2);
    assert.strictEqual(kpi2025S1.tasa_titulacion_cohorte, 50);
    assert.strictEqual(kpi2025S1.titulados_por_anio, 2);
    assert.strictEqual(kpi2025S1.tiempo_promedio_titulacion, 8.5);

    // Verificar 2026 Anual:
    // - rendimiento_asignatura: 2 aprobados, 0 reprobados -> 100%, 0%, 0 críticas
    // - practicas: 2 inscritas, 1 aprobada
    // - titulacion: 1 titulado (8.0 semestres <= 8.0 normativo) -> 100%, 1 titulado, promedio 8
    const [rows2026Anual] = await sequelize.query(`
      SELECT "indicatorKey", value::float AS val
      FROM v_meta_indicator_values
      WHERE "departmentId" = 'desarrollo_curricular'
        AND anio = 2026
        AND periodo = 'Anual'
      ORDER BY "indicatorKey";
    `);
    const kpi2026Anual = Object.fromEntries(rows2026Anual.map(r => [r.indicatorKey, Number(r.val)]));

    assert.strictEqual(kpi2026Anual.tasa_aprobacion_asignatura, 100);
    assert.strictEqual(kpi2026Anual.tasa_reprobacion_asignatura, 0);
    assert.strictEqual(kpi2026Anual.asignaturas_criticas, 0);
    assert.strictEqual(kpi2026Anual.practicas_inscritas, 2);
    assert.strictEqual(kpi2026Anual.practicas_aprobadas, 1);
    assert.strictEqual(kpi2026Anual.tasa_titulacion_cohorte, 100);
    assert.strictEqual(kpi2026Anual.titulados_por_anio, 1);
    assert.strictEqual(kpi2026Anual.tiempo_promedio_titulacion, 8);
  });

  await t.test('3. Verificación de los 8 KPIs mediante la función PL/pgSQL get_indicator_value_for_period', async () => {
    if (!isDbAvailable) return;

    const kpiKeys = [
      'tasa_aprobacion_asignatura',
      'tasa_reprobacion_asignatura',
      'asignaturas_criticas',
      'practicas_inscritas',
      'practicas_aprobadas',
      'tasa_titulacion_cohorte',
      'titulados_por_anio',
      'tiempo_promedio_titulacion'
    ];

    for (const key of kpiKeys) {
      const [[row]] = await sequelize.query(
        `SELECT get_indicator_value_for_period(:key, '2025-01-01'::date, '2025-12-31'::date)::float AS val`,
        { replacements: { key } }
      );
      assert.notStrictEqual(row.val, null, `El KPI ${key} no debe retornar NULL para el periodo anual 2025`);
    }
  });
});
