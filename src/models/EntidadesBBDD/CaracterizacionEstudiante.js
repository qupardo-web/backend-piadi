const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const CaracterizacionEstudiante = sequelize.define('CaracterizacionEstudiante', {
  rut: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    allowNull: false,
    references: {
      model: 'alumnos',
      key: 'rut'
    },
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
  },
  dig: {
    type: DataTypes.CHAR(1),
    allowNull: true,
    validate: {
      len: [1, 1],
      is: /^[0-9Kk]$/i
    }
  },
  sexo: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  fechaNacimiento: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  region: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  comuna: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  tipoColegio: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  viaAcceso: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  nivelSocioeconomico: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  situacionFamiliar: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  beneficios: {
    type: DataTypes.STRING(255),
    allowNull: true
  }
}, {
  tableName: 'caracterizacion_estudiante',
  timestamps: true,
  indexes: [
    {
      name: 'idx_caracterizacion_estudiante_rut',
      fields: ['rut']
    }
  ]
});

module.exports = CaracterizacionEstudiante;
