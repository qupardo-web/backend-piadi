const { sequelize } = require('../models');
const itemService = require('../services/itemService');
const { ValidationError, NotFoundError } = require('../utils/errors');

// Handles health status check (interacts with DB via sequelize directly for connection test)
// Nota: Se mantiene try/catch local para responder con el payload degradado en vez de fallar por completo.
const getStatus = async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({
      status: 'online',
      database: 'connected',
      uptime: process.uptime(),
      timestamp: new Date()
    });
  } catch (err) {
    res.status(200).json({ // Se responde 200 pero indicando la desconexión del servicio de datos
      status: 'online',
      database: 'disconnected',
      error: err.message,
      uptime: process.uptime()
    });
  }
};

// Fetches all items by calling the service layer
const getItems = async (req, res, next) => {
  try {
    const items = await itemService.getAllItems();
    res.json(items);
  } catch (err) {
    next(err);
  }
};

// Creates a new item by calling the service layer
const createItem = async (req, res, next) => {
  try {
    const newItem = await itemService.createNewItem(req.body);
    res.status(201).json(newItem);
  } catch (err) {
    if (err.message === 'El nombre es obligatorio') {
      next(new ValidationError('El nombre es obligatorio'));
    } else {
      next(err);
    }
  }
};

// Deletes an item by calling the service layer
const deleteItem = async (req, res, next) => {
  const { id } = req.params;
  try {
    await itemService.deleteItemById(id);
    res.json({ message: 'Elemento eliminado correctamente' });
  } catch (err) {
    if (err.message === 'Elemento no encontrado') {
      next(new NotFoundError('Elemento no encontrado'));
    } else {
      next(err);
    }
  }
};

module.exports = {
  getStatus,
  getItems,
  createItem,
  deleteItem
};
