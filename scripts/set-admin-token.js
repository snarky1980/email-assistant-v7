#!/usr/bin/env node
/**
 * Helper: generate or set ADMIN_TOKEN (and optionally ADMIN_TOKEN_2) in .env
 * Usage:
 *   npm run set-admin-token                -> generates a random token and writes ADMIN_TOKEN
 *   npm run set-admin-token -- myToken     -> sets ADMIN_TOKEN to 'myToken'
 *   npm run set-admin-token -- rotate      -> moves current ADMIN_TOKEN to ADMIN_TOKEN_2 and sets new ADMIN_TOKEN
 *   npm run set-admin-token -- clear-2     -> removes ADMIN_TOKEN_2
 */
const fs = require('fs');
const path = require('path');
const envPath = path.join(process.cwd(), '.env');

function rand(){ return require('crypto').randomBytes(32).toString('hex'); }

let arg = process.argv.slice(2)[0];
let env = '';
if(fs.existsSync(envPath)) env = fs.readFileSync(envPath,'utf8');
const lines = env.split(/\r?\n/);
function setLine(key,value){
  const idx = lines.findIndex(l=> l.startsWith(key+'='));
  if(idx>=0) lines[idx] = key+'='+value; else lines.push(key+'='+value);
}
function removeLine(key){
  const idx = lines.findIndex(l=> l.startsWith(key+'='));
  if(idx>=0) lines.splice(idx,1);
}
function getVal(key){
  const l = lines.find(l=> l.startsWith(key+'='));
  return l? l.substring(key.length+1): '';
}

if(arg === 'rotate'){
  const current = getVal('ADMIN_TOKEN');
  if(!current){ console.error('Cannot rotate: ADMIN_TOKEN missing'); process.exit(1); }
  setLine('ADMIN_TOKEN_2', current);
  const fresh = rand();
  setLine('ADMIN_TOKEN', fresh);
  console.log('Rotation complete. New ADMIN_TOKEN generated. Old moved to ADMIN_TOKEN_2');
} else if(arg === 'clear-2') {
  removeLine('ADMIN_TOKEN_2');
  console.log('Removed ADMIN_TOKEN_2');
} else if(arg) {
  setLine('ADMIN_TOKEN', arg);
  console.log('Set ADMIN_TOKEN to provided value');
} else {
  const token = rand();
  setLine('ADMIN_TOKEN', token);
  console.log('Generated ADMIN_TOKEN');
}

const output = lines.filter(l=> l.trim().length>0).join('\n') + '\n';
fs.writeFileSync(envPath, output);
console.log('\nUpdated .env. Next steps:');
console.log('  1. Restart server: npm start (or your process manager)');
console.log('  2. Open /admin, paste new token if prompted (Change token if cached)');
if(arg==='rotate'){
  console.log('\nREMEMBER: After all users switch, run to finalize rotation:');
  console.log('  npm run set-admin-token -- clear-2');
}
