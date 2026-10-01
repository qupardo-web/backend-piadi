const multer = require('multer');
const { MAX_UPLOAD_SIZE_BYTES } = require('../config/upload');

const createUploaders = ({ diskDestination = 'uploads/' } = {}) => {
  // Busboy marca el archivo como truncado al alcanzar el límite; un byte extra
  // permite aceptar exactamente el máximo público y rechazar cualquier exceso.
  const limits = { fileSize: MAX_UPLOAD_SIZE_BYTES + 1 };
  return {
    uploadToDisk: multer({ dest: diskDestination, limits }),
    uploadToMemory: multer({ storage: multer.memoryStorage(), limits })
  };
};

const { uploadToDisk, uploadToMemory } = createUploaders();

module.exports = {
  createUploaders,
  uploadToDisk,
  uploadToMemory
};
