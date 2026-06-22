const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * @openapi
 * components:
 *   schemas:
 *     CampoPlantilla:
 *       type: object
 *       required:
 *         - plantillaId
 *         - nombre_campo
 *         - columna_excel
 *         - hoja_origen
 *         - tabla_destino
 *         - columna_destino
 *         - tipo_dato
 *       properties:
 *         id:
 *           type: integer
 *           description: ID autogenerado del campo.
 *         plantillaId:
 *           type: integer
 *           description: ID de la plantilla asociada.
 *         nombre_campo:
 *           type: string
 *           description: Nombre legible del campo (ej. RUT, Nombre).
 *         columna_excel:
 *           type: string
 *           description: Nombre de la columna en el Excel.
 *         hoja_origen:
 *           type: string
 *           description: Nombre de la hoja del Excel donde está el campo.
 *         tabla_destino:
 *           type: string
 *           description: Nombre de la tabla donde se insertará el campo.
 *         columna_destino:
 *           type: string
 *           description: Nombre de la columna en la tabla destino.
 *         tipo_dato:
 *           type: string
 *           description: Tipo de dato (string, number, date, boolean).
 *         requerido:
 *           type: boolean
 *           description: Indica si el campo es obligatorio.
 *         orden_insercion:
 *           type: integer
 *           description: Prioridad de inserción para resolver dependencias.
 *         campo_lookup_tabla:
 *           type: string
 *           description: Tabla para lookup si el valor es un código.
 *         campo_lookup_columna_db:
 *           type: string
 *           description: Columna en la BD contra la que comparar el lookup.
 *         campo_lookup_retorno:
 *           type: string
 *           description: Columna a retornar del lookup (ej. id).
 */
const CampoPlantilla = sequelize.define('CampoPlantilla', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  plantillaId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'plantillas',
      key: 'id'
    }
  },
  nombre_campo: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  columna_excel: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  hoja_origen: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  tabla_destino: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  columna_destino: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  tipo_dato: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  requerido: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  orden_insercion: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  campo_lookup_tabla: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  campo_lookup_columna_db: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  campo_lookup_retorno: {
    type: DataTypes.STRING(100),
    allowNull: true
  }
}, {
  tableName: 'campos_plantilla',
  timestamps: true
});

module.exports = CampoPlantilla;
