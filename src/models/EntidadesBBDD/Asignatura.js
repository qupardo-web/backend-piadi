const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Asignatura = sequelize.define('Asignatura', {    
    ramoEquiv: {
        type: DataTypes.STRING(50),
        primaryKey: true,
        allowNull: false
    },
    nombre: {
        type: DataTypes.STRING(150),
        allowNull: false,
        validate: {
            notEmpty: true
        }
    } 
}, {
    tableName: 'asignaturas',
    timestamps: true
});

module.exports = Asignatura;