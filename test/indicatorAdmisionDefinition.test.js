process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const models = require('../src/models');
const { INDICATORS, getIndicatorConfig } = require('../src/services/indicatorCatalog');
const { seedIndicators } = require('../src/services/indicatorSeeder');

test('PIADI-317: Definición de KPIs y modelo de Admisión', async (t) => {
  await t.test('1. Modelo CaracterizacionEstudiante y asociaciones 1:1 con Alumno', () => {
    assert.ok(models.CaracterizacionEstudiante, 'CaracterizacionEstudiante debe estar registrado en models');
    assert.ok(models.Alumno, 'Alumno debe estar registrado en models');

    const fields = Object.keys(models.CaracterizacionEstudiante.rawAttributes);
    const expectedFields = [
      'rut', 'dig', 'sexo', 'fechaNacimiento', 'region', 'comuna',
      'tipoColegio', 'viaAcceso', 'nivelSocioeconomico', 'situacionFamiliar', 'beneficios'
    ];
    for (const f of expectedFields) {
      assert.ok(fields.includes(f), `CaracterizacionEstudiante debe incluir campo '${f}'`);
    }

    // Regla de negocio explícita: Sin campo carrera (carrera única)
    assert.ok(!fields.includes('carrera'), 'CaracterizacionEstudiante no debe tener campo carrera');

    // Alumno debe tener fonoAct y campos nullables relajados
    const alumnoFields = models.Alumno.rawAttributes;
    assert.ok(alumnoFields.fonoAct, 'Alumno debe tener atributo fonoAct');
    assert.strictEqual(alumnoFields.mail.allowNull, true, 'Alumno.mail debe permitir null');
    assert.strictEqual(alumnoFields.celularAct.allowNull, true, 'Alumno.celularAct debe permitir null');
    assert.strictEqual(alumnoFields.fonoProc.allowNull, true, 'Alumno.fonoProc debe permitir null');

    // Asociaciones 1:1
    assert.ok(models.Alumno.associations.caracterizacion, 'Alumno debe tener asociación "caracterizacion"');
    assert.ok(models.CaracterizacionEstudiante.associations.alumno, 'CaracterizacionEstudiante debe tener asociación "alumno"');
  });

  await t.test('2. Catálogo de indicadores cuenta con los 13 KPIs de Admisión y allowedGroupBy', () => {
    const admissionEnrollmentKeys = [
      'matricula_total',
      'nuevos_vs_antiguos',
      'matricula_por_asignatura',
      'matricula_por_seccion',
      'matricula_por_estado_academico'
    ];

    const admissionCharKeys = [
      'nivel_socioeconomico',
      'situacion_familiar',
      'procedencia_geografica',
      'tipo_colegio',
      'via_acceso',
      'beneficios_becas',
      'distribucion_sexo',
      'rango_etario'
    ];

    assert.strictEqual(admissionEnrollmentKeys.length + admissionCharKeys.length, 13, 'Deben ser exactamente 13 indicadores');

    for (const key of admissionEnrollmentKeys) {
      const config = getIndicatorConfig(key);
      assert.ok(config, `Indicador ${key} debe existir en catálogo`);
      assert.strictEqual(config.kind, 'admission_enrollment');
      assert.ok(Array.isArray(config.allowedGroupBy) && config.allowedGroupBy.length > 0, `${key} debe tener allowedGroupBy`);
    }

    for (const key of admissionCharKeys) {
      const config = getIndicatorConfig(key);
      assert.ok(config, `Indicador ${key} debe existir en catálogo`);
      assert.strictEqual(config.kind, 'admission_characterization');
      assert.ok(Array.isArray(config.allowedGroupBy) && config.allowedGroupBy.length > 0, `${key} debe tener allowedGroupBy`);
    }
  });

  await t.test('3. Seeder registra el departamento admision y sus 13 definiciones', async () => {
    const createdDeps = [];
    const createdKPIs = [];

    const origFindOrCreateDep = models.Department.findOrCreate;
    const origFindOrCreateKPI = models.IndicatorDefinition.findOrCreate;
    const origUpdateDep = models.Department.update;
    const origUpdateKPI = models.IndicatorDefinition.update;

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

    try {
      await seedIndicators();

      const admisionDep = createdDeps.find(d => d.key === 'admision');
      assert.ok(admisionDep, 'Departamento admision debe ser registrado por el seeder');
      assert.strictEqual(admisionDep.name, 'Admisión');
      assert.strictEqual(admisionDep.order, 6);

      const admisionKPIs = createdKPIs.filter(k => k.departmentId === 'admision');
      assert.strictEqual(admisionKPIs.length, 13, 'El seeder debe registrar los 13 indicadores de admision');
    } finally {
      models.Department.findOrCreate = origFindOrCreateDep;
      models.IndicatorDefinition.findOrCreate = origFindOrCreateKPI;
      models.Department.update = origUpdateDep;
      models.IndicatorDefinition.update = origUpdateKPI;
    }
  });
});
