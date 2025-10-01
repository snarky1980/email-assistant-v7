#!/usr/bin/env node
/**
 * verify-popup-version.js
 * Ensures the version constant inside assets/var-popup-integrated.js matches the cache-busting query param in index.html.
 * Exits with non-zero code on mismatch so it can gate CI.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const POPUP = path.join(ROOT, 'assets', 'var-popup-integrated.js');
const INDEX = path.join(ROOT, 'index.html');

function fail(msg){
  console.error('[verify-popup-version] FAIL:', msg);
  process.exit(1);
}

function extractScriptVersion(){
  const src = fs.readFileSync(POPUP, 'utf8');
  const m = src.match(/VAR_POPUP_SCRIPT_VERSION\s*=\s*'([^']+)'/);
  if(!m) fail('Could not find VAR_POPUP_SCRIPT_VERSION in popup script');
  return m[1];
}
function extractIndexQuery(){
  const html = fs.readFileSync(INDEX, 'utf8');
  const m = html.match(/var-popup-integrated\.js\?v=([A-Za-z0-9_.-]+)/);
  if(!m) fail('Could not find version cache-bust query in index.html');
  return m[1];
}

function main(){
  const scriptVer = extractScriptVersion();
  const htmlVer = extractIndexQuery();
  if(scriptVer !== htmlVer){
    fail(`Version mismatch: script=${scriptVer} index=${htmlVer}`);
  }
  console.log('[verify-popup-version] OK version', scriptVer);
}

main();
