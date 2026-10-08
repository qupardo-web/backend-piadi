const { User, Role, Department } = require('../models');
const plantillaService = require('../services/plantillaService');
const { UnauthorizedError, ForbiddenError, NotFoundError } = require('../utils/errors');

const isGlobalUploadUser = (user) => user?.role?.name === 'Rector' || user?.role?.group === 'Rectoria';

const getUploadForbiddenMessage = (plantilla) => (
  plantilla?.departmentId === 'admision'
    ? 'No tienes permiso para cargar datos en este departamento'
    : 'No tienes permisos para cargar esta plantilla'
);

const findCurrentUser = (id) => User.findByPk(id, {
  include: [
    { model: Role, as: 'role' },
    { model: Department, as: 'department' }
  ]
});

const authorizePlantillaUpload = async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return next(new UnauthorizedError('Usuario no autenticado'));
    }

    const user = await findCurrentUser(req.user.id);
    if (!user) {
      return next(new UnauthorizedError('La sesión ya no corresponde a un usuario vigente'));
    }

    const plantilla = await plantillaService.getPlantillaForAuthorization(req.params.id);
    if (!plantilla) {
      return next(new NotFoundError('Plantilla no encontrada'));
    }

    const roleName = user.role?.name || null;
    const roleGroup = user.role?.group || null;
    const departmentId = user.department?.key || user.departmentId || null;

    if (!isGlobalUploadUser(user)) {
      const ownsDepartment = Boolean(departmentId) && departmentId === plantilla.departmentId;
      const hasUploadRole = Number(user.roleId) === Number(plantilla.roleId);
      if (!ownsDepartment || !hasUploadRole) {
        return next(new ForbiddenError(getUploadForbiddenMessage(plantilla)));
      }
    }

    req.user = {
      ...req.user,
      role: roleName,
      roleGroup,
      departmentId
    };
    req.plantilla = plantilla;
    return next();
  } catch (error) {
    return next(error);
  }
};

const authorizePlantillaAdministration = async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return next(new UnauthorizedError('Usuario no autenticado'));
    }
    const user = await findCurrentUser(req.user.id);
    if (!user) {
      return next(new UnauthorizedError('La sesión ya no corresponde a un usuario vigente'));
    }
    if (!isGlobalUploadUser(user)) {
      return next(new ForbiddenError('Solo Rectoría puede administrar plantillas'));
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  authorizePlantillaUpload,
  authorizePlantillaAdministration,
  isGlobalUploadUser
};
