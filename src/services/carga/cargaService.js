const XLSX = require('xlsx');
const { sequelize } = require('../../models');
const { Op } = require('sequelize');

const procesarCarga = async (workbook, campos) => {
  const transaction = await sequelize.transaction();

  try {
    // 1. Leer todas las filas del Excel (sin resolver lookups aún)
    const hojas = {};
    for (const campo of campos) {
      if (!hojas[campo.hoja_origen]) {
        hojas[campo.hoja_origen] = [];
      }
      hojas[campo.hoja_origen].push(campo);
    }

    // Cada fila se identifica por su contenido único
    const filasProcesadas = [];

    for (const [nombreHoja, camposHoja] of Object.entries(hojas)) {
      const hoja = workbook.Sheets[nombreHoja];
      const filas = XLSX.utils.sheet_to_json(hoja, { defval: null });

      for (const [index, fila] of filas.entries()) {
        const filaObj = { _key: JSON.stringify(fila), _orden: Infinity, _hoja: nombreHoja, _fila: index + 2, datos: {} };

        for (const campo of camposHoja) {
          if (!filaObj.datos[campo.tabla_destino]) {
            filaObj.datos[campo.tabla_destino] = {};
          }
          filaObj.datos[campo.tabla_destino][campo.columna_destino] = {
            valor: fila[campo.columna_excel],
            campo
          };
          if (campo.orden_insercion < filaObj._orden) {
            filaObj._orden = campo.orden_insercion;
          }
        }

        filasProcesadas.push(filaObj);
      }
    }

    // 2. Agrupar tablas por orden_insercion
    const ordenes = {};
    for (const campo of campos) {
      if (!ordenes[campo.orden_insercion]) {
        ordenes[campo.orden_insercion] = new Set();
      }
      ordenes[campo.orden_insercion].add(campo.tabla_destino);
    }

    const ordenesSorted = Object.keys(ordenes).sort((a, b) => a - b);

    // 3. Procesar por orden de inserción
    const lookupMaps = {};
    const resumenFinal = {};

    for (const orden of ordenesSorted) {
      const tablas = [...ordenes[orden]];

      for (const tabla of tablas) {
        const Model = sequelize.models[tabla];
        if (!Model) {
          throw new Error(`El modelo "${tabla}" no está registrado en Sequelize`);
        }

        // --- PRE-CARGAR VALORES LOOKUP DE FORMA MASIVA (EVITA CONSULTAS N+1) ---
        const camposLookupDef = campos.filter(c => c.tabla_destino === tabla && c.campo_lookup_tabla);
        for (const cLookup of camposLookupDef) {
          const lookupTabla = cLookup.campo_lookup_tabla;
          const lookupCol = cLookup.campo_lookup_columna_db;
          
          const valoresUnicosExcel = new Set();
          for (const fila of filasProcesadas) {
            const datosTabla = fila.datos[tabla];
            if (datosTabla && datosTabla[cLookup.columna_destino]) {
              const val = datosTabla[cLookup.columna_destino].valor;
              if (val !== null && val !== undefined && String(val).trim() !== '') {
                valoresUnicosExcel.add(String(val).trim());
              }
            }
          }

          if (valoresUnicosExcel.size > 0) {
            const lookupModel = sequelize.models[lookupTabla];
            if (lookupModel) {
              if (!lookupMaps[lookupTabla]) lookupMaps[lookupTabla] = {};
              if (!lookupMaps[lookupTabla][lookupCol]) lookupMaps[lookupTabla][lookupCol] = {};

              const valoresAQuery = [...valoresUnicosExcel].filter(
                val => lookupMaps[lookupTabla][lookupCol][val] === undefined
              );

              if (valoresAQuery.length > 0) {
                const registrosBD = await lookupModel.findAll({
                  where: {
                    [lookupCol]: {
                      [Op.in]: valoresAQuery
                    }
                  },
                  transaction
                });

                for (const reg of registrosBD) {
                  const valClave = reg[lookupCol];
                  if (valClave !== null && valClave !== undefined) {
                    lookupMaps[lookupTabla][lookupCol][String(valClave)] = reg.dataValues;
                  }
                }
              }
            }
          }
        }

        // Construir registros para esta tabla en este orden
        let registrosAInsertar = [];

        for (const fila of filasProcesadas) {
          const datosTabla = fila.datos[tabla];
          if (!datosTabla) continue;

          const registro = {};

          for (const [colDest, info] of Object.entries(datosTabla)) {
            let valor = info.valor;
            const campo = info.campo;

            // Resolver lookup si corresponde
            if (campo.campo_lookup_tabla && valor !== null && valor !== undefined) {
              const lookupCol = campo.campo_lookup_columna_db;
              const lookupRet = campo.campo_lookup_retorno;
              const lookupKey = String(valor).trim();

              // Buscar en el mapa en memoria (que ahora tiene cargados todos los valores del Excel)
              if (lookupMaps[campo.campo_lookup_tabla] &&
                  lookupMaps[campo.campo_lookup_tabla][lookupCol] &&
                  (lookupMaps[campo.campo_lookup_tabla][lookupCol][valor] !== undefined ||
                   lookupMaps[campo.campo_lookup_tabla][lookupCol][lookupKey] !== undefined)) {
                const cacheData = lookupMaps[campo.campo_lookup_tabla][lookupCol][valor] !== undefined
                  ? lookupMaps[campo.campo_lookup_tabla][lookupCol][valor]
                  : lookupMaps[campo.campo_lookup_tabla][lookupCol][lookupKey];
                valor = cacheData[lookupRet];
              } else {
                // Si llegamos aquí, el valor no existe en la BD (error relacional de consistencia)
                throw new Error(
                  `Valor "${valor}" no encontrado en ${campo.campo_lookup_tabla} ` +
                  `(columna: ${campo.columna_excel})`
                );
              }
            }

            // Normalizar fechas
            const attrType = Model.rawAttributes[colDest];
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

            registro[colDest] = valor;
          }

          if (Object.keys(registro).length > 0) {
            registrosAInsertar.push(registro);
          }
        }

        const pkAttrs = Model.primaryKeyAttributes;
        if (pkAttrs && pkAttrs.length > 0 && registrosAInsertar.some(r => pkAttrs.some(a => r[a] !== undefined))) {
          const map = new Map();
          for (const reg of registrosAInsertar) {
            const key = pkAttrs.map(a => reg[a]).join('::');
            if (!map.has(key)) map.set(key, reg);
          }
          registrosAInsertar = [...map.values()];
        }

        if (registrosAInsertar.length > 0) {
          if (tabla === 'ResultadosPrograma') {
            console.log("ResultadosPrograma rows to insert (first 5):", registrosAInsertar.slice(0, 5));
            console.log("Total rows to insert:", registrosAInsertar.length);
          }
          let insertados;
          try {
            insertados = await Model.bulkCreate(registrosAInsertar, {
              transaction,
              returning: true,
              validate: true
            });
          } catch (err) {
            if (err.errors) {
              const enrichValidationErrors = (e) => {
                if (Array.isArray(e.errors)) {
                  e.errors.forEach(enrichValidationErrors);
                } else if (e.errors) {
                  enrichValidationErrors(e.errors);
                } else if (e.message) {
                  // individual error item
                  const recordValues = e.instance ? e.instance.dataValues : null;
                  let matchedFila = null;
                  if (recordValues) {
                    matchedFila = filasProcesadas.find(f => {
                      const datosTabla = f.datos[tabla];
                      if (!datosTabla) return false;
                      const pk = pkAttrs && pkAttrs[0];
                      if (pk && datosTabla[pk] && String(datosTabla[pk].valor).trim() === String(recordValues[pk]).trim()) {
                        return true;
                      }
                      return Object.entries(datosTabla).every(([col, info]) => {
                        return String(info.valor) === String(recordValues[col]);
                      });
                    });
                  }
                  const campoConfig = campos.find(c => c.columna_destino === e.path && c.tabla_destino === tabla);
                  const campoExcel = campoConfig ? campoConfig.columna_excel : e.path;
                  
                  let cleanMsg = e.message;
                  if (cleanMsg.includes('cannot be null')) {
                    cleanMsg = `El campo ${campoExcel} no puede ser nulo o estar vacío`;
                  } else if (cleanMsg.includes('Validation notEmpty on') && cleanMsg.includes('failed')) {
                    cleanMsg = `El campo ${campoExcel} no puede estar vacío`;
                  } else if (cleanMsg.includes('Validation is on') && cleanMsg.includes('failed')) {
                    cleanMsg = `El formato o valor del campo ${campoExcel} no es válido`;
                  } else if (cleanMsg.includes('Validation isEmail on') && cleanMsg.includes('failed')) {
                    cleanMsg = `El formato del correo electrónico ingresado no es válido`;
                  } else if (cleanMsg.includes('Validation min on') && cleanMsg.includes('failed')) {
                    const minVal = e.validatorArgs && e.validatorArgs[0] !== undefined ? e.validatorArgs[0] : '';
                    cleanMsg = `El valor del campo ${campoExcel} debe ser mayor o igual a ${minVal}`;
                  } else if (cleanMsg.includes('Validation max on') && cleanMsg.includes('failed')) {
                    const maxVal = e.validatorArgs && e.validatorArgs[0] !== undefined ? e.validatorArgs[0] : '';
                    cleanMsg = `El valor del campo ${campoExcel} debe ser menor o igual a ${maxVal}`;
                  } else if (cleanMsg.toLowerCase().includes('failed') || cleanMsg.toLowerCase().includes('invalid') || cleanMsg.toLowerCase().includes('no es válido')) {
                    cleanMsg = cleanMsg.replace(e.path || '', campoExcel);
                  }

                  const hojaName = matchedFila ? matchedFila._hoja : 'General';
                  const filaNum = matchedFila ? matchedFila._fila : '';
                  
                  e.message = cleanMsg;
                  e.hoja = hojaName;
                  e.fila = filaNum;
                  e.celda = filaNum ? `Fila ${filaNum}` : '';
                  e.path = campoExcel;
                }
              };
              enrichValidationErrors(err);
            }
            throw err;
          }
          resumenFinal[tabla] = (resumenFinal[tabla] || 0) + insertados.length;

          // Construir mapas de lookup: tabla → columna → valor → registro
          if (!lookupMaps[tabla]) {
            lookupMaps[tabla] = {};
          }

          // Usar las columnas de lookup declaradas en los campos como índices
          const camposLookup = campos.filter(c =>
            c.tabla_destino === tabla && c.campo_lookup_columna_db
          );

          for (const cLookup of camposLookup) {
            const colDb = cLookup.campo_lookup_columna_db;
            if (!lookupMaps[tabla][colDb]) {
              lookupMaps[tabla][colDb] = {};
            }
            for (const inserted of insertados) {
              const valorClave = inserted[colDb];
              if (valorClave !== null && valorClave !== undefined) {
                lookupMaps[tabla][colDb][String(valorClave)] = inserted.dataValues;
              }
            }
          }
        }
      }
    }

    console.log('Refreshing materialized view v_meta_indicator_values...');
    await sequelize.query('REFRESH MATERIALIZED VIEW v_meta_indicator_values', { transaction });

    await transaction.commit();

    return { success: true, resumen: resumenFinal };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

module.exports = { procesarCarga };
