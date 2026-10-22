const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Titulacion = sequelize.define('Titulacion', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  rut: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'alumnos',
      key: 'rut'
    },
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
  },
  codCli: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  anioTitulacion: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1900
    }
  },
  periodo: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    validate: {
      min: 1,
      max: 2
    }
  },
  cohorte: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1900
    }
  },
  tiempoNormativo: {
    type: DataTypes.DECIMAL(4, 1),
    allowNull: true,
    validate: {
      min: 1.0
    }
  },
  semestresCursados: {
    type: DataTypes.DECIMAL(4, 1),
    allowNull: true,
    validate: {
      min: 1.0
    }
  },
  fechaTitulacion: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  distincion: {
    type: DataTypes.STRING(50),
    allowNull: true
  }
}, {
  tableName: 'titulacion',
  timestamps: true,
  indexes: [
    {
      name: 'idx_titulacion_anio',
      fields: ['anioTitulacion']
    },
    {
      name: 'idx_titulacion_cohorte',
      fields: ['cohorte']
    },
    {
      name: 'idx_titulacion_rut',
      fields: ['rut']
    },
    {
      name: 'idx_titulacion_alumno_anio_periodo',
      unique: true,
      fields: ['rut', 'anioTitulacion', 'periodo']
    }
  ]
});

module.exports = Titulacion;
