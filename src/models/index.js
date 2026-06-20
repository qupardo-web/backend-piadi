const sequelize = require('../config/database');
const Item = require('./Item');
const User = require('./User');
const Role = require('./Role');

// Define Associations
Role.hasMany(User, { foreignKey: 'roleId' });
User.belongsTo(Role, { foreignKey: 'roleId', as: 'role' });

module.exports = {
  sequelize,
  Item,
  User,
  Role
};
