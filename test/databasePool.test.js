const test = require('node:test');
const assert = require('node:assert/strict');

const databaseModule = require.resolve('../src/config/database');
const envNames = [
  'DATABASE_URL',
  'DB_POOL_MAX',
  'DB_POOL_MIN',
  'DB_POOL_ACQUIRE',
  'DB_POOL_IDLE'
];
const originalEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));

const loadPool = (values = {}) => {
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/piadi_test';
  for (const name of envNames.slice(1)) {
    if (values[name] === undefined) delete process.env[name];
    else process.env[name] = values[name];
  }
  delete require.cache[databaseModule];
  return require('../src/config/database').options.pool;
};

test.after(() => {
  delete require.cache[databaseModule];
  for (const name of envNames) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
});

test('el pool conserva los valores por defecto sin variables', () => {
  assert.deepEqual(loadPool(), {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  });
});

test('el pool acepta valores configurados como números', () => {
  const pool = loadPool({
    DB_POOL_MAX: '12',
    DB_POOL_MIN: '2',
    DB_POOL_ACQUIRE: '45000',
    DB_POOL_IDLE: '15000'
  });

  assert.deepEqual(pool, {
    max: 12,
    min: 2,
    acquire: 45000,
    idle: 15000
  });
  for (const value of Object.values(pool)) assert.equal(typeof value, 'number');
});

test('valores inválidos usan defaults seguros y min nunca supera max', () => {
  assert.deepEqual(loadPool({
    DB_POOL_MAX: 'abc',
    DB_POOL_MIN: '-1',
    DB_POOL_ACQUIRE: '10.5',
    DB_POOL_IDLE: '-100'
  }), {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  });

  assert.equal(loadPool({ DB_POOL_MAX: '2', DB_POOL_MIN: '3' }).min, 0);
});
