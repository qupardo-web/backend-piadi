const landingService = require('../services/landingService');

const getMetas = async (req, res, next) => {
  try {
    const metas = await landingService.getLandingMetas();
    res.status(200).json({ success: true, data: metas });
  } catch (error) {
    next(error);
  }
};

module.exports = { getMetas };
