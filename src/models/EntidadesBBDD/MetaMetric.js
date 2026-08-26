const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const MetaMetric = sequelize.define('MetaMetric', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  metaId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'metas',
      key: 'id'
    }
  },
  indicatorKey: {
    type: DataTypes.STRING,
    allowNull: false,
    references: {
      model: 'indicator_definitions',
      key: 'key'
    },
    validate: { notEmpty: true }
  },
  weight: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    validate: { min: 0, max: 100 }
  },
  behavior: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: { notEmpty: true }
  },
  targetValue: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  valueType: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: { notEmpty: true }
  },
  lowerLimit: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true
  },
  upperLimit: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true
  }
}, {
  tableName: 'meta_metrics',
  timestamps: true,
  indexes: [
    { name: 'idx_meta_metrics_meta', fields: ['metaId'] },
    { name: 'idx_meta_metrics_indicator', fields: ['indicatorKey'] }
  ]
});

module.exports = MetaMetric;
