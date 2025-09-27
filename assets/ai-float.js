// Floating AI Assistant Button and Modal
// Calls a local proxy at /api/openai which forwards requests to OpenAI (keeps the API key server-side)

function createAIModal() {
  const modal = document.createElement('div');
  modal.id = 'ai-modal';
  modal.style = `
    position: fixed;
    top: 0; left: 0; width: 100vw; height: 100vh;
    background: rgba(0,0,0,0.4);
    display: flex; align-items: center; justify-content: center;
    z-index: 9999;
  `;
  modal.innerHTML = `
    <div style="background: #fff; padding: 32px 24px; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.15); min-width: 350px; max-width: 90vw;">
      <h2 style="margin-top:0;">AI Writing Assistant</h2>
      <textarea id="ai-modal-input" rows="8" style="width:100%;margin-bottom:12px;" placeholder="Paste or write your email text..."></textarea>
      <div style="margin:6px 0 12px 0; display:flex; align-items:center; gap:8px;">
        <label style="font-size:0.9rem;">
          <input type="checkbox" id="ai-replace-checkbox" style="margin-right:6px;"> Replace selection
        </label>
        <span id="ai-selection-hint" style="color:#666; font-size:0.85rem; margin-left:auto;"></span>
      </div>
      <div style="margin-bottom:12px;">
        <select id="ai-modal-feature" style="width:100%;">
          <option value="polish">Polish</option>
          <option value="personalize">Personalize</option>
          <option value="adjust_tone">Adjust Tone</option>
          <option value="correct">Correct</option>
          <option value="concise">Make Concise</option>
          <option value="translate">Translate to French</option>
        </select>
      </div>
      <button id="ai-modal-run" style="width:100%;background:#0078d4;color:#fff;padding:10px 0;border:none;border-radius:6px;font-size:1rem;">Run AI</button>
      <div id="ai-modal-result" style="margin-top:18px;min-height:40px;color:#333;"></div>
      <button id="ai-modal-close" style="position:absolute;top:18px;right:18px;background:none;border:none;font-size:1.5rem;cursor:pointer;">&times;</button>
    </div>
  `;
  document.body.appendChild(modal);
  // Capture selection info so we can replace later if needed
  const selectionInfo = captureSelectionInfo();
  const hint = document.getElementById('ai-selection-hint');
  if (selectionInfo && selectionInfo.text) {
    document.getElementById('ai-modal-input').value = selectionInfo.text;
    hint.innerText = selectionInfo.isEditable ? 'Editable selection detected' : 'Selection detected';
    document.getElementById('ai-replace-checkbox').checked = !!selectionInfo.canReplace;
  } else {
    hint.innerText = '';
    document.getElementById('ai-replace-checkbox').checked = false;
  }

  document.getElementById('ai-modal-close').onclick = () => modal.remove();
  document.getElementById('ai-modal-run').onclick = async () => {
    const text = document.getElementById('ai-modal-input').value;
    const feature = document.getElementById('ai-modal-feature').value;
    const resultDiv = document.getElementById('ai-modal-result');
    const replaceChecked = document.getElementById('ai-replace-checkbox').checked;
    resultDiv.innerText = 'Processing...';
    try {
      const result = await callOpenAI(text, feature);
      resultDiv.innerText = result;
      if (replaceChecked && selectionInfo && selectionInfo.canReplace) {
        try {
          replaceSelectionWithResult(selectionInfo, result);
        } catch (err) {
          console.warn('Replace failed:', err);
        }
      }
    } catch (e) {
      resultDiv.innerText = 'Error: ' + e;
    }
  };
}

// Capture the current page selection and return useful info for replacement
function captureSelectionInfo() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return null;
  const text = sel.toString();

  // Check if selection is inside an input or textarea
  let node = sel.anchorNode;
  while (node && node.nodeType !== Node.ELEMENT_NODE) node = node.parentElement;
  const elem = node ? node.closest && node.closest('textarea, input') : null;
  if (elem) {
    try {
      const start = elem.selectionStart;
      const end = elem.selectionEnd;
      return { text, type: 'input', element: elem, start, end, canReplace: true, isEditable: true };
    } catch (e) {
      // fallthrough
    }
  }

  // Check for contentEditable
  node = sel.anchorNode;
  while (node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node;
      if (el.isContentEditable) {
        const range = sel.getRangeAt(0).cloneRange();
        return { text, type: 'contenteditable', element: el, range, canReplace: true, isEditable: true };
      }
    }
    node = node.parentElement;
  }

  // Otherwise, selection in read-only content — allow copy only
  return { text, type: 'readonly', canReplace: false, isEditable: false };
}

function replaceSelectionWithResult(selectionInfo, result) {
  if (!selectionInfo || !selectionInfo.canReplace) return;
  if (selectionInfo.type === 'input') {
    const el = selectionInfo.element;
    const start = selectionInfo.start;
    const end = selectionInfo.end;
    // Use setRangeText if available
    if (typeof el.setRangeText === 'function') {
      el.setRangeText(result, start, end, 'end');
      // trigger input events
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      const value = el.value;
      el.value = value.slice(0, start) + result + value.slice(end);
      el.selectionStart = el.selectionEnd = start + result.length;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  } else if (selectionInfo.type === 'contenteditable') {
    const range = selectionInfo.range;
    range.deleteContents();
    const textNode = document.createTextNode(result);
    range.insertNode(textNode);
    // Move caret after inserted text
    const sel = window.getSelection();
    sel.removeAllRanges();
    const newRange = document.createRange();
    newRange.setStartAfter(textNode);
    newRange.collapse(true);
    sel.addRange(newRange);
  }
}

function createAIButton() {
  const btn = document.createElement('button');
  btn.id = 'ai-float-btn';
  btn.innerText = 'AI Assistant';
  btn.style = `
    position: fixed;
    bottom: 32px;
    right: 32px;
    background: #0078d4;
    color: #fff;
    border: none;
    border-radius: 50px;
    padding: 16px 28px;
    font-size: 1.1rem;
    box-shadow: 0 2px 12px rgba(0,0,0,0.12);
    cursor: pointer;
    z-index: 9999;
  `;
  btn.onclick = createAIModal;
  document.body.appendChild(btn);
}

async function callOpenAI(prompt, feature) {
  const featureInstructions = {
    polish: "Polish the following text:",
    personalize: "Personalize the following text:",
    adjust_tone: "Adjust the tone of the following text:",
    correct: "Correct any errors in the following text:",
    concise: "Make the following text more concise:",
    translate: "Translate the following text to French:",
  };
  const instruction = featureInstructions[feature] || "Improve the following text:";
  const fullPrompt = `${instruction}\n${prompt}`;

  // Send the prompt to the local proxy which will call OpenAI with the server-side key
  const resp = await fetch('/api/openai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: fullPrompt, feature }),
  });
  const data = await resp.json();
  return data.result || data.error || 'No response.';
}

window.addEventListener("DOMContentLoaded", () => {
  createAIButton();
});

// Ensure a visible debug overlay remains even if the app clears the body.
(function ensurePersistentDebugOverlay(){
  function makeDebugOverlay(){
    if (document.getElementById('debug-guardian')) return;
    try {
      const overlay = document.createElement('div');
      overlay.id = 'debug-guardian';
      overlay.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:linear-gradient(90deg,#0a66ff,#0058a3);color:#fff;padding:10px 14px;font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;display:flex;align-items:center;justify-content:space-between;';
      overlay.innerHTML = `<div>Debug banner: scripts executed. <strong style="margin-left:8px">Reload or dismiss.</strong></div>
        <div style="display:flex;gap:8px;align-items:center"><button id="debug-reload" style="background:#fff;color:#0a66ff;border:none;padding:8px 10px;border-radius:6px;cursor:pointer">Reload</button><button id="debug-close" style="background:transparent;border:1px solid rgba(255,255,255,0.3);color:#fff;padding:8px 10px;border-radius:6px;cursor:pointer">Dismiss</button></div>`;
      document.documentElement.appendChild(overlay);
      document.getElementById('debug-reload').onclick = function(){ location.reload(); };
      document.getElementById('debug-close').onclick = function(){ overlay.style.display = 'none'; };
    } catch (e) {
      console.warn('makeDebugOverlay failed', e);
    }
  }
  // Create it now and after DOMContentLoaded
  try{ makeDebugOverlay(); } catch(e){}
  document.addEventListener('DOMContentLoaded', makeDebugOverlay);

  // Guard against removals
  const obs = new MutationObserver(()=>{ if (!document.getElementById('debug-guardian')) makeDebugOverlay(); });
  obs.observe(document.documentElement, { childList: true, subtree: true });

  // Interval fallback
  setInterval(()=>{ if (!document.getElementById('debug-guardian')) makeDebugOverlay(); }, 1500);
})();
