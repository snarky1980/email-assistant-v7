const fs = require('fs');

const LOG_FILE = process.env.LOG_FILE || 'server.log';
const JSON_LOG = process.env.JSON_LOG === '1';

function write(line){
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch(_) { /* ignore */ }
}

function log(level, msg, meta){
  const time = new Date().toISOString();
  if(JSON_LOG){
    const line = JSON.stringify({ time, level, msg, ...meta });
    console.log(line);
    write(line);
  } else {
    const flat = '['+time+'] '+level+' '+msg + (meta? ' '+Object.entries(meta).map(([k,v])=>k+'='+JSON.stringify(v)).join(' '):'');
    console.log(flat);
    write(flat);
  }
}

module.exports = { log };
