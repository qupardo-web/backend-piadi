const { Sequelize } = require('sequelize');
require('dotenv').config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('FATAL: DATABASE_URL no configurado.');
  process.exit(1);
}

const sequelize = new Sequelize(databaseUrl, {
  dialect: 'postgres',
  logging: console.log,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

module.exports = sequelize;
