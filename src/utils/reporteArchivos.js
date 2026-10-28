const fs = require('fs');
const path = require('path');

const DIRECTORIO = path.resolve(process.cwd(), 'uploads', 'reportes');

const rutaEjecucion = (ejecucionId) => path.join(DIRECTORIO, `${ejecucionId}.xlsx`);

const guardarEjecucion = async (ejecucionId, buffer) => {
  await fs.promises.mkdir(DIRECTORIO, { recursive: true });
  await fs.promises.writeFile(rutaEjecucion(ejecucionId), buffer);
};

const existeEjecucion = (ejecucionId) => fs.existsSync(rutaEjecucion(ejecucionId));

const leerEjecucion = (ejecucionId) => fs.promises.readFile(rutaEjecucion(ejecucionId));

const eliminarEjecucion = async (ejecucionId) => {
  try {
    await fs.promises.unlink(rutaEjecucion(ejecucionId));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
};

module.exports = {
  DIRECTORIO,
  rutaEjecucion,
  guardarEjecucion,
  existeEjecucion,
  leerEjecucion,
  eliminarEjecucion
};
