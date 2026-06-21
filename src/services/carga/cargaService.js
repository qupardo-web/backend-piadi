const XLSX = require('xlsx');
const { sequelize } = require('../../models');

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

      for (const fila of filas) {
        const filaObj = { _key: JSON.stringify(fila), _orden: Infinity, datos: {} };

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

        // Construir registros para esta tabla en este orden
        const registrosAInsertar = [];

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

              // Buscar primero en el mapa en memoria
              if (lookupMaps[campo.campo_lookup_tabla] &&
                  lookupMaps[campo.campo_lookup_tabla][lookupCol] &&
                  lookupMaps[campo.campo_lookup_tabla][lookupCol][valor] !== undefined) {
                valor = lookupMaps[campo.campo_lookup_tabla][lookupCol][valor][lookupRet];
              } else {
                // Fallback: buscar en BD
                const lookupModel = sequelize.models[campo.campo_lookup_tabla];
                if (lookupModel) {
                  const registroBD = await lookupModel.findOne({
                    where: { [lookupCol]: valor },
                    transaction
                  });
                  if (registroBD) {
                    valor = registroBD[lookupRet];
                  } else {
                    throw new Error(
                      `Valor "${valor}" no encontrado en ${campo.campo_lookup_tabla} ` +
                      `(columna: ${campo.columna_excel})`
                    );
                  }
                }
              }
            }

            registro[colDest] = valor;
          }

          if (Object.keys(registro).length > 0) {
            registrosAInsertar.push(registro);
          }
        }

        // Insertar y guardar IDs para futuros lookups
        if (registrosAInsertar.length > 0) {
          const insertados = await Model.bulkCreate(registrosAInsertar, {
            transaction,
            returning: true
          });
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

    await transaction.commit();

    return { success: true, resumen: resumenFinal };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

module.exports = { procesarCarga };
