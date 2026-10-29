process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/piadi_test';

const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const indicatorService = require('../src/services/indicatorService');
const reporteGeneracionService = require('../src/services/reporteGeneracionService');
const provider = require('../src/services/indicatorProvider');
const integration = require('../src/services/metaIndicatorIntegrationService');
const cache = require('../src/services/cacheService');
const { INDICATORS } = require('../src/services/indicatorCatalog');

const participaciones = [
  { anio: 2024, region: 'Norte', mujeres: 12, hombres: 8, noInforma: 2, totalPersonas: 22 },
  { anio: 2025, region: 'Norte', mujeres: 15, hombres: 10, noInforma: 5, totalPersonas: 30 },
  { anio: 2025, region: 'Sur', mujeres: 0, hombres: 7, noInforma: 0, totalPersonas: 7 }
];

const saved = [];
const stub = (object, name, replacement) => {
  saved.push([object, name, object[name]]);
  object[name] = replacement;
};
test.afterEach(() => {
  cache.flush();
  while (saved.length) {
    const [object, name, value] = saved.pop();
    object[name] = value;
  }
});

const fixture = () => {
  stub(provider, 'getKpi', async () => ({
    key: 'participaciones', departmentId: 'vinculacion_medio',
    name: 'Participaciones', description: 'Personas participantes',
    formulaKey: INDICATORS.participaciones.formulaKey,
    unit: 'personas', format: 'number'
  }));
  stub(provider, 'getDepartmentByKey', async () => ({ key: 'vinculacion_medio' }));
  stub(provider, 'getVcmParticipacionRows', async (filters) => participaciones.filter((row) =>
    (filters.year == null || row.anio === filters.year) &&
    (filters.fromYear == null || row.anio >= filters.fromYear) &&
    (filters.toYear == null || row.anio <= filters.toYear) &&
    (!filters.region?.length || filters.region.includes(row.region))
  ));
  stub(integration, 'getIndicatorMetaContext', async () => null);
};

const byLabel = (items) => Object.fromEntries(items.map((item) => [item.label, item]));

test('series por sexo usan contadores por año y conservan el contrato JSON', async () => {
  fixture();
  const { data } = await indicatorService.getIndicatorSeries('participaciones', {
    department: 'vinculacion_medio', groupBy: 'sexo', fromYear: '2024', toYear: '2025'
  });
  const series = byLabel(data.series);
  assert.equal(data.groupBy, 'sexo');
  assert.equal(data.hasData, true);
  assert.deepEqual(Object.keys(series).sort(), ['hombres', 'mujeres', 'noInforma']);
  assert.deepEqual(series.mujeres.points, [{ year: 2024, value: 12 }, { year: 2025, value: 15 }]);
  assert.deepEqual(series.hombres.points, [{ year: 2024, value: 8 }, { year: 2025, value: 17 }]);
  assert.deepEqual(series.noInforma.points, [{ year: 2024, value: 2 }, { year: 2025, value: 5 }]);
  assert.deepEqual(data.filters, { fromYear: 2024, toYear: 2025 });
});

test('filtros y categorías ausentes no fabrican datos de otro año o región', async () => {
  fixture();
  const query = { department: 'vinculacion_medio', groupBy: 'sexo', year: '2025', region: 'Sur' };
  const { data: series } = await indicatorService.getIndicatorSeries('participaciones', query);
  assert.deepEqual(series.series, [{ label: 'hombres', points: [{ year: 2025, value: 7 }] }]);
  const { data: breakdown } = await indicatorService.getIndicatorBreakdown('participaciones', query);
  assert.deepEqual(breakdown.items, [{ label: 'hombres', value: 7 }]);
  assert.equal(breakdown.filters.year, 2025);
  assert.deepEqual(breakdown.filters.region, ['Sur']);
  const view = await indicatorService.getIndicatorDetail('participaciones', {
    ...query, splitBy: 'region'
  });
  assert.deepEqual(view.matrix.map((row) => row.row), ['hombres']);
  assert.equal(view.totals.general, 7);
});

test('matriz sexo × región calcula celdas y marginales sin triplicar personas', async () => {
  fixture();
  const view = await indicatorService.getIndicatorDetail('participaciones', {
    department: 'vinculacion_medio', groupBy: 'sexo', splitBy: 'region', year: '2025'
  });
  assert.equal(view.isBidimensional, true);
  assert.equal(view.total, 37);
  assert.equal(view.totals.general, 37);
  assert.deepEqual(view.columns, ['region:string:Norte', 'region:string:Sur']);
  assert.equal(view.totals.columns['region:string:Norte'], 30);
  assert.equal(view.totals.columns['region:string:Sur'], 7);
  const rows = byLabel(view.matrix.map((row) => ({ ...row, label: row.row })));
  assert.equal(rows.mujeres.values['region:string:Norte'], 15);
  assert.equal(rows.mujeres.values['region:string:Sur'], null);
  assert.equal(rows.mujeres.total, 15);
  assert.equal(rows.hombres.values['region:string:Norte'], 10);
  assert.equal(rows.hombres.values['region:string:Sur'], 7);
  assert.equal(rows.hombres.total, 17);
  assert.equal(rows.noInforma.values['region:string:Norte'], 5);
  assert.equal(rows.noInforma.total, 5);
  assert.deepEqual(byLabel(view.table), {
    hombres: { label: 'hombres', value: 17 },
    mujeres: { label: 'mujeres', value: 15 },
    noInforma: { label: 'noInforma', value: 5 }
  });
});

test('matriz región × sexo conserva los mismos totales y categorías del breakdown', async () => {
  fixture();
  const view = await indicatorService.getIndicatorDetail('participaciones', {
    department: 'vinculacion_medio', groupBy: 'region', splitBy: 'sexo', year: '2025'
  });
  assert.deepEqual(view.columns, ['sexo:string:hombres', 'sexo:string:mujeres', 'sexo:string:noInforma']);
  assert.equal(view.totals.columns['sexo:string:hombres'], 17);
  assert.equal(view.totals.columns['sexo:string:mujeres'], 15);
  assert.equal(view.totals.columns['sexo:string:noInforma'], 5);
  assert.equal(view.totals.general, 37);
  const norte = view.matrix.find((row) => row.row === 'Norte');
  const sur = view.matrix.find((row) => row.row === 'Sur');
  assert.equal(norte.total, 30);
  assert.equal(sur.total, 7);
  assert.equal(norte.values['sexo:string:mujeres'], 15);
  assert.equal(norte.values['sexo:string:hombres'], 10);
  assert.equal(norte.values['sexo:string:noInforma'], 5);
  assert.equal(sur.values['sexo:string:hombres'], 7);
  assert.equal(sur.values['sexo:string:mujeres'], null);
});

test('matriz sexo × año conserva historia y no mezcla años en las intersecciones', async () => {
  fixture();
  const view = await indicatorService.getIndicatorDetail('participaciones', {
    department: 'vinculacion_medio', groupBy: 'sexo', splitBy: 'year',
    fromYear: '2024', toYear: '2025'
  });
  assert.deepEqual(view.columns, ['year:number:2024', 'year:number:2025']);
  assert.equal(view.totals.columns['year:number:2024'], 22);
  assert.equal(view.totals.columns['year:number:2025'], 37);
  assert.equal(view.totals.general, 59);
  const women = view.matrix.find((row) => row.row === 'mujeres');
  const men = view.matrix.find((row) => row.row === 'hombres');
  assert.equal(women.values['year:number:2024'], 12);
  assert.equal(women.values['year:number:2025'], 15);
  assert.equal(men.values['year:number:2024'], 8);
  assert.equal(men.values['year:number:2025'], 17);
});

test('sin filas mantiene ausencia y el cubo 3D sigue rechazando sexo', async () => {
  fixture();
  const empty = await indicatorService.getIndicatorDetail('participaciones', {
    department: 'vinculacion_medio', groupBy: 'region', splitBy: 'sexo', year: '2030'
  });
  assert.deepEqual(empty.matrix, []);
  assert.equal(empty.totals.general, null);
  assert.equal(empty.hasData, false);
  await assert.rejects(indicatorService.getIndicatorDetail('participaciones', {
    department: 'vinculacion_medio', groupBy: 'region', splitBy: 'year',
    splitBy2: 'sexo', year: '2025'
  }), (error) => error.statusCode === 400 && error.code === 'UNSUPPORTED_GROUP_DIMENSION');
});

test('Excel existente consume la matriz corregida de región × sexo sin cambiar el generador', async () => {
  fixture();
  const buffer = await reporteGeneracionService.armarExcel({
    id: 1, nombre: 'Participaciones VcM', tipo: 'PERSONALIZADO',
    area: { name: 'Vinculación con el Medio' }, indicadores: ['participaciones'],
    filtros: {
      fromYear: 2024, toYear: 2025,
      desag: ['participaciones|Año', 'participaciones|Región', 'participaciones|Sexo']
    }
  });
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.SheetNames.find((name) => name.includes('Participaciones'));
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { header: 1, defval: '' });
  const year = rows.findIndex((row) => row[0] === 2025);
  assert.ok(year >= 0);
  const header = rows[year + 1];
  const norte = rows.slice(year + 2).find((row) => row[0] === 'Norte');
  const sur = rows.slice(year + 2).find((row) => row[0] === 'Sur');
  assert.deepEqual(header.slice(1), ['hombres', 'mujeres', 'noInforma']);
  assert.equal(norte[header.indexOf('hombres')], 10);
  assert.equal(norte[header.indexOf('mujeres')], 15);
  assert.equal(norte[header.indexOf('noInforma')], 5);
  assert.equal(sur[header.indexOf('hombres')], 7);
});
