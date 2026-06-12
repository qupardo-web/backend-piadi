const express = require('express');
const cors = require('cors');
const { sequelize } = require('./models');
const { swaggerUi, swaggerDocs } = require('./config/swagger');
const itemRoutes = require('./routes/itemRoutes');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Setup Swagger Endpoint
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Setup API Routes
app.use('/api', itemRoutes);

// Database initialization helper with retry logic for connection & syncing
async function initDb(retries = 5, delay = 2000) {
  while (retries) {
    try {
      console.log('Connecting to database with Sequelize...');
      await sequelize.authenticate();
      console.log('Connected to PostgreSQL successfully!');
      
      await sequelize.sync();
      console.log('Database synced successfully. Models mapped to tables.');
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
