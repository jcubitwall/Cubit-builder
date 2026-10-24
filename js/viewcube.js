/* Cubit Builder — viewcube.js : the Shapr3D navigation extras for Build.
     · Orientation cube (top right): it turns with the view. Tap a face for that view (Top, Front, Back, Left,
       Right, Bottom); double-tap the cube to reset to the whole home, flat.
     · Undo / Redo buttons beside it (three-finger swipe left / right does the same, see build.js).
     · flyTo / zoomToFace: double-tap a part to look straight at that face, close up. */
import { camera, controls, renderer } from './scene3d.js';
import { undo, redo, canUndo, canRedo } from './history.js';

const stage=document.getElementById('stage');
const S=1;   // world units per… (the cube only shows direction)
let anim=0;
/* animate the camera to a position and target */
function flyTo(pos, tgt, ms=380){
  const p0=camera.position.clone(), t0=controls.target.clone(), T=performance.now();
  cancelAnimationFrame(anim); controls.enableDamping=false;
  const step=()=>{ const k=Math.min(1,(performance.now()-T)/ms), e=k*k*(3-2*k);
    camera.position.lerpVectors(p0,pos,e); controls.target.lerpVectors(t0,tgt,e); controls.update();
    if(k<1) anim=requestAnimationFrame(step); else controls.enableDamping=true; };
  step();
}
/* look along a direction (unit vector from the target to the camera), keeping the distance */
function viewFrom(dir){
  const t=controls.target.clone(), d=camera.position.distanceTo(t);
  const v=dir.clone().normalize();
  if(Math.abs(v.y)<0.5) t.y=4;   // side views: aim at mid wall height
  if(Math.abs(v.y)>0.999){ const o=camera.position.clone().sub(t); o.y=0; if(o.lengthSq()<1e-12) o.set(0,0,1); o.normalize(); v.addScaledVector(o, 0.0005); v.normalize(); }   // straight up / down: keep the heading
  flyTo(t.clone().add(v.multiplyScalar(d)), t);
}
/* double-tap a part: look straight at the face that was tapped, close enough to fill the view with that part */
function zoomToFace(hit){
  const n=hit.face?.normal?.clone(); if(!n) return false;
  n.transformDirection(hit.object.matrixWorld);
  if(n.dot(camera.position.clone().sub(hit.point))<0) n.negate();       // the side facing us
  const box=new THREE.Box3().setFromObject(hit.object), size=box.getSize(new THREE.Vector3());
  const span=Math.max(2, Math.min(40, Math.max(size.x,size.y,size.z)));
  const dist=span/2/Math.tan(camera.fov*Math.PI/360)*1.25;
  if(Math.abs(n.y)>0.999){ const o=camera.position.clone().sub(controls.target); o.y=0; if(o.lengthSq()<1e-12) o.set(0,0,1); o.normalize(); n.addScaledVector(o,0.0005); n.normalize(); }   // keep the heading
  flyTo(hit.point.clone().add(n.multiplyScalar(dist)), hit.point.clone());
  return true;
}

/* ---------------------------------------------------------------- the cube */
const wrap=document.createElement('div'); wrap.className='vcube-wrap build-only';
wrap.innerHTML=`<div class="vcube" aria-label="View cube: tap a face for that view, double-tap to reset" role="group">
  <div class="vc-cube">${[['top','Top'],['bottom','Bottom'],['front','Front'],['back','Back'],['right','Right'],['left','Left']].map(([k,l])=>`<button class="vc-f vc-${k}" data-v="${k}" aria-label="${l} view">${l}</button>`).join('')}</div></div>
  <div class="vc-hist"><button class="vc-b" id="vcUndo" aria-label="Undo" title="Undo (three-finger swipe left)">↶</button><button class="vc-b" id="vcRedo" aria-label="Redo" title="Redo (three-finger swipe right)">↷</button></div>`;
stage.appendChild(wrap);
const cube=wrap.querySelector('.vc-cube');
// Front = the home's front (south) side, -z; Back +z; Right +x; Left -x
const DIRS={ top:[0,1,0], bottom:[0,-1,0], front:[0,0,-1], back:[0,0,1], right:[1,0,0], left:[-1,0,0] };
let resetFn=()=>{}, lastTap=0;
wrap.querySelector('.vcube').addEventListener('click', e=>{
  const now=performance.now();
  if(now-lastTap<380){ lastTap=0; resetFn(); return; }          // double-tap the cube: reset
  lastTap=now;
  const f=e.target.closest('[data-v]'); if(!f) return;
  const v=f.dataset.v; setTimeout(()=>{ if(lastTap!==now) return; viewFrom(new THREE.Vector3(...DIRS[v])); }, 240);
});
wrap.querySelector('#vcUndo').onclick=()=>doUndo();
wrap.querySelector('#vcRedo').onclick=()=>doRedo();
let afterHist=()=>{}, say=()=>{};
function doUndo(){ if(undo()){ afterHist(); say('Undone'); } else say('Nothing to undo'); refreshHist(); }
function doRedo(){ if(redo()){ afterHist(); say('Redone'); } else say('Nothing to redo'); refreshHist(); }
function refreshHist(){ wrap.querySelector('#vcUndo').disabled=!canUndo(); wrap.querySelector('#vcRedo').disabled=!canRedo(); }
setInterval(refreshHist, 500);
document.addEventListener('keydown', e=>{
  if(!(e.metaKey||e.ctrlKey) || e.key.toLowerCase()!=='z' || e.target.closest('input,textarea,select') || document.querySelector('dialog[open]')) return;
  e.preventDefault(); e.shiftKey ? doRedo() : doUndo();
});
/* turn the cube with the view: the camera's rotation, flipped into CSS (y down) */
const m4=new THREE.Matrix4();
function tick(){
  requestAnimationFrame(tick);
  if(!wrap.offsetParent) return;
  m4.extractRotation(camera.matrixWorldInverse);
  const e=m4.elements.slice(), s=[1,-1,1];
  for(let c=0;c<3;c++) for(let r=0;r<3;r++) e[c*4+r]*=s[r]*s[c];
  cube.style.transform=`translateZ(-40px) matrix3d(${e.map(v=>Math.abs(v)<1e-10?0:+v.toFixed(6)).join(',')})`;
}
tick();
function initViewCube({ reset, after, toast }){ resetFn=reset; afterHist=after; say=toast; refreshHist(); }
export { initViewCube, flyTo, viewFrom, zoomToFace, doUndo, doRedo };
