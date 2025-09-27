// Inline AI toolbar for editor integration
// Attaches to textarea, input, or contentEditable
(function(){
  const features = [
    { key: 'polish', label: 'Polish' },
    { key: 'personalize', label: 'Personalize' },
    { key: 'adjust_tone', label: 'Tone' },
    { key: 'correct', label: 'Correct' },
    { key: 'concise', label: 'Concise' },
    { key: 'translate', label: 'Translate' }
  ];
  let lastContent = null;
  let lastSelection = null;
  let toolbar = null;
  let currentEditor = null;
  let spinner = null;

  function createToolbar(){
    if (toolbar) toolbar.remove();
    toolbar = document.createElement('div');
    toolbar.className = 'ai-inline-toolbar';
    toolbar.innerHTML = features.map(f => `<button data-feature="${f.key}">${f.label}</button>`).join('') +
      '<button data-undo style="margin-left:8px">Undo</button>' +
      '<span class="ai-inline-spinner" style="display:none;margin-left:8px">⏳</span>';
    document.body.appendChild(toolbar);
    spinner = toolbar.querySelector('.ai-inline-spinner');
    toolbar.style.display = 'none';
    toolbar.onclick = async function(e){
      if (e.target.tagName !== 'BUTTON') return;
      if (e.target.hasAttribute('data-undo')) return undo();
      const feature = e.target.getAttribute('data-feature');
      if (!feature) return;
      if (!currentEditor) return;
      let sel = getSelectionInEditor(currentEditor);
      if (!sel.text) sel = { ...sel, text: currentEditor.value || currentEditor.innerText || '' };
      lastContent = getEditorContent(currentEditor);
      lastSelection = sel;
      spinner.style.display = '';
      try {
        const result = await callOpenAI(sel.text, feature);
        replaceEditorSelection(currentEditor, sel, result);
      } catch (err) {
        showToast('AI error: ' + err);
      } finally {
        spinner.style.display = 'none';
      }
    };
  }

  function showToolbar(editor){
    currentEditor = editor;
    const rect = editor.getBoundingClientRect();
    toolbar.style.display = '';
    toolbar.style.position = 'absolute';
    toolbar.style.top = (window.scrollY + rect.top - 38) + 'px';
    toolbar.style.left = (window.scrollX + rect.left) + 'px';
    toolbar.style.zIndex = 99999;
  }

  function hideToolbar(){
    if (toolbar) toolbar.style.display = 'none';
    currentEditor = null;
  }

  function getSelectionInEditor(editor){
    if (editor.tagName === 'TEXTAREA' || (editor.tagName === 'INPUT' && editor.type === 'text')) {
      return {
        start: editor.selectionStart,
        end: editor.selectionEnd,
        text: editor.value.substring(editor.selectionStart, editor.selectionEnd)
      };
    } else if (editor.isContentEditable) {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return { text: '', range: null };
      const range = sel.getRangeAt(0);
      return { text: sel.toString(), range };
    }
    return { text: '' };
  }

  function getEditorContent(editor){
    if (editor.tagName === 'TEXTAREA' || (editor.tagName === 'INPUT' && editor.type === 'text')) {
      return editor.value;
    } else if (editor.isContentEditable) {
      return editor.innerHTML;
    }
    return '';
  }

  function replaceEditorSelection(editor, sel, result){
    if (editor.tagName === 'TEXTAREA' || (editor.tagName === 'INPUT' && editor.type === 'text')) {
      const before = editor.value.substring(0, sel.start);
      const after = editor.value.substring(sel.end);
      editor.value = before + result + after;
      editor.selectionStart = editor.selectionEnd = before.length + result.length;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      editor.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (editor.isContentEditable && sel.range) {
      sel.range.deleteContents();
      sel.range.insertNode(document.createTextNode(result));
    }
  }

  function undo(){
    if (!currentEditor || lastContent == null) return;
    if (currentEditor.tagName === 'TEXTAREA' || (currentEditor.tagName === 'INPUT' && currentEditor.type === 'text')) {
      currentEditor.value = lastContent;
      if (lastSelection) {
        currentEditor.selectionStart = lastSelection.start;
        currentEditor.selectionEnd = lastSelection.end;
      }
      currentEditor.dispatchEvent(new Event('input', { bubbles: true }));
      currentEditor.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (currentEditor.isContentEditable) {
      currentEditor.innerHTML = lastContent;
    }
    showToast('Undo complete');
  }

  function showToast(msg){
    let toast = document.getElementById('ai-inline-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'ai-inline-toast';
      toast.className = 'ai-inline-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.display = '';
    setTimeout(() => { toast.style.display = 'none'; }, 2200);
  }

  async function callOpenAI(text, feature){
    // Use the same proxy endpoint as ai-float.js
    const featureInstructions = {
      polish: "Polish the following text:",
      personalize: "Personalize the following text:",
      adjust_tone: "Adjust the tone of the following text:",
      correct: "Correct any errors in the following text:",
      concise: "Make the following text more concise:",
      translate: "Translate the following text to French:",
    };
    const instruction = featureInstructions[feature] || "Improve the following text:";
    const fullPrompt = `${instruction}\n${text}`;
    const resp = await fetch('/api/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: fullPrompt, feature }),
    });
    const data = await resp.json();
    if (data.result) return data.result;
    throw new Error(data.error || 'No response');
  }

  function attachToolbar(){
    createToolbar();
    document.addEventListener('focusin', e => {
      const el = e.target;
      if (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type === 'text') || el.isContentEditable) {
        showToolbar(el);
      } else {
        hideToolbar();
      }
    });
    document.addEventListener('click', e => {
      if (!toolbar.contains(e.target) && (!currentEditor || e.target !== currentEditor)) hideToolbar();
    });
    window.addEventListener('scroll', () => { if (toolbar && toolbar.style.display !== 'none' && currentEditor) showToolbar(currentEditor); });
  }

  attachToolbar();
})();
