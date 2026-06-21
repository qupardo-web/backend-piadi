const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const MatriculaPrograma = sequelize.define('MatriculaPrograma', {
  idInscripcion: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  idPrograma: {
    type: DataTypes.STRING,
    allowNull: false,
    references: {
      model: 'programas',
      key: 'idPrograma'
    }
  },
  idParticipante: {
    type: DataTypes.STRING,
    allowNull: false,
    references: {
      model: 'alumnos_externos',
      key: 'idParticipante'
    }
  },
  anio: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  semestre: {
    type: DataTypes.STRING,
    allowNull: false
  },
  mesInicio: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  edadAlumno: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  rangoEdadAlumno: {
    type: DataTypes.STRING,
    allowNull: false
  },
  estadoAcademico: {
    type: DataTypes.STRING,
    allowNull: false
  },
  fechaMatricula: {
    type: DataTypes.DATEONLY,
    allowNull: false
  }
}, {
  tableName: 'matriculas_programa',
  timestamps: true
});

module.exports = MatriculaPrograma;