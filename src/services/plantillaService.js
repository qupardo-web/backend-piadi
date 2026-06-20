const { Plantilla, Role } = require('../models');

const getAllPlantillas = async () => {
  return await Plantilla.findAll({
    include: [{ model: Role, as: 'role' }],
    order: [['createdAt', 'DESC']]
  });
}

const getPlantillaById = async (id) => {
  const plantilla = await Plantilla.findByPk(id, {
    include: [{ model: Role, as: 'role' }]
  });
  if (!plantilla) {
    throw new Error('Plantilla no encontrada');
  }
  return plantilla;
}

const createNewPlantilla = async (plantillaData) => {
  const { name, description, roleId } = plantillaData;
  if (!name || !roleId) {
    throw new Error('Nombre y roleId son requeridos');
  }
  const existente = await Plantilla.findOne({ where: { name } });
  if (existente) {
    throw new Error('Ya existe una plantilla con ese nombre');
  }
  return await Plantilla.create({ name, description, roleId });
}

const updatePlantillaById = async (id, plantillaData) => {
  const plantilla = await Plantilla.findByPk(id);
  if (!plantilla) {
    throw new Error('Plantilla no encontrada');
  }
  const { name, description, roleId } = plantillaData;
  if (name && name !== plantilla.name) {
    const existente = await Plantilla.findOne({ where: { name } });
    if (existente) {
      throw new Error('Ya existe una plantilla con ese nombre');
    }
  }
  await plantilla.update({ name, description, roleId });
  return plantilla;
}

const deletePlantillaById = async (id) => {
  const deletedCount = await Plantilla.destroy({
    where: { id }
  });
  if (deletedCount === 0) {
    throw new Error('Plantilla no encontrada');
  }
  return true;
}

module.exports = {
  getAllPlantillas,
  getPlantillaById,
  createNewPlantilla,
  updatePlantillaById,
  deletePlantillaById
}