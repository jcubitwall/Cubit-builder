/* Cubit Builder — build.js : the blueprint builder. One big view for building homes, made for the iPad.

   It opens as a flat plan, straight down. Gestures (the way Shapr3D works):
     · drag a pod (or deck) with one finger to move it; it snaps to the nearest spot where it docks properly
     · two fingers on a pod and twist: it turns 90° (each quarter turn of your fingers)
     · one finger on empty space: the plan tilts up into 3D (orbit); two fingers pan, pinch zooms
     · double-tap: back down to the flat plan
     · tap a wall, a floor, a ceiling, a window or a door: its options come up. Turn the home right over to reach
       the underside of the floor.
   The tray along the bottom holds the pods and decks to drag in (blank 8′, 16′, 24′ pods, the pod library, decks);
   while dragging one in, tap anywhere with another finger to turn it. */
import { MODELS, PODLIB, DECKLIB, podById } from './data.js';
import { state, save } from './state.js';
import { canSave } from './role.js';
import { podList } from './layout.js';
import { camera, controls, renderer, homeGroup, pickables, buildHome, highlight } from './scene3d.js';
import { addPod, movePod, rotatePod, addDeck, moveDeck, dockSpots, deckSpots, foot, deckFoot } from './pods.js';
import { renderModels, renderSide, toast } from './sidebar.js';
import { deckName } from './deckframe.js';

const stage=document.getElementById('stage'), cv=renderer.domElement;
const FLAT=0.06;                          // radians from straight down that still count as the flat plan
const isFlat = () => controls.getPolarAngle() < FLAT;

/* ---------------------------------------------------------------- flat plan ⇄ 3D */
let anim=null;
function homeBox(){ const B=new THREE.Box3(); pickables.forEach(m=>{ if(shown(m)) B.expandByObject(m); }); return B.isEmpty() ? null : B; }   // the home itself (not the north arrow, the grid…)
function flatten(fit=false){
  const t=controls.target.clone(), off=camera.position.clone().sub(t), az=Math.atan2(off.x, off.z);
  let dist=off.length();
  if(fit){ const B=homeBox(); if(B){ const s=B.getSize(new THREE.Vector3()), asp=Math.max(0.5, cv.clientWidth/Math.max(1,cv.clientHeight));
    const span=Math.max(s.z, s.x/asp)+8;   /* what has to fit top to bottom on screen (x across, z up the screen) */ dist=span/2/Math.tan(camera.fov*Math.PI/360)*1.05; const c=B.getCenter(new THREE.Vector3()); t.set(c.x,0,c.z); } }
  const end=new THREE.Vector3(t.x+Math.sin(az)*dist*0.01, t.y+dist, t.z+Math.cos(az)*dist*0.01);
  const p0=camera.position.clone(), t0=controls.target.clone(), T=performance.now();
  cancelAnimationFrame(anim); controls.enableDamping=false;          // no drift left over from the last orbit
  const step=()=>{ const k=Math.min(1,(performance.now()-T)/320), e=k*k*(3-2*k);
    camera.position.lerpVectors(p0,end,e); controls.target.lerpVectors(t0,t,e); controls.update();
    if(k<1) anim=requestAnimationFrame(step); else { controls.enableDamping=true; badge(); } };
  step();
}
const flatBadge=document.createElement('div'); flatBadge.className='flat-badge'; stage.appendChild(flatBadge);
function badge(){ const f=isFlat(); flatBadge.textContent = f ? 'PLAN · drag a pod to move it · drag empty space to tilt into 3D' : '3D · double-tap to go back to the plan'; flatBadge.classList.toggle('three', !f); }
setInterval(()=>{ if(state.view==='studio') badge(); }, 300);

/* ---------------------------------------------------------------- picking */
const ray=new THREE.Raycaster(), ndc=new THREE.Vector2();
const shown = o => { for(; o; o=o.parent) if(!o.visible) return false; return true; };
function hitAt(x,y){
  const r=cv.getBoundingClientRect(); ndc.set(((x-r.left)/r.width)*2-1, -((y-r.top)/r.height)*2+1); ray.setFromCamera(ndc,camera);
  return ray.intersectObjects(pickables,false).find(h=>shown(h.object));
}
/* the plan point (feet, in the home's own frame) under the finger, on the floor */
function planAt(x,y){
  const r=cv.getBoundingClientRect(); ndc.set(((x-r.left)/r.width)*2-1, -((y-r.top)/r.height)*2+1); ray.setFromCamera(ndc,camera);
  const p=new THREE.Vector3(); if(!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0), p)) return null;
  return homeGroup.worldToLocal(p);
}
/* which pod / deck a picked part belongs to */
function ownerOf(hit){
  const id=hit?.object?.userData?.slotId; if(!id) return null;
  if(String(id).startsWith('deck:')) return {deck:true, i:+id.slice(5)};
  const i=parseInt(id,10); return Number.isFinite(i) ? {deck:false, i} : null;
}

/* ---------------------------------------------------------------- the ghost (where it will land) */
let ghost=null;
function showGhost(f, ok){
  if(!ghost){ ghost=new THREE.Mesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshBasicMaterial({color:0x2e9e5b, transparent:true, opacity:0.35, depthTest:false}));
    ghost.renderOrder=20; const e=new THREE.LineSegments(new THREE.EdgesGeometry(ghost.geometry), new THREE.LineBasicMaterial({color:0x1c211e, depthTest:false})); e.renderOrder=21; ghost.add(e); homeGroup.add(ghost); }
  if(ghost.parent!==homeGroup) homeGroup.add(ghost);
  ghost.visible=true; ghost.scale.set(f.w, 0.4, f.d); ghost.position.set(f.x+f.w/2, 0.2, f.z+f.d/2);
  ghost.material.color.set(ok?0x2e9e5b:0xc0392b);
}
const hideGhost=()=>{ if(ghost) ghost.visible=false; };

/* ---------------------------------------------------------------- moving, turning and adding */
let tilt=null;        // a drag on empty space in the flat plan, deciding which way it tilts
let D=null;           // the drag in progress: {mode:'move'|'new', deck, i, item, rot, spots, grab, at, ok, f}
const pointers=new Map();
const editable = () => canSave();
function footOf(d){ return d.deck ? deckFoot({lib:d.lib, x:0, z:0, rot:d.rot}) : foot({t:d.t, x:0, z:0, rot:d.rot}); }
function spots(d){ if(!d.spots) d.spots = d.deck ? deckSpots(d.lib, d.rot, d.mode==='move'?d.i:-1) : dockSpots(d.item, d.rot, d.mode==='move'?d.i:-1); return d.spots; }
function track(d, x, y){
  const at=planAt(x,y); if(!at) return;
  const f=footOf(d);
  let gx, gz;
  if(d.mode==='move'){ gx=d.grab.x0+(at.x-d.grab.x); gz=d.grab.z0+(at.z-d.grab.z); } else { gx=at.x-f.w/2; gz=at.z-f.d/2; }
  let best=null, bd=1e9; spots(d).forEach(s=>{ const q=Math.hypot(s.x-gx,s.z-gz); if(q<bd){ bd=q; best=s; } });
  d.ok = !!best && bd<=12; d.at = d.ok ? {x:best.x, z:best.z} : {x:Math.round(gx/8)*8, z:Math.round(gz/8)*8};
  showGhost({...f, x:d.at.x, z:d.at.z}, d.ok);
}
function after(why, msg){
  if(why){ toast(why); return; }
  renderModels(); buildHome(); renderSide();
  toast(msg + (MODELS[state.model].project ? ' · save the project to keep it' : ''));
}
function turn(d, dir){
  if(d.mode==='new'){ d.rot=((d.rot||0)+(dir>0?90:270))%360; d.spots=null; if(d.lastXY) track(d, ...d.lastXY); return; }
  // a pod already placed: a quarter turn where it stands (or as near as it fits)
  let why='';
  if(d.deck){ const q=MODELS[state.model].decks[d.i]; why=moveDeck(d.i, q.x, q.z, ((q.rot||0)+(dir>0?90:270))%360); }
  else for(let k=0;k<(dir>0?1:3);k++){ why=rotatePod(d.i); if(why) break; }
  after(why, 'Turned 90°');
}

/* pointer down on the plan: a pod / deck under one finger in the flat plan starts a move (instead of orbiting) */
stage.addEventListener('pointerdown', e=>{
  if(e.target!==cv || state.view!=='studio') return;
  pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if(D && D.mode==='new'){ turn(D, 1); return; }                       // another finger while dragging one in: turn it
  if(pointers.size===1){
    const o0 = isFlat() ? ownerOf(hitAt(e.clientX,e.clientY)) : null;
    // empty space in the flat plan: a drag up OR down tilts it into 3D (OrbitControls alone only tilts on an upward drag)
    if(isFlat() && !(o0 && editable())){ tilt={y:e.clientY, decided:false}; return; }
    if(!isFlat() || !editable()) return;
    const o=o0; if(!o) return;
    controls.enabled=false;
    const at=planAt(e.clientX,e.clientY), m=MODELS[state.model];
    if(o.deck){ const q=m.decks[o.i]; D={mode:'move', deck:true, i:o.i, lib:q.lib, rot:q.rot||0, grab:{x:at.x, z:at.z, x0:q.x, z0:q.z}, sx:e.clientX, sy:e.clientY, started:false}; }
    else { const p=podList(state.model)[o.i], raw=m.pods[o.i]; D={mode:'move', deck:false, i:o.i, item:{t:raw.t}, t:raw.t, rot:raw.rot||0, grab:{x:at.x, z:at.z, x0:raw.x, z0:raw.z}, sx:e.clientX, sy:e.clientY, started:false}; }
  } else if(pointers.size===2 && D && D.mode==='move'){
    // two fingers on a pod: twist to turn it
    const [a,b]=[...pointers.values()]; D.twist={a0:Math.atan2(b.y-a.y, b.x-a.x), acc:0}; hideGhost(); D.started=false;
  }
}, true);
window.addEventListener('pointermove', e=>{
  if(tilt && !tilt.decided && pointers.size===1){ const dy=e.clientY-tilt.y; if(Math.abs(dy)>2){ controls.rotateSpeed = dy>0 ? -1 : 1; tilt.decided=true; } }
}, true);
window.addEventListener('pointermove', e=>{
  if(!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if(!D) return;
  if(D.twist && pointers.size>=2){
    const [a,b]=[...pointers.values()], ang=Math.atan2(b.y-a.y, b.x-a.x); let d=ang-D.twist.a0; if(d>Math.PI) d-=2*Math.PI; if(d<-Math.PI) d+=2*Math.PI;
    // a quarter turn of the fingers = a quarter turn of the pod (it turns half way through, at 45°, 135°…)
    if(Math.abs(d)>=Math.PI/4){ const sg=d>0?1:-1; turn(D, sg); D.twist.a0+=sg*Math.PI/2; }
    return;
  }
  if(D.mode==='move'){
    if(!D.started){ if(Math.hypot(e.clientX-D.sx, e.clientY-D.sy)<8) return; D.started=true; document.body.classList.add('dragging'); }
    D.lastXY=[e.clientX,e.clientY]; track(D, e.clientX, e.clientY);
  }
});
function release(e){
  pointers.delete(e.pointerId);
  if(!pointers.size && tilt){ tilt=null; controls.rotateSpeed=1; }
  if(!D || D.mode!=='move') { if(!pointers.size) controls.enabled=true; return; }
  if(pointers.size) return;                                             // wait for the last finger
  const d=D; D=null; hideGhost(); document.body.classList.remove('dragging'); controls.enabled=true;
  if(d.twist || !d.started) return;                                     // a twist, or a tap (the tap picks it, in scene3d)
  if(!d.ok){ toast(d.deck ? 'A deck docks with its ledger against a pod or another deck, in 8′ steps.' : 'Pods dock flush end to end or side by side in 8′ steps, sharing at least 8′ of wall.'); return; }
  const m=MODELS[state.model], q=d.deck ? m.decks[d.i] : m.pods[d.i];
  if(q.x===d.at.x && q.z===d.at.z) return;
  after(d.deck ? moveDeck(d.i, d.at.x, d.at.z, d.rot) : movePod(d.i, d.at.x, d.at.z, d.rot), d.deck ? 'Deck moved' : 'Pod moved');
}
window.addEventListener('pointerup', release); window.addEventListener('pointercancel', release);

/* ---------------------------------------------------------------- double-tap: back to the flat plan */
let lastTap=null;
stage.addEventListener('pointerup', e=>{
  if(e.target!==cv) return;
  const now=performance.now(), near=lastTap && now-lastTap.t<450 && Math.hypot(e.clientX-lastTap.x, e.clientY-lastTap.y)<30;
  lastTap = near ? null : {t:now, x:e.clientX, y:e.clientY};
  if(near && !isFlat()){ e.stopImmediatePropagation(); flatten(); }
}, true);

/* ---------------------------------------------------------------- the tray: pods and decks to drag in */
const tray=document.createElement('div'); tray.className='build-tray edit-only'; tray.setAttribute('aria-label','Pods and decks to drag in');
stage.appendChild(tray);
const podMini = len => `<svg viewBox="0 0 ${len+2} 10" aria-hidden="true"><rect x="1" y="1" width="${len}" height="8" rx="1" fill="#efe9da" stroke="#1c211e" stroke-width=".6"/>${[...Array(len/8-1)].map((_,k)=>`<line x1="${1+(k+1)*8}" y1="1" x2="${1+(k+1)*8}" y2="9" stroke="#1c211e" stroke-width=".3" stroke-dasharray="1 1"/>`).join('')}</svg>`;
function renderTray(){
  const lib=PODLIB.filter(p=>!p.deleted).sort((a,b)=>b.len-a.len || a.name.localeCompare(b.name));
  const dk=DECKLIB.filter(d=>!d.deleted);
  tray.innerHTML = `<div class="tray-h">Drag in</div>
    ${[['L24',24],['P16',16],['P8',8]].map(([t,len])=>`<button class="tray-it" data-t="${t}">${podMini(len)}<b>${len}′ pod</b><small>blank</small></button>`).join('')}
    ${lib.map(L=>{ const parts=L.name.replace(/^\d+′ pod · /,'').split(' · '), last=parts.length>1?parts.pop():''; return `<button class="tray-it" data-lib="${L.id}" title="${L.name.replace(/"/g,'&quot;')}">${podMini(L.len)}<b>${last||parts.join(' · ')}</b><small>${L.len}′ · ${last?parts.join(' · '):'library'}</small></button>`; }).join('')}
    ${dk.map(L=>`<button class="tray-it deck" data-deck="${L.id}"><svg viewBox="0 0 22 12" aria-hidden="true"><rect x="1" y="1" width="20" height="10" fill="#d9c49b" stroke="#6b5530" stroke-width=".6"/><line x1="1" y1="1" x2="21" y2="1" stroke="#3b2a12" stroke-width="1.4"/></svg><b>${deckName(L)}</b><small>deck</small></button>`).join('')}`;
}
tray.addEventListener('pointerdown', e=>{
  const b=e.target.closest('.tray-it'); if(!b || !editable()) return;
  const sx=e.clientX, sy=e.clientY, id=e.pointerId;
  const item = b.dataset.deck ? null : b.dataset.lib ? {lib:b.dataset.lib} : {t:b.dataset.t};
  const t = item ? (item.lib ? podById(item.lib).t : item.t) : null;
  const mv=ev=>{ if(ev.pointerId!==id) return;
    if(!D){ if(Math.abs(ev.clientY-sy) < 14 || Math.abs(ev.clientY-sy) < Math.abs(ev.clientX-sx)) return;   // sideways: the tray scrolls
      D = b.dataset.deck ? {mode:'new', deck:true, lib:b.dataset.deck, rot:0} : {mode:'new', deck:false, item, t, rot:0};
      document.body.classList.add('dragging'); controls.enabled=false; }
    D.lastXY=[ev.clientX, ev.clientY];
    const r=cv.getBoundingClientRect(), over = ev.clientX>r.left && ev.clientX<r.right && ev.clientY>r.top && ev.clientY<r.bottom && !tray.contains(document.elementFromPoint(ev.clientX, ev.clientY));
    if(over) track(D, ev.clientX, ev.clientY); else { hideGhost(); D.ok=false; } };
  const up=ev=>{ if(ev.pointerId!==id) return; window.removeEventListener('pointermove',mv); window.removeEventListener('pointerup',up); window.removeEventListener('pointercancel',up);
    const d=D; D=null; hideGhost(); document.body.classList.remove('dragging'); controls.enabled=true;
    if(!d){ return; }
    if(!d.ok){ toast('Drop it next to the home, where it docks flush in 8′ steps.'); return; }
    after(d.deck ? addDeck(d.lib, d.at.x, d.at.z, d.rot) : addPod(d.item, d.at.x, d.at.z, d.rot), d.deck ? 'Deck added' : 'Pod added'); };
  window.addEventListener('pointermove',mv); window.addEventListener('pointerup',up); window.addEventListener('pointercancel',up);
});
/* a tap on a tray item: add it at the first spot it fits */
tray.addEventListener('click', e=>{
  const b=e.target.closest('.tray-it'); if(!b || !editable()) return;
  if(b.dataset.deck){ const s=deckSpots(b.dataset.deck,0)[0]; if(!s){ toast('No place for this deck yet.'); return; } after(addDeck(b.dataset.deck, s.x, s.z, 0), 'Deck added'); return; }
  const item = b.dataset.lib ? {lib:b.dataset.lib} : {t:b.dataset.t};
  const s=dockSpots(item, 0)[0]; if(!s){ toast('No place for this pod yet.'); return; } after(addPod(item, s.x, s.z, 0), 'Pod added');
});

/* ---------------------------------------------------------------- start: the flat plan */
function startBuild(){ renderTray(); setTimeout(()=>{ flatten(true); badge(); }, 60); }
export { startBuild, flatten, isFlat, renderTray };
