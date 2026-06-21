const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const AlumnoExterno = sequelize.define('AlumnoExterno', {
  idParticipante: {
    type: DataTypes.STRING,
    primaryKey: true,
    allowNull: false
  },
  nombre: {
    type: DataTypes.STRING,
    allowNull: false
  },
  apellidoPaterno: {
    type: DataTypes.STRING,
    allowNull: false
  },
  apellidoMaterno: {
    type: DataTypes.STRING,
    allowNull: false
  },
  rut: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
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
    type: DataTypes.ENUM('Sí', 'No', 'Independiente'),
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