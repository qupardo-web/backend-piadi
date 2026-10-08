const crearDefaultValidation = () => ({
  nombre: 'default',

  prepare({ nombresHojas, resolverHoja }) {
    return {
      resoluciones: new Map(nombresHojas.map((nombreHoja) => [
        nombreHoja,
        { nombre: resolverHoja(nombreHoja), ambiguas: [] }
      ])),
      errores: []
    };
  },

  omitirHojaFaltante() {
    return false;
  },

  normalizarValor({ valor }) {
    return valor;
  },

  normalizarNombreColumna({ valor }) {
    return valor;
  },

  validarValor() {
    return null;
  },

  validarSemantica() {
    return [];
  },

  normalizarValorModelo({ valor }) {
    return valor;
  },

  validarHoja() {
    return [];
  },

  async validateSpecific() {
    return { errores: [] };
  }
});

module.exports = crearDefaultValidation();
