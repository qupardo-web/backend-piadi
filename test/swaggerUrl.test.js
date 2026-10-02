const test = require('node:test');
const assert = require('node:assert/strict');

const swaggerModule = require.resolve('../src/config/swagger');
const originalSwaggerUrl = process.env.SWAGGER_URL;
const originalPort = process.env.PORT;

const loadServerUrl = ({ swaggerUrl, port } = {}) => {
  if (swaggerUrl === undefined) delete process.env.SWAGGER_URL;
  else process.env.SWAGGER_URL = swaggerUrl;
  if (port === undefined) delete process.env.PORT;
  else process.env.PORT = port;

  delete require.cache[swaggerModule];
  return require('../src/config/swagger').swaggerDocs.servers[0].url;
};

test.after(() => {
  delete require.cache[swaggerModule];
  if (originalSwaggerUrl === undefined) delete process.env.SWAGGER_URL;
  else process.env.SWAGGER_URL = originalSwaggerUrl;
  if (originalPort === undefined) delete process.env.PORT;
  else process.env.PORT = originalPort;
});

test('Swagger usa localhost y conserva el puerto configurado como fallback', () => {
  assert.equal(loadServerUrl({ port: '5050' }), 'http://localhost:5050');
});

test('Swagger usa SWAGGER_URL y normaliza barras finales', () => {
  assert.equal(
    loadServerUrl({ swaggerUrl: 'https://ejemplo.cl///', port: '5050' }),
    'https://ejemplo.cl'
  );
});
