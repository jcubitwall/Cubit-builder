/* Cubit Builder — planner.js : the plan editor. A top view of the home on the 8′ grid with a palette of
   pods (blank 8′/16′/24′ pods and the pod library). Drag a pod in, drag pods around, turn them in 90°
   steps, replace or remove them. Every drop snaps to the nearest spot where the pod docks properly. */
import { POD, DECK } from './config.js';
import { deckMembers, joistCentres, deckName, deckSizes } from './deckframe.js';
import { fin } from './format.js';
import { MODELS, PODLIB, DECKLIB, byId, podById, deckById } from './data.js';
import { slotsFor, podList, deckList } from './layout.js';
import { state, save, pickFor } from './state.js';
import { getBearing, setBearing, northVec, fmtBearing } from './orient.js';
import { setDeckFoundation, deckFoot, addDeck, moveDeck, removeDeck, replaceDeck, deckSpots, turnDeck, foot, addPod, movePod, rotatePod, replacePod, deletePod, dockSpots, saveToLibraries, countsText, renameLibPod, deleteLibPod } from './pods.js';
import { buildHome } from './scene3d.js';
import { renderModels, renderSide, toast } from './sidebar.js';

const el = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const OPC = { door:'#6b4a2f', patio:'#6b4a2f', window:'#2f6db5', opening:'#8a7a5c', vent:'#999' };
let sel = null;          // selected pod index
let selDeck = null;      // selected deck index
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

/* a deck frame drawn in plan feet; pt(u,v) maps the deck's own inches (u along the ledger, v outward) */
function deckPt(d, L, u, v){
  const W=L.W, D=L.D, r=d.rot||0;
  const [a,b] = r===0 ? [u,v] : r===90 ? [D-v,u] : r===180 ? [W-u,D-v] : [v,W-u];
  return [d.x+a/12, d.z+b/12];
}
function deckSVG(d, L, cls=''){
  const W=L.W, D=L.D, n=DECK.notch;
  const P=(u,v)=>deckPt(d,L,u,v).map(c=>c.toFixed(3)).join(',');
  const poly=(pts,attr)=>`<polygon points="${pts.map(([u,v])=>P(u,v)).join(' ')}" ${attr}/>`;
  let g=poly([[0,0],[W,0],[W,D],[0,D]], `class="deck-r ${cls}"`);
  deckMembers(L).forEach(([nm,u0,u1,v0,v1])=>{ g+=poly([[u0,v0],[u1,v0],[u1,v1],[u0,v1]],'class="deck-j"'); });
  [[0,0],[1,0],[0,1],[1,1]].forEach(([cu,cv])=>{ const u0=cu?W-n:0, v0=cv?D-n:0; g+=poly([[u0,v0],[u0+n,v0],[u0+n,v0+n],[u0,v0+n]],'class="deck-n"'); });
  // ledger edge: the side that docks
  const [lx0,lz0]=deckPt(d,L,0,0), [lx1,lz1]=deckPt(d,L,W,0);
  g+=`<line x1="${lx0}" y1="${lz0}" x2="${lx1}" y2="${lz1}" class="deck-l"/>`;
  return g;
}
function deckThumb(L){
  const s=6, w=L.W/12, d=L.D/12;
  return `<svg viewBox="-0.6 -0.6 ${w+1.2} ${d+1.2}" width="${(w+1.2)*s}" height="${(d+1.2)*s}" aria-hidden="true">${deckSVG({x:0,z:0,rot:0},L)}</svg>`;
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
      <div class="pal-h">Deck library · ${DECKLIB.length}</div>
      ${DECKLIB.length?'':'<p class="note">Empty. Import a STEP file with a porch or deck frame.</p>'}
      ${(()=>{ const used=new Set((MODELS[state.model].decks||[]).map(d=>d.lib));
        // the size this home already uses comes first: keep every deck the same size where you can
        return DECKLIB.slice().sort((a,b)=>(used.has(b.id)-used.has(a.id))||a.id.localeCompare(b.id)).map(L=>`<div class="pod-item" data-deck="${esc(L.id)}" tabindex="0" role="button" aria-label="${esc(deckName(L))}">${deckThumb(L)}<div><b>${esc(deckName(L))}</b><code>${esc(L.id)}${used.has(L.id)?' · <b>on this home</b>':''}</code></div></div>`).join(''); })()}
    </div>`;
  el('palette').querySelectorAll('.pod-item').forEach(n=>{
    n.addEventListener('pointerdown', e=>{
      if(e.target.closest('button')) return;
      if(e.pointerType!=='touch'){ e.preventDefault(); startDrag({kind:'new', item: itemOf(n), rot:0}, e); return; }
      // touch: swipe sideways (towards the plan) to drag; up and down scrolls the list
      const sx=e.clientX, sy=e.clientY;
      const mv=ev=>{ const dx=ev.clientX-sx, dy=ev.clientY-sy;
        if(Math.abs(dy)>10 && Math.abs(dy)>Math.abs(dx)){ off(); return; }
        if(Math.abs(dx)>10){ off(); startDrag({kind:'new', item: itemOf(n), rot:0}, ev); onMove(ev); } };
      const off=()=>{ n.removeEventListener('pointermove',mv); n.removeEventListener('pointerup',off); n.removeEventListener('pointercancel',off); };
      n.addEventListener('pointermove',mv); n.addEventListener('pointerup',off); n.addEventListener('pointercancel',off);
    });
    n.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); quickAdd(itemOf(n)); } });
  });
  el('palette').querySelectorAll('[data-ren]').forEach(b=>b.onclick=()=>{ const L=podById(b.dataset.ren); const nm=prompt('Name for this pod', L.name); if(nm){ renameLibPod(L.id, nm.trim()); renderPalette(); } });
  el('palette').querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{ if(b.dataset.sure!=='1'){ b.dataset.sure='1'; b.textContent='Tap again'; return; } deleteLibPod(b.dataset.del); renderPalette(); });
}
const itemOf = n => n.dataset.deck ? {deck:n.dataset.deck} : n.dataset.lib ? {lib:n.dataset.lib} : {t:n.dataset.t};
/* keyboard / tap: drop at the first good spot */
function quickAdd(item){
  if(item.deck){ for(const r of [0,90,180,270]){ const sp=deckSpots(item.deck,r); if(sp.length){ done(addDeck(item.deck, sp[0].x, sp[0].z, r), 'Deck added'); return; } } toast('No free spot for that deck.'); return; }
  const spots=dockSpots(item,0); if(!spots.length){ toast('No free spot for that pod.'); return; }
  done(addPod(item, spots[0].x, spots[0].z, 0), 'Pod added');
}

/* ---------------------------------------------------------------- plan view: pan, zoom, north
   The view is a viewBox in plan feet that stays where you put it: drag empty space (or two fingers) to
   pan, wheel / pinch / the + − buttons to zoom, Fit to frame the home. With "North up" the whole plan is
   turned so north points up the screen; drag and drop keeps working because pointer positions are read
   through the turned group. */
let VIEW=null, viewKey=null;
function homeBox(){
  const F=podList(state.model).map(p=>[p.x,p.z,p.x+p.w,p.z+p.d]).concat(deckList(state.model).map(d=>[d.x,d.z,d.x1,d.z1]));
  return { x0:Math.min(...F.map(f=>f[0])), z0:Math.min(...F.map(f=>f[1])), x1:Math.max(...F.map(f=>f[2])), z1:Math.max(...F.map(f=>f[3])) };
}
const turn = () => state.northUp ? getBearing() : 0;       // degrees the drawing is turned on screen (clockwise), so north points up
function fitView(){
  const B=homeBox(), cx=(B.x0+B.x1)/2, cz=(B.z0+B.z1)/2, t=turn()*Math.PI/180;
  // size of the home once turned
  const hw=(B.x1-B.x0)/2, hd=(B.z1-B.z0)/2, w=Math.abs(hw*Math.cos(t))+Math.abs(hd*Math.sin(t)), d=Math.abs(hw*Math.sin(t))+Math.abs(hd*Math.cos(t));
  const r=el('plan').getBoundingClientRect(), asp=(r.width||800)/(r.height||500);
  let vw=2*w+20, vh=2*d+20; if(vw/vh<asp) vw=vh*asp; else vh=vw/asp;
  VIEW={x:cx-vw/2, z:cz-vh/2, w:vw, h:vh}; viewKey=state.model;
}
function zoomAt(f, px, pz){   // f < 1 zooms in, around a viewBox point
  const w=Math.min(400, Math.max(6, VIEW.w*f)), k=w/VIEW.w;
  VIEW={x:px-(px-VIEW.x)*k, z:pz-(pz-VIEW.z)*k, w, h:VIEW.h*k};
}
const toView = e => { const svg=el('plan'), pt=svg.createSVGPoint(); pt.x=e.clientX; pt.y=e.clientY; const q=pt.matrixTransform(svg.getScreenCTM().inverse()); return {x:q.x, z:q.y}; };
function renderPlan(){
  const m=MODELS[state.model], pods=podList(state.model), slots=slotsFor(state.model);
  const decks=deckList(state.model);
  if(!VIEW || viewKey!==state.model) fitView();
  const cx=VIEW.x+VIEW.w/2, cz=VIEW.z+VIEW.h/2, R=Math.hypot(VIEW.w,VIEW.h)/2+16;
  const B=homeBox(), hx=(B.x0+B.x1)/2, hz=(B.z0+B.z1)/2;
  let g=`<rect x="${VIEW.x-500}" y="${VIEW.z-500}" width="${VIEW.w+1000}" height="${VIEW.h+1000}" fill="var(--stage)"/>`;
  g+=`<g id="planG" transform="rotate(${turn()} ${hx} ${hz})">`;
  // 8′ grid wide enough to cover the view whichever way it is turned
  const gx0=Math.floor((cx-R)/8)*8, gx1=Math.ceil((cx+R)/8)*8, gz0=Math.floor((cz-R)/8)*8, gz1=Math.ceil((cz+R)/8)*8;
  for(let x=gx0;x<=gx1;x+=8) g+=`<line x1="${x}" y1="${gz0}" x2="${x}" y2="${gz1}" class="grid8"/>`;
  for(let z=gz0;z<=gz1;z+=8) g+=`<line x1="${gx0}" y1="${z}" x2="${gx1}" y2="${z}" class="grid8"/>`;
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
  decks.forEach(d=>{
    const moving = drag && drag.kind==='moveDeck' && drag.started && drag.k===d.k;
    g+=`<g class="deck${selDeck===d.k?' sel':''}${moving?' moving':''}" data-k="${d.k}">${deckSVG(d, d.L)}`;
    g+=`<text x="${d.x+d.w/2}" y="${d.z+d.d/2+0.35}" class="deck-t">Deck ${d.k+1} · ${d.L.w}′×${d.L.d}′${d.found==='pads'?' · on pads':''}</text></g>`;
  });
  if(drag && drag.started && drag.ghost){
    const G=drag.ghost;
    g+=`<rect x="${G.x}" y="${G.z}" width="${G.w}" height="${G.d}" class="ghost ${drag.ok?'ok':'bad'}"/>`;
    g+=`<text x="${G.x+G.w/2}" y="${G.z+G.d/2+0.4}" class="ghost-t">${drag.ok?'drop here':'no dock'} · R to turn</text>`;
  }
  g+='</g>';
  const svg=el('plan');
  svg.setAttribute('viewBox', `${VIEW.x} ${VIEW.z} ${VIEW.w} ${VIEW.h}`);
  svg.innerHTML=g;
  drawCompass();
  svg.querySelectorAll('.pod').forEach(n=>n.addEventListener('pointerdown', e=>{
    if(e.button>0 || pinch) return;
    const i=+n.dataset.i; e.preventDefault(); e.stopPropagation();
    sel=i; const p=podList(state.model)[i];
    selDeck=null; startDrag({kind:'move', i, item:{t:p.t}, rot:p.rot}, e);
    renderSide2();
  }));
  svg.querySelectorAll('.deck').forEach(n=>n.addEventListener('pointerdown', e=>{
    if(e.button>0 || pinch) return;
    const k=+n.dataset.k; e.preventDefault(); e.stopPropagation();
    selDeck=k; sel=null; const d=MODELS[state.model].decks[k];
    startDrag({kind:'moveDeck', k, item:{deck:d.lib}, rot:d.rot||0}, e);
    renderSide2();
  }));
}
/* pointer position in plan feet (through the turned group) */
const toPlan = e => { const G=el('planG')||el('plan'), svg=el('plan'), pt=svg.createSVGPoint(); pt.x=e.clientX; pt.y=e.clientY; const q=pt.matrixTransform(G.getScreenCTM().inverse()); return {x:q.x, z:q.y}; };
const overPlan = e => { const r=el('plan').getBoundingClientRect(); return e.clientX>=r.left && e.clientX<=r.right && e.clientY>=r.top && e.clientY<=r.bottom; };

/* ---- panning and zooming */
const ptrs=new Map(); let pan=null, pinch=null;
el('plan').addEventListener('pointerdown', e=>{
  ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if(ptrs.size===2){   // second finger: cancel any drag and pinch instead
    if(drag){ endDrag(); }
    const [a,b]=[...ptrs.values()];
    pinch={ d:Math.hypot(a.x-b.x,a.y-b.y), mid:{clientX:(a.x+b.x)/2, clientY:(a.y+b.y)/2} };
    pan=null; return;
  }
  if(e.target.closest('.pod')||e.target.closest('.deck')) return;
  pan={ sx:e.clientX, sy:e.clientY, start:toView(e), moved:false, id:e.pointerId };
  el('plan').setPointerCapture?.(e.pointerId);
}, true);
el('plan').addEventListener('pointermove', e=>{
  if(!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if(pinch && ptrs.size>=2){
    const [a,b]=[...ptrs.values()], d=Math.hypot(a.x-b.x,a.y-b.y), mid={clientX:(a.x+b.x)/2, clientY:(a.y+b.y)/2};
    const p0=toView(pinch.mid); zoomAt(pinch.d/Math.max(d,1), p0.x, p0.z);
    renderPlan(); const p1=toView(mid), p0b=toView(pinch.mid);
    VIEW.x += p0b.x - p1.x; VIEW.z += p0b.z - p1.z; renderPlan();
    pinch.d=d; pinch.mid=mid; return;
  }
  if(pan && e.pointerId===pan.id){
    if(!pan.moved && Math.hypot(e.clientX-pan.sx, e.clientY-pan.sy)<4) return;
    pan.moved=true; el('plan').classList.add('panning');
    const now=toView(e); VIEW.x += pan.start.x-now.x; VIEW.z += pan.start.z-now.z; renderPlan();
  }
});
const lift = e => {
  ptrs.delete(e.pointerId);
  if(ptrs.size<2) pinch=null;
  if(pan && e.pointerId===pan.id){
    if(!pan.moved && e.type==='pointerup'){ sel=null; selDeck=null; renderPlan(); renderSide2(); }   // a tap on empty space deselects
    pan=null; el('plan').classList.remove('panning');
  }
};
el('plan').addEventListener('pointerup', lift); el('plan').addEventListener('pointercancel', lift);
el('plan').addEventListener('wheel', e=>{
  e.preventDefault();
  const p=toView(e);
  if(e.ctrlKey || e.metaKey || Math.abs(e.deltaX)<1 && e.deltaMode!==0 || Math.abs(e.deltaX)<1 && Math.abs(e.deltaY)>=40){
    zoomAt(Math.exp(e.deltaY*(e.ctrlKey?0.01:0.0015)), p.x, p.z);      // mouse wheel or trackpad pinch: zoom at the pointer
  } else {
    const k=VIEW.w/el('plan').getBoundingClientRect().width; VIEW.x+=e.deltaX*k; VIEW.z+=e.deltaY*k;   // trackpad two-finger scroll: pan
  }
  renderPlan();
}, {passive:false});

/* ---- view buttons + compass (the home's bearing) */
function drawCompass(){
  const b=getBearing(), n=northVec(), t=turn();
  // north arrow on screen: the plan direction north, turned with the drawing
  const a=Math.atan2(n[0], -n[1])*180/Math.PI + t;
  const box=el('compass'); if(!box) return;
  box.querySelector('.needle').setAttribute('transform', `rotate(${a} 50 50)`);
  box.querySelector('.cb-val').textContent = fmtBearing(b);
  const inp=box.querySelector('#brgIn'); if(document.activeElement!==inp) inp.value=Math.round(b*10)/10;
  el('northUp').setAttribute('aria-pressed', state.northUp);
}
function setHomeBearing(deg){ setBearing(deg); if(state.northUp) fitView(); renderPlan(); buildHome(); }
function bindViewControls(){
  const wrap=document.querySelector('.plan-wrap');
  if(el('planCtl')) return;
  wrap.insertAdjacentHTML('beforeend', `
    <div class="plan-ctl" id="planCtl">
      <button class="fsbtn" id="zIn" title="Zoom in">+</button><button class="fsbtn" id="zOut" title="Zoom out">−</button><button class="fsbtn" id="zFit" title="Fit the home">Fit</button>
      <button class="fsbtn" id="northUp" aria-pressed="false" title="Turn the plan so north points up">North up</button>
    </div>
    <div class="compass" id="compass" aria-label="Home orientation">
      <svg viewBox="0 0 100 100" class="dial" aria-hidden="true">
        <circle cx="50" cy="50" r="46" class="ring"/>
        <g class="needle"><path d="M50 10 L58 50 L50 44 L42 50 Z" class="n"/><path d="M50 90 L58 50 L50 56 L42 50 Z" class="s"/><text x="50" y="8" text-anchor="middle" class="nl">N</text></g>
      </svg>
      <div class="cb">
        <div class="eyebrow">Plan top faces</div>
        <div class="cb-val">0° N</div>
        <label class="cb-in">Bearing <input id="brgIn" type="number" min="0" max="359.9" step="1" inputmode="decimal">°</label>
        <div class="cb-q">${['N','E','S','W'].map((k,i)=>`<button class="fsbtn" data-b="${i*90}">${k}</button>`).join('')}<button class="fsbtn" data-step="-15" title="Turn 15° anticlockwise">↺</button><button class="fsbtn" data-step="15" title="Turn 15° clockwise">↻</button></div>
        <p class="cb-note">Drag the dial to set any angle. Used on the foundation sheet so the screw installers can set the home out the right way round.</p>
      </div>
    </div>`);
  const mid=()=>({x:VIEW.x+VIEW.w/2, z:VIEW.z+VIEW.h/2});
  el('zIn').onclick=()=>{ const c=mid(); zoomAt(0.8,c.x,c.z); renderPlan(); };
  el('zOut').onclick=()=>{ const c=mid(); zoomAt(1.25,c.x,c.z); renderPlan(); };
  el('zFit').onclick=()=>{ fitView(); renderPlan(); };
  el('northUp').onclick=()=>{ state.northUp=!state.northUp; save(); fitView(); renderPlan(); };
  el('brgIn').onchange=e=>{ const v=parseFloat(e.target.value); if(isFinite(v)) setHomeBearing(v); };
  document.querySelectorAll('#compass [data-b]').forEach(bn=>bn.onclick=()=>setHomeBearing(+bn.dataset.b));
  document.querySelectorAll('#compass [data-step]').forEach(bn=>bn.onclick=()=>setHomeBearing(getBearing()+ +bn.dataset.step));
  // drag the dial: the needle follows the pointer, so north is where you point (Shift snaps to 5°)
  const dial=document.querySelector('#compass .dial');
  const fromPointer=e=>{ const r=dial.getBoundingClientRect(), dx=e.clientX-(r.left+r.width/2), dy=e.clientY-(r.top+r.height/2);
    const screenNorth=Math.atan2(dx,-dy)*180/Math.PI;           // where north should point on screen
    // north on screen = (direction of north in plan) + turn;  direction of north in plan = -bearing
    let b=-(screenNorth - turn()); if(e.shiftKey) b=Math.round(b/5)*5; else b=Math.round(b);
    setBearing(b); renderPlan(); };
  dial.addEventListener('pointerdown', e=>{ e.preventDefault(); dial.setPointerCapture(e.pointerId); fromPointer(e);
    const mv=ev=>fromPointer(ev), up=()=>{ dial.removeEventListener('pointermove',mv); dial.removeEventListener('pointerup',up); if(state.northUp) fitView(); renderPlan(); buildHome(); };
    dial.addEventListener('pointermove',mv); dial.addEventListener('pointerup',up); });
}
function startDrag(d, e){
  drag={...d, sx:e.clientX, sy:e.clientY, started:false, spots:null};
  window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp, {once:true});
  window.addEventListener('keydown', onKey);
  if(d.kind==='new'){ drag.started=true; document.body.classList.add('dragging'); }
}
function spotsFor(){
  if(!drag.spots) drag.spots = drag.item.deck ? deckSpots(drag.item.deck, drag.rot||0, drag.kind==='moveDeck'?drag.k:-1)
                                              : dockSpots(drag.item, drag.rot||0, drag.kind==='move'?drag.i:-1);
  return drag.spots;
}
function updateGhost(e){
  const f = drag.item.deck ? deckFoot({lib:drag.item.deck, x:0, z:0, rot:drag.rot||0})
                           : foot({t: drag.item.lib ? podById(drag.item.lib).t : drag.item.t, x:0, z:0, rot:drag.rot||0});
  const at=toPlan(e);
  let gx, gz;
  if(drag.kind==='move'||drag.kind==='moveDeck'){ gx=drag.grab.x0+(at.x-drag.grab.x); gz=drag.grab.z0+(at.z-drag.grab.z); }
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
    const p= drag.kind==='moveDeck' ? MODELS[state.model].decks[drag.k] : podList(state.model)[drag.i], at=toPlan(e);
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
  if(!d.ok || !d.ghost){ renderPlan(); if(d.kind==='new' && overPlan(e)) toast(d.item.deck ? 'A deck docks with its ledger (the dark edge) flush against a pod or another deck, in 8′ steps. Press R to turn it.' : 'Pods dock flush end to end or side by side in 8′ steps, sharing at least 8′ of wall.'); return; }
  const G=d.ghost;
  if(d.item.deck){
    if(d.kind==='new'){ const why=addDeck(d.item.deck, G.x, G.z, d.rot||0); if(!why){ selDeck=MODELS[state.model].decks.length-1; sel=null; } done(why,'Deck added'); }
    else { const q=MODELS[state.model].decks[d.k]; if(q.x===G.x && q.z===G.z && (q.rot||0)===(d.rot||0)){ renderPlan(); return; } done(moveDeck(d.k, G.x, G.z, d.rot||0), 'Deck moved'); }
    return;
  }
  if(d.kind==='new'){ const why=addPod(d.item, G.x, G.z, d.rot||0); if(!why) sel=MODELS[state.model].pods.length-1; done(why, 'Pod added'); }
  else {
    const p=MODELS[state.model].pods[d.i];
    if(p.x===G.x && p.z===G.z && (p.rot||0)===(d.rot||0)){ renderPlan(); return; }
    done(movePod(d.i, G.x, G.z, d.rot||0), 'Pod moved');
  }
}
function done(why, msg){
  if(why){ toast(why); renderPlan(); return; }
  renderModels(); refresh(); toast(msg + (MODELS[state.model].project?' · save the project to keep it':MODELS[state.model].sub?' · save the sub-model to share it':''));
}

/* ---------------------------------------------------------------- side panel */
function renderSide2(){
  const m=MODELS[state.model], pods=podList(state.model), side=el('planSide');
  if(sel!=null && !pods[sel]) sel=null;
  if(selDeck!=null && !(m.decks||[])[selDeck]) selDeck=null;
  if(selDeck!=null){ renderDeckSide(m, side); return; }
  if(sel==null){
    side.innerHTML=`<div class="side-h"><div class="eyebrow">Plan${m.custom?' · your layout':m.project?' · project':m.sub?' · sub-model':''}</div><h2>${esc(m.name)}</h2><p>${pods.length} pods${(m.decks||[]).length?` · ${m.decks.length} deck${m.decks.length>1?'s':''}`:''} · ${esc(m.size||'')}</p></div>
    <div class="side-b">
      <p class="note">Drag a pod from the left onto the plan. It snaps to the nearest spot where it docks: flush end to end, or side by side in 8′ steps. Press <b>R</b> while dragging to turn it 90°. Drag a pod to move it, or click it to turn, replace or remove it.</p>
      <p class="note">The 5/8″ space at every joint is added for you, and where two pods meet each keeps its own 4½″ wall. Changing a wall where two pods join changes the neighbour's wall to the same wall, mirrored.</p>
      <p class="note"><b>Decks</b> come from the deck library. A deck docks with its ledger (the dark edge) against a pod (¾″ off it, room for siding) or straight up to another deck, in 8′ steps. Every deck is framed the same way: double 2×8 all round, 2×8 joists 24″ o.c. from the house, corners notched 1½″ for the angle-iron spine. Its ground screws follow the same rules as the pods'. Keep every deck on a home the same size where you can.</p>
      ${(m.decks||[]).length?`<div class="fld">All decks stand on<div class="seg"><button class="fsbtn" id="allScrews" aria-pressed="${m.decks.every(d=>d.found!=='pads')}">Ground screws</button><button class="fsbtn" id="allPads" aria-pressed="${m.decks.every(d=>d.found==='pads')}">Concrete pads (floating)</button></div></div>`:''}
      ${m.custom||m.project||m.sub?'':'<p class="note">This is a standard model. Your first change makes your own copy, saved in this browser; add it to a model name to share it as a sub-model.</p>'}
      <div class="row edit-only"><button class="btn" id="saveAll">Save these pods to the library</button></div>
      <p class="note edit-only">Saves every pod of this home that isn't in the pod library yet, plus any wall, floor or ceiling that's new (like a mirrored wall). Saving a project does this too.</p>
    </div>`;
    if(el('allScrews')){ el('allScrews').onclick=()=>done(setDeckFoundation('all','screws'),'All decks on ground screws'); el('allPads').onclick=()=>done(setDeckFoundation('all','pads'),'All decks float on concrete pads'); }
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
    <label class="fld edit-only">Name in the pod library<input id="pname" value="${esc(L?.name || `${p.len}′ pod · ${m.name} · Pod ${p.i+1}`)}"></label>
    <div class="row edit-only"><button class="btn ghost" id="savePod">Save this pod to the library</button></div>
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
function renderDeckSide(m, side){
  const d=deckList(state.model)[selDeck], L=d.L;
  const opts=DECKLIB.map(x=>`<option value="${esc(x.id)}" ${x.id===L.id?'selected':''}>${esc(deckName(x))} · ${esc(x.id)}</option>`).join('');
  const sizes=deckSizes(m), jc=joistCentres(L);
  side.innerHTML=`<div class="side-h"><div class="eyebrow">Deck ${d.k+1} · ${L.w}′ × ${L.d}′ · ledger faces ${({0:'up',90:'right',180:'down',270:'left'})[d.rot]}</div><h2>${esc(deckName(L))}</h2><p><code>${esc(L.id)}</code> · ${L.W}″ × ${L.D}″ frame · ¾″ off the house</p></div>
  <div class="side-b">
    <div class="row"><button class="btn" id="dTurn">Turn</button><button class="btn ghost" id="dDel">Remove</button><button class="btn ghost" id="dBack">Done</button></div>
    <div class="fld">Stands on<div class="seg" role="group" aria-label="What this deck stands on"><button class="fsbtn" id="fScrews" aria-pressed="${d.found!=='pads'}">Ground screws</button><button class="fsbtn" id="fPads" aria-pressed="${d.found==='pads'}">Concrete pads (floating)</button></div></div>
    <label class="fld">Replace with<select id="dRep">${opts}</select></label>
    <div class="row"><button class="btn ghost" id="dDoRep">Replace this deck</button></div>
    ${sizes.length>1?`<p class="note" style="color:#b4520f"><b>${sizes.length} deck sizes on this home</b> (${sizes.map(([id,n])=>`${n} × ${esc(deckName(deckById(id)||{w:'?',d:'?'}))}`).join(', ')}). Keep to one size where you can: the same frames and the same screw layout, no mix-ups.</p>`:''}
    <table class="boxes"><tbody>
      <tr><td>Rims</td><td>double 2×8 all round</td></tr>
      <tr><td>Joists</td><td>${jc.length} × 2×8, parallel to the house, 24″ o.c. from the house side (last space ${fin(L.D-2*DECK.ply-(jc[jc.length-1]||2*DECK.ply))})</td></tr>
      <tr><td>Corners</td><td>4 notches ${fin(DECK.notch)} × ${fin(DECK.notch)} for the ${DECK.angle} spine</td></tr>
    </tbody></table>
    <p class="note">Drag the deck to move it; press R while dragging to turn it. The lumber takeoff is with the assembly sheets.</p>
  </div>`;
  el('dTurn').onclick=()=>done(turnDeck(selDeck),'Deck turned');
  el('dDel').onclick=()=>{ const why=removeDeck(selDeck); if(!why) selDeck=null; done(why,'Deck removed'); };
  el('dBack').onclick=()=>{ selDeck=null; renderPlan(); renderSide2(); };
  el('dDoRep').onclick=()=>done(replaceDeck(selDeck, el('dRep').value),'Deck replaced');
  el('fScrews').onclick=()=>{ const k=selDeck; done(setDeckFoundation(k,'screws'),'Deck on ground screws'); selDeck=k; renderSide2(); };
  el('fPads').onclick=()=>{ const k=selDeck; done(setDeckFoundation(k,'pads'),'Deck floats on concrete pads'); selDeck=k; renderSide2(); };
}
function refresh(){ renderPlan(); renderSide2(); buildHome(); renderSide(); }

/* ---------------------------------------------------------------- open / close */
function openPlan(){
  state.view='plan'; el('planner').hidden=false; el('studio').hidden=true; el('sheets').hidden=true; el('studioTools').hidden=true;
  el('bPlan').textContent='Back to 3D'; el('bSheets').textContent='Assembly sheets';
  sel=null; selDeck=null; VIEW=null; bindViewControls(); renderPalette(); renderPlan(); renderSide2();
}
function closePlan(){ el('planner').hidden=true; el('bPlan').textContent='Plan & pods'; }


export { openPlan, closePlan, renderPlan, renderPalette };
