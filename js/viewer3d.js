/* Cubit Builder — viewer3d.js : a full-screen 3D look at anything in the Library (tap its row).
   ⛶ Full screen hides the header too (F; Exit full screen to come back).
   Homes, pods, walls, floors / ceilings / roofs, decks, cabinets / appliances / fixtures and windows / doors, each in its own window with its own camera:
     · Exploded view: homes and pods come apart the way they do in Build (pods, then walls, floors and roofs);
       a wall's panels pull apart; a floor or deck spreads out from its middle.
     · The side cube (top right) turns with the view. Tap a face and the view flies to that side and LOCKS there,
       flat (no perspective), so it reads like a drawing: pinch / scroll to zoom and drag to slide, but it won't
       turn. Tap 🔓 3D (or double-tap the cube) to turn freely again.
   A home or pod is built by Build's own code (so it matches the home exactly), copied, and Build is put back. */
import { MODELS, LIB, LAYERLIB, PODLIB, DECKLIB, podById } from './data.js';
import { state } from './state.js';
import { buildWallMesh, buildLayerMesh, buildDeckMesh, buildHome, explodeAt, themeColors, DECK_MAT, LAYER_COLOR } from './scene3d.js';
import * as S3 from './scene3d.js';
import { buildUnit } from './scene3d.js';
import { itemModel } from './casework3d.js';
import { kitchenModel } from './kitchen3d.js';
import { newItem, itemDef } from './casework.js';
import { UNITLIB, TYPES } from './units.js';
import { deviceById, deviceSVG } from './devices.js';

const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const DIRS={ top:[0,1,0], bottom:[0,-1,0], front:[0,0,-1], back:[0,0,1], right:[1,0,0], left:[-1,0,0] };
const NAMES={ top:'Top', bottom:'Bottom', front:'Front', back:'Back', right:'Right', left:'Left' };

const HINT='drag to turn · pinch to zoom · two fingers to slide · spread three fingers to explode · tap a side of the cube to lock to it';
/* labels on or off (wall letters; panel numbers and the other numbered circles), remembered in this browser */
const LKEY='cubit-viewer-labels';
let labs={ letters:true, nums:true }; try{ Object.assign(labs, JSON.parse(localStorage.getItem(LKEY)||'{}')); }catch(e){}
let dlg=null, R=null, scene=null, persp=null, ortho=null, cam=null, ctl=null, content=null, raf=0;
let explode=0, goal=0, parts=[], lock=null, span=20, centre=new THREE.Vector3();

function ensure(){
  if(dlg) return;
  dlg=document.createElement('dialog'); dlg.className='cw-dlg v3-dlg'; dlg.id='v3Dlg'; dlg.setAttribute('aria-labelledby','v3T');
  dlg.innerHTML=`<header class="cw-h"><h2 id="v3T">3D</h2><span class="note" id="v3Sub"></span><span class="spacer"></span>
      <span class="seg v3-labs" role="group" aria-label="Labels"><button id="v3Let" aria-pressed="true">Letters</button><button id="v3Num" aria-pressed="true">Numbers</button></span>
      <button class="btn ghost" id="v3Ex" aria-pressed="false">Exploded view</button>
      <button class="btn ghost" id="v3Full" title="Full screen: only the 3D, nothing else (F)">⛶ Full screen</button>
      <button class="btn ghost cw-x" aria-label="Close">✕</button></header>
    <div class="v3-stage" id="v3Stage">
      <div class="v3-cube"><div class="vcube" role="group" aria-label="Side cube: tap a side to lock the view to it, double-tap to turn freely">
        <div class="vc-cube">${Object.keys(NAMES).map(k=>`<button class="vc-f vc-${k}" data-v="${k}" aria-label="${NAMES[k]} side">${NAMES[k]}</button>`).join('')}</div></div>
        <button class="btn ghost sm v3-lock" id="v3Lock" hidden></button></div>
      <p class="v3-hint" id="v3Hint">${HINT}</p>
      <button class="btn v3-exitfs" id="v3ExitFs" aria-label="Leave full screen">✕ Exit full screen</button>
    </div>`;
  document.body.appendChild(dlg);
  R=new THREE.WebGLRenderer({antialias:true}); R.setPixelRatio(Math.min(2, devicePixelRatio||1));
  dlg.querySelector('#v3Stage').prepend(R.domElement);
  scene=new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8577, 0.75));
  const sun=new THREE.DirectionalLight(0xffffff,0.7); sun.position.set(30,50,20); scene.add(sun);
  const back=new THREE.DirectionalLight(0xffffff,0.3); back.position.set(-25,20,-30); scene.add(back);
  persp=new THREE.PerspectiveCamera(38,1,0.1,800); ortho=new THREE.OrthographicCamera(-1,1,1,-1,-500,1500);
  cam=persp; ctl=new THREE.OrbitControls(cam, R.domElement); ctl.enableDamping=true;
  dlg.querySelector('.cw-x').onclick=()=>dlg.close();
  dlg.addEventListener('close', stop);
  dlg.addEventListener('cancel', e=>{ if(lock){ e.preventDefault(); unlock(); } });   // Esc: unlock first, then close
  dlg.querySelector('#v3Ex').onclick=()=>setGoal(goal>0.5 ? 0 : 1);
  const labBtn=(id,k)=>{ const b=dlg.querySelector(id); b.onclick=()=>{ labs[k]=!labs[k]; try{ localStorage.setItem(LKEY, JSON.stringify(labs)); }catch(e){} applyLabels(); }; };
  labBtn('#v3Let','letters'); labBtn('#v3Num','nums');
  // iPad: spread three fingers to pull it apart (the wider, the further), pinch three fingers to put it back
  const stg=dlg.querySelector('#v3Stage'); let g3=null;
  const spr=t=>{ const n=t.length; let cx=0,cy=0; for(const p of t){ cx+=p.clientX; cy+=p.clientY; } cx/=n; cy/=n; let d=0; for(const p of t) d+=Math.hypot(p.clientX-cx,p.clientY-cy); return d/n; };
  stg.addEventListener('touchstart', e=>{ if(e.touches.length===3){ g3={d0:spr(e.touches), e0:goal}; ctl.enabled=false; e.preventDefault(); } }, {passive:false});
  stg.addEventListener('touchmove', e=>{ if(!g3 || e.touches.length!==3) return; e.preventDefault();
    const r=spr(e.touches)/Math.max(1,g3.d0); setGoal(Math.max(0, Math.min(1, g3.e0 + (r-1)*1.6))); }, {passive:false});
  const end3=e=>{ if(g3 && (!e.touches || e.touches.length<3)){ g3=null; ctl.enabled=true; } };
  stg.addEventListener('touchend', end3); stg.addEventListener('touchcancel', end3);
  dlg.querySelector('#v3Lock').onclick=()=>unlock();
  let last=0;
  dlg.querySelector('.vcube').addEventListener('click', e=>{
    const now=performance.now(); if(now-last<380){ last=0; unlock(true); return; } last=now;
    const f=e.target.closest('[data-v]'); if(!f) return; const v=f.dataset.v;
    setTimeout(()=>{ if(last===now) lockTo(v); }, 240); });
  new ResizeObserver(size).observe(dlg.querySelector('#v3Stage'));
  // full screen: the header goes, the 3D takes the whole display (the browser's own full screen on a computer)
  dlg.querySelector('#v3Full').onclick=()=>setFull(true);
  dlg.querySelector('#v3ExitFs').onclick=()=>setFull(false);
  dlg.addEventListener('keydown', e=>{ if(e.key==='f' || e.key==='F'){ if(e.target.closest('input,textarea')) return; setFull(!dlg.classList.contains('v3-full')); } });
  dlg.addEventListener('close', ()=>setFull(false));
  document.addEventListener('fullscreenchange', ()=>{ if(!document.fullscreenElement && dlg.classList.contains('v3-full') && fsAsked) setFull(false); });
}
let fsAsked=false;
const touchFirst = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
function setFull(on){
  if(!dlg) return;
  dlg.classList.toggle('v3-full', on);
  if(on && !touchFirst && dlg.requestFullscreen && !document.fullscreenElement){ fsAsked=true; dlg.requestFullscreen().catch(()=>{ fsAsked=false; }); }
  if(!on && fsAsked){ fsAsked=false; if(document.fullscreenElement) document.exitFullscreen().catch(()=>{}); }
  requestAnimationFrame(size);
}

function setGoal(v){ goal=v; dlg.querySelector('#v3Ex').setAttribute('aria-pressed', goal>0.5); }
function applyLabels(){
  dlg.querySelector('#v3Let').setAttribute('aria-pressed', labs.letters); dlg.querySelector('#v3Num').setAttribute('aria-pressed', labs.nums);
  let any=false;
  content?.traverse(o=>{ if(!o.isSprite || o.userData.north) return; any=true; o.visible = o.userData.letter ? labs.letters : labs.nums; });
  dlg.querySelector('.v3-labs').hidden=!any;
}
/* ---------- what's shown */
function clear(){ if(content){ scene.remove(content); content=null; } parts=[]; }
function frame(){   // centre the content and fit the camera round it
  const box=new THREE.Box3().setFromObject(content); box.getCenter(centre);
  const sz=box.getSize(new THREE.Vector3()); span=Math.max(4, sz.x, sz.y, sz.z);
  ctl.target.copy(centre);
  const r=sz.length()/2, dist=r/Math.sin(persp.fov*Math.PI/360)/Math.min(1, Math.max(0.6, persp.aspect))*1.05;   // the whole thing in view
  persp.position.copy(centre).add(new THREE.Vector3(0.9,0.62,-1.15).normalize().multiplyScalar(dist)); span=Math.max(span, r);
  persp.near=span/400; persp.far=span*40; persp.updateProjectionMatrix();
}
/* exploded positions: each part keeps where it sits (p0) and where it goes (p1) */
function spread(objs, f){ objs.forEach(o=>{ const p0=o.position.clone(); parts.push({o, p0, p1:p0.clone().add(f(o))}); }); }
function centreOf(o){ return new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()); }
function radial(group, k){ const c=centreOf(group); spread(group.children, o=>{ const d=centreOf(o).sub(c); d.y=Math.max(0,d.y); return d.multiplyScalar(k); }); }

function showWall(w){
  const mat=new THREE.MeshStandardMaterial({color:0xc9a46a, roughness:0.85});
  const b=buildWallMesh(w, mat, {nums:true, numSize:1.3, numZ:0.4});
  content=new THREE.Group(); content.add(b.group);
  const gap=0.8; spread(b.group.children.filter(c=>c.userData.k!==undefined), c=>new THREE.Vector3(c.userData.k*gap,0,0));
}
function showLayer(L){
  const mat=new THREE.MeshStandardMaterial({color:LAYER_COLOR[L.kind]||0xb9b2a0, roughness:0.85, side:THREE.DoubleSide});
  const g=buildLayerMesh(L, mat); content=new THREE.Group(); content.add(g); radial(g, 0.35);
}
/* a cabinet, appliance or fixture: the Library's own model (inches), its parts come apart along their explode lines */
function showCase(it){
  const M=itemModel(it, { edges:true, tenons:true }), g=M.group, k=Math.max(it.w,it.h,it.d)*0.34;
  g.scale.setScalar(1/12); g.position.set(-it.w/24, 0, -it.d/24);
  content=new THREE.Group(); content.add(g);
  spread(g.children, c=>{ const [a,b,e]=c.userData.ex||[0,0,0]; return new THREE.Vector3(a*k, b*k, e*k); });
}
/* a window or door, standing in a rough opening just bigger than it */
/* a kitchen or a group of cabinets: each cabinet where the group puts it; exploded, they step apart from the middle */
function showKitchen(items){ const g=kitchenModel(items); content=new THREE.Group(); content.add(g); radial(g.children[0], 0.5); }
function showUnit(u){
  const o={ x:0, y:0, w:u.w+0.25, h:u.h+0.25, kind:TYPES[u.type]?.cat||'window' };
  const g=buildUnit(o, { unit:u, hand:u.hand||'L', swing:u.swing||'in' }, Math.max(0.4,(u.d||4.5)/12+0.05), u.place==='int');
  content=new THREE.Group(); content.add(g);
}
/* a switch / plug / data device: its cover plate (2¾ × 4½″, one gang) with the front view on it */
function showDevice(d){
  const g=new THREE.Group(), W=2.75/12, H=4.5/12, T=0.25/12;
  const back=new THREE.Mesh(new THREE.BoxGeometry(W*1.0, H*1.0, T), new THREE.MeshStandardMaterial({ color:0xf1efe8, roughness:0.5 })); g.add(back);
  const img=new Image(), cv=document.createElement('canvas'); cv.width=256; cv.height=256; const tex=new THREE.CanvasTexture(cv);
  img.onload=()=>{ const x=cv.getContext('2d'); x.fillStyle='#f1efe8'; x.fillRect(0,0,256,256); x.drawImage(img, 14*4, 4*4, 36*4, 56*4, 0, 0, 256, 256); tex.needsUpdate=true; };   // just the plate of the front view
  img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(deviceSVG(d, 256).replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" '));
  const face=new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map:tex, transparent:false }));
  face.position.z=T/2+0.0005; g.add(face);
  const box=new THREE.Mesh(new THREE.BoxGeometry(2/12, 3/12, 2.5/12), new THREE.MeshStandardMaterial({ color:0x4a6fa5, roughness:0.7, transparent:true, opacity:0.35 })); box.position.z=-1.25/12-T/2; g.add(box);
  g.rotation.y=Math.PI;   // its face toward the camera
  content=new THREE.Group(); content.add(g); spread([box], ()=>new THREE.Vector3(0,0,0.25));
}
function showDeck(D){ const g=buildDeckMesh(D, DECK_MAT); content=new THREE.Group(); content.add(g); radial(g, 0.6); }
/* a home (or one pod on its own): built by Build, copied with its exploded positions, then Build is put back */
function showHome(modelKey){
  const keep={ model:state.model, focusPod:state.focusPod, selected:state.selected, iso:state.isolate, letters:state.letters, nums:state.nums };
  try{
    state.model=modelKey; state.focusPod=null; state.selected=null; state.letters=true; state.nums=true; if('isolate' in state) state.isolate=null;
    buildHome(); explodeAt(0);
    const src=S3.homeGroup, at0=[]; src.traverse(o=>at0.push(o.position.clone()));
    explodeAt(1); const at1=[]; src.traverse(o=>at1.push(o.position.clone()));
    explodeAt(0);
    const copy=src.clone(true); let i=0;
    copy.traverse(o=>{ const a=at0[i], b=at1[i]; i++; if(a && b && a.distanceToSquared(b)>1e-8) parts.push({o, p0:a.clone(), p1:b.clone()}); });
    content=new THREE.Group(); content.add(copy);
  } finally {
    state.model=keep.model; state.focusPod=keep.focusPod; state.selected=keep.selected; state.letters=keep.letters; state.nums=keep.nums; if('isolate' in state) state.isolate=keep.iso;
    buildHome();
  }
}
function showPod(p){
  const key='__view_pod__';
  MODELS[key]={ name:p.name, pods:[{ t:p.t, x:0, z:0, rot:0, src:p.id, walls:JSON.parse(JSON.stringify(p.walls||{})), layers:JSON.parse(JSON.stringify(p.layers||{})), ...(p.a?{a:p.a}:{}) }], decks:[] };
  try{ showHome(key); } finally { delete MODELS[key]; }
}

/* ---------- the side cube: lock to a side (flat), or turn freely */
function setCam(c){ const t=ctl.target.clone(); ctl.dispose(); cam=c; ctl=new THREE.OrbitControls(cam, R.domElement); ctl.enableDamping=true; ctl.target.copy(t); size(); }
function lockTo(v){
  const d=new THREE.Vector3(...DIRS[v]), t=ctl.target.clone();
  if(Math.abs(d.y)>0.5) ortho.up.set(0,0,d.y>0?-1:1); else ortho.up.set(0,1,0);   // top view: front at the bottom
  ortho.position.copy(t).add(d.clone().multiplyScalar(span*3));
  ortho.zoom=1; ortho.userData.h=span*0.75;
  setCam(ortho); ortho.lookAt(t); ctl.target.copy(t);
  ctl.enableRotate=false; ctl.screenSpacePanning=true; ctl.update();
  lock=v; const b=dlg.querySelector('#v3Lock'); b.hidden=false; b.textContent=`🔒 ${NAMES[v]} · 🔓 3D`;
  dlg.querySelector('#v3Hint').textContent=`locked to the ${NAMES[v].toLowerCase()} · pinch to zoom · drag to slide · tap 🔓 3D to turn`;
}
function unlock(reset){
  if(lock){ const d=ortho.position.clone().sub(ctl.target).normalize(), t=ctl.target.clone();
    if(Math.abs(d.y)>0.999) d.add(new THREE.Vector3(0,0,-0.02)).normalize();
    persp.up.set(0,1,0); persp.position.copy(t).add(d.multiplyScalar(span*1.45)); setCam(persp); persp.lookAt(t); }
  lock=null; ctl.enableRotate=true; dlg.querySelector('#v3Lock').hidden=true;
  dlg.querySelector('#v3Hint').textContent=HINT;
  if(reset){ frame(); }
  ctl.update();
}
function size(){
  if(!R) return; const host=dlg.querySelector('#v3Stage'), w=host.clientWidth||1, h=host.clientHeight||1;
  R.setSize(w,h,false); persp.aspect=w/h; persp.updateProjectionMatrix();
  const hh=ortho.userData.h||10; ortho.left=-hh*w/h; ortho.right=hh*w/h; ortho.top=hh; ortho.bottom=-hh; ortho.updateProjectionMatrix();
}
const m4=new THREE.Matrix4();
function tick(){
  raf=requestAnimationFrame(tick);
  if(Math.abs(explode-goal)>0.001){ explode += (goal-explode)*0.12; if(Math.abs(explode-goal)<0.002) explode=goal; parts.forEach(p=>p.o.position.lerpVectors(p.p0,p.p1,explode)); }
  ctl.update(); R.render(scene, cam);
  m4.extractRotation(cam.matrixWorldInverse); const e=m4.elements.slice(), s=[1,-1,1];
  for(let c=0;c<3;c++) for(let r=0;r<3;r++) e[c*4+r]*=s[r]*s[c];
  dlg.querySelector('.vc-cube').style.transform=`translateZ(-40px) matrix3d(${e.map(v=>Math.abs(v)<1e-10?0:+v.toFixed(6)).join(',')})`;
}
function stop(){ cancelAnimationFrame(raf); raf=0; clear(); }

/* ---------- open: kind is the Library tab ('models','families','pods','walls','layers','decks') */
const LAYER_NAME = {'floor-ext':'Exterior floor','floor-int':'Interior floor','ceiling-int':'Interior ceiling','roof':'Roof'};
function openViewer(kind, id, opts={}){
  ensure(); clear(); if(lock) unlock(); explode=0; setGoal(0);
  let title='', sub='';
  try{
    if(kind==='models'){ const m=MODELS[id]; if(!m) return; title=m.name; sub=`home · ${m.size||''}`; showHome(id); }
    else if(kind==='families'){ const key=opts.modelKey; if(!key||!MODELS[key]) return; title=MODELS[key].name; sub='home'; showHome(key); }
    else if(kind==='pods'){ const p=podById(id); if(!p) return; title=p.name; sub=`${p.len}′ pod`; showPod(p); }
    else if(kind==='walls'){ const w=LIB.find(x=>x.id===id); if(!w) return; title=w.name; sub=`${w.id} · ${w.len}′ ${w.type==='int'?'interior':'exterior'} wall`; showWall(w); }
    else if(kind==='layers'){ const L=LAYERLIB.find(x=>x.id===id); if(!L) return; title=L.name; sub=`${L.id} · ${LAYER_NAME[L.kind]||L.kind} · ${L.len}′`; showLayer(L); }
    else if(kind==='casework'){ const d=itemDef(id); if(!d) return; const it=newItem(id); title=d.name; sub=`${id} · ${it.w} × ${it.h} × ${it.d}″`; showCase(it); }
    else if(kind==='units'){ const u=UNITLIB.find(x=>x.id===id); if(!u) return; title=u.name; sub=`${u.id} · ${TYPES[u.type]?.label||u.type}${u.place==='int'?' · interior':''} · ${u.w} × ${u.h}″`; showUnit(u); }
    else if(kind==='devices'){ const d=deviceById(id); if(!d) return; title=d.name; sub=`${d.id} · ${d.kind==='sw'?'switch':d.kind==='rc'?'plug (receptacle)':'data / TV'} · with its box behind`; showDevice(d); }
    else if(kind==='kitchen'){ if(!opts.items?.length) return; title=opts.name||'Kitchen'; sub=opts.sub||`${opts.items.length} items`; showKitchen(opts.items); }
    else if(kind==='decks'){ const D=DECKLIB.find(x=>x.id===id); if(!D) return; title=D.name; sub=`${D.id} · ${D.w}′ × ${D.d}′ deck`; showDeck(D); }
  }catch(e){ console.error(e); }
  if(!content){ return; }
  scene.add(content); scene.background=new THREE.Color(themeColors().bg);
  dlg.querySelector('#v3T').textContent=title||'3D'; dlg.querySelector('#v3Sub').textContent=sub;
  dlg.querySelector('#v3Ex').hidden=!parts.length; applyLabels();
  if(!dlg.open) dlg.showModal();
  size(); frame(); ctl.update();
  if(!raf) tick();
}
export { openViewer };
