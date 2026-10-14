const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const RendimientoAsignatura = sequelize.define('RendimientoAsignatura', {
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
  ramoEquiv: {
    type: DataTypes.STRING(50),
    allowNull: false,
    references: {
      model: 'asignaturas',
      key: 'ramoEquiv'
    },
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
  },
  seccion: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 1
    }
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
  notaFinal: {
    type: DataTypes.DECIMAL(3, 1),
    allowNull: true,
    validate: {
      min: 1.0,
      max: 7.0
    }
  },
  estadoAsignatura: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'APROBADO'
  },
  asistencia: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    validate: {
      min: 0.0,
      max: 100.0
    }
  }
}, {
  tableName: 'rendimiento_asignatura',
  timestamps: true,
  indexes: [
    {
      name: 'idx_rendimiento_anio_periodo',
      fields: ['anio', 'periodo']
    },
    {
      name: 'idx_rendimiento_rut',
      fields: ['rut']
    },
    {
      name: 'idx_rendimiento_ramo',
      fields: ['ramoEquiv']
    },
    {
      name: 'idx_rendimiento_alumno_asignatura_periodo',
      unique: true,
      fields: ['rut', 'ramoEquiv', 'anio', 'periodo']
    }
  ]
});

module.exports = RendimientoAsignatura;
