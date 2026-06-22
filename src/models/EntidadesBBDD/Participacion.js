const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Participacion = sequelize.define('Participacion', {
    idParticipacion: {
        type: DataTypes.STRING,
        primaryKey: true
    },
    idActividad: {
        type: DataTypes.STRING,
        allowNull: false,
        references: {
            model: 'actividades',
            key: 'idActividad'
        }
    },
    region: {
        type: DataTypes.STRING,
        allowNull: false
    },
    comuna: {
        type: DataTypes.STRING,
        allowNull: false
    },
    mujeres: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    hombres: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    noInforma: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0
    },
    totalPersonas: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    internosExternos: {
        type: DataTypes.ENUM('Interno', 'Externo'),
        allowNull: false
    },
    institucion: {
        type: DataTypes.STRING,
        allowNull: false
    },
    anio: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    fecha: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    tipoActividad: {
        type: DataTypes.STRING,
        allowNull: false
    },
    tipoParticipante: {
        type: DataTypes.STRING,
        allowNull: false    
    }
}, {
    tableName: 'participaciones',
    timestamps: true
});

module.exports = Participacion;