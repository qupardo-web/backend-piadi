const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * @openapi
 * components:
 *   schemas:
 *     Reporte:
 *       type: object
 *       required:
 *         - nombre
 *       properties:
 *         id:
 *           type: integer
 *           description: ID autogenerado del reporte.
 *         nombre:
 *           type: string
 *           description: Nombre del reporte.
 *         descripcion:
 *           type: string
 *           description: Descripción del reporte.
 *         roleId:
 *           type: integer
 *           description: Rol/área al que pertenece el reporte (opcional).
 *         departmentId:
 *           type: string
 *           description: Área (departamento) del reporte; vacío para reportes globales (Rectoría).
 *         createdBy:
 *           type: integer
 *           description: Usuario que creó el reporte.
 *         indicadores:
 *           type: array
 *           description: Lista de claves de indicadores incluidos.
 *         filtros:
 *           type: object
 *           description: Filtros y período por defecto del reporte.
 *         tipo:
 *           type: string
 *           description: Tipo de reporte (PREDEFINIDO o PERSONALIZADO).
 *         formato:
 *           type: string
 *           description: Formato de salida (XLSX o PDF).
 *         activo:
 *           type: boolean
 *           description: Si el reporte está activo.
 */
const Reporte = sequelize.define('Reporte', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  nombre: {
    type: DataTypes.STRING(150),
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  descripcion: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  roleId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'roles',
      key: 'id'
    }
  },
  departmentId: {
    type: DataTypes.STRING,
    allowNull: true,
    references: {
      model: 'departments',
      key: 'key'
    }
  },
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  indicadores: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: []
  },
  filtros: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {}
  },
  tipo: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'PERSONALIZADO',
    validate: {
      isIn: [['PREDEFINIDO', 'PERSONALIZADO']]
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
  activo: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
}, {
  tableName: 'reportes',
  timestamps: true
});

module.exports = Reporte;
