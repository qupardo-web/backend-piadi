const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
require('dotenv').config();

const port = process.env.PORT || 5000;

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Decoupled Backend API (Clean Architecture)',
      version: '1.0.0',
      description: 'API del Backend estructurada de forma modular, con rutas y documentación separadas.',
    },
    servers: [
      {
        url: `http://localhost:${port}`,
        description: 'Servidor Local'
      }
    ]
  },
  // Scan models and routes folders for JSDoc annotations
  apis: [
    './src/routes/*.js',
    './src/models/*.js'
  ]
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);

module.exports = {
  swaggerUi,
  swaggerDocs
};
