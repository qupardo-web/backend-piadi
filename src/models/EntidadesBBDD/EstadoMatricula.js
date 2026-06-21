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
        allowNull: false
    },
    aprobo: {
        type: DataTypes.ENUM('Sí', 'No'),
        allowNull: false
    },
    estadoAcademico: {
        type: DataTypes.ENUM('Aprobado', 'Reprobado', 'Desertor'),
        allowNull: false,
    },
    asistencia: {
        type: DataTypes.STRING,
        allowNull: false
    }
}, {
    tableName: 'estados_matricula',
    timestamps: true
});

module.exports = EstadoMatricula;