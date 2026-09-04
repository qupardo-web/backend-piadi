const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Seccion = sequelize.define('Seccion', {
  idSeccion: {
    type: DataTypes.STRING,
    primaryKey: true
  },
  anio: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1900
    }
  },
  semestre: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  curso: {
    type: DataTypes.STRING,
    allowNull: false
  },
  modalidad: {
    type: DataTypes.STRING,
    allowNull: false
  },
  carreraPrograma: {
    type: DataTypes.STRING,
    allowNull: false
  },
  jornada: {
    type: DataTypes.STRING,
    allowNull: false
  },
  nProyectos: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 0
    }
  },
  nEstudiantes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 0
    }
  },
  docente: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  observacion: {
    type: DataTypes.TEXT,
    allowNull: false
  }
}, {
  tableName: 'secciones',
  timestamps: true,
  indexes: [
    {
      name: 'idx_secciones_periodo',
      fields: ['anio', 'semestre']
    },
    {
      name: 'idx_secciones_carrera',
      fields: ['carreraPrograma']
    }
  ]
});

module.exports = Seccion;