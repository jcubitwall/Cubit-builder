/* Cubit Builder — casework-ui.js : the Cabinet library window (browse, resize, 3D with exploded view and parts,
   cut list), the shop settings (plywood, edge band, joinery, hardware), and the options of a placed item. */
import { INSERTS, defStoreItem } from './casework.js';
import { CATS, ITEMS, itemDef, catOf, newItem, partsOf, cutList, hardwareOf, totals, csv, fmt, fmtU, fx3, settings, saveSettings, loadSettings, DEFAULTS, MM } from './casework.js';
import { partSVG, opsTable } from './casework-parts.js';
import { cabinetJob, jobZip, sheetSVG, CAB_CNC } from './cabcnc.js';
import { MODELS } from './data.js';
import { itemModel } from './casework3d.js';
import { frontSVG } from './casework-svg.js';
import { centreUnderWindow, fitBaseToSink, furnitureOf, furnById, updateItem, removeItem, duplicateItem, turnItem, refreshItem, addItem, snap, applyFurniture, podsShown, freeSpot, groupMembers, makeGroup, ungroup, relinkGroup, renameGroup, setGroupFrom, removeGroup, groupRecipe } from './furniture.js';
import { plumbNote } from './plumbing.js';
import { KITCHENS, kitchenById, newKitchenId, saveKitchen, deleteKitchen, onKitchensChanged } from './kitchens.js';
import { kitchenPicture, recipeOf } from './kitchen3d.js';
import { state, save } from './state.js';
import { canSave, canEdit } from './role.js';
import { homeGroup, wallGroups, highlight } from './scene3d.js';
import { renderSide, toast } from './sidebar.js';
import { setPanel, panelOpen } from './fullscreen.js';
import { setIsolate } from './layers.js';
import { askName } from './names.js';
import { checkpoint } from './history.js';
import { ensureDraft } from './pods.js';

const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const U = () => settings().units;
const show = v => fmt(v);                                  // a length in the shop's units, no unit sign
/* exact values for the settings (a measured 0.469″ must not round to ½″) */
const prec = v => { if(U()==='mm'){ const m=v/MM; return String(Math.round(m*10)/10); } return Math.abs(v*16-Math.round(v*16))<1e-6 ? fmt(v) : String(Math.round(v*1000)/1000); };
const unitSign = () => U()==='mm' ? 'mm' : '″';
/* "34 1/2", "34.5", "34-1/2", "876 mm" → inches */
function parseLen(s){
  s=String(s).trim().toLowerCase(); if(!s) return NaN;
  const mm=/mm$/.test(s) || (U()==='mm' && !/["″in]$/.test(s)); s=s.replace(/mm|in|["″]/g,'').trim();
  if(mm) return parseFloat(s)*MM;
  const m=s.match(/^(\d+(?:\.\d+)?)?[\s-]*(?:(\d+)\/(\d+))?$/); if(!m) return parseFloat(s);
  return (m[1]?parseFloat(m[1]):0) + (m[2]?(+m[2])/(+m[3]):0);
}
const sizeTxt = it => `${show(it.w)} × ${show(it.h)} × ${show(it.d)}${unitSign()}`;
const bandTxt = b => !b.long && !b.short ? '—' : [b.long?`${b.long} long`:'' , b.short?`${b.short} short`:''].filter(Boolean).join(', ');
function download(name, text, type='text/csv'){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type})); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 500); }

/* ---------------------------------------------------------------- the window */
let dlg=null, view={ tab:'lib', cat:'base', item:null, edit:null, explode:0, sel:null };
import { makeHistory, histButtons, bindHistory } from './local-history.js';
import { LIB, LAYERLIB, DECKLIB } from './data.js';
import { UNITLIB, TYPES, unitSVG, saveTeamUnit, unitById, onUnitsChanged } from './units.js';
import { BOXLIB, THIN_BELOW, boxSVG } from './boxes.js';
import { STORES, storeById, storesFor, isAdopted, adopt as adoptStore, onAdoptedChanged } from './stores.js';
import { BRANDS, brandById, brandKeyOf, brandName, rsoOf, bmOf, catalogOf } from './brands.js';
import { itemRules, unitRules, rulesBox } from './item-rules.js';
import { DEVICES, deviceSVG, saveDevice, newDeviceId, deviceById } from './devices.js';
import { thumbSVG } from './panels.js';
import { layerThumb } from './sidebar.js';
import { rules, saveRules, sharedRules } from './wall-rules.js';

/* ---------------------------------------------------------------- the Library: one full-screen window for everything
   Left: the categories in groups. Building (walls, floors / ceilings / roofs, decks) and the inside groups (cabinets &
   wardrobes, kitchen & laundry, bathroom, plumbing, electrical, heating, furniture). Right: cards. The second tab is
   that category's settings: Shop settings (cabinets, countertops, sinks), Wall rules (walls, floors, electrical
   heights and locks), the electrical / plumbing / heating rules. */
const NAV_BASE = [
  ['Building', [['b:walls','Walls'],['b:layers','Floors, ceilings & roofs'],['b:decks','Decks']]],
  ['Windows & doors', [['u:win','Windows'],['u:ext','Exterior doors'],['u:int','Interior doors']]],
  ['Maker catalogues', []],
  ['Plugs & switches', [['d:sw','Switches'],['d:rc','Plugs (receptacles)'],['d:dt','Data & TV'],['d:bx','Device boxes']]],
  ['Kitchens & groups', [['k:kit','Kitchens & groups']]],
  ['Cabinets & wardrobes', ['base','upper','tall','linen','wardrobe','vanity','bench','shelf','counter']],
  ['Kitchen & laundry', ['appliance']],
  ['Bathroom', ['bath']],
  ['Plumbing', ['sink','plumb']],
  ['Electrical', ['elec']],
  ['Heating', ['fire','baseboard','heat']],
  ['Furniture & TVs', ['furniture','tv']],
];
/* the makers' catalogues (brands.js) fill their group once loaded */
/* …and each store's list goes right under the category it's for ("Home Depot store" under Fireplaces) */
const storeKey = c => String(c).replace(/^d:/,'');
const withStores = cs => cs.flatMap(c=>{ const k=Array.isArray(c)?c[0]:c; return [c, ...storesFor(storeKey(k)).map(({store})=>[`s:${store.id}:${storeKey(k)}`, `${store.name} store`])]; });
const NAV = () => NAV_BASE.filter(([g])=>g!=='Maker catalogues');
/* ---------------------------------------------------------------- catalogues inside each category
   Every category has the Cubit catalogue (what homes use) and, where there are any, outside catalogues: a maker's
   (North Air under Windows) or a store's (Home Depot under Fireplaces). A switch at the top of the category flips
   between them; a drop-down picks which outside catalogue when there are several. Remembered per category. */
const UNIT_CAT = { 'u:win':'window', 'u:ext':'door', 'u:int':'door' };
function sourcesFor(cat){
  const out=[];
  const uc=UNIT_CAT[cat]; if(uc) BRANDS.forEach(b=>{ if((b.styles||[]).some(st=>TYPES[st.type]?.cat===uc || (uc==='door' && TYPES[st.type]?.cat==='patio'))) out.push({ id:`brand:${b.id}`, label:`${b.name} catalogue` }); });
  storesFor(storeKey(cat)).forEach(({store})=>out.push({ id:`store:${store.id}`, label:`${store.name} store` }));
  return out;
}
const srcPick={}; try{ Object.assign(srcPick, JSON.parse(localStorage.getItem('cubit-lib-src')||'{}')); }catch(e){}
const saveSrc=()=>{ try{ localStorage.setItem('cubit-lib-src', JSON.stringify(srcPick)); }catch(e){} };
/* { on:'cubit'|source id, list } for the category open */
function srcState(cat){ const list=sourcesFor(cat), p=srcPick[cat], on=p && p!=='cubit' && list.some(x=>x.id===p) ? p : 'cubit'; return { on, list, last:srcPick['last:'+cat] && list.some(x=>x.id===srcPick['last:'+cat]) ? srcPick['last:'+cat] : list[0]?.id }; }
function srcBar(cat){
  const S=srcState(cat); if(!S.list.length) return '';
  const ext=S.on!=='cubit' ? S.on : S.last, extL=S.list.find(x=>x.id===ext)?.label||'Maker catalogue';
  return `<div class="src-bar cw-span"><div class="seg sm" role="group" aria-label="Catalogue"><button data-src="cubit" aria-pressed="${S.on==='cubit'}">Cubit catalogue</button><button data-src="${esc(ext)}" aria-pressed="${S.on!=='cubit'}">${esc(extL)}</button></div>
    ${S.list.length>1?`<label class="src-sel"><span>Outside catalogues</span><select id="srcSel">${S.list.map(x=>`<option value="${esc(x.id)}" ${x.id===ext?'selected':''}>${esc(x.label)}</option>`).join('')}</select></label>`:''}
    <span class="note">${S.on==='cubit'?'What Cubit homes use.':'Adopt what Cubit will use into the Cubit catalogue.'}</span></div>`;
}
function bindSrc(body){
  const go=v=>{ srcPick[view.cat]=v; if(v!=='cubit') srcPick['last:'+view.cat]=v; saveSrc(); render(); };
  body.querySelectorAll('[data-src]').forEach(b=>b.onclick=()=>go(b.dataset.src));
  const sel=body.querySelector('#srcSel'); if(sel) sel.onchange=()=>go(sel.value);
}
/* an option's label: an adopted fireplace insert by its maker and model */
const optLabel = (k, v) => k==='insert' && INSERTS[v]?.name ? `${INSERTS[v].name} (${INSERTS[v].w}″)` : (k==='insert' && /^\d+$/.test(v) ? `${v}″ generic` : v);
const SHOP_CATS = new Set(['base','upper','tall','linen','wardrobe','vanity','bench','shelf','counter','sink','fire']);
/* what the second tab is for this category: [label, kind] or null (none) */
function setTab(cat){
  if(SHOP_CATS.has(cat)) return ['Shop settings','shop'];
  if(cat==='b:walls' || cat==='b:layers') return ['Wall rules','walls'];
  if(cat==='elec') return ['Electrical rules','elec'];
  if(cat==='bath' || cat==='plumb') return ['Plumbing rules','plumb'];
  if(cat==='heat' || cat==='baseboard') return ['Heating rules','heat'];
  if(cat==='appliance' || cat.startsWith('d:')) return ['Electrical rules','elec'];
  return null;
}
const B_LIST = { 'b:walls':()=>LIB, 'b:layers':()=>LAYERLIB, 'b:decks':()=>DECKLIB };
const B_KIND = { 'b:walls':'walls', 'b:layers':'layers', 'b:decks':'decks' };
const LAYER_NAME = {'floor-ext':'Exterior floor','floor-int':'Interior floor','ceiling-int':'Interior ceiling','roof':'Roof'};
/* windows & doors (units.js): windows · exterior doors (man doors and patio doors) · interior doors (place 'int') */
const U_OF = { 'u:win':u=>TYPES[u.type]?.cat==='window', 'u:ext':u=>TYPES[u.type]?.cat!=='window' && u.place!=='int', 'u:int':u=>u.place==='int' };
const live = x => !x.deleted && !x.purged;
const homeGroups = () => { const G=new Map(); try{ furnitureOf().forEach(o=>{ if(o.grp?.id) (G.get(o.grp.id)||G.set(o.grp.id,[]).get(o.grp.id)).push(o); }); }catch(e){} return [...G.values()]; };
const countOf = c => c.startsWith('s:') ? (storeById(c.split(':')[1])?.cats?.[c.split(':')[2]]||[]).length : c==='d:bx' ? BOXLIB.length : c==='k:kit' ? KITCHENS.length : c.startsWith('u:cat:') ? catalogOf(c.slice(6)).length : c.startsWith('d:') ? DEVICES.filter(d=>d.kind===c.slice(2) && live(d)).length : c.startsWith('b:') ? B_LIST[c]().filter(live).length : c.startsWith('u:') ? UNITLIB.filter(u=>U_OF[c](u) && live(u)).length : ITEMS.filter(i=>i.cat===c && live(i) && !i.legacy).length;
const navName = c => (c.startsWith('b:')||c.startsWith('u:')||c.startsWith('d:')||c.startsWith('k:')||c.startsWith('s:')) ? (NAV().flatMap(([,cs])=>cs).find(x=>Array.isArray(x) && x[0]===c)||[0,c])[1] : (CATS.find(x=>x.k===c)?.name || c);
let showGone=false;
/* undo / redo of the item on screen: its sizes, options and mirror */
const pickIt = it => it ? JSON.parse(JSON.stringify({ w:it.w, h:it.h, d:it.d, y:it.y||0, opt:it.opt||{}, mirror:!!it.mirror })) : null;
const HIST = makeHistory(()=>pickIt(view.item), v=>{ const it=view.item; if(!it||!v) return; if(view.edit){ updateItem(it.id, v); refreshItem(it); renderSide(); } else Object.assign(it, v); });
function ensure(){
  if(dlg) return dlg;
  dlg=document.createElement('dialog'); dlg.className='cw-dlg'; dlg.setAttribute('aria-label','Library');
  dlg.innerHTML=`<div class="cw">
    <header class="cw-h"><h2>Library</h2>
      <div class="seg" role="tablist"><button role="tab" data-tab="lib">Library</button><button role="tab" data-tab="set" id="cwSetTab">Settings</button></div>
      <span class="spacer"></span><button class="btn ghost cw-x" aria-label="Close">✕</button></header>
    <div class="cw-body"></div></div>`;
  document.body.appendChild(dlg);
  dlg.querySelector('.cw-x').onclick=()=>dlg.close();
  dlg.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{ view.tab=b.dataset.tab; render(); });
  dlg.addEventListener('close', ()=>{ stopViewer(); });
  return dlg;
}
async function openCaseLib(o={}){
  ensure(); await loadSettings();
  if(o.edit){ const it=furnById(o.edit); if(it){ view.edit=it.id; view.item=it; view.cat=itemDef(it.k).cat; } }
  else { view.edit=null; view.item=o.k ? newItem(o.k) : null; if(o.cat) view.cat=o.cat; if(o.k) view.cat=itemDef(o.k).cat; }
  view.tab=o.tab||'lib'; view.explode=0; view.sel=null;
  HIST.reset(); render(); if(!dlg.open) dlg.showModal();
}
function render(){
  renderInner();
  if(view.tab!=='lib' || view.item) return;
  const body=dlg.querySelector('.cw-body'), sec=body.querySelector('section.cw-grid'), bar=srcBar(view.cat);
  if(sec && bar){ sec.insertAdjacentHTML('afterbegin', bar); bindSrc(body); }
}
function renderInner(){
  const st=setTab(view.cat), stb=dlg.querySelector('#cwSetTab');
  if(stb){ stb.hidden=!st; stb.textContent=st?st[0]:'Settings'; }
  if(view.tab==='set' && !st) view.tab='lib';
  dlg.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected', b.dataset.tab===view.tab));
  const body=dlg.querySelector('.cw-body');
  stopViewer();
  const nav=`<nav class="cw-cats" aria-label="Categories">${NAV().map(([g,cs])=>`<div class="cw-ng">${esc(g)}</div>${cs.map(c=>{ const k=Array.isArray(c)?c[0]:c; return `<button data-cat="${k}" aria-current="${k===view.cat}"><span>${esc(navName(k))}</span><small>${countOf(k)}</small></button>`; }).join('')}`).join('')}</nav>`;
  if(view.tab==='set'){ if(st[1]==='shop'){ renderSettings(body); return; } body.innerHTML=nav+`<section class="cw-rules">${rulesFor(st[1])}</section>`; bindNav(body); bindRules(body); return; }
  if(view.item){ renderDetail(body); return; }
  { const S=srcState(view.cat);   // an outside catalogue chosen for this category
    if(S.on.startsWith('brand:')){ const bid=S.on.slice(6); body.innerHTML=nav+catalogueGrid(bid, view.cat); bindNav(body); bindCatalogue(body, bid); return; }
    if(S.on.startsWith('store:')){ const sid=S.on.slice(6), key=storeKey(view.cat); body.innerHTML=nav+storeGrid(sid,key); bindNav(body); bindStore(body,sid,key); return; } }
  if(view.cat.startsWith('b:')){ body.innerHTML=nav+buildingGrid(view.cat); bindNav(body); bindBuilding(body); return; }
  if(view.cat==='d:bx'){ body.innerHTML=nav+boxGrid(); bindNav(body); return; }
  if(view.cat.startsWith('s:')){ const [,sid,key]=view.cat.split(':'); body.innerHTML=nav+storeGrid(sid,key); bindNav(body); bindStore(body,sid,key); return; }
  if(view.cat.startsWith('d:')){ body.innerHTML=nav+deviceGrid(view.cat); bindNav(body); bindDevices(body); return; }
  if(view.cat==='k:kit'){ body.innerHTML=nav+kitchenGrid(); bindNav(body); bindKitchens(body); return; }
  if(view.cat.startsWith('u:cat:')){ body.innerHTML=nav+catalogueGrid(view.cat.slice(6)); bindNav(body); bindCatalogue(body, view.cat.slice(6)); return; }
  if(view.cat.startsWith('u:')){ body.innerHTML=nav+unitGrid(view.cat); bindNav(body); bindUnitGrid(body); return; }
  // every other card: tap to open it; 3D quick view, and (editors) Rename and Delete, on each
  const unitCat=view.cat.startsWith('u:'), kind=unitCat?'units':'casework';
  const all=unitCat ? UNITLIB.filter(u=>U_OF[view.cat](u) && !u.purged) : ITEMS.filter(i=>i.cat===view.cat && !i.purged && !i.legacy);
  const items=all.filter(x=>!x.deleted), gone=all.length-items.length;
  const acts=id=>`<div class="cw-bact"><button class="btn ghost sm" data-c3d="${esc(id)}">3D</button><button class="btn ghost sm editor-only" data-cren="${esc(id)}">Rename</button><button class="btn ghost sm danger editor-only" data-cdel="${esc(id)}">Delete</button></div>`;
  const card = unitCat
    ? u=>`<div class="cw-card cw-bcard" data-uid="${esc(u.id)}"><div class="cw-thumb">${unitSVG(u.type, u.hand||'L', u.w, u.h, 120, u.place==='int', TYPES[u.type]?.round)}</div><b>${esc(u.name)}</b><small><code>${esc(u.id)}</code> · ${esc(TYPES[u.type]?.label||u.type)} · ${u.w} × ${u.h}″${u.sample?' · sample':''}</small>${acts(u.id)}${rulesBox(unitRules(u)).replace('<details class="ir-box" open>','<details class="ir-box">')}</div>`
    : d=>{ const it=newItem(d.k); return `<div class="cw-card cw-bcard" data-k="${d.k}"><div class="cw-thumb">${frontSVG(it)}</div><b>${esc(d.name)}</b><small>${sizeTxt(it)}${d.fixed?' · fixed size':''}</small>${acts(d.k)}</div>`; };
  body.innerHTML=nav+`
    <section class="cw-grid cw-bgrid"><div class="cw-bbar"><input type="search" id="cwQ" placeholder="Search names and IDs" aria-label="Search">${gone?`<button class="linkbtn editor-only" id="cwGone" title="⋯ → Deleted items">Deleted (${gone})</button>`:''}</div>
    ${items.map(card).join('') || `<p class="note">${unitCat?'None yet. Add one with ⋯ → Upload STEP → Window / door.':'Empty.'}</p>`}</section>`;
  bindNav(body);
  const again=()=>render(), lib=()=>import('./library-ui.js');
  body.querySelector('#cwGone')?.addEventListener('click', ()=>import('./trash-ui.js').then(m=>m.openTrash(kind)));
  const q=body.querySelector('#cwQ'); if(q) q.oninput=()=>{ const Q=q.value.toLowerCase(); body.querySelectorAll('.cw-bcard').forEach(c=>{ c.hidden=!!Q && !(c.textContent+' '+(c.dataset.k||c.dataset.uid||'')).toLowerCase().includes(Q); }); };
  body.querySelectorAll('[data-c3d]').forEach(b=>b.onclick=()=>import('./viewer3d.js').then(m=>m.openViewer(kind, b.dataset.c3d)));
  body.querySelectorAll('[data-cren]').forEach(b=>b.onclick=()=>lib().then(m=>m.askRename(kind, b.dataset.cren, again)));
  body.querySelectorAll('[data-cdel]').forEach(b=>b.onclick=()=>lib().then(m=>m.askDelete(b, kind, b.dataset.cdel, again)));
  body.querySelectorAll('.cw-bcard[data-uid]').forEach(c=>c.onclick=e=>{ if(e.target.closest('button')) return; import('./viewer3d.js').then(m=>m.openViewer('units', c.dataset.uid)); });
  body.querySelectorAll('.cw-bcard[data-k]').forEach(c=>c.onclick=e=>{ if(e.target.closest('button')) return; view.item=newItem(c.dataset.k); view.edit=null; view.explode=0; view.sel=null; HIST.reset(); render(); });
}

/* ---------------------------------------------------------------- Kitchens & groups: the saved kitchens (the team's),
   then the groups in the home on screen that aren't saved yet. Tap a card for it in 3D. */
const kitPic = (key, items) => { const u=kitchenPicture(key, items); return u ? `<img src="${u}" alt="">` : `<span class="note">${items.length} items</span>`; };
function kitchenGrid(){
  const ed=canEdit(), H=homeGroups().filter(M=>!M[0].grp.from || !kitchenById(M[0].grp.from));
  const card=K=>`<div class="cw-card cw-bcard cw-kit" data-kid="${esc(K.id)}"><div class="cw-thumb">${kitPic('kit:'+K.id+':'+(K.rev||0), K.items)}</div><b>${esc(K.name)}</b>
    <small>${K.items.length} items${K.note?` · ${esc(K.note)}`:''}</small>
    <div class="cw-bact"><button class="btn ghost sm" data-k3d="${esc(K.id)}">3D</button>${ed?`<button class="btn ghost sm" data-kren="${esc(K.id)}">Rename</button><button class="btn ghost sm danger" data-kdel="${esc(K.id)}">Delete</button>`:''}</div></div>`;
  const hcard=M=>{ const g=M[0].grp; return `<div class="cw-card cw-bcard cw-kit" data-hgid="${esc(g.id)}"><div class="cw-thumb">${kitPic('home:'+g.id, recipeOf(M))}</div><b>${esc(g.name)}</b>
    <small>${M.length} items · in ${esc(MODELS[state.model]?.name||'this home')}, not saved yet</small>
    <div class="cw-bact"><button class="btn ghost sm" data-h3d="${esc(g.id)}">3D</button>${ed?`<button class="btn ghost sm" data-hsave="${esc(g.id)}">Save to the library…</button>`:''}</div></div>`; };
  return `<section class="cw-grid cw-bgrid"><div class="cw-bbar"><input type="search" id="cwQ" placeholder="Search kitchens" aria-label="Search"></div>
    ${KITCHENS.map(card).join('') || '<p class="note">No saved kitchens yet. In a home, pick several cabinets, Group them, then Save to kitchen library.</p>'}
    ${H.length?`<div class="cw-ng cw-span">In this home · not in the library yet</div>${H.map(hcard).join('')}`:''}</section>`;
}
function bindKitchens(body){
  const again=()=>render(), view3d=(name, items, sub)=>import('./viewer3d.js').then(m=>m.openViewer('kitchen', null, { name, items, sub }));
  const q=body.querySelector('#cwQ'); if(q) q.oninput=()=>{ const Q=q.value.toLowerCase(); body.querySelectorAll('.cw-kit').forEach(c=>{ c.hidden=!!Q && !c.textContent.toLowerCase().includes(Q); }); };
  const openK=id=>{ const K=kitchenById(id); if(K) view3d(K.name, K.items, `saved kitchen · ${K.items.length} items`); };
  const openH=gid=>{ const M=groupMembers(gid); if(M.length) view3d(M[0].grp.name, recipeOf(M), `group in this home · ${M.length} items`); };
  body.querySelectorAll('[data-k3d]').forEach(b=>b.onclick=()=>openK(b.dataset.k3d));
  body.querySelectorAll('[data-h3d]').forEach(b=>b.onclick=()=>openH(b.dataset.h3d));
  body.querySelectorAll('.cw-kit[data-kid]').forEach(c=>c.onclick=e=>{ if(!e.target.closest('button')) openK(c.dataset.kid); });
  body.querySelectorAll('.cw-kit[data-hgid]').forEach(c=>c.onclick=e=>{ if(!e.target.closest('button')) openH(c.dataset.hgid); });
  body.querySelectorAll('[data-kren]').forEach(b=>b.onclick=async()=>{ const K=kitchenById(b.dataset.kren); if(!K) return; const v=await askName({ title:'Rename the kitchen', current:K.name }); if(!v || v===K.name) return;
    try{ await saveKitchen({ ...K, name:v }, true); toast(`Renamed to “${v}”`); again(); }catch(err){ toast('Not renamed: '+err.message); } });
  body.querySelectorAll('[data-kdel]').forEach(b=>b.onclick=async()=>{ const K=kitchenById(b.dataset.kdel); if(!K) return;
    if(b.dataset.sure!=='1'){ b.dataset.sure='1'; b.textContent='Tap again to delete'; return; }
    try{ await deleteKitchen(K.id); toast(`“${K.name}” deleted · homes that have it keep their copy`); again(); }catch(err){ toast('Not deleted: '+err.message); } });
  body.querySelectorAll('[data-hsave]').forEach(b=>b.onclick=()=>{ const M=groupMembers(b.dataset.hsave); if(M[0]) saveGroupDialog(M[0]); });
}
onKitchensChanged(()=>{ if(dlg?.open && view.cat==='k:kit' && !view.item && view.tab==='lib') render(); });

/* ---------------------------------------------------------------- windows & doors, by brand
   The Cubit library: what homes use. Sorted under each maker, the ones still to confirm with the maker flagged.
   Editors and admins edit any of them to any size (the rough opening follows unless set by hand). */
const fin2 = v => { const w=Math.floor(v+1e-6), f=Math.round((v-w)*16), g=(a,b)=>b?g(b,a%b):a; return f ? (f===16?`${w+1}″`:`${w} ${f/g(f,16)}/${16/g(f,16)}″`) : `${w}″`; };
const unitLine = u => { const r=rsoOf(u); return `${esc(TYPES[u.type]?.label||u.type)} · ${fin2(u.w)} × ${fin2(u.h)} unit${r?` · RSO ${fin2(r.w)} × ${fin2(r.h)}`:''}`; };
function unitGrid(cat){
  const ed=canEdit(), all=UNITLIB.filter(u=>U_OF[cat](u) && !u.purged), items=all.filter(u=>!u.deleted), gone=all.length-items.length;
  const groups={}; items.forEach(u=>(groups[brandKeyOf(u)] ||= []).push(u));
  const order=Object.keys(groups).sort((a,b)=>(a==='sample')-(b==='sample') || brandName(a).localeCompare(brandName(b)));
  const card=u=>`<div class="cw-card cw-bcard" data-uid="${esc(u.id)}"><div class="cw-thumb">${unitSVG(u.type, u.hand||'L', u.w, u.h, 120, u.place==='int', TYPES[u.type]?.round)}</div><b>${esc(u.name)}</b>
    <small><code>${esc(u.id)}</code> · ${unitLine(u)}${u.sample?' · sample':''}</small>${u.confirm?'<small class="flipflag">size to confirm with the maker</small>':''}
    <div class="cw-bact"><button class="btn ghost sm" data-c3d="${esc(u.id)}">3D</button>${ed?`<button class="btn ghost sm" data-uedit="${esc(u.id)}">Edit</button><button class="btn ghost sm" data-cren="${esc(u.id)}">Rename</button><button class="btn ghost sm danger" data-cdel="${esc(u.id)}">Delete</button>`:''}</div></div>`;
  const cats=BRANDS.map(b=>`<button class="linkbtn" data-cat="u:cat:${esc(b.id)}">${esc(b.name)} catalogue →</button>`).join(' ');
  return `<section class="cw-grid cw-bgrid"><div class="cw-bbar"><input type="search" id="cwQ" placeholder="Search names, IDs, brands" aria-label="Search">${gone?`<button class="linkbtn editor-only" id="cwGone">Deleted (${gone})</button>`:''}</div>
    <p class="note cw-span">The Cubit library: only these go into homes and the panel builder. ${ed?'Add more from a maker’s catalogue (the switch above), or ⋯ → Upload STEP → Window / door.':'Editors and admins adopt new ones from the makers’ catalogues.'}</p>
    ${order.map(k=>`<div class="cw-ng cw-span">${esc(brandName(k))} <small>${groups[k].length}</small></div>${groups[k].map(card).join('')}`).join('') || '<p class="note">None yet.</p>'}</section>`;
}
function bindUnitGrid(body){
  const again=()=>render(), lib=()=>import('./library-ui.js');
  body.querySelector('#cwGone')?.addEventListener('click', ()=>import('./trash-ui.js').then(m=>m.openTrash('units')));
  const q=body.querySelector('#cwQ'); if(q) q.oninput=()=>{ const Q=q.value.toLowerCase(); body.querySelectorAll('.cw-bcard').forEach(c=>{ c.hidden=!!Q && !(c.textContent+' '+(c.dataset.uid||'')).toLowerCase().includes(Q); }); };
  body.querySelectorAll('[data-c3d]').forEach(b=>b.onclick=()=>import('./viewer3d.js').then(m=>m.openViewer('units', b.dataset.c3d)));
  body.querySelectorAll('[data-cren]').forEach(b=>b.onclick=()=>lib().then(m=>m.askRename('units', b.dataset.cren, again)));
  body.querySelectorAll('[data-cdel]').forEach(b=>b.onclick=()=>lib().then(m=>m.askDelete(b, 'units', b.dataset.cdel, again)));
  body.querySelectorAll('[data-uedit]').forEach(b=>b.onclick=()=>editUnit(unitById(b.dataset.uedit)));
  body.querySelectorAll('.cw-bcard[data-uid]').forEach(c=>c.onclick=e=>{ if(e.target.closest('button')) return; import('./viewer3d.js').then(m=>m.openViewer('units', c.dataset.uid)); });
  body.querySelectorAll('.cw-bbar ~ .note [data-cat], .cw-span [data-cat]').forEach(b=>b.onclick=()=>{ view.cat=b.dataset.cat; render(); });
}
/* a maker's catalogue: every style and size as scanned, with what the maker offers; Adopt puts one in the Cubit library */
let catStyle=null;
function catalogueGrid(bid, cat){
  const b0=brandById(bid); if(!b0) return '<p class="note">No such catalogue.</p>';
  const uc=UNIT_CAT[cat], b=uc ? { ...b0, styles:b0.styles.filter(st=>TYPES[st.type]?.cat===uc || (uc==='door' && TYPES[st.type]?.cat==='patio')) } : b0;
  const ed=canEdit(), all=catalogOf(bid), st=catStyle && b.styles.some(s=>s.key===catStyle) ? catStyle : b.styles[0]?.key, S=b.styles.find(s=>s.key===st);
  const have=new Set(UNITLIB.filter(u=>!u.deleted).map(u=>u.adoptedFrom||u.id));
  const items=all.filter(u=>u.style===st), O=b.options||{};
  const card=u=>{ const r=u.rso, inLib=have.has(u.id);
    return `<div class="cw-card cw-bcard cw-catc${inLib?' in':''}" data-cid="${esc(u.id)}"><div class="cw-thumb">${unitSVG(u.type, 'L', u.w, u.h, 90)}</div><b>${fin2(u.w)} × ${fin2(u.h)}</b>
      <small><code>${esc(u.id)}</code> · RSO ${fin2(r.w)} × ${fin2(r.h)}</small>
      <div class="cw-bact"><button class="btn ghost sm" data-c3u="${esc(u.id)}">3D</button>${inLib?'<span class="note">✓ In the Cubit library</span>':ed?`<button class="btn sm" data-adopt="${esc(u.id)}">Adopt</button>`:''}</div></div>`; };
  const rates=(S?.ratings||[]).length?`<table class="cat-rt"><tr><th>Glass</th><th>Grilles</th><th>ER</th><th>PG</th><th>Air</th><th>Water</th><th>Wind</th></tr>${S.ratings.map(r=>`<tr><td>${r.glass}</td><td>${r.grilles?'yes':'no'}</td><td>${r.ER}</td><td>${r.PG}</td><td>${r.air}</td><td>${r.water}</td><td>${r.wind}</td></tr>`).join('')}</table>`:'';
  return `<section class="cw-grid cw-bgrid"><div class="cw-span cat-head">
      <h3>${esc(b.name)} <a href="${esc(b.url)}" target="_blank" rel="noopener" class="linkbtn">${esc(b.url.replace(/^https?:\/\//,''))}</a></h3>
      <p class="note">Scanned ${esc(b.scanned)}. ${esc(b.note)} Rough opening: unit + ${fin2(b.rso.dw)} wide and high${b.bm?`; brickmould unit + ${fin2(b.bm.dw)}`:''}. ${ed?'<b>Adopt</b> puts a size into the Cubit library, where it can be edited to the exact size North Air will make.':'Editors and admins adopt sizes into the Cubit library.'}</p>
      <div class="seg wrap sm cat-styles">${b.styles.map(s=>`<button data-cst="${esc(s.key)}" aria-pressed="${s.key===st}">${esc(s.name)} <small>${s.w.length*s.h.length+(s.extra?.length||0)}</small></button>`).join('')}</div>
      ${S?`<details class="cat-info" open><summary><b>${esc(S.name)}</b> · ${esc(S.note)} <a href="${esc(S.url)}" target="_blank" rel="noopener" class="linkbtn">maker's page</a></summary>
        <div class="cat-cols"><div><div class="eyebrow sm">Features</div><ul>${S.features.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>${S.hardware.length?`<div class="eyebrow sm">Hardware</div><ul>${S.hardware.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}</div>
        <div><div class="eyebrow sm">Colours</div><p class="note">Outside: ${esc((O.exterior||[]).join(', '))}<br>Inside: ${esc((O.interior||[]).join(', '))}</p><div class="eyebrow sm">Glass & grilles</div><p class="note">${esc((O.glass||[]).join(' · '))}<br>${esc((O.grilles||[]).join(', '))} · ${esc((O.grilleBars||[]).join('; '))}</p>${rates}</div></div>
        <p class="note">Sizes: ${S.w.map(fin2).join(', ')} wide × ${S.h.map(fin2).join(', ')} high (a grid of common sizes, to confirm with ${esc(b.name)})${S.extra?.length?`, plus ${S.extra.map(x=>`${fin2(x.w)} × ${fin2(x.h)}`).join(', ')} (${esc(S.extra[0].note.split(':')[0])})`:''}.</p></details>`:''}
      ${ed?`<div class="row"><button class="btn ghost sm" id="catAll">Adopt all ${items.filter(u=>!have.has(u.id)).length} ${esc(S?.name||'')} sizes</button></div>`:''}</div>
    ${items.map(card).join('')}</section>`;
}
async function adopt(u){ return saveTeamUnit({ ...u, adoptedFrom:u.id, rsoAuto:true, adopted:new Date().toISOString() }); }
function bindCatalogue(body, bid){
  body.querySelectorAll('[data-cst]').forEach(b=>b.onclick=()=>{ catStyle=b.dataset.cst; render(); });
  const byId=id=>catalogOf(bid).find(u=>u.id===id);
  body.querySelectorAll('[data-c3u]').forEach(b=>b.onclick=()=>{ const u=byId(b.dataset.c3u); if(u) import('./viewer3d.js').then(m=>m.openViewer('unit', null, { unit:u })); });
  body.querySelectorAll('[data-adopt]').forEach(b=>b.onclick=async()=>{ if(!canEdit()){ toast('Editors and admins adopt windows and doors.'); return; } const u=byId(b.dataset.adopt); if(!u) return; b.disabled=true;
    try{ await adopt(u); toast(`${u.name} adopted into the Cubit library`); render(); }catch(err){ toast('Not adopted: '+err.message); b.disabled=false; } });
  body.querySelector('#catAll')?.addEventListener('click', async e=>{ const b=e.target; if(b.dataset.sure!=='1'){ b.dataset.sure='1'; b.textContent='Tap again to adopt them all'; return; } b.disabled=true;
    const have=new Set(UNITLIB.filter(u=>!u.deleted).map(u=>u.adoptedFrom||u.id)), st=body.querySelector('[data-cst][aria-pressed="true"]')?.dataset.cst, L=catalogOf(bid).filter(u=>u.style===st && !have.has(u.id));
    let n=0; for(const u of L){ try{ await adopt(u); n++; }catch(err){ toast('Stopped: '+err.message); break; } } toast(`${n} adopted into the Cubit library`); render(); });
}
/* edit a Cubit library window or door: every size; the rough opening follows the brand's rule unless set by hand */
function editUnit(u){
  if(!u) return; if(!canEdit()){ toast('Editors and admins edit windows and doors.'); return; }
  let d=document.getElementById('unitDlg'); if(!d){ d=document.createElement('dialog'); d.id='unitDlg'; d.className='lib-dlg'; document.body.appendChild(d); }
  const x={ ...u, rso:u.rso?{...u.rso}:null }, cat=TYPES[u.type]?.cat;
  const types=Object.entries(TYPES).filter(([,t])=>t.cat===cat && !t.round===!TYPES[u.type]?.round);
  const draw=()=>{ const auto=x.rsoAuto || !x.rso, r=auto ? rsoOf({ ...x, rso:null, rsoAuto:true }) : x.rso, T=TYPES[x.type]||{};
    const fld=(k,l,v)=>`<label class="cw-f"><span>${l}</span><input data-uf="${k}" inputmode="decimal" value="${v}"><i>″</i></label>`;
    d.innerHTML=`<form method="dialog" class="dlg ue-dlg"><div class="dlg-h"><h2>Edit ${esc(u.id)}</h2><button class="btn ghost" value="cancel">Cancel</button></div>
      <p class="note">${esc(brandName(brandKeyOf(u)))}${u.adoptedFrom?` · adopted from the catalogue (${esc(u.adoptedFrom)})`:''}. Window and door makers build to size: set it to exactly what will be ordered.</p>
      <label class="fld">Name<input id="ueN" value="${esc(x.name)}" maxlength="100"></label>
      <div class="eyebrow sm">Type</div><div class="seg wrap sm">${types.map(([k,t])=>`<button type="button" data-ut="${k}" aria-pressed="${x.type===k}">${esc(t.label)}</button>`).join('')}</div>
      <div class="eyebrow sm">The unit</div><div class="cw-fs">${fld('w','Width',x.w)}${fld('h','Height',x.h)}${fld('d','Frame depth',x.d||4.5)}</div>
      ${T.hand?`<div class="eyebrow sm">${esc(T.hand)} (seen from outside)</div><div class="seg sm">${['L','R'].map(h=>`<button type="button" data-uh="${h}" aria-pressed="${(x.hand||'L')===h}">${h==='L'?'Left':'Right'}</button>`).join('')}</div>`:''}
      ${T.swing?`<div class="eyebrow sm">Swing</div><div class="seg sm">${['in','out'].map(v=>`<button type="button" data-us="${v}" aria-pressed="${(x.swing||'in')===v}">${v==='in'?'In':'Out'}</button>`).join('')}</div>`:''}
      ${cat==='door'?`<div class="eyebrow sm">Where</div><div class="seg sm"><button type="button" data-up="ext" aria-pressed="${x.place!=='int'}">Exterior</button><button type="button" data-up="int" aria-pressed="${x.place==='int'}">Interior</button></div>`:''}
      <div class="eyebrow sm">Rough stud opening</div>
      <label class="wb-chk"><input type="checkbox" id="ueAuto" ${auto?'checked':''}> From the unit (${esc(brandName(brandKeyOf(u)))} rule: + ${fin2((brandById(brandKeyOf(u))?.rso?.dw)??1.25)})</label>
      <div class="cw-fs">${auto?`<p class="note">RSO <b>${fin2(r.w)} × ${fin2(r.h)}</b></p>`:fld('rw','RSO width',r.w)+fld('rh','RSO height',r.h)}</div>
      <label class="wb-chk"><input type="checkbox" id="ueOk" ${x.confirm?'':'checked'}> Size confirmed with the maker</label>
      <div class="row"><button class="btn" type="button" id="ueSave">Save to the Cubit library</button></div>
      <p class="note">Walls already drawn with ${esc(u.id)} keep their rough opening until it's updated: opening one in the panel builder flags it, with a button to update it.</p></form>`;
    d.querySelectorAll('[data-uf]').forEach(i=>i.onchange=()=>{ const v=parseFloat(i.value); if(!isFinite(v)||v<=0) return; const k=i.dataset.uf;
      if(k==='rw'||k==='rh'){ x.rso={ ...(x.rso||r), [k==='rw'?'w':'h']:v }; x.rsoAuto=false; } else x[k]=v; setTimeout(draw); });
    d.querySelectorAll('[data-ut]').forEach(b=>b.onclick=()=>{ x.type=b.dataset.ut; draw(); });
    d.querySelectorAll('[data-uh]').forEach(b=>b.onclick=()=>{ x.hand=b.dataset.uh; draw(); });
    d.querySelectorAll('[data-us]').forEach(b=>b.onclick=()=>{ x.swing=b.dataset.us; draw(); });
    d.querySelectorAll('[data-up]').forEach(b=>b.onclick=()=>{ if(b.dataset.up==='int') x.place='int'; else delete x.place; draw(); });
    d.querySelector('#ueN').onchange=e=>{ x.name=e.target.value.trim()||x.name; };
    d.querySelector('#ueAuto').onchange=e=>{ if(e.target.checked){ x.rsoAuto=true; } else { x.rso=rsoOf({ ...x, rso:null, rsoAuto:true }); x.rsoAuto=false; } draw(); };
    d.querySelector('#ueOk').onchange=e=>{ x.confirm=!e.target.checked; };
    d.querySelector('#ueSave').onclick=async e=>{ e.target.disabled=true; x.name=d.querySelector('#ueN').value.trim()||x.name;
      if(x.rsoAuto){ x.rso=rsoOf({ ...x, rso:null, rsoAuto:true }); const bm=bmOf({ ...x, bm:null, rsoAuto:true }); if(bm) x.bm=bm; }
      try{ await saveTeamUnit(x); d.close(); toast(`${x.id} saved · ${fin2(x.w)} × ${fin2(x.h)}, RSO ${fin2(x.rso.w)} × ${fin2(x.rso.h)}`); if(dlg?.open) render(); }catch(err){ toast('Not saved: '+err.message); e.target.disabled=false; } };
  };
  draw(); d.showModal();
}
onUnitsChanged(()=>{ if(dlg?.open && view.cat.startsWith('u:') && view.tab==='lib') render(); });

/* a store's list for one category: what can be ordered online and shipped to Cubit; Adopt puts it in the Cubit library */
function storeGrid(sid, key){
  const S=storeById(sid), L=S?.cats?.[key]||[], ed=canEdit(), catName=navName(CATS.some(c=>c.k===key)?key:'d:'+key);
  const card=P=>{ const done=isAdopted(sid, key, P.sku), mine=done && ITEMS.find(x=>x.k===`HD${P.sku}`);
    return `<div class="cw-card cw-bcard cw-catc${done?' in':''}"><div class="cw-thumb">${mine?frontSVG(newItem(mine.k)):`<svg viewBox="0 0 ${P.w+4} ${P.h+4}" aria-hidden="true"><rect x="2" y="2" width="${P.w}" height="${P.h}" fill="#cfd3d6" stroke="#1c211e" stroke-width="${Math.max(P.w,P.h)/90}"/><rect x="${2+P.w*0.06}" y="${2+P.h*0.1}" width="${P.w*0.88}" height="${P.h*0.8}" fill="#24282c"/></svg>`}</div>
      <b>${esc(P.name)}</b><small><code>${esc(P.model)}</code> · SKU ${esc(P.sku)} · ${fin2(P.w)} × ${fin2(P.h)} × ${fin2(P.d)}${P.lbs?` · ${P.lbs} lb`:''}</small>
      <small>${P.price?`<b>$${P.price.toLocaleString('en-CA',{minimumFractionDigits:P.price%1?2:0})}</b> · `:''}${[P.btu?`${P.btu.toLocaleString()} BTU`:'', P.watts?`${P.watts} W`:'', P.power||''].filter(Boolean).join(' · ')}</small>
      ${P.note?`<p class="note">${esc(P.note)}</p>`:''}
      <div class="cw-bact"><a class="btn ghost sm" href="${esc(P.url)}" target="_blank" rel="noopener">Home Depot</a>${done?`<span class="note">✓ In the Cubit library${mine?'':''}</span>`:ed?`<button class="btn sm" data-sadopt="${esc(P.sku)}">Adopt</button>`:''}</div></div>`; };
  return `<section class="cw-grid cw-bgrid"><div class="cw-span cat-head"><h3>${esc(S?.name||sid)} store · ${esc(catName)} <a href="${esc(S?.url||'')}" target="_blank" rel="noopener" class="linkbtn">${esc((S?.url||'').replace(/^https?:\/\/(www\.)?/,''))}</a></h3>
      <p class="note">${esc(S?.note||'')} Ships to ${esc(S?.shipTo||'')}${S?.pickup?` (or pick up at ${esc(S.pickup)})`:''}. Checked ${esc(S?.checked||'')}. ${ed?'<b>Adopt</b> puts one in the Cubit library for the whole team.':'Editors and admins adopt these into the Cubit library.'}</p></div>
    ${L.map(card).join('') || '<p class="note">Nothing listed yet.</p>'}</section>`;
}
function bindStore(body, sid, key){
  body.querySelectorAll('[data-sadopt]').forEach(b=>b.onclick=async()=>{ if(!canEdit()){ toast('Editors and admins adopt store products.'); return; }
    const P=(storeById(sid)?.cats?.[key]||[]).find(p=>p.sku===b.dataset.sadopt); if(!P) return; b.disabled=true;
    try{ await adoptStore(sid, key, P); toast(`${P.brand} ${P.model} adopted into the Cubit ${navName(CATS.some(c=>c.k===key)?key:'d:'+key).toLowerCase()} library`); render(); }catch(err){ toast('Not adopted: '+err.message); b.disabled=false; } });
}
onAdoptedChanged(()=>{ if(dlg?.open && view.tab==='lib' && !view.item) render(); });
/* the electrical device boxes (boxes.js): which walls get which, and the pocket the CNC cuts for each */
function boxGrid(){
  const card=b=>`<div class="cw-card cw-bcard"><div class="cw-thumb">${boxSVG(b)}</div><b>${esc(b.name)}</b>
    <small>${b.model?`<code>${esc(b.model)}</code> · `:''}${b.w} × ${b.h} × ${b.d}″ deep${b.cuin?` · ${b.cuin} cu in`:''}${b.price?` · $${b.price.toFixed(2)}`:''}</small>
    <small>CNC pocket ${fin2(b.pocket.w)} × ${fin2(b.pocket.h)}, <b>${fin2(b.pocket.depth)} deep</b></small>
    <p class="note">${b.use==='jbox'?'<b>Automatic for hardwired fireplaces</b>. ':b.use==='shallow'?`<b>Automatic in walls thinner than ${fin2(THIN_BELOW)}</b>. `:`<b>Automatic in walls ${fin2(THIN_BELOW)} and thicker</b>. `}${esc(b.note||'')}${b.url?` <a class="linkbtn" href="${esc(b.url)}" target="_blank" rel="noopener">Home Depot</a>`:''}</p></div>`;
  return `<section class="cw-grid cw-bgrid"><p class="note cw-span">The box a plug, switch or data jack sits in. Each wall gets one by its thickness, and the CNC pocket follows (a box's depth unlocked by hand in the panel builder keeps its own).</p>${BOXLIB.map(card).join('')}</section>`;
}
/* fold away a category group (left) or a heading's cards (right); remembered in this browser */
const FOLD_KEY='cubit-lib-folds';
let folds=new Set(); try{ folds=new Set(JSON.parse(localStorage.getItem(FOLD_KEY)||'[]')); }catch(e){}
const saveFolds=()=>{ try{ localStorage.setItem(FOLD_KEY, JSON.stringify([...folds])); }catch(e){} };
function bindFolds(body){
  // left: each group's name folds its categories (the one open stays shown)
  body.querySelectorAll('.cw-cats .cw-ng').forEach(h=>{ const key='nav:'+h.textContent.trim(); h.classList.add('fold');
    const items=[]; for(let n=h.nextElementSibling; n && !n.classList.contains('cw-ng'); n=n.nextElementSibling) items.push(n);
    const cur=items.some(n=>n.getAttribute('aria-current')==='true');
    const set=()=>{ const shut=folds.has(key) && !cur; h.classList.toggle('shut', shut); items.forEach(n=>n.hidden=shut); };
    h.onclick=()=>{ if(folds.has(key)) folds.delete(key); else folds.add(key); saveFolds(); set(); }; set(); });
  // right: a heading in the cards (a brand, a group) folds the cards under it
  body.querySelectorAll('.cw-grid > .cw-ng.cw-span').forEach(h=>{ const key='grid:'+view.cat+':'+h.firstChild?.textContent?.trim(); h.classList.add('fold');
    const items=[]; for(let n=h.nextElementSibling; n && !n.classList.contains('cw-ng'); n=n.nextElementSibling) items.push(n);
    const set=()=>{ const shut=folds.has(key); h.classList.toggle('shut', shut); items.forEach(n=>n.hidden=shut); };
    h.onclick=()=>{ if(folds.has(key)) folds.delete(key); else folds.add(key); saveFolds(); set(); }; set(); });
}

function bindNav(body){ bindFolds(body); body.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{ view.cat=b.dataset.cat; view.item=null; showGone=false; if(view.tab==='set' && !setTab(view.cat)) view.tab='lib'; render(); }); }
/* walls, floors / ceilings / roofs, decks: cards; tap for 3D; editors rename and delete (2 weeks to bring back) */
function buildingGrid(cat){
  const all=B_LIST[cat]().filter(x=>!x.purged), gone=all.filter(x=>x.deleted), list=all.filter(x=>showGone ? x.deleted : !x.deleted)
    .sort((a,b)=>String(a.name).localeCompare(String(b.name), undefined, {numeric:true}));
  const thumb=x=>{ try{ return cat==='b:walls' ? thumbSVG(x) : cat==='b:layers' ? layerThumb(x) : `<svg viewBox="0 0 ${x.w+2} ${x.d+2}"><rect x="1" y="1" width="${x.w}" height="${x.d}" fill="#d9c6a2" stroke="#5b4a33" stroke-width=".2"/></svg>`; }catch(e){ return ''; } };
  const sub=x=> cat==='b:walls' ? `${x.len}′ ${x.type==='int'?'interior / connecting':'exterior'} · ${(x.openings||[]).length} openings` : cat==='b:layers' ? `${LAYER_NAME[x.kind]||x.kind} · ${x.len}′ · ${(x.holes||[]).length} holes` : `${x.w}′ × ${x.d}′ frame`;
  return `<section class="cw-grid cw-bgrid">
    <div class="cw-bbar"><input type="search" id="cwQ" placeholder="Search names and IDs" aria-label="Search">${gone.length?`<button class="linkbtn editor-only" id="cwGone" title="⋯ → Deleted items">Deleted (${gone.length})</button>`:''}</div>
    ${list.map(x=>`<div class="cw-card cw-bcard" data-bid="${esc(x.id)}"><div class="cw-thumb">${thumb(x)}</div><b>${esc(x.name)}</b><small><code>${esc(x.id)}</code> · ${esc(sub(x))}</small>
      <div class="cw-bact">${showGone?`<button class="btn ghost sm editor-only" data-bres="${esc(x.id)}">Restore</button>`:`<button class="btn ghost sm" data-b3d="${esc(x.id)}">3D</button>${cat==='b:walls'||cat==='b:layers'?`<button class="btn ghost sm editor-only" data-bedit="${esc(x.id)}">Edit</button>`:''}<button class="btn ghost sm editor-only" data-bren="${esc(x.id)}">Rename</button><button class="btn ghost sm danger editor-only" data-bdel="${esc(x.id)}">Delete</button>`}</div></div>`).join('') || `<p class="note">${showGone?'Nothing deleted here.':'Empty.'}</p>`}
  </section>`;
}
function bindBuilding(body){
  const kind=B_KIND[view.cat], lib=()=>import('./library-ui.js'), again=()=>render();
  body.querySelector('#cwGone')?.addEventListener('click', ()=>import('./trash-ui.js').then(m=>m.openTrash(kind)));
  const q=body.querySelector('#cwQ'); if(q) q.oninput=()=>{ const Q=q.value.toLowerCase(); body.querySelectorAll('.cw-bcard').forEach(c=>{ c.hidden=!!Q && !c.textContent.toLowerCase().includes(Q); }); };
  body.querySelectorAll('[data-b3d]').forEach(b=>b.onclick=()=>import('./viewer3d.js').then(m=>m.openViewer(kind, b.dataset.b3d)));
  body.querySelectorAll('.cw-bcard').forEach(c=>c.onclick=e=>{ if(e.target.closest('button')) return; import('./viewer3d.js').then(m=>m.openViewer(kind, c.dataset.bid)); });
  body.querySelectorAll('[data-bren]').forEach(b=>b.onclick=()=>lib().then(m=>m.askRename(kind, b.dataset.bren, again)));
  // Edit: the panel builder on this wall (or floor / ceiling / roof); Save writes over it, Save as new adds another.
  // The library stays open underneath and shows the change when the builder closes.
  body.querySelectorAll('[data-bedit]').forEach(b=>b.onclick=async()=>{ const id=b.dataset.bedit;
    const before=new Set(document.querySelectorAll('dialog[open]'));
    if(kind==='walls') (await import('./wall-builder.js')).openWallBuilder({ from:id });
    else (await import('./layer-builder.js')).openLayerBuilder({ from:id });
    const d=[...document.querySelectorAll('dialog[open]')].find(x=>!before.has(x)); d?.addEventListener('close', again, { once:true }); });
  body.querySelectorAll('[data-bdel]').forEach(b=>b.onclick=()=>lib().then(m=>m.askDelete(b, kind, b.dataset.bdel, again)));
  body.querySelectorAll('[data-bres]').forEach(b=>b.onclick=()=>import('./libedit.js').then(async m=>{ try{ await m.restoreItem(kind, b.dataset.bres); toast('Restored'); render(); }catch(e){ toast(e.message); } }));
}
/* plugs & switches (devices.js): cards with a front view; 3D, Rename, Delete; ＋ New and Edit (team-added ones) */
const FEATS = ['TR','WR','GFCI','AFCI','USB-A','USB-C','dimmer','smart','lighted','pilot','timer','sensor','fan','split','switched','240 V','outdoor','neutral'];
const LOOKS = { sw:['rocker','toggle','double','triple','dimmer','rotary','smart','sensor','timer','fan','push','combo','therm'], rc:['decora','duplex','single','gfci','usb','big'], dt:['jack','coax','brush'] };
function deviceGrid(cat){
  const kind=cat.slice(2), all=DEVICES.filter(d=>d.kind===kind && !d.purged), items=all.filter(d=>!d.deleted), gone=all.length-items.length;
  const word = kind==='sw'?'switch':kind==='rc'?'plug':'data jack';
  return `<section class="cw-grid cw-bgrid"><div class="cw-bbar"><input type="search" id="cwQ" placeholder="Search names, IDs and features" aria-label="Search"><button class="btn sm editor-only" id="cwNewDev">＋ New ${word}</button>${gone?`<button class="linkbtn editor-only" id="cwGone">Deleted (${gone})</button>`:''}</div>
    ${items.map(d=>`<div class="cw-card cw-bcard" data-did="${esc(d.id)}"><div class="cw-thumb">${deviceSVG(d, 96)}</div><b>${esc(d.name)}</b>
      <small><code>${esc(d.id)}</code>${d.way&&d.kind==='sw'?` · ${d.way===1?'single-pole':d.way+'-way'}`:''}${d.amp?` · ${d.amp} A`:''}${d.n>1?` · ${d.n} in one gang`:''}${(d.feats||[]).length?` · ${esc(d.feats.join(', '))}`:''}${d.custom?' · added by the team':''}</small>
      ${d.note?`<small>${esc(d.note)}</small>`:''}
      <div class="cw-bact"><button class="btn ghost sm" data-c3d="${esc(d.id)}">3D</button>${d.custom?`<button class="btn ghost sm editor-only" data-dedit="${esc(d.id)}">Edit</button>`:''}<button class="btn ghost sm editor-only" data-cren="${esc(d.id)}">Rename</button><button class="btn ghost sm danger editor-only" data-cdel="${esc(d.id)}">Delete</button></div></div>`).join('') || '<p class="note">None yet.</p>'}</section>`;
}
function bindDevices(body){
  const kind=view.cat.slice(2), again=()=>render(), lib=()=>import('./library-ui.js');
  const q=body.querySelector('#cwQ'); if(q) q.oninput=()=>{ const Q=q.value.toLowerCase(); body.querySelectorAll('.cw-bcard').forEach(c=>{ c.hidden=!!Q && !c.textContent.toLowerCase().includes(Q); }); };
  body.querySelector('#cwGone')?.addEventListener('click', ()=>import('./trash-ui.js').then(m=>m.openTrash('devices')));
  body.querySelector('#cwNewDev')?.addEventListener('click', ()=>editDevice(null, kind));
  body.querySelectorAll('[data-dedit]').forEach(b=>b.onclick=()=>editDevice(deviceById(b.dataset.dedit), kind));
  body.querySelectorAll('[data-c3d]').forEach(b=>b.onclick=()=>import('./viewer3d.js').then(m=>m.openViewer('devices', b.dataset.c3d)));
  body.querySelectorAll('[data-cren]').forEach(b=>b.onclick=()=>lib().then(m=>m.askRename('devices', b.dataset.cren, again)));
  body.querySelectorAll('[data-cdel]').forEach(b=>b.onclick=()=>lib().then(m=>m.askDelete(b, 'devices', b.dataset.cdel, again)));
}
/* a new switch / plug / data device (or edit one the team added) */
function editDevice(d, kind){
  if(!canEdit()){ toast('Only editors and admins add to the Library.'); return; }
  const k=d?.kind||kind, D=document.createElement('dialog'); D.className='lib-dlg';
  const f=d||{ kind:k, way:1, n:1, feats:k==='rc'?['TR']:[], look:LOOKS[k][0] };
  D.innerHTML=`<form method="dialog" class="dlg dev-dlg"><div class="dlg-h"><h2>${d?'Edit':'New'} ${k==='sw'?'switch':k==='rc'?'plug (receptacle)':'data / TV jack'}</h2></div>
    <label>Name<input id="dvName" value="${esc(f.name||'')}" maxlength="80" placeholder="${k==='sw'?'e.g. Decora smart dimmer, 3-way':k==='rc'?'e.g. Duplex 15 A TR + USB-C':'e.g. Cat 6A jack'}" required></label>
    ${k==='sw'?`<label>Works as<select id="dvWay"><option value="1" ${f.way===1?'selected':''}>Single-pole only</option><option value="3" ${f.way===3?'selected':''}>Single-pole or 3-way</option><option value="4" ${f.way===4?'selected':''}>4-way</option></select></label>`:''}
    ${k!=='rc'?`<label>${k==='sw'?'Switches':'Jacks'} in one gang<select id="dvN">${[1,2,3].map(n=>`<option ${ (f.n||1)===n?'selected':''}>${n}</option>`).join('')}</select></label>`:''}
    <label>Amps<input id="dvAmp" inputmode="numeric" value="${f.amp||''}" placeholder="15"></label>
    <label>Looks like<select id="dvLook">${LOOKS[k].map(l=>`<option ${f.look===l?'selected':''}>${l}</option>`).join('')}</select></label>
    <fieldset class="dv-feats"><legend>Features</legend>${FEATS.map(x=>`<label class="chk"><input type="checkbox" value="${x}" ${(f.feats||[]).includes(x)?'checked':''}> ${x}</label>`).join('')}</fieldset>
    <label>Note<input id="dvNote" value="${esc(f.note||'')}" maxlength="300" placeholder="where it's used, a model to buy"></label>
    <div class="row"><button class="btn" value="ok">Save to the Library</button><button class="btn ghost" value="cancel" formnovalidate>Cancel</button></div></form>`;
  document.body.appendChild(D);
  D.addEventListener('close', async()=>{ const ok=D.returnValue==='ok', v=id=>D.querySelector(id)?.value; const name=(v('#dvName')||'').trim();
    const item={ id:d?.id || newDeviceId(k, name), kind:k, name, way:k==='sw'?+v('#dvWay'):undefined, n:k!=='rc'?+v('#dvN'):undefined, amp:+v('#dvAmp')||undefined, look:v('#dvLook'),
      feats:[...D.querySelectorAll('.dv-feats input:checked')].map(i=>i.value), note:(v('#dvNote')||'').trim() };
    D.remove(); if(!ok || !name) return;
    try{ await saveDevice(item); toast(`${name} ${d?'saved':'added to the Library'}`); render(); }catch(e){ toast('Not saved: '+(e.message||e)); } });
  D.returnValue=''; D.showModal();
}
/* the rules of a category (the Settings tab) */
let RD=null;
const SIDE=[['free','Free'],['chase','Chases'],['fixed','Fixed']];
function wallRulesHTML(){
  RD ||= JSON.parse(JSON.stringify(rules()));
  const ed=canEdit(), inp=(k,f,v)=>`<input data-r="${k}:${f}" inputmode="decimal" value="${v==null?'':Math.round(v*16)/16}" ${ed?'':'disabled'}>`;
  const lk=(k,f,on)=>`<button class="wb-lock${on?'':' open'}" data-rl="${k}:${f}" aria-pressed="${!!on}" ${ed?'':'disabled'} title="${on?'Locked':'Free'}">${on?'🔒':'🔓'}</button>`;
  return `<h3>Wall rules</h3><p class="note">Every wall built (in the panel builder) starts its items at these heights and depths. 🔒 = locked: only unlocked on purpose on one item. Chases = snaps sideways to the nearest electrical chase (6″ in from each original panel edge, then every foot).</p>
    <table class="wb-rt"><thead><tr><th></th><th>Height</th><th>Depth</th><th>Sideways</th></tr></thead><tbody>
    ${Object.entries(RD).map(([k,r])=>`<tr><th>${esc(r.label)}<small>${k==='window'||k==='round'?'sill':'centre'}</small></th><td><span class="wb-rc">${inp(k,'y',r.y)}${lk(k,'ylock',r.ylock)}</span></td>
      <td>${r.depth!=null?`<span class="wb-rc">${inp(k,'depth',r.depth)}${lk(k,'dlock',r.dlock)}</span>`:'<span class="muted">—</span>'}</td>
      <td><div class="seg sm">${SIDE.map(([v,l])=>`<button data-rs="${k}:${v}" aria-pressed="${r.side===v}" ${ed?'':'disabled'}>${l}</button>`).join('')}</div></td></tr>`).join('')}</tbody></table>
    <div class="row">${ed?`<button class="btn sm" id="cwRulesSave">Save rules${sharedRules()?' for everyone':''}</button><button class="btn ghost sm" id="cwRulesUndo">Undo changes</button>`:'<span class="note">Editors and admins change the rules.</span>'}</div>`;
}
const PLUMB_RULES = `<h3>Plumbing rules</h3><ul class="el-rules">
  <li>A fixture with its rough-in mapped (toilets, the MAAX Biarritz showers, the Mirolin Liberty) cuts its drain hole in the interior floor under it; it moves, turns and mirrors with the fixture. A tub, shower or toilet with no rough-in mapped is flagged.</li>
  <li>A drain hole at the edge of the floor cassette or across a panel joint is flagged.</li>
  <li>Alcove tubs and showers need a wall at the back and both ends. The valve end goes on an inside wall: no supply pipes in a SIP outside wall. No window or door where the valve, spout or shower arm go.</li>
  <li>No plug within 500 mm of a tub or shower (across the floor, same room).</li></ul>`;
const HEAT_RULES = `<h3>Heating rules</h3><ul class="el-rules">
  <li>Fireplace: Power is Plug or Hardwired; its receptacle or junction box goes inside the insert's cavity, on its own circuit, and moves with the fireplace.</li>
  <li>Baseboard heaters: no plug on the wall above one. Usually under a window.</li>
  <li>Heat pump wall units: high on the wall, about 6″ under the ceiling; line set, condensate and power through the wall behind.</li></ul>`;
function rulesFor(kind){
  if(kind==='walls') return wallRulesHTML();
  if(kind==='elec') return `<h3>Electrical rules</h3><p class="note">Heights and locks of plug and switch boxes are in Walls → Wall rules.</p>
    <div class="row"><button class="btn ghost sm" id="cwElecHome">This home's electrical…</button><span class="note">what was placed, 3-way switches to confirm, data boxes, re-lay</span></div>${elecRules()}`;
  if(kind==='plumb') return PLUMB_RULES;
  if(kind==='heat') return HEAT_RULES;
  return '';
}
let elecRules=()=>'';
import('./electrical-ui.js').then(m=>{ elecRules=()=>m.rulesHTML().replace('<details class="help">','<details class="help" open>'); });
function bindRules(body){
  const box=body.querySelector('.cw-rules'); if(!box) return;
  box.querySelector('#cwElecHome')?.addEventListener('click', ()=>import('./electrical-ui.js').then(m=>{ dlg.close(); m.openElectrical(); }));
  box.querySelectorAll('[data-r]').forEach(i=>i.onchange=()=>{ const [k,f]=i.dataset.r.split(':'), v=parseFloat(i.value); if(isFinite(v) && v>=0) RD[k][f]=v; render(); });
  box.querySelectorAll('[data-rl]').forEach(b=>b.onclick=()=>{ const [k,f]=b.dataset.rl.split(':'); RD[k][f]=!RD[k][f]; render(); });
  box.querySelectorAll('[data-rs]').forEach(b=>b.onclick=()=>{ const [k,v]=b.dataset.rs.split(':'); RD[k].side=v; render(); });
  box.querySelector('#cwRulesUndo')?.addEventListener('click', ()=>{ RD=null; render(); });
  box.querySelector('#cwRulesSave')?.addEventListener('click', async()=>{ try{ await saveRules(RD); RD=null; render(); toast(`Wall rules saved${sharedRules()?' for the whole team':' (in this browser)'}`); }catch(e){ toast(`Couldn't save the rules: ${e.message||e}`); } });
}

/* ---------------------------------------------------------------- one item: 3D, sizes, options, parts */
function groupsOf(parts){
  const G=new Map();
  parts.forEach((p,i)=>{ const key=[p.hw||p.solid?'x':'p', p.name.replace(/, (left|right)$/,'').replace(/^(Left|Right) end$/,'End').replace(/ \d+( |$)/,' # '), p.cutL, p.cutW, p.band.long, p.band.short, p.cnc?JSON.stringify([p.cnc.outline,p.cnc.ops]):''].join('|');
    const g=G.get(key); if(g) g.idx.push(i); else G.set(key,{ p, idx:[i] }); });
  return [...G.values()];
}
function sizeRow(key, label, val, list, range, fixed){
  return `<div class="cw-size"><label for="cw-${key}">${label}</label>
    <div class="cw-step"><button class="cw-b" data-step="${key}" data-dir="-1" aria-label="Smaller" ${fixed?'disabled':''}>−</button><input id="cw-${key}" data-len="${key}" value="${esc(show(val))}" inputmode="decimal" ${fixed?'disabled':''}><span class="u">${unitSign()}</span><button class="cw-b" data-step="${key}" data-dir="1" aria-label="Bigger" ${fixed?'disabled':''}>+</button></div>
    ${list&&!fixed?`<div class="cw-pre">${list.map(v=>`<button data-pre="${key}" data-v="${v}" aria-pressed="${Math.abs(v-val)<1e-6}">${show(v)}</button>`).join('')}</div>`:''}</div>`;
}
function renderDetail(body){
  const it=view.item, d=itemDef(it.k), cat=catOf(d.cat), parts=partsOf(it), G=groupsOf(parts);
  const cut=G.filter(g=>!g.p.hw && !g.p.solid), solids=G.filter(g=>g.p.solid), hw=hardwareOf(it), tot=totals([it]);
  const editing=!!view.edit;
  HIST.track();
  body.innerHTML=`<div class="cw-detail">
    <div class="cw-view">
      <div class="cw-vh"><button class="btn ghost sm" id="cwBack">← ${editing?'Close':esc(cat.name)}</button><b>${esc(d.name)}</b><span class="spacer"></span>${histButtons(HIST)}
        <button class="btn ghost sm" id="cwExB" aria-pressed="${view.explode>0.5}">Exploded</button><button class="btn ghost sm" id="cwFront">Front</button><button class="btn ghost sm" id="cwIso">3D</button></div>
      <canvas id="cwCanvas" aria-label="3D view of ${esc(d.name)}"></canvas>
      <p class="cw-hint">Spread three fingers to explode · pinch three to close · tap a part to find it</p>
    </div>
    <div class="cw-side">
      ${d.note?`<p class="note">${esc(d.note)} · check the maker's current spec sheet before ordering.</p>`:''}
      ${rulesBox(itemRules(it.k))}
      <div class="cw-sizes">
        ${sizeRow('w','Width',it.w,d.sizes,d.wR,d.fixed)}
        ${sizeRow('h','Height',it.h,d.hSizes,d.hR,d.fixed)}
        ${sizeRow('d','Depth',it.d,d.dSizes,d.dR,d.fixed)}
        ${sizeRow('y','Off the floor',it.y||0,null,[0,96],false)}
      </div>
      ${(d.opts||[]).map(([k,l,vals])=>`<div class="cw-opt"><span>${l}</span><div class="seg wrap">${vals.map(v=>`<button data-opt="${k}" data-v="${esc(v)}" aria-pressed="${String((it.opt||{})[k] ?? d.opt?.[k])===String(v)}">${esc(optLabel(k,v))}</button>`).join('')}</div></div>`).join('')}
      ${parts.some(p=>p.role==='front' && p.cnc) ? `<div class="cw-opt"><span>Handles</span><div class="seg wrap"><button data-handle="later" aria-pressed="${(it.opt?.handle ?? settings().handle)==='later'}">Drill later</button>${(settings().handles||[]).map(h=>`<button data-handle="${esc(h.id)}" aria-pressed="${(it.opt?.handle ?? settings().handle)===h.id}">${esc(h.name)}</button>`).join('')}</div></div>` : ''}
      <div class="cw-opt"><span>Mirror</span><div class="seg"><button data-mir="0" aria-pressed="${!it.mirror}">As drawn</button><button data-mir="1" aria-pressed="${!!it.mirror}">Mirrored (left ↔ right)</button></div></div>
      <div class="row cw-acts">
        ${editing ? `<button class="btn" id="cwDone">Done</button>` : `<button class="btn edit-only" id="cwAdd">Add to this home</button>`}
        ${cut.length?`<button class="btn ghost" id="cwPlan">Cutting plan</button><button class="btn ghost" id="cwCsv">Cut list (CSV)</button>`:''}
      </div>
      ${cut.length?`<p class="cw-tot">${parts.filter(p=>!p.hw&&!p.solid).length} parts · ${Object.entries(tot.area).map(([n,a])=>`${esc(n)} ${fx3(settings().mat.t)} · ${a.toFixed(1)} sq ft`).join(' · ')} · ${tot.bandFt} ft of edge band</p>`:''}
      ${cut.length?`<h3>Parts <small>cut sizes · open one to see exactly how it's cut</small></h3>
      <div class="cw-parts" role="list">${cut.map(g=>{ const p=g.p; return `<details class="cw-part" data-parts="${g.idx.join(',')}" role="listitem"><summary><span class="q">${g.idx.length}×</span><span class="n">${esc(g.idx.length>1?p.name.replace(/, (left|right)$/,'').replace(/^(Left|Right) end$/,'End'):p.name)}</span><span class="s">${fx3(p.cutL)} × ${fx3(p.cutW)}</span></summary>
        <div class="pt-body"><p class="note">${p.cnc?`On the CNC: <b>${esc(p.cnc.up)} up</b> · `:''}${fx3(p.T)} thick · edge band ${bandTxt(p.band)}${p.note?` · ${esc(p.note)}`:''}</p>${p.cnc?partSVG(p,{px:560})+opsTable(p):`<ul>${p.ops.map(o=>`<li>${esc(o)}</li>`).join('')}</ul>`}</div></details>`; }).join('')}</div>`:''}
      ${solids.length?`<h3>Pieces</h3><div class="cw-parts">${solids.map(g=>`<details class="cw-part" data-parts="${g.idx.join(',')}"><summary><span class="q">${g.idx.length}×</span><span class="n">${esc(g.p.name)}</span><span class="s">${show(g.p.box[3])} × ${show(g.p.box[4])} × ${show(g.p.box[5])}</span></summary>${g.p.note?`<ul><li>${esc(g.p.note)}</li></ul>`:''}</details>`).join('')}</div>`:''}
      ${hw.length?`<h3>Hardware</h3><ul class="cw-hw">${hw.map(h=>`<li><b>${h.qty}×</b> ${esc(h.name)}</li>`).join('')}</ul>`:''}
    </div></div>`;
  startViewer(body.querySelector('#cwCanvas'), it);
  const apply=(patch)=>{ if(editing) updateItem(it.id, patch); else Object.assign(it, patch); if(d.sized && patch.opt) Object.assign(it, d.sized(it)); if(editing){ refreshItem(it); renderSide(); } const ex=view.explode; render(); view.explode=ex; };
  bindHistory(body, HIST, ()=>{ const ex=view.explode; render(); view.explode=ex; });
  body.querySelector('#cwBack').onclick=()=>{ if(editing){ dlg.close(); return; } view.item=null; render(); };
  body.querySelector('#cwFront').onclick=()=>V?.front(); body.querySelector('#cwIso').onclick=()=>V?.iso();
  body.querySelector('#cwExB').onclick=e=>{ V?.explodeTo(view.explode>0.5?0:1); };
  const clampR=(k,v)=>{ const r={w:d.wR,h:d.hR,d:d.dR,y:[0,96]}[k]||[0,200]; return Math.min(r[1], Math.max(r[0], v)); };
  body.querySelectorAll('[data-len]').forEach(inp=>inp.onchange=()=>{ const v=parseLen(inp.value); if(!isFinite(v)){ inp.value=show(it[inp.dataset.len]||0); return; } apply({[inp.dataset.len]:clampR(inp.dataset.len, v)}); });
  body.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{ const k=b.dataset.step, st=U()==='mm'?10*MM:(k==='y'?1:0.5); apply({[k]:clampR(k,(it[k]||0)+st*(+b.dataset.dir))}); });
  body.querySelectorAll('[data-mir]').forEach(b=>b.onclick=()=>apply({mirror:b.dataset.mir==='1'}));
  body.querySelectorAll('[data-pre]').forEach(b=>b.onclick=()=>apply({[b.dataset.pre]:+b.dataset.v}));
  body.querySelectorAll('[data-opt]').forEach(b=>b.onclick=()=>{ const raw=b.dataset.v, v=isNaN(+raw)?raw:+raw; apply({opt:{...(it.opt||{}), [b.dataset.opt]:v}}); });
  body.querySelectorAll('[data-handle]').forEach(b=>b.onclick=()=>apply({opt:{...(it.opt||{}), handle:b.dataset.handle}}));
  body.querySelector('#cwPlan')?.addEventListener('click',()=>openPlan(it, d.name));
  body.querySelector('#cwCsv')?.addEventListener('click',()=>download(`${d.name.replace(/[^\w]+/g,'-')}-${Math.round(it.w)}x${Math.round(it.h)}x${Math.round(it.d)}.csv`, csv(it, d.name)));
  body.querySelector('#cwDone')?.addEventListener('click',()=>dlg.close());
  body.querySelector('#cwAdd')?.addEventListener('click',()=>{ if(!canSave()){ toast('Viewers can look but not change the home.'); return; } const f=placeAuto(it); if(f){ dlg.close(); toast(`${d.name} added · drag it in the plan to move it`); } });
  body.querySelectorAll('.cw-part').forEach(el=>el.addEventListener('toggle',()=>{ if(el.open){ body.querySelectorAll('.cw-part[open]').forEach(o=>{ if(o!==el) o.open=false; }); V?.select(el.dataset.parts.split(',').map(Number)); } else V?.select(null); }));
}
/* the cutting plan: every different part, drawn and dimensioned, with its cuts as numbers (prints as a booklet) */
function openPlan(it, name){
  const rows=cutList(it), d=document.createElement('dialog'); d.className='cw-dlg pt-plan'; d.setAttribute('aria-label','Cutting plan');
  const S=settings();
  d.innerHTML=`<div class="cw"><header class="cw-h"><h2>Cutting plan · ${esc(name)}</h2><span class="note">${fmt(it.w)} × ${fmt(it.h)} × ${fmt(it.d)}″ · ${esc(S.mat.name)} at ${fx3(S.mat.t)}</span><span class="spacer"></span><button class="btn" id="ptCnc">G-code…</button><button class="btn ghost" id="ptPrint">Print</button><button class="btn ghost cw-x" aria-label="Close">✕</button></header>
    <div class="pt-list">
      <section class="pt-intro"><h3>How these parts are cut</h3><ul>
        <li><b>Side A</b> is the last program for a sheet: the face named on each part is up, its dados, grooves and holes are cut, then every part is cut out (a skim pass that leaves about 1 mm, then the final pass through). Side B, when a part has cuts on its other face, is cut <b>first</b>, so the cut-throughs are always last.</li>
        <li>Dados: ½″ bit, as wide as the sheet measures plus ${fx3(S.dado.fit)}, ${fx3(S.dado.depth)} deep. A panel goes ${fx3(S.dado.engage)} into each. They stop ${fx3(S.dado.stop)} short of the front; the panel's corners are notched to pass the stop.</li>
        <li>Holes: shelf pins Ø5 mm × ${fx3(S.pins.depth)}, 32 mm apart, rows ${Math.round(S.pins.front/MM)} mm from the front and ${Math.round(S.pins.back/MM)} mm from the back. Hinge plate marks Ø5 × ${fx3(S.mark.depth)}. Hinge cups Ø35 mm with two Ø8 mm dowel holes.</li>
        <li>All sizes use the sheet thickness set in Shop settings (${fx3(S.mat.t)}). Measure the sheets and set it before making G-code: the dado widths and every depth follow it.</li></ul></section>
      ${rows.map(r=>{ const p=r.parts[0]; return `<section class="pt-sheet"><h3>${r.qty}× ${esc(r.qty>1?p.name.replace(/, (left|right)$/,'').replace(/^(Left|Right) end$/,'End (left and right)'):p.name)} <small>${fx3(r.L)} × ${fx3(r.W)} × ${fx3(r.T)}</small></h3>
        <p class="note">${p.cnc?`<b>${esc(p.cnc.up)} up</b> · `:''}edge band ${bandTxt(r.band)}${p.note?` · ${esc(p.note)}`:''}</p>${p.cnc?partSVG(p,{px:900,maxH:620})+opsTable(p):`<ul>${r.ops.map(o=>`<li>${esc(o)}</li>`).join('')}</ul>`}</section>`; }).join('')}
    </div></div>`;
  document.body.appendChild(d);
  d.querySelector('.cw-x').onclick=()=>d.close(); d.addEventListener('close',()=>d.remove());
  d.querySelector('#ptCnc').onclick=()=>openCnc([{ it, label:'C1' }], name);
  d.querySelector('#ptPrint').onclick=()=>{ document.documentElement.classList.add('print-plan'); window.print(); setTimeout(()=>document.documentElement.classList.remove('print-plan'),500); };
  d.showModal();
}
/* G-code: measure the sheets first (every time), then nest every part and write one program per sheet */
function openCnc(items, title){
  const S=settings(), d=document.createElement('dialog'); d.className='cw-dlg cc-dlg'; d.setAttribute('aria-label','Cabinet G-code');
  const job=(MODELS[state.model]?.name||'Cubit Home').replace(/\s+\(draft.*\)$/,'');
  d.innerHTML=`<div class="cw"><header class="cw-h"><h2>G-code · ${esc(title)}</h2><span class="note">${items.length} cabinet${items.length>1?'s':''} · ${esc(S.mat.name)}</span><span class="spacer"></span><button class="btn ghost cw-x" aria-label="Close">✕</button></header>
    <div class="cc-body">
      <section class="cc-measure"><h3>1 · Measure the sheets</h3>
        <p class="note">Sheets vary. Measure the ones you're about to cut (a few spots, with calipers) and type what they measure. Every dado width, every depth and the panels between the ends follow it.</p>
        <div class="row"><label class="cw-f"><span>Sheets measure</span><input id="ccT" inputmode="decimal" value=""><i>″ or mm</i></label>
          <span class="note">Last time: ${fx3(S.mat.t,'in')} (${Math.round(S.mat.t/MM*100)/100} mm)</span></div>
        <label class="wb-chk"><input type="checkbox" id="ccOk"> I measured these sheets just now</label>
        <label class="cw-f"><span>Job name (on the files)</span><input id="ccJob" value="${esc(job)}"></label>
        <div class="row"><button class="btn" id="ccGo" disabled>Make the G-code</button></div></section>
      <section class="cc-out" hidden></section>
    </div></div>`;
  document.body.appendChild(d);
  d.querySelector('.cw-x').onclick=()=>d.close(); d.addEventListener('close',()=>d.remove());
  const tIn=d.querySelector('#ccT'), ok=d.querySelector('#ccOk'), go=d.querySelector('#ccGo');
  const val=()=>{ const raw=String(tIn.value).trim().toLowerCase(); if(!raw) return NaN; let v=parseFloat(raw); if(/mm$/.test(raw) || v>2) v=v*MM; return v; };
  const check=()=>{ const v=val(); go.disabled=!(ok.checked && v>0.3 && v<1.2); };
  tIn.oninput=check; ok.onchange=check;
  go.onclick=async()=>{
    const t=r4(val());
    if(Math.abs(t-S.mat.t)>1e-6){ try{ await saveSettings({...settings(), mat:{...settings().mat, t}}); furnitureOf().forEach(refreshItem); }catch(e){ toast(`Couldn't keep the thickness: ${e.message||e}`); } }
    const J=cabinetJob(items, { job:d.querySelector('#ccJob').value.trim()||job, t });
    const out=d.querySelector('.cc-out'); out.hidden=false;
    out.innerHTML=`<h3>2 · ${J.sheets.length} sheet${J.sheets.length>1?'s':''} · ${J.pieces.length} parts · at ${fx3(t,'in')}</h3>
      ${J.tooBig.length?`<p class="wb-warn">Too big for a ${CAB_CNC.sheet[0]} × ${CAB_CNC.sheet[1]} sheet: ${J.tooBig.map(q=>esc(q.label)).join(', ')}</p>`:''}
      <p class="note">Load each sheet <b>good face down</b> and run its program. Every part's inside face is up, so no sheet needs turning over. The cut-throughs are last in each program.</p>
      ${J.counters?.length?`<p class="note"><b>Countertops:</b> ${J.counters.length} × ${esc(settings().counter.name)}, one program each with the FormX bit (T${settings().counter.cnc.T} ${esc(settings().counter.cnc.name)}), top face up: ${J.counters.map(f=>`${esc(f.label)} ${fx3(f.U,'in')} × ${fx3(f.V,'in')}${f.holes?` · ${f.holes} sink hole${f.holes>1?'s':''}`:''} <code>${esc(f.name)}</code>`).join(' · ')}</p>`:''}
      ${(J.counters||[]).filter(f=>f.long).map(f=>`<p class="wb-warn">${esc(f.label)} is longer than the FormX stock (${settings().counter.cnc.sheet?.[1]||144}″): it needs a joint.</p>`).join('')}
      <div class="row"><button class="btn" id="ccZip">Download the programs (.zip)</button></div>
      <div class="cc-sheets">${J.sheets.map((sh,i)=>`<figure><figcaption><b>Sheet ${i+1}</b> · ${sh.placed.length} parts · ${(sh.yield*100).toFixed(0)}% used · <code>${esc(J.files.filter(f=>f.sheet===i).map(f=>f.name).join(', '))}</code></figcaption>${sheetSVG(sh,{px:720})}</figure>`).join('')}</div>`;
    out.querySelector('#ccZip').onclick=async()=>{ const b=await jobZip(J); const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download=`${J.job.replace(/[^\w .+-]+/g,'')} cabinets.zip`; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },500); };
    out.scrollIntoView({behavior:'smooth'});
  };
  d.showModal(); tIn.focus();
}
const r4 = v => Math.round(v*10000)/10000;
/* all the cabinets in this home → one job */
function openHomeCnc(){
  const its=furnitureOf().filter(it=>partsOf(it).some(p=>p.cnc));
  if(!its.length){ toast('No cabinets in this home yet. Add some from the cabinet library.'); return; }
  openCnc(its.map((it,i)=>({ it, label:`C${i+1}` })), `${its.length} cabinets in this home`);
}
{ const pop=document.getElementById('morePop');
  if(pop && !document.getElementById('bCabCnc')){ const b=document.createElement('button'); b.setAttribute('role','menuitem'); b.id='bCabCnc'; b.className='edit-only'; b.textContent='Cabinet G-code'; pop.appendChild(b); b.onclick=()=>{ pop.hidden=true; loadSettings().then(openHomeCnc); }; } }
/* add an item to the home: backed against the nearest wall to the middle of the first pod */
function placeAuto(it){
  const pods=podsShown(); if(!pods.length) return null;
  const at=freeSpot(it, homeGroup);   // against a wall, clear of everything already placed
  if(!at){ toast('No room found. Open Build and drag it in.'); return null; }
  const f=addItem(it.k, { w:it.w, h:it.h, d:it.d, y:it.y, opt:JSON.parse(JSON.stringify(it.opt||{})), ...at });
  state.selFurn=f.id; state.selected=null; refreshItem(f); highlight(); renderSide(); if(!panelOpen()) setPanel(true); return f;
}
/* ---------------------------------------------------------------- the 3D viewer */
let V=null;
function startViewer(canvas, it){
  const r=new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true }); r.setPixelRatio(Math.min(2, devicePixelRatio)); r.shadowMap.enabled=true;
  const sc=new THREE.Scene(), cam=new THREE.PerspectiveCamera(35, 1, 1, 5000);
  sc.add(new THREE.HemisphereLight(0xffffff, 0x8a8f86, 0.85)); const sun=new THREE.DirectionalLight(0xffffff, 0.75); sun.position.set(60,120,90); sc.add(sun);
  const fill=new THREE.DirectionalLight(0xffffff,0.3); fill.position.set(-80,40,-60); sc.add(fill);
  const M=itemModel(it, { edges:true, tenons:true }); M.group.position.set(-it.w/2, 0, -it.d/2); sc.add(M.group);
  const span=Math.max(it.w, it.h, it.d), ctl=new THREE.OrbitControls(cam, canvas); ctl.enableDamping=true; ctl.target.set(0, it.h/2, 0);
  const grid=new THREE.GridHelper(span*3, 12, 0xbfc5bd, 0xdde1da); grid.material.transparent=true; grid.material.opacity=0.5; sc.add(grid);
  const fit=(az, el)=>{ const d=span*2.4+20; cam.position.set(Math.sin(az)*Math.cos(el)*d, it.h/2+Math.sin(el)*d, Math.cos(az)*Math.cos(el)*d); ctl.target.set(0,it.h/2,0); ctl.update(); };
  fit(0.62, 0.32);
  M.explode(view.explode);
  const size=()=>{ const w=canvas.clientWidth, h=canvas.clientHeight; if(!w||!h) return; r.setSize(w,h,false); cam.aspect=w/h; cam.updateProjectionMatrix(); };
  const ro=new ResizeObserver(size); ro.observe(canvas); size();
  let raf=0, sel=null; const loop=()=>{ raf=requestAnimationFrame(loop); V?.tick?.(); ctl.update(); r.render(sc,cam); }; loop();
  // tap a part: open its row
  const rc=new THREE.Raycaster(), nd=new THREE.Vector2(); let down=null;
  canvas.addEventListener('pointerdown', e=>{ down=[e.clientX,e.clientY]; });
  // double-tap a part: it alone (as in the home); double-tap it again or empty space: the whole cabinet back
  let isoPart=null, lastUp=null;
  const shownM = m => { for(let o=m; o; o=o.parent) if(!o.visible) return false; return true; };
  const isoTo = i => { isoPart=i; M.group.children.forEach(s=>{ s.visible = i==null || s.userData.part===i; }); };
  canvas.addEventListener('pointerup', e=>{ if(!down || Math.hypot(e.clientX-down[0],e.clientY-down[1])>6) return; const b=canvas.getBoundingClientRect(); nd.set((e.clientX-b.left)/b.width*2-1, -(e.clientY-b.top)/b.height*2+1); rc.setFromCamera(nd,cam);
    const h=rc.intersectObjects(M.meshes.filter(shownM),false)[0], i=h?.object.userData.part;
    const now=performance.now(), dbl=lastUp && now-lastUp.t<450 && Math.hypot(e.clientX-lastUp.x, e.clientY-lastUp.y)<40; lastUp = dbl ? null : {t:now, x:e.clientX, y:e.clientY};
    if(dbl){ isoTo(i==null || i===isoPart ? null : i); return; }
    const rows=[...dlg.querySelectorAll('.cw-part')]; rows.forEach(x=>x.open=false);
    if(i==null){ M.select(null); return; }
    const row=rows.find(x=>x.dataset.parts.split(',').map(Number).includes(i));
    if(row){ row.open=true; row.scrollIntoView({block:'nearest', behavior:'smooth'}); } else M.select([i]); });
  // explode: animated toward a goal; three fingers spread / pinch set the goal (the wider, the further)
  let goal=view.explode, cur=view.explode;
  const setBtn=()=>dlg.querySelector('#cwExB')?.setAttribute('aria-pressed', goal>0.5);
  const tick=()=>{ if(Math.abs(cur-goal)>0.002){ cur+=(goal-cur)*0.18; if(Math.abs(cur-goal)<0.003) cur=goal; M.explode(cur); view.explode=cur; } };
  const g3={ on:false };
  const spr=t=>{ const n=t.length; let cx=0,cy=0; for(const q of t){ cx+=q.clientX; cy+=q.clientY; } cx/=n; cy/=n; let d=0; for(const q of t) d+=Math.hypot(q.clientX-cx,q.clientY-cy); return d/n; };
  canvas.addEventListener('touchstart', e=>{ if(e.touches.length===3){ e.preventDefault(); g3.on=true; g3.d0=spr(e.touches); g3.e0=goal; ctl.enabled=false; } }, {passive:false});
  canvas.addEventListener('touchmove', e=>{ if(!g3.on || e.touches.length!==3) return; e.preventDefault(); goal=Math.max(0, Math.min(1, g3.e0 + (spr(e.touches)/Math.max(1,g3.d0)-1)*1.6)); setBtn(); }, {passive:false});
  const end3=e=>{ if(g3.on && e.touches.length<3){ g3.on=false; ctl.enabled=true; } };
  canvas.addEventListener('touchend', end3); canvas.addEventListener('touchcancel', end3);
  V={ explode:e=>{ goal=cur=e; M.explode(e); }, explodeTo:e=>{ goal=e; setBtn(); }, tick, front:()=>fit(0,0.02), iso:()=>fit(0.62,0.32),
    select:idx=>{ if(!idx){ M.select(null); return; } M.meshes.forEach(m=>{ const on=idx.includes(m.userData.part); m.material = on ? selMat : dimMat(m); }); },
    stop:()=>{ cancelAnimationFrame(raf); ro.disconnect(); ctl.dispose(); r.dispose(); } };
  const selMat=new THREE.MeshStandardMaterial({color:0xd0661f, roughness:0.6, emissive:0x4a1c04});
  const dims=new Map(); const dimMat=m=>{ const base=M.parts[m.userData.part]; const k=base.role; if(!dims.has(k)){ const c=m.material.clone(); c.transparent=true; c.opacity=0.16; c.depthWrite=false; dims.set(k,c); } return dims.get(k); };
  M.select=(idx)=>{ if(idx) return V.select(idx); M.meshes.forEach(m=>{ m.material = origMat.get(m); }); };
  const origMat=new Map(M.meshes.map(m=>[m,m.material]));
}
function stopViewer(){ if(V){ V.stop(); V=null; } }

/* ---------------------------------------------------------------- shop settings */
const F = (path, label, kind='len', extra='') => ({ path, label, kind, extra });
const SECTIONS = [
  ['Sheet material', 'One material for every part (Mozaik: 16 mm PET at 0.600″). Sheets vary: measure them and set the thickness before you make G-code. Every dado width and every depth follows it.', [
    F('mat.name','Material','text'), F('mat.t','Sheets measure'), F('mat.sheet.0','Sheet width'), F('mat.sheet.1','Sheet length') ]],
  ['Edge band', 'Doors, drawer fronts, shelf fronts and the front edges of the ends are banded. Mozaik’s sizes already allow for the band in the reveals, so it isn’t taken off again unless you switch that on.', [
    F('band.t','Band thickness'), F('band.name','Edge band','text'), F('band.deduct','Take the band off the cut sizes','bool') ]],
  ['Dados', 'Bottoms, tops, fixed shelves and stretchers sit in dados in the ends; the back in its own dado and a groove in the bottom.', [
    F('dado.depth','Dado depth'), F('dado.engage','A panel goes into each dado'), F('dado.fit','Dado wider than the sheet by'), F('dado.stop','Dados stop short of the front by'), F('dado.clear','Clearance past a dado end (bit radius)'), F('back.inset','Back dado in from the back edge') ]],
  ['Box', '', [ F('kick.h','Toe kick height'), F('kick.set','Toe kick setback'), F('kick.rearW','Rear notch on the ends, deep'), F('stretcher.w','Stretcher width (bases)'), F('shelf.side','Adjustable shelf clearance, each side'), F('shelf.back','Adjustable shelf clearance at the back'), F('shelf.group','Pin holes per shelf, per row','num') ]],
  ['Doors and drawer fronts', 'Full overlay. Gaps and how far the fronts run past the box, by cabinet kind (Mozaik’s door rules).', [
    F('fronts.side','Gap at each side'), F('fronts.gap','Gap between fronts'), F('fronts.pairOver','Two doors when wider than'),
    F('fronts.base.below','Base: below the bottom'), F('fronts.base.top','Base: under the top of the box'), F('fronts.upper.below','Upper: below the box'), F('fronts.upper.top','Upper: under the top'), F('fronts.tall.below','Tall: below the bottom'), F('fronts.tall.top','Tall: under the top') ]],
  ['Shelf pins and marks', '', [ F('pins.dia','Pin hole'), F('pins.depth','Pin hole depth'), F('pins.pitch','Pin spacing'), F('pins.front','Front row in from the front'), F('pins.back','Back row in from the back'), F('mark.depth','Hinge plate mark depth') ]],
  ['Hinges', 'Blum by default; DTC is set up the same way. The press-in hinge: a 35 mm cup and two 8 mm dowel holes.', [ F('hinge','Hinge used','pick:hinges') ]],
  ['Drawer runners', 'Runner holes on the ends, one row per drawer. Front holes from the front edge; back holes measured back from the runner length.', [ F('runner','Runners used','pick:runners') ]],
  ['Drawer boxes', '16 mm sides, front and back; the front and back have tongues in ¼″ dados in the sides and sit on the bottom; the bottom slides in a groove in the sides.', [
    F('drawer.groove','Bottom groove up from the side’s lower edge'), F('drawer.grooveDepth','Bottom groove depth'), F('drawer.dadoIn','Front / back dado in from the end'), F('drawer.dadoW','Dado width (¼″ bit)'), F('drawer.dadoDepth','Dado depth'), F('drawer.tongue','Tongue thickness'), F('drawer.topDrop','Front / back below the side’s top') ]],
  ['Handles', 'Pick a handle on a cabinet to drill its holes on the CNC; “Drill later” leaves them off.', [ F('handles','Handles','handles') ]],
  ['Fasteners', '', [ F('screw.name','Assembly fastener','text'), F('rod.name','Closet rod','text') ]],
  ['Countertops', 'Most of what Cubit makes is ½″ FormX solid surface. A countertop fits the cabinets under it: back to the wall, past each free end (a range end too) and past the front of the boxes by these amounts.', [
    F('counter.name','Countertop material','text'), F('counter.t','Thickness'), F('counter.over','Past the front of the boxes'), F('counter.end','Past a free end'),
    F('counter.lap','Top-mount sink: hole in from the sink’s edge'), F('counter.reveal','Bottom-mount sink: countertop over the bowl') ]],
  ['Countertop CNC (FormX)', 'FormX has its own bit, speeds and feeds. Each countertop gets its own program: the sink holes first (the bit inside the line), then the outline (outside the line), stepping down each pass.', [
    F('counter.cnc.T','Tool number','num'), F('counter.cnc.name','Tool name','text'), F('counter.cnc.dia','Bit diameter'), F('counter.cnc.S','Spindle (RPM)','num'), F('counter.cnc.feed','Feed (in/min)','num'), F('counter.cnc.plunge','Plunge (in/min)','num'), F('counter.cnc.step','Depth per pass'), F('counter.cnc.margin','In from the table corner') ]],
  ['Sink bases', 'A sink docked in a sink base: the stretchers keep their full width this far in from each side and are narrowed over the sink, clear of its hole.', [
    F('sinkBase.keep','Full width in from each side'), F('sinkBase.clear','Clearance round the sink hole'), F('sinkBase.minStrip','Narrowest strip left (less: the middle comes out)') ]],
];
const LABEL = { cup:'Cup diameter', depth:'Cup and dowel depth', edge:'Cup centre from the door edge', dowel:'Dowel hole', dowelApart:'Dowel holes apart', dowelBack:'Dowels behind the cup centre', bottom:'Lowest cup above the door bottom', top:'Highest cup below the door top', plateX:'Plate marks in from the front', plateApart:'Plate marks apart',
  clear:'Clearance, both sides together', lens:'Lengths (inches)', front:'Front holes from the front (mm)', rear:'Back holes before the runner end (mm)', holeDepth:'Hole depth', rowAbove:'Hole row above the box bottom', boxPlus:'Box longer than the runner by' };
const getP = (o,p) => p.split('.').reduce((a,k)=>a?.[k], o);
function setP(o,p,v){ const ks=p.split('.'); const last=ks.pop(); const t=ks.reduce((a,k)=>(a[k] ??= {}), o); t[last]=v; }
function renderSettings(body){
  const S=JSON.parse(JSON.stringify(settings())), ro=!canEdit();
  const field=f=>{ const v=getP(S,f.path);
    if(f.kind==='text') return `<label class="cw-f"><span>${f.label}</span><input data-p="${f.path}" data-kind="text" value="${esc(v)}" ${ro?'disabled':''}></label>`;
    if(f.kind==='bool') return `<div class="cw-f"><span>${f.label}</span><div class="seg"><button data-p="${f.path}" data-v="1" data-bool="1" aria-pressed="${!!v}" ${ro?'disabled':''}>Yes</button><button data-p="${f.path}" data-v="0" data-bool="1" aria-pressed="${!v}" ${ro?'disabled':''}>No</button></div></div>`;
    if(f.kind==='num') return `<label class="cw-f"><span>${f.label}</span><input data-p="${f.path}" data-kind="num" value="${esc(v)}" inputmode="numeric" ${ro?'disabled':''}></label>`;
    if(f.kind.startsWith('pick:')){ const lib=f.kind.slice(5), L=S[lib];
      return `<div class="cw-f wide"><span>${f.label}</span><div class="seg wrap">${Object.entries(L).map(([k,g])=>`<button data-p="${f.path}" data-v="${k}" aria-pressed="${v===k}" ${ro?'disabled':''}>${esc(g.name)}</button>`).join('')}</div></div>
        ${Object.entries(L).map(([k,g])=>`<fieldset class="cw-gl"><legend>${esc(g.name)}</legend>${Object.entries(g).map(([kk,val])=> kk==='name' ? `<label class="cw-f wide"><span>Name</span><input data-p="${lib}.${k}.name" data-kind="text" value="${esc(val)}" ${ro?'disabled':''}></label>`
          : Array.isArray(val) ? `<label class="cw-f"><span>${esc(LABEL[kk]||kk)}</span><input data-p="${lib}.${k}.${kk}" data-kind="list" value="${val.join(', ')}" ${ro?'disabled':''}></label>`
          : `<label class="cw-f"><span>${esc(LABEL[kk]||kk)}</span><input data-p="${lib}.${k}.${kk}" data-kind="len" value="${esc(prec(val))}" inputmode="decimal" ${ro?'disabled':''}><i>${unitSign()}</i></label>`).join('')}</fieldset>`).join('')}`; }
    if(f.kind==='handles') return `<div class="cw-f wide"><span>Default on a new cabinet</span><div class="seg wrap"><button data-p="handle" data-v="later" aria-pressed="${S.handle==='later'}" ${ro?'disabled':''}>Drill later</button>${S.handles.map(h=>`<button data-p="handle" data-v="${esc(h.id)}" aria-pressed="${S.handle===h.id}" ${ro?'disabled':''}>${esc(h.name)}</button>`).join('')}</div></div>
      ${S.handles.map((h,i)=>`<fieldset class="cw-gl"><legend>${esc(h.name)}</legend><label class="cw-f wide"><span>Name</span><input data-p="handles.${i}.name" data-kind="text" value="${esc(h.name)}" ${ro?'disabled':''}></label>
        <label class="cw-f"><span>Hole spacing, centre to centre (0 = one hole)</span><input data-p="handles.${i}.cc" data-kind="len" value="${esc(prec(h.cc))}" ${ro?'disabled':''}><i>${unitSign()}</i></label>
        <label class="cw-f"><span>Hole</span><input data-p="handles.${i}.dia" data-kind="len" value="${esc(prec(h.dia))}" ${ro?'disabled':''}><i>${unitSign()}</i></label></fieldset>`).join('')}
      ${ro?'':'<button class="btn ghost sm" id="cwAddHandle">Add a handle</button>'}`;
    if(f.kind==='ply') return `<div class="cw-f"><span>${f.label}</span><div class="seg">${['1/2','5/8'].map(n=>`<button data-p="${f.path}" data-v="${n}" aria-pressed="${v===n}" ${ro?'disabled':''}>${n==='1/2'?'½″':'⅝″'}</button>`).join('')}</div></div>`;
    if(f.kind==='glide') return `<div class="cw-f wide"><span>${f.label}</span><div class="seg wrap">${Object.entries(S.glides).map(([k,g])=>`<button data-p="glide" data-v="${k}" aria-pressed="${S.glide===k}" ${ro?'disabled':''}>${esc(g.name)}</button>`).join('')}</div></div>
      ${Object.entries(S.glides).map(([k,g])=>`<fieldset class="cw-gl"><legend>${esc(g.name)}</legend>
        <label class="cw-f"><span>Name</span><input data-p="glides.${k}.name" data-kind="text" value="${esc(g.name)}" ${ro?'disabled':''}></label>
        <label class="cw-f"><span>Clearance, both sides together</span><input data-p="glides.${k}.clear" data-kind="len" value="${esc(prec(g.clear))}" ${ro?'disabled':''}><i>${unitSign()}</i></label>
        <label class="cw-f"><span>Lengths (inches)</span><input data-p="glides.${k}.lens" data-kind="list" value="${g.lens.join(', ')}" ${ro?'disabled':''}></label>
        <label class="cw-f wide"><span>Drawer prep</span><input data-p="glides.${k}.prep" data-kind="text" value="${esc(g.prep)}" ${ro?'disabled':''}></label></fieldset>`).join('')}`;
    return `<label class="cw-f"><span>${f.label}</span><input data-p="${f.path}" data-kind="len" value="${esc(prec(v))}" inputmode="decimal" ${ro?'disabled':''}><i>${unitSign()}</i></label>`; };
  body.innerHTML=`<div class="cw-set">
    <div class="cw-set-h"><div class="seg"><button data-units="in" aria-pressed="${S.units==='in'}">Inches</button><button data-units="mm" aria-pressed="${S.units==='mm'}">Millimetres</button></div>
      <span class="note">${ro?'Viewers can look but not change these.':'Shared by the whole team. Changes apply to every cabinet, in every home.'}</span><span class="spacer"></span>
      ${ro?'':`<button class="btn ghost" id="cwReset">Back to defaults</button><button class="btn" id="cwSave">Save settings</button>`}</div>
    ${SECTIONS.map(([h,note,fs])=>`<section><h3>${h}</h3>${note?`<p class="note">${note}</p>`:''}<div class="cw-fs">${fs.map(field).join('')}</div></section>`).join('')}
  </div>`;
  const read=()=>{ body.querySelectorAll('input[data-p]').forEach(inp=>{ const k=inp.dataset.kind, p=inp.dataset.p;
      if(k==='text') setP(S,p,inp.value.trim());
      else if(k==='list') setP(S,p,inp.value.split(/[,\s]+/).map(Number).filter(x=>x>0));
      else if(k==='num'){ const n=parseInt(inp.value,10); if(n>0) setP(S,p,n); }
      else { const v=parseLen(inp.value); if(isFinite(v) && v>=0) setP(S,p,v); } }); };
  body.querySelector('#cwAddHandle')?.addEventListener('click', async()=>{ read(); S.handles.push({ id:'h'+Date.now().toString(36), name:'New handle', cc:128*MM, dia:5*MM }); await commit(S,false); renderSettings(body); });
  body.querySelectorAll('button[data-p]').forEach(b=>b.onclick=()=>{ read(); setP(S,b.dataset.p, b.dataset.bool ? b.dataset.v==='1' : b.dataset.v); b.parentElement.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed', x===b)); });
  body.querySelectorAll('[data-units]').forEach(b=>b.onclick=async()=>{ read(); S.units=b.dataset.units; await commit(S, false); renderSettings(body); });
  body.querySelector('#cwSave')?.addEventListener('click', async()=>{ read(); await commit(S, true); });
  body.querySelector('#cwReset')?.addEventListener('click', e=>{ const b=e.target; if(b.dataset.sure!=='1'){ b.dataset.sure='1'; b.textContent='Tap again to reset'; return; } commit({...JSON.parse(JSON.stringify(DEFAULTS)), units:S.units}, true).then(()=>renderSettings(body)); });
}
async function commit(S, say){
  try{ await saveSettings(S); if(say) toast('Shop settings saved'); furnitureOf().forEach(refreshItem); renderSide(); }
  catch(e){ toast(`Couldn't save: ${e.message||e}`); }
}

/* ---------------------------------------------------------------- a placed item, in the side panel */
/* ---------------------------------------------------------------- picking several, and groups (a kitchen…) */
function pickSide(sideH, sideB){
  const ids=(state.selSet||[]).filter(id=>furnById(id)), L=ids.map(furnById);
  sideH.innerHTML=`<button class="side-x" id="pkX" aria-label="Stop picking">✕</button><div class="eyebrow">Picking cabinets</div><h2>${L.length} picked</h2><p>Tap cabinets, counters, appliances and furniture to add or take them away.</p>`;
  const cur=furnById(state.selFurn)||L[0];
  sideB.innerHTML=`<div class="row"><button class="btn ghost sm" id="pkWall" ${cur?.wall?'':'disabled'}>All on this wall</button><button class="btn ghost sm" id="pkPod" ${cur?'':'disabled'}>All in this pod</button></div>
    ${L.length?`<ul class="pk-list">${L.map(o=>`<li>${esc(o.label||itemDef(o.k)?.name||o.k)} <small>${fmt(o.w)}${unitSign()}</small></li>`).join('')}</ul>`:''}
    <div class="row"><button class="btn" id="pkGroup" ${L.length>1?'':'disabled'}>Group…</button><button class="btn ghost" id="pkDone">Done</button></div>
    <p class="note">A group moves, turns and explodes as one. Name it (e.g. Kitchen) and it can be saved to the library.</p>`;
  const done=()=>{ state.multiSel=false; state.selSet=[]; applyFurniture(); renderSide(); };
  sideH.querySelector('#pkX').onclick=done; sideB.querySelector('#pkDone').onclick=done;
  const add=list=>{ const S=new Set(ids); list.forEach(o=>S.add(o.id)); state.selSet=[...S]; state.selFurn=state.selSet[0]; applyFurniture(); renderSide(); };
  sideB.querySelector('#pkWall').onclick=()=>add(furnitureOf().filter(o=>o.pod===cur.pod && o.wall && o.wall===cur.wall));
  sideB.querySelector('#pkPod').onclick=()=>add(furnitureOf().filter(o=>o.pod===cur.pod));
  sideB.querySelector('#pkGroup').onclick=async()=>{
    if(new Set(L.map(o=>o.pod)).size>1){ toast('A group stays in one pod. Pick items in the same pod.'); return; }
    if(L.some(o=>o.grp)){ toast('Some of these are already in a group. Ungroup them first.'); return; }
    const name=await askName({ title:'Name the group', placeholder:'e.g. Kitchen · white shaker', note:'It moves, turns and explodes as one.' }); if(!name) return;
    makeGroup(ids, name); state.multiSel=false; state.selSet=[]; state.selFurn=ids[0]; applyFurniture(); renderSide(); toast(`Grouped as “${name}”`); };
  return true;
}
function groupSide(sideH, sideB, it){
  const g=it.grp, M=groupMembers(g.id), src=g.from && kitchenById(g.from), ed=canSave();
  sideH.innerHTML=`<button class="side-x" id="sideXf" aria-label="Back to the whole home">✕</button><div class="eyebrow">Group${src?` · from the saved kitchen “${esc(src.name)}”`:''}</div><h2>${esc(g.name)}</h2><p>${M.length} items · drag any of them to move the group, two fingers to turn it</p>`;
  sideH.querySelector('#sideXf').onclick=()=>{ state.selFurn=null; applyFurniture(); renderSide(); };
  sideB.innerHTML=`<ul class="pk-list">${M.map(o=>`<li>${esc(o.label||itemDef(o.k)?.name||o.k)} <small>${fmt(o.w)}${unitSign()}</small></li>`).join('')}</ul>
    ${ed?`<div class="row"><button class="btn ghost sm" id="gRen">Rename</button><button class="btn ghost sm" id="gUn">Ungroup to edit</button><button class="btn ghost sm" id="gRm">Remove group</button></div>`:''}
    <div class="row editor-only"><button class="btn" id="gSave">Save to kitchen library…</button></div>
    ${ed && !canEdit()?'<p class="note">This kitchen stays in your draft or the customer’s home. An editor or admin can adopt it into the kitchen library later.</p>':''}`;
  sideB.querySelector('#gRen')?.addEventListener('click', async()=>{ const v=await askName({ title:'Rename the group', current:g.name }); if(!v) return; renameGroup(g.id, v); renderSide(); });
  sideB.querySelector('#gUn')?.addEventListener('click', ()=>{ ungroup(g.id); applyFurniture(); renderSide(); toast(`Ungrouped · change what you need, then Relink “${g.name}” on any of its items`); });
  sideB.querySelector('#gRm')?.addEventListener('click', e=>{ const b=e.target; if(b.dataset.sure!=='1'){ b.dataset.sure='1'; b.textContent=`Tap again: remove all ${M.length}`; return; } const ids=M.map(o=>o.id); removeGroup(g.id); ids.forEach(id=>refreshItem({id})); state.selFurn=null; applyFurniture(); renderSide(); toast(`${g.name} removed`); });
  sideB.querySelector('#gSave')?.addEventListener('click', ()=>saveGroupDialog(it));
}
/* save a group to the kitchen library: a new kitchen, or (after a warning) over the saved kitchen it came from */
function saveGroupDialog(it){
  if(!canEdit()){ toast('Editors and admins save kitchens to the library.'); return; }
  const g=it.grp, M=groupMembers(g.id), src=g.from && kitchenById(g.from);
  const anchor = M.find(o=>o.wall) || it, recipe=groupRecipe(M, anchor);
  let d=document.getElementById('kitDlg'); if(!d){ d=document.createElement('dialog'); d.id='kitDlg'; d.className='lib-dlg'; document.body.appendChild(d); }
  const step1=()=>{ d.innerHTML=`<div class="dlg"><div class="dlg-h"><h2>Save “${esc(g.name)}” to the kitchen library</h2><button class="btn ghost" id="kX">Cancel</button></div>
      <label class="fld">Name<input id="kN" value="${esc(g.name)}" maxlength="80"></label><label class="fld">Note (optional)<input id="kNote" maxlength="200" placeholder="e.g. 10′ galley, 24″ range, bottom-freezer fridge"></label>
      <div class="row"><button class="btn" id="kNew">Save as a new kitchen</button>${src?`<button class="btn ghost danger" id="kOver">Update “${esc(src.name)}”…</button>`:''}</div>
      <p class="note">Homes that already have this kitchen keep their own copy. A saved kitchen only changes what's dropped in from now on.</p></div>`;
    d.querySelector('#kX').onclick=()=>d.close();
    d.querySelector('#kNew').onclick=async e=>{ const name=d.querySelector('#kN').value.trim()||g.name; e.target.disabled=true;
      try{ const K=await saveKitchen({ id:newKitchenId(name), name, note:d.querySelector('#kNote').value.trim(), items:recipe }); setGroupFrom(g.id, K.id); renameGroup(g.id, name); d.close(); renderSide(); toast(`“${name}” saved to the kitchen library`); }catch(err){ toast('Not saved: '+err.message); e.target.disabled=false; } };
    d.querySelector('#kOver')?.addEventListener('click', ()=>step2()); };
  const step2=()=>{ d.innerHTML=`<div class="dlg"><div class="dlg-h"><h2>Update “${esc(src.name)}”?</h2></div>
      <p class="pub-warn"><b>Warning.</b> This replaces the saved kitchen <b>${esc(src.name)}</b> in the library for the whole team. Everyone dropping it in from now on gets this version. The version it replaces is kept on the server.</p>
      <label class="fld">Type “${esc(src.name)}” to confirm<input id="kC" autocomplete="off"></label>
      <div class="row"><button class="btn danger" id="kGo" disabled>Update ${esc(src.name)}</button><button class="btn ghost" id="kBack">Back</button></div></div>`;
    const c=d.querySelector('#kC'), go=d.querySelector('#kGo'); c.oninput=()=>{ go.disabled=c.value.trim().toLowerCase()!==src.name.trim().toLowerCase(); }; c.focus();
    d.querySelector('#kBack').onclick=step1;
    go.onclick=async()=>{ go.disabled=true; try{ await saveKitchen({ id:src.id, name:src.name, note:src.note||'', items:recipe }, true); d.close(); renderSide(); toast(`“${src.name}” updated in the kitchen library`); }catch(err){ toast('Not saved: '+err.message); go.disabled=false; } }; };
  step1(); d.showModal();
}
/* sinks, sink bases and countertops: what fits what */
function kitchenNote(it, d, ed){
  if(d.dock){
    if(!it.dock) return `<p class="note">Drag it onto a sink base to dock it there: the base takes its size and the countertop gets its hole.</p>`;
    const at=it.dock.at||'C';
    return `<div class="cw-opt"><span>In the sink base</span><div class="seg">${[['L','Left'],['C','Centre'],['R','Right']].map(([k,l])=>`<button data-dock="${k}" aria-pressed="${at===k}" ${ed?'':'disabled'}>${l}</button>`).join('')}</div></div>
      <p class="note">${(it.opt?.mount||d.mount)==='top'?`Top mount: the hole is cut ${show(settings().counter.lap)}${unitSign()} in from the sink's edge all the way round.`:`Bottom mount: the sink is recessed under the countertop, which runs ${show(settings().counter.reveal||0)}${unitSign()} over the bowl all the way round.`}</p>`; }
  const under = (it.k==='BS' || it.sinkMin) && it.wall && ed ? `<div class="row"><button class="btn ghost sm" id="fUnderWin">Centre under the window</button></div>` : '';
  if(it.sinkMin) return under+`<p class="note">Holds a sink: at least ${show(it.sinkMin)}${unitSign()} wide (it can be made wider, not narrower). Its stretchers are narrowed over the sink.</p>${ed && it.w>it.sinkMin+0.01?`<div class="row"><button class="btn ghost sm" id="fFitSink">Fit to the sink (${show(it.sinkMin)}${unitSign()})</button></div>`:''}`;
  if(under) return under;
  if(d.cat==='counter'){ const C=settings().counter, H=it.sinks||[];
    return `<p class="note">${esc(C.name)} ${show(it.h)}${unitSign()}. It fits the cabinets under it: back to the wall, ${show(C.end)}${unitSign()} past a free end (a range end too), ${show(C.over)}${unitSign()} past the boxes at the front.${H.length?` Sink hole${H.length>1?'s':''}: ${H.map(h=>`${show(h.x1-h.x0)} × ${show(h.z1-h.z0)}${unitSign()} (${h.mount==='top'?'top':'bottom'} mount)`).join(', ')}.`:''}</p>`; }
  return '';
}
function furnSide(sideH, sideB){
  if(state.multiSel) return pickSide(sideH, sideB);
  const it=furnById(state.selFurn); if(!it) return false;
  if(it.grp) { groupSide(sideH, sideB, it); return true; }
  const d=itemDef(it.k), cat=catOf(d.cat), n=partsOf(it).filter(p=>!p.hw&&!p.solid).length, tot=totals([it]);
  sideH.innerHTML=`<button class="side-x" id="sideXf" title="Back to the whole home" aria-label="Back to the whole home">✕</button><div class="eyebrow">${esc(cat.name)}</div><h2>${esc(it.label||d.name)}${it.label?` <small class="muted">${esc(d.name)}</small>`:''}${canSave()?' <button class="linkbtn ren-link" id="fName">Name</button>':''}</h2><p>${sizeTxt(it)}${it.y?` · ${show(it.y)}${unitSign()} off the floor`:''}${n?` · ${n} parts · ${Object.entries(tot.area).map(([k,a])=>`${k}″ ${a.toFixed(1)} sq ft`).join(' · ')}`:''}</p>`;
  sideH.querySelector('#sideXf').onclick=()=>{ state.selFurn=null; applyFurniture(); renderSide(); };
  sideH.querySelector('#fName')?.addEventListener('click', async()=>{ const v=await askName({ title:`Name this ${d.name.toLowerCase()}`, current:it.label||'', placeholder:d.name, note:'Shown instead of the catalogue name in this home; the catalogue item stays the same.' });
    if(v===null) return; checkpoint(); ensureDraft(); const x=furnById(it.id); if(!x) return; if(v) x.label=v; else delete x.label; save(); renderSide(); toast(v?`Named “${v}”`:'Name cleared'); });
  const ed=canSave();
  const iso=state.isolate==='furn:'+it.id;
  sideB.innerHTML=`<div class="row"><button class="btn" id="fOpen">3D, exploded &amp; parts</button><button class="btn ghost" id="fIso" aria-pressed="${iso}">${iso?'Exit isolate':'Isolate'}</button></div>
    ${iso?'<p class="note">Spread three fingers (or press <b>Exploded view</b>) to take it apart right here; pinch to put it back.</p>':''}
    ${ed?`<div class="row"><button class="btn ghost sm" id="fMir" aria-pressed="${!!it.mirror}">Mirror</button><button class="btn ghost sm" id="fDup">Duplicate</button><button class="btn ghost sm" id="fRm">Remove</button></div>
    <div class="row"><button class="btn ghost sm" id="fPick">Pick several…</button>${it.was?`<button class="btn sm" id="fRelink">Relink “${esc(it.was.name)}”</button>`:''}</div>`:''}
    <div class="cw-sizes compact">
      ${['w','h','d','y'].map(k=>`<label class="cw-f"><span>${{w:'Width',h:'Height',d:'Depth',y:'Off the floor'}[k]}</span><input data-fl="${k}" value="${esc(show(it[k]||0))}" inputmode="decimal" ${!ed||(d.fixed&&k!=='y')?'disabled':''}><i>${unitSign()}</i></label>`).join('')}
    </div>
    ${(d.opts||[]).map(([k,l,vals])=>`<div class="cw-opt"><span>${l}</span><div class="seg wrap">${vals.map(v=>`<button data-fo="${k}" data-v="${esc(v)}" aria-pressed="${String((it.opt||{})[k] ?? d.opt?.[k])===String(v)}" ${ed?'':'disabled'}>${esc(optLabel(k,v))}</button>`).join('')}</div></div>`).join('')}
    ${kitchenNote(it, d, ed)}
    ${plumbNote(it)}
    <p class="note">Drag it in the plan (Build) to move it along the walls; it backs onto the nearest wall and butts up to the cabinets beside it. Drag the round green handle at its front corner to turn it, 45° at a time.${it.wall?' Its depth counts for the pot lights along this wall.':''}</p>`;
  const ch=patch=>{ updateItem(it.id, patch); if(d.sized && patch.opt) Object.assign(it, d.sized(it)); refreshItem(it); renderSide(); };
  sideB.querySelector('#fOpen').onclick=()=>openCaseLib({edit:it.id});
  sideB.querySelector('#fPick')?.addEventListener('click',()=>{ state.multiSel=true; state.selSet=[it.id]; applyFurniture(); renderSide(); });
  sideB.querySelector('#fRelink')?.addEventListener('click',()=>{ const nm=it.was.name, n=relinkGroup(it.was.id); applyFurniture(); renderSide(); toast(`Relinked “${nm}” (${n} items)`); });
  sideB.querySelector('#fIso').onclick=()=>{ setIsolate(iso?null:'furn:'+it.id, d.name); renderSide(); };
  sideB.querySelector('#fTurn')?.addEventListener('click',()=>{ turnItem(it.id); refreshItem(it); renderSide(); });
  sideB.querySelector('#fMir')?.addEventListener('click',()=>{ ch({mirror:!it.mirror}); toast(it.mirror?'Mirrored':'Back as drawn'); });
  sideB.querySelector('#fDup')?.addEventListener('click',()=>{ const c=duplicateItem(it.id); state.selFurn=c.id; refreshItem(c); applyFurniture(); renderSide(); toast('Duplicated · drag it where it goes'); });
  sideB.querySelector('#fRm')?.addEventListener('click',e=>{ const b=e.target; if(b.dataset.sure!=='1'){ b.dataset.sure='1'; b.textContent='Tap again to remove'; return; } removeItem(it.id); refreshItem({id:it.id}); renderSide(); toast('Removed'); });
  sideB.querySelectorAll('[data-fl]').forEach(inp=>inp.onchange=()=>{ const v=parseLen(inp.value), k=inp.dataset.fl;
    if(k==='w' && it.sinkMin && v<it.sinkMin-1e-6){ toast(`The sink needs this base at least ${show(it.sinkMin)}${unitSign()} wide`); inp.value=show(it.w); return; }
    if(isFinite(v) && v>=0) ch({[k]:v}); else inp.value=show(it[k]||0); });
  sideB.querySelector('#fUnderWin')?.addEventListener('click',()=>{ const r=centreUnderWindow(it.id); if(!r.ok){ toast(r.why); return; }
    furnitureOf().forEach(refreshItem); renderSide();
    toast(!r.wanted ? 'Already centred under the window' : Math.abs(r.moved-r.wanted)<0.01 ? `Moved ${show(Math.abs(r.moved))}${unitSign()}: the sink is centred under the window` : `Moved ${show(Math.abs(r.moved))}${unitSign()} of ${show(Math.abs(r.wanted))}${unitSign()}: the row is against a wall or another unit`); });
  sideB.querySelector('#fFitSink')?.addEventListener('click',()=>{ fitBaseToSink(it.id); refreshItem(it); renderSide(); toast('Sink base fitted to its sink'); });
  sideB.querySelectorAll('[data-dock]').forEach(b=>b.onclick=()=>{ ch({ dock:{ ...(it.dock||{}), at:b.dataset.dock } }); });
  sideB.querySelectorAll('[data-fo]').forEach(b=>b.onclick=()=>{ const raw=b.dataset.v; ch({opt:{...(it.opt||{}), [b.dataset.fo]:isNaN(+raw)?raw:+raw}}); });
  return true;
}
/* the home's cabinets, for the home overview */
function homeBlock(){
  const L=furnitureOf(); const t=totals(L);
  return `<div class="cw-home"><div class="eyebrow">Cabinets &amp; furniture</div>
    <p>${L.length ? `${L.length} item${L.length>1?'s':''}${Object.keys(t.area).length?` · ${Object.entries(t.sheets).map(([n,s])=>`${s} sheet${s>1?'s':''} of ${n}″`).join(' · ')} · ${t.bandFt} ft edge band`:''}` : 'None yet. Drag them in from the tray in Build, or add one from the library.'}</p>
    <div class="row"><button class="btn ghost sm" id="cwLib">Cabinet library</button>${L.some(x=>partsOf(x).some(p=>!p.hw&&!p.solid))?'<button class="btn ghost sm" id="cwAll">Cut list for the home (CSV)</button>':''}</div></div>`;
}
function bindHomeBlock(root){
  root.querySelector('#cwLib')?.addEventListener('click',()=>openCaseLib());
  root.querySelector('#cwAll')?.addEventListener('click',()=>{ const L=furnitureOf(); download(`cabinets-${state.model}.csv`, L.map((it,i)=>csv(it, `${i+1}. ${itemDef(it.k).name}`)).join('\n\n')); });
}
export { openCaseLib, furnSide, homeBlock, bindHomeBlock, parseLen };
/* ⋯ menu → Cabinet library (and the Homes window on a phone) */
/* the Library is opened from ⋯ → Library (library-ui.js); there's no separate cabinet library any more */
