const defaultValidation = require('./defaultValidation');
const admisionValidation = require('./admisionValidation');

const validadores = [admisionValidation];

const obtenerValidador = ({ campos }) =>
  validadores.find((validador) => validador.aplica({ campos })) || defaultValidation;

module.exports = {
  obtenerValidador,
  defaultValidation,
  admisionValidation
};
