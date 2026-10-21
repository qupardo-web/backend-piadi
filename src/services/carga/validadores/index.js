const defaultValidation = require('./defaultValidation');
const admisionValidation = require('./admisionValidation');
const curricularValidation = require('./curricularValidation');

const validadores = [admisionValidation, curricularValidation];

const obtenerValidador = ({ campos }) =>
  validadores.find((validador) => validador.aplica({ campos })) || defaultValidation;

module.exports = {
  obtenerValidador,
  defaultValidation,
  admisionValidation,
  curricularValidation
};
