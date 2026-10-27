/* Cubit Builder — dialog-back.js : a ← back arrow on any window opened from another window.
   Two ways a window opens another:
     · on top of it (the first stays open underneath): ← closes the top one, and you're back on the first;
     · in place of it (the first closes, the second opens straight after, e.g. Homes → Library): ← closes the
       second and opens the first again, as you left it.
   It works for every window in the app (each <dialog>), so new windows get it without extra code. Small question
   windows (a form that is the whole window, e.g. Rename) have their own Cancel and don't get one. */
const REPLACE_MS = 300;          // a window opened this soon after another closed is taken as opened from it
let lastClosed = null, lastClosedAt = 0;

const topOpen = except => [...document.querySelectorAll('dialog[open]')].filter(d=>d!==except).pop() || null;
const isPrompt = d => d.firstElementChild?.tagName==='FORM' && d.firstElementChild.getAttribute('method')==='dialog';
const headerOf = d => d.querySelector(':scope > .dlg > .dlg-h, :scope > .dlg-h, :scope > header, :scope .cw-h, :scope .ss-bar, :scope .dlg-h');
const nameOf = d => (d.querySelector('h2, h3')?.textContent || '').trim().replace(/\s+/g,' ').slice(0,40);

function placeButton(d){
  let b=d.querySelector(':scope .dlg-back');
  const prev=d._back, h=headerOf(d);
  if(!prev || !h || isPrompt(d)){ if(b) b.hidden=true; return; }
  if(!b){ b=document.createElement('button'); b.type='button'; b.className='btn ghost dlg-back';
    b.addEventListener('click', e=>{ e.preventDefault(); e.stopPropagation(); goBack(d); }); }
  if(b.parentNode!==h) h.prepend(b);
  const nm=nameOf(prev); b.textContent='←'; b.title = nm ? `Back to ${nm}` : 'Back'; b.setAttribute('aria-label', b.title); b.hidden=false;
}
function goBack(d){
  const prev=d._back; d._back=null;
  d.close();
  if(prev && prev.isConnected && !prev.open){ prev._reopen=true; prev.showModal(); prev._reopen=false; }
}

const show = HTMLDialogElement.prototype.showModal;
HTMLDialogElement.prototype.showModal = function(){
  if(!this._reopen){   // going back keeps the window's own way back
    const under=topOpen(this);
    this._back = under || (lastClosed && lastClosed!==this && performance.now()-lastClosedAt<REPLACE_MS ? lastClosed : null);
    if(this._back===this) this._back=null;
  }
  const r=show.call(this);
  try{ placeButton(this); }catch(e){}
  return r;
};
const shut = HTMLDialogElement.prototype.close;
HTMLDialogElement.prototype.close = function(...a){ if(this.open){ lastClosed=this; lastClosedAt=performance.now(); } return shut.apply(this, a); };
document.addEventListener('close', e=>{ const d=e.target; if(d instanceof HTMLDialogElement && lastClosed!==d){ lastClosed=d; lastClosedAt=performance.now(); } }, true);
/* windows that redraw their header while open: put the arrow back */
new MutationObserver(()=>{ document.querySelectorAll('dialog[open]').forEach(d=>{ if(d._back && !d.querySelector('.dlg-back:not([hidden])')) try{ placeButton(d); }catch(e){} }); })
  .observe(document.body, {childList:true, subtree:true});

export {};
