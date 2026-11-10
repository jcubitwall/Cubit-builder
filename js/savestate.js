/* Cubit Builder — savestate.js : the "Saved" note in the top bar, so nobody has to wonder.

   A draft (My Drafts) goes up to the team's server by itself a moment after each change: "Saving…", then "Saved 10:41",
   or "Kept on this iPad" when there's no signal (it goes up on the next change once the connection is back).
   A home in Unassigned or with a customer is saved with Save changes: after a change the note reads "Not saved",
   and tapping it saves. A Cubit Homes original is protected (a change makes a draft); a signed home is locked. */
import { MODELS } from './data.js';
import { state, onSave } from './state.js';
import { canSave } from './role.js';
import { snapshot, saveProject } from './projects.js';
import { toast } from './sidebar.js';

const el=document.createElement('button'); el.className='save-st'; el.type='button'; el.hidden=true;
const place=()=>{ const anchor=document.querySelector('header.bar .mode-sw') || document.getElementById('views'); if(anchor && !el.isConnected) anchor.after(el); };
const hhmm = d => new Date(d).toLocaleTimeString(undefined, { hour:'numeric', minute:'2-digit' });
const base = {}, st = {};   // per home: the saved signature, and the draft's last push result
const sigOf = k => { try{ const m=MODELS[k]; const q=snapshot(m.name, m.project, k); delete q.saved; return JSON.stringify(q); }catch(e){ return ''; } };
function show(){
  place();
  const k=state.model, m=MODELS[k];
  if(!m || !canSave()){ el.hidden=true; return; }
  el.hidden=false; el.disabled=true; el.classList.remove('dirty','bad');
  if(m.custom){ const s=st[k];
    if(s==='saving'){ el.textContent='Saving…'; return; }
    if(s==='local'){ el.textContent='Saved on this iPad'; el.title='Saved in this browser'; return; }
    if(s==='bad'){ el.textContent='Kept on this iPad'; el.title='No connection to the team just now. It goes up with the next change once the connection is back.'; el.classList.add('bad'); return; }
    el.textContent = m.savedAt ? `Saved ${hhmm(m.savedAt)}` : 'Draft · only you see it'; el.title='Drafts save by themselves'; return; }
  if(m.project){
    if(m.locked){ el.textContent='Signed · locked'; el.title='Changes go into a draft until it is unlocked'; return; }
    if(base[k]==null) base[k]=sigOf(k);
    if(sigOf(k)!==base[k]){ el.textContent='Not saved · Save'; el.title='Save the changes for the team'; el.disabled=false; el.classList.add('dirty'); return; }
    el.textContent = m.saved ? `Saved ${hhmm(m.saved)}` : 'Saved'; el.title=''; return; }
  el.textContent='Cubit original'; el.title='Protected: a change makes your own draft';
}
el.onclick=async()=>{ const k=state.model, m=MODELS[k]; if(!m?.project || el.disabled) return;
  el.disabled=true; el.textContent='Saving…';
  try{ await saveProject(m.name, false); base[state.model]=sigOf(state.model); toast('Saved'); }catch(e){ toast('Not saved: '+(e.message||e)); }
  show(); };
let t=0, lt=0;
onSave(()=>{ const k=state.model; if(MODELS[k]?.custom){ st[k]='saving'; clearTimeout(lt); lt=setTimeout(()=>{ if(st[k]==='saving'){ st[k]='local'; show(); } }, 4000); } clearTimeout(t); t=setTimeout(show, 250); });
window.addEventListener('cubit:saved', e=>{ const {k, ok, project}=e.detail||{}; if(project){ base[k]=sigOf(k); } else st[k]= ok ? 'ok' : 'bad'; show(); });
let last=null; setInterval(()=>{ if(state.model!==last){ last=state.model; show(); } }, 500);
setTimeout(show, 0);
export { show as showSaveState };
