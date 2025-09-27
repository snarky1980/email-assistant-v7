/*
 AI Template Assistant Overlay
 Loads complete_email_templates.json and provides:
  - Template selection (category + template)
  - Variable inputs auto-generated
  - Generate merged email (subject + body)
  - AI refinement actions (polish, concise, adjust tone, translate)
  - Copy to clipboard
 Uses local /api/openai proxy (no API key in client).
*/
(function(){
  const JSON_PATH = 'complete_email_templates.json';
  const HOST_ID = 'ai-template-assistant-host';
  const STYLE_ID = 'ai-template-assistant-style';

  if (document.getElementById(HOST_ID)) return; // already added

  // Create container (shadow root to avoid CSS clashes)
  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = 'position:fixed;top:72px;right:24px;z-index:9998;width:420px;max-height:80vh;font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;';
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });

  // Styles
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    *,*::before,*::after{box-sizing:border-box;font-family:inherit}
    :host{all:initial;font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;}
    .panel{background:#ffffff;border:1px solid #d0d7de;border-radius:12px;box-shadow:0 4px 18px rgba(0,0,0,0.08);display:flex;flex-direction:column;overflow:hidden;height:100%;}
    header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #e5e7eb;background:linear-gradient(90deg,#0a66ff,#0058a3);color:#fff}
    header h3{margin:0;font-size:15px;font-weight:600;letter-spacing:.5px}
    header button{background:rgba(255,255,255,0.15);border:none;color:#fff;padding:4px 8px;border-radius:6px;cursor:pointer;font-size:12px}
    header button:hover{background:rgba(255,255,255,0.28)}
    .body{padding:12px;overflow:auto;display:flex;flex-direction:column;gap:10px}
    label{font-size:12px;font-weight:600;display:block;margin-bottom:4px;color:#0a273b}
    select,textarea,input{width:100%;border:1px solid #c4cdd5;border-radius:6px;padding:6px 8px;font-size:13px;font-family:inherit;background:#fff}
    select:focus,textarea:focus,input:focus{outline:2px solid #0a66ff33;border-color:#0a66ff}
    .row{display:flex;gap:8px}
    .row > *{flex:1}
    .vars{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .var-item{display:flex;flex-direction:column}
    .actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}
    .actions button{flex:1 1 auto;background:#0a66ff;border:none;color:#fff;padding:8px 10px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;min-width:110px;display:flex;align-items:center;justify-content:center;gap:4px}
    .actions button.secondary{background:#eef2f7;color:#0a273b;border:1px solid #d0d7de}
    .actions button.danger{background:#e54848}
    .actions button:hover{filter:brightness(1.05)}
    .badge{background:#eef6ff;color:#0a66ff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;letter-spacing:.5px}
    .result{border:1px solid #d0d7de;border-radius:8px;padding:8px 10px;background:#fafafa;min-height:90px;font-size:13px;white-space:pre-wrap;line-height:1.32}
    .tabs{display:flex;gap:4px;margin-top:4px}
    .tabs button{flex:1;background:#f0f2f5;border:1px solid #d0d7de;color:#333;padding:6px 8px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer}
    .tabs button.active{background:#0a66ff;color:#fff;border-color:#0a66ff}
    .status{font-size:11px;color:#555;display:flex;align-items:center;gap:6px;margin-top:2px;min-height:18px}
    .spinner{width:14px;height:14px;border:2px solid #0a66ff33;border-top-color:#0a66ff;border-radius:50%;animation:spin .7s linear infinite}
    @keyframes spin{to{transform:rotate(360deg)}}
    .collapse-btn{position:absolute;top:0;left:-40px;background:#0a66ff;color:#fff;border:none;border-radius:8px 0 0 8px;padding:8px 6px;cursor:pointer;writing-mode:vertical-rl;text-orientation:mixed;font-size:11px;}
  `;
  shadow.appendChild(style);

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = `
    <header>
      <h3>AI Email Templates <span class="badge" id="lang-badge">LOADING</span></h3>
      <div style="display:flex;gap:6px;align-items:center">
        <button id="toggle-lang" title="Switch language">Lang</button>
        <button id="close-assistant" title="Close">✕</button>
      </div>
    </header>
    <div class="body">
      <div class="row">
        <div style="flex:1">
          <label>Category</label>
          <select id="cat-select"><option>Loading…</option></select>
        </div>
        <div style="flex:1">
          <label>Template</label>
          <select id="tpl-select"><option>—</option></select>
        </div>
      </div>
      <div>
        <label>Subject</label>
        <input id="subject-input" placeholder="Subject" />
      </div>
      <div>
        <label>Body</label>
        <textarea id="body-input" rows="6" placeholder="Body"></textarea>
      </div>
      <div id="vars-wrapper">
        <label style="margin-bottom:6px;">Variables</label>
        <div class="vars" id="vars-grid"></div>
      </div>
      <div class="tabs" id="ai-tabs">
        <button data-action="polish" class="active">Polish</button>
        <button data-action="concise">Concise</button>
        <button data-action="tone_friendly">Friendlier</button>
        <button data-action="tone_formal">More Formal</button>
        <button data-action="translate_en">FR → EN</button>
        <button data-action="translate_fr">EN → FR</button>
      </div>
      <div class="actions">
        <button id="gen-btn">Merge Vars</button>
        <button id="ai-run-btn" class="secondary">AI Transform</button>
        <button id="copy-btn" class="secondary">Copy</button>
        <button id="clear-btn" class="danger">Clear</button>
      </div>
      <div class="status" id="status-line"></div>
      <div class="result" id="ai-result" placeholder="AI result"></div>
    </div>
  `;
  shadow.appendChild(panel);

  // Collapse control
  const collapseBtn = document.createElement('button');
  collapseBtn.textContent = 'Templates';
  collapseBtn.className = 'collapse-btn';
  collapseBtn.onclick = () => {
    if (host.style.right === '-400px') {
      host.style.right = '24px';
    } else {
      host.style.right = '-400px';
    }
  };
  host.appendChild(collapseBtn);

  // State
  let data = null;
  let currentLang = 'fr';
  let currentAction = 'polish';

  // DOM refs
  const catSelect = panel.querySelector('#cat-select');
  const tplSelect = panel.querySelector('#tpl-select');
  const subjectInput = panel.querySelector('#subject-input');
  const bodyInput = panel.querySelector('#body-input');
  const varsGrid = panel.querySelector('#vars-grid');
  const statusLine = panel.querySelector('#status-line');
  const aiResult = panel.querySelector('#ai-result');
  const langBadge = panel.querySelector('#lang-badge');

  panel.querySelector('#close-assistant').onclick = () => host.remove();
  panel.querySelector('#toggle-lang').onclick = () => {
    currentLang = currentLang === 'fr' ? 'en' : 'fr';
    langBadge.textContent = currentLang.toUpperCase();
    populateCategories();
    populateTemplateList();
    mergeCurrentTemplate();
  };

  panel.querySelector('#ai-tabs').addEventListener('click', e => {
    if (e.target.tagName !== 'BUTTON') return;
    [...panel.querySelectorAll('#ai-tabs button')].forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    currentAction = e.target.dataset.action;
  });

  panel.querySelector('#gen-btn').onclick = mergeCurrentTemplate;
  panel.querySelector('#copy-btn').onclick = () => {
    const merged = buildMerged();
    navigator.clipboard.writeText(merged).then(()=> setStatus('Copied to clipboard ✔︎','success'));    
  };
  panel.querySelector('#clear-btn').onclick = () => {
    subjectInput.value=''; bodyInput.value=''; aiResult.textContent=''; setStatus('Cleared');
  };
  panel.querySelector('#ai-run-btn').onclick = runAI;

  catSelect.onchange = populateTemplateList;
  tplSelect.onchange = () => { mergeCurrentTemplate(); };

  function setStatus(msg,type){
    statusLine.innerHTML = type==='error'? `<span style="color:#e54848">${msg}</span>` : msg;
  }

  function loadJSON(){
    setStatus('Loading templates…');
    fetch(JSON_PATH).then(r=>r.json()).then(j=>{ data=j; populateCategories(); populateTemplateList(); mergeCurrentTemplate(); langBadge.textContent=currentLang.toUpperCase(); setStatus('Templates loaded'); }).catch(err=>{ setStatus('Failed to load JSON','error'); console.error(err); });
  }

  function populateCategories(){
    if(!data) return; const cats = [...new Set(data.templates.map(t=>t.category))];
    catSelect.innerHTML = cats.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  }

  function populateTemplateList(){
    if(!data) return; const cat = catSelect.value; const list = data.templates.filter(t=>t.category===cat);
    tplSelect.innerHTML = list.map(t=>`<option value="${t.id}">${escapeHtml(t.title[currentLang]||t.id)}</option>`).join('');
  }

  function findTemplate(){
    if(!data) return null; const id = tplSelect.value; return data.templates.find(t=>t.id===id) || null;
  }

  function mergeCurrentTemplate(){
    const tpl = findTemplate(); if(!tpl) return; subjectInput.value = tpl.subject[currentLang]||''; bodyInput.value = tpl.body[currentLang]||''; buildVarInputs(tpl); substituteVars(); }

  function buildVarInputs(tpl){
    varsGrid.innerHTML='';
    (tpl.variables||[]).forEach(vn=>{
      const meta = data.variables[vn];
      const wrap = document.createElement('div'); wrap.className='var-item';
      const label = document.createElement('label'); label.textContent = vn; label.style.fontWeight='600'; label.style.fontSize='11px';
      const input = document.createElement('input'); input.placeholder = meta? (meta.example||'') : ''; input.dataset.varName = vn;
      input.oninput = substituteVars;
      wrap.appendChild(label); wrap.appendChild(input); varsGrid.appendChild(wrap);
    });
  }

  function substituteVars(){
    const tpl = findTemplate(); if(!tpl) return;
    let subj = tpl.subject[currentLang] || '';
    let body = tpl.body[currentLang] || '';
    varsGrid.querySelectorAll('input').forEach(inp=>{
      const name = inp.dataset.varName; const val = inp.value || `<<${name}>>`;
      const re = new RegExp('<<'+escapeReg(name)+'>>','g');
      subj = subj.replace(re,val); body = body.replace(re,val);
    });
    subjectInput.value = subj; bodyInput.value = body;
  }

  function buildMerged(){
    return subjectInput.value + '\n\n' + bodyInput.value;
  }

  async function runAI(){
    const merged = buildMerged();
    if(!merged.trim()) { setStatus('Nothing to process','error'); return; }
    setStatus('<span class="spinner"></span> AI processing…');
    let systemInstruction = '';
    switch(currentAction){
      case 'polish': systemInstruction = 'Polish and lightly improve clarity while preserving meaning.'; break;
      case 'concise': systemInstruction = 'Make the email more concise while preserving tone and intent.'; break;
      case 'tone_friendly': systemInstruction = 'Rewrite the email in a friendlier, warm but professional tone.'; break;
      case 'tone_formal': systemInstruction = 'Rewrite the email in a more formal, professional register suitable for government correspondence.'; break;
      case 'translate_en': systemInstruction = 'Translate the following French email to natural, professional English.'; break;
      case 'translate_fr': systemInstruction = 'Traduire le courriel anglais suivant en français professionnel et naturel.'; break;
      default: systemInstruction = 'Improve the following email.';
    }
    try {
      const resp = await fetch('/api/openai', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ prompt: systemInstruction + '\n\n' + merged, feature: currentAction })});
      const json = await resp.json();
      if(!resp.ok){ throw new Error(json.error || resp.statusText); }
      aiResult.textContent = json.result || '[No content]';
      setStatus('AI done ✔︎');
    } catch(err){
      console.error(err); setStatus('AI error: '+ err.message,'error');
    }
  }

  function escapeHtml(s){ return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
  function escapeReg(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }

  loadJSON();
})();
