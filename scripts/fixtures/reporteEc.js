const { randomUUID } = require('node:crypto');

const esLocal = (hostname) => ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname.toLowerCase());

const verificarCredencialesRemotas = ({ env, baseUrl, dbUrl }) => {
  if (esLocal(new URL(baseUrl).hostname) && esLocal(new URL(dbUrl).hostname)) return;
  const perfiles = ['ADMISION', 'RECTOR', 'CURRICULAR', 'VCM', 'EC'];
  if (!env.E2E_DB_URL || perfiles.some((perfil) =>
    !env[`E2E_${perfil}_USER`] || !env[`E2E_${perfil}_PASSWORD`])) {
    throw new Error('Un destino remoto requiere E2E_DB_URL y credenciales E2E_* explícitas; no se usan las predeterminadas');
  }
};

const verificarDestinoAislado = ({ env, baseUrl, dbUrl }) => {
  if (env.E2E_EC_FIXTURES !== '1' || !env.E2E_DB_URL || env.E2E_DB_URL !== dbUrl) {
    throw new Error('Los fixtures EC requieren E2E_EC_FIXTURES=1 y E2E_DB_URL explícito');
  }
  const backend = new URL(baseUrl);
  const database = new URL(dbUrl);
  const nombreDb = decodeURIComponent(database.pathname.slice(1));
  if (!esLocal(backend.hostname) || !esLocal(database.hostname)
    || !/(^|[_-])(e2e|test)([_-]|$)/i.test(nombreDb)) {
    throw new Error('Los fixtures EC sólo se permiten con backend y PostgreSQL locales y una base _e2e o _test');
  }
};

const prepararProgramas = (prefijo, anios) => {
  const areas = [`${prefijo} Artes`, `${prefijo} Tecnología`];
  const nombres = {
    A: `${prefijo} Programa A`, B: `${prefijo} Programa B`,
    C: `${prefijo} Programa C`, D: `${prefijo} Programa D`, E: `${prefijo} Programa E`
  };
  const specs = [
    ['A1', nombres.A, areas[0], 'Curso', 'En línea', anios[0], 11],
    ['B1', nombres.B, areas[0], 'Taller', 'Presencial', anios[0], 5],
    ['C1', nombres.C, areas[1], 'Curso', 'Híbrida', anios[0], 7],
    ['A2', nombres.A, areas[0], 'Curso', 'En línea', anios[1], 13],
    ['D2', nombres.D, areas[1], 'Taller', 'Presencial', anios[1], null],
    ['E2', nombres.E, areas[1], 'Curso', 'Híbrida', anios[1], 9]
  ];
  return { areas, nombres, programas: specs.map(([sufijo, programa, area, tipo, modalidad, anio, matricula]) => ({
    idPrograma: `${prefijo}_${sufijo}`, programa, area, tipo, modalidad, anio, matricula
  })) };
};

const crearFixtureEc = async (db, { env = process.env, baseUrl, dbUrl, anios = [2024, 2025] }) => {
  verificarDestinoAislado({ env, baseUrl, dbUrl });
  const prefijo = `EC_E2E_${randomUUID().replace(/-/g, '')}`;
  const fixture = { ...prepararProgramas(prefijo, anios), anios, prefijo };
  fixture.ids = fixture.programas.map((programa) => programa.idPrograma);

  await db.query('BEGIN');
  try {
    for (const programa of fixture.programas) {
      await db.query(
        `INSERT INTO programas
          ("idPrograma", programa, modalidad, tipo, anio, "cuposProgramados", horas,
           "mesInicio", area, semestre, "empresaConvenio", "regionPrincipal", "sectorPrincipal",
           "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())`,
        [programa.idPrograma, programa.programa, programa.modalidad, programa.tipo,
          programa.anio, 30, 24, 'Marzo', programa.area, '1',
          'Sin convenio', 'Metropolitana', 'Servicios']
      );
      if (programa.matricula !== null) {
        await db.query(
          `INSERT INTO resultados_programa
            ("idPrograma", matricula, aprobados, reprobados, "tasaAprobacion",
             estado, ejecutado, "createdAt", "updatedAt")
           VALUES ($1, $2, $2, 0, 100, 'Finalizado', 'Sí', NOW(), NOW())`,
          [programa.idPrograma, programa.matricula]
        );
      }
    }
    await db.query('COMMIT');
    return fixture;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
};

const limpiarFixtureEc = async (db, fixture) => {
  if (!fixture?.ids?.length) return;
  await db.query('BEGIN');
  try {
    await db.query('DELETE FROM resultados_programa WHERE "idPrograma" = ANY($1::text[])', [fixture.ids]);
    await db.query('DELETE FROM programas WHERE "idPrograma" = ANY($1::text[])', [fixture.ids]);
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
};

module.exports = {
  verificarCredencialesRemotas, verificarDestinoAislado,
  prepararProgramas, crearFixtureEc, limpiarFixtureEc
};
