process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/piadi_test';

const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const service = require('../src/services/reporteGeneracionService');
const indicatorService = require('../src/services/indicatorService');
const provider = require('../src/services/indicatorProvider');
const integration = require('../src/services/metaIndicatorIntegrationService');
const { INDICATORS } = require('../src/services/indicatorCatalog');
const cache = require('../src/services/cacheService');

const {
  limpiarFiltros,
  resolverDimensiones,
  resolverCategoria,
  detectarLayout,
  ordenarPeriodos,
  formatoNumerico
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

const cuboPeriodo = (anio) => ({
  isTridimensional: true,
  rowDimension: 'beneficios', colDimension: 'periodo', depthDimension: 'sexo',
  columns: ['periodo:number:1', 'periodo:number:2'],
  columnLabels: { 'periodo:number:1': '1', 'periodo:number:2': '2' },
  depths: ['sexo:string:F', 'sexo:string:M', 'sexo:string:O', 'sexo:string:Sin dato', 'sexo:null'],
  depthLabels: {
    'sexo:string:F': 'F', 'sexo:string:M': 'M', 'sexo:string:O': 'O',
    'sexo:string:Sin dato': 'Sin dato', 'sexo:null': 'Sin dato'
  },
  cube: [
    {
      row: 'BECA ESTATAL', rowKey: 'beneficios:string:BECA ESTATAL',
      values: {
        'periodo:number:1': { total: 10 + anio - 2025, depthValues: {
          'sexo:string:F': 6, 'sexo:string:M': 2, 'sexo:string:O': 2, 'sexo:null': null
        } },
        'periodo:number:2': { total: 20 + anio - 2025, depthValues: {
          'sexo:string:F': 10, 'sexo:string:M': 6, 'sexo:string:O': 4, 'sexo:null': null
        } }
      }
    },
    {
      row: 'Sin dato', rowKey: 'beneficios:null',
      values: {
        'periodo:number:1': { total: null, depthValues: {} },
        'periodo:number:2': { total: 1, depthValues: { 'sexo:null': 1 } }
      }
    },
    {
      row: 'Sin beneficio', rowKey: 'beneficios:string:Sin beneficio',
      values: {
        'periodo:number:1': { total: 2, depthValues: { 'sexo:string:Sin dato': 2 } },
        'periodo:number:2': { total: null, depthValues: {} }
      }
    }
  ]
});

const original = indicatorService.getIndicatorDetailView;
const originales = [];
const stub = (object, name, replacement) => {
  originales.push([object, name, object[name]]);
  object[name] = replacement;
};
test.afterEach(() => {
  indicatorService.getIndicatorDetailView = original;
  while (originales.length) {
    const [object, name, value] = originales.pop();
    object[name] = value;
  }
  cache.flush();
});

const matrizSexo = {
  isBidimensional: true,
  rowDimension: 'beneficios',
  colDimension: 'sexo',
  columns: ['sexo:string:F', 'sexo:string:M', 'sexo:string:O'],
  columnLabels: { 'sexo:string:F': 'F', 'sexo:string:M': 'M', 'sexo:string:O': 'O' },
  matrix: [
    {
      row: 'BECA ESTATAL',
      rowKey: 'beneficios:string:BECA ESTATAL',
      values: { 'sexo:string:F': 6, 'sexo:string:M': 2, 'sexo:string:O': 2 },
      total: 10
    },
    {
      row: 'Sin dato',
      rowKey: 'beneficios:null',
      values: { 'sexo:string:F': 1, 'sexo:string:M': 0, 'sexo:string:O': 0 },
      total: 1
    }
  ]
};

const stubDetalle = () => {
  indicatorService.getIndicatorDetailView = async (key, query = {}) => {
    if (query.groupBy === 'beneficios' && query.splitBy === 'periodo' && query.splitBy2 === 'sexo') {
      return { data: cuboPeriodo(Number(query.year)) };
    }
    if (query.groupBy === 'beneficios' && query.splitBy === 'periodo') {
      return { data: matrizPeriodo(Number(query.year)) };
    }
    if (query.groupBy === 'beneficios' && query.splitBy === 'sexo') {
      return { data: matrizSexo };
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

const valorEnBloqueDePrueba = (rows, anio, categoria, periodo) => {
  const inicio = rows.findIndex((fila) => fila[0] === anio);
  assert.ok(inicio >= 0);
  const columna = rows[inicio + 1].findIndex((valor) => valor === periodo);
  assert.ok(columna > 0);
  const siguiente = rows.findIndex((fila, indice) => indice > inicio && Number.isInteger(fila[0]));
  const fin = siguiente < 0 ? rows.length : siguiente;
  const fila = rows.slice(inicio + 2, fin).find((item) => item[0] === categoria);
  assert.ok(fila);
  return fila[columna];
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
  assert.deepEqual(detectarLayout(dimensiones, 'beneficios', detalleBase), {
    tipo: 'A', categoria: 'beneficios', profundidad: 'sexo', conPeriodo: true
  });

  const sinPeriodo = new Set(['year', 'sexo']);
  assert.deepEqual(detectarLayout(sinPeriodo, 'beneficios', detalleBase), {
    tipo: 'A', categoria: 'beneficios', profundidad: 'sexo', conPeriodo: false
  });

  const categoriaSecundaria = new Set(['year', 'periodo', 'asignatura']);
  assert.deepEqual(detectarLayout(categoriaSecundaria, 'beneficios', detalleBase), {
    tipo: 'A', categoria: 'beneficios', profundidad: 'asignatura', conPeriodo: true
  });

  const detalleSexo = { ...detalleBase, groupBy: 'sexo' };
  assert.deepEqual(detectarLayout(new Set(['year', 'periodo', 'asignatura']), 'asignatura', detalleSexo), {
    tipo: 'A', categoria: 'sexo', profundidad: 'asignatura', conPeriodo: true
  });

  const sinSexo = new Set(['year', 'periodo']);
  assert.deepEqual(detectarLayout(sinSexo, 'beneficios', detalleBase), { tipo: 'B' });

  const soloAnio = new Set(['year']);
  assert.deepEqual(detectarLayout(soloAnio, 'beneficios', detalleBase), { tipo: 'C' });

  const sinDefault = new Set(['year', 'asignatura']);
  const detalleSinDefault = { ...detalleBase, groupBy: null };
  assert.equal(resolverCategoria(sinDefault, null, allowed), 'asignatura');
  assert.deepEqual(detectarLayout(sinDefault, 'asignatura', detalleSinDefault), { tipo: 'C' });
  assert.deepEqual(
    detectarLayout(
      new Set(['year', 'asignatura', 'region']),
      'asignatura',
      { ...detalleSinDefault, allowedGroupBy: [...allowed, 'region'] }
    ),
    { tipo: 'A', categoria: 'asignatura', profundidad: 'region', conPeriodo: false }
  );

  const reemplazaDefault = new Set(['year', 'asignatura']);
  assert.equal(resolverCategoria(reemplazaDefault, 'beneficios', allowed), 'asignatura');
  const soloSexo = new Set(['year', 'sexo']);
  assert.equal(resolverCategoria(soloSexo, null, allowed), 'sexo');

  assert.equal(resolverCategoria(new Set(['year']), null, allowed), null);
  assert.equal(detectarLayout(new Set(['periodo']), 'beneficios', detalleBase), null);
  assert.deepEqual(ordenarPeriodos(['2', '1', 'Sin dato']), ['1', '2', 'Sin dato']);

  assert.equal(formatoNumerico('number'), '#,##0');
  assert.equal(formatoNumerico('currency'), '"$"#,##0');
  assert.equal(formatoNumerico('percentage'), '0.00"%"');
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

test('genera hoja 1 real con bloques anuales, totales y subfilas de sexo indentadas', async () => {
  stubDetalle();
  const buffer = await service.armarExcel(reporte({
    fromYear: 2025, toYear: 2026,
    desag: ['beneficios_becas|Año', 'beneficios_becas|Período', 'beneficios_becas|Sexo']
  }));
  const rows = hojaIndicador(buffer);
  assert.equal(rows.some((fila) => String(fila[0]).includes('desglose por sexo aún no está disponible')), false);
  const anio2025 = rows.findIndex((fila) => fila[0] === 2025);
  const anio2026 = rows.findIndex((fila) => fila[0] === 2026);
  assert.ok(anio2025 > 0 && anio2026 > anio2025);
  assert.deepEqual(rows[anio2025 + 1].slice(0, 3), ['Beneficios / Sexo', 1, 2]);
  const beca = rows.findIndex((fila, index) => index > anio2025 && fila[0] === 'BECA ESTATAL');
  assert.deepEqual(rows[beca].slice(0, 3), ['BECA ESTATAL', 10, 20]);
  assert.deepEqual(rows[beca + 1].slice(0, 3), ['F', 6, 10]);
  assert.deepEqual(rows[beca + 2].slice(0, 3), ['M', 2, 6]);
  assert.deepEqual(rows[beca + 3].slice(0, 3), ['O', 2, 4]);
  const sinBeneficio = rows.findIndex((fila) => fila[0] === 'Sin beneficio');
  assert.ok(sinBeneficio > beca);
  assert.equal(rows[sinBeneficio][1], '');
  assert.equal(rows[sinBeneficio][2], 1);
  assert.ok(rows.some((fila) => fila[0] === 'Sin beneficio (valor literal)' && fila[1] === 2));
  assert.ok(rows.some((fila) => fila[0] === 'Sin dato (valor literal)'));
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const hoja = workbook.worksheets.find((sheet) => sheet.name.includes('Beneficios'));
  assert.equal(hoja.getRow(beca + 1).getCell(1).font.bold, true);
  assert.equal(hoja.getRow(beca + 1).getCell(2).numFmt, '#,##0');
  assert.equal(hoja.getRow(beca + 2).getCell(1).alignment.indent, 1);
  assert.equal(hoja.getRow(beca + 2).getCell(2).numFmt, '#,##0');
});

test('genera layout A sin período con dos dimensiones categóricas', async () => {
  stubDetalle();
  const buffer = await service.armarExcel(reporte({
    fromYear: 2025,
    toYear: 2026,
    desag: ['beneficios_becas|Año', 'beneficios_becas|Sexo']
  }));
  const rows = hojaIndicador(buffer);

  const indice2025 = rows.findIndex((fila) => fila[0] === 2025);
  assert.ok(indice2025 > 0);
  assert.deepEqual(rows[indice2025 + 1].slice(0, 4), ['Beneficios / Sexo', 'F', 'M', 'O']);
  const filaBeca = rows.find((fila, indice) =>
    indice > indice2025 && fila[0] === 'BECA ESTATAL');
  assert.deepEqual(filaBeca.slice(0, 4), ['BECA ESTATAL', 6, 2, 2]);
});

test('Hoja 1 recorre el detalle real y la fórmula DISTINCT con provider simulado', async () => {
  const registros = [
    { codCli: 'A', anio: 2025, periodo: 1, beneficios: 'Beca', sexo: 'F' },
    { codCli: 'A', anio: 2025, periodo: 1, beneficios: 'Beca', sexo: 'F' },
    { codCli: 'B', anio: 2025, periodo: 1, beneficios: 'Beca', sexo: 'M' },
    { codCli: 'A', anio: 2025, periodo: 2, beneficios: 'Beca', sexo: 'F' },
    { codCli: 'C', anio: 2026, periodo: 1, beneficios: 'Beca', sexo: null }
  ];
  stub(provider, 'getKpi', async () => ({
    key: 'beneficios_becas', departmentId: 'admision', name: 'Beneficios',
    description: 'Beneficios por estudiante', formulaKey: INDICATORS.beneficios_becas.formulaKey,
    unit: 'estudiantes', format: 'number'
  }));
  stub(provider, 'getDepartmentByKey', async () => ({ key: 'admision' }));
  stub(provider, 'getAdmissionCharacterizationRows', async (filters) => registros.filter((row) =>
    (filters.year == null || row.anio === filters.year)
    && (filters.fromYear == null || row.anio >= filters.fromYear)
    && (filters.toYear == null || row.anio <= filters.toYear)
    && (!filters.periodo?.length || filters.periodo.includes(row.periodo))));
  stub(integration, 'getIndicatorMetaContext', async () => null);
  const buffer = await service.armarExcel(reporte({
    fromYear: 2025, toYear: 2026,
    desag: ['beneficios_becas|Año', 'beneficios_becas|Período', 'beneficios_becas|Sexo']
  }));
  const rows = hojaIndicador(buffer);
  assert.equal(valorEnBloqueDePrueba(rows, 2025, 'Beca', 1), 2);
  assert.equal(valorEnBloqueDePrueba(rows, 2025, 'Beca', 2), 1);
  assert.equal(valorEnBloqueDePrueba(rows, 2026, 'Beca', 1), 1);
  assert.ok(rows.some((fila) => fila[0] === 'Sin dato'));
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

test('Hoja 1 conserva fallback visible si falla el cubo solicitado', async () => {
  indicatorService.getIndicatorDetailView = async (_key, query = {}) => {
    if (query.splitBy2) throw new Error('MATRIX_LIMIT_EXCEEDED');
    return { data: detalleBase };
  };
  const buffer = await service.armarExcel(reporte({
    year: 2025,
    desag: ['beneficios_becas|Año', 'beneficios_becas|Período', 'beneficios_becas|Sexo']
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

test('reporte legacy conserva groupBy y no fuerza la Hoja 1', async () => {
  const queries = [];
  indicatorService.getIndicatorDetailView = async (_key, query) => {
    queries.push(query);
    return { data: detalleBase };
  };
  const buffer = await service.armarExcel(reporte({ year: 2025, groupBy: 'beneficios' }));
  const rows = hojaIndicador(buffer);
  assert.equal(queries.length, 1);
  assert.equal(queries[0].groupBy, 'beneficios');
  assert.ok(rows.some((fila) => fila[0] === 'Categoría'));
  assert.equal(rows.some((fila) => fila[0] === 'Beneficios / Sexo'), false);
});

test('selección múltiple conserva Hoja 1 y tabla normal en el mismo libro', async () => {
  stubDetalle();
  const buffer = await service.armarExcel({
    ...reporte({ year: 2025, desag: [
      'beneficios_becas|Año', 'beneficios_becas|Período', 'beneficios_becas|Sexo'
    ] }),
    indicadores: ['beneficios_becas', 'matricula_por_asignatura']
  });
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  assert.equal(workbook.SheetNames.length, 3);
  const first = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[1]], { header: 1, defval: '' });
  const second = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[2]], { header: 1, defval: '' });
  assert.ok(first.some((fila) => fila[0] === 'Beneficios / Sexo'));
  assert.ok(second.some((fila) => fila[0] === 'Categoría'));
});
