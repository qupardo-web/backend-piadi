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
        type: DataTypes.STRING,
        allowNull: false
    },
    ingresosNetosCLP: {
        type: DataTypes.STRING,
        allowNull: false
    },
    ingresosBrutosCLP: {
        type: DataTypes.STRING,
        allowNull: false
    },
    valorListaCLP: {
        type: DataTypes.STRING,
        allowNull: false
    }
}, {
    tableName: 'estados_financieros_programa',
    timestamps: true
});

module.exports = EstadoFinancieroPrograma;