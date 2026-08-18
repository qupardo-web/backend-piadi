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
        allowNull: false,
        validate: {
            min: 0
        }
    },
    hombres: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
            min: 0
        }
    },
    noInforma: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
        validate: {
            min: 0
        }
    },
    totalPersonas: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
            min: 0
        }
    },
    internosExternos: {
        type: DataTypes.STRING,
        allowNull: false
    },
    institucion: {
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
    timestamps: true,
    validate: {
        validateTotalPersonas() {
            if (this.totalPersonas !== ((this.mujeres || 0) + (this.hombres || 0) + (this.noInforma || 0))) {
                throw new Error('El total de personas debe ser la suma de mujeres, hombres y no informa.');
            }
        }
    }
});

module.exports = Participacion;