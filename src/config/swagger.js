const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const { HELP_MODULES } = require('./helpModules');
require('dotenv').config();

const port = process.env.PORT || 5000;
const swaggerUrl = (process.env.SWAGGER_URL || `http://localhost:${port}`).replace(/\/+$/, '');

const helpEntryFields = {
  modulo: { $ref: '#/components/schemas/ModuloAyuda' },
  pregunta: { type: 'string', description: 'Pregunta en texto plano, no vacía.' },
  respuesta: { type: 'string', description: 'Respuesta en texto plano, no vacía.' },
  orden: { type: 'integer', minimum: 0 },
  activo: { type: 'boolean', default: true }
};

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
        url: swaggerUrl,
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
      },
      schemas: {
        ModuloAyuda: {
          type: 'string',
          enum: HELP_MODULES,
          description: 'Catálogo técnico provisional pendiente de validación institucional.'
        },
        DatosEntradaAyuda: {
          type: 'object',
          additionalProperties: false,
          properties: helpEntryFields
        },
        EntradaAyuda: {
          type: 'object',
          required: ['id', 'modulo', 'pregunta', 'respuesta', 'orden', 'activo', 'createdAt', 'updatedAt'],
          properties: {
            id: { type: 'integer' },
            ...helpEntryFields,
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
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
      { name: 'Reportes', description: 'Gestión y generación de reportes de indicadores' },
      { name: 'Centro de Ayuda', description: 'Administración de preguntas frecuentes por Rectoría' },
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
