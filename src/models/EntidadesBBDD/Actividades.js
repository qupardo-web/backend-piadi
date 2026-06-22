const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Actividad = sequelize.define('Actividad', {
    idActividad: {
        type: DataTypes.STRING,
        primaryKey: true
    },
    idConvenio: {
        type: DataTypes.STRING,
        allowNull: true,
        references: {
            model: 'convenios',
            key: 'idConvenio'
        }
    },
    modalidad: {
        type: DataTypes.ENUM('Presencial', 'Online sincrónica', 'Híbrida'),
        allowNull: false
    },
    nombreActividad: {
        type: DataTypes.STRING,
        allowNull: false
    },
    tipoActividad: {
        type: DataTypes.STRING,
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
    responsable: {
        type: DataTypes.ENUM('Admisión','Coordinación TP','Escuela de Auditoria','Educación Continua','Dirección de VcM'),
        allowNull: false
    },
    lineaVcM: {
        type: DataTypes.STRING,
        allowNull: false
    },
    sector: {
        type: DataTypes.ENUM('Público', 'Privado', 'ONG/Fundación', 'Academia', 'Educación TP'),
        allowNull: false
    },
    institucionContraparte: {
        type: DataTypes.STRING,
        allowNull: false
    },
    totalParticipantes: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    participantesExternos: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    participantesInternos: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    publicoObjetivo: {
        type: DataTypes.STRING,
        allowNull: false
    },
    horas: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    fecha: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    mes: {
        type: DataTypes.STRING,
        allowNull: false
    },
    anio: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    reportaVcM: {
        type: DataTypes.ENUM('Sí', 'No'),
        allowNull: false
    }
}, {
    tableName: 'actividades',
    timestamps: true
});

module.exports = Actividad;