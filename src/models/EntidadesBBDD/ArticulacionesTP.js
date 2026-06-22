const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const ArticulacionTP = sequelize.define('ArticulacionTP', {
    idArticulacion: {
        type: DataTypes.STRING,
        primaryKey: true
    },
    idActividad: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
        references: {
            model: 'actividades',
            key: 'idActividad'
        }
    },
    colegioLiceoTP: {
        type: DataTypes.BOOLEAN,
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
    comuna: {
        type: DataTypes.STRING,
        allowNull: false
    },
    region: {
        type: DataTypes.STRING,
        allowNull: false
    },
    especialidadTP: {
        type: DataTypes.STRING,
        allowNull: false
    },
    plataformaFoco: {
        type: DataTypes.ENUM('Defontana', 'SAP', 'Contabilidad tributaria', 'Auditoría básica', 'Excel aplicado', 'Power BI'),
        allowNull: false
    },
    responsableEcas: {
        type: DataTypes.ENUM('Docente ECAS', 'Relator Educación Continua', 'Coordinador TP'),
        allowNull: false
    },
    nivel: {
        type: DataTypes.STRING,
        allowNull: false
    },
    docentesTP: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    estudiantesTP: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    tipoArticulacion: {
        type: DataTypes.STRING,
        allowNull: false
    },
    evidencia: {
        type: DataTypes.STRING,
        allowNull: false    
    },
    estado: {
        type: DataTypes.ENUM('En seguimiento', 'Cerrada', 'Ejecutada'),
        allowNull: false
    },
}, {
    tableName: 'articulaciones_tp',
    timestamps: true
});

module.exports = ArticulacionTP;