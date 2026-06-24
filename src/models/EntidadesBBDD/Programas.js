const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Programa = sequelize.define('Programa', {
    idPrograma: {
        type: DataTypes.STRING,
        primaryKey: true
    },
    programa:{
        type: DataTypes.STRING,
        allowNull: false
    },
    modalidad: {
        type: DataTypes.STRING,
        allowNull: false
    },
    tipo: {
        type: DataTypes.STRING,
        allowNull: false
    },
    anio: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
            min: 1900
        }
    },
    cuposProgramados: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
            min: 1
        }
    },
    horas: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
            min: 1
        }
    },
    mesInicio: {
        type: DataTypes.STRING,
        allowNull: false
    },
    area: {
        type: DataTypes.STRING,
        allowNull: false
    },
    semestre: {
        type: DataTypes.STRING,
        allowNull: false
    },
    empresaConvenio: {
        type: DataTypes.STRING,
        allowNull: false
    },
    regionPrincipal: {
        type: DataTypes.STRING,
        allowNull: false
    },
    sectorPrincipal: {
        type: DataTypes.STRING,
        allowNull: false
    },
}, {
    tableName: 'programas',
    timestamps: true,
    indexes: [
        {
            name: 'idx_programas_periodo',
            fields: ['anio', 'semestre']
        }
    ]
});

module.exports = Programa;