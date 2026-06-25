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
    type: DataTypes.STRING,
    allowNull: false
  },
  semestre: {
    type: DataTypes.STRING,
    allowNull: false
  },
  mesInicio: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1,
      max: 12
    }
  },
  edadAlumno: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 15,
      max: 100
    }
  },
  rangoEdadAlumno: {
    type: DataTypes.STRING,
    allowNull: false
  },
  fechaMatricula: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  nombreCompleto: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      is: /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'\-]+$/i
    }
  },
  nCursos: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 0
    }
  },
  tieneMasCursos: {
    type: DataTypes.STRING,
    allowNull: true
  },
  valorListaCLP: {
    type: DataTypes.STRING,
    allowNull: true
  },
  descuentoAplicado: {
    type: DataTypes.STRING,
    allowNull: true
  },
  montoPagadoCLP: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'matriculas_programa',
  timestamps: true,
  indexes: [
    {
      name: 'idx_matriculas_prog_periodo',
      fields: ['anio', 'semestre']
    }
  ]
});

module.exports = MatriculaPrograma;