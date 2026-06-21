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

    for (const campo of camposDeHoja) {
      if (campo.requerido && !columnasArchivo.includes(campo.columna_excel)) {
        errores.push({
          hoja: nombreHoja,
          campo: campo.columna_excel,
          mensaje: `La columna requerida "${campo.columna_excel}" no existe en la hoja "${nombreHoja}"`
        });
      }
    }
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
