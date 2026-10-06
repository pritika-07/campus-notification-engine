const path = require('path');
const fs = require('fs');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const STATE_FILE = path.resolve(__dirname, '.mongo-memory.state.json');

async function main() {
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', name: 'rs0', dbName: 'campus-notifications' },
    instanceOpts: [{ args: ['--syncdelay', '60'] }],
  });

  const uri = replSet.getUri('campus-notifications');
  const state = {
    uri,
    dbName: 'campus-notifications',
    replicaSet: 'rs0',
    pid: process.pid,
    startedAt: new Date().toISOString(),
  };

  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');

  console.log('\n============================================================');
  console.log('  MongoDB Memory Server (Replica Set) — READY');
  console.log('============================================================');
  console.log('  URI:        ' + uri);
  console.log('  RS Name:    rs0');
  console.log('  DB Name:    campus-notifications');
  console.log('  State file: ' + STATE_FILE);
  console.log('');
  console.log('  Paste this into apps/api/.env or the root .env:');
  console.log('  MONGODB_URI=' + uri);
  console.log('');
  console.log('  Press Ctrl+C to stop the server and delete the DB.');
  console.log('============================================================\n');

  const cleanup = (signal) => async () => {
    try { fs.unlinkSync(STATE_FILE); } catch (_) {}
    console.log(`\n[dev-mongo] ${signal} received — stopping MongoDB memory server...`);
    await replSet.stop({ doCleanup: true, force: true });
    process.exit(0);
  };

  process.on('SIGINT',  cleanup('SIGINT'));
  process.on('SIGTERM', cleanup('SIGTERM'));
  process.on('exit',    async (code) => {
    try { fs.unlinkSync(STATE_FILE); } catch (_) {}
    try { await replSet.stop({ doCleanup: true, force: true }); } catch (_) {}
  });

  setInterval(() => {}, 1000 * 60 * 60 * 24);
}

main().catch((err) => {
  console.error('[dev-mongo] Failed to start MongoDB memory server:');
  console.error(err);
  process.exit(1);
});
