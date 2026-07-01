const { Role } = require('../models');
const { NotFoundError } = require('../utils/errors');

const getRoles = async (req, res, next) => {
  try {
    const roles = await Role.findAll({
      order: [['name', 'ASC']]
    });
    res.json(roles);
  } catch (err) {
    next(err);
  }
};

const getRoleById = async (req, res, next) => {
  const { id } = req.params;
  try {
    const role = await Role.findByPk(id);
    if (!role) {
      throw new NotFoundError('Rol no encontrado');
    }
    res.json(role);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getRoles,
  getRoleById
};
