const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const EstadoFinancieroPrograma = sequelize.define('EstadoFinancieroPrograma', {
    idPrograma: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        references: {
            model: 'programas',
            key: 'idPrograma'
        }
    },
    descuentoPromedio: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        validate: {
            min: 0.0,
            max: 100.0
        }
    },
    ingresosNetosCLP: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
            min: 0
        }
    },
    ingresosBrutosCLP: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
            min: 0
        }
    },
    valorListaCLP: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
            min: 0
        }
    }
}, {
    tableName: 'estados_financieros_programa',
    timestamps: true
});

module.exports = EstadoFinancieroPrograma;