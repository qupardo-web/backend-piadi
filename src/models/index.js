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

// --- Nuevas Entidades BBDD ---
const Actividad = require('./EntidadesBBDD/Actividades');
const ArticulacionTP = require('./EntidadesBBDD/ArticulacionesTP');
const Convenio = require('./EntidadesBBDD/Convenios');
const Financiamiento = require('./EntidadesBBDD/Financiamiento');
const Participacion = require('./EntidadesBBDD/Participacion');
const Proyecto = require('./EntidadesBBDD/Proyectos');
const Seccion = require('./EntidadesBBDD/Seccion');

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
Programa.hasOne(EstadoFinancieroPrograma, { foreignKey: 'idPrograma', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
EstadoFinancieroPrograma.belongsTo(Programa, { foreignKey: 'idPrograma' });

Programa.hasOne(ResultadosPrograma, { foreignKey: 'idPrograma', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
ResultadosPrograma.belongsTo(Programa, { foreignKey: 'idPrograma' });

Programa.hasMany(MatriculaPrograma, { foreignKey: 'idPrograma', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
MatriculaPrograma.belongsTo(Programa, { foreignKey: 'idPrograma', as: 'programa' });

AlumnoExterno.hasMany(MatriculaPrograma, { foreignKey: 'idParticipante', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
MatriculaPrograma.belongsTo(AlumnoExterno, { foreignKey: 'idParticipante', as: 'participante' });

MatriculaPrograma.hasOne(EstadoMatricula, { foreignKey: 'idInscripcion', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
EstadoMatricula.belongsTo(MatriculaPrograma, { foreignKey: 'idInscripcion', as: 'matricula' });

// --- Asociaciones Nuevas Entidades BBDD ---

// Convenio 1:N Actividad
Convenio.hasMany(Actividad, { foreignKey: 'idConvenio', onDelete: 'SET NULL', onUpdate: 'CASCADE' });
Actividad.belongsTo(Convenio, { foreignKey: 'idConvenio', as: 'convenio' });

// Actividad 1:1 ArticulacionTP
Actividad.hasOne(ArticulacionTP, { foreignKey: 'idActividad', onDelete: 'SET NULL', onUpdate: 'CASCADE' });
ArticulacionTP.belongsTo(Actividad, { foreignKey: 'idActividad', as: 'actividad' });

// Actividad 1:N Participacion
Actividad.hasMany(Participacion, { foreignKey: 'idActividad', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Participacion.belongsTo(Actividad, { foreignKey: 'idActividad', as: 'actividad' });

// Proyecto 1:1 Financiamiento
Proyecto.hasOne(Financiamiento, { foreignKey: 'idProyecto', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Financiamiento.belongsTo(Proyecto, { foreignKey: 'idProyecto', as: 'proyecto' });

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
  ResultadosPrograma,
  Actividad,
  ArticulacionTP,
  Convenio,
  Financiamiento,
  Participacion,
  Proyecto,
  Seccion
};
