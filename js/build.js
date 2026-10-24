/* Cubit Builder — build.js : the blueprint builder. One big view for building homes, made for the iPad.

   It opens as a flat plan, straight down. Gestures (the way Shapr3D works):
     · drag a pod (or deck) with one finger to move it; it snaps to the nearest spot where it docks properly
     · two fingers on a pod and twist: it turns 90° (each quarter turn of your fingers)
     · one finger on empty space: orbit, as in Shapr3D (you turn the home itself). A drag UP brings the near side up
       into view and keeps going round underneath; a drag DOWN goes back toward the plan. Sideways turns it around.
       Two fingers pan, pinch zooms.
     · double-tap: isolate one level down (the pod, then the part in it); again or on empty space: back up a level
     · tap a wall, a floor, a ceiling, a window or a door: its options come up. Turn the home right over to reach
       the underside of the floor.
   The tray along the bottom holds the pods and decks to drag in (blank 8′, 16′, 24′ pods, the pod library, decks);
   while dragging one in, tap anywhere with another finger to turn it. */
import { MODELS, PODLIB, DECKLIB, podById } from './data.js';
import { state, save } from './state.js';
import { canSave } from './role.js';
import { podList, slotsFor, layerSlotsFor } from './layout.js';
import { setIsolate, setPod, openLayers } from './layers.js';
import { camera, controls, renderer, homeGroup, pickables, buildHome, highlight } from './scene3d.js';
import { addPod, movePod, rotatePod, addDeck, moveDeck, dockSpots, deckSpots, foot, deckFoot } from './pods.js';
import { renderModels, renderSide, toast } from './sidebar.js';
import { deckName } from './deckframe.js';
import { furnMeshes, furnById, snap, addItem, updateItem, refreshItem, applyFurniture, showFurnGhost, hideFurnGhost, turnItem, setHolderVisible } from './furniture.js';
import { CATS, ITEMS, newItem, itemDef, partsOf } from './casework.js';
import { frontSVG } from './casework-svg.js';
import { openCaseLib } from './casework-ui.js';
import { setPanel, panelOpen } from './fullscreen.js';
import { initViewCube, zoomToFace, doUndo, doRedo } from './viewcube.js';
import { onHistory } from './history.js';
import { wallGroups } from './scene3d.js';

const stage=document.getElementById('stage'), cv=renderer.domElement;
const FLAT=0.12;                          // radians from straight down that still count as the flat plan
const isFlat = () => controls.getPolarAngle() < FLAT;

/* ---------------------------------------------------------------- flat plan ⇄ 3D */
let anim=null;
function homeBox(){ const B=new THREE.Box3(); pickables.forEach(m=>{ if(shown(m)) B.expandByObject(m); }); return B.isEmpty() ? null : B; }   // the home itself (not the north arrow, the grid…)
function flatten(fit=false){
  const t=controls.target.clone(), off=camera.position.clone().sub(t), az=Math.atan2(off.x, off.z);
  let dist=off.length();
  if(fit){ const B=homeBox(); if(B){ const s=B.getSize(new THREE.Vector3()), asp=Math.max(0.5, cv.clientWidth/Math.max(1,cv.clientHeight));
    const span=Math.max(s.z, s.x/asp)+8;   /* what has to fit top to bottom on screen (x across, z up the screen) */ dist=span/2/Math.tan(camera.fov*Math.PI/360)*1.05; const c=B.getCenter(new THREE.Vector3()); t.set(c.x,0,c.z); } }
  const end=new THREE.Vector3(t.x+Math.sin(az)*dist*0.0005, t.y+dist, t.z+Math.cos(az)*dist*0.0005);
  const p0=camera.position.clone(), t0=controls.target.clone(), T=performance.now();
  cancelAnimationFrame(anim); controls.enableDamping=false;          // no drift left over from the last orbit
  const step=()=>{ const k=Math.min(1,(performance.now()-T)/320), e=k*k*(3-2*k);
    camera.position.lerpVectors(p0,end,e); controls.target.lerpVectors(t0,t,e); controls.update();
    if(k<1) anim=requestAnimationFrame(step); else { controls.enableDamping=true; badge(); } };
  step();
}
const flatBadge=document.createElement('div'); flatBadge.className='flat-badge'; stage.appendChild(flatBadge);
function badge(){ const f=isFlat(); flatBadge.textContent = f ? 'PLAN · drag a pod or cabinet to move it · drag up on empty space to tilt into 3D' : '3D · double-tap a part to isolate it · drag down for the plan'; flatBadge.classList.toggle('three', !f); }
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
/* cabinets and furniture under the finger, and where one being dragged lands (backed onto the nearest wall) */
function furnAt(x,y){ const r=cv.getBoundingClientRect(); ndc.set(((x-r.left)/r.width)*2-1, -((y-r.top)/r.height)*2+1); ray.setFromCamera(ndc,camera); return ray.intersectObjects(furnMeshes(),false)[0]; }
function trackFurn(d, x, y){
  const at=planAt(x,y); if(!at){ hideFurnGhost(); d.at=null; return; }
  const it={...(d.it||furnById(d.id))};
  const s=snap(it, at, wallGroups, homeGroup, it.a);
  d.at=s; if(s){ if(s.free && d.it?.a!=null) s.a=d.it.a; showFurnGhost(it, s, true); } else hideFurnGhost();
}

/* ---------------------------------------------------------------- moving, turning and adding */
let orbit=null;       // one finger turning the view (ours, so a drag down always tips the home the same way)
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
  if(d.mode==='fmove'){ turnItem(d.id, dir); refreshItem(furnById(d.id)); renderSide(); return; }
  if(d.mode==='fnew'){ d.it.a=(((d.it.a||0)-90*dir)%360+360)%360; if(d.lastXY) trackFurn(d, ...d.lastXY); return; }
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
  if(D && (D.mode==='new'||D.mode==='fnew')){ turn(D, 1); return; }                       // another finger while dragging one in: turn it
  if(pointers.size===1){
    orbit=null; if(D && D.mode==='move') D=null;                        // nothing left over from a gesture that ended oddly
    clearTimeout(press?.timer); press=null;
    // in the flat plan a pod, deck or cabinet moves straight away; anywhere else the finger turns the view
    if(isFlat() && editable()){ const d=grabAt(e.clientX,e.clientY); if(d){ controls.enabled=false; D=d; return; } }
    orbit={x:e.clientX, y:e.clientY};
    // a long touch (held still): on a pod, deck or cabinet it picks it up to move it (in 3D too);
    // on empty space it opens the Layers list
    { const x=e.clientX, y=e.clientY;
      press={x, y, timer:setTimeout(()=>{ if(!press || pointers.size!==1) return; press=null;
        if(!hitAt(x,y) && !furnAt(x,y)){ orbit=null; try{ navigator.vibrate?.(10); }catch(err){} openLayers(true); return; }
        const d=editable() ? grabAt(x,y) : null; if(!d) return;
        orbit=null; controls.enabled=false; D=d; D.started=true; D.lastXY=[x,y]; document.body.classList.add('dragging');
        try{ navigator.vibrate?.(15); }catch(err){}
        if(D.mode==='fmove'){ setHolderVisible(D.id,false); trackFurn(D, x, y); } else track(D, x, y);
        toast(D.mode==='fmove' ? 'Moving the cabinet · lift to drop' : D.deck ? 'Moving the deck · lift to drop' : 'Moving the pod · lift to drop'); }, LONG_PRESS)}; }
  } else if(pointers.size===3){ if(press){ clearTimeout(press.timer); press=null; }   // three fingers: swipe left = undo, right = redo (Shapr3D)
    orbit=null; viewTwist=null; if(D && D.mode!=='new' && D.mode!=='fnew'){ hideGhost(); hideFurnGhost(); if(D.id) setHolderVisible(D.id,true); D=null; document.body.classList.remove('dragging'); }
    controls.enabled=false; three={x0:centroid(), done:false};
  } else if(pointers.size===2 && orbit){ orbit=null; if(press){ clearTimeout(press.timer); press=null; }                     // a second finger: OrbitControls pans and zooms; a twist turns the view
    const [a,b]=[...pointers.values()]; viewTwist={a0:Math.atan2(b.y-a.y, b.x-a.x), acc:0};
  } else if(pointers.size===2 && D && D.mode==='fmove'){
    const [a,b]=[...pointers.values()]; D.twist={a0:Math.atan2(b.y-a.y, b.x-a.x)}; hideFurnGhost(); setHolderVisible(D.id,true); D.started=false;
  } else if(pointers.size===2 && D && D.mode==='move'){
    // two fingers on a pod: twist to turn it
    const [a,b]=[...pointers.values()]; D.twist={a0:Math.atan2(b.y-a.y, b.x-a.x), acc:0}; hideGhost(); D.started=false;
  }
}, true);
let three=null, viewTwist=null, press=null;
const LONG_PRESS=450;   // ms held still (within 10 px) to pick a part up in 3D
/* what's under the finger to move: a cabinet (in front of the wall / floor) or the pod / deck it belongs to */
function grabAt(x,y){
  const fh=furnAt(x,y), ph=hitAt(x,y), glass = ph && /:(ceiling-int|roof)$/.test(ph.object.userData.slotId||'');
  if(fh && (!ph || glass || fh.distance<=ph.distance+0.05)){ const it=furnById(fh.object.userData.furn); if(it) return {mode:'fmove', id:it.id, it, sx:x, sy:y, started:false}; }
  const o=ownerOf(ph); if(!o) return null;
  const at=planAt(x,y), m=MODELS[state.model]; if(!at) return null;
  if(o.deck){ const q=m.decks[o.i]; return {mode:'move', deck:true, i:o.i, lib:q.lib, rot:q.rot||0, grab:{x:at.x, z:at.z, x0:q.x, z0:q.z}, sx:x, sy:y, started:false}; }
  const raw=m.pods[o.i]; return {mode:'move', deck:false, i:o.i, item:{t:raw.t}, t:raw.t, rot:raw.rot||0, grab:{x:at.x, z:at.z, x0:raw.x, z0:raw.z}, sx:x, sy:y, started:false};
}
const centroid=()=>{ const v=[...pointers.values()]; return v.reduce((s,p)=>s+p.x,0)/v.length; };
/* turn the view about the vertical through its centre (two-finger twist on empty space) */
function turnView(rad){ const t=controls.target, o=camera.position.clone().sub(t); o.applyAxisAngle(new THREE.Vector3(0,1,0), rad); camera.position.copy(t).add(o); camera.lookAt(t); controls.update(); }
window.addEventListener('pointermove', e=>{
  if(!pointers.has(e.pointerId)) return;
  if(three && pointers.size===3 && !three.done){ pointers.set(e.pointerId,{x:e.clientX,y:e.clientY}); const dx=centroid()-three.x0;
    if(Math.abs(dx)>70){ three.done=true; dx<0 ? doUndo() : doRedo(); } return; }
  if(viewTwist && pointers.size===2 && !D){ pointers.set(e.pointerId,{x:e.clientX,y:e.clientY}); const [a,b]=[...pointers.values()]; let d=Math.atan2(b.y-a.y,b.x-a.x)-viewTwist.a0;
    if(d>Math.PI) d-=2*Math.PI; if(d<-Math.PI) d+=2*Math.PI;
    if(isFlat()){ if(Math.abs(d)>=Math.PI/4){ const sg=d>0?1:-1; turnView(-sg*Math.PI/2); viewTwist.a0+=sg*Math.PI/2; } }   // plan: quarter turns
    else if(Math.abs(d)>0.02){ turnView(-d); viewTwist.a0+=d; } }                                                         // 3D: follows the fingers
});
const sph=new THREE.Spherical(), off=new THREE.Vector3();
window.addEventListener('pointermove', e=>{
  if(press && Math.hypot(e.clientX-press.x, e.clientY-press.y)>10){ clearTimeout(press.timer); press=null; }
  if(!orbit || pointers.size!==1 || !pointers.has(e.pointerId)) return;
  const dx=e.clientX-orbit.x, dy=e.clientY-orbit.y; orbit.x=e.clientX; orbit.y=e.clientY;
  const h=Math.max(200, cv.clientHeight);
  off.copy(camera.position).sub(controls.target); sph.setFromVector3(off);
  sph.theta -= dx*2*Math.PI/h*0.6; sph.phi = Math.min(Math.PI*0.999, Math.max(0.0001, sph.phi - dy*Math.PI/h));   // Shapr3D: drag up tips the home toward you, down goes back toward the plan
  off.setFromSpherical(sph); camera.position.copy(controls.target).add(off); camera.lookAt(controls.target); controls.update();
});
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
  if(D.mode==='fmove'){
    if(!D.started){ if(Math.hypot(e.clientX-D.sx, e.clientY-D.sy)<8) return; D.started=true; document.body.classList.add('dragging'); setHolderVisible(D.id,false); }
    D.lastXY=[e.clientX,e.clientY]; trackFurn(D, e.clientX, e.clientY); return;
  }
  if(D.mode==='move'){
    if(!D.started){ if(Math.hypot(e.clientX-D.sx, e.clientY-D.sy)<8) return; D.started=true; document.body.classList.add('dragging'); }
    D.lastXY=[e.clientX,e.clientY]; track(D, e.clientX, e.clientY);
  }
});
function release(e){
  pointers.delete(e.pointerId);
  if(press){ clearTimeout(press.timer); press=null; }
  if(!pointers.size){ orbit=null; viewTwist=null; if(three){ three=null; controls.enabled=true; } }
  if(pointers.size<2) viewTwist=null;
  if(D && D.mode==='fmove'){ if(pointers.size) return;
    const d=D; D=null; hideFurnGhost(); setHolderVisible(d.id,true); document.body.classList.remove('dragging'); controls.enabled=true;
    if(d.twist || !d.started || !d.at) return;
    updateItem(d.id, d.at); refreshItem(furnById(d.id)); state.selFurn=d.id; applyFurniture(); renderSide(); return; }
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

/* ---------------------------------------------------------------- double-tap: isolate */
function isoLabel(id){
  if(id.startsWith('furn:')){ const [,fid,part]=id.split(':'); const it=furnById(fid); if(!it) return 'Cabinet';
    return part!=null ? (partsOf(it)[+part]?.name || 'Part') : itemDef(it.k).name; }
  if(id.startsWith('deck:')) return `Deck ${+id.slice(5)+1}`;
  return slotsFor(state.model).find(s=>s.id===id)?.label || layerSlotsFor(state.model).find(s=>s.id===id)?.label || '';
}
let lastTap=null, downXY=null;
stage.addEventListener('pointerdown', e=>{ if(e.target===cv) downXY=[e.clientX,e.clientY,performance.now()]; }, true);
stage.addEventListener('pointerup', e=>{
  if(e.target!==cv) return;
  const clean = downXY && Math.hypot(e.clientX-downXY[0], e.clientY-downXY[1])<12 && performance.now()-downXY[2]<350 && pointers.size<=1;
  if(!clean){ lastTap=null; return; }
  const now=performance.now(), near=lastTap && now-lastTap.t<450 && Math.hypot(e.clientX-lastTap.x, e.clientY-lastTap.y)<40;
  lastTap = near ? null : {t:now, x:e.clientX, y:e.clientY};
  if(!near) return;
  e.cubitFlat=true;                                                    // layers.js leaves Build's double-tap alone
  // double-tap isolates one level down at a time: in a home of several pods, the pod you tapped; in a single pod
  // (or a pod on its own), the part you tapped (a wall, a floor / ceiling / roof, a cabinet). Decks are isolated
  // straight away. Double-tap the isolated part again, or empty space, to go back up one level.
  const fh=furnAt(e.clientX,e.clientY), ph=hitAt(e.clientX,e.clientY);
  const glass = ph && /:(ceiling-int|roof)$/.test(ph.object.userData.slotId||'');   // the see-through ceiling / roof never hides a cabinet
  let id = fh && (!ph || glass || fh.distance<=ph.distance) ? 'furn:'+fh.object.userData.furn : ph?.object?.userData?.slotId;
  // cabinets, the same way: a cabinet on its own, then the part of it you tap (a door, a side, a drawer…)
  if(id && String(state.isolate).startsWith(id) && id.startsWith('furn:') && fh?.object?.userData?.part!=null){ id = `${id}:${fh.object.userData.part}`; }
  const up=()=>{ const s=String(state.isolate||''); if(/^furn:[^:]+:\d+$/.test(s)){ const c=s.replace(/:\d+$/,''); setIsolate(c, isoLabel(c)); } else if(state.isolate) setIsolate(null); else if(state.focusPod!=null) setPod(null); renderSide(); };
  if(!id || id===state.isolate){ up(); return; }
  const deck=String(id).startsWith('deck:');
  const pod = deck ? null : String(id).startsWith('furn:') ? furnById(id.slice(5))?.pod : parseInt(id,10);
  const cab=String(id).startsWith('furn:');   // a cabinet is isolated right away, whatever level you're at
  if(!deck && !cab && !state.isolate && state.focusPod==null && MODELS[state.model].pods.length>1 && Number.isFinite(pod)){ setPod(pod); renderSide(); return; }
  setIsolate(id, isoLabel(id)); renderSide();
}, true);

/* ---------------------------------------------------------------- the tray: pods and decks to drag in */
const tray=document.createElement('div'); tray.className='build-tray edit-only'; tray.setAttribute('aria-label','Pods and decks to drag in');
stage.appendChild(tray);
const podMini = len => `<svg viewBox="0 0 ${len+2} 10" aria-hidden="true"><rect x="1" y="1" width="${len}" height="8" rx="1" fill="#efe9da" stroke="#1c211e" stroke-width=".6"/>${[...Array(len/8-1)].map((_,k)=>`<line x1="${1+(k+1)*8}" y1="1" x2="${1+(k+1)*8}" y2="9" stroke="#1c211e" stroke-width=".3" stroke-dasharray="1 1"/>`).join('')}</svg>`;
let trayTab='pods', trayCat='base';
function renderTray(){
  const tabs=`<div class="tray-tabs" role="tablist"><button role="tab" data-tab="pods" aria-selected="${trayTab==='pods'}">Pods</button><button role="tab" data-tab="cab" aria-selected="${trayTab==='cab'}">Cabinets</button></div>`;
  if(trayTab==='cab'){
    const items=ITEMS.filter(d=>d.cat===trayCat);
    tray.innerHTML = tabs + `<label class="tray-cat"><span>Category</span><select id="trayCat" aria-label="Category">${CATS.map(c=>`<option value="${c.k}" ${c.k===trayCat?'selected':''}>${c.name}</option>`).join('')}</select></label>`
      + items.map(d=>{ const it=newItem(d.k); return `<button class="tray-it cab" data-k="${d.k}" title="${d.name.replace(/"/g,'&quot;')}"><span class="tray-cab">${frontSVG(it,{pad:1})}</span><b>${d.name.replace(/ · .*/,'')}</b><small>${d.name.includes(' · ')?d.name.split(' · ')[1]:`${Math.round(it.w*8)/8}″ wide`}</small></button>`; }).join('')
      + `<button class="tray-it more" data-open="lib"><b>Library…</b><small>sizes, 3D, parts</small></button>`;
    return;
  }
  const lib=PODLIB.filter(p=>!p.deleted).sort((a,b)=>b.len-a.len || a.name.localeCompare(b.name));
  const dk=DECKLIB.filter(d=>!d.deleted);
  tray.innerHTML = tabs + `
    ${[['L24',24],['P16',16],['P8',8]].map(([t,len])=>`<button class="tray-it" data-t="${t}">${podMini(len)}<b>${len}′ pod</b><small>blank</small></button>`).join('')}
    ${lib.map(L=>{ const parts=L.name.replace(/^\d+′ pod · /,'').split(' · '), last=parts.length>1?parts.pop():''; return `<button class="tray-it" data-lib="${L.id}" title="${L.name.replace(/"/g,'&quot;')}">${podMini(L.len)}<b>${last||parts.join(' · ')}</b><small>${L.len}′ · ${last?parts.join(' · '):'library'}</small></button>`; }).join('')}
    ${dk.map(L=>`<button class="tray-it deck" data-deck="${L.id}"><svg viewBox="0 0 22 12" aria-hidden="true"><rect x="1" y="1" width="20" height="10" fill="#d9c49b" stroke="#6b5530" stroke-width=".6"/><line x1="1" y1="1" x2="21" y2="1" stroke="#3b2a12" stroke-width="1.4"/></svg><b>${deckName(L)}</b><small>deck</small></button>`).join('')}`;
}
tray.addEventListener('pointerdown', e=>{
  const b=e.target.closest('.tray-it'); if(!b || !editable() || b.dataset.open) return;
  const sx=e.clientX, sy=e.clientY, id=e.pointerId;
  const cab=b.dataset.k;
  const item = cab||b.dataset.deck ? null : b.dataset.lib ? {lib:b.dataset.lib} : {t:b.dataset.t};
  const t = item ? (item.lib ? podById(item.lib).t : item.t) : null;
  const mv=ev=>{ if(ev.pointerId!==id) return;
    if(!D){ if(Math.abs(ev.clientY-sy) < 14 || Math.abs(ev.clientY-sy) < Math.abs(ev.clientX-sx)) return;   // sideways: the tray scrolls
      D = cab ? {mode:'fnew', it:{...newItem(cab), a:0}} : b.dataset.deck ? {mode:'new', deck:true, lib:b.dataset.deck, rot:0} : {mode:'new', deck:false, item, t, rot:0};
      document.body.classList.add('dragging'); controls.enabled=false; }
    D.lastXY=[ev.clientX, ev.clientY];
    const r=cv.getBoundingClientRect(), over = ev.clientX>r.left && ev.clientX<r.right && ev.clientY>r.top && ev.clientY<r.bottom && !tray.contains(document.elementFromPoint(ev.clientX, ev.clientY));
    if(D.mode==='fnew'){ if(over) trackFurn(D, ev.clientX, ev.clientY); else { hideFurnGhost(); D.at=null; } return; }
    if(over) track(D, ev.clientX, ev.clientY); else { hideGhost(); D.ok=false; } };
  const up=ev=>{ if(ev.pointerId!==id) return; window.removeEventListener('pointermove',mv); window.removeEventListener('pointerup',up); window.removeEventListener('pointercancel',up);
    const d=D; D=null; hideGhost(); hideFurnGhost(); document.body.classList.remove('dragging'); controls.enabled=true;
    if(!d){ return; }
    if(d.mode==='fnew'){ if(!d.at){ toast('Drop it inside a pod. It backs onto the nearest wall.'); return; }
      const f=addItem(d.it.k, {...d.at}); state.selFurn=f.id; state.selected=null; refreshItem(f); highlight(); renderSide(); if(!panelOpen()) setPanel(true); toast(`${itemDef(f.k).name} added`); return; }
    if(!d.ok){ toast('Drop it next to the home, where it docks flush in 8′ steps.'); return; }
    after(d.deck ? addDeck(d.lib, d.at.x, d.at.z, d.rot) : addPod(d.item, d.at.x, d.at.z, d.rot), d.deck ? 'Deck added' : 'Pod added'); };
  window.addEventListener('pointermove',mv); window.addEventListener('pointerup',up); window.addEventListener('pointercancel',up);
});
tray.addEventListener('change', e=>{ if(e.target.id==='trayCat'){ trayCat=e.target.value; renderTray(); tray.scrollLeft=0; } });
/* a tap on a tray item: add it at the first spot it fits (cabinets: against the wall nearest the middle of the first pod) */
tray.addEventListener('click', e=>{
  const tb=e.target.closest('[data-tab]'); if(tb){ trayTab=tb.dataset.tab; renderTray(); return; }
    const b=e.target.closest('.tray-it'); if(!b) return;
  if(b.dataset.open){ openCaseLib({cat:trayCat}); return; }
  if(!editable()) return;
  if(b.dataset.k){ openCaseLib({k:b.dataset.k}); return; }
  if(b.dataset.deck){ const s=deckSpots(b.dataset.deck,0)[0]; if(!s){ toast('No place for this deck yet.'); return; } after(addDeck(b.dataset.deck, s.x, s.z, 0), 'Deck added'); return; }
  const item = b.dataset.lib ? {lib:b.dataset.lib} : {t:b.dataset.t};
  const s=dockSpots(item, 0)[0]; if(!s){ toast('No place for this pod yet.'); return; } after(addPod(item, s.x, s.z, 0), 'Pod added');
});

/* ---------------------------------------------------------------- start: the flat plan */
initViewCube({ reset:()=>{ if(state.focusPod!=null) document.querySelector('.pod-badge')?.click(); flatten(true); }, after:()=>{ renderModels(); buildHome(); renderSide(); }, toast });
function startBuild(){ controls.enableRotate=false;   /* one-finger turning is ours (above); OrbitControls keeps pan and zoom */
  renderTray(); setTimeout(()=>{ flatten(true); badge(); }, 60); }
export { startBuild, flatten, isFlat, renderTray };
