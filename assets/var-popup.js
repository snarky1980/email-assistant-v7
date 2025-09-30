// Movable & resizable Variable Manager popup
// Injects a button into the main banner (French label variant) or creates a minimal banner if missing.
(function(){
  const BUTTON_ID = 'open-var-manager-btn';
  const POPUP_ID = 'var-manager-popup';

  function ensureBanner(){
    // Try to find an existing banner with French text substring or id
    let banner = Array.from(document.querySelectorAll('header,div,nav')).find(el=>/Éditez\s+vos?\s+courriels/i.test(el.textContent||''));
    if(!banner){
      banner = document.createElement('div');
      banner.id='editor-banner';
      banner.style.cssText='font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;background:#0a66ff;color:#fff;padding:10px 14px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;';
      banner.innerHTML='<strong style="font-size:15px;">Éditez votre courriels</strong>';
      document.body.insertBefore(banner, document.body.firstChild);
    }
    return banner;
  }

  function injectButton(){
    if(document.getElementById(BUTTON_ID)) return;
    const banner = ensureBanner();
    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.textContent = 'Variables';
    btn.type='button';
    btn.style.cssText='background:#fff;color:#0a66ff;border:none;padding:6px 12px;border-radius:8px;font-weight:600;cursor:pointer;font-size:13px;box-shadow:0 2px 4px rgba(0,0,0,0.15);';
    btn.onmouseenter=()=>{btn.style.background='#f1f5f9';};
    btn.onmouseleave=()=>{btn.style.background='#fff';};
    btn.onclick=togglePopup;
    banner.appendChild(btn);
  }

  function createPopup(){
    if(document.getElementById(POPUP_ID)) return document.getElementById(POPUP_ID);
    const wrap=document.createElement('div');
    wrap.id=POPUP_ID;
    wrap.style.cssText='position:fixed;top:120px;left:120px;width:420px;height:420px;z-index:2147483000;background:#ffffff;border:1px solid #d0d7de;border-radius:12px;display:flex;flex-direction:column;box-shadow:0 12px 40px -10px rgba(15,23,42,0.35),0 4px 14px -4px rgba(15,23,42,0.25);overflow:hidden;font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;';
    wrap.innerHTML=`<div data-drag-handle style="cursor:move;background:linear-gradient(90deg,#0a66ff,#2563eb);color:#fff;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:14px;font-weight:600;letter-spacing:.4px;">
      <span>Variables</span>
      <div style="display:flex;align-items:center;gap:6px;">
        <button type="button" data-min-btn title="Réduire" style="background:rgba(255,255,255,0.18);color:#fff;border:none;padding:4px 8px;border-radius:6px;cursor:pointer;font-size:12px;">—</button>
        <button type="button" data-close-btn title="Fermer" style="background:rgba(255,255,255,0.18);color:#fff;border:none;padding:4px 8px;border-radius:6px;cursor:pointer;font-size:12px;">✕</button>
      </div></div>
      <div style="flex:1;display:flex;flex-direction:column;padding:12px 14px;gap:10px;overflow:auto;font-size:13px;">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <input type="text" id="var-new-name" placeholder="Nouvelle variable" style="flex:1;padding:6px 8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;" />
          <button type="button" id="var-add-btn" style="background:#0a66ff;color:#fff;border:none;padding:6px 12px;border-radius:8px;font-weight:600;cursor:pointer;font-size:13px;">Ajouter</button>
        </div>
        <div id="var-list" style="display:flex;flex-direction:column;gap:6px;"></div>
        <div style="margin-top:auto;display:flex;flex-wrap:wrap;gap:8px;">
          <button type="button" id="var-detect-btn" style="background:#f1f5f9;border:1px solid #d0d7de;color:#0f172a;padding:6px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">Détecter dans le texte</button>
          <button type="button" id="var-insert-btn" style="background:#f1f5f9;border:1px solid #d0d7de;color:#0f172a;padding:6px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">Insérer sélection</button>
        </div>
      </div>
      <div data-resize-handle style="height:14px;cursor:nwse-resize;background:repeating-linear-gradient(135deg,#e2e8f0,#e2e8f0 10px,#f1f5f9 10px,#f1f5f9 20px);"></div>`;
    document.body.appendChild(wrap);
    enableDrag(wrap.querySelector('[data-drag-handle]'), wrap);
    enableResize(wrap.querySelector('[data-resize-handle]'), wrap);
    wireVariables(wrap);
    return wrap;
  }

  function togglePopup(){
    const existing=document.getElementById(POPUP_ID);
    if(existing){ existing.style.display = existing.style.display==='none'?'flex':'none'; if(existing.style.display!=='none'){ focusNewInput(); } return; }
    const p=createPopup(); focusNewInput();
  }

  function focusNewInput(){ const inp=document.getElementById('var-new-name'); if(inp){ inp.focus(); inp.select(); } }

  function enableDrag(handle, target){
    let startX, startY, origX, origY, dragging=false;
    handle.addEventListener('mousedown', e=>{ dragging=true; startX=e.clientX; startY=e.clientY; const r=target.getBoundingClientRect(); origX=r.left; origY=r.top; document.addEventListener('mousemove', move); document.addEventListener('mouseup', up); e.preventDefault(); });
    function move(e){ if(!dragging) return; const dx=e.clientX-startX, dy=e.clientY-startY; target.style.left=Math.max(0, origX+dx)+'px'; target.style.top=Math.max(0, origY+dy)+'px'; }
    function up(){ dragging=false; document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); }
  }
  function enableResize(handle, target){
    let startX,startY,startW,startH,resizing=false;
    handle.addEventListener('mousedown', e=>{ resizing=true; startX=e.clientX; startY=e.clientY; const r=target.getBoundingClientRect(); startW=r.width; startH=r.height; document.addEventListener('mousemove', move); document.addEventListener('mouseup', up); e.preventDefault(); });
    function move(e){ if(!resizing) return; const dx=e.clientX-startX, dy=e.clientY-startY; target.style.width=Math.max(320, startW+dx)+'px'; target.style.height=Math.max(260, startH+dy)+'px'; }
    function up(){ resizing=false; document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); }
  }

  // Variable list management (pure client placeholder). Could be wired to template body / admin API if present.
  const state={ vars:[] };
  function wireVariables(root){
    root.querySelector('[data-close-btn]').onclick=()=>{ root.style.display='none'; };
    root.querySelector('[data-min-btn]').onclick=()=>{ const content=root.children[1]; if(content.style.display!=='none'){ content.style.display='none'; root.style.height='auto'; } else { content.style.display='flex'; } };
    root.querySelector('#var-add-btn').onclick=()=>{ addVarFromInput(); };
    root.querySelector('#var-new-name').addEventListener('keydown', e=>{ if(e.key==='Enter'){ addVarFromInput(); }});
    root.querySelector('#var-detect-btn').onclick=detectFromCurrentEditor;
    root.querySelector('#var-insert-btn').onclick=insertSelectedIntoEditor;
  }
  function addVarFromInput(){
    const inp=document.getElementById('var-new-name'); if(!inp) return; let name=inp.value.trim(); if(!name) return; name=name.replace(/\s+/g,'');
    if(!/^[-A-Za-z0-9_À-ÖØ-öø-ÿ\.]+$/.test(name)){ alert('Nom invalide'); return; }
    if(state.vars.some(v=> v.name.toLowerCase()===name.toLowerCase())){ inp.select(); return; }
    const v={ name, id:'v_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6), selected:false };
    state.vars.push(v); inp.value=''; renderVarList();
  }
  function renderVarList(){
    const list=document.getElementById('var-list'); if(!list) return; list.innerHTML='';
    state.vars.forEach(v=>{
      const row=document.createElement('div');
      row.style.cssText='display:flex;align-items:center;gap:6px;background:#f8fafc;border:1px solid #e2e8f0;padding:6px 8px;border-radius:8px;font-size:12px;';
      row.innerHTML=`<input type="checkbox" ${v.selected?'checked':''} data-id="${v.id}" /> <code style="background:#fff;padding:2px 4px;border-radius:4px;border:1px solid #e2e8f0;"><<${v.name}>></code> <button type="button" data-ins="${v.id}" style="margin-left:auto;background:#0a66ff;color:#fff;border:none;padding:4px 8px;border-radius:6px;cursor:pointer;font-size:11px;">Insérer</button> <button type="button" data-del="${v.id}" style="background:#fee2e2;color:#b91c1c;border:none;padding:4px 6px;border-radius:6px;cursor:pointer;font-size:11px;">✕</button>`;
      list.appendChild(row);
    });
    list.querySelectorAll('input[type=checkbox]').forEach(cb=> cb.onchange=()=>{ const v=state.vars.find(x=>x.id===cb.getAttribute('data-id')); if(v){ v.selected=cb.checked; }});
    list.querySelectorAll('button[data-del]').forEach(b=> b.onclick=()=>{ const id=b.getAttribute('data-del'); state.vars=state.vars.filter(x=>x.id!==id); renderVarList(); });
    list.querySelectorAll('button[data-ins]').forEach(b=> b.onclick=()=>{ const id=b.getAttribute('data-ins'); const v=state.vars.find(x=>x.id===id); if(v) insertVarToken(v.name); });
  }
  function detectFromCurrentEditor(){
    const ta=findPrimaryEditor(); if(!ta){ alert('Aucun éditeur détecté'); return; }
    const text=ta.value || ta.innerText || '';
    const re=/<<\s*([A-Za-zÀ-ÖØ-öø-ÿ0-9_\.\-]+)\s*>>/g; let m; const found=new Set();
    while((m=re.exec(text))){ found.add(m[1]); }
    let added=0; found.forEach(name=>{ if(!state.vars.some(v=> v.name.toLowerCase()===name.toLowerCase())){ state.vars.push({ name, id:'v_'+Math.random().toString(36).slice(2,8), selected:false }); added++; } });
    if(!added) toast('Aucune nouvelle variable');
    renderVarList();
  }
  function insertSelectedIntoEditor(){
    const selected=state.vars.filter(v=> v.selected); if(!selected.length){ toast('Sélection vide'); return; }
    const ta=findPrimaryEditor(); if(!ta){ alert('Aucun éditeur'); return; }
    const tokens=selected.map(v=>'<<'+v.name+'>>');
    insertAtCursor(ta, tokens.join(' '));
    toast('Inséré');
  }
  function insertVarToken(name){
    const ta=findPrimaryEditor(); if(!ta){ alert('Aucun éditeur'); return; }
    insertAtCursor(ta, '<<'+name+'>>'); toast('Inséré');
  }
  function findPrimaryEditor(){
    // Heuristic: pick focused textarea or first large textarea/contenteditable
    const active=document.activeElement;
    if(active && (active.tagName==='TEXTAREA' || active.isContentEditable)) return active;
    const ta=document.querySelector('textarea'); if(ta) return ta;
    const ce=document.querySelector('[contenteditable=true]'); if(ce) return ce;
    return null;
  }
  function insertAtCursor(el, text){
    if(el.tagName==='TEXTAREA'){
      const start=el.selectionStart||0, end=el.selectionEnd||0; const val=el.value; el.value=val.slice(0,start)+text+val.slice(end); el.selectionStart=el.selectionEnd=start+text.length; el.dispatchEvent(new Event('input',{bubbles:true}));
    } else if(el.isContentEditable){
      document.execCommand('insertText', false, text);
    }
  }
  function toast(msg){
    let t=document.getElementById('var-popup-toast');
    if(!t){ t=document.createElement('div'); t.id='var-popup-toast'; t.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#0a66ff;color:#fff;padding:8px 14px;border-radius:20px;font-size:13px;font-weight:600;z-index:2147483500;box-shadow:0 4px 16px -4px rgba(0,0,0,0.35);'; document.body.appendChild(t); }
    t.textContent=msg; t.style.opacity='1'; clearTimeout(t._to); t._to=setTimeout(()=>{ t.style.transition='opacity .4s'; t.style.opacity='0'; },1600);
  }

  // Init after DOM ready (in case script loads before body complete)
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', injectButton); else injectButton();
})();
