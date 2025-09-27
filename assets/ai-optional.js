/*
 Optional AI Assistant
 - Adds a small unobtrusive button in bottom-right.
 - On click opens a draggable, resizable floating panel with template + AI features.
 - Reuses logic from inline assistant but lazy-loads JSON & only mounts when opened.
 - User preference (open/closed, last position, size, lang, last action) stored in localStorage.
*/
(function(){
  const BTN_ID = 'ai-launch-btn';
  const PANEL_ID = 'ai-float-panel';
  const STORAGE_KEY = 'aiAssistantPrefsV1';
  const ACTIONS = [
    { id:'polish', fr:'Polir', en:'Polish', prompt_fr:"Polis ce courriel pour qu'il soit clair, concis et professionnel sans changer le sens.", prompt_en:'Polish this email so it is clear, concise and professional without changing the meaning.' },
  { id:'correct', fr:'Corriger', en:'Correct', prompt_fr:"Corrige toutes les fautes d'orthographe et de grammaire tout en gardant le ton.", prompt_en:'Correct any spelling and grammar issues while keeping the tone.' },
    { id:'simplify', fr:'Simplifier', en:'Simplify', prompt_fr:'Simplifie ce courriel en langage clair et direct.', prompt_en:'Simplify this email using plain, direct language.' },
    { id:'translate_en', fr:'Traduire en anglais', en:'Translate to English', prompt_fr:'Traduis ce courriel en anglais en gardant le ton professionnel.', prompt_en:'Translate this email into English keeping a professional tone.' },
    { id:'translate_fr', fr:'Traduire en français', en:'Translate to French', prompt_fr:'Traduis ce courriel en français en gardant le ton professionnel.', prompt_en:'Translate this email into French keeping a professional tone.' },
    { id:'custom', fr:'Instruction seule', en:'Custom only', custom:true }
  ];
  // (Templates removed for simplicity)

  if (document.getElementById(BTN_ID) || document.getElementById(PANEL_ID)) return;

  const prefs = loadPrefs();

  let btn = null; // launcher created only when an editable area exists
  function ensureLauncher(){
    if(panel) return; // panel open already, keep existing
    // Determine current editable body element
    let target = externalBodyEl && isEditableElement(externalBodyEl) ? externalBodyEl : findFirstEditable();
    if(!target){
      // No editable element; remove button if present
      if(btn){ btn.remove(); btn=null; }
      return;
    }
    if(btn && btn.isConnected){
      // Reposition if parent changed
      if(btn.parentElement !== target.parentElement){ btn.remove(); btn=null; }
    }
    if(!btn){
      const parent = target.parentElement || document.body;
      const cs = window.getComputedStyle(parent);
      if(cs.position==='static') parent.style.position='relative';
      btn = document.createElement('button');
      btn.id = BTN_ID;
      btn.type='button';
      btn.innerHTML='IA ✨';
      btn.setAttribute('aria-label','Ouvrir assistant IA');
      btn.style.cssText = 'position:absolute;right:6px;bottom:6px;z-index:2147483600;background:var(--primary);color:var(--primary-foreground);border:1px solid var(--primary);padding:8px 14px;font-weight:600;font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;border-radius:var(--radius);cursor:pointer;box-shadow:0 4px 10px -2px #1a365d33,0 1px 2px #1a365d1a;font-size:12px;display:flex;align-items:center;gap:6px;letter-spacing:.3px;transition:background-color .18s,transform .18s,box-shadow .18s;';
      btn.onmouseenter=()=>btn.style.filter='brightness(1.05)';
      btn.onmouseleave=()=>btn.style.filter='none';
      btn.onclick=togglePanel;
      parent.appendChild(btn);
      console.log('[ai-optional] launcher placed in editor parent');
    }
  }
  function isEditableElement(el){ return !!el && (el.tagName==='TEXTAREA' || el.isContentEditable || (el.getAttribute && el.getAttribute('role')==='textbox')); }
  function findFirstEditable(){
    const candidates = Array.from(document.querySelectorAll('textarea,[contenteditable="true"],[contenteditable=""],div[role=textbox]'))
      .filter(c=> isEditableElement(c) && (!panel || !panel.contains(c)) && (!btn || !btn.contains(c)) );
    return candidates[0]||null;
  }
  // Periodic check in case the editing area appears later
  setInterval(ensureLauncher, 1200);
  console.log('[ai-optional] launcher watcher initialized');

  let panel=null, lang=prefs.lang||'fr';
  let dragging=false, dragOffset=[0,0];
  let resizing=false, resizeMode=null, resizeStart=[0,0], startRect=null, sizeIndex=(prefs.sizeIndex||1);
  let externalSynced = false;
  let externalSubjectEl = null;
  let externalBodyEl = null;
  let lastAssistantEdit = 0;
  let initialSynced = false;
  let detectionObserver = null;
  const API_BASE = window.AI_API_BASE || document.querySelector('meta[name="ai-api-base"]')?.getAttribute('content') || '';
  const API_ROOT = (API_BASE.endsWith('/') ? API_BASE.slice(0,-1) : API_BASE) || '';

  function togglePanel(){
    if(panel){ closePanel(); return; }
    openPanel();
  }

  function openPanel(){
    panel = document.createElement('div');
    panel.id = PANEL_ID;
    const pos = prefs.position || { x: window.innerWidth - 480, y: window.innerHeight - 620 };
    const sz = prefs.size || { w: 420, h: 560 };
  panel.style.cssText = `position:fixed;left:${pos.x}px;top:${pos.y}px;width:${sz.w}px;height:${sz.h}px;z-index:2147483600;background:var(--card);border:1px solid var(--border);border-radius:var(--radius);display:flex;flex-direction:column;font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;box-shadow:0 6px 18px -6px #1a365d26,0 2px 4px -1px #1a365d1f;backdrop-filter:saturate(1.2);`;
    panel.innerHTML = templateHTML();
    document.body.appendChild(panel);
    wirePanel(panel);
    savePrefs();
  }
  function closePanel(){ if(panel){ panel.remove(); panel=null; savePrefs(); } }

  function templateHTML(){
    return `
      <style>
        #${PANEL_ID} * { box-sizing:border-box; }
  #${PANEL_ID} header { cursor:move; background:var(--tb-navy);color:var(--primary-foreground);padding:10px 14px;display:flex;align-items:center;justify-content:space-between;border-radius:calc(var(--radius) - 0px) calc(var(--radius) - 0px) 0 0; box-shadow:inset 0 0 0 1px #ffffff12; }
        #${PANEL_ID} header h3 { margin:0; font-size:14px; font-weight:600; letter-spacing:.5px; display:flex; align-items:center; gap:8px; }
  #${PANEL_ID} header button { background:#f2f5f7;border:1px solid var(--border);color:var(--tb-navy);font-size:11px;padding:4px 8px;border-radius:6px;cursor:pointer;font-weight:600;letter-spacing:.4px; }
  #${PANEL_ID} header button:hover { background:var(--tb-teal);border-color:var(--tb-teal);color:#fff; }
  #${PANEL_ID} .body { flex:1 1 auto;padding:12px 14px;display:flex;flex-direction:column;gap:12px;overflow:auto;background:var(--card); }
  #${PANEL_ID} select,input,textarea { width:100%;padding:7px 9px;font:13px system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;border:1px solid var(--border);border-radius:8px;background:#fff;box-shadow:0 1px 0 #1a365d0a; }
  #${PANEL_ID} select:focus,input:focus,textarea:focus { outline:2px solid var(--ring); outline-offset:0; border-color:var(--ring); box-shadow:0 0 0 3px #1f8a9933; }
  #${PANEL_ID} label { font-size:11px;font-weight:600;color:var(--tb-navy);margin-bottom:4px;display:block;letter-spacing:.4px;text-transform:uppercase; }
        #${PANEL_ID} .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:8px; }
    #${PANEL_ID} .actions { display:flex; flex-wrap:wrap; gap:6px; }
  #${PANEL_ID} button.act { background:var(--tb-sage-muted);color:#1a365d;border:1px solid var(--tb-sage-muted);padding:7px 14px;font-size:12px;font-weight:600;border-radius:8px;cursor:pointer;letter-spacing:.3px;transition:.18s background,.18s color; }
  #${PANEL_ID} button.act:hover { background:var(--tb-teal);border-color:var(--tb-teal);color:#fff; }
  #${PANEL_ID} button.act:active { transform:translateY(1px); }
  #${PANEL_ID} .status { font-size:11px; min-height:18px; color:var(--tb-navy); display:flex;align-items:center; gap:6px; font-weight:500; }
  #${PANEL_ID} .spinner { width:14px;height:14px;border:2px solid #1f8a992e;border-top-color:var(--tb-teal);border-radius:50%;animation:spin .7s linear infinite; }
        @keyframes spin { to{ transform:rotate(360deg);} }
  #${PANEL_ID} .result { white-space:pre-wrap; background:var(--card);border:1px solid var(--border);padding:10px 12px;border-radius:10px;font-size:12.5px;line-height:1.45;max-height:220px;overflow:auto;box-shadow:inset 0 1px 2px #1a365d0f; }
  #${PANEL_ID} .lang-tag { background:var(--tb-sage-muted);color:#1a365d;font-size:10px;font-weight:600;padding:2px 7px;border-radius:14px;letter-spacing:.6px; box-shadow:0 0 0 1px #1a365d1a; }
  #${PANEL_ID} #ai-actions { background:var(--tb-sage-muted);border:1px solid var(--tb-sage-muted);color:#1a365d; }
  #${PANEL_ID} #ai-actions:hover { background:var(--tb-teal);border-color:var(--tb-teal);color:#fff; }
  #${PANEL_ID} #ai-actions-menu { background:var(--card);border:1px solid var(--border);border-radius:10px;padding:6px;box-shadow:0 8px 20px -6px #1a365d33,0 2px 4px #1a365d1a; }
  #${PANEL_ID} #ai-actions-menu button { background:var(--tb-sage-muted);border:1px solid var(--tb-sage-muted);color:#1a365d;padding:6px 10px;font-size:12px;font-weight:600;border-radius:6px;cursor:pointer;letter-spacing:.3px;display:block;width:100%;text-align:left;margin:4px 0 0; }
  #${PANEL_ID} #ai-actions-menu button:first-child { margin-top:0; }
  #${PANEL_ID} #ai-actions-menu button:hover { background:var(--tb-teal);border-color:var(--tb-teal);color:#fff; }
  #${PANEL_ID} .resize-handle { position:absolute;right:4px;bottom:4px;width:18px;height:18px;cursor:nwse-resize; background:var(--tb-teal); border-radius:5px; opacity:.6; box-shadow:0 0 0 1px #1a365d33; }
  #${PANEL_ID} .resize-handle:hover { opacity:.9; }
  #${PANEL_ID} input[type=checkbox]{ width:14px; height:14px; cursor:pointer; accent-color:#2563eb; }
  #${PANEL_ID} label:has(> input[type=checkbox]){ display:flex; align-items:center; gap:6px; }
  #${PANEL_ID} .mini-btn { background:#eef2f7;border:1px solid #cbd5e1;color:#0a273b;padding:2px 6px;font-size:10px;line-height:1;border-radius:4px;cursor:pointer;font-weight:600; }
  #${PANEL_ID} .mini-btn:hover { background:#e2e8f0; }
      </style>
      <header>
        <h3>Assistant IA <span class="lang-tag" id="ai-lang">${lang.toUpperCase()}</span></h3>
        <div style="display:flex;gap:6px;align-items:center;">
          <button id="ai-lang-toggle" title="Changer la langue">Lang</button>
          <button id="ai-min" title="Réduire/Agrandir">−</button>
          <button id="ai-close" title="Fermer">✕</button>
        </div>
      </header>
      <div class="body" id="ai-body-wrap">
        <!-- Simplified: category/model/action dropdowns removed -->
        <div>
          <label>Corps</label>
            <textarea id="ai-text" rows="6"></textarea>
        </div>
        <div class="actions" style="justify-content:flex-start;position:relative;">
          <button class="act" id="ai-push" title="Pousser vers l'éditeur">→ Éditeur</button>
          <button class="act" id="ai-actions" title="Choisir une action IA">Actions ▾</button>
          <div id="ai-actions-menu" style="display:none;position:absolute;z-index:50;top:100%;left:0;margin-top:6px;min-width:210px;max-height:240px;overflow:auto;">
          </div>
        </div>
        <div>
          <label>Instruction</label>
          <textarea id="ai-instruction" rows="3" placeholder="Ex: Polir, corriger, simplifier, traduire en anglais..."></textarea>
        </div>
        </div>
        <div class="status" id="ai-status"></div>
        <div>
          <label style="font-size:11px;font-weight:600;color:var(--tb-navy);letter-spacing:.5px;display:block;margin:4px 0 2px;">Résultat</label>
          <div class="result" id="ai-result"></div>
        </div>
      </div>
  <div class="resize-handle" id="ai-resize"></div>
    `;
  }

  function wirePanel(root){
    const dragHandle = root.querySelector('header');
    dragHandle.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', endDrag);
  const resizeBR = root.querySelector('#ai-resize');
  resizeBR.addEventListener('mousedown', e=> startResize(e,'br'));

    root.querySelector('#ai-close').onclick=closePanel;
    root.querySelector('#ai-min').onclick=toggleMin;
    root.querySelector('#ai-lang-toggle').onclick=()=>{ lang= lang==='fr'?'en':'fr'; root.querySelector('#ai-lang').textContent=lang.toUpperCase(); savePrefs(); };
  // Push only (live sync active; manual sync removed)
  root.querySelector('#ai-push').onclick=pushToEditor;
  // Actions dropdown
  const actionsBtn = root.querySelector('#ai-actions');
  const actionsMenu = root.querySelector('#ai-actions-menu');
  function buildActionsMenu(){
    actionsMenu.innerHTML = ACTIONS.map(a=>`<button data-act="${a.id}">${lang==='fr'?a.fr:a.en}</button>`).join('');
  }
  buildActionsMenu();
  actionsBtn.addEventListener('click', e=>{ e.stopPropagation(); const open=actionsMenu.style.display==='block'; actionsMenu.style.display=open?'none':'block'; });
  actionsMenu.addEventListener('click', e=>{ const b=e.target.closest('button[data-act]'); if(!b) return; runAction(b.getAttribute('data-act')); actionsMenu.style.display='none'; });
  document.addEventListener('click', e=>{ if(!panel) return; if(!panel.contains(e.target)) { actionsMenu.style.display='none'; } });
  // Removed configuration checkboxes & advanced selectors for simplicity

    // Track assistant manual edits (to avoid accidental overwrite racing)
  body().addEventListener('input', ()=>{ lastAssistantEdit=Date.now(); });

    // Initial sync directly (no templates)
    syncFromExternal(true);
    initialSynced = true;
    setStatus('Prêt');
    // establish external references & listeners slightly later (editor may mount async)
    setTimeout(()=>{ externalBodyEl = findExternalBody(); if(externalBodyEl){ attachExternalListeners(); } }, 250);
    // Start an auto-sync loop to pull external body content once it appears
    startAutoSyncLoop();
    // Setup focus listener to capture user entering the external editor after panel opened
    document.addEventListener('focusin', focusCaptureHandler, true);
    // Observe DOM mutations (late-mounted editors)
    startDetectionObserver();
    // Ensure launcher appears if panel opened after detection
    ensureLauncher();
    // Test backend connectivity and surface status
    testBackendConnectivity();
  }

  function startDrag(e){ if(e.target.tagName==='BUTTON') return; dragging=true; const rect=panel.getBoundingClientRect(); dragOffset=[e.clientX-rect.left,e.clientY-rect.top]; e.preventDefault(); }
  function onDrag(e){ if(!dragging) return; panel.style.left=(e.clientX-dragOffset[0])+'px'; panel.style.top=(e.clientY-dragOffset[1])+'px'; savePrefs(); }
  function endDrag(){ dragging=false; }

  function startResize(e,mode){ resizing=true; resizeMode=mode; startRect=panel.getBoundingClientRect(); resizeStart=[e.clientX, e.clientY]; e.preventDefault(); }
  document.addEventListener('mousemove', e=>{ if(!resizing) return; const dx=e.clientX-resizeStart[0]; const dy=e.clientY-resizeStart[1]; if(resizeMode==='br'){ panel.style.width=(startRect.width+dx)+'px'; panel.style.height=(startRect.height+dy)+'px'; } savePrefs(); });
  document.addEventListener('mouseup', ()=>{ resizing=false; resizeMode=null; });


  function toggleMin(){ const bodyWrap=document.getElementById('ai-body-wrap'); if(!bodyWrap) return; if(bodyWrap.style.display==='none'){ bodyWrap.style.display='flex'; } else { bodyWrap.style.display='none'; } savePrefs(); }

  // Element helpers
  const varsGrid = ()=> null; // removed
  const body = ()=> panel.querySelector('#ai-text');
  const status = ()=> panel.querySelector('#ai-status');
  const result = ()=> panel.querySelector('#ai-result');

  function setStatus(m){ status().textContent=m; }

  function runAction(actionId){
  const bodyVal = body().value.trim();
  const instrRaw = (panel.querySelector('#ai-instruction').value||'').trim();
  if(!bodyVal && !instrRaw){ setStatus('Vide'); return; }
    const action = ACTIONS.find(a=>a.id===actionId);
    if(!action){ setStatus('Action inconnue'); return; }
    let basePrompt='';
    if(action.custom){
      if(!instrRaw){ basePrompt = (lang==='fr' ? "Améliore ce courriel (clair, concis, professionnel) sans changer le sens." : 'Improve this email (clear, concise, professional) without changing the meaning.'); }
      else basePrompt = instrRaw;
    } else {
      basePrompt = (lang==='fr'? action.prompt_fr : action.prompt_en);
      if(instrRaw){ basePrompt += (lang==='fr'?"\nConsignes supplémentaires: ":"\nAdditional notes: ") + instrRaw; }
    }
  const merged = 'Corps:\n'+body().value;
    setStatus('IA...');
    postJsonWithRetry(API_ROOT+'/api/openai', { prompt: basePrompt+'\n\n'+merged, feature: action.id }, 2, 800)
      .then(j=>{ if(j.error){ setStatus('Erreur '+j.error); return; } result().textContent=j.result||'[Aucun]'; setStatus('OK'); })
      .catch(e=>{ console.error(e); setStatus('Erreur réseau'); });
  }

  // chat functionality fully removed in this version
  
  // --- External editor sync ---
  function syncFromExternal(force){
    try {
      // Always attempt re-detection (editor nodes may have been remounted)
      const detectedBody = findExternalBody();
      if(detectedBody && detectedBody!==body()) externalBodyEl = detectedBody;
      if(window && window.console){
        console.debug('[ai-optional] sync detection',{ body: externalBodyEl });
      }
      const bEl = externalBodyEl;
      if(!bEl){ setStatus('Élément éditeur introuvable'); return; }
      if(force || !externalSynced){
        const changedBody = syncBody(true);
        if(changedBody) setStatus('Corps synchronisé'); else setStatus('Déjà à jour');
        externalSynced = true;
      }
    } catch(e){ /* ignore */ }
  }
  function syncBody(force){
    if(!externalBodyEl) externalBodyEl = findExternalBody();
    if(!externalBodyEl) return false;
    // Prevent syncing body if detector pointed to the same node as subject (would overwrite with subject value)
  // subject removed
    if(!force && Date.now()-lastAssistantEdit < 500) return false;
    const val = getNodeValue(externalBodyEl);
    if(val !== body().value){ body().value = val; return true; }
    return false;
  }
  function getNodeValue(node){ if(!node) return ''; if(node.tagName==='INPUT' || node.tagName==='TEXTAREA') return node.value; if(node.isContentEditable) return node.innerText || node.textContent || ''; return node.textContent || ''; }
  function findExternalBody(){
    const custom = prefs.customSelectors?.body; if(custom){ try{ const el=document.querySelector(custom); if(el) return el; }catch(_){}}
    const selectors=[
      '[data-email-body]','[data-body]','[data-editor="body"]','textarea[name=body]','textarea#body','textarea[id*="body"]','textarea[name*="body"]','textarea[placeholder*="Message"]','textarea[placeholder*="courriel"]',
      'div[role=textbox][contenteditable="true"]','[contenteditable="true"]'
    ];
    for(const sel of selectors){
      const el=document.querySelector(sel);
      if(candidateOk(el)) return el;
    }
    // Fallback: pick largest textarea not inside assistant
    const textareas=Array.from(document.querySelectorAll('textarea')).filter(t=> candidateOk(t));
    if(textareas.length){ textareas.sort((a,b)=> (getNodeValue(b)||'').length - (getNodeValue(a)||'').length); if(textareas[0]) return textareas[0]; }
    const edits=Array.from(document.querySelectorAll('[contenteditable="true"],[contenteditable=""])')).filter(e=> candidateOk(e));
    if(edits.length){ edits.sort((a,b)=> (getNodeValue(b)||'').length - (getNodeValue(a)||'').length); return edits[0]; }
    // View-mode candidates (non-editable display containers)
    const viewSelectors=[
      '.email-body','.message-body','.mail-body','#emailBody','#messageBody','[data-email-view]','[data-message-body]','div[class*="message-body"]','div[class*="email-body"]'
    ];
    let viewCandidates=[];
    for(const vs of viewSelectors){ viewCandidates.push(...Array.from(document.querySelectorAll(vs))); }
    viewCandidates = viewCandidates.filter(vc=> candidateOk(vc) && isViewerCandidate(vc));
    if(viewCandidates.length){ viewCandidates.sort((a,b)=> getNodeValue(b).length - getNodeValue(a).length); return viewCandidates[0]; }
    return null;
  }
  function candidateOk(el){
    if(!el) return false;
    if(panel && panel.contains(el)) return false; // skip assistant internal nodes
    if(el === externalBodyEl) return true;
    if(el === body()) return false;
    return true;
  }
  function isViewerCandidate(el){
    if(!el) return false;
    if(el.tagName === 'BODY' || el.tagName === 'HTML') return false;
    const len = (getNodeValue(el)||'').trim().length;
    return len > 40; // some minimum meaningful content length
  }
  function focusCaptureHandler(e){
    if(externalBodyEl) return; // already locked
    const el = e.target;
    if(!candidateOk(el)) return;
    // Only consider fairly editable nodes
    if(el.tagName==='TEXTAREA' || el.isContentEditable || (el.getAttribute && el.getAttribute('role')==='textbox')){
      externalBodyEl = el;
      setStatus('Éditeur détecté (focus)');
      attachExternalListeners();
      ensureLauncher();
    }
  }
  function startDetectionObserver(){
    if(detectionObserver) return;
    try {
      detectionObserver = new MutationObserver(()=>{
        if(externalBodyEl) return;
        const found = findExternalBody();
        if(found){
          externalBodyEl = found;
          setStatus('Éditeur détecté');
          attachExternalListeners();
          ensureLauncher();
        }
      });
      detectionObserver.observe(document.body,{childList:true,subtree:true});
    } catch(_){ /* ignore */ }
  }
  function attachExternalListeners(){
    const liveCb = panel.querySelector('#ai-live-sync');
    const handler = ()=>{
      if(!panel) return;
      // If live checkbox is absent treat live sync as enabled
      if(liveCb && !liveCb.checked) return;
      // Avoid overwriting fresh assistant edits within last 500ms
      if(Date.now() - lastAssistantEdit < 500) return;
      const bVal = externalBodyEl ? getNodeValue(externalBodyEl) : null;
      let changed=false;
      if(bVal!==null && bVal!==body().value){ body().value=bVal; changed=true; }
      if(changed) setStatus('Live sync');
    };
    [externalSubjectEl, externalBodyEl].forEach(el=>{
      if(!el) return;
      ['input','change','keyup'].forEach(evt=> el.addEventListener(evt, handler));
      // Mutation observer for non-input changes (e.g., programmatic set)
      const mo = new MutationObserver(handler);
      mo.observe(el, { characterData:true, subtree:true, childList:true });
    });
  }
  function pushToEditor(){
    try {
      pushBody();
      setStatus('Poussé vers éditeur');
    } catch(e){ setStatus('Échec push'); }
  }
  function pushBody(){ if(!externalBodyEl) externalBodyEl = findExternalBody(); if(externalBodyEl){ setNodeValue(externalBodyEl, body().value); } }
  function applyCustomSelectors(){}
  function clearCustomSelectors(){}
  function updateBindingInfo(){}
  function setNodeValue(node, val){
    if(!node) return;
    if(node.tagName==='INPUT' || node.tagName==='TEXTAREA') { node.value = val; node.dispatchEvent(new Event('input',{bubbles:true})); node.dispatchEvent(new Event('change',{bubbles:true})); return; }
    if(node.isContentEditable){ node.innerText = val; node.dispatchEvent(new Event('input',{bubbles:true})); return; }
    // Non-editable viewer: do not attempt to overwrite
  }
  // buildInstruction removed (simplified flow)

  function escapeHtml(s){ return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
  function escapeReg(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }

  // --- Connectivity diagnostics ---
  function testBackendConnectivity(){
    try {
      fetch(API_ROOT+'/api/ping',{cache:'no-store'}).then(r=>{
        if(!r.ok) throw new Error('HTTP '+r.status);
        return r.json();
      }).then(()=>{ setStatus('Serveur OK'); })
      .catch(err=>{ setStatus('Backend indisponible'); console.warn('[ai-optional] backend ping failed', err); showConnectionHint(); });
    } catch(e){ setStatus('Backend erreur'); showConnectionHint(); }
  }
  function showConnectionHint(){
    if(!panel) return;
    const hintId='ai-conn-hint';
    if(panel.querySelector('#'+hintId)) return;
    const div=document.createElement('div');
    div.id=hintId;
    div.style.cssText='background:#fff3cd;border:1px solid #facc15;padding:8px 10px;font-size:11.5px;border-radius:6px;margin:6px 14px;line-height:1.35;color:#723b13;';
    div.innerHTML='<strong>Connexion API absente.</strong><br>Serveur attendu: <code>'+(API_ROOT||'(même origine)')+'</code><br>1. Lance <code>node server.js</code><br>2. Vérifie <code>/api/ping</code><br>3. Si différent domaine, définis <code>window.AI_API_BASE</code> ou &lt;meta name="ai-api-base" content="https://tondomaine"&gt;.';
    panel.querySelector('.body')?.prepend(div);
  }
  // Periodic backend heartbeat every 45s
  setInterval(()=>{ if(panel) testBackendConnectivity(); }, 45_000);

  function postJsonWithRetry(url, payload, retries, delay){
    return new Promise((resolve,reject)=>{
      const attempt=(n)=>{
        fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
          .then(r=> r.json().then(j=>({ok:r.ok,status:r.status,json:j})))
          .then(({ok,status,json})=>{
            if(!ok && status>=500 && n<retries){ return setTimeout(()=>attempt(n+1), delay*Math.pow(2,n)); }
            resolve(json);
          })
          .catch(err=>{ if(n<retries) return setTimeout(()=>attempt(n+1), delay*Math.pow(2,n)); reject(err); });
      };
      attempt(0);
    });
  }

  function loadPrefs(){ try { return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'); } catch(_){ return {}; } }
  function savePrefs(){ try { if(!panel) { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...prefs, lang, sizeIndex })); return; } const rect=panel.getBoundingClientRect(); const bodyWrap=document.getElementById('ai-body-wrap'); const collapsed = bodyWrap && bodyWrap.style.display==='none'; const out = { ...prefs, lang, position:{ x:rect.left, y:rect.top }, size:{ w:rect.width, h:rect.height }, collapsed, sizeIndex }; localStorage.setItem(STORAGE_KEY, JSON.stringify(out)); } catch(_){ /* ignore */ } }
  function scheduleAutoPush(){} // disabled

  // Auto sync loop tries for up to ~20s (40 * 500ms) to detect & import external body text
  function startAutoSyncLoop(){
    let attempts = 0;
    const maxAttempts = 40;
    const timer = setInterval(()=>{
      if(!panel){ clearInterval(timer); return; }
      if(!externalBodyEl) externalBodyEl = findExternalBody();
      if(externalBodyEl){
        const extVal = getNodeValue(externalBodyEl).trim();
        if(extVal && (lastAssistantEdit===0) && body().value.trim()!==extVal){
          body().value = extVal;
          setStatus('Auto-sync');
          clearInterval(timer);
          return;
        }
        attempts++;
        if(attempts >= maxAttempts) clearInterval(timer);
        return;
      }
      attempts++;
      if(attempts >= maxAttempts) clearInterval(timer);
    }, 500);
  }

})();
