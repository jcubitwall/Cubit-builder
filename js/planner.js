/* Cubit Builder — planner.js : the plan editor. A top view of the home on the 8′ grid with a palette of
   pods (blank 8′/16′/24′ pods and the pod library). Drag a pod in, drag pods around, turn them in 90°
   steps, replace or remove them. Every drop snaps to the nearest spot where the pod docks properly. */
import { POD } from './config.js';
import { MODELS, PODLIB, byId, podById } from './data.js';
import { slotsFor, podList } from './layout.js';
import { state, save, pickFor } from './state.js';
import { foot, addPod, movePod, rotatePod, replacePod, deletePod, dockSpots, saveToLibraries, countsText, renameLibPod, deleteLibPod } from './pods.js';
import { buildHome } from './scene3d.js';
import { renderModels, renderSide, toast } from './sidebar.js';

const el = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const OPC = { door:'#6b4a2f', patio:'#6b4a2f', window:'#2f6db5', opening:'#8a7a5c', vent:'#999' };
let sel = null;          // selected pod index
let drag = null;         // {kind:'new'|'move', item, i, rot, spots, at:{x,z}|null, ok, sx, sy, started}

/* ---------------------------------------------------------------- drawing helpers (plan feet) */
function wallStrip(seg){
  // seg: {p0:[x,z], dir:[dx,dz], n:[nx,nz], len (ft), type, wall}
  const t=(seg.type==='int'?4.5:6.5)/12, [x0,z0]=seg.p0, [dx,dz]=seg.dir, [nx,nz]=seg.n, L=seg.len;
  const P=(a,b)=>`${(x0+dx*a-nx*b).toFixed(3)},${(z0+dz*a-nz*b).toFixed(3)}`;
  let g=`<polygon points="${P(0,0)} ${P(L,0)} ${P(L,t)} ${P(0,t)}" fill="${seg.type==='int'?'#ece0c6':'#c9a46a'}" stroke="#1c211e" stroke-width=".06"/>`;
  const w=seg.wall && byId(seg.wall);
  (w?.openings||[]).forEach(o=>{
    const a=o.x/12, b=(o.x+o.w)/12;
    g+=`<polygon points="${P(a,-0.05)} ${P(b,-0.05)} ${P(b,t+0.05)} ${P(a,t+0.05)}" fill="#fff" stroke="${OPC[o.kind]||'#555'}" stroke-width=".12"/>`;
    if(o.kind==='door'||o.kind==='patio'){ g+=`<line x1="${P(a,t/2).split(',')[0]}" y1="${P(a,t/2).split(',')[1]}" x2="${P(b,t/2).split(',')[0]}" y2="${P(b,t/2).split(',')[1]}" stroke="${OPC[o.kind]}" stroke-width=".18"/>`; }
  });
  return g;
}
/* the walls of a library pod in its own frame (not turned, corner at 0,0) */
function localSegs(L){
  const len=L.len, segs=[];
  const geo={ S:g=>({p0:[len-g.from,0], dir:[-1,0], n:[0,-1]}), N:g=>({p0:[g.from,8], dir:[1,0], n:[0,1]}),
              W:g=>({p0:[0,g.from], dir:[0,1], n:[-1,0]}), E:g=>({p0:[len,8-g.from], dir:[0,-1], n:[1,0]}) };
  Object.entries(L.walls||{}).forEach(([k,list])=>list.forEach(g=>segs.push({...geo[k](g), len:g.len, type:g.type, wall:g.wall})));
  return segs;
}
function podThumb(L){
  const len=L ? L.len : 24, s=6;
  let g=`<svg viewBox="-0.6 -0.6 ${len+1.2} 9.2" width="${(len+1.2)*s}" height="${9.2*s}" aria-hidden="true"><rect width="${len}" height="8" fill="#f6f1e6"/>`;
  if(L && L.walls) localSegs(L).forEach(sg=>g+=wallStrip(sg));
  else g+=`<rect width="${len}" height="8" fill="none" stroke="#c9a46a" stroke-width=".54"/>`;
  return g+'</svg>';
}

/* ---------------------------------------------------------------- palette */
function renderPalette(){
  const blanks=[['L24',24],['P16',16],['P8',8]];
  const lib=PODLIB.slice().sort((a,b)=>b.len-a.len || a.id.localeCompare(b.id));
  el('palette').innerHTML = `<div class="side-h"><div class="eyebrow">Pods · drag onto the plan</div></div>
    <div class="pal">
      <div class="pal-h">Blank pods</div>
      ${blanks.map(([t,len])=>`<div class="pod-item" data-t="${t}" tabindex="0" role="button" aria-label="Blank ${len} foot pod">${podThumb({len})}<div><b>${len}′ pod · blank</b><code>8′ × ${len}′</code></div></div>`).join('')}
      <div class="pal-h">Pod library · ${lib.length}</div>
      ${lib.length?'':'<p class="note">Empty. Import a STEP file, or save the pods of a home.</p>'}
      ${lib.map(L=>`<div class="pod-item" data-lib="${esc(L.id)}" tabindex="0" role="button" aria-label="${esc(L.name)}">${podThumb(L)}<div><b>${esc(L.name)}</b><code>${esc(L.id)}${L.src==='saved'?' · saved here':''}</code>${L.src==='saved'?`<span class="pi-act"><button class="linkbtn" data-ren="${esc(L.id)}">Rename</button> <button class="linkbtn" data-del="${esc(L.id)}">Delete</button></span>`:''}</div></div>`).join('')}
    </div>`;
  el('palette').querySelectorAll('.pod-item').forEach(n=>{
    n.addEventListener('pointerdown', e=>{ if(e.target.closest('button')) return; e.preventDefault();
      startDrag({kind:'new', item: n.dataset.lib ? {lib:n.dataset.lib} : {t:n.dataset.t}, rot:0}, e); });
    n.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); quickAdd(n.dataset.lib ? {lib:n.dataset.lib} : {t:n.dataset.t}); } });
  });
  el('palette').querySelectorAll('[data-ren]').forEach(b=>b.onclick=()=>{ const L=podById(b.dataset.ren); const nm=prompt('Name for this pod', L.name); if(nm){ renameLibPod(L.id, nm.trim()); renderPalette(); } });
  el('palette').querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{ if(b.dataset.sure!=='1'){ b.dataset.sure='1'; b.textContent='Tap again'; return; } deleteLibPod(b.dataset.del); renderPalette(); });
}
/* keyboard / tap: drop at the first good spot */
function quickAdd(item){
  const spots=dockSpots(item,0); if(!spots.length){ toast('No free spot for that pod.'); return; }
  done(addPod(item, spots[0].x, spots[0].z, 0), 'Pod added');
}

/* ---------------------------------------------------------------- plan */
let VB={x:0,z:0,w:40,h:24};
function renderPlan(){
  const m=MODELS[state.model], pods=podList(state.model), slots=slotsFor(state.model);
  const F=pods.map(p=>({x:p.x,z:p.z,w:p.w,d:p.d}));
  const pad=18;
  const minx=Math.min(...F.map(f=>f.x))-pad, minz=Math.min(...F.map(f=>f.z))-pad;
  const maxx=Math.max(...F.map(f=>f.x+f.w))+pad, maxz=Math.max(...F.map(f=>f.z+f.d))+pad;
  if(!drag) VB={x:Math.floor(minx/8)*8, z:Math.floor(minz/8)*8, w:Math.ceil((maxx-Math.floor(minx/8)*8)/8)*8, h:Math.ceil((maxz-Math.floor(minz/8)*8)/8)*8};
  let g=`<rect x="${VB.x}" y="${VB.z}" width="${VB.w}" height="${VB.h}" fill="var(--stage)"/>`;
  for(let x=VB.x;x<=VB.x+VB.w;x+=8) g+=`<line x1="${x}" y1="${VB.z}" x2="${x}" y2="${VB.z+VB.h}" class="grid8"/>`;
  for(let z=VB.z;z<=VB.z+VB.h;z+=8) g+=`<line x1="${VB.x}" y1="${z}" x2="${VB.x+VB.w}" y2="${z}" class="grid8"/>`;
  pods.forEach(p=>{
    const moving = drag && drag.kind==='move' && drag.started && drag.i===p.i;
    g+=`<g class="pod${sel===p.i?' sel':''}${moving?' moving':''}" data-i="${p.i}">`;
    g+=`<rect x="${p.x}" y="${p.z}" width="${p.w}" height="${p.d}" class="pod-r"/>`;
    slots.filter(s=>s.pod.i===p.i).forEach(s=>{
      const w=pickFor(s), dir=[(s.p1n[0]-s.p0n[0])/s.len, (s.p1n[1]-s.p0n[1])/s.len];
      g+=wallStrip({p0:s.p0n, dir, n:s.n, len:s.len, type:s.type, wall:w&&!w.blank?w.id:null});
      // wall letter, just inside the wall at its middle
      const mx=(s.p0n[0]+s.p1n[0])/2 - s.n[0]*1.5, mz=(s.p0n[1]+s.p1n[1])/2 - s.n[1]*1.5;
      g+=`<text x="${mx}" y="${mz+0.42}" class="wl-l${s.letter.startsWith('A')?' a':''}">${s.letter}</text>`;
    });
    const cx=p.x+p.w/2, cz=p.z+p.d/2, vert=!p.alongX;
    const src=p.src || '';
    g+=`<g transform="translate(${cx} ${cz})${vert?' rotate(-90)':''}"><text y="-0.2" class="pod-t">Pod ${p.i+1} · ${p.len}′</text><text y="1.3" class="pod-s">${[src, p.rot?`turned ${p.rot}°`:''].filter(Boolean).map(esc).join(' · ')}</text></g>`;
    g+='</g>';
  });
  if(drag && drag.started && drag.ghost){
    const G=drag.ghost;
    g+=`<rect x="${G.x}" y="${G.z}" width="${G.w}" height="${G.d}" class="ghost ${drag.ok?'ok':'bad'}"/>`;
    g+=`<text x="${G.x+G.w/2}" y="${G.z+G.d/2+0.4}" class="ghost-t">${drag.ok?'drop here':'no dock'} · R to turn</text>`;
  }
  const svg=el('plan');
  svg.setAttribute('viewBox', `${VB.x} ${VB.z} ${VB.w} ${VB.h}`);
  svg.innerHTML=g;
  svg.querySelectorAll('.pod').forEach(n=>n.addEventListener('pointerdown', e=>{
    const i=+n.dataset.i; e.preventDefault(); e.stopPropagation();
    sel=i; const p=podList(state.model)[i];
    startDrag({kind:'move', i, item:{t:p.t}, rot:p.rot}, e);
    renderSide2();
  }));
}
const toPlan = e => { const svg=el('plan'), pt=svg.createSVGPoint(); pt.x=e.clientX; pt.y=e.clientY; const q=pt.matrixTransform(svg.getScreenCTM().inverse()); return {x:q.x, z:q.y}; };
const overPlan = e => { const r=el('plan').getBoundingClientRect(); return e.clientX>=r.left && e.clientX<=r.right && e.clientY>=r.top && e.clientY<=r.bottom; };

function startDrag(d, e){
  drag={...d, sx:e.clientX, sy:e.clientY, started:false, spots:null};
  window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp, {once:true});
  window.addEventListener('keydown', onKey);
  if(d.kind==='new'){ drag.started=true; document.body.classList.add('dragging'); }
}
function spotsFor(){ if(!drag.spots) drag.spots=dockSpots(drag.item, drag.rot||0, drag.kind==='move'?drag.i:-1); return drag.spots; }
function updateGhost(e){
  const t = drag.item.lib ? podById(drag.item.lib).t : drag.item.t;
  const f=foot({t, x:0, z:0, rot:drag.rot||0});
  const at=toPlan(e);
  let gx, gz;
  if(drag.kind==='move'){ gx=drag.grab.x0+(at.x-drag.grab.x); gz=drag.grab.z0+(at.z-drag.grab.z); }
  else { gx=at.x-f.w/2; gz=at.z-f.d/2; }
  // nearest docking spot within 12′
  let best=null, bd=1e9; spotsFor().forEach(s=>{ const dd=Math.hypot(s.x-gx,s.z-gz); if(dd<bd){ bd=dd; best=s; } });
  if(best && bd<=12){ drag.ghost={x:best.x, z:best.z, w:f.w, d:f.d}; drag.ok=true; }
  else { drag.ghost={x:Math.round(gx/8)*8, z:Math.round(gz/8)*8, w:f.w, d:f.d}; drag.ok=false; }
  if(!overPlan(e) && drag.kind==='new'){ drag.ok=false; drag.ghost=null; }
}
function onMove(e){
  if(!drag) return;
  if(!drag.started){
    if(Math.hypot(e.clientX-drag.sx, e.clientY-drag.sy)<6) return;
    const p=podList(state.model)[drag.i], at=toPlan(e);
    drag.started=true; drag.grab={x:at.x, z:at.z, x0:p.x, z0:p.z};
    // grab offset measured from where the pointer went down
    const a0=toPlan({clientX:drag.sx, clientY:drag.sy}); drag.grab.x=a0.x; drag.grab.z=a0.z;
    document.body.classList.add('dragging');
  }
  updateGhost(e); renderPlan();
}
function onKey(e){
  if(!drag || !drag.started) return;
  if(e.key==='r'||e.key==='R'){ e.preventDefault(); drag.rot=((drag.rot||0)+90)%360; drag.spots=null; if(drag.last) updateGhost(drag.last); renderPlan(); }
  if(e.key==='Escape'){ endDrag(); renderPlan(); }
}
window.addEventListener('pointermove', e=>{ if(drag) drag.last=e; });
function endDrag(){ window.removeEventListener('pointermove', onMove); window.removeEventListener('keydown', onKey); document.body.classList.remove('dragging'); drag=null; }
function onUp(e){
  const d=drag; endDrag();
  if(!d) return;
  if(!d.started){ renderPlan(); renderSide2(); return; }      // a plain click selects
  if(!d.ok || !d.ghost){ renderPlan(); if(d.kind==='new' && overPlan(e)) toast('Pods dock flush end to end or side by side in 8′ steps, sharing at least 8′ of wall.'); return; }
  const G=d.ghost;
  if(d.kind==='new'){ const why=addPod(d.item, G.x, G.z, d.rot||0); if(!why) sel=MODELS[state.model].pods.length-1; done(why, 'Pod added'); }
  else {
    const p=MODELS[state.model].pods[d.i];
    if(p.x===G.x && p.z===G.z && (p.rot||0)===(d.rot||0)){ renderPlan(); return; }
    done(movePod(d.i, G.x, G.z, d.rot||0), 'Pod moved');
  }
}
function done(why, msg){
  if(why){ toast(why); renderPlan(); return; }
  renderModels(); refresh(); toast(msg + (MODELS[state.model].project?' · save the project to keep it':''));
}

/* ---------------------------------------------------------------- side panel */
function renderSide2(){
  const m=MODELS[state.model], pods=podList(state.model), side=el('planSide');
  if(sel!=null && !pods[sel]) sel=null;
  if(sel==null){
    side.innerHTML=`<div class="side-h"><div class="eyebrow">Plan${m.custom?' · your layout':m.project?' · project':''}</div><h2>${esc(m.name)}</h2><p>${pods.length} pods · ${esc(m.size||'')}</p></div>
    <div class="side-b">
      <p class="note">Drag a pod from the left onto the plan. It snaps to the nearest spot where it docks: flush end to end, or side by side in 8′ steps. Press <b>R</b> while dragging to turn it 90°. Drag a pod to move it, or click it to turn, replace or remove it.</p>
      <p class="note">The 5/8″ space at every joint is added for you, and where two pods meet each keeps its own 4½″ wall. Changing a wall where two pods join changes the neighbour's wall to the same wall, mirrored.</p>
      ${m.custom||m.project?'':'<p class="note">This is a built-in home. Your first change makes your own copy, saved in this browser.</p>'}
      <div class="row"><button class="btn" id="saveAll">Save these pods to the library</button></div>
      <p class="note">Saves every pod of this home that isn't in the pod library yet, plus any wall, floor or ceiling that's new (like a mirrored wall). Saving a project does this too.</p>
    </div>`;
    el('saveAll').onclick=()=>{ const c=saveToLibraries(m.name); renderPalette(); refresh(); toast(countsText(c)); };
    return;
  }
  const p=pods[sel], L=p.src&&podById(p.src);
  const others=[['L24','24′ pod · blank'],['P16','16′ pod · blank'],['P8','8′ pod · blank']].map(([t,n])=>`<option value="t:${t}">${n}</option>`).join('')
    + PODLIB.map(x=>`<option value="lib:${esc(x.id)}">${esc(x.id)} · ${esc(x.name)}</option>`).join('');
  side.innerHTML=`<div class="side-h"><div class="eyebrow">Pod ${p.i+1} · 8′ × ${p.len}′${p.rot?` · turned ${p.rot}°`:''}</div><h2>${L?esc(L.name):`Pod ${p.i+1}`}</h2><p>${L?`from the pod library · <code>${esc(L.id)}</code>`:'not from the pod library'}</p></div>
  <div class="side-b">
    <div class="row"><button class="btn" id="turn">Turn 90°</button><button class="btn ghost" id="del">Remove</button><button class="btn ghost" id="back">Done</button></div>
    <label class="fld">Replace with<select id="rep">${others}</select></label>
    <div class="row"><button class="btn ghost" id="doRep">Replace this pod</button></div>
    <label class="fld">Name in the pod library<input id="pname" value="${esc(L?.name || `${p.len}′ pod · ${m.name} · Pod ${p.i+1}`)}"></label>
    <div class="row"><button class="btn ghost" id="savePod">Save this pod to the library</button></div>
    <p class="note">The pod keeps its walls, floors and ceilings when you move or turn it. A wall that stops being a joint (or becomes one) changes to a library wall of the right type.</p>
  </div>`;
  el('turn').onclick=()=>done(rotatePod(sel),'Pod turned 90°');
  el('del').onclick=()=>{ const why=deletePod(sel); if(!why) sel=null; done(why,'Pod removed'); };
  el('back').onclick=()=>{ sel=null; renderPlan(); renderSide2(); };
  el('doRep').onclick=()=>{ const v=el('rep').value, item=v.startsWith('lib:')?{lib:v.slice(4)}:{t:v.slice(2)}; done(replacePod(sel,item),'Pod replaced'); };
  el('savePod').onclick=()=>{ const c=saveToLibraries(m.name, sel); const q=MODELS[state.model].pods[sel];
    if(q?.src){ const nm=el('pname').value.trim(); const lp=podById(q.src); if(nm && lp && lp.src==='saved') renameLibPod(q.src, nm); }
    renderPalette(); refresh(); toast(c.pods?countsText(c):(q?.src?`Already in the library as ${q.src}. `+countsText(c):'This pod has walls that aren’t scanned yet, so it can’t go in the library.')); };
}
function refresh(){ renderPlan(); renderSide2(); buildHome(); renderSide(); }

/* ---------------------------------------------------------------- open / close */
function openPlan(){
  state.view='plan'; el('planner').hidden=false; el('studio').hidden=true; el('sheets').hidden=true; el('studioTools').hidden=true;
  el('bPlan').textContent='Back to 3D'; el('bSheets').textContent='Assembly sheets';
  sel=null; renderPalette(); renderPlan(); renderSide2();
}
function closePlan(){ el('planner').hidden=true; el('bPlan').textContent='Plan & pods'; }
el('plan').addEventListener('pointerdown', e=>{ if(e.target.closest('.pod')) return; sel=null; renderPlan(); renderSide2(); });

export { openPlan, closePlan, renderPlan, renderPalette };
