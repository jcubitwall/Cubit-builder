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
import { renderModels, renderSide, toast } from './sidebar.js';
import { buildHome } from './scene3d.js';
import { canSave, canEdit } from './role.js';
import { openViewer } from './viewer3d.js';
import { ITEMS, CATS, newItem } from './casework.js';
import { frontSVG } from './casework-svg.js';
import { ELEC_NAME, ELEC_H } from './electrical.js';

const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const KIND = { families:'model name', models:'home', pods:'pod', walls:'wall', layers:'layer', decks:'deck' };
const find = (kind,id) => kind==='models' ? MODELS[id] : ({families:FAMILIES, walls:LIB, layers:LAYERLIB, pods:PODLIB, decks:DECKLIB}[kind]||[]).find(x=>x.id===id);
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
    toast(`Deleted “${find(kind,id)?.name||id}” · it can be brought back for 2 weeks (Library → Recently deleted)`); refresh(after);
  }catch(e){ fail(e); }
}
async function restore(kind,id){ try{ await restoreItem(kind,id); toast(`Restored “${find(kind,id)?.name||id}”`); refresh(); }catch(e){ fail(e); } }

/* ---------- the Library window */
/* the tabs, in two groups; the catalogue tabs list their item categories (casework.js CATS) */
const GROUPS = [
  ['Building', [['walls','Walls'],['layers','Floors, ceilings & roofs'],['decks','Decks']]],
  ['Inside',   [['cab','Cabinets & wardrobes'],['appl','Kitchen & laundry appliances'],['bath','Bathroom fixtures'],['plumb','Plumbing'],['elec','Electrical'],['heat','Heating'],['furn','Furniture']]],
];
const TABS = GROUPS.flatMap(g=>g[1]);
const CW_TABS = { cab:['base','upper','tall','linen','wardrobe','vanity','bench','shelf','counter'], appl:['appliance'], bath:['bath'], plumb:['sink','plumb'], elec:['elec'], heat:['fire','heat'], furn:['furniture'] };
/* finer groups inside a tab: by category, and bathroom fixtures by what they are */
const BATH_SUB = [['Toilets',/^WC/],['Showers',/^(SH|LPG-SH)/],['Tub-showers',/^TS/],['Bathtubs',/^BT/],['Bathroom sinks',/^LV/]];
const subOf = (tab, d) => tab==='bath' ? (BATH_SUB.find(([,re])=>re.test(d.k))?.[0] || 'Other') : tab==='appl' ? (/^FR/.test(d.k)?'Fridges':/^RG/.test(d.k)?'Ranges':/^DW/.test(d.k)?'Dishwashers':/^HD/.test(d.k)?'Range hoods':/^WD/.test(d.k)?'Laundry':'Other')
  : tab==='plumb' ? (d.cat==='sink' ? (/LAU/.test(d.k)?'Laundry tubs':'Kitchen & bar sinks') : /^WH/.test(d.k)?'Water heaters':'Laundry hook-ups')
  : tab==='heat' ? (d.cat==='fire'?'Fireplaces':/^HP/.test(d.k)?'Heat pumps':'Baseboard heaters')
  : (CATS.find(c=>c.k===d.cat)?.name || d.cat);
const isCw = t => !!CW_TABS[t];
const size = d => `${+(+d.w).toFixed(2)} × ${+(+d.d).toFixed(2)} × ${+(+d.h).toFixed(2)}″`;
const LAYER_NAME = {'floor-ext':'Exterior floor','floor-int':'Interior floor','ceiling-int':'Interior ceiling','roof':'Roof'};
let dlg=null, tab='walls', sub='', q='', showGone=false;
function rows(){
  if(isCw(tab)){
    const out=ITEMS.filter(d=>CW_TABS[tab].includes(d.cat) && !d.hidden).map(d=>{ let th=''; try{ th=frontSVG(newItem(d.k),{pad:1}); }catch(e){}
      return { id:d.k, it:{ name:d.name }, sub:`${subOf(tab,d)} · ${size(d)}`, group:subOf(tab,d), thumb:th, cw:true }; });
    if(tab==='elec') Object.entries(ELEC_NAME).forEach(([rk,nm])=>out.push({ id:rk, it:{ name:nm }, sub:`Boxes · ${ELEC_H[rk]?`${ELEC_H[rk]}″ up · `:''}placed by the rules, or from a wall’s plug list`, group:'Boxes', ref:true }));
    return out;
  }
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
  const all0=rows().filter(r=>!r.it.purged);   // gone for good after two weeks: never shown
  const subs=isCw(tab) ? [...new Set(all0.map(r=>r.group))] : [];
  if(sub && !subs.includes(sub)) sub='';
  const all=all0.filter(r=>!sub || r.group===sub);
  if(tab==='models') deletedDrafts().forEach(x=>{ if(!MODELS[x.item.key]) all.push({ id:x.item.key, draft:true, it:{ name:x.item.name, deleted:true, deletedAt:Date.parse(x.at) }, sub:'your draft' }); });
  const list=all.filter(r=>(showGone ? r.it.deleted : !r.it.deleted) && (!Q || `${r.it.name} ${r.id} ${r.sub}`.toLowerCase().includes(Q)))
    .sort((a,b)=> showGone ? (b.it.deletedAt||0)-(a.it.deletedAt||0) : String(a.it.name).localeCompare(String(b.it.name), undefined, {numeric:true}));
  const gone=all.filter(r=>r.it.deleted).length;
  if(!gone && showGone) showGone=false;
  dlg.querySelector('#libTabs').innerHTML = GROUPS.map(([g,ts])=>`<div class="lib-grp"><span class="lib-gl">${g}</span>${ts.map(([k,l])=>`<button role="tab" data-tab="${k}" aria-selected="${tab===k}">${l}</button>`).join('')}</div>`).join('')
    + (subs.length>1 ? `<div class="lib-subs"><button data-sub="" aria-pressed="${!sub}">All</button>${subs.map(s=>`<button data-sub="${esc(s)}" aria-pressed="${sub===s}">${esc(s)}</button>`).join('')}</div>` : '');
  const gb=dlg.querySelector('#libGone'); gb.textContent = showGone ? 'Back to the library' : `Recently deleted (${gone})`; gb.hidden = !gone && !showGone;   // nothing deleted: not shown at all
  const note=dlg.querySelector('#libNote'); if(note){ note.dataset.std ||= note.innerHTML;
    note.innerHTML = isCw(tab) ? 'Tap an item for its sizes, options, 3D and parts. To place one, drag it in from <b>Cabinets</b> in the tray at the bottom (pick its category there).' : note.dataset.std; }
  if(isCw(tab)){ dlg.querySelector('#libGone').hidden=true;
    body.innerHTML = list.length ? list.map(r=>`<div class="lib-row${r.ref?' ref':''}" ${r.ref?'':`data-cw="${esc(r.id)}" title="Tap for its sizes, options, 3D and parts"`}>${r.thumb?`<span class="lib-th">${r.thumb}</span>`:''}
      <div class="lib-t"><b>${esc(r.it.name)}</b><small><code>${esc(r.id)}</code> · ${esc(r.sub)}</small></div>${r.ref?'':`<button class="btn ghost sm" data-cw="${esc(r.id)}">Open</button>`}</div>`).join('')
      : `<p class="note">${q ? 'Nothing matches.' : 'Empty.'}</p>`;
    return; }
  body.innerHTML = list.length ? list.map(r=>`<div class="lib-row" data-view="${esc(r.id)}" title="Tap to see it in 3D">${r.thumb?`<span class="lib-th">${r.thumb}</span>`:''}
      <div class="lib-t"><b>${esc(r.it.name)}</b><small><code>${esc(r.id)}</code> · ${esc(r.sub)}${showGone && r.it.deletedAt ? ` · deleted ${when(r.it.deletedAt)}, kept until ${until(r.it.deletedAt)}` : ''}</small></div>
      ${r.draft?'':`<button class="btn ghost sm lib-3d" data-view="${esc(r.id)}" aria-label="See ${esc(r.it.name)} in 3D">3D</button>`}
      <div class="lib-a editor-only">${showGone ? `<button class="btn ghost sm" ${r.draft?'data-resdraft':'data-res'}="${esc(r.id)}">Restore</button>`
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
      <p class="note" id="libNote">Tap a row (or 3D) to see it full screen in 3D. Renaming changes the name everywhere for the whole team. Deleting hides it from every list straight away (homes already using it keep it); for 2 weeks it can be brought back from Recently deleted, then it's gone for good.</p></div>`;
    document.body.appendChild(dlg);
    dlg.querySelector('#libClose').onclick=()=>dlg.close();
    dlg.querySelector('#libQ').oninput=e=>{ q=e.target.value; render(); };
    dlg.querySelector('#libGone').onclick=()=>{ showGone=!showGone; render(); };
    dlg.addEventListener('click', e=>{
      const t=e.target.closest('[data-tab]'); if(t){ tab=t.dataset.tab; sub=''; showGone=false; render(); return; }
      const sb=e.target.closest('[data-sub]'); if(sb){ sub=sb.dataset.sub; render(); return; }
      const cw=e.target.closest('[data-cw]'); if(cw){ import('./casework-ui.js').then(m=>m.openCaseLib({ k:cw.dataset.cw })); return; }
      const r=e.target.closest('[data-ren]'); if(r){ askRename(tab, r.dataset.ren); return; }
      const d=e.target.closest('[data-del]'); if(d){ askDelete(d, tab, d.dataset.del); return; }
      const s=e.target.closest('[data-res]'); if(s){ restore(tab, s.dataset.res); return; }
      const sd=e.target.closest('[data-resdraft]'); if(sd){ if(restoreDraft(sd.dataset.resdraft)){ toast('Draft restored'); refresh(); } return; }
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
