const sequelize = require('../config/database');
const Item = require('./Item');
const User = require('./User');
const Role = require('./Role');
const Plantilla = require('./Plantilla');

// --- Entidades BBDD Académicas ---
const Alumno = require('./EntidadesBBDD/Alumno');
const Asignatura = require('./EntidadesBBDD/Asignatura');
const MatriculaPorAsignatura = require('./EntidadesBBDD/MatriculaPorAsignatura');

// --- Entidades BBDD de Programas y Alumnos Externos ---
const AlumnoExterno = require('./EntidadesBBDD/AlumnoExterno');
const EstadoFinancieroPrograma = require('./EntidadesBBDD/EstadoFinancieroProgramas');
const EstadoMatricula = require('./EntidadesBBDD/EstadoMatricula');
const MatriculaPrograma = require('./EntidadesBBDD/MatriculaPrograma');
const Programa = require('./EntidadesBBDD/Programas');
const ResultadosPrograma = require('./EntidadesBBDD/ResultadosProgramas');

// --- Asociaciones de Seguridad y Plantillas ---
Role.hasMany(User, { foreignKey: 'roleId' });
User.belongsTo(Role, { foreignKey: 'roleId', as: 'role' });
Plantilla.belongsTo(Role, { foreignKey: 'roleId', as: 'role' });
Role.hasMany(Plantilla, { foreignKey: 'roleId' });

// --- Asociaciones Académicas (Relación N:M entre Alumno y Asignatura) ---
Alumno.belongsToMany(Asignatura, { 
  through: MatriculaPorAsignatura, 
  foreignKey: 'codCli', 
  otherKey: 'ramoEquiv' 
});
Asignatura.belongsToMany(Alumno, { 
  through: MatriculaPorAsignatura, 
  foreignKey: 'ramoEquiv', 
  otherKey: 'codCli' 
});

// Asociaciones de tabla intermedia para acceso directo
MatriculaPorAsignatura.belongsTo(Alumno, { foreignKey: 'codCli', as: 'alumno' });
MatriculaPorAsignatura.belongsTo(Asignatura, { foreignKey: 'ramoEquiv', as: 'asignatura' });
Alumno.hasMany(MatriculaPorAsignatura, { foreignKey: 'codCli' });
Asignatura.hasMany(MatriculaPorAsignatura, { foreignKey: 'ramoEquiv' });

// --- Asociaciones de Programas y Alumnos Externos ---

// Relación 1:1 entre Programa y Estado Financiero
Programa.hasOne(EstadoFinancieroPrograma, { foreignKey: 'idPrograma', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
EstadoFinancieroPrograma.belongsTo(Programa, { foreignKey: 'idPrograma' });

// Relación 1:1 entre Programa y Resultados
Programa.hasOne(ResultadosPrograma, { foreignKey: 'idPrograma', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
ResultadosPrograma.belongsTo(Programa, { foreignKey: 'idPrograma' });

// Relación 1:N entre Programa y MatriculaPrograma
Programa.hasMany(MatriculaPrograma, { foreignKey: 'idPrograma', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
MatriculaPrograma.belongsTo(Programa, { foreignKey: 'idPrograma', as: 'programa' });

// Relación 1:N entre AlumnoExterno y MatriculaPrograma
AlumnoExterno.hasMany(MatriculaPrograma, { foreignKey: 'idParticipante', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
MatriculaPrograma.belongsTo(AlumnoExterno, { foreignKey: 'idParticipante', as: 'participante' });

// Relación 1:1 entre MatriculaPrograma y EstadoMatricula (Inscripción)
MatriculaPrograma.hasOne(EstadoMatricula, { foreignKey: 'idInscripcion', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
EstadoMatricula.belongsTo(MatriculaPrograma, { foreignKey: 'idInscripcion', as: 'matricula' });

module.exports = {
  sequelize,
  Item,
  User,
  Role,
  Plantilla,
  Alumno,
  Asignatura,
  MatriculaPorAsignatura,
  AlumnoExterno,
  EstadoFinancieroPrograma,
  EstadoMatricula,
  MatriculaPrograma,
  Programa,
  ResultadosPrograma
};
