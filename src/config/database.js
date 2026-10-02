const { Sequelize } = require('sequelize');
require('dotenv').config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('FATAL: DATABASE_URL no configurado.');
  process.exit(1);
}

const parseIntegerEnv = (name, fallback, minimum = 0) => {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === '') return fallback;

  const value = Number(rawValue);
  return Number.isInteger(value) && value >= minimum ? value : fallback;
};

const poolMax = parseIntegerEnv('DB_POOL_MAX', 5, 1);
const configuredPoolMin = parseIntegerEnv('DB_POOL_MIN', 0);

const sequelize = new Sequelize(databaseUrl, {
  dialect: 'postgres',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: poolMax,
    min: configuredPoolMin <= poolMax ? configuredPoolMin : 0,
    acquire: parseIntegerEnv('DB_POOL_ACQUIRE', 30000),
    idle: parseIntegerEnv('DB_POOL_IDLE', 10000)
  }
});

module.exports = sequelize;
