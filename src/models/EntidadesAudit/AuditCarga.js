const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const AuditCarga = sequelize.define('AuditCarga', {
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
  plantilla: {
    type: DataTypes.STRING(150),
    allowNull: true
  },
  archivo: {
    type: DataTypes.STRING(255),
    allowNull: true
  }
}, {
  tableName: 'audit_cargas',
  timestamps: true,
  updatedAt: false,
  createdAt: 'fecha',
  indexes: [
    {
      name: 'idx_audit_cargas_fecha',
      fields: ['fecha']
    },
    {
      name: 'idx_audit_cargas_usuario_id',
      fields: ['usuario_id']
    },
    {
      name: 'idx_audit_cargas_accion',
      fields: ['accion']
    },
    {
      name: 'idx_audit_cargas_rol',
      fields: ['rol']
    },
    {
      name: 'idx_audit_cargas_entidad',
      fields: ['entidad']
    }
  ]
});

module.exports = AuditCarga;
