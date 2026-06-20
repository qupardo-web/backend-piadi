const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * @openapi
 * components:
 *   schemas:
 *     Plantilla:
 *       type: object
 *       required:
 *         - name
 *         - roleId
 *       properties:
 *         id:
 *           type: integer
 *           description: ID autogenerado de la plantilla.
 *         name:
 *           type: string
 *           description: Nombre de la plantilla.
 *         description:
 *           type: string
 *           description: Descripcion detallada de la plantilla.
 *         roleId:
 *           type: integer
 *           description: ID del rol/area asociado a la plantilla.
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Fecha de creación.
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Última fecha de actualización.
 */
const Plantilla = sequelize.define('Plantilla', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  roleId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'roles',
      key: 'id'
    }
  }
}, {
  tableName: 'plantillas',
  timestamps: true
});

module.exports = Plantilla;

