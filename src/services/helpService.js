const { EntradaAyuda } = require('../models');
const { isHelpModule } = require('../config/helpModules');
const { ValidationError, NotFoundError } = require('../utils/errors');

const MAX_ID = 2147483647;
const WRITABLE_FIELDS = new Set(['modulo', 'pregunta', 'respuesta', 'orden', 'activo']);

const validateId = (id) => {
  if (!/^\d+$/.test(String(id)) || !Number.isInteger(Number(id))
    || Number(id) < 1 || Number(id) > MAX_ID) {
    throw new ValidationError('El id de la entrada debe ser un entero positivo');
  }
  return Number(id);
};

const validateText = (value, field) => {
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} debe ser texto`);
  }
  const normalized = value.trim().replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ');
  if (!normalized) {
    throw new ValidationError(`${field} es obligatorio`);
  }
  if (/[<>]/.test(normalized)) {
    throw new ValidationError(`${field} debe ser texto plano, sin HTML`);
  }
  return normalized;
};

const validateModule = (value) => {
  const modulo = validateText(value, 'modulo');
  if (!isHelpModule(modulo)) {
    throw new ValidationError('El módulo de ayuda no está permitido');
  }
  return modulo;
};

const validateOrder = (value) => {
  if (!Number.isInteger(value) || value < 0 || value > MAX_ID) {
    throw new ValidationError('orden debe ser un entero no negativo');
  }
  return value;
};

const validateActive = (value) => {
  if (typeof value !== 'boolean') {
    throw new ValidationError('activo debe ser booleano');
  }
  return value;
};

const normalizeEntry = (payload, { partial = false } = {}) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ValidationError('El cuerpo debe ser un objeto');
  }
  const keys = Object.keys(payload);
  if (keys.length === 0) {
    throw new ValidationError('El cuerpo no puede estar vacío');
  }
  const unknown = keys.filter((key) => !WRITABLE_FIELDS.has(key));
  if (unknown.length) {
    throw new ValidationError(`Campos no permitidos: ${unknown.join(', ')}`);
  }
  if (!partial) {
    const missing = ['modulo', 'pregunta', 'respuesta', 'orden']
      .filter((key) => !Object.prototype.hasOwnProperty.call(payload, key));
    if (missing.length) {
      throw new ValidationError(`Campos obligatorios: ${missing.join(', ')}`);
    }
  }

  const fields = {};
  if (Object.prototype.hasOwnProperty.call(payload, 'modulo')) fields.modulo = validateModule(payload.modulo);
  if (Object.prototype.hasOwnProperty.call(payload, 'pregunta')) fields.pregunta = validateText(payload.pregunta, 'pregunta');
  if (Object.prototype.hasOwnProperty.call(payload, 'respuesta')) fields.respuesta = validateText(payload.respuesta, 'respuesta');
  if (Object.prototype.hasOwnProperty.call(payload, 'orden')) fields.orden = validateOrder(payload.orden);
  if (Object.prototype.hasOwnProperty.call(payload, 'activo')) fields.activo = validateActive(payload.activo);
  if (!partial && fields.activo === undefined) fields.activo = true;
  return fields;
};

const listAdmin = () => EntradaAyuda.findAll({
  order: [['modulo', 'ASC'], ['orden', 'ASC'], ['id', 'ASC']]
});

const listActiveByModule = async (modulo) => EntradaAyuda.findAll({
  where: { modulo: validateModule(modulo), activo: true },
  order: [['orden', 'ASC'], ['id', 'ASC']]
});

const createEntry = async (payload) => EntradaAyuda.create(normalizeEntry(payload));

const updateEntry = async (id, payload) => {
  const parsedId = validateId(id);
  const fields = normalizeEntry(payload, { partial: true });
  const entry = await EntradaAyuda.findByPk(parsedId);
  if (!entry) throw new NotFoundError('La entrada de ayuda no existe');
  await entry.update(fields);
  return entry;
};

module.exports = { listAdmin, createEntry, updateEntry, listActiveByModule };
