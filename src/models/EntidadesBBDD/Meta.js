const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');
const { validateFinalSnapshot } = require('../../utils/metaSnapshot');

const Meta = sequelize.define('Meta', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    indicatorKey: {
        type: DataTypes.STRING,
        allowNull: true,
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
        allowNull: true
    },
    lifecycleStatus: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'ACTIVA',
        validate: { isIn: [['BORRADOR', 'ACTIVA', 'CERRADA']] }
    },
    draftMetrics: {
        type: DataTypes.JSONB,
        allowNull: true
    },
    closedAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    finalSnapshot: {
        type: DataTypes.JSONB,
        allowNull: true
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
    },
    nombre: {
        type: DataTypes.STRING,
        allowNull: true
    },
    fechaInicio: {
        type: DataTypes.DATE,
        allowNull: true
    },
    fechaLimite: {
        type: DataTypes.DATE,
        allowNull: true
    },
    prioridad: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    comportamiento: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    inicio: {
        type: DataTypes.VIRTUAL,
        get() {
            return this.getDataValue('fechaInicio');
        },
        set(val) {
            this.setDataValue('fechaInicio', val);
        }
    },
    limite: {
        type: DataTypes.VIRTUAL,
        get() {
            return this.getDataValue('fechaLimite');
        },
        set(val) {
            this.setDataValue('fechaLimite', val);
        }
    }
}, {
    tableName: 'metas',
    timestamps: true,
    validate: {
        camposPorEstado() {
            if (this.lifecycleStatus === 'ACTIVA'
                && (this.indicatorKey == null || this.valorMeta == null || this.draftMetrics != null)) {
                throw new Error('Una meta ACTIVA requiere indicador y valorMeta, sin draftMetrics');
            }
            if (this.lifecycleStatus === 'BORRADOR'
                && (this.indicatorKey != null || this.valorMeta != null)) {
                throw new Error('Una meta BORRADOR no debe contener indicador ni valorMeta definitivos');
            }
            if (this.lifecycleStatus === 'CERRADA') {
                if (this.indicatorKey == null || this.valorMeta == null || this.draftMetrics != null
                    || !this.closedAt) {
                    throw new Error('Una meta CERRADA requiere objetivos y fecha de cierre, sin draftMetrics');
                }
                validateFinalSnapshot(this.finalSnapshot);
            } else if (this.closedAt != null || this.finalSnapshot != null) {
                throw new Error('Solo una meta CERRADA puede conservar un resultado final');
            }
        }
    },
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
