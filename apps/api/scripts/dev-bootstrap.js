const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { spawn } = require('child_process');
const path = require('path');
const net = require('net');

const PORT = 6379;

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

function startMinimalRedisServer(port) {
  const store = new Map();
  const expiries = new Map();
  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0);
    socket.on('data', (data) => {
      buffer = Buffer.concat([buffer, data]);
      while (buffer.length > 0) {
        if (buffer[0] === 0x2a) {
          const nl1 = buffer.indexOf('\r\n');
          if (nl1 === -1) break;
          const n = parseInt(buffer.slice(1, nl1).toString(), 10);
          const parts = [];
          let off = nl1 + 2;
          let ok = true;
          for (let i = 0; i < n; i++) {
            if (buffer[off] !== 0x24) { ok = false; break; }
            const nl2 = buffer.indexOf('\r\n', off);
            if (nl2 === -1) { ok = false; break; }
            const len = parseInt(buffer.slice(off + 1, nl2).toString(), 10);
            const start = nl2 + 2;
            const end = start + len;
            if (buffer.length < end + 2) { ok = false; break; }
            parts.push(buffer.slice(start, end).toString());
            off = end + 2;
          }
          if (!ok) break;
          buffer = buffer.slice(off);
          handleCommand(socket, parts, store, expiries);
        } else if (buffer[0] === 0x50 || buffer[0] === 0x70) {
          const nl = buffer.indexOf('\r\n');
          if (nl === -1) break;
          const line = buffer.slice(0, nl).toString().trim();
          buffer = buffer.slice(nl + 2);
          const parts = line.split(/\s+/).filter(Boolean);
          handleCommand(socket, parts, store, expiries);
        } else {
          buffer = buffer.slice(1);
        }
      }
    });
  });

  function encodeBulk(value) {
    if (value === null || value === undefined) return '$-1\r\n';
    const s = String(value);
    return `$${Buffer.byteLength(s)}\r\n${s}\r\n`;
  }
  function encodeSimple(value) { return `+${value}\r\n`; }
  function encodeError(msg) { return `-${msg}\r\n`; }
  function encodeInteger(n) { return `:${n}\r\n`; }
  function encodeArray(items) {
    if (items === null) return '*-1\r\n';
    let out = `*${items.length}\r\n`;
    for (const it of items) out += encodeBulk(it);
    return out;
  }

  function handleCommand(socket, parts, store, expiries) {
    if (!parts.length) return socket.write(encodeError('ERR empty command'));
    const cmd = parts[0].toUpperCase();
    const args = parts.slice(1);
    const now = Date.now();
    for (const [k, t] of expiries) if (t && t < now) { store.delete(k); expiries.delete(k); }
    const key = args[0];
    try {
      switch (cmd) {
        case 'PING':
          return socket.write(args[0] ? encodeBulk(args[0]) : encodeSimple('PONG'));
        case 'ECHO':
          return socket.write(encodeBulk(args[0] || ''));
        case 'COMMAND':
          return socket.write(encodeArray(null));
        case 'CLIENT': {
          const sub = (args[0] || '').toUpperCase();
          if (sub === 'SETINFO' || sub === 'LIST' || sub === 'ID' || sub === 'GETNAME' || sub === 'SETNAME')
            return socket.write(encodeSimple('OK'));
          return socket.write(encodeSimple('OK'));
        }
        case 'INFO': {
          const info = [
            '# Server',
            'redis_version:7.0.0-mock',
            'redis_mode:standalone',
            'os:MockOS',
            'tcp_port:' + port,
            '',
            '# Clients',
            'connected_clients:1',
            '',
            '# Memory',
            'used_memory:0',
            '',
            '# Persistence',
            'loading:0',
            '',
            '# Stats',
            'total_connections_received:1',
            'total_commands_processed:0',
            '',
            '# Replication',
            'role:master',
            '',
            '# Cluster',
            'cluster_enabled:0',
            '',
            '# Keyspace',
            '',
          ].join('\r\n') + '\r\n';
          return socket.write(encodeBulk(info));
        }
        case 'SELECT':
          return socket.write(encodeSimple('OK'));
        case 'CONFIG': {
          const sub = (args[0] || '').toUpperCase();
          if (sub === 'GET') return socket.write(encodeArray([]));
          if (sub === 'SET') return socket.write(encodeSimple('OK'));
          return socket.write(encodeSimple('OK'));
        }
        case 'SET': {
          const v = args[1] ?? '';
          store.set(key, { t: 'string', v });
          for (let i = 2; i < args.length; i++) {
            const op = (args[i] || '').toUpperCase();
            if ((op === 'PX' || op === 'EX') && args[i + 1]) {
              const ms = op === 'PX' ? Number(args[i + 1]) : Number(args[i + 1]) * 1000;
              expiries.set(key, Date.now() + ms);
              i++;
            }
          }
          return socket.write(encodeSimple('OK'));
        }
        case 'GET': {
          const v = store.get(key);
          if (!v || v.t !== 'string') return socket.write(encodeBulk(null));
          return socket.write(encodeBulk(v.v));
        }
        case 'DEL': {
          let n = 0;
          for (const k of args) if (store.has(k)) { store.delete(k); expiries.delete(k); n++; }
          return socket.write(encodeInteger(n));
        }
        case 'EXISTS': {
          let n = 0;
          for (const k of args) if (store.has(k)) n++;
          return socket.write(encodeInteger(n));
        }
        case 'EXPIRE': {
          const secs = Number(args[1] || 0);
          if (!store.has(key)) return socket.write(encodeInteger(0));
          expiries.set(key, Date.now() + secs * 1000);
          return socket.write(encodeInteger(1));
        }
        case 'TTL': {
          if (!store.has(key)) return socket.write(encodeInteger(-2));
          if (!expiries.has(key)) return socket.write(encodeInteger(-1));
          return socket.write(encodeInteger(Math.max(-1, Math.floor((expiries.get(key) - Date.now()) / 1000))));
        }
        case 'TYPE': {
          const v = store.get(key);
          if (!v) return socket.write(encodeSimple('none'));
          return socket.write(encodeSimple(v.t));
        }
        case 'KEYS': {
          const pat = args[0] || '';
          const regex = new RegExp('^' + pat.replace(/\*/g, '.*').replace(/\?/g, '.').replace(/\[(.+?)\]/g, '[$1]') + '$');
          const out = [];
          for (const k of store.keys()) if (regex.test(k)) out.push(k);
          return socket.write(encodeArray(out));
        }
        case 'SCAN': {
          const out = [];
          for (const k of store.keys()) out.push(k);
          return socket.write(encodeArray(['0', out]));
        }
        case 'INCRBY': {
          let cur = 0;
          const existing = store.get(key);
          if (existing && existing.t === 'string') cur = Number(existing.v) || 0;
          const delta = Number(args[1] || 1);
          cur += delta;
          store.set(key, { t: 'string', v: String(cur) });
          return socket.write(encodeInteger(cur));
        }
        case 'INCR': {
          let cur = 0;
          const existing = store.get(key);
          if (existing && existing.t === 'string') cur = Number(existing.v) || 0;
          cur += 1;
          store.set(key, { t: 'string', v: String(cur) });
          return socket.write(encodeInteger(cur));
        }
        case 'LPUSH': {
          let list = store.get(key);
          if (!list) { list = { t: 'list', v: [] }; store.set(key, list); }
          if (list.t !== 'list') return socket.write(encodeError('WRONGTYPE'));
          for (const v of args.slice(1).reverse()) list.v.unshift(v);
          return socket.write(encodeInteger(list.v.length));
        }
        case 'RPUSH': {
          let list = store.get(key);
          if (!list) { list = { t: 'list', v: [] }; store.set(key, list); }
          if (list.t !== 'list') return socket.write(encodeError('WRONGTYPE'));
          for (const v of args.slice(1)) list.v.push(v);
          return socket.write(encodeInteger(list.v.length));
        }
        case 'LPOP': {
          const list = store.get(key);
          if (!list || list.t !== 'list' || list.v.length === 0) return socket.write(encodeBulk(null));
          const n = Math.min(Number(args[1] || 1), list.v.length);
          const popped = list.v.splice(0, n);
          if (args[1]) return socket.write(encodeArray(popped));
          return socket.write(encodeBulk(popped[0]));
        }
        case 'RPOP': {
          const list = store.get(key);
          if (!list || list.t !== 'list' || list.v.length === 0) return socket.write(encodeBulk(null));
          const n = Math.min(Number(args[1] || 1), list.v.length);
          const popped = list.v.splice(-n, n).reverse();
          if (args[1]) return socket.write(encodeArray(popped));
          return socket.write(encodeBulk(popped[0]));
        }
        case 'LLEN': {
          const list = store.get(key);
          if (!list || list.t !== 'list') return socket.write(encodeInteger(0));
          return socket.write(encodeInteger(list.v.length));
        }
        case 'LRANGE': {
          const list = store.get(key);
          if (!list || list.t !== 'list') return socket.write(encodeArray([]));
          let start = Number(args[1] || 0);
          let stop = Number(args[2] || -1);
          if (start < 0) start = Math.max(0, list.v.length + start);
          if (stop < 0) stop = list.v.length + stop;
          return socket.write(encodeArray(list.v.slice(start, stop + 1)));
        }
        case 'LMOVE':
        case 'BLMOVE': {
          return socket.write(encodeBulk(null));
        }
        case 'BLPOP':
        case 'BRPOP': {
          return socket.write(encodeBulk(null));
        }
        case 'HSET': {
          let hash = store.get(key);
          if (!hash) { hash = { t: 'hash', v: new Map() }; store.set(key, hash); }
          if (hash.t !== 'hash') return socket.write(encodeError('WRONGTYPE'));
          let added = 0;
          for (let i = 1; i < args.length; i += 2) {
            const f = args[i];
            const val = args[i + 1] ?? '';
            if (!hash.v.has(f)) added++;
            hash.v.set(f, val);
          }
          return socket.write(encodeInteger(added));
        }
        case 'HGET': {
          const hash = store.get(key);
          if (!hash || hash.t !== 'hash') return socket.write(encodeBulk(null));
          return socket.write(encodeBulk(hash.v.get(args[1]) ?? null));
        }
        case 'HGETALL': {
          const hash = store.get(key);
          if (!hash || hash.t !== 'hash') return socket.write(encodeArray([]));
          const out = [];
          for (const [f, v] of hash.v.entries()) { out.push(f); out.push(v); }
          return socket.write(encodeArray(out));
        }
        case 'HDEL': {
          const hash = store.get(key);
          if (!hash || hash.t !== 'hash') return socket.write(encodeInteger(0));
          let n = 0;
          for (let i = 1; i < args.length; i++) if (hash.v.has(args[i])) { hash.v.delete(args[i]); n++; }
          return socket.write(encodeInteger(n));
        }
        case 'HEXISTS': {
          const hash = store.get(key);
          if (!hash || hash.t !== 'hash') return socket.write(encodeInteger(0));
          return socket.write(encodeInteger(hash.v.has(args[1]) ? 1 : 0));
        }
        case 'HINCRBY': {
          let hash = store.get(key);
          if (!hash) { hash = { t: 'hash', v: new Map() }; store.set(key, hash); }
          if (hash.t !== 'hash') return socket.write(encodeError('WRONGTYPE'));
          let cur = Number(hash.v.get(args[1]) || '0') || 0;
          const delta = Number(args[2] || 0);
          cur += delta;
          hash.v.set(args[1], String(cur));
          return socket.write(encodeInteger(cur));
        }
        case 'HLEN': {
          const hash = store.get(key);
          if (!hash || hash.t !== 'hash') return socket.write(encodeInteger(0));
          return socket.write(encodeInteger(hash.v.size));
        }
        case 'HKEYS': {
          const hash = store.get(key);
          if (!hash || hash.t !== 'hash') return socket.write(encodeArray([]));
          return socket.write(encodeArray([...hash.v.keys()]));
        }
        case 'ZADD': {
          let zset = store.get(key);
          if (!zset) { zset = { t: 'zset', v: new Map() }; store.set(key, zset); }
          if (zset.t !== 'zset') return socket.write(encodeError('WRONGTYPE'));
          let added = 0;
          for (let i = 1; i < args.length; i += 2) {
            const score = Number(args[i]);
            const member = args[i + 1];
            if (!zset.v.has(member)) added++;
            zset.v.set(member, score);
          }
          return socket.write(encodeInteger(added));
        }
        case 'ZRANGE': {
          const zset = store.get(key);
          if (!zset || zset.t !== 'zset') return socket.write(encodeArray([]));
          const start = Number(args[1] || 0);
          const stop = Number(args[2] || -1);
          const withScores = args.some((a) => (a || '').toUpperCase() === 'WITHSCORES');
          const sorted = [...zset.v.entries()].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
          const end = stop < 0 ? sorted.length + stop + 1 : stop + 1;
          const slice = sorted.slice(Math.max(0, start), end);
          const out = [];
          for (const [m, s] of slice) {
            out.push(m);
            if (withScores) out.push(String(s));
          }
          return socket.write(encodeArray(out));
        }
        case 'ZREM': {
          const zset = store.get(key);
          if (!zset || zset.t !== 'zset') return socket.write(encodeInteger(0));
          let n = 0;
          for (let i = 1; i < args.length; i++) if (zset.v.has(args[i])) { zset.v.delete(args[i]); n++; }
          return socket.write(encodeInteger(n));
        }
        case 'ZCARD': {
          const zset = store.get(key);
          if (!zset || zset.t !== 'zset') return socket.write(encodeInteger(0));
          return socket.write(encodeInteger(zset.v.size));
        }
        case 'ZRANK': {
          const zset = store.get(key);
          if (!zset || zset.t !== 'zset' || !zset.v.has(args[1])) return socket.write(encodeBulk(null));
          const sorted = [...zset.v.entries()].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
          const idx = sorted.findIndex(([m]) => m === args[1]);
          return socket.write(encodeInteger(idx));
        }
        case 'ZSCORE': {
          const zset = store.get(key);
          if (!zset || zset.t !== 'zset') return socket.write(encodeBulk(null));
          return socket.write(encodeBulk(zset.v.get(args[1]) ?? null));
        }
        case 'ZREVRANGE': {
          const zset = store.get(key);
          if (!zset || zset.t !== 'zset') return socket.write(encodeArray([]));
          const start = Number(args[1] || 0);
          const stop = Number(args[2] || -1);
          const sorted = [...zset.v.entries()].sort((a, b) => b[1] - a[1] || (b[0] < a[0] ? -1 : 1));
          const end = stop < 0 ? sorted.length + stop + 1 : stop + 1;
          return socket.write(encodeArray(sorted.slice(Math.max(0, start), end).map(([m]) => m)));
        }
        case 'ZPOPMIN': {
          const zset = store.get(key);
          if (!zset || zset.t !== 'zset' || zset.v.size === 0) return socket.write(encodeArray(null));
          const count = Math.max(1, Number(args[1] || 1));
          const sorted = [...zset.v.entries()].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
          const popped = sorted.slice(0, count);
          for (const [m] of popped) zset.v.delete(m);
          const out = [];
          for (const [m, s] of popped) { out.push(m); out.push(String(s)); }
          return socket.write(encodeArray(out));
        }
        case 'ZPOPMAX': {
          const zset = store.get(key);
          if (!zset || zset.t !== 'zset' || zset.v.size === 0) return socket.write(encodeArray(null));
          const count = Math.max(1, Number(args[1] || 1));
          const sorted = [...zset.v.entries()].sort((a, b) => b[1] - a[1] || (b[0] < a[0] ? -1 : 1));
          const popped = sorted.slice(0, count);
          for (const [m] of popped) zset.v.delete(m);
          const out = [];
          for (const [m, s] of popped) { out.push(m); out.push(String(s)); }
          return socket.write(encodeArray(out));
        }
        case 'BZPOPMIN':
        case 'BZPOPMAX': {
          const timeout = Number(args[args.length - 1] || 0);
          const keys = args.slice(0, -1).filter((a) => a !== undefined);
          const isMin = cmd === 'BZPOPMIN';
          const deadline = Date.now() + Math.min(2000, Math.max(0, timeout * 1000));
          while (true) {
            for (const k of keys) {
              const zset = store.get(k);
              if (zset && zset.t === 'zset' && zset.v.size > 0) {
                const sorted = [...zset.v.entries()].sort((a, b) => isMin ? (a[1] - b[1] || (a[0] < b[0] ? -1 : 1)) : (b[1] - a[1] || (b[0] < a[0] ? -1 : 1)));
                const [member, score] = sorted[0];
                zset.v.delete(member);
                return socket.write(encodeArray([k, member, String(score)]));
              }
            }
            if (Date.now() > deadline) return socket.write(encodeArray(null));
            const t0 = Date.now();
            while (Date.now() - t0 < 25) {}
          }
        }
        case 'ZSCAN': {
          const zset = store.get(key);
          const entries = [];
          if (zset && zset.t === 'zset') for (const [m, s] of zset.v.entries()) { entries.push(m); entries.push(String(s)); }
          return socket.write(encodeArray(['0', entries]));
        }
        case 'SCAN': {
          const out = [];
          for (const k of store.keys()) out.push(k);
          return socket.write(encodeArray(['0', out]));
        }
        case 'RENAMENX':
        case 'RENAME': {
          if (!store.has(key)) return socket.write(encodeError('ERR no such key'));
          if (cmd === 'RENAMENX' && store.has(args[1])) return socket.write(encodeInteger(0));
          const val = store.get(key);
          store.delete(key);
          store.set(args[1], val);
          if (expiries.has(key)) { const t = expiries.get(key); expiries.delete(key); if (t) expiries.set(args[1], t); }
          return socket.write(cmd === 'RENAMENX' ? encodeInteger(1) : encodeSimple('OK'));
        }
        case 'SETNX': {
          if (store.has(key)) return socket.write(encodeInteger(0));
          store.set(key, { t: 'string', v: args[1] ?? '' });
          return socket.write(encodeInteger(1));
        }
        case 'APPEND': {
          const cur = (store.get(key) && store.get(key).t === 'string') ? store.get(key).v : '';
          const next = cur + (args[1] ?? '');
          store.set(key, { t: 'string', v: next });
          return socket.write(encodeInteger(Buffer.byteLength(next)));
        }
        case 'DECR':
        case 'DECRBY': {
          let cur = 0;
          const existing = store.get(key);
          if (existing && existing.t === 'string') cur = Number(existing.v) || 0;
          const delta = cmd === 'DECR' ? -1 : -Number(args[1] || 1);
          cur += delta;
          store.set(key, { t: 'string', v: String(cur) });
          return socket.write(encodeInteger(cur));
        }
        case 'GETSET': {
          const existing = store.get(key);
          const old = (existing && existing.t === 'string') ? existing.v : null;
          store.set(key, { t: 'string', v: args[1] ?? '' });
          return socket.write(encodeBulk(old));
        }
        case 'MGET': {
          const out = [];
          for (const k of args) {
            const v = store.get(k);
            out.push(v && v.t === 'string' ? v.v : null);
          }
          return socket.write(encodeArray(out));
        }
        case 'LREM': {
          const list = store.get(key);
          if (!list || list.t !== 'list') return socket.write(encodeInteger(0));
          const count = Number(args[1] || 0);
          const val = String(args[2] ?? '');
          let removed = 0;
          const indices = [];
          for (let i = 0; i < list.v.length; i++) if (list.v[i] === val) indices.push(i);
          if (count > 0) indices.splice(count);
          if (count < 0) indices.splice(0, indices.length + count);
          for (let i = indices.length - 1; i >= 0; i--) { list.v.splice(indices[i], 1); removed++; }
          return socket.write(encodeInteger(removed));
        }
        case 'LTRIM': {
          const list = store.get(key);
          if (!list || list.t !== 'list') return socket.write(encodeSimple('OK'));
          let start = Number(args[1] || 0);
          let stop = Number(args[2] || -1);
          if (start < 0) start = Math.max(0, list.v.length + start);
          if (stop < 0) stop = list.v.length + stop;
          list.v = list.v.slice(start, stop + 1);
          return socket.write(encodeSimple('OK'));
        }
        case 'LINDEX': {
          const list = store.get(key);
          if (!list || list.t !== 'list') return socket.write(encodeBulk(null));
          let idx = Number(args[1] || 0);
          if (idx < 0) idx = list.v.length + idx;
          if (idx < 0 || idx >= list.v.length) return socket.write(encodeBulk(null));
          return socket.write(encodeBulk(list.v[idx]));
        }
        case 'LSET': {
          const list = store.get(key);
          if (!list || list.t !== 'list') return socket.write(encodeError('ERR no such key'));
          let idx = Number(args[1] || 0);
          if (idx < 0) idx = list.v.length + idx;
          if (idx < 0 || idx >= list.v.length) return socket.write(encodeError('ERR index out of range'));
          list.v[idx] = String(args[2] ?? '');
          return socket.write(encodeSimple('OK'));
        }
        case 'LINSERT': {
          const list = store.get(key);
          if (!list || list.t !== 'list') return socket.write(encodeInteger(0));
          const where = (args[1] || '').toUpperCase();
          const pivot = String(args[2] ?? '');
          const val = String(args[3] ?? '');
          const idx = list.v.indexOf(pivot);
          if (idx === -1) return socket.write(encodeInteger(-1));
          list.v.splice(where === 'BEFORE' ? idx : idx + 1, 0, val);
          return socket.write(encodeInteger(list.v.length));
        }
        case 'RPUSHX':
        case 'LPUSHX': {
          const list = store.get(key);
          if (!list || list.t !== 'list') return socket.write(encodeInteger(0));
          if (cmd === 'RPUSHX') for (const v of args.slice(1)) list.v.push(v);
          else for (const v of args.slice(1).reverse()) list.v.unshift(v);
          return socket.write(encodeInteger(list.v.length));
        }
        case 'LPOS': {
          const list = store.get(key);
          if (!list || list.t !== 'list') return socket.write(encodeBulk(null));
          const idx = list.v.indexOf(String(args[1] ?? ''));
          if (idx === -1) return socket.write(encodeBulk(null));
          return socket.write(encodeInteger(idx));
        }
        case 'MSET':
        case 'MSETNX': {
          let anySet = false;
          for (let i = 0; i + 1 < args.length; i += 2) {
            if (cmd === 'MSETNX' && store.has(args[i])) continue;
            store.set(args[i], { t: 'string', v: String(args[i + 1] ?? '') });
            anySet = true;
          }
          return socket.write(cmd === 'MSETNX' ? encodeInteger(anySet ? 1 : 0) : encodeSimple('OK'));
        }
        case 'UNLINK':
        case 'FLUSHDB':
        case 'FLUSHALL': {
          if (cmd === 'FLUSHDB' || cmd === 'FLUSHALL') { store.clear(); expiries.clear(); return socket.write(encodeSimple('OK')); }
          let n = 0;
          for (const k of args) if (store.has(k)) { store.delete(k); expiries.delete(k); n++; }
          return socket.write(encodeInteger(n));
        }
        case 'HSETNX': {
          let hash = store.get(key);
          if (!hash) { hash = { t: 'hash', v: new Map() }; store.set(key, hash); }
          if (hash.t !== 'hash') return socket.write(encodeError('WRONGTYPE'));
          if (hash.v.has(args[1])) return socket.write(encodeInteger(0));
          hash.v.set(args[1], String(args[2] ?? ''));
          return socket.write(encodeInteger(1));
        }
        case 'HMGET': {
          const hash = store.get(key);
          const out = [];
          for (let i = 1; i < args.length; i++) {
            out.push(hash && hash.t === 'hash' ? (hash.v.get(args[i]) ?? null) : null);
          }
          return socket.write(encodeArray(out));
        }
        case 'HMSET': {
          let hash = store.get(key);
          if (!hash) { hash = { t: 'hash', v: new Map() }; store.set(key, hash); }
          if (hash.t !== 'hash') return socket.write(encodeError('WRONGTYPE'));
          for (let i = 1; i + 1 < args.length; i += 2) hash.v.set(args[i], String(args[i + 1] ?? ''));
          return socket.write(encodeSimple('OK'));
        }
        case 'HVALS': {
          const hash = store.get(key);
          if (!hash || hash.t !== 'hash') return socket.write(encodeArray([]));
          return socket.write(encodeArray([...hash.v.values()]));
        }
        case 'HSCAN': {
          const hash = store.get(key);
          const out = [];
          if (hash && hash.t === 'hash') for (const [f, v] of hash.v.entries()) { out.push(f); out.push(String(v)); }
          return socket.write(encodeArray(['0', out]));
        }
        case 'ZADD': {
          let zset = store.get(key);
          if (!zset) { zset = { t: 'zset', v: new Map() }; store.set(key, zset); }
          if (zset.t !== 'zset') return socket.write(encodeError('WRONGTYPE'));
          let added = 0;
          for (let i = 1; i < args.length; i += 2) {
            const score = Number(args[i]);
            const member = args[i + 1];
            if (!zset.v.has(member)) added++;
            zset.v.set(member, score);
          }
          return socket.write(encodeInteger(added));
        }
        case 'ZRANGE': {
          const zset = store.get(key);
          if (!zset || zset.t !== 'zset') return socket.write(encodeArray([]));
          const start = Number(args[1] || 0);
          const stop = Number(args[2] || -1);
          const withScores = args.some((a) => (a || '').toUpperCase() === 'WITHSCORES');
          const sorted = [...zset.v.entries()].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
          const end = stop < 0 ? sorted.length + stop + 1 : stop + 1;
          const slice = sorted.slice(Math.max(0, start), end);
          const out = [];
          for (const [m, s] of slice) {
            out.push(m);
            if (withScores) out.push(String(s));
          }
          return socket.write(encodeArray(out));
        }
        case 'ZREM': {
          const zset = store.get(key);
          if (!zset || zset.t !== 'zset') return socket.write(encodeInteger(0));
          let n = 0;
          for (let i = 1; i < args.length; i++) if (zset.v.has(args[i])) { zset.v.delete(args[i]); n++; }
          return socket.write(encodeInteger(n));
        }
        case 'ZCARD': {
          const zset = store.get(key);
          if (!zset || zset.t !== 'zset') return socket.write(encodeInteger(0));
          return socket.write(encodeInteger(zset.v.size));
        }
        case 'ZRANK': {
          const zset = store.get(key);
          if (!zset || zset.t !== 'zset' || !zset.v.has(args[1])) return socket.write(encodeBulk(null));
          const sorted = [...zset.v.entries()].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
          const idx = sorted.findIndex(([m]) => m === args[1]);
          return socket.write(encodeInteger(idx));
        }
        case 'ZSCORE': {
          const zset = store.get(key);
          if (!zset || zset.t !== 'zset') return socket.write(encodeBulk(null));
          return socket.write(encodeBulk(zset.v.get(args[1]) ?? null));
        }
        case 'PUBSUB':
        case 'SUBSCRIBE':
        case 'UNSUBSCRIBE':
        case 'PUBLISH':
          return socket.write(encodeArray([]));
        case 'XADD':
        case 'XREAD':
        case 'XREADGROUP':
        case 'XACK':
        case 'XGROUP':
        case 'XTRIM':
        case 'XLEN':
        case 'XRANGE':
        case 'XREVRANGE':
        case 'XCLAIM':
        case 'XAUTOCLAIM':
        case 'XINFO':
          if (cmd === 'XADD') return socket.write(encodeBulk('1-0'));
          if (cmd === 'XLEN') return socket.write(encodeInteger(0));
          if (cmd === 'XREAD' || cmd === 'XREADGROUP') return socket.write(encodeArray(null));
          return socket.write(encodeSimple('OK'));
        case 'MULTI':
        case 'EXEC':
        case 'DISCARD':
          return socket.write(encodeSimple('OK'));
        case 'SCRIPT': {
          const sub = (args[0] || '').toUpperCase();
          if (sub === 'FLUSH') return socket.write(encodeSimple('OK'));
          if (sub === 'LOAD') return socket.write(encodeBulk('0000000000000000000000000000000000000001'));
          if (sub === 'EXISTS') return socket.write(encodeArray([0]));
          return socket.write(encodeSimple('OK'));
        }
        case 'EVAL':
        case 'EVALSHA':
          return socket.write(encodeBulk(null));
        case 'ACLK':
        case 'HELLO':
          return socket.write(encodeSimple('OK'));
        case 'AUTH':
          return socket.write(encodeSimple('OK'));
        case 'QUIT':
          socket.end();
          return;
        default:
          return socket.write(encodeError(`ERR unknown command '${cmd}'`));
      }
    } catch (e) {
      return socket.write(encodeError('ERR internal: ' + String(e.message || e)));
    }
  }

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => {
      console.log(`[dev-bootstrap] Mock Redis listening on 127.0.0.1:${port}`);
      resolve(server);
    });
  });
}

async function main() {
  const free = await isPortFree(PORT);
  let redisHandle = null;
  if (free) {
    redisHandle = await startMinimalRedisServer(PORT);
  } else {
    console.log(`[dev-bootstrap] Port ${PORT} already in use — assuming Redis is running there.`);
  }

  console.log('[dev-bootstrap] Starting MongoMemoryReplSet...');
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, name: 'rs0', storageEngine: 'wiredTiger' },
  });
  const mongoUri = replSet.getUri();
  console.log(`[dev-bootstrap] MongoDB URI: ${mongoUri}`);

  const isWin = process.platform === 'win32';
  const child = spawn(
    'npm',
    ['run', 'dev:api'],
    {
      stdio: 'inherit',
      shell: isWin,
      env: {
        ...process.env,
        MONGODB_URI: mongoUri,
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: String(PORT),
      },
      cwd: path.resolve(__dirname, '..', '..'),
    },
  );

  child.on('exit', (code, signal) => {
    console.log(`[dev-bootstrap] API exited (code=${code}, signal=${signal}) — cleaning up...`);
    replSet.stop().then(() => {
      if (redisHandle) try { redisHandle.close(); } catch {}
      process.exit(code ?? 0);
    }).catch(() => {
      if (redisHandle) try { redisHandle.close(); } catch {}
      process.exit(1);
    });
  });

  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));
}

main().catch((e) => {
  console.error('[dev-bootstrap] FATAL:', e);
  process.exit(1);
});
