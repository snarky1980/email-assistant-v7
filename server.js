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
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || process.env.ADMIN_API_TOKEN || null; // simple shared secret
const DATA_DIR = path.join(__dirname, 'data');
const TPL_FILE = path.join(DATA_DIR, 'templates.json');
const CAT_FILE = path.join(DATA_DIR, 'categories.json');
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

// --- Admin Studio (Sprint 1) ---
// Simple file-backed storage. Not for high concurrency; sufficient for local / small-scale use.
function ensureDataFiles(){
  try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR); } catch(e){}
  for (const f of [TPL_FILE,CAT_FILE]){
    try { if (!fs.existsSync(f)) fs.writeFileSync(f,'[]','utf8'); } catch(e){}
  }
}
ensureDataFiles();

function readJsonArray(file){
  try { return JSON.parse(fs.readFileSync(file,'utf8')); } catch(e){ return []; }
}
function writeJsonArray(file, arr){
  fs.writeFileSync(file, JSON.stringify(arr, null, 2));
}

function adminAuth(req,res,next){
  if (!ADMIN_TOKEN) return res.status(500).json({ error: 'ADMIN_TOKEN not configured on server' });
  const hdr = req.headers['authorization'] || '';
  if (hdr === `Bearer ${ADMIN_TOKEN}`) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

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
// Template shape: { id, name, categoryId|null, body, variables:[{name, sample?}], createdAt, updatedAt }
app.get('/api/admin/templates', adminAuth, (req,res)=>{
  res.json(readJsonArray(TPL_FILE));
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
  const { id } = req.params;
  let list = readJsonArray(TPL_FILE);
  const before = list.length;
  list = list.filter(t=> t.id !== id);
  if (list.length === before) return res.status(404).json({ error: 'not found' });
  writeJsonArray(TPL_FILE, list);
  res.json({ ok:true });
});

// Basic export (all) and import endpoints
app.get('/api/admin/export', adminAuth, (req,res)=>{
  const templates = readJsonArray(TPL_FILE);
  const categories = readJsonArray(CAT_FILE);
  res.json({ exportedAt: new Date().toISOString(), categories, templates });
});
app.post('/api/admin/import', adminAuth, (req,res)=>{
  const { categories=[], templates=[] } = req.body || {};
  if (!Array.isArray(categories) || !Array.isArray(templates)) return res.status(400).json({ error: 'categories/templates must be arrays' });
  // naive merge (no de-dup beyond id uniqueness)
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

// Minimal helper front-end (static HTML) for quick manual testing (non-production UI)
app.get('/admin', (req,res)=>{
  if (!ADMIN_TOKEN) return res.status(500).send('<h1>Admin disabled</h1><p>Set ADMIN_TOKEN in env.</p>');
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end(`<!DOCTYPE html><html><head><title>Admin Studio (Sprint 1)</title><meta charset="utf-8"/><style>body{font-family:system-ui,Arial;margin:20px;}textarea{width:100%;height:160px;}table{border-collapse:collapse;margin-top:1em;}td,th{border:1px solid #ccc;padding:4px 6px;font-size:12px;}code{background:#f5f5f5;padding:2px 4px;border-radius:3px;}#status{font-size:12px;color:#555;margin-bottom:8px;}button{cursor:pointer;} .row{display:flex;gap:12px;align-items:flex-start} .col{flex:1;min-width:260px;} h2{margin-top:1.2em;} input[type=text]{width:100%;padding:4px;} .tag{display:inline-block;background:#eee;padding:2px 6px;margin:2px;border-radius:3px;font-size:11px;} </style></head><body>
  <h1>Admin Studio (Sprint 1)</h1>
  <div id=status>Loading...</div>
  <script>const TOKEN = prompt('Admin token?'); if(!TOKEN){document.body.innerHTML='<h2>Token required</h2>';}</script>
  <div class=row>
    <div class=col>
      <h2>Categories</h2>
      <form id=catForm onsubmit="createCat(event)">
        <input name=name placeholder='Category name' required />
        <button>Add</button>
      </form>
      <table id=catTable><thead><tr><th>Name</th><th>Actions</th></tr></thead><tbody></tbody></table>
    </div>
    <div class=col>
      <h2>Templates</h2>
      <form id=tplForm onsubmit="createTpl(event)">
        <input name=name placeholder='Template name' required />
        <select name=categoryId id=tplCatSel><option value="">(no category)</option></select>
        <textarea name=body placeholder='Body'></textarea>
        <button>Create</button>
      </form>
      <table id=tplTable><thead><tr><th>Name</th><th>Category</th><th>Vars</th><th>Actions</th></tr></thead><tbody></tbody></table>
    </div>
  </div>
  <script>
  async function api(path, opts={}){
    opts.headers = Object.assign({}, opts.headers||{}, { 'Content-Type':'application/json', 'Authorization':'Bearer '+TOKEN });
    const r = await fetch(path, opts);
    if(!r.ok) throw new Error(r.status+' '+r.statusText); return r.json();
  }
  let cats=[], tpls=[];
  async function refresh(){
    try {
      cats = await api('/api/admin/categories');
      tpls = await api('/api/admin/templates');
      drawCats(); drawTpls(); document.getElementById('status').textContent='Loaded '+cats.length+' categories, '+tpls.length+' templates';
    } catch(e){ document.getElementById('status').textContent='Load error '+e.message; }
  }
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
    tpls.forEach(t=>{
      const cat = cats.find(c=>c.id===t.categoryId); const vars=(t.variables||[]).map(v=>'<span class=tag>'+escapeHtml(v.name)+'</span>').join('');
      const tr=document.createElement('tr');
      tr.innerHTML='<td>'+escapeHtml(t.name)+'</td><td>'+(cat?escapeHtml(cat.name):'')+'</td><td>'+vars+'</td><td><button onclick="editTpl(\''+t.id+'\')">Edit</button> <button onclick="delTpl(\''+t.id+'\')">Del</button></td>';
      tb.appendChild(tr);
    });
  }
  function escapeHtml(s){return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}
  async function createCat(e){e.preventDefault(); const fd=new FormData(e.target); await api('/api/admin/categories',{method:'POST',body:JSON.stringify({name:fd.get('name')})}); e.target.reset(); refresh();}
  async function delCat(id){ if(!confirm('Delete category?'))return; await api('/api/admin/categories/'+id,{method:'DELETE'}); refresh(); }
  async function createTpl(e){e.preventDefault(); const fd=new FormData(e.target); await api('/api/admin/templates',{method:'POST',body:JSON.stringify({name:fd.get('name'),categoryId:fd.get('categoryId')||null,body:fd.get('body'),variables:[]})}); e.target.reset(); refresh();}
  async function delTpl(id){ if(!confirm('Delete template?'))return; await api('/api/admin/templates/'+id,{method:'DELETE'}); refresh(); }
  async function editTpl(id){
    const t = tpls.find(x=>x.id===id); if(!t) return alert('Not found');
    const newName = prompt('Name', t.name); if(!newName) return;
    const newBody = prompt('Body (multi-line not supported here)', t.body); if(newBody==null) return;
    await api('/api/admin/templates/'+id,{method:'PUT',body:JSON.stringify({name:newName,body:newBody})});
    refresh();
  }
  refresh();
  </script>
  </body></html>`);
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
