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
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    tags: [
      { name: 'Autenticación', description: 'Endpoints de acceso y cierre de sesión' },
      { name: 'Roles', description: 'Endpoints para consultar roles del sistema' },
      { name: 'Plantillas', description: 'Gestión y carga de plantillas Excel' },
      { name: 'Departamentos', description: 'Gestión de departamentos y KPIs relacionados' },
      { name: 'Indicadores', description: 'Cálculo de valores, series y breakdown de indicadores' },
      { name: 'Metas', description: 'Gestión de metas y sus métricas asociadas' },
      { name: 'Landing', description: 'Información preparada para la página de inicio' },
      { name: 'Auditoria', description: 'Visualización de bitácoras de auditoría' },
      { name: 'default', description: 'Endpoints generales' }
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
