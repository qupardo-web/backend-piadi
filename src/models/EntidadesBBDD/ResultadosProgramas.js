const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const ResultadosPrograma = sequelize.define('ResultadosPrograma', {
  idPrograma: {
    type: DataTypes.STRING,
    allowNull: false,
    primaryKey: true,
    references: {
      model: 'programas',
      key: 'idPrograma'
    }
  },
  matricula: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  aprobados: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  reprobados: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  tasaAprobacion: {
    type: DataTypes.STRING,
    allowNull: false
  },
  estado: {
    type: DataTypes.ENUM('Dictado', 'Reprogramado', 'Suspendido'),
    allowNull: false
  },
  ejecutado: {
    type: DataTypes.STRING,
    allowNull: false
  }
}, {
  tableName: 'resultados_programa',
  timestamps: true
});

module.exports = ResultadosPrograma;