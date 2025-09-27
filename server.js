const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// --- Configuration ---
const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const LOG_FILE = process.env.LOG_FILE || 'server.log';
const ENABLE_HEARTBEAT = process.env.HEARTBEAT !== '0'; // default on
const ENABLE_SELF_PING = process.env.SELF_PING === '1'; // opt‑in (could create extra noise)
const LOG_REQUESTS = process.env.LOG_REQUESTS === '1';
const ENABLE_CORS = process.env.ENABLE_CORS === '1';

function log(...args){
  const line = `[${new Date().toISOString()}] ${args.join(' ')}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch(_) { /* ignore */ }
}

if (!OPENAI_KEY) {
  log('WARN','OPENAI_API_KEY is not set; /api/openai will return 500 until configured. Create a .env file (see .env.example) with OPENAI_API_KEY=your_key');
}

// Optional CORS (only if explicitly enabled)
if (ENABLE_CORS) {
  app.use((req,res,next)=>{
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  log('INFO','CORS enabled (Access-Control-Allow-Origin: *)');
}

app.use(express.json({ limit: '1mb' }));
app.use((req,res,next)=>{ res.setHeader('X-App-Server','email-assistant-v6'); next(); });
// Smart cache headers: HTML no-store, hashed assets long cache
app.use((req,res,next)=>{
  const p = req.path;
  if (p === '/' || p.endsWith('.html')) {
    res.setHeader('Cache-Control','no-store, must-revalidate');
  } else if (/\.(?:js|css|woff2?|png|jpg|jpeg|gif|svg)$/i.test(p)) {
    // If filename seems hashed (simple heuristic: has a dash and alphanum block)
    if (/[A-Za-z0-9_-]{6,}\.(js|css)$/i.test(p)) {
      res.setHeader('Cache-Control','public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control','public, max-age=3600');
    }
  }
  next();
});
app.use(express.static(path.join(__dirname), { extensions:['html'] }));

// Lightweight request logger (opt-in)
if (LOG_REQUESTS) {
  app.use((req,res,next)=>{
    const start = Date.now();
    res.on('finish', ()=>{
      log('REQ', req.method, req.originalUrl, res.statusCode, (Date.now()-start)+'ms', 'UA='+(req.headers['user-agent']||'n/a')); 
    });
    next();
  });
}

// Basic health endpoint
app.get('/api/ping', (req,res)=>{ res.json({ ok:true, time: Date.now(), pid: process.pid }); });
app.get('/api/diag', (req,res)=>{
  res.json({
    ok:true,
    time:new Date().toISOString(),
    pid:process.pid,
    node:process.version,
    memory:process.memoryUsage(),
    env:{ PORT, HOST, HEARTBEAT: ENABLE_HEARTBEAT, SELF_PING: ENABLE_SELF_PING, LOG_REQUESTS },
    cwd:process.cwd()
  });
});

app.post('/api/openai', async (req, res) => {
  if (!OPENAI_KEY) return res.status(500).json({ error: 'Server missing OPENAI_API_KEY' });
  const { prompt, feature } = req.body || {};
  if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'Missing prompt' });
  try {
    log('PROMPT_LEN', feature||'generic', 'chars='+prompt.length);
    const messages = [{ role: 'user', content: prompt }];
    const body = { model: 'gpt-3.5-turbo', messages, max_tokens: 800 }; // simple forward
    const started = Date.now();
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify(body)
    });
    const data = await resp.json();
    const ms = Date.now() - started;
    let result = data?.choices?.[0]?.message?.content;
    if (!result && Array.isArray(data?.choices)) {
      const agg = data.choices.map(c=> c?.message?.content).filter(Boolean);
      if (agg.length) result = agg.join('\n\n');
    }
    res.json({ result, latencyMs: ms, feature, usage: data?.usage, error: data.error?.message });
    log('OPENAI', feature || 'generic', ms+'ms', result ? 'ok' : 'empty');
  } catch (err) {
    log('ERROR','/api/openai', err.message);
    res.status(500).json({ error: String(err) });
  }
});

// --- Error & resilience handlers ---
process.on('unhandledRejection', (reason)=>{ log('UNHANDLED_REJECTION', reason && reason.stack || reason); });
process.on('uncaughtException', (err)=>{ log('UNCAUGHT_EXCEPTION', err.stack || err); });
process.on('SIGTERM', ()=>{ log('SIGTERM received, shutting down'); process.exit(0); });
process.on('SIGINT', ()=>{ log('SIGINT received, shutting down'); process.exit(0); });

if (ENABLE_HEARTBEAT) {
  setInterval(()=>{ log('HEARTBEAT', 'alive pid='+process.pid); }, 60_000).unref();
}

if (ENABLE_SELF_PING) {
  const http = require('http');
  setInterval(()=>{
    http.get({ host: '127.0.0.1', port: PORT, path: '/api/ping', timeout: 2000 }, res=>{
      // drain
      res.resume();
    }).on('error', e=> log('SELF_PING_FAIL', e.message));
  }, 120_000).unref();
}

const server = app.listen(PORT, HOST, () => {
  log('START','Listening', `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
});

server.on('error', (err) => {
  log('FATAL_LISTEN_ERROR', err.code || '', err.message);
  process.exit(1);
});

// Safety: keep event loop busy if nothing else (should not be needed but prevents premature exit in some edge tool contexts)
setInterval(()=>{}, 3600_000).unref();

// 404 fallback (after static & API routes)
app.use((req,res)=>{
  res.status(404).send('Not Found: '+req.originalUrl);
});
