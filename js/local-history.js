/* Cubit Builder — local-history.js : undo / redo inside a builder dialog (wall, layer, cabinet).
   The builder calls track() each time it draws; if its data changed since the last draw, the old copy goes on the
   undo stack. So every change is undoable without each edit having to remember to save a step. */
function makeHistory(get, set, max=100){
  let last=null, U=[], R=[];
  const snap = () => JSON.stringify(get());
  return {
    reset(){ last=snap(); U=[]; R=[]; },
    track(){ const s=snap(); if(last!=null && s!==last){ U.push(last); if(U.length>max) U.shift(); R=[]; } last=s; },
    undo(){ if(!U.length) return false; R.push(snap()); last=U.pop(); set(JSON.parse(last)); return true; },
    redo(){ if(!R.length) return false; U.push(snap()); last=R.pop(); set(JSON.parse(last)); return true; },
    get canUndo(){ return U.length>0; }, get canRedo(){ return R.length>0; },
  };
}
/* the two buttons, and ⌘Z / ⇧⌘Z (Ctrl on Windows) while the dialog is open */
const histButtons = h => `<span class="hist-btns"><button class="btn ghost sm" data-hist="undo" ${h.canUndo?'':'disabled'} aria-label="Undo" title="Undo">↶</button><button class="btn ghost sm" data-hist="redo" ${h.canRedo?'':'disabled'} aria-label="Redo" title="Redo">↷</button></span>`;
function bindHistory(root, h, after){
  root.querySelectorAll('[data-hist]').forEach(b=>b.onclick=()=>{ if(b.dataset.hist==='undo' ? h.undo() : h.redo()) after(); });
  if(!root._histKeys){ root._histKeys=true;
    root.addEventListener('keydown', e=>{ if(!(e.metaKey||e.ctrlKey) || e.key.toLowerCase()!=='z' || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      e.preventDefault(); if(e.shiftKey ? h.redo() : h.undo()) after(); }); }
}
export { makeHistory, histButtons, bindHistory };
