const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const AuditSesion = sequelize.define('AuditSesion', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  usuarioId: {
    type: DataTypes.INTEGER,
    field: 'usuario_id',
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    },
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE'
  },
  rol: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  accion: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  entidad: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  detalles: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'audit_sesiones',
  timestamps: true,
  updatedAt: false,
  createdAt: 'fecha',
  indexes: [
    {
      name: 'idx_audit_sesiones_fecha',
      fields: ['fecha']
    },
    {
      name: 'idx_audit_sesiones_usuario_id',
      fields: ['usuario_id']
    },
    {
      name: 'idx_audit_sesiones_accion',
      fields: ['accion']
    },
    {
      name: 'idx_audit_sesiones_rol',
      fields: ['rol']
    },
    {
      name: 'idx_audit_sesiones_entidad',
      fields: ['entidad']
    }
  ]
});

module.exports = AuditSesion;
