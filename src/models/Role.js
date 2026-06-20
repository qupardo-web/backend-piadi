const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * @openapi
 * components:
 *   schemas:
 *     Role:
 *       type: object
 *       required:
 *         - name
 *         - group
 *       properties:
 *         id:
 *           type: integer
 *           description: ID autogenerado del rol.
 *         name:
 *           type: string
 *           description: Nombre específico del rol (ej. Director Docente).
 *         group:
 *           type: string
 *           description: Grupo de pertenencia (ej. Direccion, Rectoria, Calidad).
 *         description:
 *           type: string
 *           description: Descripción breve de las responsabilidades del rol.
 */
const Role = sequelize.define('Role', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    validate: {
      notEmpty: true
    }
  },
  group: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  description: {
    type: DataTypes.STRING(255),
    allowNull: true
  }
}, {
  tableName: 'roles',
  timestamps: true
});

module.exports = Role;
