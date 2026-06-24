const plantillaService = require('../services/plantillaService');
const { validarArchivo } = require('../services/carga/validacionService');
const { procesarCarga } = require('../services/carga/cargaService');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors');

const getPlantillas = async (req, res, next) => {
  try {
    const plantillas = await plantillaService.getAllPlantillas();
    res.json(plantillas);
  } catch (err) {
    next(err);
  }
}

const getPlantilla = async (req, res, next) => {
  const { id } = req.params;
  try {
    const plantilla = await plantillaService.getPlantillaById(id);
    res.json(plantilla);
  } catch (err) {
    if (err.message === 'Plantilla no encontrada') {
      next(new NotFoundError('Plantilla no encontrada'));
    } else {
      next(err);
    }
  }
}

const createPlantilla = async (req, res, next) => {
  try {
    const newPlantilla = await plantillaService.createNewPlantilla(req.body);
    res.status(201).json(newPlantilla);
  } catch (err) {
    if (err.message.includes('requeridos')) {
      next(new ValidationError(err.message));
    } else if (err.message.includes('Ya existe')) {
      next(new ConflictError(err.message));
    } else {
      next(err);
    }
  }
}

const updatePlantilla = async (req, res, next) => {
  const { id } = req.params;
  try {
    const plantilla = await plantillaService.updatePlantillaById(id, req.body);
    res.json(plantilla);
  } catch (err) {
    if (err.message === 'Plantilla no encontrada') {
      next(new NotFoundError('Plantilla no encontrada'));
    } else if (err.message.includes('Ya existe')) {
      next(new ConflictError(err.message));
    } else {
      next(err);
    }
  }
}

const deletePlantilla = async (req, res, next) => {
  const { id } = req.params;
  try {
    await plantillaService.deletePlantillaById(id);
    res.json({ message: 'Plantilla eliminada correctamente' });
  } catch (err) {
    if (err.message === 'Plantilla no encontrada') {
      next(new NotFoundError('Plantilla no encontrada'));
    } else {
      next(err);
    }
  }
}

const cargarArchivo = async (req, res, next) => {
  const { id } = req.params;

  try {
    if (!req.file) {
      throw new ValidationError('Debe enviar un archivo Excel');
    }

    const { valido, errores, campos, workbook } = await validarArchivo(req.file.path, id);

    if (!valido) {
      const errorMsg = `Error de validación en carga: ${errores.map(e => e.mensaje).join('. ')}`;
      return res.status(400).json({
        error: errorMsg,
        success: false,
        errorType: 'ExcelValidationError'
      });
    }

    const resultado = await procesarCarga(workbook, campos);
    res.json(resultado);
  } catch (err) {
    next(err);
  }
}

const descargarExcel = async (req, res, next) => {
  const { id } = req.params;
  try {
    const plantilla = await plantillaService.getPlantillaWithArchivo(id);
    if (!plantilla.archivoData) {
      throw new NotFoundError('El archivo Excel de plantilla no está registrado en la base de datos');
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${plantilla.archivoNombre}`);
    return res.send(plantilla.archivoData);
  } catch (err) {
    next(err);
  }
}

const subirTemplate = async (req, res, next) => {
  const { id } = req.params;
  try {
    if (!req.file) {
      throw new ValidationError('Debe enviar un archivo Excel');
    }

    const plantilla = await plantillaService.guardarArchivoTemplate(id, req.file.buffer, req.file.originalname);
    res.json({
      success: true,
      message: 'Archivo de plantilla guardado exitosamente en base de datos',
      plantilla: {
        id: plantilla.id,
        name: plantilla.name,
        archivoNombre: plantilla.archivoNombre
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getPlantillas,
  getPlantilla,
  createPlantilla,
  updatePlantilla,
  deletePlantilla,
  cargarArchivo,
  descargarExcel,
  subirTemplate
}