const sequelize = require('../config/database');
const Item = require('./Item');
const User = require('./User');
const Role = require('./Role');
const Plantilla = require('./Plantilla');

// Define Associations
Role.hasMany(User, { foreignKey: 'roleId' });
User.belongsTo(Role, { foreignKey: 'roleId', as: 'role' });
Plantilla.belongsTo(Role, { foreignKey: 'roleId', as: 'role' });
Role.hasMany(Plantilla, { foreignKey: 'roleId' });

module.exports = {
  sequelize,
  Item,
  User,
  Role,
  Plantilla
};
