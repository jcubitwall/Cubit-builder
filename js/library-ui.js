/* Cubit Builder — library-ui.js : the Library window (⋯ → Library) and the Rename / Delete actions used across
   the app. The Library holds what homes are built from, not the homes (those are in the Homes window):
     Building   Walls · Floors, ceilings & roofs · Decks
     Inside     Cabinets & wardrobes · Kitchen & laundry appliances · Bathroom fixtures · Plumbing · Electrical ·
                Heating · Furniture (each with its own groups, e.g. base / upper / wardrobes …) Rename any home, pod, wall, floor / ceiling / roof layer or deck; delete hides it from every list
   (homes already using it keep working) and Restore brings it back. */
import { MODELS, LIB, LAYERLIB, PODLIB, DECKLIB } from './data.js';
import { renameItem, deleteItem, restoreItem, usedBy, originalName, applyEdits, KEEP_MS } from './libedit.js';
import { deletedDrafts, restoreDraft } from './drafts.js';
const until = at => { const d=new Date(at+KEEP_MS); return isNaN(d) ? '' : d.toLocaleDateString(undefined,{month:'short', day:'numeric'}); };
const when = at => { const d=new Date(at); return isNaN(d) ? '' : d.toLocaleDateString(undefined,{month:'short', day:'numeric'}); };
import { state, save } from './state.js';
import { thumbSVG } from './panels.js';
import { familyOf, familyById, FAMILIES, variantsOf } from './catalog.js';
import { ITEMS } from './casework.js';
import { UNITLIB } from './units.js';
import { renderModels, renderSide, toast } from './sidebar.js';
import { buildHome } from './scene3d.js';
import { canSave, canEdit } from './role.js';
import { openViewer } from './viewer3d.js';

const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const KIND = { families:'model name', models:'home', pods:'pod', walls:'wall', layers:'layer', decks:'deck', casework:'library item', units:'window / door' };
const find = (kind,id) => kind==='models' ? MODELS[id] : ({families:FAMILIES, walls:LIB, layers:LAYERLIB, pods:PODLIB, decks:DECKLIB, casework:ITEMS, units:UNITLIB}[kind]||[]).find(x=>(x.id??x.k)===id);
const fail = e => toast(`Couldn't save: ${e.message||e}`);

function refresh(after){ renderModels(); renderSide(); if(after) after(); if(dlg?.open) render(); }

/* ---------- rename: a small window with the name ready to type over */
let ren=null;
function askRename(kind, id, after){
  if(!canEdit()){ toast('Only editors and admins can change the library.'); return; }
  const it=find(kind,id); if(!it) return;
  if(!ren){ ren=document.createElement('dialog'); ren.id='renDlg'; ren.className='lib-dlg';
    ren.innerHTML=`<form method="dialog" class="dlg"><div class="dlg-h"><h2 id="renT">Rename</h2></div>
      <label for="renIn">Name</label><input type="text" id="renIn" maxlength="80" autocomplete="off">
      <p class="note" id="renNote"></p>
      <div class="row"><button class="btn" value="ok" id="renOk">Save</button><button class="btn ghost" value="cancel" formnovalidate>Cancel</button></div></form>`;
    document.body.appendChild(ren); }
  ren.querySelector('#renT').textContent=`Rename ${KIND[kind]}`;
  const inp=ren.querySelector('#renIn'); inp.value=it.name||'';
  const orig=originalName(kind,id);
  ren.querySelector('#renNote').innerHTML = `<code>${esc(id)}</code>${orig && orig!==it.name ? ` · first named “${esc(orig)}”` : ''}`;
  ren.onclose=async()=>{ if(ren.returnValue!=='ok') return; const nm=inp.value.trim(); if(!nm || nm===it.name) return;
    try{ await renameItem(kind,id,nm); toast(`Renamed to “${nm}”`); refresh(after); }catch(e){ fail(e); } };
  ren.returnValue=''; ren.showModal(); inp.select();
}
/* ---------- delete: tap twice (the button says what's at stake the first time) */
async function askDelete(btn, kind, id, after){
  if(!canEdit()){ toast('Only editors and admins can change the library.'); return; }
  if(btn.dataset.sure!=='1'){
    const u=usedBy(kind,id,state);
    btn.dataset.sure='1'; btn.textContent = u.length ? `Used in ${u.length} — tap to delete` : 'Tap again to delete';
    btn.title = u.length ? `Used in: ${u.join(', ')}. They keep it; it just won't be offered any more.` : '';
    setTimeout(()=>{ if(btn.isConnected){ btn.dataset.sure=''; btn.textContent='Delete'; } }, 4000);
    return;
  }
  try{
    await deleteItem(kind,id);
    if(kind==='models' && state.model===id){   // the home on screen: go to another
      const next = FAMILIES.map(f=>variantsOf(f.id)[0]).find(Boolean) || Object.keys(MODELS).find(k=>!MODELS[k].deleted);
      if(next){ state.model=next; state.selected=null; save(); buildHome(); }
    }
    toast(`Deleted “${find(kind,id)?.name||id}” · it can be brought back for 2 weeks (⋯ → Deleted items)`); refresh(after);
  }catch(e){ fail(e); }
}
async function restore(kind,id){ try{ await restoreItem(kind,id); toast(`Restored “${find(kind,id)?.name||id}”`); refresh(); }catch(e){ fail(e); } }

/* (the old Library window is gone: the full-screen Library in casework-ui.js lists everything) */
let dlg=null; const render=()=>{};

/* ⋯ menu → Library: the full-screen Library (casework-ui.js) for everything, walls to heat pumps */
const openLib = () => import('./casework-ui.js').then(m=>m.openCaseLib({}));
const pop=document.getElementById('morePop');
if(pop && !document.getElementById('bLibrary')){
  const b=document.createElement('button'); b.setAttribute('role','menuitem'); b.id='bLibrary'; b.textContent='Library';
  pop.insertBefore(b, document.getElementById('bUpload'));
  b.onclick=()=>{ pop.hidden=true; openLib(); };
}
/* the Homes window on a phone (no ⋯ menu there) → Library */
const hp=document.getElementById('hProjects');
if(hp && !document.getElementById('hLibrary')){
  const b=document.createElement('button'); b.className='btn ghost'; b.id='hLibrary'; b.textContent='Library';
  hp.after(b); b.onclick=()=>{ document.getElementById('homeDlg')?.close(); openLib(); };
}
export { askRename, askDelete, openLib as openLibrary };
