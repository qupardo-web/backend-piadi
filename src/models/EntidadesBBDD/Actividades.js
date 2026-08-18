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
        type: DataTypes.STRING,
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
        type: DataTypes.STRING,
        allowNull: false
    },
    lineaVcM: {
        type: DataTypes.STRING,
        allowNull: false
    },
    sector: {
        type: DataTypes.STRING,
        allowNull: false
    },
    institucionContraparte: {
        type: DataTypes.STRING,
        allowNull: false
    },
    totalParticipantes: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
            min: 0
        }
    },
    participantesExternos: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
            min: 0
        }
    },
    participantesInternos: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
            min: 0
        }
    },
    publicoObjetivo: {
        type: DataTypes.STRING,
        allowNull: false
    },
    horas: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
            min: 1
        }
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
        allowNull: false,
        validate: {
            min: 1900,
            matchesFecha(value) {
                if (this.fecha && typeof this.fecha === 'string') {
                    const yearFromDate = parseInt(this.fecha.split('-')[0], 10);
                    if (parseInt(value, 10) !== yearFromDate) {
                        throw new Error(`El año (${value}) debe coincidir con el año de la fecha (${yearFromDate}).`);
                    }
                }
            }
        }
    },
    reportaVcM: {
        type: DataTypes.STRING,
        allowNull: false
    }
}, {
    tableName: 'actividades',
    timestamps: true,
    validate: {
        validateTotalParticipantes() {
            if (this.totalParticipantes !== ((this.participantesExternos || 0) + (this.participantesInternos || 0))) {
                throw new Error('El total de participantes debe ser la suma de los participantes externos e internos.');
            }
            if (this.totalParticipantes <= 0) {
                throw new Error('La actividad debe registrar al menos un participante (interno o externo).');
            }
        }
    },
    indexes: [
        {
            name: 'idx_actividades_anio',
            fields: ['anio']
        }
    ]
});

module.exports = Actividad;