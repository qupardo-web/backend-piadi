const { Plantilla, Role, CampoPlantilla } = require('../models');

const buildRequirementSheets = (fields) => {
  const sheets = new Map();

  for (const field of fields) {
    const sheetName = field.hoja_origen;
    if (!sheets.has(sheetName)) {
      sheets.set(sheetName, { nombre: sheetName, campos: [], seen: new Set() });
    }

    const sheet = sheets.get(sheetName);
    const publicKey = JSON.stringify([field.columna_excel, field.requerido]);
    if (sheet.seen.has(publicKey)) continue;

    sheet.seen.add(publicKey);
    sheet.campos.push({
      columna: field.columna_excel,
      requerido: field.requerido
    });
  }

  return [...sheets.values()].map(({ nombre, campos }) => ({ nombre, campos }));
};

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

  const fields = await CampoPlantilla.findAll({
    where: { plantillaId: id },
    attributes: ['id', 'hoja_origen', 'columna_excel', 'requerido'],
    order: [['id', 'ASC']]
  });
  const plantillaData = typeof plantilla.toJSON === 'function' ? plantilla.toJSON() : { ...plantilla };

  return {
    ...plantillaData,
    hojas: buildRequirementSheets(fields)
  };
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

const getPlantillaWithArchivo = async (id) => {
  const plantilla = await Plantilla.unscoped().findByPk(id);
  if (!plantilla) {
    throw new Error('Plantilla no encontrada');
  }
  return plantilla;
}

const guardarArchivoTemplate = async (id, buffer, originalname) => {
  const plantilla = await Plantilla.unscoped().findByPk(id);
  if (!plantilla) {
    throw new Error('Plantilla no encontrada');
  }
  await plantilla.update({
    archivoData: buffer,
    archivoNombre: originalname
  });
  return plantilla;
}

module.exports = {
  getAllPlantillas,
  getPlantillaById,
  createNewPlantilla,
  updatePlantillaById,
  deletePlantillaById,
  getPlantillaWithArchivo,
  guardarArchivoTemplate
}
