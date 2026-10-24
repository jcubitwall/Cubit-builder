/* Cubit Builder — sidebar.js : model chips, wall list, wall options, layout editor, wall upload */
import { FT, POD, PW, T, TI } from './config.js';
import { LIB, MODELS, optionsFor, saveCustomModels, layerOptions, mirrorId } from './data.js';
import { LAYER_KINDS } from './config.js';
import { screwsFor, slotsFor, podList, CW, layerSlotsFor, partnerOf, deckList } from './layout.js';
import { panelCount, thumbSVG, bodyWall, wallLen } from './panels.js';
import { buildHome, highlight } from './scene3d.js';
import { facing, fmtBearing } from './orient.js';
import { setDeckFoundation } from './pods.js';
import { openSheets } from './sheets.js';
import { pickFor, save, state, choose, pickLayer, chooseLayer, foundationOf, setFoundation, deckOCOf } from './state.js';
import { ocSeg, bindOC } from './deckframe.js';
import { concretePlan } from './concrete.js';
import { FAMILIES, familyOf, familyById, variantsOf, saveSub, removeSub, editSub } from './catalog.js';
import { isAdmin, canSave } from './role.js';
import { TYPES, unitsFor, unitFor, setUnit, unitSVG, unitLabel, catOf, okey, pairOf, doorOwner, setDoorOwner } from './units.js';
import { fin } from './format.js';

const sideH=document.getElementById('sideH'), sideB=document.getElementById('sideB');
const esc = s => String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* the header: one chip per model name; under the one you're on, its standard layout and sub-models */
const famPick = {};   // last home opened under each model name (this visit)
function renderModels(){
  const el=document.getElementById('models');
  const fam=familyOf(state.model);
  if(fam) famPick[fam]=state.model;
  const tag = k => { const m=MODELS[k]; return familyById(familyOf(k))?.base===k ? 'standard' : m.sub ? 'sub-model' : m.custom ? 'your layout' : ''; };
  let h = FAMILIES.map(f=>{ const v=variantsOf(f.id), base=f.base&&MODELS[f.base];
    return `<button class="chip ${v.length?'':'empty'}" data-f="${f.id}" aria-pressed="${fam===f.id}">${esc(f.name)}<small>${v.length>1?`${v.length} designs`:base?esc(base.size||''):v.length?esc(MODELS[v[0]].size||''):'no design yet'}</small></button>`; }).join('')
    + Object.entries(MODELS).filter(([k,m])=>m.project).map(([k,m])=>`<button class="chip proj" data-m="${k}" aria-pressed="${k===state.model}" title="Saved project">${esc(m.name)}<small>${m.shared?'shared':'project'}</small></button>`).join('');
  const v = fam ? variantsOf(fam) : [];
  if(v.length>1) h += `<div class="variants" role="group" aria-label="${esc(familyById(fam).name)} designs">${v.map(k=>`<button class="vchip" data-m="${k}" aria-pressed="${k===state.model}">${esc(MODELS[k].name)}<small>${tag(k)}</small></button>`).join('')}</div>`;
  el.innerHTML = h;
  const go = k => { state.model=k; state.selected=null; save(); renderModels(); buildHome(); renderSide(); if(state.view==='sheets') openSheets(); };
  el.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>go(b.dataset.m));
  el.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>{
    const f=b.dataset.f, list=variantsOf(f);
    if(!list.length){ toast(`${familyById(f).name} has no design yet. Build a layout in Plan & pods, then add it to ${familyById(f).name}.`); return; }
    go(famPick[f] && list.includes(famPick[f]) ? famPick[f] : list[0]); });
}
function wallListHTML(slots, current){
  const layers=layerSlotsFor(state.model);
  let html='';
  podList(state.model).forEach(pod=>{
    const mine=slots.filter(s=>s.pod.i===pod.i); if(!mine.length) return;
    const ids=mine.map(s=>s.id).concat(layers.filter(l=>l.pod.i===pod.i).map(l=>l.id)), open=podList(state.model).length===1 || ids.includes(current);
    html+=`<details class="podgrp" ${open?'open':''}><summary class="podhead">${pod.long}<span>Wall A = ${sideWord(mine[0].pod.wallA||'')}</span></summary><div class="wl">`;
    mine.forEach(s=>{
      const w=pickFor(s);
      html+=`<button class="${s.id===current?'on':''}" data-s="${s.id}" title="${esc(w.id+' — '+w.name)}"><span class="n">Wall ${s.letter} <em>${s.detail}</em></span><span class="l">${fmtLen(wallLen(bodyWall(s,w)))} · ${panelCount(bodyWall(s,w))} panels</span><span class="o">${esc(w.id+' — '+w.name)}${w.blank?' ⚠':''}</span></button>`;
    });
    layers.filter(l=>l.pod.i===pod.i).forEach(l=>{
      const L=pickLayer(l);
      html+=`<button class="lay ${l.id===current?'on':''}" data-s="${l.id}" title="${esc(L.id+' — '+L.name)}"><span class="n">${LAYER_KINDS[l.kind].label}</span><span class="l">${l.len}′ · ${(L.t||0).toFixed(2).replace(/\.?0+$/,'')}″</span><span class="o">${esc(L.id+' — '+L.name)}</span></button>`;
    });
    html+='</div></details>';
  });
  const decks=deckList(state.model);
  if(decks.length){
    html+=`<details class="podgrp" ${/deck:/.test(current||'')?'open':''}><summary class="podhead">Decks<span>${decks.length}</span></summary><div class="wl">`;
    decks.forEach(d=>{ html+=`<button class="lay ${('deck:'+d.k)===current||('__deck:'+d.k)===current?'on':''}" data-s="${state.view==='sheets'?'__deck:':'deck:'}${d.k}" title="${esc(d.L.id+' — '+(d.L.name||''))}"><span class="n">Deck ${d.k+1}</span><span class="l">${d.L.w}′ × ${d.L.d}′</span><span class="o">${esc(d.L.id+' — '+(d.L.name||''))}</span></button>`; });
    html+='</div></details>';
  }
  return html;
}
function layerThumb(L){
  const len=L.len*12, s=150/len, W=len*s, H=96*s;
  let g=`<svg viewBox="-2 -2 ${W+4} ${H+4}" aria-hidden="true"><rect width="${W}" height="${H}" fill="#e7e2d6" stroke="#5b4a33" stroke-width=".8"/>`;
  (L.seams||[]).forEach(x=>{ g+=`<line x1="${x*s}" y1="0" x2="${x*s}" y2="${H}" stroke="#5b4a33" stroke-width=".4" stroke-dasharray="2 2"/>`; });
  (L.holes||[]).forEach(h=>{ g+=`<rect x="${h.x*s}" y="${h.z*s}" width="${h.w*s}" height="${h.d*s}" fill="#fff" stroke="#c0392b" stroke-width=".7"/>`; });
  return g+'</svg>';
}
const fmtLen = inch => { const ft=Math.floor((inch+0.01)/12), r=Math.round((inch-ft*12)*8)/8; return r? `${ft}′-${r}″` : `${ft}′`; };
const sideWord = k => ({S:'top side', E:'right side', N:'bottom side', W:'left side'}[k]);

/* a selected wall, floor, ceiling or deck closes with ✕ (or Esc) back to the whole home */
function renderSide(){
  renderSideInner();
  if(state.selected && sideH){ sideH.insertAdjacentHTML('afterbegin','<button class="side-x" id="sideX" title="Back to the whole home (Esc)" aria-label="Back to the whole home">✕</button>');
    sideH.querySelector('#sideX').onclick=()=>{ state.selected=null; highlight(); renderSide(); }; }
}
document.addEventListener('keydown', e=>{ if(e.key==='Escape' && state.view==='studio' && state.selected && !document.querySelector('dialog[open]') && !e.target.closest('input,textarea,select')){ state.selected=null; highlight(); renderSide(); } });
function renderSideInner(){
  const slots=slotsFor(state.model); const m=MODELS[state.model];
  const ls=layerSlotsFor(state.model).find(x=>x.id===state.selected);
  if(ls){ renderLayerSide(ls); return; }
  if(/^deck:\d+$/.test(state.selected||'')){ renderDeckSide3d(+state.selected.slice(5)); return; }
  const s=slots.find(x=>x.id===state.selected);
  if(!s){
    const pods=m.pods.length, panels=slots.reduce((a,x)=>a+(pickFor(x)?panelCount(bodyWall(x,pickFor(x))):0),0);
    const area=m.pods.reduce((a,p)=>a+POD[p.t].len*8,0);
    const fam=familyById(familyOf(state.model));
    const nS=screwsFor(state.model,state.inset).length, conc=foundationOf(state.model)==='concrete' ? concretePlan(state.model) : null;
    const facts=[`${pods} pod${pods>1?'s':''}`, `${area} sq ft`, `${slots.filter(x=>x.type!=='int').length} outside + ${slots.filter(x=>x.type==='int').length} inside walls`, `${panels} SIP panels`,
      conc ? `${Math.round(conc.icfLen)}′ ICF${nS?` · ${nS} deck screws`:''}` : `${nS} ground screws`, (m.decks||[]).length ? `${m.decks.length} deck${m.decks.length>1?'s':''}` : '', m.note ? 'scanned from STEP' : ''].filter(Boolean);
    sideH.innerHTML=`<div class="eyebrow">${fam?esc(fam.name):'Model'}${m.sub?' · sub-model':m.custom?' · your layout':m.project?' · project':fam&&fam.base===state.model?' · standard':''}</div><h2>${esc(m.name)}</h2><p>${facts.join(' · ')}</p>`;
    sideB.innerHTML=`
      ${foundationBlock()}
      ${wallListHTML(slots,null)}
      <div class="more-grp">
      ${catalogBlock()}
      ${layoutBlock(m)}
      ${importBlock()}
      <details class="help"><summary>How walls are lettered</summary><p>Each pod's walls run A, B, C, D clockwise seen from above. A and C are the through walls (they run straight through, corner to corner) and B and D butt between them. A is the through wall with the largest opening; when both are the same, A matches the other pods so they all face the same way. Click a through wall to make it A by hand.</p></details>
      </div>`;
    bindLayout(); bindFoundation(); bindCatalog();
  } else {
    const w=pickFor(s); const opts=optionsFor(s.len, s.type||'ext', state.model);
    const isInt=s.type==='int';
    sideH.innerHTML=`<div class="eyebrow">${isInt?'Interior wall · 4½″':'Exterior wall · 6½″'} · ${s.len}′ · ${s.len/4} panels</div><h2>${s.label}</h2><p>${s.detail} · faces ${fmtBearing(facing(s))} · now <b>${w?esc(w.id):'—'}</b> ${w?esc(w.name):''}</p>`;
    sideB.innerHTML=`
      <div class="row"><button class="btn" id="toSheet">Assembly sheet</button>${s.short ? `<button class="btn ghost" id="makeA" ${s.letter.startsWith('A')?'disabled':''}>Make this Wall A</button>` : ''}</div>
      ${(state.wallA?.[state.model]?.[s.pod.i] || m.pods[s.pod.i]?.a) ? `<p class="note">Wall A for ${s.pod.label} was set by hand. <button class="linkbtn" id="autoA">Go back to automatic</button></p>`:''}
      ${isInt&&partnerOf(s,slots)?`<p class="note">Joins ${s.other.label} (${esc(partnerOf(s,slots).label)}). Picking a wall here gives that wall the same one, mirrored, so openings line up.</p>`:''}
      ${unitsBlock(s, bodyWall(s,w))}
      <div class="eyebrow">${opts.length} options for a ${s.len}′ ${isInt?'interior':'exterior'} wall · seen from ${isInt?s.other.label:'outside'}</div>
      ${opts.length?'':`<p class="note">Nothing in the library for a ${s.len}′ ${isInt?'interior':'exterior'} wall yet. Upload a STEP file of a home that has one and it will be added.</p>`}
      <div class="opts">${opts.map(o=>`<button class="opt" data-o="${esc(o.id)}" aria-pressed="${w&&o.id===w.id}">${thumbSVG(o)}<b>${esc(o.name)}</b><code>${esc(o.id)}${o.src==='imported'?' · uploaded':''}${o.src==='saved'?' · saved here':''}${o.model?' · this home':''}</code></button>`).join('')}</div>`;
    sideB.querySelectorAll('.opt').forEach(b=>b.onclick=()=>{
      choose(s, b.dataset.o);
      // where two pods join, the neighbour's wall becomes the same wall, mirrored
      const pt=partnerOf(s, slots); if(pt) choose(pt, mirrorId(b.dataset.o));
      buildHome(); renderSide(); toast(`${s.label} → ${b.dataset.o}`+(pt?` · ${pt.label} → mirrored`:'')); });
    bindUnits(s, bodyWall(s,w));
    sideB.querySelector('#toSheet').onclick=()=>{ state.sheetSlot=s.id; openSheets(); };
    
    const mk=sideB.querySelector('#makeA'); if(mk) mk.onclick=()=>{ ((state.wallA[state.model] ||= {}))[s.pod.i]=s.side; save(); buildHome(); renderSide(); toast(`${s.pod.label}: this is now Wall A`); };
    const auto=sideB.querySelector('#autoA'); if(auto) auto.onclick=()=>{ if(state.wallA[state.model]) delete state.wallA[state.model][s.pod.i]; delete m.pods[s.pod.i].a; if(m.custom) saveCustomModels(); save(); buildHome(); renderSide(); };
  }
  sideB.querySelectorAll('.wl button').forEach(b=>b.onclick=()=>{ state.selected=b.dataset.s; highlight(); renderSide(); });
  const imp=sideB.querySelector('#bImport'); if(imp) imp.onclick=()=>document.getElementById('fileIn').click();
}

/* filing this layout under a model name (admins) */
function catalogBlock(){
  if(!canSave()) return '';
  const m=MODELS[state.model], fam=familyOf(state.model), opts=sel=>FAMILIES.map(f=>`<option value="${f.id}" ${f.id===sel?'selected':''}>${esc(f.name)}</option>`).join('');
  if(m.sub) return `<details class="catalog"><summary>Sub-model of ${esc(familyById(m.family)?.name||'')} · manage</summary>
      <div class="row"><button class="btn" id="subSave">Save changes for everyone</button></div>
      <label class="fld">Name<input id="subName" value="${esc(m.name)}" maxlength="80"></label>
      <label class="fld">Model<select id="subFam">${opts(m.family)}</select></label>
      <div class="row"><button class="btn ghost" id="subEdit">Rename / move</button><button class="btn ghost" id="subDel">Remove</button></div>
      <p class="note">Changes you make on screen (walls, pods, windows, foundation) stay on this device until you save them for everyone.</p></details>`;
  return `<details class="catalog"><summary>Add this layout to a model</summary>
      <label class="fld">Model<select id="subFam">${opts(fam||'')}</select></label>
      <label class="fld">Sub-model name<input id="subName" maxlength="80" placeholder="e.g. Cove + Office"></label>
      <label class="fld">Note (optional)<input id="subNote" maxlength="200" placeholder="e.g. extra 8′ pod for the Smith family, kept as an option"></label>
      <div class="row"><button class="btn" id="subAdd">Add as a sub-model</button></div>
      <p class="note">Files everything on screen (pods, decks, walls, windows and doors, foundation) under that model, for everyone.</p></details>`;
}
function bindCatalog(){
  const $=id=>sideB.querySelector('#'+id), done=(k,msg)=>{ renderModels(); buildHome(); renderSide(); toast(msg); };
  const fail=e=>toast('Not saved: '+e.message);
  if($('subAdd')) $('subAdd').onclick=async()=>{ const name=$('subName').value.trim(); if(!name){ $('subName').focus(); toast('Give the sub-model a name.'); return; }
    $('subAdd').disabled=true; try{ await saveSub({family:$('subFam').value, name, note:$('subNote').value.trim()}); done(null, `Added “${name}” to ${familyById($('subFam')?.value)?.name||'the model'}`); }catch(e){ fail(e); $('subAdd').disabled=false; } };
  const m=MODELS[state.model];
  if($('subSave')) $('subSave').onclick=async()=>{ try{ await saveSub({family:m.family, name:m.name, note:m.note, id:m.sub}); done(null,'Saved for everyone'); }catch(e){ fail(e); } };
  if($('subEdit')) $('subEdit').onclick=async()=>{ const name=$('subName').value.trim()||m.name; try{ await editSub(m.sub, {name, family:$('subFam').value}); done(null,'Sub-model updated'); }catch(e){ fail(e); } };
  if($('subDel')) $('subDel').onclick=async()=>{ const b=$('subDel'); if(b.dataset.sure!=='1'){ b.dataset.sure='1'; b.textContent='Tap again to remove'; return; }
    try{ await removeSub(m.sub); done(null,'Sub-model removed'); }catch(e){ fail(e); } };
}

/* what the home stands on */
function foundationBlock(){
  const f=foundationOf(state.model), c=f==='concrete'?concretePlan(state.model):null;
  return `<div class="fld">Home stands on<div class="seg" role="group" aria-label="Foundation"><button class="fsbtn" data-found="screws" aria-pressed="${f!=='concrete'}">Ground screws</button><button class="fsbtn" data-found="concrete" aria-pressed="${f==='concrete'}">Concrete (ICF)</button></div></div>`
    + (c ? `<p class="note">${c.brand.name} ICF on an 18″ × 6″ footing: ${Math.round(c.coreLen)}′ around the outside${c.sections.length?` and ${c.sections.length} inside support${c.sections.length>1?'s':''} with an 8″ core (${c.sections.filter(s=>s.kind==='wall').length} wall section${c.sections.filter(s=>s.kind==='wall').length===1?'':'s'})`:''}. ${c.check.ok?'Every part of the crawl space can be reached.':'<b class="flipflag">Part of the crawl space is closed off.</b>'} Details on the foundation sheet.</p>` : '');
}
function bindFoundation(){
  sideB.querySelectorAll('[data-found]').forEach(b=>b.onclick=()=>{ setFoundation(state.model, b.dataset.found); state.show.screws=true; buildHome(); renderSide();
    toast(b.dataset.found==='concrete'?'Home on a concrete ICF foundation':'Home on ground screws'); });
}

/* windows & doors in the selected wall: which library unit goes in each opening */
const KIND_NAME = { window:'Window', door:'Door', patio:'Patio door' };
function unitsBlock(s, w){
  const ops=(w?.openings||[]).filter(catOf).sort((a,b)=>a.x-b.x);
  if(!ops.length) return '';
  const n={};
  return `<div class="eyebrow">Windows &amp; doors · seen from ${s.type==='int'?esc(s.other.label):'outside'}, left to right</div><div class="units">${ops.map(o=>{
    n[o.kind]=(n[o.kind]||0)+1;
    const pr=pairOf(s,o), own=doorOwner(s,o).id===s.id;
    if(pr && !own) return `<div class="unit-row"><div class="unit-pic">${unitSVG('none','L',o.w,o.h)}</div><div class="unit-main"><b>${KIND_NAME[o.kind]} ${n[o.kind]}</b> <span class="muted">${fin(o.w)} × ${fin(o.h)} R.O. · between ${esc(s.pod.label)} and ${esc(pr.slot.pod.label)}</span>
      <span class="muted">The door is in ${esc(pr.slot.pod.label)}'s wall (${esc(pr.slot.label)}). This wall has the matching rough opening only.</span>
      <div class="unit-opts"><button class="btn ghost" data-own="${esc(okey(o))}">Put the door in ${esc(s.pod.label)}</button><button class="btn ghost" data-goto="${esc(pr.slot.id)}">Open ${esc(pr.slot.label)}</button></div></div></div>`;
    const r=unitFor(s,o), list=unitsFor(o), T=r&&TYPES[r.unit.type];
    const sel=`<select data-k="${esc(okey(o))}" aria-label="Unit for ${KIND_NAME[o.kind]} ${n[o.kind]}"><option value="">${r&&r.how==='auto'?'Automatic: '+esc(r.unit.name):'Not chosen yet'}</option>${list.map(({u,fit})=>`<option value="${esc(u.id)}" ${r&&r.how!=='auto'&&r.unit.id===u.id?'selected':''}>${esc(u.name)}${fit?'':' — does not fit'}</option>`).join('')}</select>`;
    const hand = T?.hand ? `<span class="seg sm" role="group" aria-label="${T.hand} side"><button data-h="L" data-k="${esc(okey(o))}" aria-pressed="${r.hand!=='R'}">${T.hand==='Hinge'?'Hinge L':'Left'}</button><button data-h="R" data-k="${esc(okey(o))}" aria-pressed="${r.hand==='R'}">${T.hand==='Hinge'?'Hinge R':'Right'}</button></span>` : '';
    const swing = T?.swing ? `<span class="seg sm" role="group" aria-label="Swing"><button data-sw="in" data-k="${esc(okey(o))}" aria-pressed="${r.swing!=='out'}">${pr?'Into '+esc(s.pod.label):'In'}</button><button data-sw="out" data-k="${esc(okey(o))}" aria-pressed="${r.swing==='out'}">${pr?'Into '+esc(pr.slot.pod.label):'Out'}</button></span>` : '';
    const ownerSeg = pr ? `<span class="muted">Between ${esc(s.pod.label)} and ${esc(pr.slot.pod.label)}: only one wall gets the door. It's in this one (${esc(s.pod.label)}); ${esc(pr.slot.label)} has the matching rough opening. <button class="linkbtn" data-move="${esc(okey(o))}">Move it to ${esc(pr.slot.pod.label)}'s wall</button></span>` : '';
    return `<div class="unit-row"><div class="unit-pic">${r?unitSVG(r.unit.type,r.hand,o.w,o.h,44,s.type==='int'):unitSVG('none','L',o.w,o.h)}</div><div class="unit-main"><b>${KIND_NAME[o.kind]} ${n[o.kind]}</b> <span class="muted">${fin(o.w)} × ${fin(o.h)} R.O.${o.y>0?' · sill '+fin(o.y):''}</span>${sel}${hand||swing?`<div class="unit-opts">${hand}${swing}</div>`:''}${ownerSeg}${r?`<span class="muted">${esc(pr?unitLabel(r).replace(/swings (in|out)/, m=>'swings into '+(m.endsWith('in')?s.pod.label:pr.slot.pod.label)):unitLabel(r))}${r.unit.sample?' · sample unit':''}</span>`:''}</div></div>`;
  }).join('')}</div>${!ops.every(o=>unitsFor(o).length)?'<p class="note">Add a window or door to the library with <b>Upload STEP → Window / door</b>.</p>':''}`;
}
function bindUnits(s, w){
  const ops=(w?.openings||[]).filter(catOf), byK=k=>ops.find(o=>okey(o)===k);
  const cur=o=>{ const r=unitFor(s,o); return r?{u:r.unit.id, hand:r.hand, swing:r.swing}:null; };
  const done=()=>{ buildHome(); renderSide(); };
  sideB.querySelectorAll('.units select').forEach(el=>el.onchange=()=>{ const o=byK(el.dataset.k); setUnit(s,o, el.value?{u:el.value, hand:cur(o)?.hand||'L', swing:cur(o)?.swing||'in'}:null); done(); });
  sideB.querySelectorAll('.units [data-h]').forEach(b=>b.onclick=()=>{ const o=byK(b.dataset.k), c=cur(o); if(c){ setUnit(s,o,{...c, hand:b.dataset.h}); done(); } });
  sideB.querySelectorAll('.units [data-sw]').forEach(b=>b.onclick=()=>{ const o=byK(b.dataset.k), c=cur(o); if(c){ setUnit(s,o,{...c, swing:b.dataset.sw}); done(); } });
  // a door between two pods: which pod's wall holds it
  sideB.querySelectorAll('.units [data-own]').forEach(b=>b.onclick=()=>{ setDoorOwner(s, byK(b.dataset.own)); done(); });
  sideB.querySelectorAll('.units [data-move]').forEach(b=>b.onclick=()=>{ const o=byK(b.dataset.move), pr=pairOf(s,o); if(pr){ setDoorOwner(pr.slot, pr.o); state.selected=pr.slot.id; done(); } });
  sideB.querySelectorAll('.units [data-goto]').forEach(b=>b.onclick=()=>{ state.selected=b.dataset.goto; highlight(); renderSide(); });
}

function renderDeckSide3d(k){
  const d=deckList(state.model)[k]; if(!d){ state.selected=null; renderSide(); return; }
  const L=d.L;
  sideH.innerHTML=`<div class="eyebrow">Deck ${k+1} · ${L.w}′ × ${L.d}′ frame</div><h2>${L.w}′ × ${L.d}′ deck</h2><p><code>${esc(L.id)}</code> · double 2×8 rims · 2×8 joists ${deckOCOf(state.model)}″ o.c. from the house · 4 corner notches 1½″ · ¾″ off the house</p>`;
  sideB.innerHTML=`<div class="row"><button class="btn" id="toSheet">Framing sheet</button><button class="btn ghost" id="toPlan">Move in the plan</button></div>
    <div class="fld">Stands on<div class="seg"><button class="fsbtn" id="fScrews" aria-pressed="${d.found!=='pads'}">Ground screws</button><button class="fsbtn" id="fPads" aria-pressed="${d.found==='pads'}">Concrete pads (floating)</button></div></div>
    <div class="edit-only">${ocSeg()}</div>
    <p class="note">Decks dock with their ledger against a pod or another deck. Swap, turn or remove decks in the plan editor.</p>`;
  bindOC(sideB, ()=>{ buildHome(); renderSide(); });
  const setF=f=>{ setDeckFoundation(k,f); state.selected='deck:'+k; renderModels(); buildHome(); renderSide(); toast(f==='pads'?'Deck floats on concrete pads':'Deck on ground screws'); };
  sideB.querySelector('#fScrews').onclick=()=>setF('screws'); sideB.querySelector('#fPads').onclick=()=>setF('pads');
  sideB.querySelector('#toSheet').onclick=()=>{ state.sheetSlot='__deck:'+k; openSheets(); };
  sideB.querySelector('#toPlan').onclick=()=>document.getElementById('bPlan').click();
  
}
/* ============================================================ layout editor: add / remove pods */
function renderLayerSide(ls){
  const L=pickLayer(ls), K=LAYER_KINDS[ls.kind], opts=layerOptions(ls.kind, ls.len);
  sideH.innerHTML=`<div class="eyebrow">${K.label} · ${ls.len}′ × 8′ · ${(L.t||K.t)}″ thick</div><h2>${ls.label}</h2><p>now <b>${esc(L.id)}</b> ${esc(L.name)}</p>`;
  sideB.innerHTML=`
    <div class="row"><button class="btn" id="toSheet">Layer sheet</button></div>
    ${ls.kind==='ceiling-int'||ls.kind==='roof' ? '<p class="note">Turn on Ceiling or Roof under Layers (or use Exploded view) to see them in 3D.</p>':''}
    <div class="eyebrow">${opts.length} ${K.label.toLowerCase()} option${opts.length===1?'':'s'} for a ${ls.len}′ pod · seen from above</div>
    ${opts.length?'':`<p class="note">Nothing in the library for this yet. It fills up as STEP files are imported.</p>`}
    <div class="opts">${opts.map(o=>`<button class="opt" data-o="${esc(o.id)}" aria-pressed="${o.id===L.id}">${layerThumb(o)}<b>${esc(o.name)}</b><code>${esc(o.id)}</code></button>`).join('')}</div>`;
  sideB.querySelectorAll('.opt').forEach(b=>b.onclick=()=>{ chooseLayer(ls, b.dataset.o); buildHome(); renderSide(); toast(`${ls.label} → ${b.dataset.o}`); });
  sideB.querySelector('#toSheet').onclick=()=>{ state.sheetSlot=ls.id; openSheets(); };
  
}
function layoutBlock(m){
  return `<details id="layoutBox"><summary>Pods in this home</summary>
    <div class="podrows">${podList(state.model).map(p=>`<div class="podrow"><span>${p.long}${p.rot?` · turned ${p.rot}°`:''}</span><code>${esc(p.src||'blank')}</code></div>`).join('')}</div>
    <div class="row"><button class="btn" id="openPlan">Open the plan editor</button></div>
    <p class="note">Drag pods in from the pod library, move, turn, replace or remove them on an 8′ grid.</p>
    ${m.custom?`<div class="row"><button class="btn ghost" id="apCopy">Copy layout code</button><button class="btn ghost" id="apDel">Delete this layout</button></div>`:''}
  </details>`;
}
function bindLayout(){
  const box=document.getElementById('layoutBox'); if(!box) return;
  if(state.layoutOpen) box.open=true;
  box.addEventListener('toggle',()=>{ state.layoutOpen=box.open; });
  box.querySelector('#openPlan').onclick=()=>document.getElementById('bPlan').click();
  const cp=box.querySelector('#apCopy'); if(cp) cp.onclick=async()=>{
    const m=MODELS[state.model]; const code=JSON.stringify({[state.model.replace('custom-','home-')]:{name:m.name.replace(' (custom)',''), size:m.size, pods:m.pods, picks:{...(m.picks||{}), ...(state.picks[state.model]||{})}}},null,2);
    try{ await navigator.clipboard.writeText(code); toast('Layout copied. Paste it into data/models.json.'); }
    catch(e){ const ta=document.createElement('textarea'); ta.value=code; ta.rows=8; ta.style.width='100%'; cp.after(ta); ta.select(); toast('Select the text below and copy it.'); }
  };
  const del=box.querySelector('#apDel'); if(del) del.onclick=()=>{
    if(del.dataset.sure!=='1'){ del.dataset.sure='1'; del.textContent='Tap again to delete'; return; }
    delete MODELS[state.model]; saveCustomModels(); state.model=Object.keys(MODELS)[0]; save(); renderModels(); buildHome(); renderSide();
  };
}
function sizeText(pods){ const c={}; pods.forEach(p=>c[POD[p.t].len]=(c[POD[p.t].len]||0)+1); return Object.entries(c).sort((a,b)=>b[0]-a[0]).map(([l,n])=>(n>1?n+'×':'')+l).join(' + '); }

function importBlock(){
  return `<details class="edit-only"><summary>Upload wall options</summary>
  <p>Upload a .json file of walls. Each wall drops into every slot of the same length. All sizes are inches, y from the bottom of the wall. Openings and outside items: x from the left end seen from <b>outside</b>. Inside boxes: x from the left end seen from <b>inside</b>, the way the electrician reads it. Use <code>"type": "int"</code> for a 4½″ wall between pods.</p>
<pre>[{ "id": "W24-16", "name": "Office wall", "len": 24, "type": "ext",
   "openings": [{"kind":"window","x":40,"y":36,"w":48,"h":36},
                {"kind":"door","x":200,"y":0,"w":38,"h":82.5}],
   "inside":  [{"kind":"outlet","x":30,"y":16},
               {"kind":"switch","x":40,"y":48}],
   "outside": [{"kind":"outlet","x":250,"y":16}] }]</pre>
  <div class="row"><button class="btn ghost" id="bImport">Upload wall file…</button></div></details>`;
}
document.getElementById('fileIn').addEventListener('change',e=>{
  const f=e.target.files[0]; if(!f) return; const rd=new FileReader();
  rd.onload=()=>{ try{
      let data=JSON.parse(rd.result); if(!Array.isArray(data)) data=data.walls||[data];
      let added=0; const keep=[];
      data.forEach(w=>{ if(!w.id||!w.len||(w.len*FT)%PW) return; const ty=w.type==='int'?'int':'ext'; const clean={id:String(w.id),name:w.name||w.id,len:+w.len,type:ty,t:+w.t||(ty==='int'?TI:T),openings:w.openings||[],inside:w.inside||[],outside:w.outside||[],src:'imported'};
        const i=LIB.findIndex(x=>x.id===clean.id); if(i>=0) LIB[i]=clean; else LIB.push(clean); keep.push(clean); added++; });
      try{ const prev=JSON.parse(localStorage.getItem('cubit-walls-imported')||'[]').filter(p=>!keep.find(k=>k.id===p.id)); localStorage.setItem('cubit-walls-imported',JSON.stringify(prev.concat(keep))); }catch(_){}
      toast(added?`Added ${added} wall option${added>1?'s':''}`:'No walls found. Check that each has id and a len in multiples of 4 ft.');
      renderSide();
    }catch(err){ toast('That file is not valid JSON.'); } };
  rd.readAsText(f); e.target.value='';
});
let toastT; function toast(msg){ let t=document.querySelector('.toast'); if(!t){t=document.createElement('div');t.className='toast';document.body.appendChild(t);} t.textContent=msg; t.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>t.hidden=true,2400); }

export { sideH, renderModels, wallListHTML, renderSide, importBlock, toast, sideB, layerThumb };
