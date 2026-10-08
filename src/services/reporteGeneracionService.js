const ExcelJS = require('exceljs');
const { ReporteEjecucion } = require('../models');
const reporteService = require('./reporteService');
const indicatorService = require('./indicatorService');
const { auditarReporte } = require('./reporteAuditoria');
const { ValidationError } = require('../utils/errors');

const MAX_SHEET_NAME = 31;

const COLOR_PRIMARIO = 'FF161796';
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

// Reúne los detalles de cada indicador reutilizando la fuente única del panel de detalle.
const reunirDetalles = async (reporte) => {
  const indicadores = Array.isArray(reporte.indicadores) ? reporte.indicadores : [];
  const detalles = [];
  for (const key of indicadores) {
    try {
      const { data } = await indicatorService.getIndicatorDetailView(key, { ...(reporte.filtros || {}) });
      detalles.push(data);
    } catch (err) {
      detalles.push({ indicatorKey: key, title: key, description: null, table: [], error: err.message });
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
  resumen.columns = [{ width: 44 }, { width: 30 }];
  estiloTituloHoja(resumen.addRow([reporte.nombre]).getCell(1));
  resumen.addRow(['Área', reporte.area ? reporte.area.name : 'Global']);
  resumen.addRow(['Tipo', reporte.tipo]);
  resumen.addRow(['Generado', new Date().toISOString()]);
  resumen.addRow([]);
  estiloEncabezado(resumen.addRow(['Indicador', 'Valor']));
  for (const detalle of detalles) {
    let valor;
    if (detalle.error) valor = `Error: ${detalle.error}`;
    else if (!detalle.hasData) valor = 'Sin datos';
    else valor = detalle.formattedTotal ?? detalle.total ?? '';
    estiloDato(resumen.addRow([detalle.title || detalle.indicatorKey, valor]));
  }
  for (const n of [2, 3, 4]) resumen.getRow(n).getCell(1).font = { bold: true };

  // --- Hoja por indicador ---
  detalles.forEach((detalle, indice) => {
    const hoja = wb.addWorksheet(nombreHoja(indice, detalle.title));
    hoja.columns = [{ width: 34 }, { width: 22 }];
    estiloTituloHoja(hoja.addRow([detalle.title || detalle.indicatorKey]).getCell(1));
    if (detalle.description) {
      const r = hoja.addRow(['Qué mide', detalle.description]);
      r.getCell(1).font = { bold: true };
      r.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    }
    hoja.addRow([]);
    const enc = hoja.addRow(detalle.disaggregated ? ['Categoría', 'Valor'] : ['Período', 'Valor']);
    estiloEncabezado(enc);
    const cuerpo = detalle.table || [];
    if (cuerpo.length === 0) {
      estiloDato(hoja.addRow(['Sin datos para el período', '']));
    } else {
      for (const fila of cuerpo) {
        estiloDato(hoja.addRow(filaTabla(fila)));
      }
    }
    hoja.views = [{ state: 'frozen', ySplit: enc.number }];
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
  armarExcel
};
