const plantillaService = require('../services/plantillaService');

const getPlantillas = async (req, res) => {
  try {
    const plantillas = await plantillaService.getAllPlantillas();
    res.json(plantillas);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener las plantillas', details: err.message });
  }
}

const getPlantilla = async (req, res) => {
  const { id } = req.params;
  try {
    const plantilla = await plantillaService.getPlantillaById(id);
    res.json(plantilla);
  } catch (err) {
    const status = err.message === 'Plantilla no encontrada' ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
}

const createPlantilla = async (req, res) => {
  try {
    const newPlantilla = await plantillaService.createNewPlantilla(req.body);
    res.status(201).json(newPlantilla);
  } catch (err) {
    const status = err.message.includes('requeridos') || err.message.includes('Ya existe') ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
}

const updatePlantilla = async (req, res) => {
  const { id } = req.params;
  try {
    const plantilla = await plantillaService.updatePlantillaById(id, req.body);
    res.json(plantilla);
  } catch (err) {
    const status = err.message === 'Plantilla no encontrada' ? 404 : err.message.includes('Ya existe') ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
}

const deletePlantilla = async (req, res) => {
  const { id } = req.params;
  try {
    await plantillaService.deletePlantillaById(id);
    res.json({ message: 'Plantilla eliminada correctamente' });
  } catch (err) {
    const status = err.message === 'Plantilla no encontrada' ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
}

module.exports = {
  getPlantillas,
  getPlantilla,
  createPlantilla,
  updatePlantilla,
  deletePlantilla
}