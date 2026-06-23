const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const ArticulacionTP = sequelize.define('ArticulacionTP', {
    idArticulacion: {
        type: DataTypes.STRING,
        primaryKey: true
    },
    idActividad: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
        references: {
            model: 'actividades',
            key: 'idActividad'
        }
    },
    colegioLiceoTP: {
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
    fecha: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    comuna: {
        type: DataTypes.STRING,
        allowNull: false
    },
    region: {
        type: DataTypes.STRING,
        allowNull: false
    },
    especialidadTP: {
        type: DataTypes.STRING,
        allowNull: false
    },
    plataformaFoco: {
        type: DataTypes.STRING,
        allowNull: false
    },
    responsableEcas: {
        type: DataTypes.STRING,
        allowNull: false
    },
    nivel: {
        type: DataTypes.STRING,
        allowNull: false
    },
    docentesTP: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
            min: 0
        }
    },
    estudiantesTP: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
            min: 0
        }
    },
    tipoArticulacion: {
        type: DataTypes.STRING,
        allowNull: false
    },
    evidencia: {
        type: DataTypes.STRING,
        allowNull: false    
    },
    estado: {
        type: DataTypes.STRING,
        allowNull: false
    },
}, {
    tableName: 'articulaciones_tp',
    timestamps: true
});

module.exports = ArticulacionTP;