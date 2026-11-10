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
import { addPod, movePod, rotatePod, addDeck, moveDeck, dockSpots, deckSpots, foot, deckFoot, addPart, movePart, partSnaps, problem, mirrorPod, deletePod, removeDeck, turnDeck } from './pods.js';
import { duplicateItem, removeItem } from './furniture.js';
import { homeCost, money, book } from './prices.js';
import { podOffsets, midAt } from './layout.js';
import { UP, MAX_LV } from './config.js';
const UPF = UP/12;
import { renderModels, renderSide, toast } from './sidebar.js';
import { deckName } from './deckframe.js';
import { freeSpot, clash } from './furniture.js';
import { addStair } from './stairs.js';
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
import { setPanel, panelOpen, enterFullscreen, exitFullscreen } from './fullscreen.js';
import { sun as SUN } from './scene3d.js';
import { initViewCube, zoomToFace, doUndo, doRedo } from './viewcube.js';
import { onHistory } from './history.js';
import { wallGroups, scene, grid, onBuilt } from './scene3d.js';
import { isDesign, onMode } from './mode.js';

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
    const span=Math.max(s.z, s.x/asp)+(isDesign()?20:8);   /* Design: room round it for the drawing's dimensions, the toolbar and the tray */   /* what has to fit top to bottom on screen (x across, z up the screen) */ dist=span/2/Math.tan(camera.fov*Math.PI/360)*1.05; const c=B.getCenter(new THREE.Vector3()); t.set(c.x,0,c.z); } }
  const end=new THREE.Vector3(t.x+Math.sin(az)*dist*0.0005, t.y+dist, t.z+Math.cos(az)*dist*0.0005);
  const p0=camera.position.clone(), t0=controls.target.clone(), T=performance.now();
  cancelAnimationFrame(anim); controls.enableDamping=false;          // no drift left over from the last orbit
  const step=()=>{ const k=Math.min(1,(performance.now()-T)/320), e=k*k*(3-2*k);
    camera.position.lerpVectors(p0,end,e); controls.target.lerpVectors(t0,t,e); controls.update();
    if(k<1) anim=requestAnimationFrame(step); else { controls.enableDamping=true; badge(); if(isDesign() && !TWO_D && state.view==='studio') set2D(true); } };
  step();
}
/* ---------------------------------------------------------------- 2D: a true flat top view (the 2D / 3D button)
   Straight down through an almost parallel lens (2° instead of 40°, from 20× as far): walls stand straight up, the
   plan reads like a drawing. Tilting is locked; one finger on empty space pans, two pinch and turn (quarter turns);
   pods, decks and cabinets drag straight away, as in the plan. 3D brings back the normal lens and tips the view. */
let TWO_D=false;
const FOV3=40, FOV2=2, K2D=Math.tan(FOV3*Math.PI/360)/Math.tan(FOV2*Math.PI/360);
const is2D = () => TWO_D;
/* one finger on empty space in the 2D plan: in Shop it slides the plan (as before); in Design it tips the drawing into
   3D (build.js does that), and two fingers slide it */
function oneFinger(){
  const pan = TWO_D && !isDesign();
  controls.touches.ONE = TWO_D ? (pan ? THREE.TOUCH.PAN : -1) : THREE.TOUCH.ROTATE;
  controls.mouseButtons.LEFT = TWO_D ? (pan ? THREE.MOUSE.PAN : -1) : THREE.MOUSE.ROTATE;
}
function set2D(on, quick=false){
  if(on===TWO_D) return; TWO_D=on;
  cancelAnimationFrame(anim); controls.enableDamping=false;
  const t=controls.target, o=camera.position.clone().sub(t);
  if(on){ camera.fov=FOV2; camera.near=2; camera.far=60000; controls.minDistance=1.5*K2D; controls.maxDistance=400*K2D; o.multiplyScalar(K2D);
    controls.maxPolarAngle=0.001; }
  else { camera.fov=FOV3; camera.near=0.5; camera.far=500; controls.minDistance=1.5; controls.maxDistance=400; o.divideScalar(K2D);
    controls.maxPolarAngle=Math.PI*0.999; }
  camera.position.copy(t).add(o); camera.updateProjectionMatrix(); controls.update(); controls.enableDamping=true;
  oneFinger();
  if(on) flatten();
  else if(quick){ // Design: a drag up on the drawing tips it straight into 3D, and the same finger carries on turning it
    const d=camera.position.distanceTo(t), off=camera.position.clone().sub(t); let az=Math.atan2(off.x, off.z); if(Math.abs(off.x)+Math.abs(off.z)<1e-6) az=0;
    const phi=FLAT+0.04; camera.position.set(t.x+Math.sin(phi)*Math.sin(az)*d, t.y+Math.cos(phi)*d, t.z+Math.sin(phi)*Math.cos(az)*d); camera.lookAt(t); controls.update(); }
  else if(!quick){ // tip back into 3D, keeping the heading
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
/* the footprint, always on screen while building: the ground-floor pods (nominal, as the drawing set's floor area),
   with the floors above and the decks under it when there are any. Updated every time the home is rebuilt. */
const sqft=document.createElement('div'); sqft.className='sqft-chip'; sqft.setAttribute('aria-live','polite');
const fmtN = n => Math.round(n).toLocaleString('en-CA');
/* tap it to step through: footprint → all floors → with decks → m² */
let sqView=0;
sqft.setAttribute('role','button'); sqft.tabIndex=0;
sqft.addEventListener('click', ()=>{ sqView=(sqView+1)%4; showSqft(); });
function showSqft(){
  const m=MODELS[state.model]; if(!m){ sqft.hidden=true; return; } sqft.hidden=false;
  const pods=m.pods||[], area=p=>{ const f=foot(p); return f.w*f.d; };
  const ground=pods.filter(p=>!(+p.lv)).reduce((a,p)=>a+area(p),0), all=pods.reduce((a,p)=>a+area(p),0);
  const deck=(m.decks||[]).reduce((a,d)=>{ try{ const f=deckFoot(d); return a+f.w*f.d; }catch(e){ return a; } },0);
  const V=[['Footprint', fmtN(ground), 'sq ft'], ['All floors', fmtN(all), 'sq ft'], ['With decks', fmtN(ground+deck), 'sq ft'], ['Footprint', (ground*0.092903).toFixed(1), 'm²']][sqView];
  sqft.innerHTML=`<span class="sq-k">${V[0]}</span><b>${V[1]}</b><span class="sq-u">${V[2]}</span>`;
  sqft.title=`Footprint ${fmtN(ground)} sq ft · all floors ${fmtN(all)} · decks ${fmtN(deck)} · ${(ground*0.092903).toFixed(1)} m². Tap to step through them.`;
  queuePrice();
}
/* the price as you build: Design shows the customer's price (cost + markup, the markup set under Tools), Shop shows
   Cubit's cost. Tap it to hide it; tap again to show it. Only for those who can see prices. */
const priceEl=document.createElement('div'); priceEl.className='sqft-chip price-chip'; priceEl.setAttribute('role','button'); priceEl.tabIndex=0; priceEl.hidden=true;
let priceHidden=(()=>{ try{ return localStorage.getItem('cubit-price-hidden')==='1'; }catch(e){ return false; } })(), priceT=0;
const markup = () => { try{ const v=parseFloat(localStorage.getItem('cubit-markup')); return isFinite(v) ? v : 0; }catch(e){ return 0; } };
priceEl.addEventListener('click', ()=>{ priceHidden=!priceHidden; try{ localStorage.setItem('cubit-price-hidden', priceHidden?'1':'0'); }catch(e){} showPrice(); });
function queuePrice(){ clearTimeout(priceT); priceT=setTimeout(showPrice, 700); }
function showPrice(){
  if(!priceEl.isConnected){ sqft.after(priceEl); }
  let c=null; try{ if(!book().denied && canSave()) c=homeCost(state.model); }catch(e){ c=null; }
  if(!c || !c.priced || !(c.total>0)){ priceEl.hidden=true; return; } priceEl.hidden=false;   // no prices in the book yet: nothing to show
  if(priceHidden){ priceEl.innerHTML='<span class="sq-k">Price</span><b>· · ·</b>'; priceEl.title='Tap to show the price'; return; }
  const design=isDesign(), v=design ? c.total*(1+markup()/100) : c.total;
  priceEl.innerHTML=`<span class="sq-k">${design?'Price':'Cost'}</span><b>${money(Math.round(v)).replace(/\.00$/,'')}</b>${c.missing?`<span class="sq-u" title="${c.missing} lines have no price yet">+${c.missing}?</span>`:''}`;
  priceEl.title = design ? `Customer price: Cubit's cost${markup()?` + ${markup()}% markup`:' (no markup set: Tools → Markup)'}${c.missing?`; ${c.missing} lines have no price yet`:''}. Tap to hide.` : `Cubit's cost to build, no markup${c.missing?`; ${c.missing} lines have no price yet`:''}. Tap to hide.`;
}
onMode(()=>showPrice());
window.addEventListener('cubit:markup', showPrice);
/* one toolbar along the top of the canvas: undo / redo, 2D, floors and the footprint move up beside Layers and Full
   screen (the view cube stays on its own, bottom right) */
setTimeout(()=>{ const bar=document.querySelector('#stage .fs-bar'), h=document.querySelector('.vcube-wrap .vc-hist');
  if(bar && h){ const sp=document.createElement('span'); sp.className='bar-sp'; bar.append(sp, h, sqft); } else document.querySelector('.vcube-wrap')?.appendChild(sqft);
  showSqft(); }, 0);
import('./scene3d.js').then(m=>m.onBuilt(showSqft));
const btn2D=document.createElement('button'); btn2D.className='vc-b vc-2d'; btn2D.id='vc2D'; btn2D.textContent='2D'; btn2D.setAttribute('aria-pressed','false'); btn2D.title='Flat top view (true 2D) for placing cabinets';
btn2D.onclick=()=>set2D(!TWO_D);
document.querySelector('.vcube-wrap .vc-hist')?.appendChild(btn2D);
// a face of the view cube other than Top (or Bottom) leaves 2D first, so the view can turn
document.querySelector('.vcube-wrap .vcube')?.addEventListener('click', e=>{ const f=e.target.closest('[data-v]'); if(TWO_D && f && f.dataset.v!=='top') set2D(false);
  if(!TWO_D && f && f.dataset.v==='top' && isDesign()) setTimeout(()=>{ if(isFlat()) set2D(true); }, 700); }, true);

const flatBadge=document.createElement('div'); flatBadge.className='flat-badge'; stage.appendChild(flatBadge);
/* the hint: shown for a few seconds when the view changes, each one once a session, then it fades away */
let badgeT=0;
const seenHints=(()=>{ try{ return new Set(JSON.parse(sessionStorage.getItem('cubit-hints')||'[]')); }catch(e){ return new Set(); } })();
function badge(){ const f=isFlat();
  const t = TWO_D ? (isDesign() ? 'PLAN · drag a pod or cabinet to move it · drag up on empty space for 3D · two fingers slide' : '2D · drag a pod or cabinet to move it · drag empty space to slide the plan · tap 3D to tilt')
    : f ? 'PLAN · drag a pod or cabinet to move it · drag up on empty space to tilt into 3D' : `3D · double-tap a part to isolate it · drag down for the plan`;
  if(t===flatBadge.dataset.t) return; flatBadge.dataset.t=t;
  flatBadge.textContent=t; flatBadge.classList.toggle('three', !f);
  clearTimeout(badgeT);
  if(seenHints.has(t)){ flatBadge.classList.add('gone'); return; }
  seenHints.add(t); try{ sessionStorage.setItem('cubit-hints', JSON.stringify([...seenHints])); }catch(e){}
  flatBadge.classList.remove('gone'); badgeT=setTimeout(()=>flatBadge.classList.add('gone'), 4500); }
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
  (H_.pods||[]).forEach(p=>{ const f=new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.d), white); f.rotation.x=-Math.PI/2; f.position.set(p.x+p.w/2, (p.y||0)+0.03, p.z+p.d/2); f.renderOrder=1; f.userData.plan=true; homeGroup.add(f); BP.objs.push(f); });
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
/* where it can go. A deck that hasn't been turned by hand tries all four ways round, so it turns itself to put its
   ledger against the pod it's dropped beside (a deck facing the wrong way has nowhere to dock on that side). */
function spots(d){
  if(!d.spots){ const skip=d.mode==='move'?d.i:-1;
    d.spots = d.deck ? (d.turned ? [d.rot] : [d.rot, ...[0,90,180,270].filter(r=>r!==d.rot)]).flatMap(r=>deckSpots(d.lib, r, skip).map(s=>({ ...s, rot:r })))
                     : dockSpots(d.item, d.rot, skip); }
  return d.spots; }
function track(d, x, y){
  const at=planAt(x,y); if(!at) return;
  const f=footOf(d);
  let gx, gz;
  if(d.mode==='move'){ gx=d.grab.x0+(at.x-d.grab.x); gz=d.grab.z0+(at.z-d.grab.z); } else { gx=at.x-f.w/2; gz=at.z-f.d/2; }
  // nearest by centre (a deck turned the other way round has a different footprint)
  const cx=gx+f.w/2, cz=gz+f.d/2;
  let best=null, bd=1e9; spots(d).forEach(s=>{ const g=s.rot!=null && s.rot!==d.rot ? footOf({ ...d, rot:s.rot }) : f, q=Math.hypot(s.x+g.w/2-cx, s.z+g.d/2-cz) + (s.rot!=null && s.rot!==d.rot ? 2 : 0); if(q<bd){ bd=q; best=s; } });
  d.ok = !!best && bd<=12;
  if(d.ok && best.rot!=null && best.rot!==d.rot){ d.rot=best.rot; }
  const F=footOf(d);
  d.at = d.ok ? {x:best.x, z:best.z} : {x:Math.round((cx-F.w/2)/8)*8, z:Math.round((cz-F.d/2)/8)*8};
  showGhost({...F, x:d.at.x, z:d.at.z}, d.ok);
}
/* why a deck won't go: the home's own problem when nothing fits anywhere, else where it does fit */
function deckWhy(d){
  const m=MODELS[state.model];
  if(!spots(d).length){ const why=problem(m.pods, m.decks||[]); return why ? `No spot for a deck: ${why}` : 'No spot for this deck: every side of the home is taken.'; }
  return 'Drop it beside a pod or another deck: it turns itself so its ledger sits flush, in 8′ steps.';
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
  if(d.mode==='new'){ d.rot=((d.rot||0)+(dir>0?90:270))%360; d.turned=true; d.spots=null; if(d.lastXY) track(d, ...d.lastXY); return; }
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
    else if(isDesign()) orbit={x:e.clientX, y:e.clientY, from2D:true, x0:e.clientX, y0:e.clientY};   // Design: a drag up tips the drawing into 3D
    // a long touch (held still): on a pod, deck or cabinet it picks it up to move it (in 3D too);
    // on empty space it opens the Layers list
    { const x=e.clientX, y=e.clientY;
      press={x, y, timer:setTimeout(()=>{ if(!press || pointers.size!==1) return; press=null;
        if(!hitAt(x,y) && !furnAt(x,y)){ orbit=null; try{ navigator.vibrate?.(10); }catch(err){} openLayers(true, {x, y}); return; }
        const d=editable() ? grabAt(x,y) : null; if(!d) return;
        orbit=null; controls.enabled=false; D=d; D.started=true; D.lastXY=[x,y]; D.long=true; D.sx0=x; D.sy0=y; document.body.classList.add('dragging');
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
  if(orbit.from2D){
    const ux=e.clientX-orbit.x0, uy=e.clientY-orbit.y0;
    if(!TWO_D){ orbit.from2D=false; }
    else if(uy<-14 && Math.abs(uy)>Math.abs(ux)){ set2D(false, true); orbit.from2D=false; orbit.x=e.clientX; orbit.y=e.clientY; return; }
    else return; }
  const dx=e.clientX-orbit.x, dy=e.clientY-orbit.y; orbit.x=e.clientX; orbit.y=e.clientY;
  document.body.classList.add('orbiting');   // the tray tucks away while the home turns
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
  if(!pointers.size){ orbit=null; viewTwist=null; document.body.classList.remove('orbiting'); if(three){ three=null; controls.enabled=true; }
    setTimeout(()=>{ if(isDesign() && !TWO_D && !D && !pointers.size && state.view==='studio' && isFlat()) set2D(true); }, 60); }
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
    if(d.long && d.lastXY && Math.hypot(d.lastXY[0]-d.sx0, d.lastXY[1]-d.sy0)<10){ endGroupDrag(d, false); refreshItem(furnById(d.id)); pickAt(d.sx0, d.sy0); return; }   // held still: pick it
    if(d.twist || !d.started || !d.at){ endGroupDrag(d, false); return; }
    if(d.group){ setMany([[d.id, d.at], ...(d.moves||[])]); [d.id, ...d.group.map(g=>g.id)].forEach(id=>refreshItem(furnById(id))); }
    else { updateItem(d.id, d.at); refreshItem(furnById(d.id)); }
    state.selFurn=d.id; applyFurniture(); renderSide(); return; }
  if(!D || D.mode!=='move') { if(!pointers.size) controls.enabled=true; return; }
  if(pointers.size) return;                                             // wait for the last finger
  const d=D; D=null; hideGhost(); document.body.classList.remove('dragging'); controls.enabled=true;
  if(d.twist || !d.started) return;                                     // a twist, or a tap (the tap picks it, in scene3d)
  if(d.long && d.lastXY && Math.hypot(d.lastXY[0]-d.sx0, d.lastXY[1]-d.sy0)<10){ pickAt(d.sx0, d.sy0); return; }   // a long press held still: pick it (quick bar)
  if(!d.ok){ toast(d.deck ? deckWhy(d) : 'Pods dock flush end to end or side by side in 8′ steps, sharing at least 8′ of wall.'); return; }
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
/* Accessories: rooms along the top (with Recent and Favourites), a search box, and the items of the room (or the
   search) in a row with their 3D pictures. Tap an item to drop it into the room on screen; drag it to put it exactly. */
const ROOMS=[
  ['recent','Recent','M8 4v4l3 2M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Z'],
  ['fav','Favourites','M8 1.5l2 4.3 4.6.5-3.5 3.1 1 4.6L8 11.6 3.9 14l1-4.6L1.4 6.3 6 5.8Z'],
  ['kitchen','Kitchen','M2 6h12v8H2zM2 6V3h12v3M5 9h2M9 9h2'],
  ['bath','Bath','M1.5 8h13v2a4 4 0 0 1-4 4h-5a4 4 0 0 1-4-4ZM3 8V3.5a1.5 1.5 0 0 1 3 0'],
  ['bed','Bedroom','M1.5 13V5M1.5 10h13v3M14.5 10V8a2 2 0 0 0-2-2H7v4M3 8h3'],
  ['living','Living','M2 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2M1.5 8h13v4h-13zM3 12v2M13 12v2'],
  ['laundry','Laundry','M3 1.5h10v13H3zM3 4.5h10M8 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z'],
  ['heat','Heating','M8 14.5c-3 0-4.5-2-4.5-4.5C3.5 7 6.5 5.5 6.5 2c2 1.5 6 4 6 8 0 2.5-1.5 4.5-4.5 4.5Z'],
  ['util','Utility','M9 1.5 3.5 9H8l-1 5.5L12.5 7H8Z'],
];
const isLaundry = d => d.cat==='appliance' && /wash|dry/i.test(d.name);
const isBed = d => d.cat==='furniture' && /bed|night|dresser/i.test(d.name);
const ROOM_OF = {
  kitchen: d => ['base','upper','tall','counter','sink'].includes(d.cat) || (d.cat==='appliance' && !isLaundry(d)),
  bath:    d => ['vanity','bath','linen'].includes(d.cat) || (d.cat==='sink' && /bath|vanity|lav/i.test(d.name)),
  bed:     d => ['wardrobe','bench'].includes(d.cat) || isBed(d),
  living:  d => ['tv','shelf','fire','bench'].includes(d.cat) || (d.cat==='furniture' && !isBed(d)),
  laundry: d => isLaundry(d) || d.cat==='linen',
  heat:    d => ['fire','baseboard','heat'].includes(d.cat),
  util:    d => ['plumb','elec'].includes(d.cat),
};
let trayRoom=(()=>{ try{ return localStorage.getItem('cubit-tray-room')||'kitchen'; }catch(e){ return 'kitchen'; } })(), trayQ='', trayHidden=false;
const LS = (k, v) => { try{ if(v===undefined) return JSON.parse(localStorage.getItem(k)||'[]'); localStorage.setItem(k, JSON.stringify(v)); }catch(e){ return []; } };
const recentKs = () => LS('cubit-recent'), favKs = () => LS('cubit-fav');
function noteRecent(k){ const r=recentKs().filter(x=>x!==k); r.unshift(k); LS('cubit-recent', r.slice(0,12)); }
function toggleFav(k){ const f=favKs(); const i=f.indexOf(k); if(i>=0) f.splice(i,1); else f.unshift(k); LS('cubit-fav', f); return i<0; }
const liveItems = () => ITEMS.filter(d=>!d.deleted && !d.legacy);
function trayItems(){
  const all=liveItems(), q=trayQ.trim().toLowerCase();
  if(q){ const words=q.split(/\s+/); return all.filter(d=>{ const t=`${d.name} ${d.k} ${CATS.find(c=>c.k===d.cat)?.name||''}`.toLowerCase(); return words.every(w=>t.includes(w)); }); }
  if(trayRoom==='recent'){ const byK=new Map(all.map(d=>[d.k,d])); return recentKs().map(k=>byK.get(k)).filter(Boolean); }
  if(trayRoom==='fav'){ const byK=new Map(all.map(d=>[d.k,d])); return favKs().map(k=>byK.get(k)).filter(Boolean); }
  const f=ROOM_OF[trayRoom]; if(!f) return [];
  const order=CATS.map(c=>c.k); return all.filter(f).sort((a,b)=>order.indexOf(a.cat)-order.indexOf(b.cat));
}
const escA = t => String(t).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
function itemTile(d){
  const it=newItem(d.k), fav=favKs().includes(d.k), sub=d.name.includes(' · ')?d.name.split(' · ')[1]:`${Math.round(it.w*8)/8}″ wide`;
  return `<button class="tray-it cab" data-k="${d.k}" title="${escA(d.name)} · tap to add, drag to place"><span class="tray-cab" data-pic="${d.k}">${frontSVG(it,{pad:1})}</span><b>${escA(d.name.replace(/ · .*/,''))}</b><small>${escA(sub)}</small><span class="tray-fav" role="button" tabindex="0" data-fav="${d.k}" aria-label="${fav?'Remove from':'Add to'} favourites" aria-pressed="${fav}">${fav?'★':'☆'}</span></button>`;
}
function kitTiles(){
  return KITCHENS.map(K=>{ const u=kitchenPicture('kit:'+K.id+':'+(K.rev||0), K.items); return `<button class="tray-it cab kit" data-kit="${K.id}" title="${escA(K.name)} · drag it into a pod">${u?`<span class="tray-cab tray-kit"><img src="${u}" alt=""></span>`:''}<b>${escA(K.name)}</b><small>${K.items.length} items</small></button>`; }).join('');
}
function renderTrayItems(){
  const row=tray.querySelector('.tray-items'); if(!row) return;
  const L=trayItems(), kit = !trayQ && trayRoom==='kitchen' ? kitTiles() : '';
  const empty = trayQ ? `<span class="tray-none">Nothing called “${escA(trayQ)}”. Try another word, or open the Library.</span>` : trayRoom==='recent' ? '<span class="tray-none">What you add shows here.</span>' : trayRoom==='fav' ? '<span class="tray-none">Tap ☆ on any item to keep it here.</span>' : '';
  row.innerHTML = kit + (L.length ? L.map(itemTile).join('') : (kit?'':empty)) + `<button class="tray-it more" data-open="lib"><b>Library…</b><small>sizes, 3D, parts</small></button>`;
  row.scrollLeft=0; queuePics();
}
/* the 3D pictures, drawn a few at a time so the tray never stalls */
let picQ=[], picT=0;
function queuePics(){ picQ=[...tray.querySelectorAll('[data-pic]')]; cancelAnimationFrame(picT); const step=()=>{ const t0=performance.now();
  while(picQ.length && performance.now()-t0<12){ const el=picQ.shift(); if(!el.isConnected) continue; const k=el.dataset.pic;
    try{ const it={...newItem(k), rx:0, rz:0, ra:0}, u=kitchenPicture('it:'+k+':'+it.w+'x'+it.h+'x'+it.d, [it]); if(u) el.innerHTML=`<img src="${u}" alt="">`; }catch(e){} }
  if(picQ.length) picT=requestAnimationFrame(step); }; picT=requestAnimationFrame(step); }
function renderTray(){
  tray.classList.toggle('acc', trayTab==='cab'); tray.classList.toggle('tucked', trayHidden);
  const tabs=`<div class="tray-tabs" role="tablist"><button role="tab" data-tab="pods" aria-selected="${trayTab==='pods'}">Cubits</button><button role="tab" data-tab="cab" aria-selected="${trayTab==='cab'}">Accessories</button></div>`;
  const tuck=`<button class="tray-tuck" data-tuck="1" aria-label="${trayHidden?'Show the tray':'Hide the tray'}" title="${trayHidden?'Show the tray':'Hide the tray'}">${trayHidden?'▴ Tray':'▾'}</button>`;
  if(trayHidden){ tray.innerHTML=tuck; return; }
  if(trayTab==='cab'){
    tray.innerHTML = tuck + tabs + `<div class="tray-acc">
      <div class="tray-top"><label class="tray-q"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m11 11 3.5 3.5" stroke="currentColor" stroke-width="1.6"/></svg><input type="search" id="trayQ" placeholder="Search: fridge, 36 vanity…" aria-label="Search accessories" value="${escA(trayQ)}" autocomplete="off"></label>
        <div class="tray-rooms" role="tablist" aria-label="Rooms">${ROOMS.map(([k,l,d])=>`<button role="tab" data-room="${k}" aria-selected="${!trayQ && trayRoom===k}"><svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"/></svg><span>${l}</span></button>`).join('')}</div></div>
      <div class="tray-items"></div></div>`;
    renderTrayItems(); return;
  }
  // just the three pod sizes: every wall, floor, ceiling and roof can be changed once it's placed
  const dk=DECKLIB.filter(d=>!d.deleted);
  tray.innerHTML = tuck + tabs + `
    ${[['P8',8],['P16',16],['L24',24]].map(([t,len])=>`<button class="tray-it" data-t="${t}">${podMini(len)}<b>8′ × ${len}′</b><small>pod</small></button>`).join('')}
    <button class="tray-it mid" data-mid="1" title="Drag into a pod: a wall across it (or along it, dropped near a long side)"><svg viewBox="0 0 22 12" aria-hidden="true"><rect x="1" y="1" width="20" height="10" fill="none" stroke="#8a8f94" stroke-width=".8"/><rect x="9.6" y="1" width="2" height="10" fill="#6b5530"/></svg><b>Interior wall</b><small>splits a pod</small></button>
    ${dk.map(L=>`<button class="tray-it deck" data-deck="${L.id}"><svg viewBox="0 0 22 12" aria-hidden="true"><rect x="1" y="1" width="20" height="10" fill="#d9c49b" stroke="#6b5530" stroke-width=".6"/><line x1="1" y1="1" x2="21" y2="1" stroke="#3b2a12" stroke-width="1.4"/></svg><b>${deckName(L)}</b><small>deck</small></button>`).join('')}
    <button class="tray-it stair" data-stair="1" title="Drag onto a pod that has a floor above (or below): a legal stair, with the opening cut"><svg viewBox="0 0 22 12" aria-hidden="true"><path d="M1 11h4V8.5h4V6h4V3.5h4V1h4" fill="none" stroke="#3b2a12" stroke-width="1.2"/></svg><b>Stairs</b><small>to the floor above</small></button>`;
}
tray.addEventListener('input', e=>{ if(e.target.id==='trayQ'){ trayQ=e.target.value; tray.querySelectorAll('[data-room]').forEach(b=>b.setAttribute('aria-selected', String(!trayQ && b.dataset.room===trayRoom))); renderTrayItems(); } });
/* a cabinet or piece of furniture tapped in the tray: into the room on screen, against its nearest free wall */
function dropItemHere(k){
  const it={...newItem(k), a:0}, r=cv.getBoundingClientRect(), mid=planAt(r.left+r.width*0.45, r.top+r.height*0.5);
  let at = mid ? snap(it, mid, wallGroups, homeGroup) : null;
  if(at && (at.free || furnitureOf(state.model).some(o=>clash({...it, ...at, id:'_new'}, o)))) at=null;
  if(!at) at=freeSpot(it, homeGroup);
  if(!at){ toast('No free wall for it here. Drag it to where it goes.'); return; }
  const { overBase, ...pos }=at, f=addItem(k, pos); noteRecent(k); state.selFurn=f.id; state.selected=null; refreshItem(f); highlight(); renderSide(); if(!panelOpen()) setPanel(true);
  toast(`${itemDef(f.k).name} added · drag it to move it`);
}
/* stairs dropped on a pod (tap: the first pod that can take one) */
function stairAt(i){
  if(!podList(state.model).some(p=>p.lv)){ toast('Stairs go up to a second floor. Put pods on Floor 2 first (▲ beside Floor).'); return; }
  const id=addStair(i); if(!id){ toast(i==null?'No room for a stair yet: it needs about 12′ clear along a pod, under the pod above.':'No room for a stair in that pod. Try one with a pod right above or below it.'); return; }
  state.selected='stair:'+id; renderModels(); buildHome(); highlight(); renderSide(); if(!panelOpen()) setPanel(true); toast('Stairs added · pick another option or slide them');
}
tray.addEventListener('pointerdown', e=>{
  if(e.target.closest('[data-fav],[data-tuck],input')) return;
  const b=e.target.closest('.tray-it'); if(!b || !editable() || b.dataset.open) return;
  const sx=e.clientX, sy=e.clientY, id=e.pointerId;
  if(b.dataset.mid){ dragMid(e, b); return; }
  if(b.dataset.stair){ dragStair(e); return; }
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
      const { overBase, ...at }=d.at, f=addItem(d.it.k, at); noteRecent(d.it.k); state.selFurn=f.id; state.selected=null; refreshItem(f); highlight(); renderSide(); if(!panelOpen()) setPanel(true); toast(`${itemDef(f.k).name} added${overBase?` · ${f.w}″ wide, to match the base under it`:''}`); return; }
    if(!d.ok){ toast(d.deck ? deckWhy(d) : 'Drop it next to the home, where it docks flush in 8′ steps.'); return; }
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
/* Stairs from the tray: dropped on a pod, a stair in it (or up into it from the pod below) */
function dragStair(e){
  const sx=e.clientX, sy=e.clientY, id=e.pointerId; let moved=false;
  const mv=ev=>{ if(ev.pointerId!==id) return; if(!moved && Math.hypot(ev.clientX-sx, ev.clientY-sy)>14){ moved=true; document.body.classList.add('dragging'); controls.enabled=false; } };
  const up=ev=>{ if(ev.pointerId!==id) return; window.removeEventListener('pointermove',mv); window.removeEventListener('pointerup',up); window.removeEventListener('pointercancel',up);
    document.body.classList.remove('dragging'); controls.enabled=true; if(!moved) return;
    trayDragAt=performance.now();
    const o=ownerOf(hitAt(ev.clientX, ev.clientY)); if(!o || o.deck){ toast('Drop the stairs on a pod'); return; }
    stairAt(o.i); };
  window.addEventListener('pointermove',mv); window.addEventListener('pointerup',up); window.addEventListener('pointercancel',up);
}
tray.addEventListener('change', e=>{ if(e.target.id==='trayCat'){ trayCat=e.target.value; renderTray(); tray.scrollLeft=0; } });
/* a tap on a tray item: add it at the first spot it fits (cabinets: against the wall nearest the middle of the first pod) */
let trayDragAt=0;
onKitchensChanged(()=>{ if(trayTab==='cab' && trayCat==='__kit') renderTray(); });
tray.addEventListener('click', e=>{
  if(performance.now()-trayDragAt < 800) return;
  const tb=e.target.closest('[data-tab]'); if(tb){ trayTab=tb.dataset.tab; renderTray(); return; }
  if(e.target.closest('[data-tuck]')){ trayHidden=!trayHidden; renderTray(); return; }
  const rm=e.target.closest('[data-room]'); if(rm){ trayRoom=rm.dataset.room; trayQ=''; try{ localStorage.setItem('cubit-tray-room', trayRoom); }catch(err){} renderTray(); return; }
  const fv=e.target.closest('[data-fav]'); if(fv){ const on=toggleFav(fv.dataset.fav); fv.textContent=on?'★':'☆'; fv.setAttribute('aria-pressed', on); if(trayRoom==='fav' && !trayQ) renderTrayItems(); return; }
    const b=e.target.closest('.tray-it'); if(!b) return;
  if(b.dataset.open){ const first=trayItems()[0]; openCaseLib({cat: !trayQ && trayRoom==='kitchen' && KITCHENS.length ? 'k:kit' : (first?.cat || trayCat)}); return; }
  if(!editable()) return;
  if(b.dataset.stair){ stairAt(null); return; }
  if(b.dataset.k){ dropItemHere(b.dataset.k); return; }
  if(b.dataset.kit){ const K=kitchenById(b.dataset.kit); if(K) import('./viewer3d.js').then(m=>m.openViewer('kitchen', null, { name:K.name, items:K.items, sub:`saved kitchen · ${K.items.length} items · drag it from the tray into a pod to add it` })); return; }
  if(b.dataset.deck){ const s=deckSpots(b.dataset.deck,0)[0]; if(!s){ toast('No place for this deck yet.'); return; } after(addDeck(b.dataset.deck, s.x, s.z, 0), 'Deck added'); return; }
  const item = b.dataset.lib ? {lib:b.dataset.lib} : {t:b.dataset.t};
  const s=dockSpots(item, 0)[0]; if(!s){ toast('No place for this pod yet.'); return; } after(addPod(item, s.x, s.z, 0), 'Pod added');
});

/* ---------------------------------------------------------------- start: the flat plan */
initViewCube({ reset:()=>{ if(state.focusPod!=null) document.querySelector('.pod-badge')?.click(); flatten(true); }, after:()=>{ renderModels(); buildHome(); renderSide(); }, toast });
function startBuild(){ controls.enableRotate=false;   /* one-finger turning is ours (above); OrbitControls keeps pan and zoom */
  renderTray(); setTimeout(()=>{ flatten(true); badge(); elecSig=elecSigNow(); }, 60); }
/* Design ⇄ Shop: Design shows the plan as the drawing; the labels and side panel follow the mode */
onMode(m=>{ oneFinger(); buildHome(); highlight(); renderSide(); renderTray(); if(state.view==='studio'){ if(m==='design' && isFlat()) set2D(true); if(TWO_D) drawPlan(); } badge(); });
/* a bed, desk, fridge … brings its plugs with it (electrical.js): when placing, moving, turning or removing one
   changes the plugs, the walls are redrawn so they show at once */
let elecSig=null, elecT=0;
const elecSigNow = () => { try{ return JSON.stringify([state.model, planFor().boxes.map(b=>[b.W.s.id, b.face, Math.round(b.a*4), b.y, b.rk])]); }catch(e){ return ''; } };
onFurnChanged(()=>{ clearTimeout(elecT); elecT=setTimeout(function again(){
  if(D){ elecT=setTimeout(again, 250); return; }                 // not mid-drag
  const s=elecSigNow(); if(s===elecSig) return;
  elecSig=s; buildHome(); highlight(); }, 150); });
window.addEventListener('cubit:home', ()=>{ elecSig=elecSigNow(); });

/* ---------------------------------------------------------------- the quick bar
   A small bar beside whatever is picked: a cabinet or piece of furniture (Turn, Mirror, Duplicate, Delete), a deck
   (Turn, Duplicate, Delete) or a wall / floor (its pod: Turn, Mirror, Flip, Duplicate, ＋ Wall across, Delete). The side
   panel is for the details. Delete asks twice. Keys do the same (R turn, D duplicate, Delete), and a right-click or a
   long press held still picks a thing and brings the bar up. */
const qb=document.createElement('div'); qb.className='quickbar'; qb.hidden=true; qb.setAttribute('role','toolbar'); qb.setAttribute('aria-label','Quick actions'); stage.appendChild(qb);
const QI={ turn:'M12 4a8 8 0 1 1-7.4 5M4 4v5h5', mir:'M12 3v18M8 7 3 12l5 5M16 7l5 5-5 5', flip:'M3 12h18M7 8l5-5 5 5M7 16l5 5 5-5', dup:'M8 8h11v11H8zM5 16V5h11', del:'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13', wall:'M12 3v18M4 3h16v18H4z', more:'M5 12h.01M12 12h.01M19 12h.01' };
const qBtn=(k, label, icon, cls='')=>`<button class="qb-b ${cls}" data-q="${k}" title="${label}" aria-label="${label}"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="${QI[icon]}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>${label}</span></button>`;
function selection(){
  if(state.selFurn && furnById(state.selFurn)) return { kind:'furn', id:state.selFurn };
  const s=String(state.selected||''); if(!s) return null;
  if(/^deck:\d+$/.test(s)) return { kind:'deck', k:+s.slice(5), id:s };
  if(s.startsWith('stair:')) return null;
  const pi=parseInt(s,10); if(Number.isFinite(pi) && MODELS[state.model]?.pods?.[pi]) return { kind:'pod', pi, id:s };
  return null;
}
let qbFor='', qbSure=null;
function renderQB(sel){
  qbFor=sel ? sel.kind+':'+sel.id : ''; qbSure=null;
  if(!sel || !editable()){ qb.hidden=true; return; }
  if(sel.kind==='furn') qb.innerHTML=qBtn('turn','Turn','turn')+qBtn('mir','Mirror','mir')+qBtn('dup','Duplicate','dup')+qBtn('del','Delete','del','danger');
  else if(sel.kind==='deck') qb.innerHTML=qBtn('turn','Turn','turn')+qBtn('dup','Duplicate','dup')+qBtn('del','Delete','del','danger');
  else qb.innerHTML=`<span class="qb-l">${(MODELS[state.model].pods[sel.pi] && `Pod ${sel.pi+1}`)}</span>`+qBtn('turn','Turn','turn')+qBtn('mir','Mirror','mir')+qBtn('flip','Flip','flip')+qBtn('dup','Duplicate','dup')+qBtn('wall','Wall across','wall')+qBtn('wallL','Wall along','wall')+qBtn('del','Delete','del','danger');
  qb.hidden=false;
}
function selBox(sel){
  const B=new THREE.Box3();
  if(sel.kind==='furn') furnMeshes().forEach(m=>{ if(m.userData.furn===sel.id && shown(m)) B.expandByObject(m); });
  else pickables.forEach(m=>{ if(m.userData.slotId===sel.id && shown(m)) B.expandByObject(m); });
  return B.isEmpty() ? null : B;
}
const v3=new THREE.Vector3();
function anchorPx(sel){ const B=selBox(sel); if(!B) return null; B.getCenter(v3); v3.y=B.max.y; v3.project(camera); const r=cv.getBoundingClientRect(); return { x:r.left+(v3.x+1)/2*r.width, y:r.top+(1-v3.y)/2*r.height, r }; }
function placeQB(){
  requestAnimationFrame(placeQB);
  const sel=selection(), key=sel ? sel.kind+':'+sel.id : '';
  if(key!==qbFor){ renderQB(sel); if(sel) keepInView(sel); }
  if(qb.hidden) return;
  const hide=document.body.classList.contains('dragging') || document.body.classList.contains('orbiting') || state.view!=='studio';
  qb.classList.toggle('off', hide); if(hide) return;
  const a=anchorPx(sel); if(!a){ qb.classList.add('off'); return; }
  const sr=stage.getBoundingClientRect(), panelW=document.getElementById('studio').classList.contains('panel-open') && !document.documentElement.classList.contains('phone') ? 404 : 0;
  const w=qb.offsetWidth, h=qb.offsetHeight;
  let x=a.x-sr.left-w/2, y=a.y-sr.top-h-14;
  x=Math.max(8, Math.min(sr.width-panelW-w-8, x)); y=Math.max(62, Math.min(sr.height-h-190, y));
  qb.style.transform=`translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}
requestAnimationFrame(placeQB);
/* the side panel opens over the right of the canvas: slide the view so what was picked sits in the free part */
function keepInView(sel){
  setTimeout(()=>{ if(!document.getElementById('studio').classList.contains('panel-open') || document.documentElement.classList.contains('phone')) return;
    const a=anchorPx(sel); if(!a) return; const edge=a.r.right-404-40; if(a.x<=edge) return;
    const dx=a.x-(a.r.left+(a.r.width-404)/2), dist=camera.position.distanceTo(controls.target), wpp=2*dist*Math.tan(camera.fov*Math.PI/360)/a.r.height;
    const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize().multiplyScalar(dx*wpp);
    const p0=camera.position.clone(), t0=controls.target.clone(), T=performance.now(); cancelAnimationFrame(anim); controls.enableDamping=false;
    const step=()=>{ const k=Math.min(1,(performance.now()-T)/260), e=k*k*(3-2*k); camera.position.copy(p0).addScaledVector(right, e); controls.target.copy(t0).addScaledVector(right, e); controls.update();
      if(k<1) anim=requestAnimationFrame(step); else controls.enableDamping=true; }; step(); }, 260);
}
function qAct(q){
  const sel=selection(); if(!sel || !editable()) return;
  if(q==='del' && qbSure!==qbFor){ qbSure=qbFor; const b=qb.querySelector('[data-q="del"] span'); if(b) b.textContent='Tap again'; toast(sel.kind==='pod'?'Tap Delete again to remove the pod, with what is in it':'Tap Delete again to remove it'); return; }
  if(sel.kind==='furn'){ const it=furnById(sel.id);
    if(q==='turn'){ turnItem(sel.id, 1); refreshItem(furnById(sel.id)); renderSide(); toast('Turned 90°'); }
    else if(q==='mir'){ updateItem(sel.id, { mirror:!it.mirror }); refreshItem(furnById(sel.id)); renderSide(); toast(it.mirror?'Back the usual way':'Mirrored'); }
    else if(q==='dup'){ const c=duplicateItem(sel.id); if(c){ state.selFurn=c.id; refreshItem(c); applyFurniture(); renderSide(); toast('Duplicated · drag it where it goes'); } }
    else if(q==='del'){ removeItem(sel.id); refreshItem({id:sel.id}); state.selFurn=null; renderSide(); highlight(); toast('Removed · undo brings it back'); }
    return; }
  if(sel.kind==='deck'){ const m=MODELS[state.model], q0=m.decks[sel.k];
    if(q==='turn'){ const why=turnDeck(sel.k); if(why){ toast(why); return; } state.selected='deck:'+sel.k; renderModels(); buildHome(); renderSide(); }
    else if(q==='dup'){ const sp=[0,90,180,270].flatMap(r=>deckSpots(q0.lib, r).map(x=>({...x, rot:r})))[0]; if(!sp){ toast('No place for another deck like it'); return; } after(addDeck(q0.lib, sp.x, sp.z, sp.rot), 'Deck added'); }
    else if(q==='del'){ const why=removeDeck(sel.k); if(why){ toast(why); return; } state.selected=null; renderModels(); buildHome(); renderSide(); toast('Deck removed · undo brings it back'); }
    return; }
  const pi=sel.pi, go=(why,msg)=>{ if(why){ toast(why); return; } state.selected=null; renderModels(); buildHome(); renderSide(); toast(msg); };
  if(q==='turn') go(rotatePod(pi), 'Pod turned 90°');
  else if(q==='mir') go(mirrorPod(pi,'x'), 'Pod mirrored end for end');
  else if(q==='flip') go(mirrorPod(pi,'z'), 'Pod flipped front to back');
  else if(q==='dup'){ const raw=MODELS[state.model].pods[pi], item={t:raw.t, ...(raw.lv?{lv:raw.lv}:{})}, sp=dockSpots(item, raw.rot||0)[0]; if(!sp){ toast('No place for another pod like it'); return; } after(addPod(item, sp.x, sp.z, raw.rot||0), 'Pod duplicated · drag it where it goes'); }
  else if(q==='wall' || q==='wallL'){ const id=addPart(pi, q==='wall'?'cross':'long'); if(!id) return; state.selected=id; renderModels(); buildHome(); highlight(); renderSide(); toast('Interior wall added · slide it, snap it flush, or tap a door option'); }
  else if(q==='del') go(deletePod(pi), 'Pod removed · undo brings it back');
}
qb.addEventListener('click', e=>{ const b=e.target.closest('[data-q]'); if(b) qAct(b.dataset.q); });
qb.addEventListener('pointerdown', e=>e.stopPropagation());
document.addEventListener('keydown', e=>{
  if(state.view!=='studio' || e.metaKey || e.ctrlKey || e.altKey || e.target.closest('input,textarea,select,[contenteditable]') || document.querySelector('dialog[open]')) return;
  const k=e.key.toLowerCase();
  if(k==='r'){ if(selection()){ e.preventDefault(); qAct('turn'); } }
  else if(k==='d'){ if(selection()){ e.preventDefault(); qAct('dup'); } }
  else if(k==='delete' || k==='backspace'){ if(selection()){ e.preventDefault(); qAct('del'); } }
});
/* right-click (mouse) on a thing: pick it, the quick bar comes up */
function pickAt(x, y){
  const fh=furnAt(x,y), ph=hitAt(x,y), glass = ph && /:(ceiling-int|roof)$/.test(ph.object.userData.slotId||'');
  if(fh && (!ph || glass || fh.distance<=ph.distance+0.05)){ state.selFurn=fh.object.userData.furn; state.selected=null; }
  else if(ph?.object?.userData?.slotId){ state.selected=ph.object.userData.slotId; state.selFurn=null; }
  else return false;
  highlight(); renderSide(); return true;
}
cv.addEventListener('contextmenu', e=>{ e.preventDefault(); pickAt(e.clientX, e.clientY); });

/* ---------------------------------------------------------------- a warmer 3D for showing (Design, 3D only)
   Sky, a grass ground under the home and soft shadows from the sun. The drawings and the Shop view don't change. */
const LOOK={ on:false, bg:null, grid:true, ground:null, sky:null };
function skyTex(){ if(LOOK.sky) return LOOK.sky; const c=document.createElement('canvas'); c.width=2; c.height=256; const g=c.getContext('2d'), gr=g.createLinearGradient(0,0,0,256);
  gr.addColorStop(0,'#a9c8e6'); gr.addColorStop(0.6,'#e8f0f4'); gr.addColorStop(1,'#f3efe6'); g.fillStyle=gr; g.fillRect(0,0,2,256); LOOK.sky=new THREE.CanvasTexture(c); return LOOK.sky; }
function applyLook(){
  const want = isDesign() && !TWO_D && state.view==='studio';
  if(want){
    if(!LOOK.on){ LOOK.bg=scene.background; LOOK.grid=grid.visible; }
    scene.background=skyTex(); grid.visible=false;
    if(!LOOK.ground){ LOOK.ground=new THREE.Mesh(new THREE.CircleGeometry(400, 48), new THREE.MeshLambertMaterial({ color:0x7d8c68 })); LOOK.ground.rotation.x=-Math.PI/2; LOOK.ground.receiveShadow=true; LOOK.ground.userData.look=true; }
    const B=homeBox(); LOOK.ground.position.set(B?(B.min.x+B.max.x)/2:0, (B?B.min.y:0)-0.05, B?(B.min.z+B.max.z)/2:0);
    if(LOOK.ground.parent!==scene) scene.add(LOOK.ground);
    renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    if(SUN){ SUN.castShadow=true; SUN.shadow.mapSize.set(2048,2048); const r=B?Math.max(20, B.getSize(new THREE.Vector3()).length()):40, c=SUN.shadow.camera; c.left=c.bottom=-r; c.right=c.top=r; c.near=0.5; c.far=r*6; SUN.shadow.bias=-0.0008; c.updateProjectionMatrix(); }
    homeGroup.traverse(o=>{ if(o.isMesh && !o.userData.plan){ o.castShadow=true; o.receiveShadow=true; } });
    LOOK.on=true;
  } else if(LOOK.on){
    if(scene.background===LOOK.sky) scene.background=LOOK.bg; grid.visible=LOOK.grid; LOOK.ground?.parent?.remove(LOOK.ground);
    renderer.shadowMap.enabled=false; if(SUN) SUN.castShadow=false; LOOK.on=false;
  }
}
onBuilt(()=>setTimeout(applyLook, 0)); onMode(()=>setTimeout(applyLook, 0));
setInterval(()=>{ const want=isDesign() && !TWO_D && state.view==='studio'; if(want!==LOOK.on) applyLook(); }, 400);

/* ---------------------------------------------------------------- Present
   One tap: full screen, roof on, nothing to edit on screen, the home slowly turning. Outside / Inside / Plan / a
   picture, and Exit puts everything back as it was. A touch stops the turning so you can turn it yourself. */
const pres={ on:false, keep:null };
const pbar=document.createElement('div'); pbar.className='present-bar'; pbar.hidden=true;
pbar.innerHTML=`<button data-p="out">Outside</button><button data-p="in">Inside</button><button data-p="plan">Plan</button><button data-p="snap" aria-label="Take a picture">📷 Picture</button><button data-p="x" class="px">Exit</button>`;
stage.appendChild(pbar);
function flyView(az, el, fill=1.25){
  const B=homeBox(); if(!B) return; const c=B.getCenter(new THREE.Vector3()), r=B.getSize(new THREE.Vector3()).length()/2;
  const a=az*Math.PI/180, e=el*Math.PI/180, d=r*fill/Math.sin(camera.fov*Math.PI/360)*0.75;
  const end=new THREE.Vector3(c.x+d*Math.cos(e)*Math.sin(a), c.y+d*Math.sin(e), c.z+d*Math.cos(e)*Math.cos(a));
  const p0=camera.position.clone(), t0=controls.target.clone(), T=performance.now(); cancelAnimationFrame(anim); controls.enableDamping=false;
  const step=()=>{ const k=Math.min(1,(performance.now()-T)/600), q=k*k*(3-2*k); camera.position.lerpVectors(p0,end,q); controls.target.lerpVectors(t0,c,q); controls.update(); if(k<1) anim=requestAnimationFrame(step); else controls.enableDamping=true; }; step();
}
/* the roof and ceiling are see-through while building; shown to a customer they're solid */
const solidKeep=new Map();
function solidRoof(on){
  if(on) homeGroup.traverse(o=>{ if(o.isMesh && /:(roof|ceiling-int)$/.test(o.userData.slotId||'') && o.material && !Array.isArray(o.material) && o.material.transparent && !solidKeep.has(o)){ solidKeep.set(o, o.material); const m=o.material.clone(); m.transparent=false; m.opacity=1; m.depthWrite=true; o.material=m; } });
  else { solidKeep.forEach((m,o)=>{ o.material?.dispose?.(); o.material=m; }); solidKeep.clear(); }
}
function presentShow(roof){ state.show.roof=roof; state.show.ceiling=roof; solidRoof(false); import('./scene3d.js').then(m=>{ m.applyLayers(); if(roof) solidRoof(true); }); }
function presentView(v){
  pbar.querySelectorAll('[data-p]').forEach(b=>b.setAttribute('aria-pressed', String(b.dataset.p===v)));
  if(v==='plan'){ controls.autoRotate=false; presentShow(false); set2D(true); flatten(true); return; }
  if(TWO_D) set2D(false);
  if(v==='out'){ presentShow(true); flyView(-35, 16); controls.autoRotateSpeed=0.6; }
  else { presentShow(false); flyView(-25, 55, 0.95); controls.autoRotateSpeed=0.4; }
  setTimeout(()=>{ if(pres.on) controls.autoRotate=true; }, 650);
}
function present(on){
  if(on===pres.on) return; pres.on=on;
  const studio=document.getElementById('studio');
  if(on){
    pres.keep={ show:{...state.show}, two:TWO_D, fs:studio.classList.contains('fs'), panel:panelOpen(), sel:state.selected, furn:state.selFurn, hidden:trayHidden };
    state.selected=null; state.selFurn=null; highlight(); renderSide(); setPanel(false);
    if(!pres.keep.fs) enterFullscreen();
    document.body.classList.add('presenting'); pbar.hidden=false;
    presentView('out');
  } else {
    controls.autoRotate=false; document.body.classList.remove('presenting'); pbar.hidden=true; solidRoof(false);
    const k=pres.keep||{}; Object.assign(state.show, k.show||{}); import('./scene3d.js').then(m=>m.applyLayers());
    if(!k.fs) exitFullscreen();
    if(k.two) set2D(true); else flatten(true);
    state.selected=k.sel||null; state.selFurn=k.furn||null; highlight(); renderSide(); if(k.panel) setPanel(true);
  }
}
pbar.addEventListener('click', e=>{ const b=e.target.closest('[data-p]'); if(!b) return; const v=b.dataset.p;
  if(v==='x') present(false); else if(v==='snap') snapshot(); else presentView(v); });
stage.addEventListener('pointerdown', e=>{ if(pres.on && e.target===cv) controls.autoRotate=false; }, true);
document.addEventListener('keydown', e=>{ if(pres.on && e.key==='Escape'){ e.preventDefault(); present(false); } }, true);
/* the Present and Picture buttons, in the toolbar beside Layers */
setTimeout(()=>{ const bar=document.querySelector('#stage .fs-bar'), full=document.getElementById('bFull'); if(!bar) return;
  const pb=document.createElement('button'); pb.className='fsbtn present-b'; pb.innerHTML='<span aria-hidden="true">▶</span> Present'; pb.title='Show the home to the customer: full screen, roof on, turning slowly'; pb.onclick=()=>present(true);
  const sb=document.createElement('button'); sb.className='fsbtn snap-b'; sb.innerHTML='<span aria-hidden="true">📷</span>'; sb.title='Take a picture of what is on screen'; sb.setAttribute('aria-label','Take a picture'); sb.onclick=()=>snapshot();
  (full||bar.firstChild)?.after(pb, sb); }, 0);

/* ---------------------------------------------------------------- a picture of what's on screen
   Saved to the customer's file (when the home is theirs, on the team's server), or downloaded / shared. */
async function snapshot(){
  const qbOff=qb.hidden; qb.hidden=true; renderer.render(scene, camera);
  let url=''; try{ url=cv.toDataURL('image/jpeg', 0.9); }catch(e){} qb.hidden=qbOff;
  if(!url || url.length<1000){ toast('No picture: the 3D view could not be read'); return; }
  // straight to a smaller copy (about 1600 px across), with the home's name in the corner
  const im=new Image(); await new Promise(r=>{ im.onload=r; im.src=url; });
  const k=Math.min(1, 1600/im.width), c=document.createElement('canvas'); c.width=Math.round(im.width*k); c.height=Math.round(im.height*k);
  const g=c.getContext('2d'); g.drawImage(im,0,0,c.width,c.height); g.font='600 22px system-ui, sans-serif'; g.fillStyle='rgba(255,255,255,.85)'; const label=(MODELS[state.model]?.name||'')+' · Cubit'; const tw=g.measureText(label).width; g.fillRect(14, c.height-48, tw+20, 34); g.fillStyle='#1d211c'; g.fillText(label, 24, c.height-24);
  const pic=c.toDataURL('image/jpeg', 0.86);
  const m=MODELS[state.model], cid=m?.customer;
  const { customersOnline, savePhoto, customerById } = await import('./customers.js');
  const name=`${(m?.name||'home').replace(/[\\/:*?"<>|]/g,'-')} ${new Date().toISOString().slice(0,16).replace(/[:T]/g,'-')}.jpg`;
  let d=document.getElementById('snapDlg'); if(!d){ d=document.createElement('dialog'); d.id='snapDlg'; d.className='lib-dlg snap-dlg'; document.body.appendChild(d); }
  d.innerHTML=`<div class="dlg"><div class="dlg-h"><h2>Picture</h2><button class="btn ghost" data-sx="1">Close</button></div><img class="snap-img" src="${pic}" alt="Picture of the home">
    <div class="row">${cid && customersOnline() ? `<button class="btn" data-ss="1">Save to ${customerById(cid)?.name?.replace(/</g,'&lt;')||'the customer'}'s file</button>` : ''}<button class="btn ghost" data-sd="1">Save / share the image</button></div>
    ${cid ? '' : '<p class="note">Link this home to a customer (Save to Customer) to keep pictures in their file.</p>'}</div>`;
  d.querySelector('[data-sx]').onclick=()=>d.close();
  d.querySelector('[data-ss]')?.addEventListener('click', async e=>{ e.target.disabled=true; try{ await savePhoto(cid, m.project, pic); toast('Saved to the customer’s file'); d.close(); }catch(err){ toast('Not saved: '+(err.message||err)); e.target.disabled=false; } });
  d.querySelector('[data-sd]').onclick=async()=>{ const blob=await (await fetch(pic)).blob(), file=new File([blob], name, { type:'image/jpeg' });
    if(navigator.canShare?.({ files:[file] })){ try{ await navigator.share({ files:[file], title:m?.name||'Cubit home' }); return; }catch(err){ if(err?.name==='AbortError') return; } }
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1500); };
  d.showModal();
}
export { setLevel, startBuild, flatten, isFlat, renderTray, set2D, is2D };
