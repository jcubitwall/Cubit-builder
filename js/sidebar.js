/* Cubit Builder — sidebar.js */
import { FT, POD, PW, T, TI } from './config.js';
import { LIB, MODELS, optionsFor } from './data.js';
import { screwsFor, slotsFor } from './layout.js';
import { panelCount, thumbSVG } from './panels.js';
import { buildHome, highlight } from './scene3d.js';
import { openSheets } from './sheets.js';
import { pickFor, save, state } from './state.js';

/* ============================================================ sidebar */
const sideH=document.getElementById('sideH'), sideB=document.getElementById('sideB');
function renderModels(){
  const el=document.getElementById('models');
  el.innerHTML = Object.entries(MODELS).map(([k,m])=>`<button class="chip" data-m="${k}" aria-pressed="${k===state.model}">${m.name}<small>${m.size}</small></button>`).join('');
  el.querySelectorAll('button').forEach(b=>b.onclick=()=>{ state.model=b.dataset.m; state.selected=null; save(); renderModels(); buildHome(); renderSide(); if(state.view==='sheets') openSheets(); });
}
function wallListHTML(slots, current, cls){
  return `<div class="wl">${slots.map(s=>{ const w=pickFor(s); return `<button class="${s.id===current?'on':''}" data-s="${s.id}"><span class="n">${s.label}</span><span class="l">${s.len}′ · ${w?panelCount(w):0} panels</span><span class="o">${w?w.id+' — '+w.name:'No option for this length yet'}</span></button>`; }).join('')}</div>`;
}
function renderSide(){
  const slots=slotsFor(state.model); const m=MODELS[state.model];
  const s=slots.find(x=>x.id===state.selected);
  if(!s){
    const pods=m.pods.length, panels=slots.reduce((a,x)=>a+(pickFor(x)?panelCount(pickFor(x)):0),0);
    const area=m.pods.reduce((a,p)=>a+POD[p.t].len*8,0);
    sideH.innerHTML=`<div class="eyebrow">Model</div><h2>${m.name}</h2><p>${m.pods.map(p=>POD[p.t].name).join(' + ')} · ${area} sq ft</p>`;
    sideB.innerHTML=`
      <div class="stats"><div class="stat"><b>${pods}</b><span>pods</span></div><div class="stat"><b>${slots.filter(x=>x.type!=='int').length} + ${slots.filter(x=>x.type==='int').length}</b><span>outside + inside walls</span></div><div class="stat"><b>${panels}</b><span>SIP panels</span></div><div class="stat"><b>${screwsFor(state.model,state.inset).length}</b><span>ground screws</span></div></div>
      <p class="note">Click a wall in the 3D view, or pick one below, to swap it for another option of the same length.</p>
      ${wallListHTML(slots,null)}
      ${importBlock()}`;
  } else {
    const w=pickFor(s); const opts=optionsFor(s.len, s.type||'ext');
    const isInt=s.type==='int';
    sideH.innerHTML=`<div class="eyebrow">${isInt?'Interior wall · 4½″':'Exterior wall · 6½″'} · ${s.len}′ · ${s.len/4} panels</div><h2>${s.label}</h2><p>Now: <b>${w?w.id:'—'}</b> ${w?w.name:''}</p>`;
    sideB.innerHTML=`
      <div class="row"><button class="btn" id="toSheet">Assembly sheet for this wall</button><button class="btn ghost" id="deselect">Back to model</button></div>
      <div class="eyebrow">${opts.length} options for a ${s.len}′ ${isInt?'interior':'exterior'} wall · seen from ${isInt?s.other.label:'outside'}</div>
      <div class="opts">${opts.map(o=>`<button class="opt" data-o="${o.id}" aria-pressed="${w&&o.id===w.id}">${thumbSVG(o)}<b>${o.name}</b><code>${o.id}${o.src==='imported'?' · imported':''}</code></button>`).join('')}</div>`;
    sideB.querySelectorAll('.opt').forEach(b=>b.onclick=()=>{ state.picks[state.model][s.id]=b.dataset.o; save(); buildHome(); renderSide(); toast(`${s.label} → ${b.dataset.o}`); });
    sideB.querySelector('#toSheet').onclick=()=>{ state.sheetSlot=s.id; openSheets(); };
    sideB.querySelector('#deselect').onclick=()=>{ state.selected=null; highlight(); renderSide(); };
  }
  sideB.querySelectorAll('.wl button').forEach(b=>b.onclick=()=>{ state.selected=b.dataset.s; highlight(); renderSide(); });
  const imp=sideB.querySelector('#bImport'); if(imp) imp.onclick=()=>document.getElementById('fileIn').click();
}
function importBlock(){
  return `<details><summary>Add your own wall options</summary>
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
let toastT; function toast(msg){ let t=document.querySelector('.toast'); if(!t){t=document.createElement('div');t.className='toast';document.body.appendChild(t);} t.textContent=msg; t.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>t.hidden=true,2200); }

export { sideH, renderModels, wallListHTML, renderSide, importBlock, toast, sideB };
