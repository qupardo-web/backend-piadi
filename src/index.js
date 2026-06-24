const express = require('express');
const cors = require('cors');
const { sequelize } = require('./models');
const { swaggerUi, swaggerDocs } = require('./config/swagger');
const itemRoutes = require('./routes/itemRoutes');
const authRoutes = require('./routes/authRoutes');
const plantillaRoutes = require('./routes/plantillaRoutes');
const plantillaCargaRoutes = require('./routes/plantillaCargaRoutes');
const indicatorRoutes = require('./routes/indicatorRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const auditRoutes = require('./routes/auditRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Servir plantillas Excel estáticamente para descarga
app.use('/templates', express.static('uploads/templates'));

// Setup Swagger Endpoint
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Setup API Routes
app.use('/api/auth', authRoutes);
app.use('/api', itemRoutes);
app.use('/api/plantillas', plantillaRoutes);
app.use('/api/plantillas', plantillaCargaRoutes);
app.use('/api', indicatorRoutes);
app.use('/api', dashboardRoutes);
app.use('/api', auditRoutes);

// Registar Middleware Centralizado de Errores (Siempre después de las rutas)
app.use(errorHandler);

// Database initialization helper with retry logic for connection & syncing
async function initDb(retries = 5, delay = 2000) {
  while (retries) {
    try {
      console.log('Connecting to database with Sequelize...');
      await sequelize.authenticate();
      console.log('Connected to PostgreSQL successfully!');
      
      await sequelize.sync();
      console.log('Database synced successfully. Models mapped to tables.');
      
      const { seedDatabase } = require('./services/dbSeeder');
      await seedDatabase();
      
      return true;
    } catch (err) {
      console.error(`Database connection failed. Retries remaining: ${retries - 1}`, err.message);
      retries -= 1;
      if (retries === 0) {
        console.error('Could not connect to the database. Running in offline/degraded mode.');
        return false;
      }
      await new Promise(res => setTimeout(res, delay));
    }
  }
}

const startServer = async () => {
  await initDb();
  app.listen(port, () => {
    console.log(`Backend server running on port ${port}`);
    console.log(`Swagger docs available at http://localhost:${port}/api-docs`);
  });
};

startServer();
