const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Convenio = sequelize.define('Convenio', {
    idConvenio: {
        type: DataTypes.STRING,
        primaryKey: true
    },
    rutContraparte: {
        type: DataTypes.STRING,
        allowNull: false
    },
    contraparte: {
        type: DataTypes.STRING,
        allowNull: false
    },
    areaVinculada: {
        type: DataTypes.STRING,
        allowNull: false
    },
    sector: {
        type: DataTypes.ENUM('Público', 'Privado', 'ONG/Fundación', 'Academia', 'Educación TP'),
        allowNull: false
    },
    tipoConvenio: {
        type: DataTypes.STRING,
        allowNull: false
    },
    anioFirma: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    fechaDeFirma: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    fechaDeTermino: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    region: {
        type: DataTypes.STRING,
        allowNull: false
    },
    comuna: {
        type: DataTypes.STRING,
        allowNull: false
    },
    responsableEcas: {
        type: DataTypes.ENUM('Rectoría', 'Admisión','Coordinación TP','Escuela de Auditoria','Educación Continua','Dirección de VcM'),
        allowNull: false
    },
    contacto: {                   
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
            isEmail: true
        }
    },
    evidencia: {
        type: DataTypes.STRING,
        allowNull: false
    },
    objetivo: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    estado: {
        type: DataTypes.ENUM('Activo', 'En renovación','Cerrado'),
        allowNull: false
    }
}, {
    tableName: 'convenios',
    timestamps: true
});

module.exports = Convenio;