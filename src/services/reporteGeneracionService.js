const XLSX = require('xlsx');
const { ReporteEjecucion } = require('../models');
const reporteService = require('./reporteService');
const indicatorService = require('./indicatorService');
const { auditarReporte } = require('./reporteAuditoria');
const { ValidationError } = require('../utils/errors');

const MAX_SHEET_NAME = 31;

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
  const workbook = XLSX.utils.book_new();

  const resumen = [
    ['Reporte', reporte.nombre],
    ['Área', reporte.area ? reporte.area.name : 'Global'],
    ['Tipo', reporte.tipo],
    ['Generado', new Date().toISOString()],
    [],
    ['Indicador', 'Valor']
  ];
  for (const detalle of detalles) {
    let valor;
    if (detalle.error) valor = `Error: ${detalle.error}`;
    else if (!detalle.hasData) valor = 'Sin datos';
    else valor = detalle.formattedTotal ?? detalle.total ?? '';
    resumen.push([detalle.title || detalle.indicatorKey, valor]);
  }
  const hojaResumen = XLSX.utils.aoa_to_sheet(resumen);
  hojaResumen['!cols'] = [{ wch: 42 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(workbook, hojaResumen, 'Resumen');

  detalles.forEach((detalle, indice) => {
    const filas = [];
    if (detalle.description) {
      filas.push(['Qué mide', detalle.description]);
      filas.push([]);
    }
    filas.push(detalle.disaggregated ? ['Categoría', 'Valor'] : ['Período', 'Valor']);
    const cuerpo = detalle.table || [];
    if (cuerpo.length === 0) {
      filas.push(['Sin datos para el período', '']);
    } else {
      for (const fila of cuerpo) {
        filas.push(filaTabla(fila));
      }
    }
    const hoja = XLSX.utils.aoa_to_sheet(filas);
    hoja['!cols'] = [{ wch: 32 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(workbook, hoja, nombreHoja(indice, detalle.title));
  });

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
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
