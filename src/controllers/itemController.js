const { sequelize } = require('../models');
const itemService = require('../services/itemService');

// Handles health status check (interacts with DB via sequelize directly for connection test)
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
    res.status(500).json({
      status: 'online',
      database: 'disconnected',
      error: err.message,
      uptime: process.uptime()
    });
  }
};

// Fetches all items by calling the service layer
const getItems = async (req, res) => {
  try {
    const items = await itemService.getAllItems();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch items', details: err.message });
  }
};

// Creates a new item by calling the service layer
const createItem = async (req, res) => {
  try {
    const newItem = await itemService.createNewItem(req.body);
    res.status(201).json(newItem);
  } catch (err) {
    const status = err.message === 'Name is required' ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
};

// Deletes an item by calling the service layer
const deleteItem = async (req, res) => {
  const { id } = req.params;
  try {
    await itemService.deleteItemById(id);
    res.json({ message: 'Item deleted successfully' });
  } catch (err) {
    const status = err.message === 'Item not found' ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
};

module.exports = {
  getStatus,
  getItems,
  createItem,
  deleteItem
};
