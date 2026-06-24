const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Department = sequelize.define('Department', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
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
  enabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  hasData: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'order'
  }
}, {
  tableName: 'departments',
  timestamps: true
});

module.exports = Department;
