/* Cubit Builder — library-ui.js : the Library window (⋯ → Library) and the Rename / Delete actions used across
   the app. Rename any home, pod, wall, floor / ceiling / roof layer or deck; delete hides it from every list
   (homes already using it keep working) and Restore brings it back. */
import { MODELS, LIB, LAYERLIB, PODLIB, DECKLIB } from './data.js';
import { renameItem, deleteItem, restoreItem, usedBy, originalName, applyEdits } from './libedit.js';
import { state, save } from './state.js';
import { thumbSVG } from './panels.js';
import { familyOf, familyById, FAMILIES, variantsOf } from './catalog.js';
import { renderModels, renderSide, toast } from './sidebar.js';
import { buildHome } from './scene3d.js';
import { canSave } from './role.js';
import { openViewer } from './viewer3d.js';

const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const KIND = { families:'model name', models:'home', pods:'pod', walls:'wall', layers:'layer', decks:'deck' };
const find = (kind,id) => kind==='models' ? MODELS[id] : ({families:FAMILIES, walls:LIB, layers:LAYERLIB, pods:PODLIB, decks:DECKLIB}[kind]||[]).find(x=>x.id===id);
const fail = e => toast(`Couldn't save: ${e.message||e}`);

function refresh(after){ renderModels(); renderSide(); if(after) after(); if(dlg?.open) render(); }

/* ---------- rename: a small window with the name ready to type over */
let ren=null;
function askRename(kind, id, after){
  if(!canSave()){ toast('Viewers can look but not change the library.'); return; }
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
  if(!canSave()){ toast('Viewers can look but not change the library.'); return; }
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
    toast(`Deleted “${find(kind,id)?.name||id}” · Library → Show deleted brings it back`); refresh(after);
  }catch(e){ fail(e); }
}
async function restore(kind,id){ try{ await restoreItem(kind,id); toast(`Restored “${find(kind,id)?.name||id}”`); refresh(); }catch(e){ fail(e); } }

/* ---------- the Library window */
const TABS = [['families','Model names'],['models','Homes'],['pods','Pods'],['walls','Walls'],['layers','Floors & roofs'],['decks','Decks']];
const LAYER_NAME = {'floor-ext':'Exterior floor','floor-int':'Interior floor','ceiling-int':'Interior ceiling','roof':'Roof'};
let dlg=null, tab='families', q='', showGone=false;
function rows(){
  if(tab==='families') return FAMILIES.map(f=>({id:f.id, it:f, sub:`${variantsOf(f.id).length} design${variantsOf(f.id).length===1?'':'s'} · shown in the home picker`}));
  if(tab==='models') return Object.entries(MODELS).map(([id,m])=>({id, it:m,
    sub:[familyById(familyOf(id))?.name, m.project?'project':m.sub?'sub-model':m.custom?'your layout':familyById(familyOf(id))?.base===id?'standard':'', m.size].filter(Boolean).join(' · ')}));
  if(tab==='walls') return LIB.map(w=>({id:w.id, it:w, sub:`${w.len}′ ${w.type==='int'?'interior':'exterior'} · ${(w.openings||[]).length} openings`, thumb:thumbSVG(w)}));
  if(tab==='layers') return LAYERLIB.map(l=>({id:l.id, it:l, sub:`${LAYER_NAME[l.kind]||l.kind} · ${l.len}′ · ${(l.holes||[]).length} holes`}));
  if(tab==='pods') return PODLIB.map(p=>({id:p.id, it:p, sub:`${p.len}′ pod${p.src==='saved'?' · saved in this browser':''}`}));
  return DECKLIB.map(d=>({id:d.id, it:d, sub:`${d.w}′ × ${d.d}′ frame`}));
}
function render(){
  applyEdits();
  const body=dlg.querySelector('#libBody'), Q=q.toLowerCase();
  const all=rows(), list=all.filter(r=>(showGone ? r.it.deleted : !r.it.deleted) && (!Q || `${r.it.name} ${r.id} ${r.sub}`.toLowerCase().includes(Q)))
    .sort((a,b)=>String(a.it.name).localeCompare(String(b.it.name), undefined, {numeric:true}));
  const gone=all.filter(r=>r.it.deleted).length;
  dlg.querySelector('#libTabs').innerHTML = TABS.map(([k,l])=>`<button role="tab" data-tab="${k}" aria-selected="${tab===k}">${l}</button>`).join('');
  dlg.querySelector('#libGone').textContent = showGone ? 'Back to the library' : `Show deleted${gone?` (${gone})`:''}`;
  body.innerHTML = list.length ? list.map(r=>`<div class="lib-row" data-view="${esc(r.id)}" title="Tap to see it in 3D">${r.thumb?`<span class="lib-th">${r.thumb}</span>`:''}
      <div class="lib-t"><b>${esc(r.it.name)}</b><small><code>${esc(r.id)}</code> · ${esc(r.sub)}</small></div>
      <button class="btn ghost sm lib-3d" data-view="${esc(r.id)}" aria-label="See ${esc(r.it.name)} in 3D">3D</button>
      <div class="lib-a edit-only">${showGone ? `<button class="btn ghost sm" data-res="${esc(r.id)}">Restore</button>`
        : `<button class="btn ghost sm" data-ren="${esc(r.id)}">Rename</button><button class="btn ghost sm danger" data-del="${esc(r.id)}">Delete</button>`}</div></div>`).join('')
    : `<p class="note">${showGone ? 'Nothing deleted here.' : q ? 'Nothing matches.' : 'Empty.'}</p>`;
}
function open(){
  if(!dlg){
    dlg=document.createElement('dialog'); dlg.id='libDlg'; dlg.className='lib-dlg'; dlg.setAttribute('aria-labelledby','libT');
    dlg.innerHTML=`<div class="dlg"><div class="dlg-h"><h2 id="libT">Library</h2><button class="btn ghost" id="libClose">Done</button></div>
      <div class="lib-tabs" id="libTabs" role="tablist"></div>
      <div class="lib-bar"><input type="search" id="libQ" placeholder="Search names and IDs" aria-label="Search the library"><button class="linkbtn" id="libGone"></button></div>
      <div id="libBody" class="lib-list"></div>
      <p class="note">Tap a row (or 3D) to see it full screen in 3D. Renaming changes the name everywhere for the whole team. Deleting hides it from every list; homes already using it keep it.</p></div>`;
    document.body.appendChild(dlg);
    dlg.querySelector('#libClose').onclick=()=>dlg.close();
    dlg.querySelector('#libQ').oninput=e=>{ q=e.target.value; render(); };
    dlg.querySelector('#libGone').onclick=()=>{ showGone=!showGone; render(); };
    dlg.addEventListener('click', e=>{
      const t=e.target.closest('[data-tab]'); if(t){ tab=t.dataset.tab; render(); return; }
      const r=e.target.closest('[data-ren]'); if(r){ askRename(tab, r.dataset.ren); return; }
      const d=e.target.closest('[data-del]'); if(d){ askDelete(d, tab, d.dataset.del); return; }
      const s=e.target.closest('[data-res]'); if(s){ restore(tab, s.dataset.res); return; }
      if(e.target.closest('button,input,a')  && !e.target.closest('.lib-3d')) return;
      const v=e.target.closest('[data-view]'); if(v){ const id=v.dataset.view;
        openViewer(tab, id, tab==='families' ? { modelKey: familyById(id)?.base && MODELS[familyById(id).base] ? familyById(id).base : variantsOf(id)[0] } : {}); }
    });
  }
  q=''; dlg.querySelector('#libQ').value=''; render(); dlg.showModal();
}
/* ⋯ menu → Library */
const pop=document.getElementById('morePop');
if(pop && !document.getElementById('bLibrary')){
  const b=document.createElement('button'); b.setAttribute('role','menuitem'); b.id='bLibrary'; b.textContent='Library';
  pop.insertBefore(b, document.getElementById('bUpload'));
  b.onclick=()=>{ pop.hidden=true; open(); };
}
/* the Homes window (the way in on a phone, where the ⋯ menu isn't shown) → Library */
const hp=document.getElementById('hProjects');
if(hp && !document.getElementById('hLibrary')){
  const b=document.createElement('button'); b.className='btn ghost'; b.id='hLibrary'; b.textContent='Library';
  hp.after(b); b.onclick=()=>{ document.getElementById('homeDlg')?.close(); open(); };
}
export { askRename, askDelete, open as openLibrary };
