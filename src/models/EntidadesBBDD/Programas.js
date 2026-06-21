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
        allowNull: false
    },
    cuposProgramados: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    horas: {
        type: DataTypes.INTEGER,
        allowNull: false
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
},  {
    tableName: 'programas',
    timestamps: true
});

module.exports = Programa;