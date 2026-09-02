const { Meta } = require('../models');
const { ValidationError, UnauthorizedError, ForbiddenError, NotFoundError } = require('../utils/errors');
const { isRectoria } = require('./rectoriaAuthorization');

const requireMetaOwnership = async (req, res, next) => {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Usuario no autenticado');
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new ValidationError('El id de la meta debe ser un entero positivo');
    }
    const meta = await Meta.findByPk(id);
    if (!meta) {
      throw new NotFoundError('La meta solicitada no existe');
    }
    const isOwner = Number(meta.creatorId) === Number(req.user.id);
    if (!isOwner && !isRectoria(req.user)) {
      throw new ForbiddenError('Solo el creador de la meta o Rectoría puede modificarla o eliminarla');
    }
    req.meta = meta;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { requireMetaOwnership };
