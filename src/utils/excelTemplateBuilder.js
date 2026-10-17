const ExcelJS = require('exceljs');

// Azul institucional ECAS para las celdas de encabezado
const COLOR_AZUL_ENCABEZADO = 'FF161796';

/**
 * Genera un Buffer binario de Excel XLSX con estilo institucional:
 * - Títulos de columnas SIEMPRE en MAYÚSCULAS
 * - Celdas de encabezado con fondo azul institucional (#161796)
 * - Texto blanco (#FFFFFF) en negrita
 * - Bordes limpios y auto-ajuste de ancho de columnas
 *
 * @param {Array<{ name: string, headers: string[] }>} sheets
 * @returns {Promise<Buffer>}
 */
const buildStyledTemplateBuffer = async (sheets) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PIADI - ECAS';
  workbook.created = new Date();

  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);
    const upperHeaders = (sheet.headers || []).map((h) => String(h || '').toUpperCase().trim());
    const headerRow = worksheet.addRow(upperHeaders);
    headerRow.height = 26;

    headerRow.eachCell((cell) => {
      cell.font = {
        name: 'Calibri',
        size: 11,
        bold: true,
        color: { argb: 'FFFFFFFF' }
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLOR_AZUL_ENCABEZADO }
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center',
        wrapText: false
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFB0C4DE' } },
        left: { style: 'thin', color: { argb: 'FFB0C4DE' } },
        bottom: { style: 'medium', color: { argb: 'FF0D0E5C' } },
        right: { style: 'thin', color: { argb: 'FFB0C4DE' } }
      };
    });

    // Auto-ajuste de ancho de columnas
    worksheet.columns.forEach((column) => {
      let maxLen = 12;
      column.eachCell({ includeEmpty: false }, (cell) => {
        const len = String(cell.value || '').length;
        if (len > maxLen) maxLen = len;
      });
      column.width = Math.max(maxLen + 4, 16);
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
};

module.exports = {
  buildStyledTemplateBuffer,
  COLOR_AZUL_ENCABEZADO
};
