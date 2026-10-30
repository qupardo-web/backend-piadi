process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/piadi_test';
const test = require('node:test');
const assert = require('node:assert/strict');
const { HELP_MODULES } = require('../src/config/helpModules');
const { HELP_SEEDS } = require('../src/services/seedHelpEntries');

test('seedHelpEntries contiene exactamente 3 entradas por cada uno de los 11 módulos', () => {
  assert.equal(HELP_SEEDS.length, HELP_MODULES.length * 3, 'Debe haber 33 entradas en total');

  for (const mod of HELP_MODULES) {
    const entries = HELP_SEEDS.filter(e => e.modulo === mod);
    assert.equal(entries.length, 3, `El módulo ${mod} debe tener exactamente 3 entradas`);

    // Verificar orden
    const orders = entries.map(e => e.orden).sort();
    assert.deepEqual(orders, [1, 2, 3], `El módulo ${mod} debe tener órdenes 1, 2 y 3`);

    // Verificar contenido texto plano sin HTML
    for (const e of entries) {
      assert.ok(e.pregunta && typeof e.pregunta === 'string', 'Pregunta debe ser string');
      assert.ok(e.respuesta && typeof e.respuesta === 'string', 'Respuesta debe ser string');
      assert.ok(!/[<>]/.test(e.pregunta), 'Pregunta no debe contener HTML');
      assert.ok(!/[<>]/.test(e.respuesta), 'Respuesta no debe contener HTML');
    }
  }
});
