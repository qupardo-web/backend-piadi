const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Seccion = sequelize.define('Seccion', {
  idSeccion: {
    type: DataTypes.STRING,
    primaryKey: true
  },
  anio: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  semestre: {
    type: DataTypes.ENUM('Otoño', 'Primavera'),
    allowNull: false,
  },
  curso: {
    type: DataTypes.STRING,
    allowNull: false
  },
  modalidad: {
    type: DataTypes.ENUM('Presencial', 'Online sincrónica', 'Híbrida'),
    allowNull: false
  },
  carreraPrograma: {
    type: DataTypes.STRING,
    allowNull: false
  },
  jornada: {
    type: DataTypes.ENUM('Vespertina', 'Diurna'),
    allowNull: false
  },
  nProyectos: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  nEstudiantes: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  docente: {
    type: DataTypes.STRING,
    allowNull: false
  },
  observacion: {
    type: DataTypes.TEXT,
    allowNull: false
  }
}, {
  tableName: 'secciones',
  timestamps: true
});

module.exports = Seccion;