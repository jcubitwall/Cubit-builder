/* Cubit Builder — sidebar.js : model chips, wall list, wall options, layout editor, wall upload */
import { FT, POD, PW, T, TI } from './config.js';
import { LIB, MODELS, optionsFor, saveCustomModels, layerOptions, mirrorId } from './data.js';
import { LAYER_KINDS } from './config.js';
import { screwsFor, slotsFor, podList, CW, layerSlotsFor, partnerOf } from './layout.js';
import { panelCount, thumbSVG, bodyWall, wallLen } from './panels.js';
import { buildHome, highlight } from './scene3d.js';
import { openSheets } from './sheets.js';
import { pickFor, save, state, choose, pickLayer, chooseLayer } from './state.js';

const sideH=document.getElementById('sideH'), sideB=document.getElementById('sideB');
const esc = s => String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function renderModels(){
  const el=document.getElementById('models');
  const ents=Object.entries(MODELS);
  el.innerHTML = ents.filter(([k,m])=>!m.project).map(([k,m])=>`<button class="chip" data-m="${k}" aria-pressed="${k===state.model}">${esc(m.name)}<small>${esc(m.size||'')}</small></button>`).join('')
    + ents.filter(([k,m])=>m.project).map(([k,m])=>`<button class="chip proj" data-m="${k}" aria-pressed="${k===state.model}" title="Saved project">${esc(m.name)}<small>${m.shared?'shared':'project'}</small></button>`).join('');
  el.querySelectorAll('button').forEach(b=>b.onclick=()=>{ state.model=b.dataset.m; state.selected=null; save(); renderModels(); buildHome(); renderSide(); if(state.view==='sheets') openSheets(); });
}
function wallListHTML(slots, current){
  const layers=layerSlotsFor(state.model);
  let html='';
  podList(state.model).forEach(pod=>{
    const mine=slots.filter(s=>s.pod.i===pod.i); if(!mine.length) return;
    html+=`<div class="podhead">${pod.long}<span>Wall A = ${sideWord(mine[0].pod.wallA||'')}</span></div><div class="wl">`;
    mine.forEach(s=>{
      const w=pickFor(s);
      html+=`<button class="${s.id===current?'on':''}" data-s="${s.id}"><span class="n">Wall ${s.letter} <em>${s.detail}</em></span><span class="l">${fmtLen(wallLen(bodyWall(s,w)))} · ${panelCount(bodyWall(s,w))} panels</span><span class="o">${esc(w.id+' — '+w.name)}${w.blank?' ⚠':''}</span></button>`;
    });
    layers.filter(l=>l.pod.i===pod.i).forEach(l=>{
      const L=pickLayer(l);
      html+=`<button class="lay ${l.id===current?'on':''}" data-s="${l.id}"><span class="n">${LAYER_KINDS[l.kind].label}</span><span class="l">${l.len}′ · ${(L.t||0).toFixed(2).replace(/\.?0+$/,'')}″</span><span class="o">${esc(L.id+' — '+L.name)}</span></button>`;
    });
    html+='</div>';
  });
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

function renderSide(){
  const slots=slotsFor(state.model); const m=MODELS[state.model];
  const ls=layerSlotsFor(state.model).find(x=>x.id===state.selected);
  if(ls){ renderLayerSide(ls); return; }
  const s=slots.find(x=>x.id===state.selected);
  if(!s){
    const pods=m.pods.length, panels=slots.reduce((a,x)=>a+(pickFor(x)?panelCount(bodyWall(x,pickFor(x))):0),0);
    const area=m.pods.reduce((a,p)=>a+POD[p.t].len*8,0);
    sideH.innerHTML=`<div class="eyebrow">Model${m.custom?' · your layout':''}</div><h2>${esc(m.name)}</h2><p>${pods} pods · ${area} sq ft${m.note?' · scanned from STEP':''}</p>`;
    sideB.innerHTML=`
      <div class="stats"><div class="stat"><b>${pods}</b><span>pods</span></div><div class="stat"><b>${slots.filter(x=>x.type!=='int').length} + ${slots.filter(x=>x.type==='int').length}</b><span>outside + inside walls</span></div><div class="stat"><b>${panels}</b><span>SIP panels</span></div><div class="stat"><b>${screwsFor(state.model,state.inset).length}</b><span>ground screws</span></div></div>
      <p class="note">Each pod's walls run A, B, C, D clockwise seen from above. A is the short end wall with the door, so A and C are the short walls (fitted between the long walls) and B and D are the long walls (full length). Click a wall to swap it or to change which wall is A.</p>
      ${wallListHTML(slots,null)}
      ${layoutBlock(m)}
      ${importBlock()}`;
    bindLayout();
  } else {
    const w=pickFor(s); const opts=optionsFor(s.len, s.type||'ext', state.model);
    const isInt=s.type==='int';
    sideH.innerHTML=`<div class="eyebrow">${isInt?'Interior wall · 4½″':'Exterior wall · 6½″'} · ${s.len}′ · ${s.len/4} panels</div><h2>${s.label}</h2><p>${s.detail} · now <b>${w?esc(w.id):'—'}</b> ${w?esc(w.name):''}</p>`;
    sideB.innerHTML=`
      <div class="row"><button class="btn" id="toSheet">Assembly sheet</button>${(s.short || s.pod.len<=8) ? `<button class="btn ghost" id="makeA" ${s.letter.startsWith('A')?'disabled':''}>Make this Wall A</button>` : ''}<button class="btn ghost" id="deselect">Back to model</button></div>
      ${(state.wallA?.[state.model]?.[s.pod.i] || m.pods[s.pod.i]?.a) ? `<p class="note">Wall A for ${s.pod.label} was set by hand. <button class="linkbtn" id="autoA">Go back to automatic</button></p>`:''}
      ${isInt&&partnerOf(s,slots)?`<p class="note">Joins ${s.other.label} (${esc(partnerOf(s,slots).label)}). Picking a wall here gives that wall the same one, mirrored, so openings line up.</p>`:''}
      <div class="eyebrow">${opts.length} options for a ${s.len}′ ${isInt?'interior':'exterior'} wall · seen from ${isInt?s.other.label:'outside'}</div>
      ${opts.length?'':`<p class="note">Nothing in the library for a ${s.len}′ ${isInt?'interior':'exterior'} wall yet. Upload a STEP file of a home that has one and it will be added.</p>`}
      <div class="opts">${opts.map(o=>`<button class="opt" data-o="${esc(o.id)}" aria-pressed="${w&&o.id===w.id}">${thumbSVG(o)}<b>${esc(o.name)}</b><code>${esc(o.id)}${o.src==='imported'?' · uploaded':''}${o.src==='saved'?' · saved here':''}${o.model?' · this home':''}</code></button>`).join('')}</div>`;
    sideB.querySelectorAll('.opt').forEach(b=>b.onclick=()=>{
      choose(s, b.dataset.o);
      // where two pods join, the neighbour's wall becomes the same wall, mirrored
      const pt=partnerOf(s, slots); if(pt) choose(pt, mirrorId(b.dataset.o));
      buildHome(); renderSide(); toast(`${s.label} → ${b.dataset.o}`+(pt?` · ${pt.label} → mirrored`:'')); });
    sideB.querySelector('#toSheet').onclick=()=>{ state.sheetSlot=s.id; openSheets(); };
    sideB.querySelector('#deselect').onclick=()=>{ state.selected=null; highlight(); renderSide(); };
    const mk=sideB.querySelector('#makeA'); if(mk) mk.onclick=()=>{ ((state.wallA[state.model] ||= {}))[s.pod.i]=s.side; save(); buildHome(); renderSide(); toast(`${s.pod.label}: this is now Wall A`); };
    const auto=sideB.querySelector('#autoA'); if(auto) auto.onclick=()=>{ if(state.wallA[state.model]) delete state.wallA[state.model][s.pod.i]; delete m.pods[s.pod.i].a; if(m.custom) saveCustomModels(); save(); buildHome(); renderSide(); };
  }
  sideB.querySelectorAll('.wl button').forEach(b=>b.onclick=()=>{ state.selected=b.dataset.s; highlight(); renderSide(); });
  const imp=sideB.querySelector('#bImport'); if(imp) imp.onclick=()=>document.getElementById('fileIn').click();
}

/* ============================================================ layout editor: add / remove pods */
function renderLayerSide(ls){
  const L=pickLayer(ls), K=LAYER_KINDS[ls.kind], opts=layerOptions(ls.kind, ls.len);
  sideH.innerHTML=`<div class="eyebrow">${K.label} · ${ls.len}′ × 8′ · ${(L.t||K.t)}″ thick</div><h2>${ls.label}</h2><p>now <b>${esc(L.id)}</b> ${esc(L.name)}</p>`;
  sideB.innerHTML=`
    <div class="row"><button class="btn" id="toSheet">Layer sheet</button><button class="btn ghost" id="deselect">Back to model</button></div>
    ${ls.kind==='ceiling-int'||ls.kind==='roof' ? '<p class="note">Turn on Roof (or Exploded view) to see the ceiling and roof in 3D.</p>':''}
    <div class="eyebrow">${opts.length} ${K.label.toLowerCase()} option${opts.length===1?'':'s'} for a ${ls.len}′ pod · seen from above</div>
    ${opts.length?'':`<p class="note">Nothing in the library for this yet. It fills up as STEP files are imported.</p>`}
    <div class="opts">${opts.map(o=>`<button class="opt" data-o="${esc(o.id)}" aria-pressed="${o.id===L.id}">${layerThumb(o)}<b>${esc(o.name)}</b><code>${esc(o.id)}</code></button>`).join('')}</div>`;
  sideB.querySelectorAll('.opt').forEach(b=>b.onclick=()=>{ chooseLayer(ls, b.dataset.o); buildHome(); renderSide(); toast(`${ls.label} → ${b.dataset.o}`); });
  sideB.querySelector('#toSheet').onclick=()=>{ state.sheetSlot=ls.id; openSheets(); };
  sideB.querySelector('#deselect').onclick=()=>{ state.selected=null; highlight(); renderSide(); };
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
  return `<details><summary>Upload wall options</summary>
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
