const { Item } = require('../models');

// Retrieves all items sorted by creation date
const getAllItems = async () => {
  return await Item.findAll({
    order: [['createdAt', 'DESC']]
  });
};

// Creates a new item in the database
const createNewItem = async (itemData) => {
  const { name, description } = itemData;
  if (!name) {
    throw new Error('Name is required');
  }
  return await Item.create({ name, description });
};

// Deletes an item by its ID
const deleteItemById = async (id) => {
  const deletedCount = await Item.destroy({
    where: { id }
  });
  if (deletedCount === 0) {
    throw new Error('Item not found');
  }
  return true;
};

module.exports = {
  getAllItems,
  createNewItem,
  deleteItemById
};
