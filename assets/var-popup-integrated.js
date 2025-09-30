// Integrated transformation: take the existing variables collapsible section and render it inside a movable/resizable popup.
// Assumptions:
// - The compiled bundle renders a variables collapsible driven by a toggle button containing localized label (fr: 'Variables', en: 'Variables').
// - There is a banner containing the 'Éditez votre courriel' label (fr) or 'Edit your email' (en).
// Strategy:
// 1. Wait for the app root to finish initial render (MutationObserver + retry loop).
// 2. Locate the existing variables trigger & content container.
// 3. Detach its content into a new popup shell; leave the original trigger hidden.
// 4. Inject a new "Variables" button into the email edit banner to toggle the popup.
// 5. Provide drag + resize + remember position/size in localStorage.
// 6. Provide a fallback if structure not found (creates an empty popup with message).
(function(){
  const VAR_POPUP_SCRIPT_VERSION = 'v1.5.3';
  const MAGNETIC_LEEWAY_PX = 100; // User-configurable upward drag allowance above banner before snapping
  const IS_SAFARI = /^((?!chrome|android).)*safari/i.test(navigator.userAgent||'');
  const LS_KEY_POS='VAR_POPUP_POS_V1';
  const LS_KEY_OPEN='VAR_POPUP_OPEN_V1';
  const LS_KEY_BASE='VAR_POPUP_BASE_V1';
  const LABEL_FR='Éditez votre courriel';
  const VAR_LABEL_REGEX=/(^|\s)Variables(\s|$)/i;
  let popup=null, extracted=false, originalParent=null, originalNext=null;
  let capturedVarPanel=null; // fallback reference to variables content when original toggle removed

  function log(...a){ console.debug('[var-popup-integrated]',...a); }

  // Boundary where panel should not visually cross (flush with banner bottom). Previously had +8 margin; removed per request.
  function bannerBottomOffset(){
    try { const b=findEditBanner(); if(!b) return 0; const r=b.getBoundingClientRect(); return r.bottom; } catch(_) { return 0; }
  }

  function clampPanelToViewport(panel){
    if(!panel) return;
    const rect=panel.getBoundingClientRect();
    const minTop=bannerBottomOffset();
    let top=parseFloat(panel.style.top)||rect.top;
    let left=parseFloat(panel.style.left)||rect.left;
    if(top < minTop) top = minTop;
    // keep a small margin horizontally
    if(left + rect.width > window.innerWidth - 6) left = Math.max(6, window.innerWidth - rect.width - 6);
    if(left < 6) left = 6;
    // prevent dropping below viewport bottom (if too tall just pin with margin)
    if(top + rect.height > window.innerHeight - 10){ top = Math.max(minTop, window.innerHeight - rect.height - 10); }
    panel.style.top = Math.round(top) + 'px';
    panel.style.left = Math.round(left) + 'px';
  }

  function findEditBanner(){
    const candidates = Array.from(document.querySelectorAll('div,header,section'));
    // Prefer elements whose class hints it's a card/header
    const primary = candidates.filter(el=> /card-header|header|banner|toolbar/i.test(el.className) && new RegExp(LABEL_FR,'i').test(el.textContent||''));
    if(primary.length) return primary[0];
    return candidates.find(el=> new RegExp(LABEL_FR,'i').test(el.textContent||''));
  }

  function ensureStyles(){
    if(document.getElementById('var-popup-style')) return;
    const st=document.createElement('style');
    st.id='var-popup-style';
    st.textContent=`
      [data-var-popup='1']{backdrop-filter:blur(6px);} /* subtle depth */
      [data-var-popup='1'][data-resizing='1']{box-shadow:0 0 0 2px var(--tb-teal),0 12px 42px -10px rgba(15,23,42,0.45),0 4px 16px -4px rgba(15,23,42,0.30);} 
      [data-var-popup='1'] [data-var-popup-header]{position:sticky;top:0;z-index:5;}
      [data-var-popup='1'] .var-popup-body{flex:1 1 auto; overflow:auto; padding:4px 12px 12px 12px; scrollbar-width:thin; scrollbar-color: var(--tb-teal) transparent;}
      [data-var-popup='1'] .var-popup-body > *:first-child{margin-top:0 !important;}
      [data-var-popup='1'] .var-popup-body::-webkit-scrollbar{width:12px;}
      [data-var-popup='1'] .var-popup-body::-webkit-scrollbar-track{background:transparent;}
      [data-var-popup='1'] .var-popup-body::-webkit-scrollbar-thumb{background:var(--tb-teal);border-radius:10px;border:3px solid #ffffff80;}
      [data-var-popup='1'] .var-popup-body::-webkit-scrollbar-thumb:hover{background:#0fa3c4;}
      [data-var-popup='1'] .var-popup-handle{position:absolute;z-index:30;}
  [data-var-popup='1'] .var-popup-handle[data-edge='se']{right:-6px;bottom:-6px;width:22px;height:22px;background:var(--tb-teal,#0d8094);border:2px solid #fff;border-radius:8px;box-shadow:0 2px 6px -1px rgba(0,0,0,0.35),0 1px 2px rgba(0,0,0,0.4);cursor:nwse-resize;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;color:#fff;transition:background .18s,transform .18s;}
  [data-var-popup='1'] .var-popup-handle[data-edge='se']:before{content:'⇲';filter:drop-shadow(0 1px 1px rgba(0,0,0,.35));}
  [data-var-popup='1'] .var-popup-handle[data-edge='se']:hover{background:#0fa3c4;}
  [data-var-popup='1'] .var-popup-handle[data-edge='se']:active{transform:scale(.9);}      
  /* Magnetic snap animation */
  [data-var-popup='1'].vp-snapping{transition:top .28s cubic-bezier(.4,0,.2,1);}  
      /* Collapse the original container space once popup is floating */
  /* Collapsed original variables panel wrapper: keep it out of flow without merging sibling backgrounds */
  [data-var-popup-shell]{height:0 !important;min-height:0 !important;margin:0 !important;padding:0 !important;border:0 !important;overflow:hidden !important;display:block !important;width:0 !important;background:transparent !important;}
      [data-var-popup-fallback-btn]{position:fixed;top:12px;right:12px;z-index:2147484100;background:var(--tb-sage-muted,#c2d469);color:#1e3a5f;border:1px solid #8f9c40;padding:8px 18px;border-radius:16px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 4px 18px -4px rgba(0,0,0,.25);}
    `;
    document.head.appendChild(st);
  }
  function findVariablesToggle(){
    // Broaden search: buttons, role=button, elements with tabindex that contain the label
    const candidates = Array.from(document.querySelectorAll('button,[role="button"],[tabindex]'));
    return candidates.find(b=> VAR_LABEL_REGEX.test((b.textContent||'').trim()));
  }
  function getVariablesContentFromToggle(toggle){
    if(!toggle) return null;
    // ARIA pattern: aria-controls points to panel id
    const ctrlId = toggle.getAttribute('aria-controls');
    if(ctrlId){ const panel=document.getElementById(ctrlId); if(panel) return panel; }
    // Disclosure pattern: nextElementSibling may be the content region
    if(toggle.nextElementSibling && (toggle.nextElementSibling.querySelector('input,textarea,select') || /variable/i.test(toggle.nextElementSibling.textContent||''))){
      return toggle.nextElementSibling;
    }
    // Search nearby for a region/section with multiple inputs
    const parent=toggle.parentElement; if(parent){
      const candidates=[...parent.querySelectorAll('div,section')].filter(el=> el!==toggle && el.querySelector('input'));
      if(candidates.length) return candidates.sort((a,b)=> a.textContent.length - b.textContent.length)[0];
    }
    return null;
  }
  function findVariablesPanel(){
    const toggle=findVariablesToggle();
    if(toggle){
      const content=getVariablesContentFromToggle(toggle);
      if(!content) return null;
      let ancestor=content; let depth=0;
      while(ancestor && depth<8){ if(ancestor.contains(toggle)) break; ancestor=ancestor.parentElement; depth++; }
      return ancestor || content;
    }
    // Fallback: if toggle removed, use capturedVarPanel heuristic
    if(capturedVarPanel){
      // Try to return a higher-level wrapper containing multiple inputs if possible
      let wrap=capturedVarPanel; let scans=0;
      while(wrap && scans<6){
        const inputs=wrap.querySelectorAll && wrap.querySelectorAll('input,textarea,select');
        if(inputs && inputs.length>2) return wrap; // likely the original panel wrapper
        wrap=wrap.parentElement; scans++;
      }
      return capturedVarPanel;
    }
    // Heuristic search (last resort) — look for a container with several inputs and variable-like labels
    try {
      const candidates = Array.from(document.querySelectorAll('div,section,form'));
      const scored = candidates.map(el=>{
        const inputs = el.querySelectorAll('input,textarea,select').length;
        if(inputs < 3) return null;
        const txt = (el.textContent||'').toLowerCase();
        const score = inputs + ( /variable|approx|page|nombre/i.test(txt) ? 5:0 );
        if(score >= 6) return { el, score };
        return null;
      }).filter(Boolean).sort((a,b)=> b.score - a.score);
      if(scored.length){ log('heuristic variables panel pick', scored[0].el); return scored[0].el; }
    } catch(_){ }
    return null;
  }

  function ensureVariablesExpanded(){
    const toggle=findVariablesToggle(); if(!toggle) return;
    const expanded = toggle.getAttribute('aria-expanded');
    if(expanded==='false' || expanded===null){ toggle.click(); }
    // Also remove any hidden classes on associated content
    const panel=getVariablesContentFromToggle(toggle); if(panel){ panel.classList.remove('hidden'); panel.style.display=''; }
  }

  function persistState(wrap){
    const r=wrap.getBoundingClientRect();
    localStorage.setItem(LS_KEY_POS, JSON.stringify({ x:Math.round(r.left), y:Math.round(r.top), w:Math.round(r.width), h:Math.round(r.height) }));
  }
  function restoreSize(wrap){
    try{ const pos=JSON.parse(localStorage.getItem(LS_KEY_POS)||'null'); if(pos){ wrap.style.height=pos.h+'px'; } }catch{}
  }
  function enableDrag(handle, target){
    let sx,sy,ox,oy,drag=false; let lastTop=0;
    handle.addEventListener('mousedown', e=>{ drag=true; sx=e.clientX; sy=e.clientY; const r=target.getBoundingClientRect(); ox=r.left; oy=r.top; lastTop=oy; document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up); e.preventDefault(); });
    function mv(e){
      if(!drag) return; const dx=e.clientX-sx, dy=e.clientY-sy; const boundary=bannerBottomOffset();
      const newLeft = Math.max(0, ox+dx);
      // Allow the panel to drift up to MAGNETIC_LEEWAY_PX into the header region while dragging (gives user feedback before snap) but not higher
      const rawTop = oy+dy;
      const minDragTop = boundary - MAGNETIC_LEEWAY_PX; // limit how far it can be dragged upward
      const newTop = rawTop < minDragTop ? minDragTop : rawTop;
      lastTop=newTop;
      target.style.left=newLeft+'px'; target.style.top=newTop+'px';
    }
    function performSnap(boundary){
      // Animate only if above boundary
      if(lastTop < boundary){
        target.classList.add('vp-snapping');
        target.style.top = boundary + 'px';
        const done=()=>{ target.classList.remove('vp-snapping'); target.style.transition=''; target.removeEventListener('transitionend',done); persistState(target); };
        target.addEventListener('transitionend',done);
        // Fallback removal in case transitionend doesn't fire (e.g., user sets reduce motion)
        setTimeout(()=>{ if(target.classList.contains('vp-snapping')){ target.classList.remove('vp-snapping'); persistState(target);} }, 400);
      } else {
        clampPanelToViewport(target); persistState(target);
      }
    }
    function up(){ if(drag){ drag=false; const boundary=bannerBottomOffset(); performSnap(boundary); } document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up); }
  }

  function injectBannerButton(){
    const banner = findEditBanner();
    if(!banner){
      if(!document.querySelector('[data-var-popup-fallback-btn]')){
        const fb=document.createElement('button');
        fb.setAttribute('data-var-popup-fallback-btn','');
        fb.textContent='Variables';
        fb.onclick=()=>{ if(!popup){ transformExistingPanel(); } else { popup.style.display = popup.style.display==='none' ? 'block':'none'; localStorage.setItem(LS_KEY_OPEN, popup.style.display==='none'?'0':'1'); } };
        document.body.appendChild(fb);
      }
      return;
    }
    if(banner.querySelector('#varMgrBtn')) return;
    const btn=document.createElement('button');
    btn.id='varMgrBtn'; btn.type='button'; btn.textContent='Variables';
    btn.style.cssText='margin-left:auto;background:var(--tb-sage-muted,#c2d469);color:#1e3a5f;border:1px solid #8f9c40;padding:6px 16px;border-radius:14px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,0.18);display:inline-flex;align-items:center;gap:6px;transition:background .18s,box-shadow .18s;line-height:1;position:relative;z-index:2147484000;';
    btn.onmouseenter=()=>{ btn.style.background='#b1c25e'; };
    btn.onmouseleave=()=>{ btn.style.background='var(--tb-sage-muted,#c2d469)'; };
    btn.onclick=()=>{
      if(!popup){
        let attempts=0; let delay=100;
        const ensure=()=>{
          attempts++;
          if(transformExistingPanel()){
            popup.style.display='block';
            localStorage.setItem(LS_KEY_OPEN,'1');
            return;
          }
            if(attempts>20){
              console.warn('[var-popup-integrated] failed to build popup after retries – creating placeholder');
              buildEmptyPanel();
              return;
            }
          delay = Math.min(900, Math.round(delay*1.4));
          setTimeout(ensure, delay);
        };
        ensure();
        return;
      }
      if(popup.style.display==='none'){
        popup.style.display='block';
        localStorage.setItem(LS_KEY_OPEN,'1');
      } else {
        popup.style.display='none';
        localStorage.setItem(LS_KEY_OPEN,'0');
      }
    };
    const actionSlot = banner.querySelector('[data-slot="card-action"]');
    if(actionSlot) actionSlot.appendChild(btn); else {
      const titleEl = Array.from(banner.querySelectorAll('*')).find(n=> /Éditez votre courriel|Edit your email/i.test(n.textContent||''));
      if(titleEl){
        const parent=titleEl.parentElement;
        if(parent===banner && getComputedStyle(banner).display.includes('grid')){ btn.style.justifySelf='end'; banner.appendChild(btn); }
        else if(parent){ parent.insertAdjacentElement('beforeend', btn); }
        else banner.appendChild(btn);
      } else banner.appendChild(btn);
    }
    // Remove fallback floating button if it existed
    const fallback=document.querySelector('[data-var-popup-fallback-btn]'); if(fallback) fallback.remove();
    const mo=new MutationObserver(()=>{ if(!document.body.contains(btn)){ const b=findEditBanner(); if(b && !b.querySelector('#varMgrBtn')) b.appendChild(btn); } });
    mo.observe(document.body,{childList:true,subtree:true});
  }

  function suppressOriginalVariablesToggle(){
    const kill=(node)=>{
      if(!node) return false;
      if(node.id==='varMgrBtn' || (node.hasAttribute && node.hasAttribute('data-var-popup-fallback-btn'))) return false;
      if(node.tagName==='BUTTON' && VAR_LABEL_REGEX.test(node.textContent||'')){
        // Capture panel before hiding
        try { const panel=getVariablesContentFromToggle(node); if(panel) capturedVarPanel=panel; } catch(_){ }
        node.setAttribute('data-var-toggle-hidden','');
        node.style.display='none';
        return true; }
      return false;
    };
    Array.from(document.querySelectorAll('button')).forEach(kill);
    const obs=new MutationObserver(muts=>{ muts.forEach(m=> m.addedNodes && m.addedNodes.forEach(n=>{ if(n.nodeType===1){ if(kill(n)) return; Array.from(n.querySelectorAll? n.querySelectorAll('button'):[]).forEach(kill);} })); });
    obs.observe(document.body,{childList:true,subtree:true});
  }
  function transformExistingPanel(){
    if(extracted) return true;
  ensureVariablesExpanded();
  let panel=findVariablesPanel();
    if(!panel){
      log('transformExistingPanel: panel not found yet');
      return false;
    }
    // If we previously moved it to body, attempt to restore into original parent to keep React synthetic events intact
    if(panel.parentElement===document.body && originalParent){
      if(originalNext) originalParent.insertBefore(panel, originalNext); else originalParent.appendChild(panel);
      log('Restored panel into original React root container');
    } else {
      originalParent = originalParent || panel.parentElement;
      originalNext = originalNext || panel.nextSibling;
    }
    // Apply floating styles without altering internal look (keep teal header etc.)
    if(!panel.getAttribute('data-var-popup')){
      panel.setAttribute('data-var-popup','1');
      // Remember initial dimensions
      const saved = (()=>{ try{return JSON.parse(localStorage.getItem(LS_KEY_POS)||'null');}catch{return null;} })();
      const rect = panel.getBoundingClientRect();
      let top  = saved? saved.y : Math.min(rect.top, window.innerHeight-200);
      const left = saved? saved.x : 40;
      const width= saved? saved.w : Math.min(Math.max(rect.width, 640), window.innerWidth-80);
      const height=saved? saved.h : Math.min(Math.max(rect.height, 420), window.innerHeight-120);
      // Reposition upward to reclaim original collapsible space (only on first build if not saved)
      if(!saved){
        const banner=findEditBanner();
        if(banner){ const bRect=banner.getBoundingClientRect(); top = Math.min(top, Math.max( bRect.bottom + 8, 20)); }
      }
      // Store baseline size once
      if(!localStorage.getItem(LS_KEY_BASE)){
        localStorage.setItem(LS_KEY_BASE, JSON.stringify({ w:Math.round(width), h:Math.round(height) }));
      }
      // Preserve existing rounded corners / background - only add positioning & shadow
      Object.assign(panel.style, {
        position:'fixed', top: top+'px', left:left+'px', width: width+'px', height: height+'px', zIndex:'2147483900',
        maxHeight: 'calc(100vh - 80px)', overflow:'hidden', boxShadow:'0 12px 42px -10px rgba(15,23,42,0.45),0 4px 16px -4px rgba(15,23,42,0.30)', background:'#ffffff', borderRadius:'18px', border:'1px solid rgba(0,0,0,0.08)', display:'flex', flexDirection:'column'
      });
      // Ensure a consistent teal banner (if not already visually distinct) by wrapping existing first child
      let header = panel.querySelector('[data-var-popup-header]');
      if(!header){
        const first = panel.firstElementChild;
        // Create a banner wrapper keeping existing content below it
        header=document.createElement('div');
        header.setAttribute('data-var-popup-header','');
        header.style.cssText='background:var(--tb-teal);color:#fff;padding:10px 14px;font-weight:600;font-size:15px;letter-spacing:.4px;display:flex;align-items:center;gap:10px;border-top-left-radius:inherit;border-top-right-radius:inherit;user-select:none;cursor:move;';
        header.innerHTML = '<span style="display:inline-flex;align-items:center;gap:10px">'
          + '<span style="display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;font-family:ui-monospace,monospace;letter-spacing:.5px;color:#fff">{ }</span>'
          + '<span>Variables</span>'
          + '</span>';
        panel.insertBefore(header, first);
      }
      if(header && !header.querySelector('[data-var-popup-controls]')){
        const ctr=document.createElement('div');
        ctr.setAttribute('data-var-popup-controls','');
        ctr.style.cssText='margin-left:auto;display:flex;gap:6px;';
        const btnBase='background:rgba(255,255,255,0.18);backdrop-filter:blur(3px);color:#fff;border:1px solid rgba(255,255,255,0.28);padding:4px 10px;border-radius:10px;cursor:pointer;font-size:12px;font-weight:600;line-height:1;display:inline-flex;align-items:center;justify-content:center;min-width:32px;';
  ctr.innerHTML=`<button data-vp-min style="${btnBase}" title="Minimiser">—</button><button data-vp-expand style="${btnBase}" title="Adapter automatiquement">⛶</button><button data-vp-close style="${btnBase}" title="Fermer">✕</button>`;
        header.style.position='relative'; header.style.display='flex';
        header.appendChild(ctr);
        // Drag by banner (except when clicking buttons)
        enableDrag(header, panel);
        const contentNodes=()=> Array.from(panel.children).filter(c=> !c.hasAttribute('data-var-popup-header') && !c.matches('[data-var-popup-controls]'));
        ctr.querySelector('[data-vp-close]').onclick=()=>{ panel.style.display='none'; localStorage.setItem(LS_KEY_OPEN,'0'); };
        ctr.querySelector('[data-vp-min]').onclick=()=>{
          const kids=contentNodes();
          const minimized = kids.every(k=> k.style.display==='none');
          kids.forEach(k=> k.style.display = minimized ? '' : 'none');
          if(!minimized){ panel.style.height='auto'; } else { restoreSize(panel); }
        };
        ctr.querySelector('[data-vp-expand]').onclick=()=>{ autoFit(panel); };
  // Show only if previously explicitly opened
  if(localStorage.getItem(LS_KEY_OPEN)==='1') panel.style.display='block'; else panel.style.display='none';
      }
      // Build inner scroll container once
      buildBody(panel, header);
      // Add visible resize handles (corners & edges)
      addResizeHandles(panel);
    } // end first-time style/init block
    const toggle=findVariablesToggle(); if(toggle) toggle.style.display='none';
    // Collapse original wrapper container space (parent) if still in document flow
    if(originalParent && originalParent !== document.body){
      originalParent.setAttribute('data-var-popup-shell','');
      collapseEmptyAncestors(panel, originalParent);
    }
  extracted=true; popup=panel; clampPanelToViewport(panel); persistState(panel); log('Variables panel floating (not detached from React root).');
    // Safe to hide original toggle now
    suppressOriginalVariablesToggle();
    return true;
  }

  function collapseEmptyAncestors(panel, startParent){
    // Previously climbed ancestors collapsing them; now we limit to only the direct wrapper
    if(startParent && startParent!==document.body){
      startParent.setAttribute('data-var-popup-shell','');
    }
  }

  // Internal scroll container builder (ensures header remains sticky and future React re-renders are captured)
  function buildBody(panel, header){
    if(panel.querySelector('.var-popup-body')) return;
    const body=document.createElement('div'); body.className='var-popup-body';
    const moving=[]; Array.from(panel.childNodes).forEach(n=>{ if(n!==header) moving.push(n); });
    moving.forEach(n=> body.appendChild(n));
    panel.appendChild(body);
    const obs=new MutationObserver(muts=>{
      muts.forEach(m=>{
        m.addedNodes && m.addedNodes.forEach(node=>{
          if(node.nodeType===1 && panel===node.parentElement && node!==header && !body.contains(node)){
            body.appendChild(node);
          }
        });
      });
    });
    obs.observe(panel,{childList:true});
  }

  function addResizeHandles(panel){
    // Remove any old extra handles except se
    Array.from(panel.querySelectorAll('.var-popup-handle')).forEach(h=>{ if(h.getAttribute('data-edge')!=='se') h.remove(); });
    if(!panel.querySelector(".var-popup-handle[data-edge='se']")){
      const h=document.createElement('div'); h.className='var-popup-handle'; h.setAttribute('data-edge','se'); h.title='Redimensionner'; panel.appendChild(h);
    }
    let resizing=false,sx=0,sy=0,sw=0,sh=0;
    function move(e){ if(!resizing) return; const dx=e.clientX-sx, dy=e.clientY-sy; const w=Math.max(480, sw+dx); const h=Math.max(300, sh+dy); panel.style.width=w+'px'; panel.style.height=h+'px'; }
    function up(){ if(resizing){ resizing=false; panel.removeAttribute('data-resizing'); persistState(panel); document.removeEventListener('mousemove',move); document.removeEventListener('mouseup',up);} }
    panel.addEventListener('mousedown', e=>{
      if(e.target.getAttribute && e.target.getAttribute('data-edge')==='se' && e.button===0){
        const r=panel.getBoundingClientRect(); sx=e.clientX; sy=e.clientY; sw=r.width; sh=r.height; resizing=true; panel.setAttribute('data-resizing','1');
        document.addEventListener('mousemove',move); document.addEventListener('mouseup',up); e.preventDefault();
      }
    });
  }

  function autoFit(panel){
    if(!panel) return;
    // Ensure visible
    panel.style.display='block';
    localStorage.setItem(LS_KEY_OPEN,'1');
    const header=panel.querySelector('[data-var-popup-header]');
    const body=panel.querySelector('.var-popup-body');
    if(!body) return;
    // Un-minimize any hidden children
    Array.from(panel.children).forEach(ch=>{ if(ch!==header && ch.style.display==='none') ch.style.display=''; });
    // Natural size measurement
    panel.style.height='auto';
    body.style.maxHeight='none';
    // Force reflow
    const headerH=header? header.getBoundingClientRect().height : 0;
    const desiredContentH=body.scrollHeight;
    const maxH=window.innerHeight - 60;
    const newH=Math.min(headerH + desiredContentH, maxH);
    panel.style.height=newH+'px';
    // Width fit (allow some slack)
    const desiredW=Math.min(Math.max(480, body.scrollWidth + 40), window.innerWidth - 40);
    panel.style.width=desiredW+'px';
    // Keep in viewport
    const r=panel.getBoundingClientRect();
    let newTop=r.top; let newLeft=r.left;
    if(r.bottom>window.innerHeight) newTop=Math.max(20, window.innerHeight - r.height - 20);
    if(r.right>window.innerWidth) newLeft=Math.max(10, window.innerWidth - r.width - 20);
    panel.style.top=newTop+'px'; panel.style.left=newLeft+'px';
    clampPanelToViewport(panel); persistState(panel);
  }
  // buildBody was defined earlier correctly (outside of listeners)
  // end helpers region

  function waitForApp(){
    const max= IS_SAFARI ? 90 : 40; // extend attempts for Safari slower initial layout
    let attempts=0;
    const interval=setInterval(()=>{
      attempts++;
      const toggle=findVariablesToggle();
      const banner=findEditBanner();
      if(toggle && banner){ clearInterval(interval); onReady(); }
      if(attempts>=max){ clearInterval(interval); onReady(); }
    },250);
  }
  function onReady(){
    ensureStyles();
    injectBannerButton();
    // (Delayed) suppressOriginalVariablesToggle now called only after successful extraction
    // Version badge removed in production cleanup (was previously injected for debugging between browsers)
    // Auto-build popup if previously open
    if(localStorage.getItem(LS_KEY_OPEN)==='1'){
      const attempt=()=>{ if(transformExistingPanel()){ clampPanelToViewport(popup); return; } setTimeout(attempt,400); }; attempt();
    }
    // Start background autodetect if panel not yet extracted (helps Simple Browser delayed renders)
    startPanelAutodetect();
    // Force detect button removed per request
    enhanceResetButton();
  }

  let autodetectStarted=false;
  function startPanelAutodetect(){
    if(autodetectStarted || extracted) return; autodetectStarted=true;
    let tries=0; const max=60; // ~30s at 500ms
    const iv=setInterval(()=>{
      if(extracted){ clearInterval(iv); return; }
      tries++;
      if(transformExistingPanel()) { clearInterval(iv); log('Auto-detected panel via interval'); return; }
      if(tries>=max){ clearInterval(iv); log('Auto-detect interval ended (max tries)'); }
    },500);
    // Mutation observer heuristic
    const mo=new MutationObserver(muts=>{
      if(extracted) { mo.disconnect(); return; }
      for(const m of muts){
        for(const n of m.addedNodes){
          if(!(n instanceof HTMLElement)) continue;
          // Heuristic: node or descendant with >=3 inputs and a textarea (body) indicates variables zone
          const inputs = n.querySelectorAll ? n.querySelectorAll('input,textarea,select') : [];
            if(inputs.length>=3 && n.textContent && /page|pages|variable|nombre|approx/i.test(n.textContent)){
              if(transformExistingPanel()){ mo.disconnect(); log('Auto-detected panel via mutation observer'); return; }
            }
        }
      }
    });
    try { mo.observe(document.body,{childList:true,subtree:true}); } catch(_){ }
    // Final rescue after 8s if still not extracted
    setTimeout(()=>{ if(!extracted) rescueHeuristicBuild(); }, 8000);
  }

  function rescueHeuristicBuild(){
    try {
      if(extracted) return;
      log('rescueHeuristicBuild: attempting manual shell');
      // Look for a big form/section with many inputs
      const sections = Array.from(document.querySelectorAll('form,section,div'));
      let best=null; let bestScore=0;
      sections.forEach(el=>{
        if(el.getBoundingClientRect().height < 120) return;
        const inputs=el.querySelectorAll('input,textarea,select').length;
        if(inputs<3) return;
        const txt=(el.textContent||'').toLowerCase();
        let score=inputs;
        if(/variable|approx|pages|page|nombre/.test(txt)) score+=5;
        if(score>bestScore){ bestScore=score; best=el; }
      });
      if(!best){ log('rescueHeuristicBuild: no candidate'); return; }
      capturedVarPanel = best; // adopt as panel
      if(transformExistingPanel()){ log('rescueHeuristicBuild: success'); popup && (popup.style.display='block'); localStorage.setItem(LS_KEY_OPEN,'1'); autoFit(popup); }
    } catch(e){ log('rescueHeuristicBuild error', e); }
  }

  function buildEmptyPanel(){
    if(extracted || popup) return;
    log('buildEmptyPanel: creating placeholder shell');
    const shell=document.createElement('div');
    shell.setAttribute('data-var-popup','1');
    shell.innerHTML='<div data-var-popup-header style="background:var(--tb-teal);color:#fff;padding:10px 14px;font-weight:600;font-size:15px;border-radius:18px 18px 0 0;cursor:move;">Variables</div><div class="var-popup-body" style="padding:12px;font:13px system-ui;">Section des variables introuvable pour le moment.<br><br><em>Le contenu ne s\'est pas encore rendu.</em><br><br><button type="button" data-vp-retry style="margin-top:8px;background:#0fa3c4;color:#fff;border:none;padding:6px 12px;border-radius:8px;cursor:pointer;font-size:12px;">Réessayer</button></div>';
    Object.assign(shell.style,{position:'fixed',top:'120px',left:'60px',width:'520px',height:'260px',zIndex:'2147483900',background:'#fff',border:'1px solid rgba(0,0,0,.08)',borderRadius:'18px',display:'flex',flexDirection:'column',boxShadow:'0 12px 42px -10px rgba(15,23,42,0.45),0 4px 16px -4px rgba(15,23,42,0.30)',overflow:'hidden'});
    document.body.appendChild(shell);
    const header=shell.querySelector('[data-var-popup-header]');
    enableDrag(header, shell);
    addResizeHandles(shell);
    popup=shell; extracted=true; localStorage.setItem(LS_KEY_OPEN,'1');
    shell.querySelector('[data-vp-retry]').onclick=()=>{
      log('emptyPanel retry: tearing down placeholder and re-attempting');
      extracted=false; popup=null; shell.remove();
      setTimeout(()=>{ if(!transformExistingPanel()) rescueHeuristicBuild(); }, 50);
    };
  }

  // Manual global escape hatch for environments where automatic detection still misses
  if(!window.forceVarPopup){
    window.forceVarPopup = function(){
      try {
        if(transformExistingPanel()){
          if(popup){ popup.style.display='block'; clampPanelToViewport(popup); localStorage.setItem(LS_KEY_OPEN,'1'); }
          return true;
        }
        rescueHeuristicBuild();
        if(!popup) buildEmptyPanel();
        return !!popup;
      } catch(e){ console.error('forceVarPopup error', e); return false; }
    };
  }

  // Keep panel clamped on window resize (header height / viewport width changes)
  window.addEventListener('resize', ()=> clampPanelToViewport(popup));

  // --- Reset Button Enhancement (global app reset) ---
  function enhanceResetButton(){
    // Inject modal + hover styles once
    if(!document.getElementById('reset-enhance-style')){
      const st=document.createElement('style'); st.id='reset-enhance-style';
      st.textContent=`button[data-reset-enhanced]{position:relative;transition:background .2s,filter .2s,transform .15s;}
      button[data-reset-enhanced]:hover{filter:brightness(1.08);transform:translateY(-1px);}button[data-reset-enhanced]:active{transform:translateY(0);} 
      .reset-confirm-overlay{position:fixed;inset:0;background:#0f172a99;backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:2147484500;animation:fadeIn .18s ease;}
      .reset-confirm-modal{background:#ffffff;border-radius:18px;box-shadow:0 18px 48px -12px rgba(15,23,42,.5),0 6px 20px -8px rgba(15,23,42,.35);width:min(420px,90%);padding:0;overflow:hidden;font:14px/1.4 system-ui,Segoe UI,Roboto,Arial;}
      .reset-confirm-head{background:var(--tb-teal,#0d8094);color:#fff;padding:14px 18px;font-weight:600;letter-spacing:.4px;display:flex;align-items:center;gap:8px;}
      .reset-confirm-body{padding:18px 20px 6px;color:#334155;font-size:13px;}
      .reset-confirm-actions{display:flex;gap:10px;padding:14px 18px 18px;background:#0d8094;border-top:1px solid #0b6a7c;}
      .reset-confirm-actions button{flex:1 1 0;background:#ffffff;border:1px solid #0b6a7c;color:#0d4a58;font-weight:600;padding:10px 0;border-radius:10px;cursor:pointer;font-size:13px;letter-spacing:.4px;display:flex;align-items:center;justify-content:center;transition:background .18s, color .18s, transform .15s;}
      .reset-confirm-actions button.primary{background:#0fa3c4;color:#fff;border-color:#0fa3c4;}
      .reset-confirm-actions button:hover{filter:brightness(1.06);} .reset-confirm-actions button:active{transform:translateY(1px);} 
      @keyframes fadeIn{from{opacity:0;transform:scale(.97);}to{opacity:1;transform:scale(1);}}
      `; document.head.appendChild(st);
    }
    function showResetConfirm(onConfirm){
      if(document.querySelector('.reset-confirm-overlay')) return; // prevent duplicates
      const ov=document.createElement('div'); ov.className='reset-confirm-overlay';
      ov.innerHTML=`<div class="reset-confirm-modal" role="dialog" aria-modal="true" aria-label="Confirmer réinitialisation">
        <div class="reset-confirm-head">Réinitialiser</div>
        <div class="reset-confirm-body">Cette action va effacer le contenu actuel (Sujet, Corps, Résultat IA). Voulez-vous continuer ?</div>
        <div class="reset-confirm-actions">
          <button type="button" data-act="cancel">Annuler</button>
          <button type="button" class="primary" data-act="ok">Confirmer</button>
        </div>
      </div>`;
      document.body.appendChild(ov);
      const close=()=>{ ov.remove(); };
      ov.addEventListener('click',e=>{ if(e.target===ov) close(); });
      ov.querySelector('[data-act="cancel"]').onclick=close;
      ov.querySelector('[data-act="ok"]').onclick=()=>{ try{ onConfirm(); } finally { close(); } };
      // Focus primary
      setTimeout(()=>{ const p=ov.querySelector('[data-act="ok"]'); p && p.focus(); }, 30);
      document.addEventListener('keydown', function esc(e){ if(e.key==='Escape'){ close(); document.removeEventListener('keydown',esc); } });
    }
    const scan=()=>{
      const buttons=Array.from(document.querySelectorAll('button')); 
      buttons.forEach(btn=>{
        if(btn.dataset.resetEnhanced) return;
        const txt=(btn.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();
        if(txt==='réinitialiser' || txt==='reinitialiser' || txt==='reset'){
          btn.dataset.resetEnhanced='1'; btn.title=btn.title||'Confirmer avant réinitialisation';
          // Capture original handlers by letting them run only after our confirm path triggers a synthetic click.
          btn.addEventListener('click', e=>{
            if(btn.dataset.resetBypass==='1') { delete btn.dataset.resetBypass; return; }
            e.stopImmediatePropagation(); e.preventDefault();
            showResetConfirm(()=>{ btn.dataset.resetBypass='1'; btn.click(); });
          }, true);
        }
      });
    };
    scan();
    const mo=new MutationObserver(()=>scan()); try{ mo.observe(document.body,{childList:true,subtree:true}); }catch(_){ }
  }


  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', waitForApp); else waitForApp();
})();
