process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/piadi_test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const models = require('../src/models');
const provider = require('../src/services/indicatorProvider');
const { parseIndicatorFilters } = require('../src/services/indicatorFilters');

const originals = [];
const stub = (object, key, value) => {
  originals.push([object, key, object[key]]);
  object[key] = value;
};

test.afterEach(() => {
  while (originals.length) {
    const [object, key, value] = originals.pop();
    object[key] = value;
  }
});

const filters = (query = {}) => parseIndicatorFilters({ department: 'admision', ...query });

test('enrollment provider aplica año/período, joins y proyecta filas planas', async () => {
  let queryOptions;
  stub(models.MatriculaPorAsignatura, 'findAll', async (options) => {
    if (options.group) {
      return [{ codCli: 'A', firstYear: 2024 }, { codCli: 'B', firstYear: 2026 }];
    }
    queryOptions = options;
    return [
      {
        codCli: 'A', ramoEquiv: 'MAT-1', anio: 2026, periodo: 1, seccion: 2, estadoCad: 'Regular',
        alumno: { rut: 11111111 }, asignatura: { nombre: 'Matemática' }
      },
      {
        codCli: 'B', ramoEquiv: 'AUD-1', anio: 2026, periodo: 1, seccion: 1, estadoCad: 'Regular',
        alumno: { rut: 22222222 }, asignatura: { nombre: 'Auditoría' }
      }
    ];
  });

  const rows = await provider.getAdmissionEnrollmentRows(filters({ year: '2026', periodo: 'Primer semestre' }));
  assert.equal(queryOptions.where.anio, 2026);
  assert.deepEqual(queryOptions.where.periodo[Op.in], [1]);
  assert.deepEqual(queryOptions.include.map((include) => include.as), ['alumno', 'asignatura']);
  assert.deepEqual(rows, [
    {
      codCli: 'A', rut: 11111111, anio: 2026, periodo: 1, ramoEquiv: 'MAT-1',
      asignatura: 'Matemática', seccion: 2, estadoAcademico: 'Regular', nuevoAntiguo: 'antiguo'
    },
    {
      codCli: 'B', rut: 22222222, anio: 2026, periodo: 1, ramoEquiv: 'AUD-1',
      asignatura: 'Auditoría', seccion: 1, estadoAcademico: 'Regular', nuevoAntiguo: 'nuevo'
    }
  ]);
});

test('enrollment provider soporta rango de años y departamento incorrecto retorna vacío', async () => {
  let capturedWhere;
  let calls = 0;
  stub(models.MatriculaPorAsignatura, 'findAll', async (options) => {
    calls += 1;
    capturedWhere = options.where;
    return [];
  });
  await provider.getAdmissionEnrollmentRows(filters({ fromYear: '2024', toYear: '2026', semester: '2' }));
  assert.deepEqual(capturedWhere.anio[Op.between], [2024, 2026]);
  assert.deepEqual(capturedWhere.periodo[Op.in], [2]);
  assert.deepEqual(await provider.getAdmissionEnrollmentRows({ department: 'innovacion' }), []);
  assert.equal(calls, 1);
});

test('characterization provider deduplica estudiante por año y período y conserva nulos', async () => {
  stub(models.MatriculaPorAsignatura, 'findAll', async () => [
    {
      codCli: 'A', anio: 2026, periodo: 1,
      alumno: { rut: 11111111, caracterizacion: {
        rut: 11111111, sexo: 'F', fechaNacimiento: '2000-06-15', region: 'Valparaíso',
        comuna: null, tipoColegio: 'Municipal', viaAcceso: 'PAES',
        nivelSocioeconomico: 'Medio', situacionFamiliar: null, beneficios: 'Gratuidad'
      } }
    },
    {
      codCli: 'A', anio: 2026, periodo: 1,
      alumno: { rut: 11111111, caracterizacion: { rut: 11111111, sexo: 'F', fechaNacimiento: '2000-06-15' } }
    }
  ]);
  const rows = await provider.getAdmissionCharacterizationRows(filters({ year: '2026', periodo: '1' }));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].edad, 26);
  assert.equal(rows[0].rangoEtario, null);
  assert.equal(rows[0].comuna, null);
});

test('calculateAge respeta cumpleaños, fechas nulas y fechas futuras', () => {
  assert.equal(provider.calculateAge('2000-09-25', new Date('2026-09-24T00:00:00Z')), 25);
  assert.equal(provider.calculateAge('2000-09-24', new Date('2026-09-24T00:00:00Z')), 26);
  assert.equal(provider.calculateAge(null, new Date('2026-12-31T00:00:00Z')), null);
  assert.equal(provider.calculateAge('2030-01-01', new Date('2026-12-31T00:00:00Z')), null);
});

test('getFilterOptions de Admisión devuelve opciones reales de ambas fuentes', async () => {
  stub(models.MatriculaPorAsignatura, 'findAll', async (options) => {
    if (options.group) return [{ codCli: 'A', firstYear: 2026 }];
    if (options.attributes.includes('ramoEquiv')) {
      return [{
        codCli: 'A', ramoEquiv: 'AUD-1', anio: 2026, periodo: 2, seccion: 3, estadoCad: 'Regular',
        alumno: { rut: 11111111 }, asignatura: { nombre: 'Auditoría' }
      }];
    }
    return [{
      codCli: 'A', anio: 2026, periodo: 2,
      alumno: { rut: 11111111, caracterizacion: {
        rut: 11111111, sexo: 'F', fechaNacimiento: '2000-01-01', region: 'Valparaíso',
        comuna: 'Valparaíso', tipoColegio: 'Municipal', viaAcceso: 'PAES',
        nivelSocioeconomico: 'Medio', situacionFamiliar: 'Biparental', beneficios: 'Gratuidad'
      } }
    }];
  });
  const options = await provider.getFilterOptions('admision', filters());
  assert.deepEqual(options.years, [2026]);
  assert.deepEqual(options.semesters, [2]);
  assert.deepEqual(options.asignaturas, ['Auditoría']);
  assert.deepEqual(options.estadosAcademicos, ['Regular']);
  assert.deepEqual(options.sexos, ['F']);
  assert.deepEqual(options.regiones, ['Valparaíso']);
  assert.deepEqual(options.rangosEdad, []);
});
