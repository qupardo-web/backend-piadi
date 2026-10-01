const test = require('node:test');
const assert = require('node:assert/strict');

const databaseModule = require.resolve('../src/config/database');
const originalNodeEnv = process.env.NODE_ENV;
const originalDatabaseUrl = process.env.DATABASE_URL;

const loadLogging = (nodeEnv) => {
  if (nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = nodeEnv;
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/piadi_test';
  delete require.cache[databaseModule];
  return require('../src/config/database').options.logging;
};

test.after(() => {
  delete require.cache[databaseModule];
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
});

test('development habilita logging SQL', () => {
  assert.equal(loadLogging('development'), console.log);
});

test('production deshabilita logging SQL', () => {
  assert.equal(loadLogging('production'), false);
});

test('test deshabilita logging SQL', () => {
  assert.equal(loadLogging('test'), false);
});

test('NODE_ENV ausente aplica el default seguro sin logging SQL', () => {
  assert.equal(loadLogging(undefined), false);
});
