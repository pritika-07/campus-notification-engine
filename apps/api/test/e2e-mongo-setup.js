const fs = require('fs');
const path = require('path');
const os = require('os');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const URI_FILE = path.join(os.tmpdir(), `campus-e2e-mongo-${process.pid}.txt`);

module.exports = async function globalSetup() {
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, name: 'rs0', storageEngine: 'wiredTiger' },
  });
  const uri = replSet.getUri();
  fs.writeFileSync(URI_FILE, uri, 'utf8');
  process.env.MONGODB_URI = uri;
  process.env.__CAMPUS_E2E_MONGO_URI__ = uri;
  process.env.__CAMPUS_E2E_MONGO_URI_FILE__ = URI_FILE;
  globalThis.__REPLSET_HANDLE__ = replSet;
};
