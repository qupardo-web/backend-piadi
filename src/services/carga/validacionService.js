const XLSX = require('xlsx');
const { CampoPlantilla } = require('../../models');

const validarArchivo = async (filePath, plantillaId) => {
  const campos = await CampoPlantilla.findAll({
    where: { plantillaId }
  });

  if (campos.length === 0) {
    throw new Error('No hay campos configurados para esta plantilla');
  }

  const workbook = XLSX.readFile(filePath);
  const errores = [];

  // Agrupar campos por hoja_origen
  const hojasEsperadas = {};
  for (const campo of campos) {
    if (!hojasEsperadas[campo.hoja_origen]) {
      hojasEsperadas[campo.hoja_origen] = [];
    }
    hojasEsperadas[campo.hoja_origen].push(campo);
  }

  // Validar cada hoja esperada
  for (const [nombreHoja, camposDeHoja] of Object.entries(hojasEsperadas)) {
    if (!workbook.SheetNames.includes(nombreHoja)) {
      errores.push({
        hoja: nombreHoja,
        mensaje: `La hoja "${nombreHoja}" no existe en el archivo`
      });
      continue;
    }

    const hoja = workbook.Sheets[nombreHoja];
    const datos = XLSX.utils.sheet_to_json(hoja, { defval: null });

    if (datos.length === 0) {
      errores.push({
        hoja: nombreHoja,
        mensaje: `La hoja "${nombreHoja}" no contiene datos`
      });
      continue;
    }

    const columnasArchivo = Object.keys(datos[0]);
    const columnasPresentes = new Set(columnasArchivo);

    // 1. Validar la existencia de las columnas requeridas
    for (const campo of camposDeHoja) {
      if (campo.requerido && !columnasPresentes.has(campo.columna_excel)) {
        errores.push({
          hoja: nombreHoja,
          campo: campo.columna_excel,
          mensaje: `La columna requerida ${campo.columna_excel} no existe en la hoja ${nombreHoja}`
        });
      }
    }

    // 2. Si no hay error de columnas faltantes en esta hoja, validar celdas vacías fila por fila
    // Evitamos duplicar validaciones si una misma columna de Excel se mapea a múltiples tablas de base de datos
    const columnasUnicas = new Map();
    camposDeHoja.filter(c => c.requerido && columnasPresentes.has(c.columna_excel)).forEach(c => {
      if (!columnasUnicas.has(c.columna_excel)) {
        columnasUnicas.set(c.columna_excel, c);
      }
    });
    const columnasRequeridasPresentes = [...columnasUnicas.values()];
    
    datos.forEach((fila, index) => {
      const numeroFilaExcel = index + 2; // Fila 1 es el encabezado en Excel
      for (const campo of columnasRequeridasPresentes) {
        const valorCelda = fila[campo.columna_excel];
        
        // Comprobar si el valor es null, undefined, o un string vacío tras hacer trim
        const estaVacio = valorCelda === null || 
                          valorCelda === undefined || 
                          (typeof valorCelda === 'string' && valorCelda.trim() === '');
                          
        if (estaVacio) {
          errores.push({
            hoja: nombreHoja,
            campo: campo.columna_excel,
            fila: numeroFilaExcel,
            mensaje: `Fila ${numeroFilaExcel}: El campo requerido ${campo.columna_excel} está vacío en la hoja ${nombreHoja}`
          });
        }
      }
    });
  }

  return {
    valido: errores.length === 0,
    errores,
    campos,
    workbook,
    hojasEsperadas
  };
};

module.exports = { validarArchivo };
