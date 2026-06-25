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
    allowNull: false,
    validate: {
      min: 0
    }
  },
  aprobados: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 0
    }
  },
  reprobados: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 0
    }
  },
  tasaAprobacion: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    validate: {
      min: 0.0,
      max: 100.0
    }
  },
  estado: {
    type: DataTypes.STRING,
    allowNull: false
  },
  ejecutado: {
    type: DataTypes.STRING,
    allowNull: false
  }
}, {
  tableName: 'resultados_programa',
  timestamps: true,
  validate: {
    validateResultadosCoherentes() {
      if (((this.aprobados || 0) + (this.reprobados || 0)) > (this.matricula || 0)) {
        throw new Error('La suma de aprobados y reprobados no puede ser mayor que la matrícula del programa.');
      }
    }
  }
});

module.exports = ResultadosPrograma;