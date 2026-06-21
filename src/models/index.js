const sequelize = require('../config/database');
const Item = require('./Item');
const User = require('./User');
const Role = require('./Role');
const Plantilla = require('./Plantilla');
const CampoPlantilla = require('./CampoPlantilla');

// Define Associations
Role.hasMany(User, { foreignKey: 'roleId' });
User.belongsTo(Role, { foreignKey: 'roleId', as: 'role' });
Plantilla.belongsTo(Role, { foreignKey: 'roleId', as: 'role' });
Role.hasMany(Plantilla, { foreignKey: 'roleId' });
Plantilla.hasMany(CampoPlantilla, { foreignKey: 'plantillaId' });
CampoPlantilla.belongsTo(Plantilla, { foreignKey: 'plantillaId', as: 'plantilla' });

module.exports = {
  sequelize,
  Item,
  User,
  Role,
  Plantilla,
  CampoPlantilla
};
