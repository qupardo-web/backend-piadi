const ExcelJS = require('exceljs');
const { Op } = require('sequelize');
const { Reporte, ReporteEjecucion, User } = require('../models');
const reporteService = require('./reporteService');
const { politicaReportes } = require('./reportePolitica');
const indicatorService = require('./indicatorService');
const { DIMENSION_LABELS } = require('./indicatorCatalog');
const { auditarReporte } = require('./reporteAuditoria');
const reporteArchivos = require('../utils/reporteArchivos');
const { ValidationError, NotFoundError } = require('../utils/errors');

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
const DIMENSIONES_TEMPORALES = new Set(['year', 'periodo', 'semestre']);

const slug = (texto) => String(texto || 'reporte')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .toLowerCase()
  .slice(0, 40) || 'reporte';

const rangoAniosNombre = (filtros = {}) => {
  const year = Number(filtros.year ?? filtros.anio ?? filtros['año']);
  if (Number.isInteger(year) && year > 1900) return String(year);

  const desde = Number(filtros.fromYear);
  const hasta = Number(filtros.toYear);
  const valido = (valor) => Number.isInteger(valor) && valor > 1900;
  if (!valido(desde) && !valido(hasta)) return null;

  const inicio = valido(desde) ? desde : hasta;
  const fin = valido(hasta) ? hasta : desde;
  const menor = Math.min(inicio, fin);
  const mayor = Math.max(inicio, fin);
  return menor === mayor ? String(menor) : `${menor}-a-${mayor}`;
};

const nombreArchivo = (reporte, extension = 'xlsx') => {
  const rango = rangoAniosNombre(reporte.filtros);
  return `${slug(reporte.nombre)}${rango ? `-${rango}` : ''}.${extension}`;
};

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

// Layout A: categoría base + una dimensión adicional (sexo, sección, región, etc.).
// La dimensión adicional puede ir acompañada o no de período:
// - con período: bloques por año, columnas de período, filas base y subfilas adicionales.
// - sin período: bloques por año, columnas adicionales y filas base.
const detectarLayoutA = (dimensiones, detalle) => {
  if (!dimensiones.has('year')) return null;
  const permitidas = new Set(detalle?.allowedGroupBy || []);
  const permitida = (dimension) => !permitidas.size || permitidas.has(dimension);
  if (!permitida('year')) return null;

  const noTemporales = [...dimensiones].filter((dimension) =>
    dimension !== 'year' && dimension !== 'periodo');
  const porDefecto = detalle?.groupBy && detalle.groupBy !== 'year'
    ? detalle.groupBy
    : null;

  let categoria;
  let adicionales;
  if (porDefecto && permitida(porDefecto)) {
    categoria = porDefecto;
    adicionales = noTemporales.filter((dimension) => dimension !== porDefecto);
  } else {
    if (noTemporales.length < 2) return null;
    categoria = noTemporales[0];
    adicionales = noTemporales.slice(1);
  }

  if (adicionales.length !== 1) return null;
  const profundidad = adicionales[0];
  if (!categoria || categoria === profundidad
    || !permitida(categoria) || !permitida(profundidad)) {
    return null;
  }

  return {
    tipo: 'A',
    categoria,
    profundidad,
    conPeriodo: dimensiones.has('periodo')
  };
};

const detectarLayout = (dimensiones, categoria, detalle) => {
  if (!dimensiones.has('year')) return null;
  const permitidas = new Set(detalle?.allowedGroupBy || []);
  const permitida = (dimension) => !permitidas.size || permitidas.has(dimension);

  const layoutA = detectarLayoutA(dimensiones, detalle);
  if (layoutA) return layoutA;

  if (!categoria || categoria === 'year' || !permitida(categoria) || !permitida('year')) {
    return null;
  }

  const extras = new Set([...dimensiones].filter((dimension) =>
    dimension !== 'year' && dimension !== categoria));

  if (extras.size === 0) return { tipo: 'C' };
  if (extras.size === 1 && extras.has('periodo') && permitida('periodo')) {
    return { tipo: 'B' };
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

const esIdNulo = (id) => /^[^:]+:null$/.test(String(id));
const esFilaNula = (fila) => Boolean(fila?.rowKey) && esIdNulo(fila.rowKey);

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

// Sin decimales opcionales: en Excel en español `#,##0.##` muestra una coma
// decimal colgando en números enteros (ej. "10,").
const formatoNumerico = (format) => {
  if (format === 'percentage') return '0.00"%"';
  if (format === 'currency') return '"$"#,##0';
  return '#,##0';
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

const desambiguarNulos = (items, id, etiqueta) => {
  const etiquetasNulas = new Set(items.filter((item) => esIdNulo(id(item)))
    .map((item) => normalizarTexto(etiqueta(item))));
  return items.map((item) => {
    const label = etiqueta(item);
    return {
      ...item,
      label: !esIdNulo(id(item)) && etiquetasNulas.has(normalizarTexto(label))
        ? `${label} (valor literal)` : label
    };
  });
};

const unirFilas = (bloques) => {
  const vistas = new Set();
  const filas = [];
  for (const bloque of bloques) {
    for (const fila of bloque.filas) {
      if (!vistas.has(fila.rowKey)) {
        vistas.add(fila.rowKey);
        filas.push({ rowKey: fila.rowKey, label: fila.label });
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
      filas: desambiguarNulos(filasDeMatriz(data, categoria),
        (fila) => fila.rowKey, (fila) => fila.label)
    };
  }

  if (layout.tipo === 'A') {
    const profundidad = layout.profundidad;
    const profundidadLabel = detalle?.dimensionLabels?.[profundidad]
      || DIMENSION_LABELS[profundidad]
      || profundidad;
    const anios = resolverAnios(filtros, detalle);

    if (!layout.conPeriodo) {
      const bloques = [];
      for (const anio of anios) {
        const { data } = await indicatorService.getIndicatorDetailView(indicatorKey, {
          ...filtros,
          year: anio,
          groupBy: categoria,
          splitBy: profundidad
        });
        if (!data?.isBidimensional) {
          throw new Error(`El indicador no devolvió una matriz por ${profundidadLabel} para ${anio}`);
        }
        bloques.push({
          anio,
          columnas: columnasDeMatriz(data),
          filas: filasDeMatriz(data, categoria)
        });
      }
      const columnas = new Map();
      for (const bloque of bloques) {
        for (const columna of bloque.columnas) columnas.set(columna.id, columna);
      }
      const ordenColumnas = ordenarPeriodos([...columnas.values()].map((columna) => columna.label));
      return {
        tipo: 'A',
        conPeriodo: false,
        categoria,
        categoriaLabel,
        profundidad,
        profundidadLabel,
        columnas: desambiguarNulos([...columnas.values()].sort((a, b) =>
          ordenColumnas.indexOf(a.label) - ordenColumnas.indexOf(b.label)),
          (columna) => columna.id, (columna) => columna.label),
        filas: desambiguarNulos(unirFilas(bloques),
          (fila) => fila.rowKey, (fila) => fila.label),
        bloques: bloques.map((bloque) => ({
          anio: bloque.anio,
          valores: new Map(bloque.filas.map((fila) => [
            fila.rowKey,
            new Map(bloque.columnas.map((columna) => [columna.id, fila.values[columna.id]]))
          ]))
        }))
      };
    }

    const bloques = [];
    const filas = new Map();
    const subfilas = new Map();
    for (const anio of anios) {
      const { data } = await indicatorService.getIndicatorDetailView(indicatorKey, {
        ...filtros,
        year: anio,
        groupBy: categoria,
        splitBy: 'periodo',
        splitBy2: profundidad
      });
      if (!data?.isTridimensional) {
        throw new Error(`El indicador no devolvió un cubo por período y ${profundidadLabel} para ${anio}`);
      }
      for (const id of data.depths) subfilas.set(id, data.depthLabels[id]);
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

    const subfilasOrdenadas = [...subfilas].map(([id, label]) => ({ id, label }));
    if (subfilasOrdenadas.some((fila) => fila.id === `${profundidad}:null`)) {
      for (const fila of subfilasOrdenadas) {
        if (fila.id !== `${profundidad}:null` && normalizarTexto(fila.label) === 'sin dato') {
          fila.label = `${fila.label} (valor literal)`;
        }
      }
    }
    subfilasOrdenadas.sort((a, b) => {
      const nuloA = esIdNulo(a.id);
      const nuloB = esIdNulo(b.id);
      if (nuloA !== nuloB) return nuloA ? 1 : -1;
      return a.label.localeCompare(b.label, 'es', { numeric: true });
    });

    return {
      tipo: 'A',
      conPeriodo: true,
      categoria,
      categoriaLabel,
      profundidad,
      profundidadLabel,
      periodos: ordenarPeriodos(bloques.flatMap((bloque) =>
        bloque.columnas.map((columna) => columna.label))),
      filas: filasOrdenadas,
      subfilas: subfilasOrdenadas,
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
    filas: desambiguarNulos(unirFilas(bloques),
      (fila) => fila.rowKey, (fila) => fila.label),
    bloques: bloques.map((bloque) => ({
      anio: bloque.anio,
      valores: new Map(bloque.filas.map((fila) => [
        fila.rowKey,
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
  estructura.bloques.forEach((bloque, indice) => {
    if (indice > 0) hoja.addRow([]);
    const filaAnio = hoja.addRow([bloque.anio]);
    filaAnio.getCell(1).font = { bold: true, size: 12, color: { argb: COLOR_PRIMARIO } };

    const encabezado = hoja.addRow([
      `Desglose por ${estructura.categoriaLabel}`,
      ...estructura.periodos.map(valorColumna)
    ]);
    estiloEncabezado(encabezado);

    for (const fila of estructura.filas) {
      const filaValores = bloque.valores.get(fila.rowKey);
      const valores = estructura.periodos.map((periodo) =>
        valorCelda(detalle, filaValores ? filaValores.get(periodo) : null));
      const creada = hoja.addRow([fila.label, ...valores]);
      estiloDato(creada);
      creada.getCell(1).font = { bold: true };
    }
  });
};

const formatearNumerosFila = (fila, desdeColumna, hastaColumna, numFmt) => {
  for (let columna = desdeColumna; columna <= hastaColumna; columna += 1) {
    fila.getCell(columna).numFmt = numFmt;
  }
};

const escribirLayoutAConPeriodo = (hoja, estructura, detalle) => {
  if (estructura.bloques.length === 0 || estructura.periodos.length === 0
    || estructura.filas.length === 0) {
    estiloDato(hoja.addRow(['Sin datos para el período', '']));
    return;
  }
  const numFmt = formatoNumerico(detalle.format);
  const ultimaColumna = estructura.periodos.length + 1;
  estructura.bloques.forEach((bloque, indice) => {
    if (indice > 0) hoja.addRow([]);
    const filaAnio = hoja.addRow([bloque.anio]);
    filaAnio.getCell(1).font = { bold: true, size: 12, color: { argb: COLOR_PRIMARIO } };
    const encabezado = hoja.addRow([
      `${estructura.categoriaLabel} / ${estructura.profundidadLabel}`,
      ...estructura.periodos.map(valorColumna)
    ]);
    estiloEncabezado(encabezado);
    for (const fila of estructura.filas) {
      const porPeriodo = bloque.valores.get(fila.rowKey);
      const totales = estructura.periodos.map((periodo) => porPeriodo?.get(periodo)?.total ?? null);
      const principal = hoja.addRow([fila.label, ...totales]);
      estiloDato(principal);
      principal.getCell(1).font = { bold: true };
      formatearNumerosFila(principal, 2, ultimaColumna, numFmt);
      for (const subfila of estructura.subfilas) {
        const valores = estructura.periodos.map((periodo) =>
          porPeriodo?.get(periodo)?.depthValues?.[subfila.id] ?? null);
        const creada = hoja.addRow([subfila.label, ...valores]);
        estiloDato(creada);
        creada.getCell(1).alignment = { indent: 1 };
        formatearNumerosFila(creada, 2, ultimaColumna, numFmt);
      }
    }
  });
};

const escribirLayoutASinPeriodo = (hoja, estructura, detalle) => {
  if (estructura.bloques.length === 0 || estructura.columnas.length === 0
    || estructura.filas.length === 0) {
    estiloDato(hoja.addRow(['Sin datos para el período', '']));
    return;
  }
  const numFmt = formatoNumerico(detalle.format);
  const ultimaColumna = estructura.columnas.length + 1;
  estructura.bloques.forEach((bloque, indice) => {
    if (indice > 0) hoja.addRow([]);
    const filaAnio = hoja.addRow([bloque.anio]);
    filaAnio.getCell(1).font = { bold: true, size: 12, color: { argb: COLOR_PRIMARIO } };
    const encabezado = hoja.addRow([
      `${estructura.categoriaLabel} / ${estructura.profundidadLabel}`,
      ...estructura.columnas.map((columna) => valorColumna(columna.label))
    ]);
    estiloEncabezado(encabezado);
    for (const fila of estructura.filas) {
      const porColumna = bloque.valores.get(fila.rowKey);
      const valores = estructura.columnas.map((columna) =>
        valorCelda(detalle, porColumna?.get(columna.id) ?? null));
      const creada = hoja.addRow([fila.label, ...valores]);
      estiloDato(creada);
      creada.getCell(1).font = { bold: true };
      formatearNumerosFila(creada, 2, ultimaColumna, numFmt);
    }
  });
};

const escribirLayoutA = (hoja, estructura, detalle) => {
  if (estructura.conPeriodo) {
    escribirLayoutAConPeriodo(hoja, estructura, detalle);
  } else {
    escribirLayoutASinPeriodo(hoja, estructura, detalle);
  }
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
      let dimensiones = [];
      try {
        const { seleccionadas } = resolverDimensiones(key, reporte.filtros, detalle);
        dimensiones = [...seleccionadas].map((dimension) => ({
          key: dimension,
          label: detalle.dimensionLabels?.[dimension] || DIMENSION_LABELS[dimension] || dimension
        }));
        const categoria = resolverCategoria(seleccionadas, detalle.groupBy, detalle.allowedGroupBy);
        const layout = detectarLayout(seleccionadas, categoria, detalle);
        if (layout) {
          const categoriaFinal = layout.categoria || categoria;
          estructura = await construirEstructura(key, filtrosBase, detalle, categoriaFinal, layout);
        }
      } catch (err) {
        estructuraError = err.message;
      }
      detalles.push({ ...detalle, estructura, estructuraError, dimensiones });
    } catch (err) {
      detalles.push({
        indicatorKey: key,
        title: key,
        description: null,
        table: [],
        error: err.message,
        anioReferencia: null,
        dimensiones: []
      });
    }
  }
  return detalles;
};

const formatearFechaResumen = (fecha) => new Intl.DateTimeFormat('es-CL', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'America/Santiago'
}).format(fecha);

const describirDimensiones = (dimensiones = []) => {
  if (!dimensiones.length) return 'Sin desagregación';
  const temporales = dimensiones
    .filter((dimension) => DIMENSIONES_TEMPORALES.has(dimension.key))
    .map((dimension) => dimension.label);
  const categoricas = dimensiones
    .filter((dimension) => !DIMENSIONES_TEMPORALES.has(dimension.key))
    .map((dimension) => dimension.label);
  const partes = [];
  if (temporales.length) partes.push(`Temporales: ${temporales.join(', ')}`);
  if (categoricas.length) partes.push(`Categóricas: ${categoricas.join(', ')}`);
  return partes.join(' | ');
};

const FILTROS_EXCLUIDOS_RESUMEN = new Set([
  ...FILTROS_INTERNOS, 'fromYear', 'toYear', 'year', 'anio', 'año'
]);

const describirFiltros = (filtros = {}) => {
  const partes = [];
  const year = filtros.year ?? filtros.anio ?? filtros['año'];
  if (year !== undefined && year !== null && year !== '') {
    partes.push(`Año: ${year}`);
  } else if (filtros.fromYear || filtros.toYear) {
    partes.push(`Años: ${filtros.fromYear ?? '...'} - ${filtros.toYear ?? '...'}`);
  }

  const seleccionados = new Map();
  if (Array.isArray(filtros.filtrosSeleccionados)) {
    for (const item of filtros.filtrosSeleccionados) {
      const partesItem = String(item).split('|');
      if (partesItem.length >= 3) {
        const [, nombre, valor] = partesItem;
        if (!seleccionados.has(nombre)) seleccionados.set(nombre, []);
        seleccionados.get(nombre).push(valor);
      }
    }
  }

  if (seleccionados.size > 0) {
    for (const [nombre, valores] of seleccionados) {
      partes.push(`${nombre}: ${valores.join(', ')}`);
    }
  } else {
    for (const [key, value] of Object.entries(filtros || {})) {
      if (FILTROS_EXCLUIDOS_RESUMEN.has(key)) continue;
      if (value === null || value === undefined || value === '') continue;
      const valores = (Array.isArray(value) ? value : [value])
        .filter((item) => item !== null && item !== undefined && item !== '');
      if (valores.length === 0) continue;
      const etiqueta = DIMENSION_LABELS[key] || key;
      partes.push(`${etiqueta}: ${valores.join(', ')}`);
    }
  }

  return partes.length > 0 ? partes.join(' | ') : 'Sin filtros adicionales';
};

const armarExcel = async (reporte, { user = null } = {}) => {
  const detalles = await reunirDetalles(reporte);
  const wb = new ExcelJS.Workbook();
  const generadoEn = new Date();
  wb.creator = 'PIADI ECAS';
  wb.created = generadoEn;

  // --- Hoja Resumen ---
  const resumen = wb.addWorksheet('Resumen');
  resumen.columns = [
    { width: 44 },
    { width: 10 },
    { width: 18 },
    { width: 52 },
    { width: 20 }
  ];

  const titulo = resumen.addRow([reporte.nombre]);
  estiloTituloHoja(titulo.getCell(1));
  resumen.mergeCells(titulo.number, 1, titulo.number, 5);

  const metadatos = [
    ['Área', reporte.area ? reporte.area.name : 'Global'],
    ['Tipo', reporte.tipo],
    ['Formato', reporte.formato || 'XLSX']
  ];
  if (reporte.descripcion) metadatos.push(['Descripción', reporte.descripcion]);
  metadatos.push(
    ['Generado', formatearFechaResumen(generadoEn)],
    ['Generado por', user?.name || user?.email || 'No registrado'],
    ['Filtros', describirFiltros(reporte.filtros)]
  );

  for (const [etiqueta, valor] of metadatos) {
    const fila = resumen.addRow([etiqueta, valor]);
    fila.getCell(1).font = { bold: true };
    fila.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    if (etiqueta === 'Descripción' || etiqueta === 'Filtros') {
      fila.height = Math.max(15, Math.ceil(String(valor).length / 70) * 15);
    }
    resumen.mergeCells(fila.number, 2, fila.number, 5);
  }

  const encabezado = resumen.addRow([
    'Indicador', 'Año ref.', 'Unidad', 'Desagregaciones', 'Valor'
  ]);
  estiloEncabezado(encabezado);

  detalles.forEach((detalle, indice) => {
    let valor;
    if (detalle.error) valor = `Error: ${detalle.error}`;
    else if (!detalle.hasData) valor = 'Sin datos';
    else valor = detalle.formattedTotal ?? detalle.total ?? '';

    const nombre = detalle.title || detalle.indicatorKey;
    const hoja = nombreHoja(indice, detalle.title).replace(/'/g, "''");
    const fila = resumen.addRow([
      { text: nombre, hyperlink: `#'${hoja}'!A1` },
      detalle.anioReferencia ?? '',
      detalle.unit || '',
      describirDimensiones(detalle.dimensiones),
      valor
    ]);
    estiloDato(fila);
    fila.getCell(1).font = { color: { argb: 'FF0563C1' }, underline: true };
    if (detalle.error) {
      fila.getCell(5).font = { color: { argb: 'FFC00000' } };
    } else if (!detalle.hasData) {
      fila.getCell(5).font = { italic: true, color: { argb: COLOR_AVISO } };
    }
  });

  resumen.views = [{ state: 'frozen', ySplit: encabezado.number }];
  if (detalles.length > 0) {
    resumen.autoFilter = {
      from: { row: encabezado.number, column: 1 },
      to: { row: encabezado.number + detalles.length, column: 5 }
    };
  }

  resumen.addRow([]);
  const notaResumen = resumen.addRow([
    'Nota: el Valor corresponde al total del indicador en el año de referencia, no a la suma de todos los años del rango.'
  ]);
  notaResumen.getCell(1).font = { italic: true, color: { argb: COLOR_AVISO } };
  notaResumen.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FONDO_AVISO } };
  notaResumen.getCell(1).alignment = { wrapText: true, vertical: 'middle' };
  resumen.mergeCells(notaResumen.number, 1, notaResumen.number, 5);

  // --- Hoja por indicador ---
  detalles.forEach((detalle, indice) => {
    const hoja = wb.addWorksheet(nombreHoja(indice, detalle.title));
    const columnas = detalle.estructura?.columnas?.length
      ?? detalle.estructura?.periodos?.length
      ?? 0;
    configurarColumnas(hoja, detalle.estructura ? 1 + columnas : 2);
    if (detalle.estructura) {
      escribirEstructura(hoja, detalle);
    } else {
      escribirTablaActual(hoja, detalle);
    }
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
};

const ESTADOS_EJECUCION = ['PENDIENTE', 'GENERANDO', 'LISTO', 'ERROR'];

const validarIdEjecucion = (value, campo = 'id de la ejecución') => {
  if (!/^\d+$/.test(String(value ?? ''))) {
    throw new ValidationError(`El ${campo} debe ser numérico`);
  }
  return Number(value);
};

const parsearIdOpcional = (value, campo) => {
  if (value === undefined || value === null || value === '') return null;
  if (['todos', 'all'].includes(String(value).trim().toLowerCase())) return null;
  return validarIdEjecucion(value, campo);
};

const parseFecha = (value, finDelDia = false) => {
  if (value === undefined || value === null || value === '') return null;
  const texto = String(value).trim();
  const fecha = new Date(texto);
  if (Number.isNaN(fecha.getTime())) {
    throw new ValidationError(`Fecha inválida: ${value}`);
  }
  if (finDelDia && /^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    fecha.setUTCHours(23, 59, 59, 999);
  }
  return fecha;
};

const construirRangoFechas = (query = {}) => {
  const fechaUnica = query.fecha;
  const desdeRaw = query.fromDate ?? query.desde ?? query.fechaDesde ?? fechaUnica;
  const hastaRaw = query.toDate ?? query.hasta ?? query.fechaHasta ?? fechaUnica;
  const desde = parseFecha(desdeRaw, false);
  const hasta = parseFecha(hastaRaw, true);
  if (desde && hasta && desde > hasta) {
    throw new ValidationError('La fecha desde no puede ser mayor que la fecha hasta');
  }
  if (!desde && !hasta) return null;
  const rango = {};
  if (desde) rango[Op.gte] = desde;
  if (hasta) rango[Op.lte] = hasta;
  return rango;
};

const construirWhereEjecuciones = (query = {}) => {
  const where = {};
  const estadoQuery = String(query.estado ?? '').trim().toLowerCase();
  if (estadoQuery && !['todos', 'all'].includes(estadoQuery)) {
    const estado = estadoQuery.toUpperCase();
    if (!ESTADOS_EJECUCION.includes(estado)) {
      throw new ValidationError(`Estado inválido. Permitidos: ${ESTADOS_EJECUCION.join(', ')}`);
    }
    where.estado = estado;
  }
  const rango = construirRangoFechas(query);
  if (rango) where.generadoEn = rango;
  return where;
};

const construirIncludeEjecucion = (whereReporte = null) => {
  const reporte = {
    model: Reporte,
    as: 'reporte',
    attributes: ['id', 'nombre', 'tipo', 'departmentId', 'createdBy'],
    required: true
  };
  if (whereReporte) reporte.where = whereReporte;
  return [
    reporte,
    { model: User, as: 'solicitante', attributes: ['id', 'name', 'email'], required: false }
  ];
};

const serializarEjecucion = (ejecucion) => {
  const data = typeof ejecucion.toJSON === 'function' ? ejecucion.toJSON() : ejecucion;
  return {
    ...data,
    archivoDisponible: reporteArchivos.existeEjecucion(data.id)
  };
};

const ordenEjecuciones = [['generadoEn', 'DESC'], ['createdAt', 'DESC']];

const listEjecuciones = async (user, reporteId, query = {}) => {
  const reporte = await reporteService.getReporteById(user, reporteId);
  const where = { reporteId: reporte.id, ...construirWhereEjecuciones(query) };
  const ejecuciones = await ReporteEjecucion.findAll({
    where,
    include: construirIncludeEjecucion(),
    order: ordenEjecuciones
  });
  return ejecuciones.map(serializarEjecucion);
};

const listEjecucionesGeneral = async (user, query = {}) => {
  const where = construirWhereEjecuciones(query);
  const reporteId = parsearIdOpcional(query.reporteId, 'reporteId');

  let whereReporte = null;
  if (reporteId) {
    const reporte = await reporteService.getReporteById(user, reporteId);
    where.reporteId = reporte.id;
  } else {
    const politica = politicaReportes(user);
    if (politica.lectura === 'area') {
      whereReporte = { departmentId: { [Op.in]: politica.areas } };
    } else if (politica.lectura === 'propios') {
      whereReporte = { createdBy: user.id };
    }
  }

  const ejecuciones = await ReporteEjecucion.findAll({
    where,
    include: construirIncludeEjecucion(whereReporte),
    order: ordenEjecuciones
  });
  return ejecuciones.map(serializarEjecucion);
};

// El PDF se genera en el navegador. Este endpoint registra la ejecución sin
// almacenar el archivo, por lo que la re-descarga no estará disponible.
const registrarEjecucionPdf = async (user, reporteId, data = {}) => {
  const payload = data && typeof data === 'object' ? data : {};
  const formato = String(payload.formato || 'PDF').trim().toUpperCase();
  if (formato !== 'PDF') {
    throw new ValidationError('Este endpoint solo registra ejecuciones PDF');
  }

  const reporte = await reporteService.getReporteById(user, reporteId);
  if (!reporte.activo) {
    throw new ValidationError('El reporte está inactivo y no puede generarse');
  }

  const ejecucion = await ReporteEjecucion.create({
    reporteId: reporte.id,
    solicitadoPor: user.id,
    estado: 'LISTO',
    formato: 'PDF',
    parametros: reporte.filtros || {},
    archivoNombre: nombreArchivo(reporte, 'pdf'),
    generadoEn: new Date()
  });

  auditarReporte({
    user,
    accion: 'REPORTE_GENERATED',
    reporte,
    extra: {
      ejecucionId: ejecucion.id,
      formato: 'PDF',
      origen: 'cliente'
    },
    path: `/api/reportes/${reporte.id}/ejecuciones`
  });

  return serializarEjecucion(ejecucion);
};

const descargarEjecucion = async (user, ejecucionId) => {
  const id = validarIdEjecucion(ejecucionId);
  const ejecucion = await ReporteEjecucion.findByPk(id);
  if (!ejecucion) {
    throw new NotFoundError('Ejecución no encontrada');
  }

  const reporte = await reporteService.getReporteById(user, ejecucion.reporteId);
  if (!reporteArchivos.existeEjecucion(id)) {
    throw new NotFoundError('El archivo de esta ejecución no está disponible. Vuelve a generar el reporte.');
  }

  const buffer = await reporteArchivos.leerEjecucion(id);
  const nombre = ejecucion.archivoNombre || `reporte-${ejecucion.reporteId}.xlsx`;

  auditarReporte({
    user,
    accion: 'REPORTE_REDOWNLOADED',
    reporte,
    extra: { ejecucionId: id, formato: ejecucion.formato },
    path: `/api/reportes/ejecuciones/${id}/descargar`
  });

  return { buffer, nombre, ejecucion };
};

// Genera el archivo, registra la ejecución y persiste el XLSX para re-descargas.
const descargarReporte = async (user, reporteId) => {
  const reporte = await reporteService.getReporteById(user, reporteId);
  if (!reporte.activo) {
    throw new ValidationError('El reporte está inactivo y no puede generarse');
  }

  const buffer = await armarExcel(reporte, { user });
  const nombre = nombreArchivo(reporte);

  let ejecucion;
  try {
    ejecucion = await ReporteEjecucion.create({
      reporteId: reporte.id,
      solicitadoPor: user.id,
      estado: 'GENERANDO',
      formato: 'XLSX',
      parametros: reporte.filtros || {},
      archivoNombre: nombre
    });
    await reporteArchivos.guardarEjecucion(ejecucion.id, buffer);
    await ejecucion.update({ estado: 'LISTO', generadoEn: new Date() });
  } catch (error) {
    if (ejecucion?.id) {
      await ejecucion.update({ estado: 'ERROR', error: error.message }).catch(() => {});
    }
    throw error;
  }

  auditarReporte({
    user,
    accion: 'REPORTE_GENERATED',
    reporte,
    extra: {
      indicadores: (reporte.indicadores || []).length,
      ejecucionId: ejecucion.id
    },
    path: `/api/reportes/${reporte.id}/descargar`
  });

  return { buffer, nombre, ejecucion };
};

module.exports = {
  descargarReporte,
  descargarEjecucion,
  listEjecuciones,
  listEjecucionesGeneral,
  registrarEjecucionPdf,
  armarExcel,
  __test: {
    limpiarFiltros,
    resolverDimensiones,
    resolverCategoria,
    detectarLayout,
    resolverAnios,
    resolverAnioReferencia,
    rangoAniosNombre,
    nombreArchivo,
    ordenarPeriodos,
    construirMapaDimensiones,
    construirWhereEjecuciones,
    parseFecha,
    formatoNumerico
  }
};
