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
        allowNull: false
    },
    ingresosNetosCLP: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    ingresosBrutosCLP: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    valorListaCLP: {
        type: DataTypes.INTEGER,
        allowNull: false
    }
}, {
    tableName: 'estados_financieros_programa',
    timestamps: true
});

module.exports = EstadoFinancieroPrograma;