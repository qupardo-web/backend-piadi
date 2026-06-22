const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Proyecto = sequelize.define('Proyecto', {
  idProyecto: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  nombreProyecto: {
    type: DataTypes.STRING,
    allowNull: false
  },
  areaTematica: {
    type: DataTypes.STRING,
    allowNull: false
  },
  cursoLinea: {
    type: DataTypes.STRING,
    allowNull: false
  },
  estado: {
    type: DataTypes.ENUM('En Curso', 'Finalizado'),
    allowNull: false,
    defaultValue: 'En Curso'
  },
  unidadResponsable: {
    type: DataTypes.STRING,
    allowNull: false
  },
  responsableDocente: {
    type: DataTypes.STRING,
    allowNull: false
  },
  socioContraparte: {
    type: DataTypes.STRING,
    allowNull: false
  },
  anioInicio: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  anioTermino: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  semestreInicio: {
    type: DataTypes.ENUM('Otoño', 'Primavera'),
    allowNull: false
  },
  fechaInicio: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  fechaCierreEstimada: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  tipoProyecto: {
    type: DataTypes.ENUM('Estudiantil','Institucional'),
    allowNull: false
  },
  resultadoPrincipal: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  nEstudiantes: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  nFuncionarios: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  nDocentes: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  evidenciaPrincipal: {
    type: DataTypes.STRING,
    allowNull: false
  },
  observacion: {
    type: DataTypes.TEXT,
    allowNull: false
  }
}, {
  tableName: 'proyectos',
  timestamps: true
});

module.exports = Proyecto;