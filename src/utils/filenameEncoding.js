const MOJIBAKE_MARKERS = /[ÃÂ]/;

const normalizeUploadedFilename = (filename) => {
  if (!filename || typeof filename !== 'string' || !MOJIBAKE_MARKERS.test(filename)) {
    return filename;
  }

  const decoded = Buffer.from(filename, 'latin1').toString('utf8');
  if (decoded.includes('\uFFFD') || decoded === filename) {
    return filename;
  }
  return decoded;
};

module.exports = { normalizeUploadedFilename };
