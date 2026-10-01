const DEFAULT_MAX_UPLOAD_SIZE_MB = 10;

const configuredSize = Number(process.env.MAX_UPLOAD_SIZE_MB);
const MAX_UPLOAD_SIZE_MB = Number.isFinite(configuredSize) && configuredSize > 0
  ? configuredSize
  : DEFAULT_MAX_UPLOAD_SIZE_MB;
const MAX_UPLOAD_SIZE_BYTES = Math.floor(MAX_UPLOAD_SIZE_MB * 1024 * 1024);

module.exports = {
  DEFAULT_MAX_UPLOAD_SIZE_MB,
  MAX_UPLOAD_SIZE_MB,
  MAX_UPLOAD_SIZE_BYTES
};
