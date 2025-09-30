#!/usr/bin/env node
// Simple connectivity / env doctor for the email assistant
const http = require('http');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const token = process.env.ADMIN_TOKEN || process.env.ADMIN_API_TOKEN;

function log(label, value){
  process.stdout.write(label.padEnd(18)+': '+value+'\n');
}

log('Node version', process.version);
log('Working dir', process.cwd());
log('PORT', PORT);
log('Has ADMIN_TOKEN', token? (token.length+ ' chars') : 'NO');

function request(p){
  return new Promise((resolve)=>{
    const req = http.request({ host:'127.0.0.1', port:PORT, path:p, timeout:1500 }, res=>{
      const chunks=[]; res.on('data',d=>chunks.push(d)); res.on('end',()=>{
        resolve({ status:res.statusCode, body:Buffer.concat(chunks).toString('utf8') });
      });
    });
    req.on('error', e=> resolve({ error:e.message }));
    req.end();
  });
}

(async()=>{
  const ping = await request('/api/ping');
  if(ping.error){ log('Ping', 'FAIL '+ping.error); process.exit(1); }
  log('Ping', 'OK '+ping.status);

  if(!token){ log('Auth check', 'Skipped (no token in env)'); return; }
  const auth = await new Promise((resolve)=>{
    const req = http.request({ host:'127.0.0.1', port:PORT, path:'/api/admin/auth/check', timeout:2000, headers:{ Authorization:'Bearer '+token } }, res=>{
      const chunks=[]; res.on('data',d=>chunks.push(d)); res.on('end',()=> resolve({ status:res.statusCode, body: Buffer.concat(chunks).toString('utf8') })); });
    req.on('error', e=> resolve({ error:e.message })); req.end(); });
  if(auth.error){ log('Auth check', 'FAIL '+auth.error); }
  else log('Auth check', 'Status '+auth.status);
})();
