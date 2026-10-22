const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Practica = sequelize.define('Practica', {
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
  anio: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1900
    }
  },
  periodo: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1,
      max: 2
    }
  },
  tipoPractica: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  estado: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  fechaInicio: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  fechaTermino: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  horas: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 0
    }
  },
  empresa: {
    type: DataTypes.STRING(150),
    allowNull: true
  }
}, {
  tableName: 'practicas',
  timestamps: true,
  indexes: [
    {
      name: 'idx_practicas_anio_periodo',
      fields: ['anio', 'periodo']
    },
    {
      name: 'idx_practicas_rut',
      fields: ['rut']
    },
    {
      name: 'idx_practicas_estado',
      fields: ['estado']
    },
    {
      name: 'idx_practicas_alumno_periodo_tipo',
      unique: true,
      fields: ['rut', 'anio', 'periodo', 'tipoPractica']
    }
  ]
});

module.exports = Practica;
