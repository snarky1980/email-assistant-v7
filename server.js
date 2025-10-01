const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
// New modular utilities
const { extractVariables } = require('./lib/variables');
const { readJsonArray, writeJsonArray, readTokenStore, writeTokenStore, genToken, hashToken, constantTimeEquals } = require('./lib/storage');
const { log } = require('./lib/logger');
require('dotenv').config();

// --- Configuration ---
const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || process.env.ADMIN_API_TOKEN || null; // primary admin token
const ADMIN_TOKEN_2 = process.env.ADMIN_TOKEN_2 || null; // optional secondary token (rotation)
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const TPL_FILE = path.join(DATA_DIR, 'templates.json');
const CAT_FILE = path.join(DATA_DIR, 'categories.json');
const TOK_FILE = path.join(DATA_DIR, 'admin_tokens.json');
// LOG_FILE now handled by logger module (env LOG_FILE)
const ENABLE_HEARTBEAT = process.env.HEARTBEAT !== '0'; // default on
const ENABLE_SELF_PING = process.env.SELF_PING === '1'; // opt‑in (could create extra noise)
const LOG_REQUESTS = process.env.LOG_REQUESTS === '1';
const ENABLE_CORS = process.env.ENABLE_CORS === '1';
const PUBLIC_TEMPLATES = process.env.PUBLIC_TEMPLATES === '1'; // if enabled, exposes read-only public template list

// Precompute index.html fingerprint for cache/version diagnostics
const INDEX_PATH = path.join(__dirname,'index.html');
let INDEX_SHA = 'na';
let BUILD_MARKER = null;
try {
  const htmlBuf = fs.readFileSync(INDEX_PATH, 'utf8');
  INDEX_SHA = crypto.createHash('sha256').update(htmlBuf).digest('hex').slice(0,16);
  const m = htmlBuf.match(/<!--\s*build-marker:\s*([^>]+?)-->/i);
  if(m) BUILD_MARKER = m[1].trim();
} catch(_){}
const SERVER_START_ISO = new Date().toISOString();

if (!OPENAI_KEY) {
  log('warn','OPENAI_API_KEY missing',{ hint:'Set in environment for /api/openai'});
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
  log('info','CORS enabled',{ origin:'*' });
}

app.use(express.json({ limit: '1mb' }));

// Basic request id + timing
app.use((req,res,next)=>{
  req.id = req.headers['x-request-id'] || Math.random().toString(36).slice(2,10);
  const start = Date.now();
  res.setHeader('X-Request-Id', req.id);
  res.on('finish', ()=>{
    if(LOG_REQUESTS){
      log('req',{ id:req.id, method:req.method, url:req.originalUrl, status:res.statusCode, ms:Date.now()-start });
    }
  });
  next();
});

// Security headers (baseline; CSP kept permissive due to inline admin HTML)
app.use((req,res,next)=>{
  res.setHeader('X-Frame-Options','SAMEORIGIN');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Permissions-Policy','interest-cohort=()');
  // TODO tighten CSP by moving inline admin HTML to external file
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'");
  if(process.env.FORCE_HTTPS==='1' && req.headers['x-forwarded-proto']!=='https'){
    // Optionally redirect to https when behind proxy
    return res.redirect(301, 'https://'+req.headers.host+req.originalUrl);
  }
  // HSTS only if explicitly enabled (avoid local dev issues)
  if(process.env.HSTS==='1'){
    res.setHeader('Strict-Transport-Security','max-age=63072000; includeSubDomains; preload');
  }
  next();
});

// Simple in-memory rate limiter (per IP) — NOT suitable for multi-instance clustering
const RL_WINDOW_MS = 60_000;
const RL_MAX = parseInt(process.env.RATE_LIMIT_MAX || '120', 10); // default 120 req/min
const rlStore = new Map();
app.use((req,res,next)=>{
  // Skip static assets & health endpoints for rate limiting
  if(/\.(?:js|css|png|jpg|jpeg|svg|ico)$/.test(req.path) || req.path==='/api/ping' || req.path==='/api/health') return next();
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  let entry = rlStore.get(ip);
  if(!entry || now - entry.start > RL_WINDOW_MS){ entry = { start: now, count: 0 }; rlStore.set(ip, entry); }
  entry.count++;
  if(entry.count > RL_MAX){
    res.setHeader('Retry-After', Math.ceil((entry.start + RL_WINDOW_MS - now)/1000));
    return res.status(429).json({ error: 'rate_limited', retryAfterMs: (entry.start + RL_WINDOW_MS - now) });
  }
  next();
});
app.use((req,res,next)=>{ 
  // Updated identifier to reflect repository version
  res.setHeader('X-App-Server','email-assistant-v7'); 
  res.setHeader('X-App-Index-Sha', INDEX_SHA); 
  if(BUILD_MARKER){
    res.setHeader('X-Build-Marker', BUILD_MARKER);
    const parts = BUILD_MARKER.split(/\s+/);
    const maybeHash = parts[parts.length-1];
    if(/^[0-9a-f]{4,12}$/i.test(maybeHash)) res.setHeader('X-Revision', maybeHash);
  }
  next(); 
});
// Smart cache headers: HTML no-store, hashed assets long cache
app.use((req,res,next)=>{
  const p = req.path;
  if(p === '/favicon.ico') {
    res.setHeader('Cache-Control','no-store, must-revalidate');
  }
  // Always serve the popup integration script fresh (iterated frequently during UX polishing)
  if(p === '/assets/var-popup-integrated.js'){
    res.setHeader('Cache-Control','no-store, must-revalidate');
    res.setHeader('X-Popup-NoCache','1');
  }
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
      log('req_detail',{ method:req.method, url:req.originalUrl, status:res.statusCode, ms:Date.now()-start, ua:(req.headers['user-agent']||'n/a') }); 
    });
    next();
  });
}

// Basic health endpoint
app.get('/api/ping', (req,res)=>{ res.json({ ok:true, time: Date.now(), pid: process.pid }); });
// Lightweight unauthenticated liveness + counts (does not expose sensitive data)
app.get('/api/health', (req,res)=>{
  let templateCount = 0, categoryCount = 0;
  try { templateCount = readJsonArray(TPL_FILE).filter(t=> !t.deletedAt).length; } catch(_){}
  try { categoryCount = readJsonArray(CAT_FILE).length; } catch(_){}
  res.json({ ok:true, uptimeSec: Math.round(process.uptime()), templates: templateCount, categories: categoryCount, version: require('./package.json').version });
});
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

// Version / fingerprint endpoint to help confirm user sees latest deployment
app.get('/api/version', (req,res)=>{
  let title=null, marker=BUILD_MARKER;
  try {
    const html = fs.readFileSync(INDEX_PATH,'utf8');
    const m = html.match(/<title>([^<]*)<\/title>/i); if(m) title = m[1];
    if(!marker){ const mm = html.match(/<!--\s*build-marker:\s*([^>]+?)-->/i); if(mm) marker = mm[1].trim(); }
  } catch(_){ }
  res.json({
    ok:true,
    indexSha: INDEX_SHA,
    buildMarker: marker,
    title,
    serverStartedAt: SERVER_START_ISO,
    pid: process.pid,
    version: require('./package.json').version
  });
});

app.post('/api/openai', async (req, res) => {
  if (!OPENAI_KEY) return res.status(500).json({ error: 'Server missing OPENAI_API_KEY' });
  const { prompt, feature } = req.body || {};
  if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'Missing prompt' });
  try {
  log('openai_prompt',{ feature: feature||'generic', chars: prompt.length });
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
    log('openai_resp',{ feature: feature||'generic', ms, hasResult: !!result });
  } catch (err) {
    log('error','openai_call_failed',{ error: err.message });
    res.status(500).json({ error: String(err) });
  }
});

// --- Admin Studio (Sprint 1) ---
// Simple file-backed storage. Not for high concurrency; sufficient for local / small-scale use.
function ensureDataFiles(){
  try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR); } catch(e){}
  for (const f of [TPL_FILE,CAT_FILE]){
    try { if (!fs.existsSync(f)) fs.writeFileSync(f,'[]','utf8'); } catch(e){}
  }
  if(!fs.existsSync(TOK_FILE)){
    const now=new Date().toISOString();
    const seed=[];
    if(ADMIN_TOKEN) seed.push({ id:'seed_primary', hash:hashToken(ADMIN_TOKEN), role:'admin', label:'Primary (env)', source:'env', createdAt:now, lastUsedAt:null });
    if(ADMIN_TOKEN_2) seed.push({ id:'seed_secondary', hash:hashToken(ADMIN_TOKEN_2), role:'admin', label:'Secondary (env)', source:'env', createdAt:now, lastUsedAt:null });
    try { fs.writeFileSync(TOK_FILE, JSON.stringify({ tokens:seed, updatedAt:now }, null, 2)); } catch(e){}
  }
}
ensureDataFiles();

// (Storage helpers now imported from ./lib/storage)

// Ensure env tokens always present in token store (in case file was created earlier then env changed)
function loadTokenStore(){
  const store = readTokenStore(TOK_FILE);
  let changed=false;
  for(const t of store.tokens){
    if(!t.hash && t.token){
      // migrate legacy plaintext token -> hashed
      t.hash = hashToken(t.token);
      t.legacy = true; // mark legacy; reveal still possible once
      changed=true;
    }
  }
  if(changed) writeTokenStore(TOK_FILE, store);
  return store;
}
function syncEnvTokensIntoStore(){
  const store = loadTokenStore();
  const envHashes = new Set([ADMIN_TOKEN && hashToken(ADMIN_TOKEN), ADMIN_TOKEN_2 && hashToken(ADMIN_TOKEN_2)].filter(Boolean));
  const existingHashes = new Set(store.tokens.map(t=> t.hash));
  const now=new Date().toISOString();
  if(ADMIN_TOKEN && !existingHashes.has(hashToken(ADMIN_TOKEN))){
    store.tokens.push({ id:'seed_primary', hash:hashToken(ADMIN_TOKEN), role:'admin', label:'Primary (env)', source:'env', createdAt:now, lastUsedAt:null });
  }
  if(ADMIN_TOKEN_2 && !existingHashes.has(hashToken(ADMIN_TOKEN_2))){
    store.tokens.push({ id:'seed_secondary', hash:hashToken(ADMIN_TOKEN_2), role:'admin', label:'Secondary (env)', source:'env', createdAt:now, lastUsedAt:null });
  }
  // Remove env tokens no longer present (optional: keep - we keep for stability)
  writeTokenStore(TOK_FILE, store);
}
syncEnvTokensIntoStore();

function adminAuth(req,res,next){
  if(!fs.existsSync(TOK_FILE) && !ADMIN_TOKEN && !ADMIN_TOKEN_2){
    return res.status(500).json({ error:'ADMIN_TOKEN not configured on server' });
  }
  const hdr = req.headers['authorization'] || '';
  if(!hdr.startsWith('Bearer ')) return res.status(401).json({ error:'Unauthorized' });
  const incoming = hdr.slice(7);
  const store = loadTokenStore();
  const inHash = hashToken(incoming);
  const entry = store.tokens.find(t=> (t.hash && constantTimeEquals(t.hash, inHash)) || (t.token && t.token===incoming));
  if(!entry) return res.status(401).json({ error:'Unauthorized' });
  entry.lastUsedAt = new Date().toISOString();
  try { writeTokenStore(TOK_FILE, store); } catch(_){ }
  req.authRole = entry.role || 'admin';
  req.authTokenId = entry.id;
  req.authTokenSource = entry.source;
  next();
}

function requireAdmin(req,res,next){ if(req.authRole!=='admin') return res.status(403).json({ error:'forbidden' }); next(); }

// Utility: basic ID generator (timestamp + random)
function genId(prefix){ return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`; }

// Categories CRUD
app.get('/api/admin/categories', adminAuth, (req,res)=>{
  res.json(readJsonArray(CAT_FILE));
});
app.post('/api/admin/categories', adminAuth, (req,res)=>{
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const cats = readJsonArray(CAT_FILE);
  if (cats.some(c=> c.name.toLowerCase() === name.toLowerCase())) return res.status(409).json({ error: 'duplicate name' });
  const cat = { id: genId('cat'), name, createdAt: new Date().toISOString() };
  cats.push(cat); writeJsonArray(CAT_FILE, cats);
  res.json(cat);
});
app.put('/api/admin/categories/:id', adminAuth, (req,res)=>{
  const { id } = req.params; const { name } = req.body || {};
  const cats = readJsonArray(CAT_FILE);
  const idx = cats.findIndex(c=> c.id === id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  if (name) cats[idx].name = name;
  cats[idx].updatedAt = new Date().toISOString();
  writeJsonArray(CAT_FILE, cats);
  res.json(cats[idx]);
});
app.delete('/api/admin/categories/:id', adminAuth, (req,res)=>{
  const { id } = req.params;
  let cats = readJsonArray(CAT_FILE);
  const before = cats.length;
  cats = cats.filter(c=> c.id !== id);
  if (cats.length === before) return res.status(404).json({ error: 'not found' });
  writeJsonArray(CAT_FILE, cats);
  res.json({ ok:true });
});

// Templates CRUD
// Template shape: { id, name, categoryId|null, body, variables:[{name, description?, sample?}], createdAt, updatedAt, deletedAt? }
app.get('/api/admin/templates', adminAuth, (req,res)=>{
  let list = readJsonArray(TPL_FILE);
  const includeAll = (req.query.all==='1'||req.query.all==='true');
  if(!includeAll) list = list.filter(t=> !t.deletedAt);
  res.json(list);
});
app.get('/api/admin/templates/:id', adminAuth, (req,res)=>{
  const { id } = req.params; const list = readJsonArray(TPL_FILE); const t = list.find(x=> x.id === id);
  if (!t) return res.status(404).json({ error: 'not found' });
  res.json(t);
});
app.post('/api/admin/templates', adminAuth, (req,res)=>{
  const { name, categoryId=null, body='', variables=[] } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const list = readJsonArray(TPL_FILE);
  if (list.some(t=> t.name.toLowerCase() === name.toLowerCase())) return res.status(409).json({ error:'duplicate name' });
  const tpl = { id: genId('tpl'), name, categoryId, body, variables, createdAt: new Date().toISOString() };
  list.push(tpl); writeJsonArray(TPL_FILE, list);
  res.json(tpl);
});
app.put('/api/admin/templates/:id', adminAuth, (req,res)=>{
  const { id } = req.params; const { name, categoryId, body, variables } = req.body || {};
  const list = readJsonArray(TPL_FILE);
  const idx = list.findIndex(t=> t.id === id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  if (name) list[idx].name = name;
  if (typeof categoryId !== 'undefined') list[idx].categoryId = categoryId;
  if (typeof body === 'string') list[idx].body = body;
  if (Array.isArray(variables)) list[idx].variables = variables;
  list[idx].updatedAt = new Date().toISOString();
  writeJsonArray(TPL_FILE, list);
  res.json(list[idx]);
});
app.delete('/api/admin/templates/:id', adminAuth, (req,res)=>{
  const { id } = req.params; const list = readJsonArray(TPL_FILE); const t = list.find(x=>x.id===id);
  if(!t) return res.status(404).json({ error:'not found' });
  if(!t.deletedAt){ t.deletedAt = new Date().toISOString(); t.updatedAt = t.updatedAt || t.createdAt; writeJsonArray(TPL_FILE, list); }
  res.json({ ok:true, archived:true });
});
app.post('/api/admin/templates/:id/restore', adminAuth, (req,res)=>{
  const { id } = req.params; const list = readJsonArray(TPL_FILE); const t = list.find(x=>x.id===id);
  if(!t) return res.status(404).json({ error:'not found' });
  if(t.deletedAt){ delete t.deletedAt; t.updatedAt = new Date().toISOString(); writeJsonArray(TPL_FILE, list); }
  res.json({ ok:true, restored:true });
});

// Basic export (all) and import endpoints
app.get('/api/admin/export', adminAuth, (req,res)=>{
  const templates = readJsonArray(TPL_FILE);
  const categories = readJsonArray(CAT_FILE);
  res.json({ exportedAt: new Date().toISOString(), version:1, categories, templates });
});
app.post('/api/admin/import', adminAuth, (req,res)=>{
  const { categories=[], templates=[] } = req.body || {};
  if (!Array.isArray(categories) || !Array.isArray(templates)) return res.status(400).json({ error: 'categories/templates must be arrays' });
  const existingCats = readJsonArray(CAT_FILE);
  const existingTpls = readJsonArray(TPL_FILE);
  const catIds = new Set(existingCats.map(c=>c.id));
  for (const c of categories){ if (!catIds.has(c.id)) existingCats.push(c); }
  const tplIds = new Set(existingTpls.map(t=>t.id));
  for (const t of templates){ if (!tplIds.has(t.id)) existingTpls.push(t); }
  writeJsonArray(CAT_FILE, existingCats);
  writeJsonArray(TPL_FILE, existingTpls);
  res.json({ ok:true, categories: existingCats.length, templates: existingTpls.length });
});

// --- Auth Token Management Endpoints (admin only) ---
app.get('/api/admin/auth/tokens', adminAuth, requireAdmin, (req,res)=>{
  const store = loadTokenStore();
  res.json({ tokens: store.tokens.map(t=> ({ id:t.id, role:t.role, label:t.label, source:t.source, createdAt:t.createdAt, lastUsedAt:t.lastUsedAt, legacy: !!t.legacy })) });
});
// Lightweight auth check / diagnostics
app.get('/api/admin/auth/check', adminAuth, (req,res)=>{
  res.json({ ok:true, role:req.authRole, tokenId:req.authTokenId, source:req.authTokenSource, time:new Date().toISOString() });
});
app.post('/api/admin/auth/tokens', adminAuth, requireAdmin, (req,res)=>{
  const { role='admin', label=null } = req.body || {};
  if(!['admin','read'].includes(role)) return res.status(400).json({ error:'invalid role' });
  const store = loadTokenStore();
  const plain = genToken();
  const tok = { id: genId('tok'), hash: hashToken(plain), role, label, source:'generated', createdAt:new Date().toISOString(), lastUsedAt:null };
  store.tokens.push(tok); writeTokenStore(TOK_FILE, store);
  res.json({ id: tok.id, token: plain, role: tok.role, label: tok.label });
});
app.post('/api/admin/auth/tokens/:id/reveal', adminAuth, requireAdmin, (req,res)=>{
  const store = loadTokenStore(); const t = store.tokens.find(x=> x.id===req.params.id); if(!t) return res.status(404).json({ error:'not found' });
  if(!t.token) return res.status(400).json({ error:'unrevealable' }); // hashed only
  res.json({ id:t.id, token:t.token, role:t.role, label:t.label, legacy: !!t.legacy });
});
app.post('/api/admin/auth/tokens/:id/rotate', adminAuth, requireAdmin, (req,res)=>{
  const store = loadTokenStore(); const t = store.tokens.find(x=> x.id===req.params.id); if(!t) return res.status(404).json({ error:'not found' });
  if(t.source==='env') return res.status(400).json({ error:'cannot rotate env token (change env var instead)' });
  const newPlain = genToken();
  const oldTokenEndsWith = t.token ? t.token.slice(-6) : null;
  t.hash = hashToken(newPlain);
  delete t.token; // remove plaintext
  t.legacy = false;
  t.lastUsedAt=null;
  writeTokenStore(TOK_FILE, store);
  res.json({ id:t.id, newToken:newPlain, oldTokenEndsWith });
});
app.delete('/api/admin/auth/tokens/:id', adminAuth, requireAdmin, (req,res)=>{
  const store = loadTokenStore(); const idx = store.tokens.findIndex(x=> x.id===req.params.id); if(idx===-1) return res.status(404).json({ error:'not found' });
  if(store.tokens[idx].source==='env') return res.status(400).json({ error:'cannot delete env token' });
  store.tokens.splice(idx,1); writeTokenStore(TOK_FILE, store); res.json({ ok:true });
});

// (extractVariables now imported from ./lib/variables)
app.post('/api/admin/variables/extract', adminAuth, (req,res)=>{
  const { body='' } = req.body || {};
  res.json({ variables: extractVariables(body) });
});

// Public (unauthenticated) template listing (sanitized) if enabled
if (PUBLIC_TEMPLATES) {
  app.get('/api/templates-public', (req,res)=>{
    try {
      const list = readJsonArray(TPL_FILE).filter(t=> !t.deletedAt).map(t=> ({
        id: t.id,
        name: t.name,
        body: t.body,
        variables: (t.variables||[]).map(v=> ({ name:v.name, sample: v.sample })),
        updatedAt: t.updatedAt || t.createdAt
      }));
      res.json({ templates: list, count: list.length, generatedAt: new Date().toISOString() });
    } catch(e){ res.status(500).json({ error:'failed' }); }
  });
}

// Minimal helper front-end (static HTML) for quick manual testing (non-production UI)
app.get('/admin', (req,res)=>{
  if (!fs.existsSync(TOK_FILE) && !ADMIN_TOKEN && !ADMIN_TOKEN_2) return res.status(500).send('<h1>Admin disabled</h1><p>Set ADMIN_TOKEN in env.</p>');
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end(`<!DOCTYPE html><html><head><title>Admin Studio</title><meta charset="utf-8"/>
  <link rel="icon" type="image/svg+xml" href="https://github.githubassets.com/favicons/favicon.svg" />
  <link rel="icon" type="image/png" sizes="32x32" href="https://github.githubassets.com/favicons/favicon.png" />
  <link rel="apple-touch-icon" href="https://github.githubassets.com/favicons/apple-touch-icon.png" />
  <meta property="og:title" content="Admin Studio" />
  <meta property="og:image" content="https://github.githubassets.com/images/modules/open_graph/github-mark.png" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:image" content="https://github.githubassets.com/images/modules/open_graph/github-mark.png" />
  <style>
  :root{--bg:#f6f8fa;--panel:#ffffff;--border:#d0d7de;--accent:#2563eb;--accent-hover:#1d4ed8;--accent-soft:#e0efff;--danger:#dc2626;--danger-bg:#fee2e2;--radius:10px;--text:#0f172a;--muted:#64748b;--green:#15803d;--green-bg:#dcfce7;}
  *{box-sizing:border-box;font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;}
  body{margin:0;background:linear-gradient(135deg,#f0f4f8,#f7fafc);color:var(--text);} h1{margin:0 0 14px;font-size:20px;letter-spacing:.5px;}
  header.top{background:var(--panel);padding:14px 22px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;box-shadow:0 2px 4px -2px #0f172a1a;position:sticky;top:0;z-index:20;}
  .badge{background:var(--accent-soft);color:var(--accent);font-size:10px;padding:2px 8px;border-radius:20px;font-weight:600;letter-spacing:.5px;margin-left:10px;}
  #status{font-size:12px;color:var(--muted);min-height:18px;margin-top:4px;}
  main{padding:20px;display:flex;gap:26px;align-items:flex-start;flex-wrap:wrap;}
  .panel{background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);padding:18px 18px 20px;flex:1;min-width:320px;box-shadow:0 4px 14px -6px #0f172a20,0 2px 4px -2px #0f172a14;position:relative;}
  h2{margin:0 0 12px;font-size:15px;letter-spacing:.4px;display:flex;align-items:center;gap:8px;}
  textarea{width:100%;height:150px;resize:vertical;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font:13px/1.4 system-ui,Segoe UI,Roboto,Arial;box-shadow:inset 0 1px 2px #0f172a10;background:#fff;}
  textarea:focus,input:focus,select:focus{outline:2px solid var(--accent);outline-offset:2px;border-color:var(--accent);} input[type=text],select{width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;background:#fff;}
  table{border-collapse:separate;border-spacing:0;width:100%;margin-top:10px;font-size:12px;}
  th,td{border:1px solid var(--border);padding:6px 8px;vertical-align:top;background:#fff;}
  th{background:#f1f5f9;font-weight:600;letter-spacing:.3px;text-align:left;}
  tr.archived td{opacity:.55;background:#fafafa;}
  button{cursor:pointer;border:1px solid var(--border);background:#f8fafc;color:#0f172a;font-size:12px;font-weight:600;padding:6px 12px;border-radius:8px;letter-spacing:.3px;display:inline-flex;align-items:center;gap:4px;transition:.18s background,.18s color,.18s border-color;}
  button.primary{background:var(--accent);color:#fff;border-color:var(--accent);} button.primary:hover{background:var(--accent-hover);} button.danger{background:var(--danger-bg);border-color:var(--danger);color:#b91c1c;} button.danger:hover{background:#fecaca;}
  button.soft{background:#f1f5f9;} button.soft:hover{background:#e2e8f0;}
  .toolbar{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 10px;align-items:center;}
  #varList{max-height:210px;overflow:auto;display:flex;flex-direction:column;gap:4px;margin-top:6px;}
  .var-row{display:grid;grid-template-columns:120px 1fr 120px 34px;gap:6px;align-items:center;}
  .var-row input{padding:4px 6px;font-size:11px;border:1px solid var(--border);border-radius:6px;}
  .pill{background:#e2e8f0;padding:2px 6px;font-size:10px;border-radius:14px;}
  .tag{display:inline-block;background:#eef6ff;color:#0369a1;padding:2px 6px;margin:2px 2px 0 0;border-radius:5px;font-size:10px;font-weight:600;letter-spacing:.3px;}
  #preview{white-space:pre-wrap;border:1px solid var(--border);background:#fff;border-radius:8px;padding:8px 10px;font-size:12px;margin-top:10px;max-height:200px;overflow:auto;box-shadow:inset 0 1px 2px #0f172a0d;}
  .small{font-size:11px;color:var(--muted);margin-top:6px;}
  .invalid-var{background:#fef2f2 !important;color:#b91c1c !important;}
  .hint{font-size:11px;color:var(--muted);}
  .flex{display:flex;align-items:center;gap:8px;}
  .space-between{display:flex;justify-content:space-between;align-items:center;}
  .fade{opacity:.6;}
  .float-btns{position:absolute;top:10px;right:10px;display:flex;gap:6px;}
  kbd{background:#fff;border:1px solid var(--border);padding:2px 6px;border-radius:6px;font-size:10px;box-shadow:0 1px 0 #0f172a10;}
  .status-ok{color:var(--green);} .status-err{color:var(--danger);} .status-warn{color:#b45309;}
  </style></head><body>
  <header class="top"><div class="flex"><h1>Admin Studio<span class="badge">v3+</span></h1></div><div class="hint">Shortcuts: <kbd>⌘/Ctrl+S</kbd> save · <kbd>/</kbd> search · <kbd>Esc</kbd> cancel · <kbd>⇧+⌘/Ctrl+C</kbd> copy body · <a href="#" onclick="openTokenPanel();return false;">Change token</a></div></header>
  <div style="padding:0 22px 4px"><div id=status>Loading...</div></div>
  <main>
    <section class="panel" id="panel-cats">
      <div class="space-between"><h2>Categories</h2><div class=float-btns><button class="soft" onclick="refresh()" title="Refresh">↻</button></div></div>
      <form id=catForm onsubmit="createCat(event)" class=flex style="gap:6px;flex-wrap:wrap;">
        <input name=name placeholder='New category' required style="flex:1;min-width:160px;" />
        <button class=primary>Add</button>
      </form>
      <table id=catTable><thead><tr><th style="width:60%">Name</th><th>Actions</th></tr></thead><tbody></tbody></table>
    </section>
    <section class="panel" id="panel-templates">
      <div class="space-between"><h2>Templates</h2><div class=float-btns><button class="soft" onclick="refresh()" title="Refresh">↻</button></div></div>
      <div class=toolbar>
        <input id=searchTpl placeholder='Search (name/body)' style='flex:1;min-width:160px;'>
        <select id=sortTpl>
          <option value="name">Name</option>
          <option value="createdAt">Created</option>
          <option value="updatedAt">Updated</option>
        </select>
        <label class=flex style='font-size:11px;'><input type=checkbox id=showArchived> Archived</label>
        <button type=button class=soft onclick="doExport()">Export</button>
        <label style='font-size:11px;'>Import <input type=file id=importFile style='font-size:10px;padding:2px;'></label>
      </div>
      <form id=tplForm onsubmit="saveTpl(event)" style="margin-top:4px;">
        <input type=hidden name=id />
        <input name=name placeholder='Template name' required />
        <div style='display:flex;gap:6px;align-items:center;'>
          <select name=categoryId id=tplCatSel style='flex:1;'><option value="">(no category)</option></select>
          <button type=button class=soft style='white-space:nowrap;' onclick="quickAddCategory()" title='Create new category'>+ Category</button>
        </div>
        <textarea name=body id=tplBody placeholder='Body with {{variables}}'></textarea>
        <div class=flex style='flex-wrap:wrap;gap:6px;margin-top:6px;'>
          <button type=button class=soft onclick="insertVarPlaceholder()" title='Insert a variable placeholder at cursor'>+Placeholder</button>
          <button type=button class=soft onclick="detectVars()">Detect Vars</button>
          <button type=button class=soft onclick="addEmptyVar()">Add Var</button>
          <button type=button class=soft onclick="clearVars()">Clear Vars</button>
          <button type=button class=soft onclick="previewTpl()">Preview</button>
          <button type=button class=soft onclick="insertIntoEditor()">Insert → Editor</button>
          <button type=button class=soft onclick="insertIntoAssistant()">Insert → Assistant</button>
          <button type=button class=soft onclick="duplicateCurrent()">Duplicate</button>
          <button type=button class=soft onclick="copyBody()">Copy Body</button>
        </div>
        <div id=varList></div>
        <div id=preview hidden></div>
        <div style='margin-top:10px;display:flex;gap:10px;'>
          <button id=saveBtn class=primary style="flex:1;">Create</button>
          <button type=button onclick="cancelEdit()" id=cancelBtn style='display:none;' class=soft>Cancel</button>
        </div>
        <div class="small" id="varSummary"></div>
      </form>
  <div class=small>Use &lt;&lt;variable_name&gt;&gt; syntax (ex: &lt;&lt;NuméroProjet&gt;&gt;), then Detect Vars. Unused/unknown variables highlighted. {{legacy}} also still recognized.</div>
      <table id=tplTable><thead><tr><th style="width:24%">Name</th><th style="width:15%">Category</th><th style="width:18%">Vars</th><th style="width:10%">Status</th><th>Actions</th></tr></thead><tbody></tbody></table>
    </section>
  </main>
  <section class="panel" style="margin:20px;max-width:1200px;">
    <h2 style="margin-top:0">Tokens <span class="pill">Auth</span></h2>
    <div class="small">Generate, rotate, reveal and delete tokens. Env-seeded tokens (env) cannot be deleted or rotated here.</div>
    <div style="display:flex;flex-wrap:wrap;gap:16px;margin-top:14px;align-items:flex-start;">
      <form id="newTokenForm" onsubmit="createToken(event)" style="background:#fff;border:1px solid var(--border);padding:12px 14px;border-radius:10px;display:flex;flex-direction:column;gap:8px;min-width:240px;">
        <strong style="font-size:12px;letter-spacing:.5px;">New Token</strong>
        <input name="label" placeholder="Label (optional)" style="font-size:12px;padding:6px 8px;">
        <select name="role" style="font-size:12px;padding:6px 8px;">
          <option value="admin">Admin (full)</option>
          <option value="read">Read-only</option>
        </select>
        <button class="primary" style="font-size:12px;">Generate</button>
      </form>
      <div style="flex:1;min-width:340px;overflow:auto;">
        <table id="tokTable" style="width:100%;border-collapse:separate;border-spacing:0;font-size:12px;">
          <thead><tr><th style="text-align:left;">Label</th><th>Role</th><th>Created</th><th>Last Used</th><th>Actions</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  </section>
  <div id="tokenOverlay" style="position:fixed;inset:0;background:#0f172acc;display:none;align-items:center;justify-content:center;z-index:999;">
    <div style="background:#fff;padding:32px 34px;border-radius:16px;width:min(420px,90%);box-shadow:0 12px 40px -10px #0f172a66;position:relative;">
      <button onclick="closeTokenPanel()" style="position:absolute;top:8px;right:8px;border:none;background:#f1f5f9;border-radius:8px;padding:4px 8px;font-size:12px;cursor:pointer;">✕</button>
      <h2 style="margin-top:0;font-size:18px;">Admin Access</h2>
      <p style="margin:4px 0 14px;font-size:13px;line-height:1.4;color:#475569;">Enter the current admin token. This is stored only in <code>localStorage</code> on this browser.</p>
      <input id="tokenInput" type="password" placeholder="Paste admin token" style="width:100%;padding:10px 12px;font-size:14px;border:1px solid #d0d7de;border-radius:10px;" />
      <div style="display:flex;gap:10px;margin-top:16px;">
        <button class="primary" style="flex:1;" onclick="saveToken()">Use Token</button>
        <button class="soft" type="button" onclick="resetToken()">Reset</button>
      </div>
      <details style="margin-top:18px;font-size:12px;color:#334155;">
        <summary style="cursor:pointer;">Token rotation help</summary>
        <ol style="margin:8px 0 0 18px;padding:0;line-height:1.5;">
          <li>Add <code>ADMIN_TOKEN_2</code> alongside <code>ADMIN_TOKEN</code> on the server.</li>
          <li>Restart server; both tokens now valid.</li>
          <li>Distribute new token to admins; they use Change token.</li>
          <li>Remove old token (move new to <code>ADMIN_TOKEN</code>, unset <code>ADMIN_TOKEN_2</code>), restart.</li>
        </ol>
      </details>
    </div>
  </div>
  <script>
  // --- Boot / Token Modal / Basic Error Guard ---
  let TOKEN = localStorage.getItem('ADMIN_TOKEN_CACHE') || '';
  // URL param bootstrap (?token=XYZ) for first-time access or when UI stuck before modal interaction
  try {
    const usp=new URLSearchParams(location.search);
    const urlTok=usp.get('token');
    if(urlTok && !TOKEN){ TOKEN=urlTok; localStorage.setItem('ADMIN_TOKEN_CACHE',urlTok); history.replaceState({},'',location.pathname); }
  } catch(_){ }
  function openTokenPanel(){ document.getElementById('tokenOverlay').style.display='flex'; setTimeout(()=>document.getElementById('tokenInput').focus(),30); }
  function closeTokenPanel(){ document.getElementById('tokenOverlay').style.display='none'; }
  function resetToken(){ localStorage.removeItem('ADMIN_TOKEN_CACHE'); document.getElementById('tokenInput').value=''; document.getElementById('tokenInput').focus(); }
  function saveToken(){ const v=document.getElementById('tokenInput').value.trim(); if(!v){ alert('Token required'); return; } localStorage.setItem('ADMIN_TOKEN_CACHE',v); closeTokenPanel(); location.reload(); }
  (function initToken(){ if(!TOKEN){ openTokenPanel(); } })();
  document.addEventListener('keydown',e=>{ if(e.key==='t' && (e.metaKey||e.ctrlKey) && !document.getElementById('tokenOverlay').contains(document.activeElement)){ openTokenPanel(); } });
  // Minimal surfaced errors so a blank page isn't silent
  window.addEventListener('error', ev=>{ const st=document.getElementById('status'); if(st) st.textContent='Error: '+ev.message; });
  window.addEventListener('unhandledrejection', ev=>{ const st=document.getElementById('status'); if(st) st.textContent='Promise error: '+(ev.reason&&ev.reason.message||ev.reason); });
  if(!TOKEN){ const st=document.getElementById('status'); if(st) st.innerHTML='First time? 1) In terminal run <code>npm run set-admin-token</code>. 2) Restart server. 3) Paste token above.'; }
  else {
    // Show a subtle progressing message while first fetch occurs
    let dots=0; const st=document.getElementById('status'); const int=setInterval(()=>{ if(!st) return; st.textContent='Loading'+'.'.repeat(dots%4); dots++; if(dots>40) clearInterval(int); },450);
  }
  // --- Existing logic (extended) ---
  async function api(path, opts={}){
    opts.headers = Object.assign({}, opts.headers||{}, { 'Content-Type':'application/json', 'Authorization':'Bearer '+TOKEN });
    const r = await fetch(path, opts);
    if(r.status===401){
      // Invalid/missing token -> open overlay
      if(typeof openTokenPanel==='function') openTokenPanel();
      throw new Error('Unauthorized');
    }
    if(!r.ok){
      let txt=''; try{ txt=await r.text(); }catch(_){}
      throw new Error('API '+r.status+' '+txt);
    }
    if(r.status===204) return null;
    return r.json();
  }
  let cats=[], tpls=[], lastArchivedId=null, undoTimer=null, tokenList=[];
  async function refresh(){
    try {
      cats = await api('/api/admin/categories');
      const all = document.getElementById('showArchived')?.checked ? '?all=1' : '';
      tpls = await api('/api/admin/templates'+all);
      try { const tokMeta = await api('/api/admin/auth/tokens'); tokenList = tokMeta.tokens||[]; drawTokens(); } catch(_){ /* ignore non-admin read tokens */ }
      drawCats(); drawTpls(); document.getElementById('status').textContent='Loaded '+cats.length+' categories, '+tpls.length+' templates';
    } catch(e){ document.getElementById('status').textContent='Load error '+e.message; }
  }

  function drawTokens(){
    const tb=document.querySelector('#tokTable tbody'); if(!tb) return; tb.innerHTML='';
    tokenList.forEach(t=>{
      const tr=document.createElement('tr');
      const pill='<span class="pill" style="background:'+(t.role==='admin'?'#e0efff':'#e2e8f0')+';color:'+(t.role==='admin'?'#0369a1':'#475569')+';">'+t.role+'</span>';
      tr.innerHTML='<td>'+escapeHtml(t.label||'(no label)')+(t.source==='env'?' <span class="pill" title="Env token">env</span>':'')+'</td>'+
        '<td style="text-align:center;">'+pill+'</td>'+
        '<td>'+(t.createdAt? t.createdAt.split('T')[0]:'')+'</td>'+
        '<td>'+(t.lastUsedAt? t.lastUsedAt.split('T')[0]:'—')+'</td>'+
        '<td style="white-space:nowrap;display:flex;flex-wrap:wrap;gap:4px;">'+
          '<button class="soft" onclick="revealToken(\''+t.id+'\')" title="Reveal & copy" '+(t.source==='env'?'':'')+'>Reveal</button>'+
          (t.source!=='env'?'<button class="soft" onclick="rotateToken(\''+t.id+'\')" title="Rotate">Rotate</button>':'')+
          (t.source!=='env'?'<button class="soft" onclick="deleteToken(\''+t.id+'\')" title="Delete">Del</button>':'')+
        '</td>';
      tb.appendChild(tr);
    });
  }
  async function createToken(e){ e.preventDefault(); const fd=new FormData(e.target); const body={ role:fd.get('role'), label:fd.get('label')||null }; const r=await api('/api/admin/auth/tokens',{method:'POST',body:JSON.stringify(body)}); try{ await navigator.clipboard.writeText(r.token); toast('Generated & copied'); }catch(_){ alert('Token: '+r.token); } e.target.reset(); refresh(); }
  async function revealToken(id){ const r=await api('/api/admin/auth/tokens/'+id+'/reveal',{method:'POST'}); try{ await navigator.clipboard.writeText(r.token); toast('Copied'); }catch(_){ alert('Token: '+r.token); } }
  async function rotateToken(id){ const r=await api('/api/admin/auth/tokens/'+id+'/rotate',{method:'POST'}); try{ await navigator.clipboard.writeText(r.newToken); toast('Rotated & copied'); }catch(_){ alert('New token: '+r.newToken); } refresh(); }
  async function deleteToken(id){ if(!confirm('Delete token?')) return; await api('/api/admin/auth/tokens/'+id,{method:'DELETE'}); refresh(); }
  function drawCats(){
    const tb = document.querySelector('#catTable tbody'); tb.innerHTML='';
    document.getElementById('tplCatSel').innerHTML='<option value="">(no category)</option>';
    cats.forEach(c=>{
      const tr=document.createElement('tr');
      tr.innerHTML='<td>'+escapeHtml(c.name)+'</td><td><button onclick="delCat(\''+c.id+'\')">Del</button></td>';
      tb.appendChild(tr);
      const opt=document.createElement('option'); opt.value=c.id; opt.textContent=c.name; document.getElementById('tplCatSel').appendChild(opt);
    });
  }
  function drawTpls(){
    const tb = document.querySelector('#tplTable tbody'); tb.innerHTML='';
    const search = document.getElementById('searchTpl')?.value.trim().toLowerCase();
    const sortVal = document.getElementById('sortTpl')?.value || 'name';
    let list = [...tpls];
    if(search) list = list.filter(t=> t.name.toLowerCase().includes(search) || (t.body||'').toLowerCase().includes(search));
    list.sort((a,b)=>{
      if(sortVal==='name') return a.name.localeCompare(b.name);
      if(sortVal==='createdAt') return (a.createdAt||'').localeCompare(b.createdAt||'');
      if(sortVal==='updatedAt') return (a.updatedAt||a.createdAt||'').localeCompare(b.updatedAt||b.createdAt||'');
      return 0;
    });
    list.forEach(t=>{
      const cat = cats.find(c=>c.id===t.categoryId); const vars=(t.variables||[]).slice(0,4).map(v=>'<span class=tag>'+escapeHtml(v.name)+'</span>').join('') + ((t.variables||[]).length>4?'<span class=tag>+'+((t.variables||[]).length-4)+'</span>':'');
      const tr=document.createElement('tr'); if(t.deletedAt) tr.classList.add('archived');
      tr.innerHTML='<td>'+escapeHtml(t.name)+'</td><td>'+(cat?escapeHtml(cat.name):'')+'</td><td>'+vars+'</td><td>'+(t.deletedAt?'<span class=pill>archived</span>':'')+'</td><td style="white-space:nowrap;display:flex;flex-wrap:wrap;gap:4px;">'+
        (t.deletedAt?'<button class=soft onclick="restoreTpl(\''+t.id+'\')" title="Restore">Restore</button>' :
        '<button class=soft onclick="beginEdit(\''+t.id+'\')" title="Edit">Edit</button><button class=soft onclick="duplicateTpl(\''+t.id+'\')" title="Duplicate">Dup</button><button class=soft onclick="copyTpl(\''+t.id+'\')" title="Copy body">Copy</button><button class=soft onclick="quickInsert(\''+t.id+'\')" title="Insert">Insert</button><button class="soft" onclick="archiveTpl(\''+t.id+'\')" title="Archive">Archive</button>')+
        '</td>';
      tb.appendChild(tr);
    });
  }
  function escapeHtml(s){return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}
  async function createCat(e){e.preventDefault(); const fd=new FormData(e.target); await api('/api/admin/categories',{method:'POST',body:JSON.stringify({name:fd.get('name')})}); e.target.reset(); refresh();}
  async function delCat(id){ if(!confirm('Delete category?'))return; await api('/api/admin/categories/'+id,{method:'DELETE'}); refresh(); }
  async function archiveTpl(id){ if(!confirm('Archive template?'))return; await api('/api/admin/templates/'+id,{method:'DELETE'}); lastArchivedId=id; showUndo(); refresh(); if(document.querySelector('#tplForm [name=id]').value===id) cancelEdit(); }
  async function restoreTpl(id){ await api('/api/admin/templates/'+id+'/restore',{method:'POST'}); refresh(); }
  function quickInsert(id){ const t=tpls.find(x=>x.id===id); if(!t) return; dispatchInsertEvents(t.body||''); }
  function beginEdit(id){
    const t = tpls.find(x=>x.id===id); if(!t) return alert('Not found');
    const f = document.getElementById('tplForm');
    f.id.value = t.id; f.name.value = t.name; f.categoryId.value = t.categoryId || ''; f.body.value = t.body || '';
    setVars((t.variables||[]).map(v=>v.name));
    document.getElementById('saveBtn').textContent='Save';
    document.getElementById('cancelBtn').style.display='inline-block';
  }
  function cancelEdit(){
    const f = document.getElementById('tplForm');
    f.reset(); f.id.value=''; clearVars(); document.getElementById('saveBtn').textContent='Create'; document.getElementById('cancelBtn').style.display='none'; document.getElementById('preview').hidden=true; document.getElementById('preview').textContent='';
  }
  function setVars(list){ const container=document.getElementById('varList'); container.innerHTML=''; list.forEach(v=> addVarRow(v)); }
  function addVarRow(name, desc='', sample=''){
    if(!name) return; name=name.trim(); if(!name) return;
    const existing = Array.from(document.querySelectorAll('#varList .var-row input.var-name')).map(e=>e.value.toLowerCase());
    if(existing.includes(name.toLowerCase())) return;
    const row=document.createElement('div'); row.className='var-row';
    row.innerHTML='<input class="var-name" value="'+escapeHtml(name)+'" placeholder="name"/> <input class="var-desc" value="'+escapeHtml(desc)+'" placeholder="description"/> <input class="var-sample" value="'+escapeHtml(sample)+'" placeholder="sample"/> <button type=button onclick="this.parentElement.remove()">✕</button>';
    document.getElementById('varList').appendChild(row);
  }
  function getVars(){ return Array.from(document.querySelectorAll('#varList .var-row')).map(r=>({ name:r.querySelector('.var-name').value.trim(), description:r.querySelector('.var-desc').value.trim()||undefined, sample:r.querySelector('.var-sample').value.trim()||undefined })).filter(v=>v.name); }
  function clearVars(){ document.getElementById('varList').innerHTML=''; }
  function addEmptyVar(){ addVarRow(''); }
  async function quickAddCategory(){
    const name = prompt('New category name:');
    if(!name) return;
    try {
      await api('/api/admin/categories',{method:'POST',body:JSON.stringify({name})});
      // Refresh categories only (avoid flicker on templates if possible)
      cats = await api('/api/admin/categories');
      drawCats();
      // Select the newly added category in form
      const newly = cats.find(c=> c.name.toLowerCase()===name.toLowerCase());
      if(newly){ document.getElementById('tplCatSel').value=newly.id; }
      document.getElementById('status').textContent='Category added';
      setTimeout(()=>{ const st=document.getElementById('status'); if(st.textContent==='Category added') st.textContent=''; },1800);
    } catch(e){ alert('Create category error '+e.message); }
  }
  async function detectVars(){
    const body = document.getElementById('tplForm').body.value; if(!body) return;
    try {
      const r = await api('/api/admin/variables/extract',{method:'POST',body:JSON.stringify({body})});
      const existing=getVars();
      r.variables.forEach(v=>{ if(!existing.some(e=> e.name.toLowerCase()===v.toLowerCase())) addVarRow(v); });
    } catch(e){ alert('Detect error '+e.message); }
  }
  function insertVarPlaceholder(){
    const ta=document.getElementById('tplBody');
    let name=prompt('Variable name (letters/numbers, accents allowed, no spaces):');
    if(!name) return;
    name=name.trim().replace(/\s+/g,'');
    if(!name) return;
    const syntax='<<'+name+'>>';
    const start=ta.selectionStart||0, end=ta.selectionEnd||0;
    const val=ta.value;
    ta.value = val.slice(0,start)+syntax+val.slice(end);
    ta.selectionStart=ta.selectionEnd=start+syntax.length;
    ta.focus();
    detectVars();
  }
  function previewTpl(){
    const f = document.getElementById('tplForm');
    let text = f.body.value;
    // Substitute both <<Var>> and legacy {{var}} forms
    getVars().forEach(v=>{
      const sample = v.sample || '['+v.name+']';
      const esc = v.name.replace(/[-\\^$*+?.()|[\]{}]/g,'\\$&');
      const reAngled = new RegExp('<<\\s*'+esc+'\\s*>>','g');
      const reCurly  = new RegExp('{{\\s*'+esc+'\\s*}}','g');
      text = text.replace(reAngled, sample).replace(reCurly, sample);
    });
    const box = document.getElementById('preview'); box.hidden=false; box.textContent=text;
    validateVars();
  }
  async function saveTpl(e){
    e.preventDefault(); const f=e.target; const fd=new FormData(f); const payload={name:fd.get('name'),categoryId:fd.get('categoryId')||null,body:fd.get('body'),variables:getVars()};
    const id = fd.get('id');
    if(id){ await api('/api/admin/templates/'+id,{method:'PUT',body:JSON.stringify(payload)}); }
    else { await api('/api/admin/templates',{method:'POST',body:JSON.stringify(payload)}); }
    cancelEdit(); refresh();
    localStorage.setItem('ADMIN_LAST_TEMPLATE_NAME', payload.name);
  }
  function duplicateTpl(id){ const t=tpls.find(x=>x.id===id); if(!t) return; beginEdit(id); const f=document.getElementById('tplForm'); f.id.value=''; document.getElementById('saveBtn').textContent='Create'; f.name.value=t.name+' Copy'; }
  function duplicateCurrent(){ const id=document.getElementById('tplForm').id.value; if(!id) return alert('Not editing'); duplicateTpl(id); }
  async function copyTpl(id){ const t=tpls.find(x=>x.id===id); if(!t) return; await navigator.clipboard.writeText(t.body||''); toast('Copied'); }
  async function copyBody(){ const b=document.getElementById('tplForm').body.value; if(!b) return; await navigator.clipboard.writeText(b); toast('Copied'); }
  function toast(msg){ const st=document.getElementById('status'); st.textContent=msg; setTimeout(()=>{ if(st.textContent===msg) st.textContent=''; },2000); }
  function validateVars(){
    const body=document.getElementById('tplForm').body.value;
    const reAngled=/<<\s*([A-Za-zÀ-ÖØ-öø-ÿ0-9_\.\-]+)\s*>>/g;
    const reCurly=/{{\s*([A-Za-zÀ-ÖØ-öø-ÿ0-9_\.\-]+)\s*}}/g;
    const found=new Set(); let m; while((m=reAngled.exec(body))) found.add(m[1].toLowerCase()); while((m=reCurly.exec(body))) found.add(m[1].toLowerCase());
    const rows=document.querySelectorAll('#varList .var-row'); let unused=0; rows.forEach(r=>{ const n=r.querySelector('.var-name').value.trim(); const used=found.has(n.toLowerCase()); r.classList.toggle('fade', !used && n); if(!used && n) unused++; });
    const unknown=[...found].filter(f=> ![...rows].some(r=> r.querySelector('.var-name').value.trim().toLowerCase()===f));
    document.getElementById('varSummary').innerHTML = (unknown.length?'<span class= status-err>'+unknown.length+' unknown</span> ':'') + (unused?'<span class=status-warn>'+unused+' unused</span> ':'') + '<span class=status-ok>'+found.size+' used</span>';
    highlightUnknownInBody(unknown);
  }
  function highlightUnknownInBody(unknown){ const ta=document.getElementById('tplBody'); if(!unknown.length){ ta.classList.remove('invalid-var'); return; } ta.classList.add('invalid-var'); }
  document.getElementById('tplBody').addEventListener('input', ()=>{ if(!document.getElementById('preview').hidden) previewTpl(); else validateVars(); });
  document.addEventListener('keydown', e=>{
    if((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='s'){ const f=document.getElementById('tplForm'); if(f){ e.preventDefault(); f.requestSubmit(); }}
    if(e.key==='/' && document.activeElement.tagName!=='INPUT' && document.activeElement.tagName!=='TEXTAREA'){ e.preventDefault(); document.getElementById('searchTpl').focus(); }
    if(e.key==='Escape'){ const cancel=document.getElementById('cancelBtn'); if(cancel.style.display!=='none') cancelEdit(); }
    if((e.metaKey||e.ctrlKey) && e.shiftKey && e.key.toLowerCase()==='c'){ // copy body shortcut
      const b=document.getElementById('tplForm')?.body?.value || '';
      if(!b) return;
      e.preventDefault();
      navigator.clipboard.writeText(b).then(()=> toast('Body copied')).catch(()=>{ /* ignore */ });
    }
  });
  // Restore last template focus by name (best effort)
  const lastName=localStorage.getItem('ADMIN_LAST_TEMPLATE_NAME'); if(lastName){ setTimeout(()=>{ const t=tpls.find(x=>x.name===lastName); if(t) beginEdit(t.id); },1500); }
  // Re-validate after initial load
  setTimeout(validateVars, 2000);
  function dispatchInsertEvents(body){ try { window.dispatchEvent(new CustomEvent('admin-insert-template',{ detail:{ body } })); } catch(_){ } const ed=document.querySelector('textarea,[contenteditable="true"]'); if(ed){ if(ed.tagName==='TEXTAREA'){ ed.value=body; ed.dispatchEvent(new Event('input',{bubbles:true})); } else if(ed.isContentEditable){ ed.innerText=body; ed.dispatchEvent(new Event('input',{bubbles:true})); } } }
  function insertIntoEditor(){ const b=document.getElementById('tplForm').body.value; if(!b) return alert('Empty'); dispatchInsertEvents(b); }
  function insertIntoAssistant(){ insertIntoEditor(); }
  function showUndo(){ const st=document.getElementById('status'); st.innerHTML='Archived. <button onclick="undoArchive()">Undo</button>'; clearTimeout(undoTimer); undoTimer=setTimeout(()=>{ st.textContent=''; lastArchivedId=null; },5000); }
  async function undoArchive(){ if(!lastArchivedId) return; await restoreTpl(lastArchivedId); lastArchivedId=null; document.getElementById('status').textContent='Restored'; }
  async function doExport(){ const data=await api('/api/admin/export'); const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='templates-export.json'; a.click(); URL.revokeObjectURL(url); document.getElementById('status').textContent='Exported'; }
  document.getElementById('importFile').addEventListener('change', async e=>{ const file=e.target.files[0]; if(!file) return; try { const txt=await file.text(); const json=JSON.parse(txt); await api('/api/admin/import',{method:'POST',body:JSON.stringify(json)}); document.getElementById('status').textContent='Imported'; refresh(); } catch(err){ alert('Import error '+err.message); } finally { e.target.value=''; } });
  document.getElementById('searchTpl').addEventListener('input', drawTpls); document.getElementById('sortTpl').addEventListener('change', drawTpls); document.getElementById('showArchived').addEventListener('change', refresh); document.getElementById('tplForm').body.addEventListener('input', ()=>{ if(!document.getElementById('preview').hidden) previewTpl(); });
  refresh();
  // Early auth check to surface cause if stuck
  (async()=>{ try{ const r=await api('/api/admin/auth/check'); const st=document.getElementById('status'); if(st && st.textContent.startsWith('Loading')) st.textContent='Auth OK ('+r.role+') – loading data...'; }
    catch(e){ const st=document.getElementById('status'); if(st) st.textContent='Auth failed: '+e.message; } })();
  </script>
  </body></html>`);
});
process.on('SIGTERM', ()=>{ log('info','sigterm',{ pid:process.pid }); process.exit(0); });
process.on('SIGINT', ()=>{ log('info','sigint',{ pid:process.pid }); process.exit(0); });

if (ENABLE_HEARTBEAT) {
  setInterval(()=>{ log('info','heartbeat',{ pid:process.pid }); }, 60_000).unref();
}

if (ENABLE_SELF_PING) {
  const http = require('http');
  setInterval(()=>{
    http.get({ host: '127.0.0.1', port: PORT, path: '/api/ping', timeout: 2000 }, res=>{
      // drain
      res.resume();
    }).on('error', e=> log('warn','self_ping_fail',{ error:e.message }));
  }, 120_000).unref();
}

function start(){
  const server = app.listen(PORT, HOST, () => {
    log('info','listening',{ url:`http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}` });
  });
  server.on('error', (err) => {
    log('error','listen_error',{ code: err.code, message: err.message });
    process.exit(1);
  });
  return server;
}

if(require.main === module){
  start();
}

module.exports = { app, start };

// Safety: keep event loop busy if nothing else (should not be needed but prevents premature exit in some edge tool contexts)
setInterval(()=>{}, 3600_000).unref();

// 404 fallback (after static & API routes)
app.use((req,res)=>{
  res.status(404).send('Not Found: '+req.originalUrl);
});
