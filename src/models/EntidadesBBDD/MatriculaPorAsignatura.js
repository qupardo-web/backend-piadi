const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const MatriculaPorAsignatura = sequelize.define('MatriculaPorAsignatura', {
    codCli: {
        type: DataTypes.STRING(50),
        primaryKey: true,
        allowNull: false,
        references: {
            model: 'alumnos',
            key: 'codCli'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
    },
    ramoEquiv: {
        type: DataTypes.STRING(50),
        primaryKey: true,
        allowNull: false,
        references: {
            model: 'asignaturas',
            key: 'ramoEquiv'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
    },
    estadoCad: {
        type: DataTypes.ENUM('Titulado', 'Egresado', 'Vigente'),
        allowNull: false
    },
    seccion: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
            min: 1
        }
    },
    anio: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
        validate: {
            min: 1900
        }
    },
    periodo: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
        validate: {
            min: 1
        }
    }
}, {
    tableName: 'matriculas_por_asignatura',
    timestamps: true
});

module.exports = MatriculaPorAsignatura;