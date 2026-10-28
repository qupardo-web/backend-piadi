const ExcelJS = require('exceljs');
const { ReporteEjecucion } = require('../models');
const reporteService = require('./reporteService');
const indicatorService = require('./indicatorService');
const { DIMENSION_LABELS } = require('./indicatorCatalog');
const { auditarReporte } = require('./reporteAuditoria');
const { ValidationError } = require('../utils/errors');

const MAX_SHEET_NAME = 31;

const COLOR_PRIMARIO = 'FF161796';
const COLOR_AVISO = 'FF9A6700';
const FONDO_AVISO = 'FFFFF4CE';
const BORDE_FINO = {
  top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
  left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
  bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
  right: { style: 'thin', color: { argb: 'FFD9D9D9' } }
};
const estiloTituloHoja = (cell) => {
  cell.font = { bold: true, size: 14, color: { argb: COLOR_PRIMARIO } };
};
const estiloEncabezado = (row) => {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_PRIMARIO } };
    cell.border = BORDE_FINO;
  });
};
const estiloDato = (row) => {
  row.eachCell((cell) => { cell.border = BORDE_FINO; });
};

const FILTROS_INTERNOS = ['desag', 'filtrosSeleccionados', 'indicatorGroupBys'];

const slug = (texto) => String(texto || 'reporte')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .toLowerCase()
  .slice(0, 40) || 'reporte';

const nombreArchivo = (reporte) =>
  `reporte-${reporte.id}-${slug(reporte.nombre)}-${new Date().toISOString().slice(0, 10)}.xlsx`;

const nombreHoja = (indice, titulo) =>
  `${indice + 1}. ${titulo || 'Indicador'}`.slice(0, MAX_SHEET_NAME);

const filaTabla = (fila) =>
  fila.label !== undefined ? [fila.label, fila.value] : [fila.year, fila.value];

const normalizarTexto = (valor) => String(valor ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase();

const valorColumna = (label) => {
  const numero = Number(label);
  return Number.isFinite(numero) && String(numero) === String(label) ? numero : label;
};

// En reportes nuevos (con `desag`) las dimensiones se resuelven desde ahí y se
// ignoran groupBy/splitBy heredados. En reportes legacy sin `desag` se conservan
// para no cambiar la tabla actual.
const limpiarFiltros = (filtros, conservarDimensiones = false) => {
  if (!filtros || typeof filtros !== 'object' || Array.isArray(filtros)) return {};
  const limpio = { ...filtros };
  for (const key of FILTROS_INTERNOS) delete limpio[key];
  if (!conservarDimensiones) {
    delete limpio.groupBy;
    delete limpio.splitBy;
  }
  return limpio;
};

const construirMapaDimensiones = (dimensionLabels = {}) => {
  const mapa = new Map();
  for (const [key, label] of Object.entries(dimensionLabels || {})) {
    mapa.set(normalizarTexto(label), key);
    mapa.set(normalizarTexto(key), key);
  }
  for (const [key, label] of Object.entries(DIMENSION_LABELS)) {
    if (!mapa.has(normalizarTexto(label))) mapa.set(normalizarTexto(label), key);
    if (!mapa.has(normalizarTexto(key))) mapa.set(normalizarTexto(key), key);
  }
  const alias = {
    year: ['year', 'anio', 'ano', 'año'],
    periodo: ['periodo', 'período'],
    sexo: ['sexo'],
    beneficios: ['beneficios', 'beneficio']
  };
  for (const [key, values] of Object.entries(alias)) {
    for (const value of values) mapa.set(normalizarTexto(value), key);
  }
  return mapa;
};

// Traduce los labels que guarda el front en `desag` a claves de dimensión.
// Devuelve también si el reporte trae el arreglo, para distinguir reportes
// nuevos de reportes antiguos (legacy sin desagregación).
const resolverDimensiones = (indicatorKey, filtros, detalle) => {
  const desag = Array.isArray(filtros?.desag) ? filtros.desag : null;
  if (!desag) return { seleccionadas: new Set(), tieneDesag: false };
  const prefijo = `${indicatorKey}|`;
  const labels = desag
    .filter((item) => typeof item === 'string' && item.startsWith(prefijo))
    .map((item) => item.slice(prefijo.length));
  const mapa = construirMapaDimensiones(detalle?.dimensionLabels);
  const seleccionadas = new Set();
  for (const label of labels) {
    const dimension = mapa.get(normalizarTexto(label));
    if (dimension) seleccionadas.add(dimension);
  }
  return { seleccionadas, tieneDesag: true };
};

// Regla genérica:
// 1. primera dimensión temática seleccionada (distinta de año/periodo/sexo)
// 2. si no hay, la dimensión por defecto del indicador
// 3. si no hay, una dimensión seleccionada distinta de año/periodo (permite sexo)
// No hay lógica por indicador: sólo se usa la metadata de dimensiones.
const resolverCategoria = (dimensiones, groupByPorDefecto, allowedGroupBy = []) => {
  const permitidas = new Set(allowedGroupBy || []);
  const permitida = (dimension) => !permitidas.size || permitidas.has(dimension);
  const seleccionadas = [...dimensiones];

  const tematica = seleccionadas.find((dimension) =>
    dimension !== 'year' && dimension !== 'periodo' && dimension !== 'sexo' && permitida(dimension));
  if (tematica) return tematica;

  if (groupByPorDefecto && groupByPorDefecto !== 'year' && permitida(groupByPorDefecto)) {
    return groupByPorDefecto;
  }

  const restante = seleccionadas.find((dimension) =>
    dimension !== 'year' && dimension !== 'periodo' && permitida(dimension));
  return restante || null;
};

const detectarLayout = (dimensiones, categoria, detalle) => {
  if (!categoria || categoria === 'year' || !dimensiones.has('year')) return null;
  const permitidas = new Set(detalle?.allowedGroupBy || []);
  const permitida = (dimension) => !permitidas.size || permitidas.has(dimension);
  if (!permitida(categoria) || !permitida('year')) return null;

  const extras = new Set([...dimensiones].filter((dimension) =>
    dimension !== 'year' && dimension !== categoria));

  if (extras.size === 0) return { tipo: 'C' };
  if (extras.size === 1 && extras.has('periodo') && permitida('periodo')) {
    return { tipo: 'B' };
  }
  if (extras.size === 2 && extras.has('periodo') && extras.has('sexo')
    && permitida('periodo') && permitida('sexo')) {
    return { tipo: 'A' };
  }
  return null;
};

const resolverAnios = (filtros, detalle) => {
  const year = Number(filtros?.year ?? filtros?.anio ?? filtros?.['año']);
  if (Number.isInteger(year) && year > 1900) return [year];

  const desdeFiltro = Number(filtros?.fromYear);
  const hastaFiltro = Number(filtros?.toYear);
  if (Number.isInteger(desdeFiltro) || Number.isInteger(hastaFiltro)) {
    const inicio = Number.isInteger(desdeFiltro) ? desdeFiltro : hastaFiltro;
    const fin = Number.isInteger(hastaFiltro) ? hastaFiltro : desdeFiltro;
    if (inicio <= fin) {
      return Array.from({ length: fin - inicio + 1 }, (_, indice) => inicio + indice);
    }
  }

  const desdeSerie = Number(detalle?.period?.from);
  const hastaSerie = Number(detalle?.period?.to);
  if (Number.isInteger(desdeSerie) && Number.isInteger(hastaSerie) && desdeSerie <= hastaSerie) {
    return Array.from({ length: hastaSerie - desdeSerie + 1 }, (_, indice) => desdeSerie + indice);
  }
  return [];
};


const resolverAnioReferencia = (filtros, detalle) => {
  const year = Number(filtros?.year ?? filtros?.anio ?? filtros?.['año']);
  if (Number.isInteger(year) && year > 1900) return year;
  const hastaSerie = Number(detalle?.period?.to);
  return Number.isInteger(hastaSerie) ? hastaSerie : null;
};

const esFilaNula = (fila) => Boolean(fila?.rowKey) && String(fila.rowKey).endsWith(':null');

const etiquetaCategoria = (dimension, fila) => {
  if (esFilaNula(fila)) {
    return dimension === 'beneficios' ? 'Sin beneficio' : 'Sin dato';
  }
  return String(fila?.row ?? 'Sin dato');
};

const valorCelda = (detalle, value) => {
  if (value === null || value === undefined) {
    return detalle?.format === 'number' ? 0 : null;
  }
  return value;
};

const ordenarPeriodos = (labels) => [...new Set(labels)].sort((a, b) => {
  const numeroA = Number(a);
  const numeroB = Number(b);
  const esNumeroA = Number.isFinite(numeroA) && String(numeroA) === String(a);
  const esNumeroB = Number.isFinite(numeroB) && String(numeroB) === String(b);
  if (esNumeroA && esNumeroB) return numeroA - numeroB;
  if (esNumeroA) return -1;
  if (esNumeroB) return 1;
  return String(a).localeCompare(String(b), 'es', { numeric: true });
});

const columnasDeMatriz = (data) => (data?.columns || []).map((id) => ({
  id,
  label: data?.columnLabels?.[id] ?? id
}));

const filasDeMatriz = (data, categoria) => (data?.matrix || []).map((fila) => ({
  label: etiquetaCategoria(categoria, fila),
  rowKey: fila.rowKey,
  values: Object.fromEntries((data?.columns || []).map((id) => [id, fila.values?.[id] ?? null]))
}));

const unirFilas = (bloques) => {
  const vistas = new Set();
  const filas = [];
  for (const bloque of bloques) {
    for (const fila of bloque.filas) {
      if (!vistas.has(fila.label)) {
        vistas.add(fila.label);
        filas.push(fila.label);
      }
    }
  }
  return filas;
};

const construirEstructura = async (indicatorKey, filtros, detalle, categoria, layout) => {
  const categoriaLabel = detalle?.dimensionLabels?.[categoria]
    || DIMENSION_LABELS[categoria]
    || categoria;

  if (layout.tipo === 'C') {
    const { data } = await indicatorService.getIndicatorDetailView(indicatorKey, {
      ...filtros,
      groupBy: categoria,
      splitBy: 'year'
    });
    if (!data?.isBidimensional) {
      throw new Error('El indicador no devolvió una matriz por año');
    }
    return {
      tipo: 'C',
      categoria,
      categoriaLabel,
      columnas: columnasDeMatriz(data),
      filas: filasDeMatriz(data, categoria)
    };
  }

  if (layout.tipo === 'A') {
    const anios = resolverAnios(filtros, detalle);
    const bloques = [];
    const filas = new Map();
    const sexos = new Map();
    for (const anio of anios) {
      const { data } = await indicatorService.getIndicatorDetailView(indicatorKey, {
        ...filtros,
        year: anio,
        groupBy: categoria,
        splitBy: 'periodo',
        splitBy2: 'sexo'
      });
      if (!data?.isTridimensional) {
        throw new Error(`El indicador no devolvió un cubo por período y sexo para ${anio}`);
      }
      for (const id of data.depths) sexos.set(id, data.depthLabels[id]);
      const columnas = columnasDeMatriz(data);
      const valores = new Map();
      for (const fila of data.cube) {
        const label = etiquetaCategoria(categoria, fila);
        filas.set(fila.rowKey, { rowKey: fila.rowKey, label });
        valores.set(fila.rowKey, new Map(columnas.map((columna) => [
          columna.label,
          fila.values[columna.id]
        ])));
      }
      bloques.push({ anio, columnas, valores });
    }
    const filasOrdenadas = [...filas.values()];
    const etiquetaNula = categoria === 'beneficios' ? 'Sin beneficio' : 'Sin dato';
    if (filasOrdenadas.some((fila) => fila.rowKey === `${categoria}:null`)) {
      for (const fila of filasOrdenadas) {
        if (fila.rowKey !== `${categoria}:null`
          && normalizarTexto(fila.label) === normalizarTexto(etiquetaNula)) {
          fila.label = `${fila.label} (valor literal)`;
        }
      }
    }
    const sexosOrdenados = [...sexos].map(([id, label]) => ({ id, label }));
    if (sexosOrdenados.some((sexo) => sexo.id === 'sexo:null')) {
      for (const sexo of sexosOrdenados) {
        if (sexo.id !== 'sexo:null' && normalizarTexto(sexo.label) === 'sin dato') {
          sexo.label = `${sexo.label} (valor literal)`;
        }
      }
    }
    return {
      tipo: 'A', categoria, categoriaLabel,
      periodos: ordenarPeriodos(bloques.flatMap((bloque) => bloque.columnas.map((columna) => columna.label))),
      filas: filasOrdenadas,
      sexos: sexosOrdenados.sort((a, b) => {
        const nuloA = a.id.endsWith(':null');
        const nuloB = b.id.endsWith(':null');
        if (nuloA !== nuloB) return nuloA ? 1 : -1;
        return a.label.localeCompare(b.label, 'es', { numeric: true });
      }),
      bloques
    };
  }

  const anios = resolverAnios(filtros, detalle);
  const bloques = [];
  for (const anio of anios) {
    const { data } = await indicatorService.getIndicatorDetailView(indicatorKey, {
      ...filtros,
      year: anio,
      groupBy: categoria,
      splitBy: 'periodo'
    });
    if (!data?.isBidimensional) {
      throw new Error(`El indicador no devolvió una matriz por período para ${anio}`);
    }
    bloques.push({
      anio,
      columnas: columnasDeMatriz(data),
      filas: filasDeMatriz(data, categoria)
    });
  }

  const periodos = ordenarPeriodos(bloques.flatMap((bloque) =>
    bloque.columnas.map((columna) => columna.label)));

  return {
    tipo: 'B',
    categoria,
    categoriaLabel,
    anios: bloques.map((bloque) => bloque.anio),
    periodos,
    filas: unirFilas(bloques),
    bloques: bloques.map((bloque) => ({
      anio: bloque.anio,
      valores: new Map(bloque.filas.map((fila) => [
        fila.label,
        new Map(bloque.columnas.map((columna) => [columna.label, fila.values[columna.id]]))
      ]))
    }))
  };
};

const configurarColumnas = (hoja, cantidad) => {
  hoja.columns = Array.from({ length: Math.max(2, cantidad) }, (_, indice) => ({
    width: indice === 0 ? 34 : 16
  }));
};

const escribirAviso = (hoja, texto, cantidadColumnas) => {
  const fila = hoja.addRow([texto]);
  fila.getCell(1).font = { italic: true, color: { argb: COLOR_AVISO } };
  fila.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FONDO_AVISO } };
  fila.getCell(1).alignment = { wrapText: true, vertical: 'middle' };
  if (cantidadColumnas > 1) {
    hoja.mergeCells(fila.number, 1, fila.number, cantidadColumnas);
  }
};

const escribirCabeceraDetalle = (hoja, detalle) => {
  estiloTituloHoja(hoja.addRow([detalle.title || detalle.indicatorKey]).getCell(1));
  if (detalle.description) {
    const fila = hoja.addRow(['Qué mide', detalle.description]);
    fila.getCell(1).font = { bold: true };
    fila.getCell(2).alignment = { wrapText: true, vertical: 'top' };
  }
  hoja.addRow([]);
};

const escribirTablaActual = (hoja, detalle) => {
  escribirCabeceraDetalle(hoja, detalle);
  if (detalle.estructuraError) {
    escribirAviso(hoja, `No se pudo generar la vista solicitada: ${detalle.estructuraError}`, 2);
  }
  const encabezado = hoja.addRow(detalle.disaggregated ? ['Categoría', 'Valor'] : ['Período', 'Valor']);
  estiloEncabezado(encabezado);
  const cuerpo = detalle.table || [];
  if (cuerpo.length === 0) {
    estiloDato(hoja.addRow(['Sin datos para el período', '']));
  } else {
    for (const fila of cuerpo) {
      estiloDato(hoja.addRow(filaTabla(fila)));
    }
  }
  hoja.views = [{ state: 'frozen', ySplit: encabezado.number }];
};

const escribirLayoutC = (hoja, estructura, detalle) => {
  if (estructura.columnas.length === 0 || estructura.filas.length === 0) {
    estiloDato(hoja.addRow(['Sin datos para el período', '']));
    return;
  }
  const encabezado = hoja.addRow([
    `Desglose por ${estructura.categoriaLabel}`,
    ...estructura.columnas.map((columna) => valorColumna(columna.label))
  ]);
  estiloEncabezado(encabezado);
  for (const fila of estructura.filas) {
    const valores = estructura.columnas.map((columna) =>
      valorCelda(detalle, fila.values[columna.id]));
    const creada = hoja.addRow([fila.label, ...valores]);
    estiloDato(creada);
    creada.getCell(1).font = { bold: true };
  }
  hoja.views = [{ state: 'frozen', ySplit: encabezado.number }];
};

const escribirLayoutB = (hoja, estructura, detalle) => {
  if (estructura.bloques.length === 0 || estructura.periodos.length === 0
    || estructura.filas.length === 0) {
    estiloDato(hoja.addRow(['Sin datos para el período', '']));
    return;
  }
  let encabezadoFijado = null;
  estructura.bloques.forEach((bloque, indice) => {
    if (indice > 0) hoja.addRow([]);
    const filaAnio = hoja.addRow([bloque.anio]);
    filaAnio.getCell(1).font = { bold: true, size: 12, color: { argb: COLOR_PRIMARIO } };

    const encabezado = hoja.addRow([
      `Desglose por ${estructura.categoriaLabel}`,
      ...estructura.periodos.map(valorColumna)
    ]);
    estiloEncabezado(encabezado);
    if (!encabezadoFijado) encabezadoFijado = encabezado;

    for (const etiqueta of estructura.filas) {
      const filaValores = bloque.valores.get(etiqueta);
      const valores = estructura.periodos.map((periodo) =>
        valorCelda(detalle, filaValores ? filaValores.get(periodo) : null));
      const creada = hoja.addRow([etiqueta, ...valores]);
      estiloDato(creada);
      creada.getCell(1).font = { bold: true };
    }
  });
  if (encabezadoFijado) {
    hoja.views = [{ state: 'frozen', ySplit: encabezadoFijado.number }];
  }
};

const escribirLayoutA = (hoja, estructura, detalle) => {
  if (estructura.bloques.length === 0 || estructura.periodos.length === 0
    || estructura.filas.length === 0) {
    estiloDato(hoja.addRow(['Sin datos para el período', '']));
    return;
  }
  const numFmt = detalle.format === 'percentage' ? '0.00"%"'
    : (detalle.format === 'currency' ? '"$"#,##0.##' : '#,##0.##');
  const formatearNumeros = (fila) => {
    for (let columna = 2; columna <= estructura.periodos.length + 1; columna++) {
      fila.getCell(columna).numFmt = numFmt;
    }
  };
  let encabezadoFijado = null;
  estructura.bloques.forEach((bloque, indice) => {
    if (indice > 0) hoja.addRow([]);
    const filaAnio = hoja.addRow([bloque.anio]);
    filaAnio.getCell(1).font = { bold: true, size: 12, color: { argb: COLOR_PRIMARIO } };
    const encabezado = hoja.addRow([
      `${estructura.categoriaLabel} / Sexo`, ...estructura.periodos.map(valorColumna)
    ]);
    estiloEncabezado(encabezado);
    if (!encabezadoFijado) encabezadoFijado = encabezado;
    for (const fila of estructura.filas) {
      const porPeriodo = bloque.valores.get(fila.rowKey);
      const totales = estructura.periodos.map((periodo) => porPeriodo?.get(periodo)?.total ?? null);
      const principal = hoja.addRow([fila.label, ...totales]);
      estiloDato(principal);
      principal.getCell(1).font = { bold: true };
      formatearNumeros(principal);
      for (const sexo of estructura.sexos) {
        const valores = estructura.periodos.map((periodo) =>
          porPeriodo?.get(periodo)?.depthValues?.[sexo.id] ?? null);
        const subfila = hoja.addRow([sexo.label, ...valores]);
        estiloDato(subfila);
        subfila.getCell(1).alignment = { indent: 1 };
        formatearNumeros(subfila);
      }
    }
  });
  if (encabezadoFijado) hoja.views = [{ state: 'frozen', ySplit: encabezadoFijado.number }];
};

const escribirEstructura = (hoja, detalle) => {
  const estructura = detalle.estructura;
  escribirCabeceraDetalle(hoja, detalle);
  if (estructura.tipo === 'C') {
    escribirLayoutC(hoja, estructura, detalle);
  } else if (estructura.tipo === 'A') {
    escribirLayoutA(hoja, estructura, detalle);
  } else {
    escribirLayoutB(hoja, estructura, detalle);
  }
};

// Reúne los detalles de cada indicador reutilizando la fuente única del panel de detalle.
// Además calcula la estructura especial (hoja 3/4) cuando la selección de dimensiones
// del reporte lo permite. Si no aplica, deja `estructura` en null y se usa la tabla actual.
const reunirDetalles = async (reporte) => {
  const indicadores = Array.isArray(reporte.indicadores) ? reporte.indicadores : [];
  const esReporteConDesag = Array.isArray(reporte.filtros?.desag);
  const filtrosBase = limpiarFiltros(reporte.filtros, !esReporteConDesag);
  const detalles = [];
  for (const key of indicadores) {
    try {
      const { data } = await indicatorService.getIndicatorDetailView(key, { ...filtrosBase });
      const detalle = { ...data, anioReferencia: resolverAnioReferencia(filtrosBase, data) };
      let estructura = null;
      let estructuraError = null;
      try {
        const { seleccionadas } = resolverDimensiones(key, reporte.filtros, detalle);
        const categoria = resolverCategoria(seleccionadas, detalle.groupBy, detalle.allowedGroupBy);
        const layout = detectarLayout(seleccionadas, categoria, detalle);
        if (layout) {
          estructura = await construirEstructura(key, filtrosBase, detalle, categoria, layout);
        }
      } catch (err) {
        estructuraError = err.message;
      }
      detalles.push({ ...detalle, estructura, estructuraError });
    } catch (err) {
      detalles.push({
        indicatorKey: key,
        title: key,
        description: null,
        table: [],
        error: err.message,
        anioReferencia: null
      });
    }
  }
  return detalles;
};

const armarExcel = async (reporte) => {
  const detalles = await reunirDetalles(reporte);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PIADI ECAS';
  wb.created = new Date();

  // --- Hoja Resumen ---
  const resumen = wb.addWorksheet('Resumen');
  resumen.columns = [{ width: 44 }, { width: 12 }, { width: 28 }];
  estiloTituloHoja(resumen.addRow([reporte.nombre]).getCell(1));
  resumen.addRow(['Área', reporte.area ? reporte.area.name : 'Global']);
  resumen.addRow(['Tipo', reporte.tipo]);
  resumen.addRow(['Generado', new Date().toISOString()]);
  resumen.addRow([]);
  const notaResumen = resumen.addRow([
    'Nota: el Valor corresponde al total del indicador en el año de referencia, no a la suma de todos los años del rango.'
  ]);
  notaResumen.getCell(1).font = { italic: true, color: { argb: COLOR_AVISO } };
  notaResumen.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FONDO_AVISO } };
  notaResumen.getCell(1).alignment = { wrapText: true, vertical: 'middle' };
  resumen.mergeCells(notaResumen.number, 1, notaResumen.number, 3);
  resumen.addRow([]);
  estiloEncabezado(resumen.addRow(['Indicador', 'Año ref.', 'Valor']));
  for (const detalle of detalles) {
    let valor;
    if (detalle.error) valor = `Error: ${detalle.error}`;
    else if (!detalle.hasData) valor = 'Sin datos';
    else valor = detalle.formattedTotal ?? detalle.total ?? '';
    estiloDato(resumen.addRow([
      detalle.title || detalle.indicatorKey,
      detalle.anioReferencia ?? '',
      valor
    ]));
  }
  for (const n of [2, 3, 4]) resumen.getRow(n).getCell(1).font = { bold: true };

  // --- Hoja por indicador ---
  detalles.forEach((detalle, indice) => {
    const hoja = wb.addWorksheet(nombreHoja(indice, detalle.title));
    const cantidadColumnas = detalle.estructura
      ? 1 + (detalle.estructura.tipo === 'C'
        ? detalle.estructura.columnas.length
        : detalle.estructura.periodos.length)
      : 2;
    configurarColumnas(hoja, cantidadColumnas);
    if (detalle.estructura) {
      escribirEstructura(hoja, detalle);
    } else {
      escribirTablaActual(hoja, detalle);
    }
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
};

// Genera el archivo al vuelo y registra la ejecución (solo metadata, sin archivo).
const descargarReporte = async (user, reporteId) => {
  const reporte = await reporteService.getReporteById(user, reporteId);
  if (!reporte.activo) {
    throw new ValidationError('El reporte está inactivo y no puede generarse');
  }

  const buffer = await armarExcel(reporte);
  const nombre = nombreArchivo(reporte);

  await ReporteEjecucion.create({
    reporteId: reporte.id,
    solicitadoPor: user.id,
    estado: 'LISTO',
    formato: 'XLSX',
    parametros: reporte.filtros || {},
    archivoNombre: nombre,
    generadoEn: new Date()
  });

  auditarReporte({
    user,
    accion: 'REPORTE_GENERATED',
    reporte,
    extra: { indicadores: (reporte.indicadores || []).length },
    path: `/api/reportes/${reporte.id}/descargar`
  });

  return { buffer, nombre };
};

const listEjecuciones = async (user, reporteId) => {
  await reporteService.getReporteById(user, reporteId);
  return ReporteEjecucion.findAll({ where: { reporteId }, order: [['createdAt', 'DESC']] });
};

module.exports = {
  descargarReporte,
  listEjecuciones,
  armarExcel,
  __test: {
    limpiarFiltros,
    resolverDimensiones,
    resolverCategoria,
    detectarLayout,
    resolverAnios,
    resolverAnioReferencia,
    ordenarPeriodos,
    construirMapaDimensiones
  }
};
