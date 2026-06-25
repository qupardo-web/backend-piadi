const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const EstadoMatricula = sequelize.define('EstadoMatricula', {
    idInscripcion: {
        type: DataTypes.STRING,
        primaryKey: true,
        references: {
            model: 'matriculas_programa',
            key: 'idInscripcion'
        },
        allowNull: false
    },
    notaFinal: {
        type: DataTypes.DECIMAL(3, 1),
        allowNull: false,
        validate: {
            min: 1.0,
            max: 7.0
        }
    },
    aprobo: {
        type: DataTypes.STRING,
        allowNull: false
    },
    estadoAcademico: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    asistencia: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        validate: {
            min: 0.0,
            max: 100.0
        }
    }
}, {
    tableName: 'estados_matricula',
    timestamps: true
});

module.exports = EstadoMatricula;