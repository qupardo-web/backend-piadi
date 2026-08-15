const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Meta = sequelize.define('Meta', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    indicatorKey: {
        type: DataTypes.STRING,
        allowNull: false,
        references: {
            model: 'indicator_definitions',
            key: 'key'
        }
    },
    departmentId: {
        type: DataTypes.STRING,
        allowNull: true, // Permite metas institucionales sin departamento asociado
        references: {
            model: 'departments',
            key: 'key'
        }
    },
    anio: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
            min: 1900
        }
    },
    valorMeta: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false
    },
    creatorId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'users',
            key: 'id'
        }
    },
    periodo: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'Anual' // Ej: 'Anual', 'Semestre 1', 'Semestre 2'
    }
}, {
    tableName: 'metas',
    timestamps: true,
    indexes: [
        {
            name: 'idx_metas_busqueda',
            fields: ['anio', 'indicatorKey', 'departmentId']
        },
        {
            name: 'idx_metas_creator',
            fields: ['creatorId']
        }
    ]
});

module.exports = Meta;
