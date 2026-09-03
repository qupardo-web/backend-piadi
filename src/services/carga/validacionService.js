const XLSX = require('xlsx');
const { CampoPlantilla, sequelize } = require('../../models');

const estaVacio = (valor) => valor === null ||
  valor === undefined ||
  (typeof valor === 'string' && valor.trim() === '');

const TIPOS_NUMERICOS = new Set(['INTEGER', 'BIGINT', 'FLOAT', 'REAL', 'DOUBLE PRECISION', 'DECIMAL']);
const TIPOS_ENTEROS = new Set(['INTEGER', 'BIGINT']);

const tipoModelo = (Model, campo) => {
  const attr = Model && Model.rawAttributes[campo.columna_destino];
  return attr && attr.type && (attr.type.key || attr.type.constructor?.name);
};

const resolverTipoEsperado = (campo, Model) => {
  const modelType = tipoModelo(Model, campo);
  if (TIPOS_ENTEROS.has(modelType)) return 'integer';
  if (TIPOS_NUMERICOS.has(modelType)) return 'number';
  if (modelType === 'DATE' || modelType === 'DATEONLY') return 'date';
  if (modelType === 'BOOLEAN') return 'boolean';

  const configuredType = String(campo.tipo_dato || '').trim().toLowerCase();
  if (['integer', 'number', 'date', 'boolean', 'string'].includes(configuredType)) {
    return configuredType;
  }
  return 'string';
};

const serializarValorSeguro = (valor) => {
  if (valor === null || valor === undefined) return '';
  const text = valor instanceof Date ? valor.toISOString() : String(valor);
  const clean = text.replace(/[\r\n\t]/g, ' ').trim();
  return clean.length > 80 ? `${clean.slice(0, 77)}...` : clean;
};

const normalizarFecha = (valor) => {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return { valido: true, valor: valor.toISOString().split('T')[0] };
  }

  if (typeof valor === 'number') {
    const parsed = XLSX.SSF.parse_date_code(valor);
    if (parsed) {
      return {
        valido: true,
        valor: `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
      };
    }
    return { valido: false, valor };
  }

  if (typeof valor !== 'string') return { valido: false, valor };
  const text = valor.trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$|^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
  if (!match) return { valido: false, valor };

  const year = Number(match[1] || match[6]);
  const month = Number(match[2] || match[5]);
  const day = Number(match[3] || match[4]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return { valido: false, valor };
  }
  return { valido: true, valor: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` };
};

const validarTipo = (valor, tipo) => {
  if (tipo === 'integer' || tipo === 'number') {
    const numericValue = typeof valor === 'string' ? Number(valor.trim()) : valor;
    const valido = typeof numericValue === 'number' && Number.isFinite(numericValue) &&
      (tipo !== 'integer' || Number.isInteger(numericValue));
    return { valido, valor: numericValue };
  }

  if (tipo === 'date') return normalizarFecha(valor);
  if (tipo === 'boolean') return { valido: typeof valor === 'boolean', valor };
  return {
    valido: typeof valor === 'string' || typeof valor === 'number' || typeof valor === 'boolean' ||
      (valor instanceof Date && !Number.isNaN(valor.getTime())),
    valor
  };
};

const detalleTipo = (tipo) => {
  if (tipo === 'integer') {
    return { esperado: 'número entero', correccion: 'Ingrese un número sin decimales, texto ni símbolos.' };
  }
  if (tipo === 'number') {
    return { esperado: 'valor numérico', correccion: 'Ingrese solo un número, sin texto ni símbolos.' };
  }
  if (tipo === 'date') {
    return { esperado: 'fecha válida', correccion: 'Use una fecha de Excel o el formato YYYY-MM-DD, DD-MM-YYYY o DD/MM/YYYY.' };
  }
  if (tipo === 'boolean') {
    return { esperado: 'valor booleano', correccion: 'Ingrese un valor booleano válido.' };
  }
  return { esperado: 'texto', correccion: 'Ingrese un valor de texto válido.' };
};

const crearErrorTipo = ({ hoja, fila, columna, celda, valor, tipo }) => {
  const { esperado, correccion } = detalleTipo(tipo);
  const valorSeguro = serializarValorSeguro(valor);
  return {
    hoja,
    campo: columna,
    fila,
    celda,
    valor: valorSeguro,
    esperado,
    mensaje: `Formato inválido en la hoja "${hoja}", fila ${fila}, columna "${columna}". ` +
      `Se esperaba ${esperado}, pero se recibió "${valorSeguro}". ${correccion}`
  };
};

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
          valor: '',
          esperado: 'columna obligatoria',
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
    
    for (const [index, fila] of datos.entries()) {
      const numeroFilaExcel = index + 2; // Fila 1 es el encabezado en Excel
      for (const campo of columnasRequeridasPresentes) {
        const valorCelda = fila[campo.columna_excel];
        const columnaIndex = columnasArchivo.indexOf(campo.columna_excel);
        const celda = columnaIndex >= 0 ? XLSX.utils.encode_cell({ r: index + 1, c: columnaIndex }) : '';
        
        // Comprobar si el valor es null, undefined, o un string vacío tras hacer trim
        if (estaVacio(valorCelda)) {
          errores.push({
            hoja: nombreHoja,
            campo: campo.columna_excel,
            fila: numeroFilaExcel,
            celda,
            valor: '',
            esperado: 'campo obligatorio',
            mensaje: `Fila ${numeroFilaExcel}: El campo requerido ${campo.columna_excel} está vacío en la hoja ${nombreHoja}`
          });
        }
      }

      // Validar las reglas del modelo en memoria (ej: formato RUT, formato email, fechas, etc.)
      const dataByTable = {};
      const tiposValidados = new Set();
      const tablasConTipoInvalido = new Set();
      for (const campo of camposDeHoja) {
        if (!dataByTable[campo.tabla_destino]) {
          dataByTable[campo.tabla_destino] = {};
        }
        let valor = fila[campo.columna_excel];
        const columnaIndex = columnasArchivo.indexOf(campo.columna_excel);
        const celda = columnaIndex >= 0 ? XLSX.utils.encode_cell({ r: index + 1, c: columnaIndex }) : '';
        const Model = sequelize.models[campo.tabla_destino];
        const tipoEsperado = resolverTipoEsperado(campo, Model);

        const tipoKey = `${campo.columna_excel}:${tipoEsperado}`;
        if (!estaVacio(valor) && !tiposValidados.has(tipoKey)) {
          tiposValidados.add(tipoKey);
          const validacionTipo = validarTipo(valor, tipoEsperado);
          if (!validacionTipo.valido) {
            tablasConTipoInvalido.add(campo.tabla_destino);
            errores.push(crearErrorTipo({
              hoja: nombreHoja,
              fila: numeroFilaExcel,
              columna: campo.columna_excel,
              celda,
              valor,
              tipo: tipoEsperado
            }));
          } else {
            valor = validacionTipo.valor;
          }
        }

        // Normalizar fechas antes de la validación en memoria
        if (Model) {
          const attrType = Model.rawAttributes[campo.columna_destino];
          if (attrType) {
            const typeKey = attrType.type && (attrType.type.key || (attrType.type.constructor && attrType.type.constructor.name));
            if (typeKey === 'DATEONLY' || typeKey === 'DATE') {
              // DD-MM-YYYY o DD/MM/YYYY → YYYY-MM-DD
              if (typeof valor === 'string') {
                const matchDMY = valor.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
                if (matchDMY) {
                  valor = `${matchDMY[3]}-${matchDMY[2]}-${matchDMY[1]}`;
                }
              }
              // Número serial de Excel → YYYY-MM-DD
              if (typeof valor === 'number' && valor > 40000 && valor < 60000) {
                const fecha = new Date((valor - 25569) * 86400 * 1000);
                valor = fecha.toISOString().split('T')[0];
              }
            }
          }
        }

        dataByTable[campo.tabla_destino][campo.columna_destino] = valor;
      }

      for (const [tabla, registro] of Object.entries(dataByTable)) {
        const Model = sequelize.models[tabla];
        if (!Model || tablasConTipoInvalido.has(tabla)) continue;

        const instance = Model.build(registro);
        try {
          await instance.validate();
        } catch (err) {
          if (err.errors) {
            for (const errItem of err.errors) {
              const campoConfig = camposDeHoja.find(c => c.columna_destino === errItem.path && c.tabla_destino === tabla);
              const campoExcel = campoConfig ? campoConfig.columna_excel : errItem.path;
              const columnaIndex = columnasArchivo.indexOf(campoExcel);
              const celdaExcel = columnaIndex >= 0 ? XLSX.utils.encode_cell({ r: index + 1, c: columnaIndex }) : '';
              const tipoEsperado = resolverTipoEsperado(
                campoConfig || { columna_destino: errItem.path, tipo_dato: 'string' },
                Model
              );

              let cleanMsg = errItem.message;
              if (cleanMsg.includes('cannot be null')) {
                cleanMsg = `El campo ${campoExcel} no puede ser nulo o estar vacío`;
              } else if (cleanMsg.includes('Validation notEmpty on') && cleanMsg.includes('failed')) {
                cleanMsg = `El campo ${campoExcel} no puede estar vacío`;
              } else if (cleanMsg.includes('Validation is on') && cleanMsg.includes('failed')) {
                cleanMsg = `El formato o valor del campo ${campoExcel} no es válido`;
              } else if (cleanMsg.includes('Validation isEmail on') && cleanMsg.includes('failed')) {
                cleanMsg = `El formato del correo electrónico ingresado no es válido`;
              } else if (cleanMsg.includes('Validation min on') && cleanMsg.includes('failed')) {
                const minVal = errItem.validatorArgs && errItem.validatorArgs[0] !== undefined ? errItem.validatorArgs[0] : '';
                cleanMsg = `El valor del campo ${campoExcel} debe ser mayor o igual a ${minVal}`;
              } else if (cleanMsg.includes('Validation max on') && cleanMsg.includes('failed')) {
                const maxVal = errItem.validatorArgs && errItem.validatorArgs[0] !== undefined ? errItem.validatorArgs[0] : '';
                cleanMsg = `El valor del campo ${campoExcel} debe ser menor o igual a ${maxVal}`;
              } else if (cleanMsg.toLowerCase().includes('failed') || cleanMsg.toLowerCase().includes('invalid') || cleanMsg.toLowerCase().includes('no es válido')) {
                cleanMsg = cleanMsg.replace(errItem.path || '', campoExcel);
              }

              // Evitar duplicar mensajes por celdas vacías (si ya se reportaron en el paso estructural)
              const isDuplicate = errores.some(e => e.hoja === nombreHoja && e.campo === campoExcel && e.fila === numeroFilaExcel);
              if (!isDuplicate) {
                errores.push({
                  hoja: nombreHoja,
                  campo: campoExcel,
                  fila: numeroFilaExcel,
                  celda: celdaExcel,
                  valor: serializarValorSeguro(fila[campoExcel]),
                  esperado: detalleTipo(tipoEsperado).esperado,
                  mensaje: `Fila ${numeroFilaExcel}: ${cleanMsg}`
                });
              }
            }
          }
        }
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

module.exports = {
  validarArchivo,
  resolverTipoEsperado,
  validarTipo,
  serializarValorSeguro
};
