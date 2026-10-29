const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  verificarCredencialesRemotas, verificarDestinoAislado,
  prepararProgramas, crearFixtureEc, limpiarFixtureEc
} = require('../scripts/fixtures/reporteEc');

const destino = {
  env: {
    E2E_EC_FIXTURES: '1',
    E2E_DB_URL: 'postgresql://tester:private@localhost:5432/piadi_e2e'
  },
  baseUrl: 'http://localhost:5000',
  dbUrl: 'postgresql://tester:private@localhost:5432/piadi_e2e'
};

test('fixture EC exige confirmación, URL explícita y destino local de pruebas', async () => {
  const consultas = [];
  const db = { query: async (...args) => { consultas.push(args); return { rows: [] }; } };
  for (const opciones of [
    { ...destino, env: {} },
    { ...destino, env: { ...destino.env, E2E_DB_URL: 'postgresql://localhost/otra_e2e' } },
    { ...destino, baseUrl: 'https://piadi.example.com' },
    { ...destino, dbUrl: 'postgresql://tester:private@db.example.com:5432/piadi_e2e' },
    { ...destino, dbUrl: 'postgresql://tester:private@localhost:5432/institucional' }
  ]) {
    assert.throws(() => verificarDestinoAislado(opciones));
    await assert.rejects(crearFixtureEc(db, opciones));
  }
  assert.equal(consultas.length, 0, 'Ninguna comprobación fallida debe escribir en PostgreSQL');
});

test('destinos remotos no utilizan credenciales E2E predeterminadas', () => {
  assert.throws(() => verificarCredencialesRemotas({
    env: {}, baseUrl: 'https://piadi.example.com', dbUrl: destino.dbUrl
  }), /credenciales E2E/);
  const env = { E2E_DB_URL: destino.dbUrl };
  for (const perfil of ['ADMISION', 'RECTOR', 'CURRICULAR', 'VCM', 'EC']) {
    env[`E2E_${perfil}_USER`] = 'usuario-explicito';
    env[`E2E_${perfil}_PASSWORD`] = 'clave-de-prueba';
  }
  assert.doesNotThrow(() => verificarCredencialesRemotas({
    env, baseUrl: 'https://piadi.example.com', dbUrl: destino.dbUrl
  }));
});

test('fixture EC contiene dos años, dimensiones variadas y un programa sin resultados', () => {
  const fixture = prepararProgramas('EC_E2E_prueba', [2024, 2025]);
  assert.equal(fixture.programas.length, 6);
  assert.deepEqual([...new Set(fixture.programas.map((p) => p.anio))], [2024, 2025]);
  assert.equal(new Set(fixture.programas.map((p) => p.area)).size, 2);
  assert.equal(new Set(fixture.programas.map((p) => p.tipo)).size, 2);
  assert.equal(new Set(fixture.programas.map((p) => p.modalidad)).size, 3);
  assert.equal(fixture.programas.filter((p) => p.matricula === null).length, 1);
  assert.deepEqual(fixture.programas.filter((p) => p.programa === fixture.nombres.A)
    .map((p) => p.matricula), [11, 13]);
});

test('fixture EC inserta en transacción y limpia sólo sus propios IDs', async () => {
  const consultas = [];
  const db = { query: async (sql, params) => { consultas.push({ sql, params }); return { rows: [] }; } };
  const fixture = await crearFixtureEc(db, destino);
  assert.equal(consultas[0].sql, 'BEGIN');
  assert.equal(consultas.at(-1).sql, 'COMMIT');
  assert.equal(consultas.filter(({ sql }) => sql.includes('INSERT INTO programas')).length, 6);
  assert.equal(consultas.filter(({ sql }) => sql.includes('INSERT INTO resultados_programa')).length, 5);
  await limpiarFixtureEc(db, fixture);
  const borrados = consultas.filter(({ sql }) => sql.startsWith('DELETE FROM'));
  assert.equal(borrados.length, 2);
  assert.ok(borrados.every(({ params }) => params.length === 1
    && params[0].every((id) => fixture.ids.includes(id))));
  assert.equal(consultas.at(-1).sql, 'COMMIT');
});

test('si una inserción falla se revierte sin borrar registros ajenos', async () => {
  const consultas = [];
  const db = { query: async (sql) => {
    consultas.push(sql);
    if (sql.includes('INSERT INTO programas')) throw new Error('fallo simulado');
    return { rows: [] };
  } };
  await assert.rejects(crearFixtureEc(db, destino), /fallo simulado/);
  assert.deepEqual(consultas.map((sql) => sql === 'BEGIN' || sql === 'ROLLBACK' ? sql : 'INSERT'),
    ['BEGIN', 'INSERT', 'ROLLBACK']);
});

test('la selección E2E limita casos EC sin conectar ni escribir archivos', () => {
  const outputDir = path.join(os.tmpdir(), `piadi-e2e-list-${process.pid}-${Date.now()}`);
  const result = spawnSync(process.execPath, [path.join(__dirname, '../scripts/e2e-reporte-excel.js'), '--list-cases'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      E2E_CASES: '21-ec-sin-datos,22-ec-oferta-por-area,23-ec-oferta-por-modalidad-y-tipo,24-ec-matricula-por-programa',
      E2E_EC_FIXTURES: '1',
      E2E_OUTDIR: outputDir
    }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split(/\r?\n/), [
    '21-ec-sin-datos', '22-ec-oferta-por-area',
    '23-ec-oferta-por-modalidad-y-tipo', '24-ec-matricula-por-programa'
  ]);
  assert.equal(fs.existsSync(outputDir), false);
});

test('la selección E2E rechaza casos desconocidos y fixtures sin habilitación', () => {
  const script = path.join(__dirname, '../scripts/e2e-reporte-excel.js');
  for (const [names, flag, expected] of [
    ['caso-inexistente', '1', 'desconocidos'],
    ['22-ec-oferta-por-area', '0', 'E2E_EC_FIXTURES=1'],
    ['21-ec-sin-datos', '0', 'E2E_EC_FIXTURES=1'],
    ['', '1', 'no puede estar vacío']
  ]) {
    const result = spawnSync(process.execPath, [script, '--list-cases'], {
      encoding: 'utf8',
      env: { ...process.env, E2E_CASES: names, E2E_EC_FIXTURES: flag }
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(expected));
  }
});
