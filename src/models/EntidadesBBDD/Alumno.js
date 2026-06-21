const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Alumno = sequelize.define('Alumno', {
    codCli: {
        type: DataTypes.STRING(50),
        primaryKey: true,
        allowNull: false
    },
    rut: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true
    },
    digitoVerificador: {
        type: DataTypes.CHAR(1),
        allowNull: false,
        validate: {
            len: [1, 1],
            is: /^[0-9Kk]$/i
        }
    },
    nombre: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: {
            notEmpty: true
        }
    },
    apellidoMat: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: {
            notEmpty: true
        }
    },
    apellidoPat: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: {
            notEmpty: true
        }
    },
    mail: {
        type: DataTypes.STRING(150),
        allowNull: false,
        validate: {
            isEmail: true
        }
    },
    celularAct: {
        type: DataTypes.STRING(20),
        allowNull: false
    },
    fonoEmergencia: {
        type: DataTypes.STRING(20),
        allowNull: true
    },
    fonoProc: {
        type: DataTypes.STRING(20),
        allowNull: false
    },
    alFono: {
        type: DataTypes.STRING(20),
        allowNull: true
    },
    celular: {
        type: DataTypes.STRING(20),
        allowNull: true
    }
}, {
    tableName: 'alumnos',
    timestamps: true
});

module.exports = Alumno;