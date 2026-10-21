/* Cubit Builder — sidebar.js : model chips, wall list, wall options, layout editor, wall upload */
import { FT, POD, PW, T, TI } from './config.js';
import { LIB, MODELS, optionsFor, saveCustomModels } from './data.js';
import { screwsFor, slotsFor, podList, CW } from './layout.js';
import { panelCount, thumbSVG } from './panels.js';
import { buildHome, highlight } from './scene3d.js';
import { openSheets } from './sheets.js';
import { pickFor, save, state, choose } from './state.js';

const sideH=document.getElementById('sideH'), sideB=document.getElementById('sideB');
const esc = s => String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function renderModels(){
  const el=document.getElementById('models');
  el.innerHTML = Object.entries(MODELS).map(([k,m])=>`<button class="chip" data-m="${k}" aria-pressed="${k===state.model}">${esc(m.name)}<small>${esc(m.size||'')}</small></button>`).join('');
  el.querySelectorAll('button').forEach(b=>b.onclick=()=>{ state.model=b.dataset.m; state.selected=null; save(); renderModels(); buildHome(); renderSide(); if(state.view==='sheets') openSheets(); });
}
function wallListHTML(slots, current){
  let html='', pod=-1;
  slots.forEach(s=>{
    if(s.pod.i!==pod){ if(pod>=0) html+='</div>'; pod=s.pod.i; html+=`<div class="podhead">${s.pod.long}<span>Wall A = ${s.pod.wallA ? sideWord(s.pod.wallA) : ''}</span></div><div class="wl">`; }
    const w=pickFor(s);
    html+=`<button class="${s.id===current?'on':''}" data-s="${s.id}"><span class="n">Wall ${s.letter} <em>${s.detail}</em></span><span class="l">${s.len}′ · ${w?panelCount(w):0} panels</span><span class="o">${w?esc(w.id+' — '+w.name):'No option for this length yet'}</span></button>`;
  });
  return html+(pod>=0?'</div>':'');
}
const sideWord = k => ({S:'top side', E:'right end', N:'bottom side', W:'left end'}[k]);

function renderSide(){
  const slots=slotsFor(state.model); const m=MODELS[state.model];
  const s=slots.find(x=>x.id===state.selected);
  if(!s){
    const pods=m.pods.length, panels=slots.reduce((a,x)=>a+(pickFor(x)?panelCount(pickFor(x)):0),0);
    const area=m.pods.reduce((a,p)=>a+POD[p.t].len*8,0);
    sideH.innerHTML=`<div class="eyebrow">Model${m.custom?' · your layout':''}</div><h2>${esc(m.name)}</h2><p>${pods} pods · ${area} sq ft${m.note?' · scanned from STEP':''}</p>`;
    sideB.innerHTML=`
      <div class="stats"><div class="stat"><b>${pods}</b><span>pods</span></div><div class="stat"><b>${slots.filter(x=>x.type!=='int').length} + ${slots.filter(x=>x.type==='int').length}</b><span>outside + inside walls</span></div><div class="stat"><b>${panels}</b><span>SIP panels</span></div><div class="stat"><b>${screwsFor(state.model,state.inset).length}</b><span>ground screws</span></div></div>
      <p class="note">Each pod's walls run A, B, C, D clockwise seen from above, starting at the wall with a door. Click a wall to swap it or to change which wall is A.</p>
      ${wallListHTML(slots,null)}
      ${layoutBlock(m)}
      ${importBlock()}`;
    bindLayout();
  } else {
    const w=pickFor(s); const opts=optionsFor(s.len, s.type||'ext', state.model);
    const isInt=s.type==='int';
    sideH.innerHTML=`<div class="eyebrow">${isInt?'Interior wall · 4½″':'Exterior wall · 6½″'} · ${s.len}′ · ${s.len/4} panels</div><h2>${s.label}</h2><p>${s.detail} · now <b>${w?esc(w.id):'—'}</b> ${w?esc(w.name):''}</p>`;
    sideB.innerHTML=`
      <div class="row"><button class="btn" id="toSheet">Assembly sheet</button><button class="btn ghost" id="makeA" ${s.letter.startsWith('A')?'disabled':''}>Make this Wall A</button><button class="btn ghost" id="deselect">Back to model</button></div>
      ${state.wallA?.[state.model]?.[s.pod.i] ? `<p class="note">Wall A for ${s.pod.label} was set by hand. <button class="linkbtn" id="autoA">Go back to automatic</button></p>`:''}
      <div class="eyebrow">${opts.length} options for a ${s.len}′ ${isInt?'interior':'exterior'} wall · seen from ${isInt?s.other.label:'outside'}</div>
      <div class="opts">${opts.map(o=>`<button class="opt" data-o="${esc(o.id)}" aria-pressed="${w&&o.id===w.id}">${thumbSVG(o)}<b>${esc(o.name)}</b><code>${esc(o.id)}${o.src==='imported'?' · uploaded':''}${o.model?' · this home':''}</code></button>`).join('')}</div>`;
    sideB.querySelectorAll('.opt').forEach(b=>b.onclick=()=>{ choose(s, b.dataset.o); buildHome(); renderSide(); toast(`${s.label} → ${b.dataset.o}`); });
    sideB.querySelector('#toSheet').onclick=()=>{ state.sheetSlot=s.id; openSheets(); };
    sideB.querySelector('#deselect').onclick=()=>{ state.selected=null; highlight(); renderSide(); };
    sideB.querySelector('#makeA').onclick=()=>{ ((state.wallA[state.model] ||= {}))[s.pod.i]=s.side; save(); buildHome(); renderSide(); toast(`${s.pod.label}: this is now Wall A`); };
    const auto=sideB.querySelector('#autoA'); if(auto) auto.onclick=()=>{ delete state.wallA[state.model][s.pod.i]; save(); buildHome(); renderSide(); };
  }
  sideB.querySelectorAll('.wl button').forEach(b=>b.onclick=()=>{ state.selected=b.dataset.s; highlight(); renderSide(); });
  const imp=sideB.querySelector('#bImport'); if(imp) imp.onclick=()=>document.getElementById('fileIn').click();
}

/* ============================================================ layout editor: add / remove pods */
function layoutBlock(m){
  const pods=podList(state.model);
  const slots=slotsFor(state.model);
  const letterOf=(pi,side)=>{ const s=slots.find(x=>x.pod.i===pi && x.side===side); return s ? s.letter.replace(/\d+$/,'') : side; };
  const sideOpts = pi => CW.map(k=>`<option value="${k}">beside Wall ${letterOf(pi,k)} (${sideWord(k)})</option>`).join('');
  return `<details id="layoutBox"><summary>Pods in this home · add a pod</summary>
    <div class="podrows">${pods.map(p=>`<div class="podrow"><span>${p.long}</span>${m.custom && pods.length>1 && p.i===pods.length-1?`<button class="linkbtn" data-rm="${p.i}">Remove</button>`:''}</div>`).join('')}</div>
    <div class="addpod">
      <label for="apSize">New pod</label><select id="apSize"><option value="L24">24′ pod</option><option value="P16">16′ pod</option><option value="P8">8′ pod</option></select>
      <label for="apNext">next to</label><select id="apNext">${pods.map(p=>`<option value="${p.i}">${p.long}</option>`).join('')}</select>
      <label for="apSide">on the</label><select id="apSide">${sideOpts(0)}</select>
      <label for="apAlign">lined up with</label><select id="apAlign"><option value="start">left end of that wall seen from above</option><option value="end">right end</option></select>
      <button class="btn" id="apAdd">Add pod</button>
    </div>
    <p class="note">${m.custom?'This layout is saved in this browser.':'Adding a pod makes your own copy of this home, saved in this browser.'} Pods line up with each other on the 4′ grid, with the 5/8″ joint space added automatically.</p>
    ${m.custom?`<div class="row"><button class="btn ghost" id="apCopy">Copy layout code</button><button class="btn ghost" id="apDel">Delete this layout</button></div>`:''}
  </details>`;
}
function bindLayout(){
  const box=document.getElementById('layoutBox'); if(!box) return;
  if(state.layoutOpen) box.open=true;
  box.addEventListener('toggle',()=>{ state.layoutOpen=box.open; });
  const next=box.querySelector('#apNext'), side=box.querySelector('#apSide');
  const slots=slotsFor(state.model);
  const letterOf=(pi,k)=>{ const s=slots.find(x=>x.pod.i===pi && x.side===k); return s ? s.letter.replace(/\d+$/,'') : k; };
  next.onchange=()=>{ side.innerHTML=CW.map(k=>`<option value="${k}">beside Wall ${letterOf(+next.value,k)} (${sideWord(k)})</option>`).join(''); };
  box.querySelector('#apAdd').onclick=()=>{
    const t=box.querySelector('#apSize').value, L=POD[t].len, p=podList(state.model)[+next.value], k=side.value, al=box.querySelector('#apAlign').value;
    let x,z;
    if(k==='S'||k==='N'){ z = k==='S' ? p.z-8 : p.z1; x = al==='start' ? p.x : p.x1-L; }
    else { z = p.z; x = k==='W' ? p.x-L : p.x1; }
    const cur=MODELS[state.model].pods;
    const clash=cur.some(q=>{ const qL=POD[q.t].len; return x < q.x+qL-1e-6 && x+L > q.x+1e-6 && z < q.z+8-1e-6 && z+8 > q.z+1e-6; });
    if(clash){ toast('That spot is already taken by another pod.'); return; }
    // normalise so the layout starts at 0,0
    const all=cur.concat([{t,x,z}]); const mx=Math.min(...all.map(q=>q.x)), mz=Math.min(...all.map(q=>q.z));
    const pods=all.map(q=>({...q, x:q.x-mx, z:q.z-mz}));
    let key=state.model, m=MODELS[key];
    if(!m.custom){
      key='custom-'+Date.now().toString(36);
      MODELS[key]={ name:m.name+' (custom)', size:'', base: m.base||state.model, pods, picks:{}, custom:true };
      // carry over this home's walls where the slot still exists (the ids shift when the layout moves)
      if(mx===0&&mz===0) MODELS[key].picks={...(m.picks||{})};
      const mine=state.picks[state.model]; if(mine && mx===0 && mz===0) state.picks[key]={...mine};
    } else {
      m.pods=pods; if(mx!==0||mz!==0){ m.picks={}; delete state.picks[key]; }
    }
    MODELS[key].size = sizeText(MODELS[key].pods);
    saveCustomModels(); state.model=key; state.layoutOpen=true; save();
    renderModels(); buildHome(); renderSide(); toast(`Added a ${L}′ pod`);
  };
  box.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{
    const m=MODELS[state.model]; m.pods=m.pods.slice(0,-1); m.size=sizeText(m.pods); saveCustomModels(); buildHome(); renderSide(); toast('Removed the last pod');
  });
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

export { sideH, renderModels, wallListHTML, renderSide, importBlock, toast, sideB };
