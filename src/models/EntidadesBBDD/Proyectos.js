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
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'En Curso'
  },
  unidadResponsable: {
    type: DataTypes.STRING,
    allowNull: false
  },
  responsableDocente: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true,
      is: /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'\-]+$/i
    }
  },
  socioContraparte: {
    type: DataTypes.STRING,
    allowNull: false
  },
  anioInicio: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1900
    }
  },
  anioTermino: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      isAfterOrEqualInicio(value) {
        if (value < this.anioInicio) {
          throw new Error('El año de término debe ser mayor o igual al año de inicio.');
        }
      }
    }
  },
  semestreInicio: {
    type: DataTypes.STRING,
    allowNull: false
  },
  fechaInicio: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  fechaCierreEstimada: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    validate: {
      isAfterInicio(value) {
        if (new Date(value) <= new Date(this.fechaInicio)) {
          throw new Error('La fecha de cierre estimada debe ser posterior a la fecha de inicio.');
        }
      }
    }
  },
  tipoProyecto: {
    type: DataTypes.STRING,
    allowNull: false
  },
  resultadoPrincipal: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  nEstudiantes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 0
    }
  },
  nFuncionarios: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 0
    }
  },
  nDocentes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 0
    }
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