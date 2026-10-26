const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const { HELP_MODULES } = require('../config/helpModules');

const EntradaAyuda = sequelize.define('EntradaAyuda', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  modulo: {
    type: DataTypes.STRING(64),
    allowNull: false,
    validate: { isIn: [HELP_MODULES] }
  },
  pregunta: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: { notEmpty: true }
  },
  respuesta: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: { notEmpty: true }
  },
  orden: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: { min: 0 }
  },
  activo: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
}, {
  tableName: 'entradas_ayuda',
  timestamps: true,
  indexes: [
    { name: 'idx_entradas_ayuda_admin', fields: ['modulo', 'orden', 'id'] },
    { name: 'idx_entradas_ayuda_activas', fields: ['modulo', 'orden', 'id'], where: { activo: true } }
  ]
});

module.exports = EntradaAyuda;
