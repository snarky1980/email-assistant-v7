/*
 Integrated In-App AI Assistant
 - Injects contextual AI tools directly into the existing app layout (under header / top bar)
 - Provides template selection, variable autofill, and inline refinement controls without floating overlays.
 - Uses /api/openai proxy (no client key exposure).
 - Graceful degradation if backend unavailable.
*/
(function(){
  const JSON_PATH = 'complete_email_templates.json';
  const MOUNT_ID = 'ai-inline-assistant-root';
  if (document.getElementById(MOUNT_ID)) return;

  function waitForAppRoot(cb, attempts=40){
    const root = document.getElementById('root');
    if(root && root.firstElementChild){
      cb(root.firstElementChild);
    } else if(attempts>0){
      setTimeout(()=>waitForAppRoot(cb, attempts-1), 250);
    } else {
      // fallback attach to body
      cb(document.body);
    }
  }

  waitForAppRoot(init);

  function init(appNode){
    try {
      // Determine insertion point: insert a new section at the top of the app container.
      const host = document.createElement('section');
      host.id = MOUNT_ID;
      host.style.cssText = 'border-bottom:1px solid #e2e8f0;background:#f8fafc;padding:14px 18px;font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;';
      host.innerHTML = markup();
      appNode.prepend(host);
      wire(host);
    } catch(e){ console.error('[AI Inline Assist] init error', e); }
  }

  function markup(){
    return `
      <style>
        #${MOUNT_ID} * { box-sizing:border-box; }
        #${MOUNT_ID} h4 { margin:0 0 8px 0; font-size:14px; font-weight:600; letter-spacing:.5px; color:#0a273b; }
        #${MOUNT_ID} select, #${MOUNT_ID} input, #${MOUNT_ID} textarea { font:13px system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; }
        #${MOUNT_ID} select, #${MOUNT_ID} input, #${MOUNT_ID} textarea { border:1px solid #cbd5e1; border-radius:6px; padding:6px 8px; width:100%; background:#fff; }
        #${MOUNT_ID} select:focus, #${MOUNT_ID} input:focus, #${MOUNT_ID} textarea:focus { outline:2px solid #2563eb33; border-color:#2563eb; }
        #${MOUNT_ID} .ai-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:12px; }
        #${MOUNT_ID} .vars-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:10px; }
        #${MOUNT_ID} .var-item label { font-size:11px; font-weight:600; color:#475569; display:block; margin-bottom:4px; }
        #${MOUNT_ID} .section { background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; display:flex; flex-direction:column; gap:8px; }
        #${MOUNT_ID} .flex { display:flex; gap:10px; }
        #${MOUNT_ID} .actions { display:flex; flex-wrap:wrap; gap:8px; }
        #${MOUNT_ID} button.ai-btn { background:#2563eb; color:#fff; border:none; padding:8px 14px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px; }
        #${MOUNT_ID} button.ai-btn.secondary { background:#eef2f7; color:#0a273b; border:1px solid #cbd5e1; }
        #${MOUNT_ID} button.ai-btn.danger { background:#dc2626; }
        #${MOUNT_ID} button.ai-btn:hover { filter:brightness(1.05); }
        #${MOUNT_ID} .tabs { display:flex; gap:6px; flex-wrap:wrap; }
        #${MOUNT_ID} .tabs button { background:#f1f5f9; border:1px solid #cbd5e1; padding:6px 10px; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer; }
        #${MOUNT_ID} .tabs button.active { background:#2563eb; border-color:#2563eb; color:#fff; }
        #${MOUNT_ID} .status { font-size:11px; min-height:18px; color:#475569; display:flex; align-items:center; gap:6px; }
        #${MOUNT_ID} .spinner { width:14px; height:14px; border:2px solid #3b82f633; border-top-color:#2563eb; border-radius:50%; animation:spin .7s linear infinite; }
        @keyframes spin { to { transform:rotate(360deg); } }
        #${MOUNT_ID} .result-box { white-space:pre-wrap; background:#f8fafc; border:1px solid #e2e8f0; padding:10px 12px; border-radius:8px; font-size:13px; line-height:1.4; max-height:240px; overflow:auto; }
        #${MOUNT_ID} .lang-tag { background:#2563eb; color:#fff; font-size:10px; font-weight:600; padding:2px 6px; border-radius:12px; letter-spacing:.5px; }
        #${MOUNT_ID} .grow { flex:1 1 auto; }
      </style>
      <div class="ai-grid">
        <div class="section">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
            <h4 style="display:flex; align-items:center; gap:8px;">Assistant IA Modèles <span class="lang-tag" id="ai-lang-badge">FR</span></h4>
            <div class="actions" style="gap:6px;">
              <button class="ai-btn secondary" id="ai-toggle-lang" title="Basculer langue">Langue</button>
              <button class="ai-btn secondary" id="ai-collapse-toggle" title="Réduire">Réduire</button>
            </div>
          </div>
          <div class="flex" style="flex-wrap:wrap;">
            <div class="grow">
              <label style="font-size:11px;font-weight:600;color:#475569;">Catégorie</label>
              <select id="ai-cat"></select>
            </div>
            <div class="grow">
              <label style="font-size:11px;font-weight:600;color:#475569;">Modèle</label>
              <select id="ai-tpl"></select>
            </div>
            <div style="min-width:140px;">
              <label style="font-size:11px;font-weight:600;color:#475569;">Action IA</label>
              <select id="ai-action">
                <option value="polish">Polir</option>
                <option value="concise">Rendre concis</option>
                <option value="tone_friendly">Plus chaleureux</option>
                <option value="tone_formal">Plus formel</option>
                <option value="translate_en">FR → EN</option>
                <option value="translate_fr">EN → FR</option>
              </select>
            </div>
          </div>
          <div class="vars-grid" id="ai-vars"></div>
          <div class="flex" style="flex-direction:column; gap:8px;">
            <div>
              <label style="font-size:11px;font-weight:600;color:#475569;">Sujet</label>
              <input id="ai-subject" placeholder="Sujet" />
            </div>
            <div>
              <label style="font-size:11px;font-weight:600;color:#475569;">Corps</label>
              <textarea id="ai-body" rows="6" placeholder="Corps du courriel"></textarea>
            </div>
          </div>
          <div class="actions">
            <button class="ai-btn" id="ai-merge">Fusionner variables</button>
            <button class="ai-btn secondary" id="ai-run">Appliquer IA</button>
            <button class="ai-btn secondary" id="ai-copy">Copier</button>
            <button class="ai-btn danger" id="ai-reset">Réinitialiser</button>
          </div>
          <div class="status" id="ai-status"></div>
        </div>
        <div class="section">
          <h4>Résultat IA</h4>
          <div id="ai-result" class="result-box" aria-live="polite"></div>
        </div>
      </div>
    `;
  }

  // State
  let data = null;
  let lang = 'fr';

  function wire(el){
    const catSel = el.querySelector('#ai-cat');
    const tplSel = el.querySelector('#ai-tpl');
    const varsGrid = el.querySelector('#ai-vars');
    const subj = el.querySelector('#ai-subject');
    const body = el.querySelector('#ai-body');
    const status = el.querySelector('#ai-status');
    const result = el.querySelector('#ai-result');

    el.querySelector('#ai-toggle-lang').onclick = () => {
      lang = lang === 'fr' ? 'en' : 'fr';
      el.querySelector('#ai-lang-badge').textContent = lang.toUpperCase();
      populateCats(catSel);
      populateTpls(catSel, tplSel);
      applyTemplate(tplSel, subj, body, varsGrid);
    };

    el.querySelector('#ai-collapse-toggle').onclick = () => {
      const grid = el.querySelector('.ai-grid');
      if (grid.style.display === 'none') { grid.style.display='grid'; } else { grid.style.display='none'; }
    };

    el.querySelector('#ai-merge').onclick = () => { substituteVars(tplSel, subj, body, varsGrid); };
    const resetBtn = el.querySelector('#ai-reset');
    resetBtn.style.transition='background .2s, filter .2s';
    resetBtn.onmouseenter=()=>{ resetBtn.style.filter='brightness(1.15)'; };
    resetBtn.onmouseleave=()=>{ resetBtn.style.filter=''; };
    resetBtn.onclick = () => {
      if(!confirm('Confirmer la réinitialisation ?\n(This will clear Sujet, Corps et Résultat IA)')) return;
      subj.value=''; body.value=''; result.textContent=''; status.textContent='Réinitialisé';
    };
    el.querySelector('#ai-copy').onclick = () => {
      const merged = subj.value + '\n\n' + body.value; navigator.clipboard.writeText(merged).then(()=>{ status.textContent='Copié'; });
    };
    el.querySelector('#ai-run').onclick = () => runAI(el, subj, body, result, status);

    catSel.onchange = () => { populateTpls(catSel, tplSel); applyTemplate(tplSel, subj, body, varsGrid); };
    tplSel.onchange = () => { applyTemplate(tplSel, subj, body, varsGrid); };

    loadTemplates(status, () => {
      populateCats(catSel);
      populateTpls(catSel, tplSel);
      applyTemplate(tplSel, subj, body, varsGrid);
      status.textContent='Prêt';
    });
  }

  function loadTemplates(statusEl, cb){
    statusEl.textContent='Chargement des modèles...';
    fetch(JSON_PATH).then(r=>r.json()).then(j=>{ data=j; cb(); }).catch(e=>{ console.error(e); statusEl.textContent='Échec chargement modèles'; });
  }

  function populateCats(catSel){
    if(!data) return; const cats=[...new Set(data.templates.map(t=>t.category))];
    catSel.innerHTML = cats.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  }
  function populateTpls(catSel, tplSel){
    if(!data) return; const list = data.templates.filter(t=>t.category===catSel.value);
    tplSel.innerHTML = list.map(t=>`<option value="${t.id}">${escapeHtml(t.title[lang]||t.id)}</option>`).join('');
  }
  function findTpl(id){ return data.templates.find(t=>t.id===id); }

  function applyTemplate(tplSel, subj, body, varsGrid){
    const tpl = findTpl(tplSel.value); if(!tpl) return;
    subj.value = tpl.subject[lang] || '';
    body.value = tpl.body[lang] || '';
    buildVars(tpl, varsGrid, () => substituteVars(tplSel, subj, body, varsGrid));
    substituteVars(tplSel, subj, body, varsGrid);
  }

  function buildVars(tpl, grid, onChange){
    grid.innerHTML='';
    (tpl.variables||[]).forEach(vn=>{
      const meta = data.variables[vn];
      const wrap=document.createElement('div'); wrap.className='var-item';
      wrap.innerHTML = `<label>${escapeHtml(vn)}</label><input data-var="${vn}" placeholder="${meta?escapeHtml(meta.example||''):''}" />`;
      const inp=wrap.querySelector('input');
      inp.addEventListener('input', onChange);
      grid.appendChild(wrap);
    });
  }

  function substituteVars(tplSel, subj, body, varsGrid){
    const tpl = findTpl(tplSel.value); if(!tpl) return;
    let subjText = tpl.subject[lang] || '';
    let bodyText = tpl.body[lang] || '';
    varsGrid.querySelectorAll('input[data-var]').forEach(inp=>{
      const name = inp.getAttribute('data-var'); const val = inp.value || `<<${name}>>`;
      const re = new RegExp('<<'+escapeReg(name)+'>>','g');
      subjText = subjText.replace(re, val); bodyText = bodyText.replace(re, val);
    });
    subj.value = subjText; body.value = bodyText;
  }

  function runAI(el, subj, body, result, status){
    const action = el.querySelector('#ai-action').value;
    const merged = subj.value + '\n\n' + body.value;
    if(!merged.trim()){ status.textContent='Rien à traiter'; return; }
    status.innerHTML = '<span class="spinner"></span> Traitement IA...';
    let systemInstruction='';
    switch(action){
      case 'polish': systemInstruction='Polis et améliore légèrement la clarté sans changer le sens.'; break;
      case 'concise': systemInstruction='Rends ce courriel plus concis tout en conservant le ton et l’intention.'; break;
      case 'tone_friendly': systemInstruction='Récris le courriel avec un ton plus chaleureux, professionnel et accessible.'; break;
      case 'tone_formal': systemInstruction='Récris le courriel dans un registre plus formel, adapté à un contexte gouvernemental.'; break;
      case 'translate_en': systemInstruction='Translate the following French email into natural, professional English.'; break;
      case 'translate_fr': systemInstruction='Traduire le courriel anglais suivant en français professionnel et naturel.'; break;
      default: systemInstruction='Improve the following email.';
    }

    fetch('/api/openai', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ prompt: systemInstruction+'\n\n'+merged, feature: action })})
      .then(r=>r.json())
      .then(j=>{
        if(j.error){ status.textContent='Erreur IA: '+j.error; return; }
        result.textContent = j.result || '[Aucun contenu]';
        status.textContent='Terminé';
      })
      .catch(err=>{ console.error(err); status.textContent='Erreur réseau IA'; });
  }

  function escapeHtml(s){ return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
  function escapeReg(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
})();
