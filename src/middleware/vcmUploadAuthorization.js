const plantillaService = require('../services/plantillaService');
const { authorizeRoles } = require('./authMiddleware');

const VCM_TEMPLATE_NAME = 'Vinculación Con El Medio';
const VCM_ROLE = 'Vinculación Con El Medio';
const RECTOR_ROLE = 'Rector';
const RECTORIA_GROUP = 'Rectoria';

const requireVcmUploadRole = async (req, res, next) => {
  try {
    const plantilla = await plantillaService.getPlantillaById(req.params.id);

    if (plantilla.name !== VCM_TEMPLATE_NAME) {
      return next();
    }

    return authorizeRoles(VCM_ROLE, RECTOR_ROLE, RECTORIA_GROUP)(req, res, next);
  } catch (error) {
    // Mantiene el manejo previo de plantillas inexistentes en el flujo de carga.
    if (error.message === 'Plantilla no encontrada') {
      return next();
    }
    return next(error);
  }
};

module.exports = {
  requireVcmUploadRole,
  VCM_TEMPLATE_NAME,
  VCM_ROLE
};
