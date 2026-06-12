const sequelize = require('../config/database');
const Item = require('./Item');

// Define Associations here if you add more entities later
// e.g., User.hasMany(Item); Item.belongsTo(User);

module.exports = {
  sequelize,
  Item
};
