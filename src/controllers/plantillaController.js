const fs = require('node:fs/promises');
const plantillaService = require('../services/plantillaService');
const { validarArchivo } = require('../services/carga/validacionService');
const { procesarCarga } = require('../services/carga/cargaService');
const { NotFoundError, ValidationError, ConflictError, UnprocessableEntityError } = require('../utils/errors');

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

const limpiarArchivoTemporal = async (filePath, removeFile = fs.unlink) => {
  if (!filePath) return;

  try {
    await removeFile(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`No se pudo eliminar el archivo temporal de carga ${filePath}`, err);
    }
  }
};

const createCargarArchivo = ({
  validateFile = validarArchivo,
  processUpload = procesarCarga,
  removeFile = fs.unlink
} = {}) => async (req, res, next) => {
  const { id } = req.params;

  try {
    if (!req.file) {
      throw new UnprocessableEntityError('Debe enviar un archivo Excel');
    }

    const { valido, errores, campos, workbook } = await validateFile(req.file.path, id);

    if (!valido) {
      const errorMsg = `Error de validación en carga: ${errores.map(e => e.mensaje).join('. ')}`;
      return res.status(422).json({
        error: errorMsg,
        errores: errores.map(e => ({
          message: e.mensaje,
          hoja: e.hoja || 'General',
          fila: e.fila || '',
          columna: e.campo || '',
          celda: e.celda || ''
        })),
        success: false
      });
    }

    const resultado = await processUpload(workbook, campos);
    res.json(resultado);
  } catch (err) {
    next(err);
  } finally {
    await limpiarArchivoTemporal(req.file && req.file.path, removeFile);
  }
};

const cargarArchivo = createCargarArchivo();

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
  createCargarArchivo,
  limpiarArchivoTemporal,
  descargarExcel,
  subirTemplate
}
