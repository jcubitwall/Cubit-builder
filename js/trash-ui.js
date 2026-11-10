/* Cubit Builder — trash-ui.js : ⋯ → Deleted items. Everything that was deleted, in one window, sorted into groups,
   each with Restore.

     People      customers (with their profile, selections and signatures)
     Homes       Cubit Homes originals and variations · Unassigned homes · customers' homes · my drafts
     Model names the model names homes are filed under (LifePod, Nest …, and any the team added)
     Building    walls · floors, ceilings & roofs · decks · pods
     Windows & doors · Inside (cabinets, appliances, bathroom, plumbing, electrical, heating, furniture)

   How long things stay: library items, model names, Cubit Homes originals, customers and drafts for two weeks
   (then gone for good); Unassigned and customers' homes for as long as their saves are kept on the server (always).
   Bringing something back needs an editor or admin, except your own drafts. */
import { MODELS, LIB, LAYERLIB, DECKLIB, PODLIB } from './data.js';
import { FAMILIES } from './catalog.js';
import { ITEMS, CATS } from './casework.js';
import { UNITLIB, TYPES } from './units.js';
import { DEVICES } from './devices.js';
import { CUSTOMERS, customerById, restoreCustomer } from './customers.js';
import { deletedDrafts, restoreDraft } from './drafts.js';
import { deletedProjects, restoreDeleted } from './projects.js';
import { applyEdits, restoreItem, KEEP_MS } from './libedit.js';
import { canEdit, canSave } from './role.js';
import { renderModels, renderSide, toast } from './sidebar.js';

const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const when = t => { const d=new Date(t); return isNaN(d) ? '' : d.toLocaleDateString(undefined,{ month:'short', day:'numeric' }); };
const left = t => { const d=Math.ceil((Date.parse(t)+KEEP_MS-Date.now())/86400000); return isFinite(d) ? (d<=1 ? 'last day' : `${d} days left`) : ''; };
const who = e => e ? String(e).split('@')[0] : '';
const gone = L => L.filter(x=>x.deleted && !x.purged);

/* the groups: [group, [[id, name, rows()]]]; a row is { key, name, sub, at, keep, restore() } */
let PROJ = [];   // deleted team homes, fetched when the window opens
function groups(){
  const lib = (kind, L, sub) => gone(L).map(x=>{ const id=x.id ?? x.k; return { key:`${kind}:${id}`, name:x.name, sub:sub(x), at:x.deletedAt, keep:true, restore:()=>restoreItem(kind, id) }; });
  const orig = Object.entries(MODELS).filter(([k,m])=>m.deleted && !m.purged && !m.custom && !m.project)
    .map(([k,m])=>({ key:`models:${k}`, name:m.name, sub:[m.sub?'variation':'original', m.size].filter(Boolean).join(' · '), at:m.deletedAt, keep:true, restore:()=>restoreItem('models', k) }));
  const proj = cust => PROJ.filter(p=>!!p.customer===cust).map(p=>({ key:`proj:${p.id}`, name:p.name,
    sub:[cust ? (customerById(p.customer)?.name || 'a customer') : null, p.size, who(p.by) && `by ${who(p.by)}`].filter(Boolean).join(' · '), at:p.at, restore:()=>restoreDeleted(p) }));
  const drafts = deletedDrafts().map(d=>({ key:`draft:${d.item.key}`, name:d.item.model?.name || d.item.name || d.item.key, sub:'only you see it', at:d.at, keep:true, mine:true, restore:async()=>{ if(!restoreDraft(d.item.key)) throw new Error('It is gone.'); } }));
  const custs = CUSTOMERS.filter(c=>c.deleted).map(c=>({ key:`cust:${c.id}`, name:c.name, sub:[(c.homes||[]).length ? `${c.homes.length} home${c.homes.length===1?'':'s'}` : '', who(c.deleted.by) && `by ${who(c.deleted.by)}`].filter(Boolean).join(' · '), at:c.deleted.at, keep:true, restore:()=>restoreCustomer(c.id) }));
  return [
    ['People', [['customers', 'Customer profiles', custs]]],
    ['Homes', [['originals', 'Cubit Homes', orig], ['purg', 'Unassigned', proj(false)], ['custhomes', 'Customers’ homes', proj(true)], ['drafts', 'My drafts', drafts]]],
    ['Model names', [['families', 'Model names', lib('families', FAMILIES, ()=> 'model name')]]],
    ['Building', [['walls', 'Walls', lib('walls', LIB, x=>`${x.len||''}′ ${x.type==='int'?'interior / connecting':'exterior'}`)],
      ['layers', 'Floors, ceilings & roofs', lib('layers', LAYERLIB, x=>`${x.kind||''} · ${x.len||''}′`)],
      ['decks', 'Decks', lib('decks', DECKLIB, x=>`${x.w||''}′ × ${x.d||''}′`)],
      ['pods', 'Pods', lib('pods', PODLIB, x=>x.size||'')]]],
    ['Windows & doors', [['units', 'Windows & doors', lib('units', UNITLIB, x=>[TYPES[x.type]?.label, x.place==='int'?'interior':'', `${x.w} × ${x.h}″`].filter(Boolean).join(' · '))]]],
    ['Plugs & switches', [['devices', 'Plugs & switches', lib('devices', DEVICES, x=>({sw:'switch',rc:'plug',dt:'data / TV'}[x.kind]||''))]]],
    ['Inside', [['casework', 'Cabinets, appliances & fixtures', lib('casework', ITEMS, x=>[CATS.find(c=>c.k===x.cat)?.name, x.k].filter(Boolean).join(' · '))]]],
  ];
}

let dlg=null, cur='all';
function ensure(){
  if(dlg) return dlg;
  dlg=document.createElement('dialog'); dlg.className='cw-dlg tr-dlg'; dlg.setAttribute('aria-label','Deleted items');
  dlg.innerHTML=`<div class="cw"><header class="cw-h"><h2>Deleted items</h2><span class="note tr-why">Restore puts it back where it was</span>
    <span class="spacer"></span><button class="btn ghost cw-x" aria-label="Close">✕</button></header><div class="cw-body"></div></div>`;
  document.body.appendChild(dlg);
  dlg.querySelector('.cw-x').onclick=()=>dlg.close();
  return dlg;
}
function render(){
  applyEdits();
  const G=groups(), all=G.flatMap(([,cs])=>cs.flatMap(c=>c[2])).length;
  const body=dlg.querySelector('.cw-body');
  const nav=`<nav class="cw-cats" aria-label="Kinds"><button data-tc="all" aria-current="${cur==='all'}"><span>Everything</span><small>${all}</small></button>
    ${G.map(([g,cs])=>`<div class="cw-ng">${esc(g)}</div>${cs.map(([id,name,rows])=>`<button data-tc="${id}" aria-current="${cur===id}" class="${rows.length?'':'empty'}"><span>${esc(name)}</span><small>${rows.length}</small></button>`).join('')}`).join('')}</nav>`;
  const row = r => { const may = r.mine ? canSave() : canEdit();
    return `<div class="tr-row"><div><b>${esc(r.name)}</b><small>${esc([r.sub, r.at && `deleted ${when(r.at)}`, r.keep && left(r.at)].filter(Boolean).join(' · '))}</small></div>
      ${may?`<button class="btn sm" data-tr="${esc(r.key)}">Restore</button>`:'<span class="note">editors restore</span>'}</div>`; };
  let list='';
  G.forEach(([g,cs])=>cs.forEach(([id,name,rows])=>{ if(cur!=='all' && cur!==id) return; if(cur==='all' && !rows.length) return;
    list+=`<section class="tr-sec"><h3>${esc(name)}${g!==name?` <small>${esc(g)}</small>`:''}</h3>${rows.length ? rows.sort((a,b)=>String(b.at||'').localeCompare(String(a.at||''))).map(row).join('') : '<p class="note">Nothing deleted here.</p>'}</section>`; }));
  if(!list) list='<p class="note">Nothing has been deleted.</p>';
  body.innerHTML=nav+`<div class="tr-list"><p class="note">Library items, model names, Cubit Homes, customers and drafts can be brought back for 2 weeks, then they’re gone for good. Unassigned and customers’ homes keep every save on the server, so they can always come back.</p>${list}</div>`;
  body.querySelectorAll('[data-tc]').forEach(b=>b.onclick=()=>{ cur=b.dataset.tc; render(); });
  const byKey=new Map(G.flatMap(([,cs])=>cs.flatMap(c=>c[2])).map(r=>[r.key, r]));
  body.querySelectorAll('[data-tr]').forEach(b=>b.onclick=async()=>{ const r=byKey.get(b.dataset.tr); if(!r) return;
    b.disabled=true; b.textContent='Restoring…';
    try{ await r.restore(); if(r.key.startsWith('proj:')) PROJ=PROJ.filter(p=>`proj:${p.id}`!==r.key);
      toast(`Restored “${r.name}”`); renderModels(); renderSide(); render(); }
    catch(e){ b.disabled=false; b.textContent='Restore'; toast('Not restored: '+(e.message||e)); } });
}
/* focus: a kind to open on (customers, walls, layers, decks, families, …) */
async function openTrash(focus){
  ensure(); cur = focus || 'all';
  PROJ = await deletedProjects().catch(()=>[]);
  render(); if(!dlg.open) dlg.showModal();
}

/* ⋯ menu → Deleted items (editors and admins; others see their own deleted drafts here too) */
const pop=document.getElementById('morePop');
if(pop && !document.getElementById('bTrash')){
  const b=document.createElement('button'); b.setAttribute('role','menuitem'); b.id='bTrash'; b.textContent='Deleted items';
  pop.insertBefore(b, document.getElementById('bUpload'));
  b.onclick=()=>{ pop.hidden=true; openTrash(); };
}
/* the Homes window on a phone (no ⋯ menu there) → Deleted items */
const hl=document.getElementById('hLibrary')||document.getElementById('hProjects');
if(hl && !document.getElementById('hTrash')){
  const b=document.createElement('button'); b.className='btn ghost'; b.id='hTrash'; b.textContent='Deleted items';
  hl.after(b); b.onclick=()=>{ document.getElementById('homeDlg')?.close(); openTrash(); };
}
export { openTrash };
