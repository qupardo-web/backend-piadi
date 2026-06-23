const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');
const { validate } = require('rut.js');

const AlumnoExterno = sequelize.define('AlumnoExterno', {
  idParticipante: {
    type: DataTypes.STRING,
    primaryKey: true,
    allowNull: false
  },
  nombre: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true,
      is: /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'\-]+$/i
    }
  },
  apellidoPaterno: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true,
      is: /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'\-]+$/i
    }
  },
  apellidoMaterno: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true,
      is: /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'\-]+$/i
    }
  },
  rut: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      is: /^\d{1,2}\.?\d{3}\.?\d{3}-?[0-9Kk]$/i,
      isValidRut(value) {
        if (value && !validate(value)) {
          throw new Error(`El RUT ${value} no es válido matemáticamente`);
        }
      }
    }
  },
  sexo: {
    type: DataTypes.STRING,
    allowNull: false
  },
  nacionalidad: {
    type: DataTypes.STRING,
    allowNull: false
  },
  comuna: {
    type: DataTypes.STRING,
    allowNull: false
  },
  region: {
    type: DataTypes.STRING,
    allowNull: false
  },
  nivelDeEstudio: {
    type: DataTypes.STRING,
    allowNull: false
  },
  trabajaActualmente: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'No'
  },
  lugarDeTrabajo: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'No Aplica'
  },
  cargo: { 
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'No Aplica'
  },
  sectorEconomico: {
    type: DataTypes.STRING,
    allowNull: false
  },
  ocupacion: {
    type: DataTypes.STRING,
    allowNull: false
  },
  tipoParticipante: {
    type: DataTypes.STRING,
    allowNull: false
  },
  carreraCursada: {
    type: DataTypes.STRING,
    allowNull: false
  },
}, {
  tableName: 'alumnos_externos',
  timestamps: true
});

module.exports = AlumnoExterno;