process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const models = require('../src/models');
const { INDICATORS, getIndicatorConfig } = require('../src/services/indicatorCatalog');
const { seedIndicators } = require('../src/services/indicatorSeeder');

test('PIADI-283: Definición de KPIs y modelos de Desarrollo Curricular', async (t) => {
  await t.test('1. Modelos RendimientoAsignatura, Practica, Titulacion y asociaciones con Alumno y Asignatura', () => {
    // Verificar registro en models
    assert.ok(models.RendimientoAsignatura, 'RendimientoAsignatura debe estar registrado en models');
    assert.ok(models.Practica, 'Practica debe estar registrado en models');
    assert.ok(models.Titulacion, 'Titulacion debe estar registrado en models');
    assert.ok(models.Alumno, 'Alumno debe estar registrado en models');
    assert.ok(models.Asignatura, 'Asignatura debe estar registrado en models');

    // Atributos de RendimientoAsignatura
    const rendFields = Object.keys(models.RendimientoAsignatura.rawAttributes);
    const expectedRendFields = [
      'id', 'rut', 'codCli', 'ramoEquiv', 'seccion', 'anio', 'periodo',
      'notaFinal', 'estadoAsignatura', 'asistencia'
    ];
    for (const f of expectedRendFields) {
      assert.ok(rendFields.includes(f), `RendimientoAsignatura debe incluir campo '${f}'`);
    }
    assert.ok(!rendFields.includes('carrera'), 'RendimientoAsignatura no debe tener campo carrera (carrera única)');

    // Atributos de Practica
    const pracFields = Object.keys(models.Practica.rawAttributes);
    const expectedPracFields = [
      'id', 'rut', 'codCli', 'anio', 'periodo', 'tipoPractica',
      'estado', 'fechaInicio', 'fechaTermino', 'horas', 'empresa'
    ];
    for (const f of expectedPracFields) {
      assert.ok(pracFields.includes(f), `Practica debe incluir campo '${f}'`);
    }
    assert.ok(!pracFields.includes('carrera'), 'Practica no debe tener campo carrera (carrera única)');

    // Atributos de Titulacion
    const titFields = Object.keys(models.Titulacion.rawAttributes);
    const expectedTitFields = [
      'id', 'rut', 'codCli', 'anioTitulacion', 'periodo', 'cohorte',
      'tiempoNormativo', 'semestresCursados', 'fechaTitulacion', 'distincion'
    ];
    for (const f of expectedTitFields) {
      assert.ok(titFields.includes(f), `Titulacion debe incluir campo '${f}'`);
    }
    assert.ok(!titFields.includes('carrera'), 'Titulacion no debe tener campo carrera (carrera única)');

    // Asociaciones de RendimientoAsignatura
    assert.ok(models.Alumno.associations.rendimientos, 'Alumno debe tener asociación "rendimientos"');
    assert.ok(models.RendimientoAsignatura.associations.alumno, 'RendimientoAsignatura debe tener asociación "alumno"');
    assert.ok(models.Asignatura.associations.rendimientos, 'Asignatura debe tener asociación "rendimientos"');
    assert.ok(models.RendimientoAsignatura.associations.asignatura, 'RendimientoAsignatura debe tener asociación "asignatura"');

    // Asociaciones de Practica
    assert.ok(models.Alumno.associations.practicas, 'Alumno debe tener asociación "practicas"');
    assert.ok(models.Practica.associations.alumno, 'Practica debe tener asociación "alumno"');

    // Asociaciones de Titulacion
    assert.ok(models.Alumno.associations.titulaciones, 'Alumno debe tener asociación "titulaciones"');
    assert.ok(models.Titulacion.associations.alumno, 'Titulacion debe tener asociación "alumno"');
  });

  await t.test('2. Catálogo de indicadores cuenta con los 8 KPIs de Desarrollo Curricular y allowedGroupBy', () => {
    const rendimientoKeys = [
      'tasa_aprobacion_asignatura',
      'tasa_reprobacion_asignatura',
      'asignaturas_criticas'
    ];

    const practicaKeys = [
      'practicas_inscritas',
      'practicas_aprobadas'
    ];

    const titulacionKeys = [
      'tasa_titulacion_cohorte',
      'titulados_por_anio',
      'tiempo_promedio_titulacion'
    ];

    assert.strictEqual(
      rendimientoKeys.length + practicaKeys.length + titulacionKeys.length,
      8,
      'Deben ser exactamente 8 indicadores oficiales de Desarrollo Curricular'
    );

    for (const key of rendimientoKeys) {
      const config = getIndicatorConfig(key);
      assert.ok(config, `Indicador ${key} debe existir en catálogo`);
      assert.strictEqual(config.kind, 'curricular_rendimiento');
      assert.ok(Array.isArray(config.allowedGroupBy) && config.allowedGroupBy.length > 0, `${key} debe tener allowedGroupBy`);
    }

    for (const key of practicaKeys) {
      const config = getIndicatorConfig(key);
      assert.ok(config, `Indicador ${key} debe existir en catálogo`);
      assert.strictEqual(config.kind, 'curricular_practica');
      assert.ok(Array.isArray(config.allowedGroupBy) && config.allowedGroupBy.length > 0, `${key} debe tener allowedGroupBy`);
    }

    for (const key of titulacionKeys) {
      const config = getIndicatorConfig(key);
      assert.ok(config, `Indicador ${key} debe existir en catálogo`);
      assert.strictEqual(config.kind, 'curricular_titulacion');
      assert.ok(Array.isArray(config.allowedGroupBy) && config.allowedGroupBy.length > 0, `${key} debe tener allowedGroupBy`);
    }

    // Resolución por formulaKey en getIndicatorConfig
    assert.strictEqual(getIndicatorConfig(null, { formulaKey: 'APPROVAL_RATE_BY_COURSE' }).kind, 'curricular_rendimiento');
    assert.strictEqual(getIndicatorConfig(null, { formulaKey: 'COUNT_ENROLLED_INTERNSHIPS' }).kind, 'curricular_practica');
    assert.strictEqual(getIndicatorConfig(null, { formulaKey: 'GRADUATION_RATE_BY_COHORT' }).kind, 'curricular_titulacion');
  });

  await t.test('3. Seeder registra el departamento desarrollo_curricular y sus 8 definiciones oficiales', async () => {
    const createdDeps = [];
    const createdKPIs = [];
    const destroyedKPIs = [];

    const origFindOrCreateDep = models.Department.findOrCreate;
    const origFindOrCreateKPI = models.IndicatorDefinition.findOrCreate;
    const origUpdateDep = models.Department.update;
    const origUpdateKPI = models.IndicatorDefinition.update;
    const origDestroyKPI = models.IndicatorDefinition.destroy;

    models.Department.findOrCreate = async ({ where, defaults }) => {
      createdDeps.push({ ...defaults, ...where });
      return [{ key: where.key }, true];
    };

    models.IndicatorDefinition.findOrCreate = async ({ where, defaults }) => {
      createdKPIs.push({ ...defaults, ...where });
      return [{ key: where.key, departmentId: where.departmentId }, true];
    };
    models.Department.update = async () => [1];
    models.IndicatorDefinition.update = async () => [1];
    models.IndicatorDefinition.destroy = async ({ where }) => {
      destroyedKPIs.push(where);
      return 1;
    };

    try {
      await seedIndicators();

      const curricularDep = createdDeps.find(d => d.key === 'desarrollo_curricular');
      assert.ok(curricularDep, 'Departamento desarrollo_curricular debe ser registrado por el seeder');
      assert.strictEqual(curricularDep.name, 'Desarrollo Curricular');
      assert.strictEqual(curricularDep.order, 5);
      assert.strictEqual(curricularDep.hasData, true, 'desarrollo_curricular debe tener hasData: true');

      const curricularKPIs = createdKPIs.filter(k => k.departmentId === 'desarrollo_curricular');
      assert.strictEqual(curricularKPIs.length, 8, 'El seeder debe registrar los 8 indicadores oficiales de desarrollo_curricular');

      // Verificar que los stubs obsoletos fueron destruidos
      const destroyedStubs = destroyedKPIs.find(d => d.departmentId === 'desarrollo_curricular');
      assert.ok(destroyedStubs, 'Debe ejecutarse eliminación de stubs obsoletos');
      assert.ok(destroyedStubs.key.includes('programas_actualizados'));
      assert.ok(destroyedStubs.key.includes('innovaciones_pedagogicas'));
    } finally {
      models.Department.findOrCreate = origFindOrCreateDep;
      models.IndicatorDefinition.findOrCreate = origFindOrCreateKPI;
      models.Department.update = origUpdateDep;
      models.IndicatorDefinition.update = origUpdateKPI;
      models.IndicatorDefinition.destroy = origDestroyKPI;
    }
  });
});
