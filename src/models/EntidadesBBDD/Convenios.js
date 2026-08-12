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
        set(val) {
            if (val) {
                // Remueve puntos, guiones y espacios, y convierte a mayúscula
                const cleanRut = val.replace(/[\.\-\s]/g, '').toUpperCase();
                if (cleanRut.length > 1) {
                    const body = cleanRut.slice(0, -1);
                    const dv = cleanRut.slice(-1);
                    this.setDataValue('rutContraparte', `${body}-${dv}`);
                } else {
                    this.setDataValue('rutContraparte', cleanRut);
                }
            } else {
                this.setDataValue('rutContraparte', val);
            }
        },
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
            min: 1900,
            matchesFechaDeFirma(value) {
                if (this.fechaDeFirma && typeof this.fechaDeFirma === 'string') {
                    const yearFromDate = parseInt(this.fechaDeFirma.split('-')[0], 10);
                    if (parseInt(value, 10) !== yearFromDate) {
                        throw new Error(`El año de firma (${value}) debe coincidir con el año de la fecha de firma (${yearFromDate}).`);
                    }
                }
            }
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
    timestamps: true,
    indexes: [
        {
            name: 'idx_convenios_rut_contraparte',
            fields: ['rutContraparte']
        }
    ]
});

module.exports = Convenio;