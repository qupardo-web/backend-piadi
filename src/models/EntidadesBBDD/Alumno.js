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
        unique: true,
        validate: {
            min: 1
        }
    },
    digitoVerificador: {
        type: DataTypes.CHAR(1),
        allowNull: false,
        validate: {
            len: [1, 1],
            is: /^[0-9Kk]$/i,
            matchesRut(value) {
                if (!this.rut) return;
                let rutStr = String(this.rut);
                let suma = 0;
                let multiplicador = 2;
                for (let i = rutStr.length - 1; i >= 0; i--) {
                    suma += parseInt(rutStr.charAt(i)) * multiplicador;
                    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
                }
                const resto = suma % 11;
                const dvCalculado = 11 - resto;
                let dvEsperado = '';
                if (dvCalculado === 11) dvEsperado = '0';
                else if (dvCalculado === 10) dvEsperado = 'K';
                else dvEsperado = String(dvCalculado);

                if (String(value).toUpperCase() !== dvEsperado) {
                    throw new Error(`El dígito verificador "${value}" no corresponde al RUT ${this.rut}.`);
                }
            }
        }
    },
    nombre: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: {
            notEmpty: true,
            is: /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'\-]+$/i
        }
    },
    apellidoMat: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: {
            notEmpty: true,
            is: /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'\-]+$/i
        }
    },
    apellidoPat: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: {
            notEmpty: true,
            is: /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'\-]+$/i
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
        allowNull: false,
        validate: {
            is: /^[+0-9\s\-()]+$/
        }
    },
    fonoEmergencia: {
        type: DataTypes.STRING(20),
        allowNull: true,
        validate: {
            is: /^[+0-9\s\-()]+$/
        }
    },
    fonoProc: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: {
            is: /^[+0-9\s\-()]+$/
        }
    },
    alFono: {
        type: DataTypes.STRING(20),
        allowNull: true,
        validate: {
            is: /^[+0-9\s\-()]+$/
        }
    },
    celular: {
        type: DataTypes.STRING(20),
        allowNull: true,
        validate: {
            is: /^[+0-9\s\-()]+$/
        }
    }
}, {
    tableName: 'alumnos',
    timestamps: true
});

module.exports = Alumno;