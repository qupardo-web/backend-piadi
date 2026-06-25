const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');
const { validate } = require('rut.js');

const Convenio = sequelize.define('Convenio', {
    idConvenio: {
        type: DataTypes.STRING,
        primaryKey: true
    },
    rutContraparte: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
            is: /^\d{1,2}\.?\d{3}\.?\d{3}-?[0-9Kk]$/i,
            isValidRut(value) {
                if (value && !validate(value)) {
                    throw new Error(`El RUT de contraparte ${value} no es válido matemáticamente`);
                }
            }
        }
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
        type: DataTypes.STRING,
        allowNull: false
    },
    tipoConvenio: {
        type: DataTypes.STRING,
        allowNull: false
    },
    anioFirma: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
            min: 1900
        }
    },
    fechaDeFirma: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    fechaDeTermino: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        validate: {
            isAfterFirma(value) {
                if (new Date(value) <= new Date(this.fechaDeFirma)) {
                    throw new Error('La fecha de término debe ser posterior a la fecha de firma.');
                }
            }
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
    responsableEcas: {
        type: DataTypes.STRING,
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
        type: DataTypes.STRING,
        allowNull: false
    }
}, {
    tableName: 'convenios',
    timestamps: true
});

module.exports = Convenio;