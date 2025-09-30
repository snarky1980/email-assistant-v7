const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function atomicWrite(filePath, data) {
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, '.tmp-' + path.basename(filePath) + '-' + crypto.randomBytes(6).toString('hex'));
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, filePath);
}

function readJsonArray(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return []; }
}

function writeJsonArray(file, arr) { atomicWrite(file, JSON.stringify(arr, null, 2)); }

function readTokenStore(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return { tokens: [], updatedAt: null }; } }

function writeTokenStore(file, store) { store.updatedAt = new Date().toISOString(); atomicWrite(file, JSON.stringify(store, null, 2)); }

function genToken() { return 'tok_' + crypto.randomBytes(24).toString('hex'); }

function hashToken(token, algo = process.env.TOKEN_HASH_ALGO || 'sha256') { return algo + ':' + crypto.createHash(algo).update(token).digest('hex'); }

function constantTimeEquals(a,b){ if(a.length !== b.length) return false; let res = 0; for(let i=0;i<a.length;i++) res |= a.charCodeAt(i) ^ b.charCodeAt(i); return res === 0; }

module.exports = { atomicWrite, readJsonArray, writeJsonArray, readTokenStore, writeTokenStore, genToken, hashToken, constantTimeEquals };
