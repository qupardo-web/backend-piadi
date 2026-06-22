const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Financiamiento = sequelize.define('Financiamiento', {
    idProyecto: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true,
        references: {
            model: 'proyectos',
            key: 'idProyecto'
        }
    },
    nombreProyecto: {
        type: DataTypes.STRING,
        allowNull: false
    },
    montoAdjudicado: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    montoEjecutadoEstimado: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    estadoFinanciero: {
        type: DataTypes.ENUM('En Ejecución', 'Cerrado', 'No aplica'),
        allowNull: false
    },
    financiamientoExterno: {
        type: DataTypes.ENUM('Sí', 'No'),
        allowNull: false
    },
    fuenteFinanciamiento: {
        type: DataTypes.STRING,
        allowNull: false
    },
    observacion: {
        type: DataTypes.TEXT,
        allowNull: false
    }
}, {
    tableName: 'financiamientos',
    timestamps: true
});

module.exports = Financiamiento;