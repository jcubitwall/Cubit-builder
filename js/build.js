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
import { addPod, movePod, rotatePod, addDeck, moveDeck, dockSpots, deckSpots, foot, deckFoot, addPart, movePart, partSnaps } from './pods.js';
import { podOffsets, midAt } from './layout.js';
import { UP, MAX_LV } from './config.js';
const UPF = UP/12;
import { renderModels, renderSide, toast } from './sidebar.js';
import { deckName } from './deckframe.js';
import { furnMeshes, furnById, snap, addItem, updateItem, refreshItem, applyFurniture, showFurnGhost, hideFurnGhost, turnItem, setHolderVisible, handleMeshes, roomBeyond, stretchTo, rotXZ, turnStart, turnTo, groupMembers, setMany, moveHolder, addRecipe, furnitureOf, onFurnChanged } from './furniture.js';
import { planFor } from './electrical.js';
import { midHandleMeshes, startMid, trackMid, endMid, handleY } from './midhandles.js';
import { KITCHENS, kitchenById, onKitchensChanged } from './kitchens.js';
import { kitchenPicture } from './kitchen3d.js';
import { fmt as fmtCw, settings as cwSettings } from './casework.js';
const fmtIn = v => fmtCw(v)+(cwSettings().units==='mm'?' mm':'″');
import { CATS, ITEMS, newItem, itemDef, partsOf } from './casework.js';
import { frontSVG } from './casework-svg.js';
import { openCaseLib } from './casework-ui.js';
import { setPanel, panelOpen } from './fullscreen.js';
import { initViewCube, zoomToFace, doUndo, doRedo } from './viewcube.js';
import { onHistory } from './history.js';
import { wallGroups, scene, grid, onBuilt } from './scene3d.js';

const stage=document.getElementById('stage'), cv=renderer.domElement;
const FLAT=0.12;                          // radians from straight down that still count as the flat plan
const isFlat = () => controls.getPolarAngle() < FLAT;

/* ---------------------------------------------------------------- flat plan ⇄ 3D */
let anim=null;
function homeBox(){ const B=new THREE.Box3(); pickables.forEach(m=>{ if(shown(m)) B.expandByObject(m); }); return B.isEmpty() ? null : B; }   // the home itself (not the north arrow, the grid…)
function flatten(fit=false){
  const t=controls.target.clone(), off=camera.position.clone().sub(t);
  let az=Math.atan2(off.x, off.z); if(TWO_D) az=Math.round(az/(Math.PI/2))*(Math.PI/2);   // 2D: square to the nearest 90°
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
/* ---------------------------------------------------------------- 2D: a true flat top view (the 2D / 3D button)
   Straight down through an almost parallel lens (2° instead of 40°, from 20× as far): walls stand straight up, the
   plan reads like a drawing. Tilting is locked; one finger on empty space pans, two pinch and turn (quarter turns);
   pods, decks and cabinets drag straight away, as in the plan. 3D brings back the normal lens and tips the view. */
let TWO_D=false;
const FOV3=40, FOV2=2, K2D=Math.tan(FOV3*Math.PI/360)/Math.tan(FOV2*Math.PI/360);
const is2D = () => TWO_D;
function set2D(on){
  if(on===TWO_D) return; TWO_D=on;
  cancelAnimationFrame(anim); controls.enableDamping=false;
  const t=controls.target, o=camera.position.clone().sub(t);
  if(on){ camera.fov=FOV2; camera.near=2; camera.far=60000; controls.minDistance=1.5*K2D; controls.maxDistance=400*K2D; o.multiplyScalar(K2D);
    controls.maxPolarAngle=0.001; controls.touches.ONE=THREE.TOUCH.PAN; controls.mouseButtons.LEFT=THREE.MOUSE.PAN; }
  else { camera.fov=FOV3; camera.near=0.5; camera.far=500; controls.minDistance=1.5; controls.maxDistance=400; o.divideScalar(K2D);
    controls.maxPolarAngle=Math.PI*0.999; controls.touches.ONE=THREE.TOUCH.ROTATE; controls.mouseButtons.LEFT=THREE.MOUSE.ROTATE; }
  camera.position.copy(t).add(o); camera.updateProjectionMatrix(); controls.update(); controls.enableDamping=true;
  if(on) flatten();
  else { // tip back into 3D, keeping the heading
    const p0=camera.position.clone(), d=p0.distanceTo(t), off=p0.clone().sub(t); let az=Math.atan2(off.x, off.z); if(Math.abs(off.x)+Math.abs(off.z)<1e-6) az=0;
    const phi=0.95, end=new THREE.Vector3(t.x+Math.sin(phi)*Math.sin(az)*d, t.y+Math.cos(phi)*d, t.z+Math.sin(phi)*Math.cos(az)*d), T=performance.now();
    controls.enableDamping=false;
    const step=()=>{ const k=Math.min(1,(performance.now()-T)/320), e=k*k*(3-2*k); camera.position.lerpVectors(p0,end,e); camera.lookAt(t); controls.update();
      if(k<1) anim=requestAnimationFrame(step); else { controls.enableDamping=true; badge(); } }; step(); }
  document.body.classList.toggle('two-d', on);
  paper(on);
  btn2D.textContent = on ? '3D' : '2D'; btn2D.setAttribute('aria-pressed', on); btn2D.title = on ? 'Back to the 3D view' : 'Flat top view (true 2D) for placing cabinets';
  badge();
}
/* which floor: Floor 1 (the upstairs hidden, to work inside) or Floor 2 (both show; the tray's pods go upstairs,
   onto the pods below, hanging over if need be); the 2D plan shows the one picked */
/* which floor, 1 to 99: ▼ Floor N ▲. On a floor the ones above are hidden (3D) so you can work inside; the tray's
   pods go onto that floor, onto the pods of the floor below (hanging over if need be); the 2D plan shows just that
   floor. ▲ goes one past the top floor of the home (to start a new one), never past 99. Tapping the name goes to
   floor 1, or from floor 1 to the top floor. */
const lvWrap=document.createElement('span'); lvWrap.className='vc-lvg'; lvWrap.setAttribute('role','group'); lvWrap.setAttribute('aria-label','Floor');
lvWrap.innerHTML='<button class="vc-b vc-lvs" id="vcLvDn" aria-label="Floor down">▼</button><button class="vc-b vc-lv" id="vcLv"></button><button class="vc-b vc-lvs" id="vcLvUp" aria-label="Floor up">▲</button>';
const btnLv=lvWrap.querySelector('#vcLv'), btnDn=lvWrap.querySelector('#vcLvDn'), btnUp=lvWrap.querySelector('#vcLvUp');
const topFloor = () => { try{ return Math.max(0, ...podList(state.model).map(p=>p.lv||0)); }catch(e){ return 0; } };
/* the ▼ ▲ go grey at the ends (kept up to date as pods come and go) */
function lvButtons(){ const top=topFloor(); if(state.level>top+1) state.level=top+1; btnDn.disabled = (state.level||0)<=0; btnUp.disabled = (state.level||0)>=Math.min(MAX_LV, top+1); btnLv.textContent=`Floor ${(state.level||0)+1}`; }
import('./scene3d.js').then(m=>m.onBuilt(lvButtons));
function setLevel(lv){ const top=topFloor(); state.level=Math.max(0, Math.min(MAX_LV, Math.min(top+1, Math.round(+lv||0))));
  const n=state.level+1; btnLv.textContent=`Floor ${n}`; btnLv.setAttribute('aria-pressed', !!state.level);
  btnLv.title = state.level ? `Floor ${n}: pods dragged in go here, on the pods of floor ${n-1}. The floors above are hidden` : 'Ground floor (the floors above hidden)';
  btnDn.disabled = state.level<=0; btnUp.disabled = state.level>=Math.min(MAX_LV, top+1);
  import('./scene3d.js').then(m=>{ m.applyLayers(); }); if(TWO_D) drawPlan(); renderTray(); badge?.(); }
const lvToast = () => { const n=state.level+1, empty=!podList(state.model).some(p=>(p.lv||0)===state.level);
  toast(empty ? `Floor ${n} · drag pods from the tray onto the pods of floor ${n-1} (they can hang over the edge; 8′ or more gets posts)` : `Floor ${n}`); };
btnDn.onclick=()=>{ setLevel(state.level-1); lvToast(); };
btnUp.onclick=()=>{ setLevel(state.level+1); lvToast(); };
btnLv.onclick=()=>{ setLevel(state.level ? 0 : topFloor()); lvToast(); };
setTimeout(()=>{ document.querySelector('.vcube-wrap .vc-hist')?.appendChild(lvWrap); setLevel(0); }, 0);
const btn2D=document.createElement('button'); btn2D.className='vc-b vc-2d'; btn2D.id='vc2D'; btn2D.textContent='2D'; btn2D.setAttribute('aria-pressed','false'); btn2D.title='Flat top view (true 2D) for placing cabinets';
btn2D.onclick=()=>set2D(!TWO_D);
document.querySelector('.vcube-wrap .vc-hist')?.appendChild(btn2D);
// a face of the view cube other than Top (or Bottom) leaves 2D first, so the view can turn
document.querySelector('.vcube-wrap .vcube')?.addEventListener('click', e=>{ const f=e.target.closest('[data-v]'); if(TWO_D && f && f.dataset.v!=='top') set2D(false); }, true);

const flatBadge=document.createElement('div'); flatBadge.className='flat-badge'; stage.appendChild(flatBadge);
function badge(){ const f=isFlat(); flatBadge.textContent = TWO_D ? '2D · drag a pod or cabinet to move it · drag empty space to slide the plan · tap 3D to tilt' : f ? 'PLAN · drag a pod or cabinet to move it · drag up on empty space to tilt into 3D' : '3D · double-tap a part to isolate it · drag down for the plan'; flatBadge.classList.toggle('three', !f); }
setInterval(()=>{ if(state.view==='studio') badge(); if(TWO_D && (state.selected||null)!==BP.sel) drawPlan(); }, 300);
// 2D stays square: anything that turns the view ends on the nearest 90°
controls.addEventListener('end', ()=>{ if(!TWO_D) return; const off=camera.position.clone().sub(controls.target), az=Math.atan2(off.x, off.z), q=Math.PI/2;
  if(Math.abs(az-Math.round(az/q)*q)>0.002) flatten(); });

/* ---------------------------------------------------------------- 2D as a blueprint
   Paper white, flat light, the rooms white, and over the top the plan the way the drawing set draws it (blueprint.js
   planOverlay): walls dark and cut, windows, door swings, room names, outside dimensions; the picked wall in orange.
   The 3D stays underneath, so furniture, cabinets and everything you drag still show and work. Redrawn when the
   home changes or another wall is picked. */
const BP={ sel:undefined, objs:[], bg:null, gridVis:true, hemi:null, n:0 };
function clearPlan(){ BP.objs.forEach(o=>{ o.parent?.remove(o); o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose(); }); BP.objs=[]; }
async function drawPlan(){
  BP.sel=state.selected||null; const n=++BP.n;
  const { planOverlay, homeModel } = await import('./blueprint.js');
  if(!TWO_D || n!==BP.n) return;
  const up=podList(state.model).some(p=>p.lv), lv=up?(state.level||0):null;   // just the floor picked
  let O, H_; try{ O=planOverlay(BP.sel, 20, lv); H_=homeModel(state.model, lv); }catch(e){ console.warn('2D plan', e); return; }
  const S=3, cv2=document.createElement('canvas'); cv2.width=O.w*S; cv2.height=O.h*S;
  const img=new Image(); img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(O.svg);
  await img.decode().catch(()=>{}); if(!TWO_D || n!==BP.n) return;
  const x=cv2.getContext('2d'); x.scale(S,S); x.drawImage(img,0,0);
  clearPlan();
  const tex=new THREE.CanvasTexture(cv2); tex.anisotropy=8;
  const W=O.bb.x1-O.bb.x0, D=O.bb.z1-O.bb.z0;
  const sheet=new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicMaterial({ map:tex, transparent:true, depthWrite:false, depthTest:false }));
  sheet.rotation.x=-Math.PI/2; sheet.position.set((O.bb.x0+O.bb.x1)/2, 11+(lv||0)*UPF, (O.bb.z0+O.bb.z1)/2); sheet.renderOrder=900; sheet.userData.plan=true;
  homeGroup.add(sheet); BP.objs.push(sheet);
  // the floor's own lines (SIP panel joints, hole outlines, footprints) and the seals along the pod joints flicker
  // through the paper from 2D's distance: hide them (every line below 6″, and the seals), keeping furniture and walls
  hideLowLines();
  // the rooms: white paper over the floors (furniture stands on top of it)
  const white=new THREE.MeshBasicMaterial({ color:0xffffff });
  (H_.pods||[]).forEach(p=>{ const f=new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.d), white); f.rotation.x=-Math.PI/2; f.position.set(p.x+p.w/2, (p.y||0)+0.03, p.z+p.d/2); f.renderOrder=1; homeGroup.add(f); BP.objs.push(f); });
}
function hideLowLines(){
  homeGroup.updateMatrixWorld(true); const v=new THREE.Vector3();
  const SEALS=new Set([0xe8170f, 0x1f6fe0]);   // the compression seals along the pod joints (red high, blue low)
  homeGroup.traverse(o=>{ if(o.isMesh && o.visible && SEALS.has(o.material?.color?.getHex?.())){ o.visible=false; o.userData.hid2d=true; return; }
    if(!(o.isLine || o.isLineSegments) || o.userData.plan) return;
    const g=o.geometry; if(!g.boundingBox) g.computeBoundingBox(); v.set(0, g.boundingBox.max.y, 0); o.localToWorld(v);
    if(v.y < 0.5 && o.visible){ o.visible=false; o.userData.hid2d=true; } });
}
function showLowLines(){ homeGroup.traverse(o=>{ if(o.userData.hid2d){ o.visible=true; delete o.userData.hid2d; } }); }
function paper(on){
  if(on){ if(!BP.bg) BP.bg=scene.background; scene.background=new THREE.Color(0xfbfbf8); BP.gridVis=grid.visible; grid.visible=false;
    BP.hemi=scene.children.find(o=>o.isHemisphereLight); if(BP.hemi){ BP.hemi.userData.i0 ??= BP.hemi.intensity; BP.hemi.intensity=1.35; }
    // a clean drawing: wall letters and panel numbers off while in 2D (Layers turns them back on)
    BP.lab={ letters:state.letters, nums:state.nums };
    if(state.letters || state.nums){ state.letters=false; state.nums=false; buildHome(); } else drawPlan(); }
  else { BP.n++; clearPlan(); showLowLines();
    if(BP.lab){ const back=(BP.lab.letters && !state.letters) || (BP.lab.nums && !state.nums); if(!state.letters) state.letters=BP.lab.letters; if(!state.nums) state.nums=BP.lab.nums; BP.lab=null; if(back) buildHome(); } if(BP.bg) scene.background=BP.bg; BP.bg=null; grid.visible=BP.gridVis; if(BP.hemi && BP.hemi.userData.i0!=null) BP.hemi.intensity=BP.hemi.userData.i0; }
}
onBuilt(()=>{ BP.objs=[]; if(TWO_D) drawPlan(); });

/* ---------------------------------------------------------------- picking */
const ray=new THREE.Raycaster(), ndc=new THREE.Vector2();
const shown = o => { for(; o; o=o.parent) if(!o.visible) return false; return true; };
function hitAt(x,y){
  const r=cv.getBoundingClientRect(); ndc.set(((x-r.left)/r.width)*2-1, -((y-r.top)/r.height)*2+1); ray.setFromCamera(ndc,camera);
  return ray.intersectObjects(pickables,false).find(h=>shown(h.object));
}
/* the plan point (feet, in the home's own frame) under the finger, on the floor */
/* the finger on a level plane h feet up in the home (the middle-wall handles sit on the wall tops) */
function planAtH(x,y,h){
  const r=cv.getBoundingClientRect(); ndc.set(((x-r.left)/r.width)*2-1, -((y-r.top)/r.height)*2+1); ray.setFromCamera(ndc,camera);
  const w=homeGroup.localToWorld(new THREE.Vector3(0,h,0)), p=new THREE.Vector3(); if(!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-w.y), p)) return null;
  return homeGroup.worldToLocal(p);
}
function midHandleAt(x,y){ const r=cv.getBoundingClientRect(); ndc.set(((x-r.left)/r.width)*2-1, -((y-r.top)/r.height)*2+1); ray.setFromCamera(ndc,camera); return ray.intersectObjects(midHandleMeshes(),false)[0]; }
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
function handleAt(x,y){ const r=cv.getBoundingClientRect(); ndc.set(((x-r.left)/r.width)*2-1, -((y-r.top)/r.height)*2+1); ray.setFromCamera(ndc,camera); return ray.intersectObjects(handleMeshes(),false)[0]; }
const tip=document.createElement('div'); tip.className='stretch-tip'; tip.hidden=true; stage.appendChild(tip);
function trackStretch(d, x, y){
  const it=furnById(d.id), at=planAt(x,y); if(!it || !at) return;
  const ch=stretchTo(it, d.side, at, homeGroup, d.room); if(!ch) return; d.change=ch;
  const tmp={...it, ...ch}; showFurnGhost(tmp, {pod:it.pod, u:tmp.u, v:tmp.v, a:it.a});
  const r=stage.getBoundingClientRect(); tip.hidden=false; tip.style.left=(x-r.left)+'px'; tip.style.top=(y-r.top-46)+'px';
  tip.textContent = (ch.w!=null ? `${fmtIn(ch.w)} wide` : `${fmtIn(ch.d)} deep`) + (ch.snapped ? ' · up against it' : '');
}
/* the turn handle: the item (or its group) turns live under the finger, in 45° steps */
function trackTurn(d, x, y){
  const it=furnById(d.id), at=planAt(x,y); if(!it || !at) return;
  const res=turnTo(it, d.st, at, homeGroup); if(!res) return; d.res=res;
  res.moves.forEach(([id,p])=>moveHolder(id, p.u, p.v, p.a));
  const r=stage.getBoundingClientRect(); tip.hidden=false; tip.style.left=(x-r.left)+'px'; tip.style.top=(y-r.top-46)+'px';
  tip.textContent = res.deg ? `Turned ${Math.abs(res.deg)}°` : 'Drag round to turn · 45° steps';
}
/* one touch, one wall: the drag keeps the wall it started on (d.lockA) until the item is pulled clearly off it.
   A group moves as one: everything keeps its place relative to the item under the finger (and turns with it). */
function trackFurn(d, x, y){
  const at=planAt(x,y); if(!at){ hideFurnGhost(); d.at=null; return; }
  const it={...(d.it||furnById(d.id))};
  let s=snap(it, at, wallGroups, homeGroup, it.a, d.lockA ?? null);
  if(s && d.group && s.pod!==it.pod) s=null;                    // a group stays in its pod
  d.at=s; if(s){ if(s.free && d.it?.a!=null) s.a=d.it.a; if(s.wall) d.lockA=s.a; showFurnGhost(it, s, true); } else hideFurnGhost();
  if(d.group){ const A=s || it;
    d.moves=d.group.map(g=>{ const [dx,dz]=rotXZ(g.rx, g.rz, A.a||0); let a=(((A.a||0)+g.ra)%360+360)%360; if(a>180) a-=360; const u=A.u+dx, v=A.v+dz; if(s) moveHolder(g.id, u, v, a); return [g.id, {u, v, a, wall:null}]; }); }
}
function startGroupDrag(d){
  const it=furnById(d.id), gid=it?.grp?.id; if(!gid) return;
  d.group=groupMembers(gid).filter(o=>o.id!==it.id).map(o=>{ const [rx,rz]=rotXZ(o.u-it.u, o.v-it.v, -(it.a||0)); return { id:o.id, rx, rz, ra:(((o.a||0)-(it.a||0))%360+360)%360, home:{u:o.u, v:o.v, a:o.a||0} }; });
}
function endGroupDrag(d, keep){
  if(!d.group) return;
  if(!keep) d.group.forEach(g=>moveHolder(g.id, g.home.u, g.home.v, g.home.a));   // put the rest back where they were
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
  if(d.mode==='fmove'){ const it=furnById(d.id);
    if(it?.grp){ const da=-90*dir, M=groupMembers(it.grp.id);   // a group turns as one, round the item under the finger
      setMany(M.map(o=>{ const [x,z]=rotXZ(o.u-it.u, o.v-it.v, da); let a=(((o.a||0)+da)%360+360)%360; if(a>180) a-=360; return [o.id, {u:it.u+x, v:it.v+z, a, wall:o.id===it.id?null:o.wall}]; }));
      M.forEach(o=>refreshItem(furnById(o.id))); startGroupDrag(d); renderSide(); return; }
    turnItem(d.id, dir); refreshItem(furnById(d.id)); renderSide(); return; }
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
  // the first finger of a new touch: anything left from a gesture whose lift was never seen is dropped, so the view
  // can always pan and zoom again
  if(e.isPrimary && pointers.size) resetGesture();
  pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if(D && (D.mode==='new'||D.mode==='fnew')){ turn(D, 1); return; }                       // another finger while dragging one in: turn it
  if(pointers.size===1){
    orbit=null; if(D && D.mode==='move') D=null;                        // nothing left over from a gesture that ended oddly
    clearTimeout(press?.timer); press=null;
    // a middle wall's handles: an end (longer / shorter), the middle (move it across), the turn (tap)
    if(editable()){ const mh=midHandleAt(e.clientX,e.clientY); if(mh){ const d=startMid(mh); if(d){ controls.enabled=false; D={...d, started:true}; document.body.classList.add('dragging'); return; } } }
    // a green stretch arrow on the tapped item: drag it to make the item longer / deeper or shorter
    if(editable()){ const hh=handleAt(e.clientX,e.clientY); if(hh){ const it=furnById(hh.object.userData.furn);
      if(it && hh.object.userData.handle==='turn'){ const at=planAt(e.clientX,e.clientY), st=at && turnStart(it, at, homeGroup);
        if(st){ controls.enabled=false; D={mode:'turn', id:it.id, st, started:true}; document.body.classList.add('dragging'); return; } }
      else if(it){ controls.enabled=false; D={mode:'stretch', id:it.id, side:hh.object.userData.handle, room:roomBeyond(it, hh.object.userData.handle), started:true}; document.body.classList.add('dragging'); return; } } }
    // in the flat plan a pod, deck or cabinet moves straight away; anywhere else the finger turns the view
    if(isFlat() && editable()){ const d=grabAt(e.clientX,e.clientY); if(d){ controls.enabled=false; D=d; return; } }
    if(!TWO_D) orbit={x:e.clientX, y:e.clientY};   // 2D: no tilting, OrbitControls pans with one finger
    // a long touch (held still): on a pod, deck or cabinet it picks it up to move it (in 3D too);
    // on empty space it opens the Layers list
    { const x=e.clientX, y=e.clientY;
      press={x, y, timer:setTimeout(()=>{ if(!press || pointers.size!==1) return; press=null;
        if(!hitAt(x,y) && !furnAt(x,y)){ orbit=null; try{ navigator.vibrate?.(10); }catch(err){} openLayers(true, {x, y}); return; }
        const d=editable() ? grabAt(x,y) : null; if(!d) return;
        orbit=null; controls.enabled=false; D=d; D.started=true; D.lastXY=[x,y]; document.body.classList.add('dragging');
        try{ navigator.vibrate?.(15); }catch(err){}
        if(D.mode==='fmove'){ setHolderVisible(D.id,false); trackFurn(D, x, y); } else track(D, x, y);
        toast(D.mode==='fmove' ? 'Moving the cabinet · lift to drop' : D.deck ? 'Moving the deck · lift to drop' : 'Moving the pod · lift to drop'); }, LONG_PRESS)}; }
  } else if(pointers.size===3){ if(press){ clearTimeout(press.timer); press=null; }   // three fingers: swipe left = undo, right = redo (Shapr3D)
    orbit=null; viewTwist=null; if(D && D.mode!=='new' && D.mode!=='fnew'){ hideGhost(); hideFurnGhost(); if(D.id) setHolderVisible(D.id,true); endGroupDrag(D, false); D=null; document.body.classList.remove('dragging'); }
    controls.enabled=false; three={x0:centroid(), done:false};
  } else if(pointers.size===2 && D && !(D.started && (D.mode==='move'||D.mode==='fmove'))){
    // a second finger before anything was moved (first finger landed on the home): it's a pinch / pan of the view,
    // not a move. OrbitControls takes both fingers from here (it sees this touch after us).
    cancelDrag(); controls.enabled=true; if(press){ clearTimeout(press.timer); press=null; }
    const [a,b]=[...pointers.values()]; viewTwist={a0:Math.atan2(b.y-a.y, b.x-a.x), acc:0};
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
/* drop a drag without applying it (everything back where it was) */
function cancelDrag(){ if(!D) return; const d=D; D=null; hideGhost(); hideFurnGhost(); tip.hidden=true; if(d.id) setHolderVisible(d.id,true);
  if(d.mode==='turn' && d.st){ const it=furnById(d.id); [it, ...d.st.others.map(o=>furnById(o.id))].forEach(x=>x && refreshItem(x)); }
  endGroupDrag(d, false); document.body.classList.remove('dragging'); }
/* forget every finger and gesture: the view is free again */
function resetGesture(){ pointers.clear(); orbit=null; viewTwist=null; three=null; if(press){ clearTimeout(press.timer); press=null; } cancelDrag(); controls.enabled=true; }
const LONG_PRESS=450;   // ms held still (within 10 px) to pick a part up in 3D
/* what's under the finger to move: a cabinet (in front of the wall / floor) or the pod / deck it belongs to */
function grabAt(x,y){
  const fh=furnAt(x,y), ph=hitAt(x,y), glass = ph && /:(ceiling-int|roof)$/.test(ph.object.userData.slotId||'');
  if(fh && (!ph || glass || fh.distance<=ph.distance+0.05)){ const it=furnById(fh.object.userData.furn); if(it){ const d={mode:'fmove', id:it.id, it, sx:x, sy:y, started:false, lockA: it.wall ? (it.a||0) : null}; startGroupDrag(d); return d; } }
  const o=ownerOf(ph); if(!o) return null;
  const at=planAt(x,y), m=MODELS[state.model]; if(!at) return null;
  if(o.deck){ const q=m.decks[o.i]; return {mode:'move', deck:true, i:o.i, lib:q.lib, rot:q.rot||0, grab:{x:at.x, z:at.z, x0:q.x, z0:q.z}, sx:x, sy:y, started:false}; }
  const raw=m.pods[o.i]; return {mode:'move', deck:false, i:o.i, item:{t:raw.t, ...(raw.lv?{lv:raw.lv}:{})}, t:raw.t, rot:raw.rot||0, grab:{x:at.x, z:at.z, x0:raw.x, z0:raw.z}, sx:x, sy:y, started:false};
}
const centroid=()=>{ const v=[...pointers.values()]; return v.reduce((s,p)=>s+p.x,0)/v.length; };
/* turn the view about the vertical through its centre (two-finger twist on empty space) */
function turnView(rad){ const t=controls.target, o=camera.position.clone().sub(t); o.applyAxisAngle(new THREE.Vector3(0,1,0), rad); camera.position.copy(t).add(o); camera.lookAt(t); controls.update(); }
window.addEventListener('pointermove', e=>{
  if(!pointers.has(e.pointerId)) return;
  if(three && pointers.size===3 && !three.done){ pointers.set(e.pointerId,{x:e.clientX,y:e.clientY}); const dx=centroid()-three.x0;
    if(window.__cubitSpread){ three.done=true; return; }   // a three-finger spread (explode), not a swipe
    if(Math.abs(dx)>70){ three.done=true; dx<0 ? doUndo() : doRedo(); } return; }
  if(viewTwist && pointers.size===2 && !D){ pointers.set(e.pointerId,{x:e.clientX,y:e.clientY}); const [a,b]=[...pointers.values()]; let d=Math.atan2(b.y-a.y,b.x-a.x)-viewTwist.a0;
    if(d>Math.PI) d-=2*Math.PI; if(d<-Math.PI) d+=2*Math.PI;
    // the home turns the same way as the fingers (fingers clockwise on screen → home clockwise, as in Shapr3D)
    if(isFlat()){ if(Math.abs(d)>=Math.PI/4){ const sg=d>0?1:-1; turnView(sg*Math.PI/2); viewTwist.a0+=sg*Math.PI/2; } }   // plan: quarter turns
    else if(Math.abs(d)>0.02){ turnView(d); viewTwist.a0+=d; } }                                                          // 3D: follows the fingers
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
  if(D.mode==='mid'){ if(D.h==='turn') return; const P=planAtH(e.clientX, e.clientY, handleY(D)), t=trackMid(D, P);
    const r=stage.getBoundingClientRect(); tip.hidden=!t; tip.style.left=(e.clientX-r.left)+'px'; tip.style.top=(e.clientY-r.top-46)+'px'; tip.textContent=t; return; }
  if(D.mode==='stretch'){ D.lastXY=[e.clientX,e.clientY]; trackStretch(D, e.clientX, e.clientY); return; }
  if(D.mode==='turn'){ trackTurn(D, e.clientX, e.clientY); return; }
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
  if(D && D.mode==='mid'){ if(pointers.size) return;
    const d=D; D=null; tip.hidden=true; document.body.classList.remove('dragging'); controls.enabled=true;
    const id=endMid(d); if(!id) return;
    state.selected=id; renderModels(); buildHome(); highlight(); renderSide();
    if(d.h==='turn') toast('Turned a quarter turn about its middle'); return; }
  if(D && D.mode==='stretch'){ if(pointers.size) return;
    const d=D; D=null; hideFurnGhost(); tip.hidden=true; document.body.classList.remove('dragging'); controls.enabled=true;
    if(!d.change) return; const {snapped, ...ch}=d.change;
    updateItem(d.id, ch); refreshItem(furnById(d.id)); state.selFurn=d.id; applyFurniture(); renderSide(); return; }
  if(D && D.mode==='turn'){ if(pointers.size) return;
    const d=D; D=null; tip.hidden=true; document.body.classList.remove('dragging'); controls.enabled=true;
    const it=furnById(d.id); if(!it) return;
    const moves=d.res?.deg ? d.res.moves : null;
    if(moves){ setMany(moves); moves.forEach(([id])=>refreshItem(furnById(id))); }
    else [it, ...d.st.others.map(o=>furnById(o.id))].forEach(x=>x && refreshItem(x));   // back where it was
    state.selFurn=d.id; applyFurniture(); renderSide(); return; }
  if(D && D.mode==='fmove'){ if(pointers.size) return;
    const d=D; D=null; hideFurnGhost(); setHolderVisible(d.id,true); document.body.classList.remove('dragging'); controls.enabled=true;
    if(d.twist || !d.started || !d.at){ endGroupDrag(d, false); return; }
    if(d.group){ setMany([[d.id, d.at], ...(d.moves||[])]); [d.id, ...d.group.map(g=>g.id)].forEach(id=>refreshItem(furnById(id))); }
    else { updateItem(d.id, d.at); refreshItem(furnById(d.id)); }
    state.selFurn=d.id; applyFurniture(); renderSide(); return; }
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
// all fingers off the glass (or the app sent to the background) but a lift went missing: finish properly and free the view
const allOff = e => { if(e.touches && e.touches.length) return; if(pointers.size) [...pointers.keys()].forEach(id=>release({ pointerId:id })); if(!D) controls.enabled=true; };
window.addEventListener('touchend', allOff, true); window.addEventListener('touchcancel', allOff, true);
window.addEventListener('blur', ()=>resetGesture()); document.addEventListener('visibilitychange', ()=>{ if(document.hidden) resetGesture(); });

/* ---------------------------------------------------------------- double-tap: isolate */
function isoLabel(id){
  if(id.startsWith('furn:')){ const [,fid,part]=id.split(':'); const it=furnById(fid); if(!it) return 'Cabinet';
    return part!=null ? (partsOf(it)[+part]?.name || 'Part') : itemDef(it.k).name; }
  if(id.startsWith('deck:')) return `Deck ${+id.slice(5)+1}`;
  if(id.startsWith('stair:')) return 'Stairs';
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
  const deck=String(id).startsWith('deck:') || String(id).startsWith('stair:');   // a deck or a stair: on its own straight away
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
  const tabs=`<div class="tray-tabs" role="tablist"><button role="tab" data-tab="pods" aria-selected="${trayTab==='pods'}">Cubits</button><button role="tab" data-tab="cab" aria-selected="${trayTab==='cab'}">Accessories</button></div>`;
  if(trayTab==='cab'){
    const items=ITEMS.filter(d=>d.cat===trayCat && !d.deleted && !d.legacy);
    const sel = `<label class="tray-cat"><span>Category</span><select id="trayCat" aria-label="Category"><option value="__kit" ${trayCat==='__kit'?'selected':''}>Kitchens &amp; groups</option>${CATS.map(c=>`<option value="${c.k}" ${c.k===trayCat?'selected':''}>${c.name}</option>`).join('')}</select></label>`;
    if(trayCat==='__kit'){ tray.innerHTML = tabs + sel + (KITCHENS.map(K=>{ const u=kitchenPicture('kit:'+K.id+':'+(K.rev||0), K.items); return `<button class="tray-it cab kit" data-kit="${K.id}" title="${K.name.replace(/"/g,'&quot;')}">${u?`<span class="tray-cab tray-kit"><img src="${u}" alt=""></span>`:''}<b>${K.name.replace(/</g,'&lt;')}</b><small>${K.items.length} items</small></button>`; }).join('') || '<span class="tray-none">No saved kitchens yet. Group cabinets in a home, then save the group.</span>') + `<button class="tray-it more" data-open="lib"><b>Library…</b><small>kitchens in 3D</small></button>`; return; }
    tray.innerHTML = tabs + sel
      + items.map(d=>{ const it=newItem(d.k); return `<button class="tray-it cab" data-k="${d.k}" title="${d.name.replace(/"/g,'&quot;')}"><span class="tray-cab">${frontSVG(it,{pad:1})}</span><b>${d.name.replace(/ · .*/,'')}</b><small>${d.name.includes(' · ')?d.name.split(' · ')[1]:`${Math.round(it.w*8)/8}″ wide`}</small></button>`; }).join('')
      + `<button class="tray-it more" data-open="lib"><b>Library…</b><small>sizes, 3D, parts</small></button>`;
    return;
  }
  // just the three pod sizes: every wall, floor, ceiling and roof can be changed once it's placed
  const dk=DECKLIB.filter(d=>!d.deleted);
  tray.innerHTML = tabs + `
    ${[['P8',8],['P16',16],['L24',24]].map(([t,len])=>`<button class="tray-it" data-t="${t}">${podMini(len)}<b>8′ × ${len}′</b><small>pod</small></button>`).join('')}
    <button class="tray-it mid" data-mid="1" title="Drag into a pod: a wall across it (or along it, dropped near a long side)"><svg viewBox="0 0 22 12" aria-hidden="true"><rect x="1" y="1" width="20" height="10" fill="none" stroke="#8a8f94" stroke-width=".8"/><rect x="9.6" y="1" width="2" height="10" fill="#6b5530"/></svg><b>Interior wall</b><small>splits a pod</small></button>
    ${dk.map(L=>`<button class="tray-it deck" data-deck="${L.id}"><svg viewBox="0 0 22 12" aria-hidden="true"><rect x="1" y="1" width="20" height="10" fill="#d9c49b" stroke="#6b5530" stroke-width=".6"/><line x1="1" y1="1" x2="21" y2="1" stroke="#3b2a12" stroke-width="1.4"/></svg><b>${deckName(L)}</b><small>deck</small></button>`).join('')}`;
}
tray.addEventListener('pointerdown', e=>{
  const b=e.target.closest('.tray-it'); if(!b || !editable() || b.dataset.open) return;
  const sx=e.clientX, sy=e.clientY, id=e.pointerId;
  if(b.dataset.mid){ dragMid(e, b); return; }
  const cab=b.dataset.k, kit=b.dataset.kit && kitchenById(b.dataset.kit);
  const item = cab||b.dataset.deck ? null : b.dataset.lib ? {lib:b.dataset.lib, ...(state.level?{lv:state.level}:{})} : {t:b.dataset.t, ...(state.level?{lv:state.level}:{})};
  const t = item ? (item.lib ? podById(item.lib).t : item.t) : null;
  const mv=ev=>{ if(ev.pointerId!==id) return;
    if(!D){ if(Math.abs(ev.clientY-sy) < 14 || Math.abs(ev.clientY-sy) < Math.abs(ev.clientX-sx)) return;   // sideways: the tray scrolls
      D = kit ? {mode:'fnew', kit, it:{ ...(kit.items.find(r=>r.rx===0&&r.rz===0)||kit.items[0]), a:0 }} : cab ? {mode:'fnew', it:{...newItem(cab), a:0}} : b.dataset.deck ? {mode:'new', deck:true, lib:b.dataset.deck, rot:0} : {mode:'new', deck:false, item, t, rot:0};
      document.body.classList.add('dragging'); controls.enabled=false; }
    D.lastXY=[ev.clientX, ev.clientY];
    const r=cv.getBoundingClientRect(), over = ev.clientX>r.left && ev.clientX<r.right && ev.clientY>r.top && ev.clientY<r.bottom && !tray.contains(document.elementFromPoint(ev.clientX, ev.clientY));
    if(D.mode==='fnew'){ if(over) trackFurn(D, ev.clientX, ev.clientY); else { hideFurnGhost(); D.at=null; } return; }
    if(over) track(D, ev.clientX, ev.clientY); else { hideGhost(); D.ok=false; } };
  const up=ev=>{ if(ev.pointerId!==id) return; window.removeEventListener('pointermove',mv); window.removeEventListener('pointerup',up); window.removeEventListener('pointercancel',up);
    const d=D; D=null; hideGhost(); hideFurnGhost(); document.body.classList.remove('dragging'); controls.enabled=true;
    if(!d){ return; }
    trayDragAt=performance.now();   // the tap the iPad may still send after a drag must not add a second one
    if(d.mode==='fnew'){ if(!d.at){ toast('Drop it inside a pod. It backs onto the nearest wall.'); return; }
      if(d.kit){ const anchor=d.kit.items.find(r=>r.rx===0&&r.rz===0)||d.kit.items[0], shift=rotXZ(anchor.rx, anchor.rz, d.at.a||0);
        const gid=addRecipe(d.kit.items, {...d.at, u:d.at.u-shift[0], v:d.at.v-shift[1]}, d.kit.name, d.kit.id);
        const L=groupMembers(gid); L.forEach(refreshItem); state.selFurn=L[0]?.id||null; state.selected=null; highlight(); renderSide(); if(!panelOpen()) setPanel(true); toast(`${d.kit.name} added · drag it to move it as one`); return; }
      const { overBase, ...at }=d.at, f=addItem(d.it.k, at); state.selFurn=f.id; state.selected=null; refreshItem(f); highlight(); renderSide(); if(!panelOpen()) setPanel(true); toast(`${itemDef(f.k).name} added${overBase?` · ${f.w}″ wide, to match the base under it`:''}`); return; }
    if(!d.ok){ toast('Drop it next to the home, where it docks flush in 8′ steps.'); return; }
    after(d.deck ? addDeck(d.lib, d.at.x, d.at.z, d.rot) : addPod(d.item, d.at.x, d.at.z, d.rot), d.deck ? 'Deck added' : 'Pod added'); };
  window.addEventListener('pointermove',mv); window.addEventListener('pointerup',up); window.addEventListener('pointercancel',up);
});
/* a middle wall from the tray: dropped in a pod it goes across (along, when dropped within 2′ of a long side's middle
   third … kept simple: across unless the drop is nearer a long wall than an end), its middle where it was dropped,
   to the inch, or flush with a wall face within 3″ */
function dragMid(e, b){
  const sx=e.clientX, sy=e.clientY, id=e.pointerId; let moved=false;
  const mv=ev=>{ if(ev.pointerId!==id) return; if(!moved && Math.hypot(ev.clientX-sx, ev.clientY-sy)>14){ moved=true; document.body.classList.add('dragging'); controls.enabled=false; } };
  const up=ev=>{ if(ev.pointerId!==id) return; window.removeEventListener('pointermove',mv); window.removeEventListener('pointerup',up); window.removeEventListener('pointercancel',up);
    document.body.classList.remove('dragging'); controls.enabled=true; if(!moved){ toast('Drag it into a pod'); return; }
    trayDragAt=performance.now();
    const at=planAt(ev.clientX, ev.clientY); if(!at){ toast('Drop it inside a pod'); return; }
    const OFF=podOffsets(state.model), P=podList(state.model).find(p=>{ const o=OFF[p.i]; return at.x>p.x+o.ox && at.x<p.x1+o.ox && at.z>p.z+o.oz && at.z<p.z1+o.oz; });
    if(!P){ toast('Drop it inside a pod'); return; }
    const o=OFF[P.i], x=at.x-o.ox, z=at.z-o.oz;
    // across or along: along when the drop is closer to the pod's middle line along its length than to its middle across
    const lenAxisX = P.alongX, dLen = lenAxisX ? Math.abs(z-(P.z+P.z1)/2) : Math.abs(x-(P.x+P.x1)/2), dAcr = lenAxisX ? Math.abs(x-(P.x+P.x1)/2) : Math.abs(z-(P.z+P.z1)/2);
    const dir = P.len>8 && dLen < 1.2 && dAcr > 3 ? 'long' : 'cross';
    const q={ dir }, c = (dir==='cross') === lenAxisX ? x : z;
    let v=Math.round(midAt(P, q, c));
    const sid=addPart(P.i, dir, v); if(!sid){ return; }
    const S=slotsFor(state.model).find(s=>s.id===sid), near=S && partSnaps(S).filter(x=>x.label!=='middle of the pod').sort((a,b)=>Math.abs(a.at-v)-Math.abs(b.at-v))[0];
    let id2=sid; if(near && Math.abs(near.at-v)<=3) id2=movePart(P.i, S.part.id, near.at)||sid;
    state.selected=id2; renderModels(); buildHome(); highlight(); renderSide(); if(!panelOpen()) setPanel(true);
    toast(`Interior wall ${dir==='long'?'along':'across'} ${P.label}${near && Math.abs(near.at-v)<=3 ? ` · ${near.label}` : ''} · tap a door option`); };
  window.addEventListener('pointermove',mv); window.addEventListener('pointerup',up); window.addEventListener('pointercancel',up);
}
tray.addEventListener('change', e=>{ if(e.target.id==='trayCat'){ trayCat=e.target.value; renderTray(); tray.scrollLeft=0; } });
/* a tap on a tray item: add it at the first spot it fits (cabinets: against the wall nearest the middle of the first pod) */
let trayDragAt=0;
onKitchensChanged(()=>{ if(trayTab==='cab' && trayCat==='__kit') renderTray(); });
tray.addEventListener('click', e=>{
  if(performance.now()-trayDragAt < 800) return;
  const tb=e.target.closest('[data-tab]'); if(tb){ trayTab=tb.dataset.tab; renderTray(); return; }
    const b=e.target.closest('.tray-it'); if(!b) return;
  if(b.dataset.open){ openCaseLib({cat: trayCat==='__kit' ? 'k:kit' : trayCat}); return; }
  if(!editable()) return;
  if(b.dataset.k){ openCaseLib({k:b.dataset.k}); return; }
  if(b.dataset.kit){ const K=kitchenById(b.dataset.kit); if(K) import('./viewer3d.js').then(m=>m.openViewer('kitchen', null, { name:K.name, items:K.items, sub:`saved kitchen · ${K.items.length} items · drag it from the tray into a pod to add it` })); return; }
  if(b.dataset.deck){ const s=deckSpots(b.dataset.deck,0)[0]; if(!s){ toast('No place for this deck yet.'); return; } after(addDeck(b.dataset.deck, s.x, s.z, 0), 'Deck added'); return; }
  const item = b.dataset.lib ? {lib:b.dataset.lib} : {t:b.dataset.t};
  const s=dockSpots(item, 0)[0]; if(!s){ toast('No place for this pod yet.'); return; } after(addPod(item, s.x, s.z, 0), 'Pod added');
});

/* ---------------------------------------------------------------- start: the flat plan */
initViewCube({ reset:()=>{ if(state.focusPod!=null) document.querySelector('.pod-badge')?.click(); flatten(true); }, after:()=>{ renderModels(); buildHome(); renderSide(); }, toast });
function startBuild(){ controls.enableRotate=false;   /* one-finger turning is ours (above); OrbitControls keeps pan and zoom */
  renderTray(); setTimeout(()=>{ flatten(true); badge(); elecSig=elecSigNow(); }, 60); }
/* a bed, desk, fridge … brings its plugs with it (electrical.js): when placing, moving, turning or removing one
   changes the plugs, the walls are redrawn so they show at once */
let elecSig=null, elecT=0;
const elecSigNow = () => { try{ return JSON.stringify([state.model, planFor().boxes.map(b=>[b.W.s.id, b.face, Math.round(b.a*4), b.y, b.rk])]); }catch(e){ return ''; } };
onFurnChanged(()=>{ clearTimeout(elecT); elecT=setTimeout(function again(){
  if(D){ elecT=setTimeout(again, 250); return; }                 // not mid-drag
  const s=elecSigNow(); if(s===elecSig) return;
  elecSig=s; buildHome(); highlight(); }, 150); });
window.addEventListener('cubit:home', ()=>{ elecSig=elecSigNow(); });
export { setLevel, startBuild, flatten, isFlat, renderTray, set2D, is2D };
