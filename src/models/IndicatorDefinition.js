const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const IndicatorDefinition = sequelize.define('IndicatorDefinition', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  departmentId: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: { notEmpty: true }
  },
  key: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: { notEmpty: true }
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: { notEmpty: true }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  unit: {
    type: DataTypes.STRING,
    allowNull: true
  },
  format: {
    type: DataTypes.STRING,
    allowNull: true
  },
  formulaKey: {
    type: DataTypes.STRING,
    allowNull: true
  },
  enabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
}, {
  tableName: 'indicator_definitions',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['departmentId', 'key'] }
  ]
});

module.exports = IndicatorDefinition;
