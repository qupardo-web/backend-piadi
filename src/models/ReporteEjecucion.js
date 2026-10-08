const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * @openapi
 * components:
 *   schemas:
 *     ReporteEjecucion:
 *       type: object
 *       required:
 *         - reporteId
 *       properties:
 *         id:
 *           type: integer
 *           description: ID autogenerado de la ejecución.
 *         reporteId:
 *           type: integer
 *           description: Reporte que se generó.
 *         solicitadoPor:
 *           type: integer
 *           description: Usuario que solicitó la generación.
 *         estado:
 *           type: string
 *           description: Estado de la generación (PENDIENTE, GENERANDO, LISTO, ERROR).
 *         formato:
 *           type: string
 *           description: Formato generado (XLSX o PDF).
 *         parametros:
 *           type: object
 *           description: Parámetros usados en la generación (período, filtros).
 *         archivoNombre:
 *           type: string
 *           description: Nombre del archivo generado.
 *         error:
 *           type: string
 *           description: Mensaje de error si la generación falló.
 *         generadoEn:
 *           type: string
 *           format: date-time
 *           description: Fecha de finalización de la generación.
 */
const ReporteEjecucion = sequelize.define('ReporteEjecucion', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  reporteId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'reportes',
      key: 'id'
    }
  },
  solicitadoPor: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  estado: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'PENDIENTE',
    validate: {
      isIn: [['PENDIENTE', 'GENERANDO', 'LISTO', 'ERROR']]
    }
  },
  formato: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: 'XLSX',
    validate: {
      isIn: [['XLSX', 'PDF']]
    }
  },
  parametros: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {}
  },
  archivoNombre: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  error: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  generadoEn: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'reporte_ejecuciones',
  timestamps: true
});

module.exports = ReporteEjecucion;
