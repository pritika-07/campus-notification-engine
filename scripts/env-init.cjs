const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env');

function randomHex(bytes) {
  return crypto.randomBytes(bytes).toString('hex');
}

function readEnv(file) {
  if (!fs.existsSync(file)) return new Map();
  const current = fs.readFileSync(file, 'utf8');
  const entries = new Map();
  for (const line of current.split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    entries.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
  }
  return entries;
}

function writeEnv(file, entries) {
  const out = [...entries.entries()].map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
  fs.writeFileSync(file, out, 'utf8');
}

const entries = readEnv(ENV_FILE);
let changed = false;

if (!entries.has('MONGODB_URI')) { entries.set('MONGODB_URI', ''); changed = true; }
if (!entries.has('REDIS_URL'))   { entries.set('REDIS_URL', '');   changed = true; }
if (!entries.has('JWT_SECRET') || !entries.get('JWT_SECRET')) {
  entries.set('JWT_SECRET', randomHex(32)); changed = true;
}
if (!entries.has('PORT')) { entries.set('PORT', '3000'); changed = true; }
if (!entries.has('ENCRYPTION_KEY') || !entries.get('ENCRYPTION_KEY')) {
  entries.set('ENCRYPTION_KEY', randomHex(16)); changed = true;
}
if (!entries.has('__CAMPUS_INMEMORY_REDIS')) {
  entries.set('__CAMPUS_INMEMORY_REDIS', '1'); changed = true;
}

writeEnv(ENV_FILE, entries);
console.log(changed ? '[env-init] .env created/updated' : '[env-init] .env already configured');
for (const [k, v] of entries) {
  const masked = ['JWT_SECRET', 'ENCRYPTION_KEY'].includes(k)
    ? (v ? v.slice(0, 6) + '...(redacted)' : '(empty)')
    : (v || '(empty)');
  console.log(`  ${k}=${masked}`);
}
