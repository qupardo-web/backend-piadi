process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/piadi_test';

const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const service = require('../src/services/reporteGeneracionService');
const indicatorService = require('../src/services/indicatorService');
const cache = require('../src/services/cacheService');

const {
  limpiarFiltros,
  resolverDimensiones,
  resolverCategoria,
  detectarLayout,
  ordenarPeriodos
} = service.__test;

const allowed = ['year', 'periodo', 'sexo', 'beneficios', 'asignatura'];
const detalleBase = {
  indicatorKey: 'beneficios_becas',
  title: 'Beneficios y becas',
  description: 'Cantidad y tipo de beneficios estudiantiles.',
  unit: 'estudiantes',
  format: 'number',
  groupBy: 'beneficios',
  allowedGroupBy: allowed,
  dimensionLabels: {
    year: 'Año',
    periodo: 'Período',
    sexo: 'Sexo',
    beneficios: 'Beneficios',
    asignatura: 'Asignatura'
  },
  hasData: true,
  total: 10,
  formattedTotal: '10',
  disaggregated: true,
  table: [{ label: 'BECA ESTATAL', value: 10 }],
  series: [],
  period: { from: 2023, to: 2024 }
};

const matrizPeriodo = (anio) => ({
  isBidimensional: true,
  rowDimension: 'beneficios',
  colDimension: 'periodo',
  columns: ['periodo:number:1', 'periodo:number:2'],
  columnLabels: { 'periodo:number:1': '1', 'periodo:number:2': '2' },
  matrix: [
    {
      row: 'BECA ESTATAL',
      rowKey: 'beneficios:string:BECA ESTATAL',
      values: { 'periodo:number:1': 10 + anio - 2023, 'periodo:number:2': 20 + anio - 2023 },
      total: 30
    },
    {
      row: 'SIN BENEFICIO',
      rowKey: 'beneficios:string:SIN BENEFICIO',
      values: { 'periodo:number:1': 1, 'periodo:number:2': 2 },
      total: 3
    },
    {
      row: 'Sin dato',
      rowKey: 'beneficios:null',
      values: { 'periodo:number:1': null, 'periodo:number:2': 4 },
      total: 4
    }
  ]
});

const matrizAnio = {
  isBidimensional: true,
  rowDimension: 'beneficios',
  colDimension: 'year',
  columns: ['year:number:2023', 'year:number:2024'],
  columnLabels: { 'year:number:2023': '2023', 'year:number:2024': '2024' },
  matrix: [
    {
      row: 'BECA ESTATAL',
      rowKey: 'beneficios:string:BECA ESTATAL',
      values: { 'year:number:2023': 5, 'year:number:2024': 7 },
      total: 12
    },
    {
      row: 'Sin dato',
      rowKey: 'beneficios:null',
      values: { 'year:number:2023': null, 'year:number:2024': 2 },
      total: 2
    }
  ]
};

const original = indicatorService.getIndicatorDetailView;
test.afterEach(() => {
  indicatorService.getIndicatorDetailView = original;
  cache.flush();
});

const stubDetalle = () => {
  indicatorService.getIndicatorDetailView = async (key, query = {}) => {
    if (query.groupBy === 'beneficios' && query.splitBy === 'periodo') {
      return { data: matrizPeriodo(Number(query.year)) };
    }
    if (query.groupBy === 'beneficios' && query.splitBy === 'year') {
      return { data: matrizAnio };
    }
    return { data: detalleBase };
  };
};

const reporte = (filtros) => ({
  id: 1,
  nombre: 'Reporte E2E',
  tipo: 'PERSONALIZADO',
  area: { name: 'Admisión' },
  indicadores: ['beneficios_becas'],
  filtros
});

const hojaIndicador = (buffer) => {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const nombre = wb.SheetNames.find((sheet) => sheet.includes('Beneficios'));
  return XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, defval: '' });
};

const hojaResumen = (buffer) => {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  return XLSX.utils.sheet_to_json(wb.Sheets.Resumen, { header: 1, defval: '' });
};

test('detecta dimensiones, categoría y layout sin lógica por indicador', () => {
  assert.deepEqual(
    limpiarFiltros({ fromYear: 2025, desag: ['x'], indicatorGroupBys: {}, groupBy: 'sexo' }),
    { fromYear: 2025 }
  );
  assert.deepEqual(
    limpiarFiltros({ fromYear: 2025, groupBy: 'sexo' }, true),
    { fromYear: 2025, groupBy: 'sexo' }
  );

  const dimensiones = resolverDimensiones(
    'beneficios_becas',
    { desag: ['beneficios_becas|Año', 'beneficios_becas|Período', 'beneficios_becas|Sexo'] },
    detalleBase
  ).seleccionadas;
  assert.deepEqual([...dimensiones], ['year', 'periodo', 'sexo']);
  assert.equal(resolverCategoria(dimensiones, 'beneficios', allowed), 'beneficios');
  assert.deepEqual(detectarLayout(dimensiones, 'beneficios', detalleBase), { tipo: 'A' });

  const sinSexo = new Set(['year', 'periodo']);
  assert.deepEqual(detectarLayout(sinSexo, 'beneficios', detalleBase), { tipo: 'B' });

  const soloAnio = new Set(['year']);
  assert.deepEqual(detectarLayout(soloAnio, 'beneficios', detalleBase), { tipo: 'C' });

  const sinDefault = new Set(['year', 'asignatura']);
  assert.equal(resolverCategoria(sinDefault, null, allowed), 'asignatura');
  assert.deepEqual(detectarLayout(sinDefault, 'asignatura', detalleBase), { tipo: 'C' });

  const reemplazaDefault = new Set(['year', 'asignatura']);
  assert.equal(resolverCategoria(reemplazaDefault, 'beneficios', allowed), 'asignatura');
  const soloSexo = new Set(['year', 'sexo']);
  assert.equal(resolverCategoria(soloSexo, null, allowed), 'sexo');

  assert.equal(resolverCategoria(new Set(['year']), null, allowed), null);
  assert.equal(detectarLayout(new Set(['periodo']), 'beneficios', detalleBase), null);
  assert.deepEqual(ordenarPeriodos(['2', '1', 'Sin dato']), ['1', '2', 'Sin dato']);
});

test('genera hoja 3 con bloques por año, periodos y beneficio nulo', async () => {
  stubDetalle();
  const buffer = await service.armarExcel(reporte({
    fromYear: 2023,
    toYear: 2024,
    desag: ['beneficios_becas|Año', 'beneficios_becas|Período']
  }));
  const rows = hojaIndicador(buffer);

  const indice2023 = rows.findIndex((fila) => fila[0] === 2023);
  assert.ok(indice2023 > 0);
  assert.deepEqual(rows[indice2023 + 1].slice(0, 3), ['Desglose por Beneficios', 1, 2]);

  const filaBeca = rows.find((fila) => fila[0] === 'BECA ESTATAL');
  assert.deepEqual(filaBeca.slice(0, 3), ['BECA ESTATAL', 10, 20]);
  const filaSinBeneficio = rows.find((fila) => fila[0] === 'Sin beneficio');
  assert.deepEqual(filaSinBeneficio.slice(0, 3), ['Sin beneficio', 0, 4]);
  assert.ok(rows.some((fila) => fila[0] === 2024));
});

test('genera hoja 4 con años como columnas', async () => {
  stubDetalle();
  const buffer = await service.armarExcel(reporte({
    fromYear: 2023,
    toYear: 2024,
    desag: ['beneficios_becas|Año']
  }));
  const rows = hojaIndicador(buffer);

  const encabezado = rows.find((fila) => fila[0] === 'Desglose por Beneficios');
  assert.deepEqual(encabezado.slice(0, 3), ['Desglose por Beneficios', 2023, 2024]);
  const filaBeca = rows.find((fila) => fila[0] === 'BECA ESTATAL');
  assert.deepEqual(filaBeca.slice(0, 3), ['BECA ESTATAL', 5, 7]);
  const filaNula = rows.find((fila) => fila[0] === 'Sin beneficio');
  assert.deepEqual(filaNula.slice(0, 3), ['Sin beneficio', 0, 2]);
});

test('degrada hoja 1 a hoja 3 con aviso cuando se pide sexo', async () => {
  stubDetalle();
  const buffer = await service.armarExcel(reporte({
    year: 2025,
    desag: ['beneficios_becas|Año', 'beneficios_becas|Período', 'beneficios_becas|Sexo']
  }));
  const rows = hojaIndicador(buffer);

  assert.ok(rows.some((fila) => String(fila[0]).includes('desglose por sexo')));
  assert.equal(rows.some((fila) => fila[0] === 'F'), false);
  assert.ok(rows.some((fila) => fila[0] === 'Desglose por Beneficios'));
});

test('si la matriz especial falla, cae en la tabla actual con aviso', async () => {
  indicatorService.getIndicatorDetailView = async (_key, query = {}) => {
    if (query.splitBy) throw new Error('MATRIX_LIMIT_EXCEEDED');
    return { data: detalleBase };
  };
  const buffer = await service.armarExcel(reporte({
    fromYear: 2023,
    toYear: 2024,
    desag: ['beneficios_becas|Año']
  }));
  const rows = hojaIndicador(buffer);
  assert.ok(rows.some((fila) => String(fila[0]).includes('No se pudo generar la vista solicitada')));
  assert.ok(rows.some((fila) => fila[0] === 'Categoría'));
});

test('el resumen explicita el año de referencia y la lógica del valor', async () => {
  stubDetalle();
  const buffer = await service.armarExcel(reporte({ fromYear: 2023, toYear: 2024, desag: [] }));
  const rows = hojaResumen(buffer);

  assert.ok(rows.some((fila) => String(fila[0]).includes('año de referencia')));
  const encabezado = rows.find((fila) => fila[0] === 'Indicador');
  assert.deepEqual(encabezado.slice(0, 3), ['Indicador', 'Año ref.', 'Valor']);
  const fila = rows.find((fila) => fila[0] === 'Beneficios y becas');
  assert.equal(fila[1], 2024);
  assert.equal(fila[2], '10');
});

test('sin desagregación conserva la tabla actual', async () => {
  stubDetalle();
  const buffer = await service.armarExcel(reporte({ fromYear: 2023, toYear: 2024, desag: [] }));
  const rows = hojaIndicador(buffer);

  const encabezado = rows.find((fila) => fila[0] === 'Categoría');
  assert.deepEqual(encabezado.slice(0, 2), ['Categoría', 'Valor']);
  assert.ok(rows.some((fila) => fila[0] === 'BECA ESTATAL' && fila[1] === 10));
});
