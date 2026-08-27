process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const models = require('../src/models');
const provider = require('../src/services/indicatorProvider');
const indicatorService = require('../src/services/indicatorService');
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

const filters = (query = {}) => parseIndicatorFilters({ department: 'vinculacion_medio', ...query });

const captureConvenioWhere = async (query) => {
  let captured;
  stub(models.Convenio, 'findAll', async (options) => { captured = options.where; return []; });
  await provider.getVcmConvenioRows(filters(query));
  return captured;
};

test('sin areaVinculada no agrega condición y una request posterior restaura el where base', async () => {
  const queries = [];
  stub(models.Convenio, 'findAll', async (options) => { queries.push(options.where); return []; });
  await provider.getVcmConvenioRows(filters());
  await provider.getVcmConvenioRows(filters({ areaVinculada: 'Docencia' }));
  await provider.getVcmConvenioRows(filters());
  assert.equal(queries[0].areaVinculada, undefined);
  assert.equal(queries[1].areaVinculada[Op.iLike], 'Docencia');
  assert.equal(queries[2].areaVinculada, undefined);
});

test('aplica distintas áreas mediante comparación case-insensitive', async () => {
  for (const area of ['Docencia', 'Investigación', 'dOcEnCiA']) {
    const where = await captureConvenioWhere({ areaVinculada: area });
    assert.equal(where.areaVinculada[Op.iLike], area);
  }
});

test('combina areaVinculada con región y sector sin reemplazar condiciones', async () => {
  const where = await captureConvenioWhere({
    areaVinculada: 'Docencia', region: 'Valparaíso', sector: 'Público'
  });
  assert.equal(where.areaVinculada[Op.iLike], 'Docencia');
  assert.equal(where.region[Op.iLike], 'Valparaíso');
  assert.equal(where.sector[Op.iLike], 'Público');
});

test('combina múltiples áreas con filtros de año', async () => {
  const where = await captureConvenioWhere({
    areaVinculada: 'Docencia,Investigación', fromYear: '2024', toYear: '2026'
  });
  assert.equal(where.areaVinculada[Op.or].length, 2);
  assert.deepEqual(where.anioFirma[Op.between], [2024, 2026]);
});

test('groupBy areaVinculada continúa disponible para indicadores de convenios', async () => {
  stub(provider, 'getDepartmentByKey', async () => ({ key: 'vinculacion_medio' }));
  stub(provider, 'getKpi', async () => ({
    key: 'total_convenios', formulaKey: 'COUNT_CONVENIOS', format: 'number', unit: 'convenios'
  }));
  stub(provider, 'getVcmConvenioRows', async () => [
    { areaVinculada: 'Docencia', anio: 2026, activo: true },
    { areaVinculada: 'Investigación', anio: 2026, activo: true }
  ]);
  const result = await indicatorService.getIndicatorBreakdown('total_convenios', {
    department: 'vinculacion_medio', groupBy: 'areaVinculada'
  });
  assert.equal(result.data.groupBy, 'areaVinculada');
  assert.deepEqual(result.data.items.map((item) => item.label), ['Docencia', 'Investigación']);
});

test('getFilterOptions expone áreas reales, ordenadas y sin vacíos ni duplicados', async () => {
  stub(models.Convenio, 'findAll', async () => [
    { anioFirma: 2026, areaVinculada: ' Vinculación ' },
    { anioFirma: 2026, areaVinculada: 'docencia' },
    { anioFirma: 2026, areaVinculada: 'Docencia' },
    { anioFirma: 2026, areaVinculada: '' },
    { anioFirma: 2026, areaVinculada: '   ' },
    { anioFirma: 2026, areaVinculada: null }
  ]);
  stub(models.Actividad, 'findAll', async () => []);
  stub(models.Participacion, 'findAll', async () => []);
  stub(models.ArticulacionTP, 'findAll', async () => []);
  const options = await provider.getFilterOptions('vinculacion_medio', filters());
  assert.deepEqual(options.areas, ['docencia', 'Vinculación']);
});
