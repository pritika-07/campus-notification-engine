const fs = require('fs');
const os = require('os');

module.exports = async function globalTeardown() {
  const uriFile =
    process.env.__CAMPUS_E2E_MONGO_URI_FILE__ ||
    require('path').join(os.tmpdir(), `campus-e2e-mongo-${process.pid}.txt`);
  try {
    if (fs.existsSync(uriFile)) fs.unlinkSync(uriFile);
  } catch {}
  if (globalThis.__REPLSET_HANDLE__) {
    try {
      await globalThis.__REPLSET_HANDLE__.stop();
    } catch {}
  }
};
