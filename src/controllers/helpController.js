const helpService = require('../services/helpService');

const listAdmin = async (req, res, next) => {
  try {
    const entries = await helpService.listAdmin();
    res.status(200).json({ success: true, data: entries });
  } catch (error) {
    next(error);
  }
};

const createEntry = async (req, res, next) => {
  try {
    const entry = await helpService.createEntry(req.body);
    res.status(201).json({ success: true, data: entry });
  } catch (error) {
    next(error);
  }
};

const updateEntry = async (req, res, next) => {
  try {
    const entry = await helpService.updateEntry(req.params.id, req.body);
    res.status(200).json({ success: true, data: entry });
  } catch (error) {
    next(error);
  }
};

const listActiveByModule = async (req, res, next) => {
  try {
    const entries = await helpService.listActiveByModule(req.query.modulo);
    res.status(200).json({ success: true, data: entries });
  } catch (error) {
    next(error);
  }
};

module.exports = { listAdmin, createEntry, updateEntry, listActiveByModule };
